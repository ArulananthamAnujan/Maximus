import { useEffect, useMemo, useRef, useState } from 'react';
import { X, Sparkles, Loader2, CheckCircle2, AlertTriangle, Circle, Square, Download, FileText, Video, HelpCircle, Trophy, BookOpen, Code2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { generateLessonMaterials, runWithLimit, hasOwnNotes } from '../../lib/courseContent';
import type { ContentSection, LessonJob } from '../../lib/courseContent';
import { createWeekQuiz, createCapstoneDraft } from '../../lib/courseBuild';
import { callLectureApi } from '../../lib/lectureApi';
import { weekLessons, weekLecture, isReadingLesson, lessonState } from '../../lib/workspace';
import type { Workspace } from '../../lib/workspace';
import LecturePresenterPicker from '../ai/LecturePresenterPicker';
import {
  startServerBuild, stopServerBuild, loadLatestBuild, groupProgress, BuildServiceUnavailable, buildCounts, buildMinutesLeft,
} from '../../lib/courseBuildJob';
import type { BuildJob, BuildTask } from '../../lib/courseBuildJob';
import { checkBuildSetup, aiCannot, aiIsOld, buildServiceLacks } from '../../lib/setupCheck';
import type { BuildSetup } from '../../lib/setupCheck';

interface Problem { label: string; message: string }

/** Plain-language versions of messages that keep coming back. */
function explain(message: string): string {
  if (/AI service on (your|the) server is out of date|Unknown or unsupported task/i.test(message)) {
    return "Your server's AI service is an older version that cannot do this yet. Deploy the latest ai-generate function, then build again.";
  }
  return message;
}

/** The same problem for many items is listed once, with the items it affected. */
function groupProblems(problems: Problem[]): Array<{ message: string; labels: string[] }> {
  const groups = new Map<string, string[]>();
  for (const p of problems) {
    const key = explain(p.message);
    groups.set(key, [...(groups.get(key) ?? []), p.label]);
  }
  return Array.from(groups, ([message, labels]) => ({ message, labels }));
}

export type BuildFocus = 'materials' | 'lectures' | 'quizzes' | 'guides' | 'boards';

interface Props {
  ws: Workspace;
  /** Opened from one readiness item: preselect only that. */
  only?: BuildFocus;
  /** Show the latest build's results even if it has finished. */
  showLatest?: boolean;
  /** Start with "write every lecture again" switched on. */
  rewriteLectures?: boolean;
  onClose: () => void;
  /** Something was saved; reload the course. */
  onChanged: () => void;
  onDownloadCourse: () => void;
}

type StepKey = 'materials' | 'lectures' | 'boards' | 'quizzes' | 'capstone' | 'guides';
type StepState = { total: number; done: number; failed: number; current: string; status: 'waiting' | 'running' | 'done' | 'skipped' | 'stopped' };

// Lessons written at the same time (each is two AI requests: notes, then slides).
const PARALLEL_LESSONS = 3;
// Out of tokens, video service not set up, or not allowed: every remaining item would fail too.
const STOP_ALL = /not enough tokens|insufficient tokens|out of credit|not set up|api key|permission|inactive/i;
// Org token prices (see the ai-generate and lecture-video functions).
// AI tokens per item; a board costs 3 for each lecture part, and a lecture usually has about 3 parts
const COST = { notes: 5, slides: 6, guide: 4, quiz: 6, capstone: 6, script: 5, board: 9 };

const STEP_LABEL: Record<StepKey, { title: string; icon: typeof FileText }> = {
  materials: { title: 'Notes & slides', icon: FileText },
  lectures: { title: 'Weekly AI lecture videos', icon: Video },
  quizzes: { title: 'Weekly quizzes', icon: HelpCircle },
  capstone: { title: 'Capstone project', icon: Trophy },
  boards: { title: 'Live boards beside the lectures', icon: Code2 },
  guides: { title: 'Teacher guides', icon: BookOpen },
};
const SERVER_POLL_MS = 4000;

export default function BuildCourseModal({ ws, only, showLatest, rewriteLectures, onClose, onChanged, onDownloadCourse }: Props) {
  const { profile } = useAuth();

  // ── What is missing ──────────────────────────────────────────────────────
  const weeks = useMemo(() => ws.sections.map(s => ({ ...s, lessons: weekLessons(s, ws) })), [ws]);
  const readingLessons = useMemo(() => weeks.flatMap(w => w.lessons.filter(isReadingLesson)), [weeks]);
  const missingMaterials = readingLessons.filter(l => lessonState(l, ws) !== 'ready');
  const missingGuides = readingLessons.filter(l => !ws.guides.has(l.id));
  const weeksWithoutQuiz = weeks.filter(w => w.lessons.length > 0 && !ws.quizzes.some(q => q.section_id === w.id));
  const hasCapstone = ws.assignments.some(a => a.kind === 'capstone');
  const lectureWeeks = weeks.filter(w => w.lessons.length > 0).map(w => ({ week: w, lecture: weekLecture(w, ws) }));
  const weeksNeedingLecture = lectureWeeks.filter(x => x.lecture.state === 'none' || x.lecture.state === 'draft' || x.lecture.state === 'failed');
  // Writing every lecture again: all weeks except those whose video is being made right now
  const [rewrite, setRewrite] = useState(!!rewriteLectures);
  const weeksWithLecture = lectureWeeks.filter(x => x.lecture.state !== 'none');
  const weeksToRewrite = lectureWeeks.filter(x => x.lecture.state !== 'making');
  const weeksBeingMade = lectureWeeks.filter(x => x.lecture.state === 'making');
  const lectureChoices = rewrite ? weeksToRewrite : weeksNeedingLecture;

  const [opt, setOpt] = useState(() => only ? {
    materials: only === 'materials', guides: only === 'guides', lectures: only === 'lectures', quizzes: only === 'quizzes', capstone: false,
    boards: only === 'boards' || only === 'lectures',
  } : {
    materials: missingMaterials.length > 0,
    guides: false,
    lectures: weeksNeedingLecture.length > 0 || !!rewriteLectures,
    quizzes: weeksWithoutQuiz.length > 0,
    capstone: !hasCapstone && weeks.length > 0,
    boards: true,
  });
  // Which weeks' lectures already have a live board (null until known, or when boards are not set up)
  const [boardWeeks, setBoardWeeks] = useState<Map<string, boolean> | null>(null);
  useEffect(() => {
    let active = true;
    supabase.from('lecture_videos').select('section_id, board').eq('course_id', ws.course.id).then(({ data, error }) => {
      if (!active || error) return;
      const m = new Map<string, boolean>();
      for (const r of (data ?? []) as Array<{ section_id: string; board: { steps?: unknown[] } | null }>) {
        m.set(r.section_id, (m.get(r.section_id) ?? true) && !!r.board?.steps?.length);
      }
      setBoardWeeks(m);
    });
    return () => { active = false; };
  }, [ws.course.id]);
  const [checkScripts, setCheckScripts] = useState(false);
  const [understood, setUnderstood] = useState(false);
  const [avatarId, setAvatarId] = useState('');
  const [voiceId, setVoiceId] = useState('');

  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [steps, setSteps] = useState<Partial<Record<StepKey, StepState>>>({});
  const [problems, setProblems] = useState<Problem[]>([]);
  const [setup, setSetup] = useState<BuildSetup | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const onChangedRef = useRef(onChanged);
  onChangedRef.current = onChanged;

  // ── Building on the server (the default): the teacher can close the page ──
  const [server, setServer] = useState<{ job: BuildJob; tasks: BuildTask[] } | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState('');
  const [offerLocal, setOfferLocal] = useState(false);
  const serverRunning = server?.job.status === 'running';
  const lastDone = useRef(-1);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  // A problem starting the build is shown at the top; bring it into view
  useEffect(() => {
    if (offerLocal || startError) bodyRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [offerLocal, startError]);

  // What the server has been set up with: switch off what it cannot do yet, and say why
  useEffect(() => {
    let active = true;
    checkBuildSetup().then(result => {
      if (!active) return;
      setSetup(result);
      setOpt(o => ({
        ...o,
        guides: o.guides && !aiCannot(result, 'teacher_guide'),
        capstone: o.capstone && !aiCannot(result, 'assessment_draft'),
        lectures: o.lectures && result.lectureTable !== false,
        boards: o.boards && result.boardsTable !== false && result.lectureTable !== false,
      }));
    }).catch(() => {});
    return () => { active = false; };
  }, []);
  const guidesBlocked = aiCannot(setup, 'teacher_guide');
  const capstoneBlocked = aiCannot(setup, 'assessment_draft');
  const lecturesBlocked = setup?.lectureTable === false;
  const boardsBlocked = lecturesBlocked || setup?.boardsTable === false;
  const runInBrowser = setup?.backgroundBuilds === false;
  // An older build service ignores "write every lecture again" and would find nothing to do
  const REWRITE_OUTDATED = 'The build service on your server is an older version, so it cannot write the lectures again yet. Deploy the latest course-build and lecture-video functions, then press Build it again.';

  // Opening the dialog while a build is under way shows its progress
  useEffect(() => {
    let active = true;
    loadLatestBuild(ws.course.id).then(b => { if (active && b && (b.job.status === 'running' || showLatest)) setServer(b); }).catch(() => {});
    return () => { active = false; };
  }, [ws.course.id, showLatest]);

  useEffect(() => {
    if (!serverRunning) return;
    const id = setInterval(async () => {
      const b = await loadLatestBuild(ws.course.id).catch(() => null);
      if (!b || b.job.id !== server?.job.id) return;
      setServer(b);
      const done = b.tasks.filter(t => t.status === 'done').length;
      if (done !== lastDone.current || b.job.status !== 'running') { lastDone.current = done; onChangedRef.current(); }
    }, SERVER_POLL_MS);
    return () => clearInterval(id);
  }, [serverRunning, server?.job.id, ws.course.id]);

  // Leaving the page mid-run would stop the remaining work.
  useEffect(() => {
    if (!running) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [running]);

  const lessonJobs = useMemo<LessonJob[]>(() => {
    const sections: ContentSection[] = weeks.map(w => ({ id: w.id, title: w.title, order_index: w.order_index, lessons: w.lessons }));
    const jobs: LessonJob[] = [];
    for (const section of sections) {
      for (const lesson of section.lessons) {
        const wsLesson = readingLessons.find(l => l.id === lesson.id);
        if (!wsLesson) continue;
        const m = ws.materials.get(lesson.id) ?? { notes: false, slides: false };
        // Never replace text the teacher wrote themselves
        const needNotes = opt.materials && !m.notes && !hasOwnNotes(lesson);
        const needSlides = opt.materials && (needNotes || !m.slides);
        const needGuide = opt.guides && !ws.guides.has(lesson.id);
        if (needNotes || needSlides || needGuide) jobs.push({ section, lesson, needNotes, needSlides, needGuide });
      }
    }
    return jobs;
  }, [weeks, readingLessons, ws.materials, ws.guides, opt.materials, opt.guides]);

  // When the teacher checks scripts first, only weeks without a script have anything to do now
  // (when rewriting, every week gets a new script)
  const lecturesToRun = !opt.lectures ? []
    : rewrite ? weeksToRewrite
    : weeksNeedingLecture.filter(x => !checkScripts || x.lecture.state === 'none');
  const writesScript = (x: { lecture: { state: string } }) => rewrite || x.lecture.state === 'none';
  const quizzesToRun = opt.quizzes ? weeksWithoutQuiz : [];
  const runCapstone = opt.capstone && !hasCapstone;
  // Boards: lectures that already have a script but no board, plus the scripts written now
  const newScriptWeeks = new Set(lecturesToRun.filter(writesScript).map(x => x.week.id));
  // (a new script, including one written again, needs a new board)
  const weeksNeedingBoard = weeks.filter(w => boardWeeks !== null && (boardWeeks.get(w.id) === false || newScriptWeeks.has(w.id)));
  const boardsAvailable = boardWeeks !== null && !boardsBlocked;
  const boardsToRun = opt.boards && boardsAvailable ? weeksNeedingBoard : [];
  const nothingToDo = lessonJobs.length === 0 && lecturesToRun.length === 0 && quizzesToRun.length === 0 && !runCapstone && boardsToRun.length === 0;
  const needPresenter = lecturesToRun.length > 0 && !checkScripts;
  const rewriteOutdated = rewrite && opt.lectures && !runInBrowser && buildServiceLacks(setup, 'rewrite_lectures');
  const canStart = !nothingToDo && !rewriteOutdated && (!needPresenter || (avatarId && voiceId && understood));

  const tokens = lessonJobs.reduce((n, j) => n + (j.needNotes ? COST.notes : 0) + (j.needSlides ? COST.slides : 0) + (j.needGuide ? COST.guide : 0), 0)
    + lecturesToRun.filter(writesScript).length * COST.script
    + quizzesToRun.length * COST.quiz + (runCapstone ? COST.capstone : 0) + boardsToRun.length * COST.board;
  const minutes = Math.max(1, Math.round((lessonJobs.length * 1.5) / PARALLEL_LESSONS + lecturesToRun.length * 1 + quizzesToRun.length * 0.5 + (runCapstone ? 1 : 0)));

  const update = (key: StepKey, patch: Partial<StepState>) => setSteps(prev => ({ ...prev, [key]: { ...(prev[key] as StepState), ...patch } }));
  const fail = (label: string, message: string) => setProblems(prev => [...prev, { label, message }]);

  const start = async () => {
    const controller = new AbortController();
    abortRef.current = controller;
    const stopped = () => controller.signal.aborted;
    setRunning(true);
    setFinished(false);
    setProblems([]);
    const initial: Partial<Record<StepKey, StepState>> = {};
    if (lessonJobs.length) initial.materials = { total: lessonJobs.length, done: 0, failed: 0, current: '', status: 'waiting' };
    if (lecturesToRun.length) initial.lectures = { total: lecturesToRun.length, done: 0, failed: 0, current: '', status: 'waiting' };
    if (boardsToRun.length) initial.boards = { total: boardsToRun.length, done: 0, failed: 0, current: '', status: 'waiting' };
    if (quizzesToRun.length) initial.quizzes = { total: quizzesToRun.length, done: 0, failed: 0, current: '', status: 'waiting' };
    if (runCapstone) initial.capstone = { total: 1, done: 0, failed: 0, current: '', status: 'waiting' };
    setSteps(initial);

    // 1. Notes and slides first: lectures, quizzes and the capstone are written from the notes.
    if (lessonJobs.length) {
      update('materials', { status: 'running' });
      const ctx = { courseId: ws.course.id, courseTitle: ws.course.title, plan: ws.plan, sections: weeks.map(w => ({ id: w.id, title: w.title, order_index: w.order_index, lessons: w.lessons })) };
      let done = 0;
      let failed = 0;
      await runWithLimit(lessonJobs, PARALLEL_LESSONS, async job => {
        update('materials', { current: job.lesson.title });
        try {
          await generateLessonMaterials(job, ctx);
          done += 1;
          onChangedRef.current();
        } catch (e) {
          failed += 1;
          const text = e instanceof Error ? e.message : 'Failed.';
          fail(job.lesson.title, text);
          if (STOP_ALL.test(text)) controller.abort();
        }
        update('materials', { done, failed });
      }, controller.signal);
      update('materials', { status: stopped() ? 'stopped' : 'done', current: '' });
    }

    // 2. Lectures next, so the videos are being made while the rest is written.
    if (lecturesToRun.length && !stopped()) {
      update('lectures', { status: 'running' });
      let done = 0;
      let failed = 0;
      for (const { week, lecture } of lecturesToRun) {
        if (stopped()) break;
        update('lectures', { current: week.title });
        try {
          if (rewrite || lecture.state === 'none') await callLectureApi('draft', { section_id: week.id });
          if (!checkScripts) await callLectureApi('render', { section_id: week.id, avatar_id: avatarId, voice_id: voiceId });
          done += 1;
        } catch (e) {
          failed += 1;
          const text = e instanceof Error ? e.message : 'Failed.';
          fail(`Lecture: ${week.title}`, text);
          if (STOP_ALL.test(text)) break; // only the lectures stop; quizzes can still be written
        }
        update('lectures', { done, failed });
      }
      onChangedRef.current();
      update('lectures', { status: stopped() ? 'stopped' : 'done', current: '' });
    }

    // 2b. A live board for each lecture, from its script
    if (boardsToRun.length && !stopped()) {
      update('boards', { status: 'running' });
      let done = 0;
      let failed = 0;
      for (const week of boardsToRun) {
        if (stopped()) break;
        update('boards', { current: week.title });
        try {
          await callLectureApi('board', { section_id: week.id });
          done += 1;
        } catch (e) {
          failed += 1;
          const text = e instanceof Error ? e.message : 'Failed.';
          fail(`Live board: ${week.title}`, text);
          if (STOP_ALL.test(text)) break;
        }
        update('boards', { done, failed });
      }
      update('boards', { status: stopped() ? 'stopped' : 'done', current: '' });
    }

    // 3. A quiz for every week that has none.
    if (quizzesToRun.length && !stopped()) {
      update('quizzes', { status: 'running' });
      let done = 0;
      let failed = 0;
      for (const week of quizzesToRun) {
        if (stopped()) break;
        update('quizzes', { current: week.title });
        try {
          await createWeekQuiz(ws.course.id, week, ws.plan);
          done += 1;
          onChangedRef.current();
        } catch (e) {
          failed += 1;
          const text = e instanceof Error ? e.message : 'Failed.';
          fail(`Quiz: ${week.title}`, text);
          if (STOP_ALL.test(text)) controller.abort();
        }
        update('quizzes', { done, failed });
      }
      update('quizzes', { status: stopped() ? 'stopped' : 'done', current: '' });
    }

    // 4. The capstone, drafted from the whole course and saved hidden for the teacher to check.
    if (runCapstone && !stopped()) {
      update('capstone', { status: 'running', current: 'Drafting from all weeks' });
      try {
        await createCapstoneDraft(ws.course.id, ws.course.title, weeks, ws.plan, profile?.id ?? null);
        update('capstone', { done: 1 });
        onChangedRef.current();
      } catch (e) {
        update('capstone', { failed: 1 });
        fail('Capstone project', e instanceof Error ? e.message : 'Failed.');
      }
      update('capstone', { status: 'done', current: '' });
    }

    abortRef.current = null;
    setRunning(false);
    setFinished(true);
    onChangedRef.current();
  };

  const startOnServer = async () => {
    setStarting(true);
    setStartError('');
    try {
      const r = await startServerBuild(ws.course.id, {
        materials: opt.materials, guides: opt.guides, lectures: opt.lectures, quizzes: opt.quizzes, capstone: opt.capstone,
        boards: opt.boards && boardsAvailable,
        check_scripts: checkScripts, rewrite_lectures: rewrite && opt.lectures,
        avatar_id: avatarId || undefined, voice_id: voiceId || undefined,
      });
      const outdated = rewrite && opt.lectures && !(r.features ?? []).includes('rewrite_lectures');
      if (outdated) setStartError(REWRITE_OUTDATED);
      if (!r.job_id) { if (!outdated) setStartError('Nothing is missing any more.'); return; }
      const b = await loadLatestBuild(ws.course.id);
      if (b) setServer(b);
    } catch (e) {
      if (e instanceof BuildServiceUnavailable) setOfferLocal(true);
      else setStartError(e instanceof Error ? e.message : 'Could not start the build.');
    } finally {
      setStarting(false);
    }
  };

  const stopOnServer = async () => {
    if (!server) return;
    try {
      await stopServerBuild(server.job.id);
      const b = await loadLatestBuild(ws.course.id);
      if (b) setServer(b);
    } catch (e) {
      setStartError(e instanceof Error ? e.message : 'Could not stop the build.');
    }
  };

  const stop = () => abortRef.current?.abort();
  const close = () => {
    if (running && !server && !window.confirm('Stop building? Everything that has finished is saved, and you can continue the rest later.')) return;
    abortRef.current?.abort();
    onClose();
  };

  const option = (k: keyof typeof opt, title: string, detail: string, disabled?: boolean) => (
    <label key={k} className={`flex items-start gap-3 px-4 py-3 ${disabled ? 'opacity-50' : 'cursor-pointer hover:bg-slate-50'}`}>
      <input type="checkbox" checked={opt[k] && !disabled} disabled={disabled} onChange={e => setOpt(o => ({ ...o, [k]: e.target.checked }))} className="mt-1 accent-sky-600" />
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-medium text-slate-800">{title}</span>
        <span className="block text-xs text-slate-500">{detail}</span>
      </span>
    </label>
  );

  const stepIcon = (s: StepState) => s.status === 'running' ? <Loader2 className="w-4 h-4 animate-spin text-sky-600" />
    : s.status === 'done' && s.failed === 0 ? <CheckCircle2 className="w-4 h-4 text-emerald-500" />
      : s.status === 'done' || s.status === 'stopped' ? <AlertTriangle className="w-4 h-4 text-amber-500" />
        : <Circle className="w-4 h-4 text-slate-300" />;

  // What the progress list shows: the server build, or the run in this browser
  const serverGroups = server ? groupProgress(server.tasks) : {};
  const shownSteps: Partial<Record<StepKey, StepState>> = server
    ? Object.fromEntries(Object.entries(serverGroups).map(([k, g]) => [k, {
      total: g!.total, done: g!.done, failed: g!.failed, current: g!.running.join(' · '),
      status: g!.done + g!.failed + g!.skipped >= g!.total ? (g!.skipped ? 'stopped' : 'done') : g!.running.length ? 'running' : serverRunning ? 'waiting' : 'stopped',
    } as StepState]))
    : steps;
  const shownProblems: Problem[] = server
    ? [
      ...(server.job.error ? [{ label: 'Build', message: server.job.error }] : []),
      ...server.tasks.filter(t => t.status === 'failed' || (t.status === 'skipped' && t.error)).map(t => ({ label: t.label, message: t.error ?? 'failed' })),
    ]
    : problems;
  const problemGroups = groupProblems(shownProblems);
  const isFinished = server ? !serverRunning : finished;
  const scriptsOnly = server ? !!server.job.options.check_scripts : checkScripts;
  const showSetup = !running && !finished && !server;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={running ? undefined : close} />
      <div role="dialog" aria-modal="true" aria-labelledby="build-title" className="relative bg-white sm:rounded-2xl shadow-2xl w-full max-w-2xl h-full sm:h-auto sm:max-h-[90vh] flex flex-col">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100 shrink-0">
          <div className="w-9 h-9 bg-sky-100 rounded-xl flex items-center justify-center shrink-0"><Sparkles className="w-4 h-4 text-sky-600" /></div>
          <div className="flex-1 min-w-0">
            <h3 id="build-title" className="font-bold text-slate-900">Build the whole course</h3>
            <p className="text-xs text-slate-500 truncate">Everything that is missing, for all {weeks.length} weeks, in one go</p>
          </div>
          <button onClick={close} aria-label="Close" className="p-2 rounded-lg text-slate-400 hover:bg-slate-100"><X className="w-4 h-4" /></button>
        </div>

        <div ref={bodyRef} className="flex-1 overflow-y-auto p-6 space-y-5">
          {showSetup && (
            <>
              {setup && (aiIsOld(setup) || guidesBlocked || capstoneBlocked || lecturesBlocked || runInBrowser || setup.boardsTable === false || rewriteOutdated) && (
                <div role="status" className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 space-y-1.5">
                  <p className="font-semibold">Your server is missing some updates</p>
                  <ul className="list-disc pl-5 space-y-1 text-xs">
                    {(aiIsOld(setup) || guidesBlocked || capstoneBlocked) && (
                      <li>The AI service is an older version{guidesBlocked || capstoneBlocked ? ': teacher guides and the capstone are switched off' : ''}{aiIsOld(setup) ? ', and long notes can time out' : ''}. Fix: deploy the latest <strong>ai-generate</strong> function.</li>
                    )}
                    {!lecturesBlocked && setup.boardsTable === false && <li>Live boards beside the lectures are not set up in the database, so they are switched off. Fix: run database update <strong>059</strong> (lecture boards).</li>}
                    {lecturesBlocked && <li>Lecture videos are not set up in the database, so they are switched off. Fix: run database update <strong>055</strong> (lecture videos).</li>}
                    {rewriteOutdated && <li>The build service is an older version, so it cannot write the lectures again yet. Fix: deploy the latest <strong>course-build</strong> and <strong>lecture-video</strong> functions, then open this window again.</li>}
                    {runInBrowser && <li>Background building is not set up, so this build runs in this browser: keep this page open until it finishes. Fix: run database update <strong>058</strong> and deploy the <strong>course-build</strong> function.</li>}
                  </ul>
                </div>
              )}
              {startError && <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">{startError}</p>}
              {offerLocal && (
                <div role="alert" className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 space-y-2">
                  <p>The build service is not set up on the server yet, so the build cannot run in the background. You can build in this browser instead; keep this page open until it finishes.</p>
                  <button onClick={start} disabled={!canStart} className="px-3 py-1.5 text-xs font-semibold bg-white border border-amber-300 rounded-lg disabled:opacity-50">Build in this browser</button>
                </div>
              )}
              {!nothingToDo ? (
                <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                  Takes about {minutes} minute{minutes === 1 ? '' : 's'} and uses about {tokens} AI tokens{lecturesToRun.length && !checkScripts ? ', plus the video minutes' : ''}.
                  {' '}{runInBrowser ? 'Keep this page open until it finishes.' : 'It runs on our servers, so you can close this window or leave the page and come back later.'}{lecturesToRun.length && !checkScripts ? ' Each video is added to its week when it is ready.' : ''}
                </p>
              ) : (
                <p className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">Nothing is missing. You can download the whole course as a PowerPoint below.</p>
              )}
              <div className="border border-slate-200 rounded-xl divide-y divide-slate-100">
                {option('materials', `Notes & slides for ${missingMaterials.length} lesson${missingMaterials.length === 1 ? '' : 's'}`,
                  missingMaterials.length ? 'Complete study notes, then a slide deck with speaker notes built from them.' : 'Every lesson already has notes and slides.',
                  missingMaterials.length === 0)}
                {option('lectures', rewrite
                  ? `Write the AI lecture again for ${lectureChoices.length} week${lectureChoices.length === 1 ? '' : 's'}`
                  : `AI lecture video for ${weeksNeedingLecture.length} week${weeksNeedingLecture.length === 1 ? '' : 's'}`,
                  lecturesBlocked ? 'Not available until lecture videos are set up in the database (see above).'
                    : rewrite ? `A new, deeper script for every week${checkScripts ? '' : ', then a new video'}. Each week keeps its current video until the new one is ready.${weeksBeingMade.length ? ` ${weeksBeingMade.length} week${weeksBeingMade.length === 1 ? ' is' : 's are'} skipped because a video is being made right now.` : ''}`
                    : weeksNeedingLecture.length ? 'A presenter teaches each week from its notes. Videos finish on their own after this.' : 'Every week already has a lecture (or one is being made).',
                  lectureChoices.length === 0 || lecturesBlocked)}
                {weeksWithLecture.length > 0 && !lecturesBlocked && (
                  <label className="flex items-start gap-2.5 px-4 py-3 text-sm text-slate-700 cursor-pointer bg-sky-50/60">
                    <input type="checkbox" checked={rewrite} onChange={e => { setRewrite(e.target.checked); if (e.target.checked) setOpt(o => ({ ...o, lectures: true })); }} className="mt-0.5 accent-sky-600" />
                    <span>
                      <span className="font-medium text-slate-800">Write every lecture again in the new, deeper style</span>
                      <span className="block text-xs text-slate-500 mt-0.5">Replaces the scripts of the {weeksWithLecture.length === 1 ? 'week that already has' : `${weeksWithLecture.length} weeks that already have`} a lecture. The new lectures explain each idea step by step and run about twice as long, so they use more video minutes.</span>
                    </span>
                  </label>
                )}
                {option('boards', `Live board for ${weeksNeedingBoard.length} lecture${weeksNeedingBoard.length === 1 ? '' : 's'}`,
                  boardsBlocked ? 'Not available until it is set up in the database (see above).'
                    : weeksNeedingBoard.length ? 'Beside the presenter: the code being typed and its output, or the key points, as the presenter speaks.' : 'Every lecture already has a live board.',
                  !boardsAvailable || weeksNeedingBoard.length === 0)}
                {option('quizzes', `Quiz for ${weeksWithoutQuiz.length} week${weeksWithoutQuiz.length === 1 ? '' : 's'}`,
                  weeksWithoutQuiz.length ? '8 auto-marked questions per week, written from that week\'s notes.' : 'Every week already has a quiz.',
                  weeksWithoutQuiz.length === 0)}
                {option('capstone', 'Capstone project',
                  capstoneBlocked ? 'Not available until the AI service is updated (see above).'
                    : hasCapstone ? 'This course already has one.' : 'Brief, rubric and model answer, saved hidden until you check it.',
                  hasCapstone || weeks.length === 0 || capstoneBlocked)}
                {option('guides', `Teacher guides for ${missingGuides.length} lesson${missingGuides.length === 1 ? '' : 's'}`,
                  guidesBlocked ? 'Not available until the AI service is updated (see above).'
                    : missingGuides.length ? 'Optional: a session plan for teaching each lesson live.' : 'Every lesson already has a teacher guide.',
                  missingGuides.length === 0 || guidesBlocked)}
              </div>

              {lecturesToRun.length > 0 && (
                <div className="space-y-3">
                  <label className="flex items-start gap-2.5 text-sm text-slate-700 cursor-pointer">
                    <input type="checkbox" checked={checkScripts} onChange={e => setCheckScripts(e.target.checked)} className="mt-0.5 accent-sky-600" />
                    <span>Let me check each lecture script before its video is made <span className="text-slate-500">(only the scripts are written now; you make the videos from Weekly AI lectures)</span></span>
                  </label>
                  {!checkScripts && (
                    <>
                      <LecturePresenterPicker avatarId={avatarId} voiceId={voiceId} onChange={v => { setAvatarId(v.avatarId); setVoiceId(v.voiceId); }} />
                      <label className="flex items-start gap-2.5 text-sm text-slate-700 cursor-pointer bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                        <input type="checkbox" checked={understood} onChange={e => setUnderstood(e.target.checked)} className="mt-0.5 accent-sky-600" />
                        <span>I understand the presenter will read the scripts the AI writes from my notes without me checking them first, and that videos are charged by the minute.</span>
                      </label>
                    </>
                  )}
                </div>
              )}

            </>
          )}

          {!showSetup && server && (() => {
            const c = buildCounts(server.tasks);
            const left = serverRunning ? buildMinutesLeft(server.job, server.tasks) : null;
            return (
              <p className="text-sm font-semibold text-slate-800">
                {c.finished} of {c.total} done{left !== null ? ` · about ${left} minute${left === 1 ? '' : 's'} left` : ''}
              </p>
            );
          })()}

          {!showSetup && (
            <ol className="space-y-3" aria-live="polite">
              {(Object.keys(STEP_LABEL) as StepKey[]).filter(k => shownSteps[k]).map(k => {
                const s = shownSteps[k] as StepState;
                const Icon = STEP_LABEL[k].icon;
                return (
                  <li key={k} className="border border-slate-200 rounded-xl px-4 py-3">
                    <div className="flex items-center gap-3">
                      {stepIcon(s)}
                      <Icon className="w-4 h-4 text-slate-400 shrink-0" />
                      <span className="flex-1 text-sm font-medium text-slate-800">{STEP_LABEL[k].title}</span>
                      <span className="text-xs text-slate-500">{s.done}/{s.total}{s.failed ? ` · ${s.failed} failed` : ''}{s.status === 'stopped' ? ' · stopped' : ''}</span>
                    </div>
                    {s.total > 1 && (
                      <div className="mt-2 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-sky-500 transition-all" style={{ width: `${Math.round(((s.done + s.failed) / s.total) * 100)}%` }} />
                      </div>
                    )}
                    {s.status === 'running' && s.current && <p className="mt-1.5 text-xs text-slate-500 truncate">{s.current}</p>}
                  </li>
                );
              })}
            </ol>
          )}

          {serverRunning && (
            <p className="text-xs text-slate-500">This keeps going on our servers. You can close this window; progress also shows at the top of the course.</p>
          )}

          {isFinished && !showSetup && (
            <div className="text-sm text-slate-700 space-y-1.5">
              <p className="font-semibold text-slate-900">{server?.job.status === 'stopped' ? 'Stopped.' : shownProblems.length ? 'Finished, with some problems.' : 'Done.'}</p>
              {!!shownSteps.lectures?.done && !scriptsOnly && <p>The lecture videos are being made, usually within 30 minutes. Each one is added to its week when ready; if you close the course before then, they are added the next time you open it.</p>}
              {!!shownSteps.lectures?.done && scriptsOnly && <p>The lecture scripts are written. Open <strong>Weekly AI lectures</strong> to check them and make the videos.</p>}
              {!!shownSteps.capstone?.done && <p>The capstone is saved <strong>hidden</strong>. Check it on the Assessments tab, then make it visible.</p>}
              {shownProblems.length > 0 && <p>Press <strong>Build the whole course</strong> again to retry what failed.</p>}
            </div>
          )}

          {problemGroups.length > 0 && (
            <div role="alert" className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-xs text-red-800 space-y-2.5 max-h-56 overflow-y-auto">
              {problemGroups.map((g, i) => (
                <div key={i}>
                  <p className="font-semibold">{g.message}</p>
                  <p className="text-red-700">
                    {g.labels.length === 1 ? g.labels[0] : `${g.labels.length} items: ${g.labels.slice(0, 4).join('; ')}${g.labels.length > 4 ? ` and ${g.labels.length - 4} more` : ''}`}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 px-6 py-4 border-t border-slate-100 shrink-0 flex-wrap">
          {serverRunning ? (
            <button onClick={stopOnServer} className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold border border-slate-300 rounded-xl text-slate-700 hover:bg-slate-50">
              <Square className="w-3.5 h-3.5" /> Stop after the current items
            </button>
          ) : running ? (
            <button onClick={stop} className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold border border-slate-300 rounded-xl text-slate-700 hover:bg-slate-50">
              <Square className="w-3.5 h-3.5" /> Stop after the current items
            </button>
          ) : (
            <button onClick={onDownloadCourse} className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold border border-slate-300 rounded-xl text-slate-700 hover:bg-slate-50">
              <Download className="w-4 h-4" /> Download course as PowerPoint
            </button>
          )}
          <div className="ml-auto flex items-center gap-2">
            {serverRunning ? (
              <button onClick={onClose} className="px-5 py-2.5 bg-sky-600 hover:bg-sky-700 text-white text-sm font-bold rounded-xl">Close (it keeps going)</button>
            ) : isFinished && !showSetup ? (
              <button onClick={onClose} className="flex items-center gap-2 px-5 py-2.5 bg-sky-600 hover:bg-sky-700 text-white text-sm font-bold rounded-xl"><BookOpen className="w-4 h-4" /> Back to the course</button>
            ) : !running && (
              <>
              {rewriteOutdated ? (
                <span className="text-xs text-amber-700 max-w-[260px] text-right">Deploy the latest course-build and lecture-video functions first (see the note at the top).</span>
              ) : !nothingToDo && needPresenter && !canStart && (
                <span className="text-xs text-slate-500 max-w-[220px] text-right">For the videos, choose a presenter and voice and tick the box above.</span>
              )}
              <button onClick={runInBrowser ? start : startOnServer} disabled={!canStart || starting} className="flex items-center gap-2 px-5 py-2.5 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-sm font-bold rounded-xl">
                {starting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Build it
              </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
