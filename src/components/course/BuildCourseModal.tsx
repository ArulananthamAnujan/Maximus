import { useEffect, useMemo, useRef, useState } from 'react';
import { X, Sparkles, Loader2, CheckCircle2, AlertTriangle, Circle, Square, Download, FileText, Video, HelpCircle, Trophy, BookOpen } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { generateLessonMaterials, runWithLimit } from '../../lib/courseContent';
import type { ContentSection, LessonJob } from '../../lib/courseContent';
import { createWeekQuiz, createCapstoneDraft } from '../../lib/courseBuild';
import { callLectureApi } from '../../lib/lectureApi';
import { weekLessons, weekLecture, isReadingLesson, lessonState } from '../../lib/workspace';
import type { Workspace } from '../../lib/workspace';
import LecturePresenterPicker from '../ai/LecturePresenterPicker';

export type BuildFocus = 'materials' | 'lectures' | 'quizzes' | 'guides';

interface Props {
  ws: Workspace;
  /** Opened from one readiness item: preselect only that. */
  only?: BuildFocus;
  onClose: () => void;
  /** Something was saved; reload the course. */
  onChanged: () => void;
  onDownloadCourse: () => void;
}

type StepKey = 'materials' | 'lectures' | 'quizzes' | 'capstone';
type StepState = { total: number; done: number; failed: number; current: string; status: 'waiting' | 'running' | 'done' | 'skipped' | 'stopped' };

// Lessons written at the same time (each is two AI requests: notes, then slides).
const PARALLEL_LESSONS = 3;
// Out of tokens, video service not set up, or not allowed: every remaining item would fail too.
const STOP_ALL = /not enough tokens|insufficient tokens|out of credit|not set up|api key|permission|inactive/i;
// Org token prices (see the ai-generate and lecture-video functions).
const COST = { notes: 5, slides: 6, guide: 4, quiz: 6, capstone: 6, script: 5 };

const STEP_LABEL: Record<StepKey, { title: string; icon: typeof FileText }> = {
  materials: { title: 'Notes & slides', icon: FileText },
  lectures: { title: 'Weekly AI lecture videos', icon: Video },
  quizzes: { title: 'Weekly quizzes', icon: HelpCircle },
  capstone: { title: 'Capstone project', icon: Trophy },
};

export default function BuildCourseModal({ ws, only, onClose, onChanged, onDownloadCourse }: Props) {
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

  const [opt, setOpt] = useState(() => only ? {
    materials: only === 'materials', guides: only === 'guides', lectures: only === 'lectures', quizzes: only === 'quizzes', capstone: false,
  } : {
    materials: missingMaterials.length > 0,
    guides: false,
    lectures: weeksNeedingLecture.length > 0,
    quizzes: weeksWithoutQuiz.length > 0,
    capstone: !hasCapstone && weeks.length > 0,
  });
  const [checkScripts, setCheckScripts] = useState(false);
  const [understood, setUnderstood] = useState(false);
  const [avatarId, setAvatarId] = useState('');
  const [voiceId, setVoiceId] = useState('');

  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [steps, setSteps] = useState<Partial<Record<StepKey, StepState>>>({});
  const [problems, setProblems] = useState<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const onChangedRef = useRef(onChanged);
  onChangedRef.current = onChanged;

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
        const needNotes = opt.materials && !m.notes;
        const needSlides = opt.materials && (needNotes || !m.slides);
        const needGuide = opt.guides && !ws.guides.has(lesson.id);
        if (needNotes || needSlides || needGuide) jobs.push({ section, lesson, needNotes, needSlides, needGuide });
      }
    }
    return jobs;
  }, [weeks, readingLessons, ws.materials, ws.guides, opt.materials, opt.guides]);

  // When the teacher checks scripts first, only weeks without a script have anything to do now
  const lecturesToRun = opt.lectures ? weeksNeedingLecture.filter(x => !checkScripts || x.lecture.state === 'none') : [];
  const quizzesToRun = opt.quizzes ? weeksWithoutQuiz : [];
  const runCapstone = opt.capstone && !hasCapstone;
  const nothingToDo = lessonJobs.length === 0 && lecturesToRun.length === 0 && quizzesToRun.length === 0 && !runCapstone;
  const needPresenter = lecturesToRun.length > 0 && !checkScripts;
  const canStart = !nothingToDo && (!needPresenter || (avatarId && voiceId && understood));

  const tokens = lessonJobs.reduce((n, j) => n + (j.needNotes ? COST.notes : 0) + (j.needSlides ? COST.slides : 0) + (j.needGuide ? COST.guide : 0), 0)
    + lecturesToRun.filter(x => x.lecture.state === 'none').length * COST.script
    + quizzesToRun.length * COST.quiz + (runCapstone ? COST.capstone : 0);
  const minutes = Math.max(1, Math.round((lessonJobs.length * 1.5) / PARALLEL_LESSONS + lecturesToRun.length * 0.7 + quizzesToRun.length * 0.5 + (runCapstone ? 1 : 0)));

  const update = (key: StepKey, patch: Partial<StepState>) => setSteps(prev => ({ ...prev, [key]: { ...(prev[key] as StepState), ...patch } }));
  const fail = (text: string) => setProblems(prev => [...prev, text]);

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
          fail(`${job.lesson.title}: ${text}`);
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
          if (lecture.state === 'none') await callLectureApi('draft', { section_id: week.id });
          if (!checkScripts) await callLectureApi('render', { section_id: week.id, avatar_id: avatarId, voice_id: voiceId });
          done += 1;
        } catch (e) {
          failed += 1;
          const text = e instanceof Error ? e.message : 'Failed.';
          fail(`Lecture for ${week.title}: ${text}`);
          if (STOP_ALL.test(text)) break; // only the lectures stop; quizzes can still be written
        }
        update('lectures', { done, failed });
      }
      onChangedRef.current();
      update('lectures', { status: stopped() ? 'stopped' : 'done', current: '' });
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
          fail(`Quiz for ${week.title}: ${text}`);
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
        fail(`Capstone: ${e instanceof Error ? e.message : 'Failed.'}`);
      }
      update('capstone', { status: 'done', current: '' });
    }

    abortRef.current = null;
    setRunning(false);
    setFinished(true);
    onChangedRef.current();
  };

  const stop = () => abortRef.current?.abort();
  const close = () => {
    if (running && !window.confirm('Stop building? Everything that has finished is saved, and you can continue the rest later.')) return;
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

  const showSetup = !running && !finished;

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

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {showSetup && (
            <>
              {!nothingToDo ? (
                <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                  Takes about {minutes} minute{minutes === 1 ? '' : 's'} and uses about {tokens} AI tokens{lecturesToRun.length && !checkScripts ? ', plus the video minutes' : ''}.
                  Keep this page open until the writing is finished.{lecturesToRun.length && !checkScripts ? ' The videos keep being made after that and are added to each week when ready (the next time you open the course, if it is closed).' : ''}
                </p>
              ) : (
                <p className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">Nothing is missing. You can download the whole course as a PowerPoint below.</p>
              )}
              <div className="border border-slate-200 rounded-xl divide-y divide-slate-100">
                {option('materials', `Notes & slides for ${missingMaterials.length} lesson${missingMaterials.length === 1 ? '' : 's'}`,
                  missingMaterials.length ? 'Complete study notes, then a slide deck with speaker notes built from them.' : 'Every lesson already has notes and slides.',
                  missingMaterials.length === 0)}
                {option('lectures', `AI lecture video for ${weeksNeedingLecture.length} week${weeksNeedingLecture.length === 1 ? '' : 's'}`,
                  weeksNeedingLecture.length ? 'A presenter teaches each week from its notes. Videos finish on their own after this.' : 'Every week already has a lecture (or one is being made).',
                  weeksNeedingLecture.length === 0)}
                {option('quizzes', `Quiz for ${weeksWithoutQuiz.length} week${weeksWithoutQuiz.length === 1 ? '' : 's'}`,
                  weeksWithoutQuiz.length ? '8 auto-marked questions per week, written from that week\'s notes.' : 'Every week already has a quiz.',
                  weeksWithoutQuiz.length === 0)}
                {option('capstone', 'Capstone project',
                  hasCapstone ? 'This course already has one.' : 'Brief, rubric and model answer, saved hidden until you check it.',
                  hasCapstone || weeks.length === 0)}
                {option('guides', `Teacher guides for ${missingGuides.length} lesson${missingGuides.length === 1 ? '' : 's'}`,
                  missingGuides.length ? 'Optional: a session plan for teaching each lesson live.' : 'Every lesson already has a teacher guide.',
                  missingGuides.length === 0)}
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

          {!showSetup && (
            <ol className="space-y-3" aria-live="polite">
              {(Object.keys(STEP_LABEL) as StepKey[]).filter(k => steps[k]).map(k => {
                const s = steps[k] as StepState;
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

          {finished && (
            <div className="text-sm text-slate-700 space-y-1.5">
              <p className="font-semibold text-slate-900">{problems.length ? 'Finished, with some problems.' : 'Done.'}</p>
              {steps.lectures && !checkScripts && <p>The lecture videos are being made, usually within 30 minutes. Each one is added to its week when ready; if you close the course before then, they are added the next time you open it.</p>}
              {steps.lectures && checkScripts && <p>The lecture scripts are written. Open <strong>Weekly AI lectures</strong> to check them and make the videos.</p>}
              {steps.capstone && <p>The capstone is saved <strong>hidden</strong>. Check it on the Assessments tab, then make it visible.</p>}
            </div>
          )}

          {problems.length > 0 && (
            <div role="alert" className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-xs text-red-700 space-y-1 max-h-40 overflow-y-auto">
              {problems.map((p, i) => <p key={i}>{p}</p>)}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 px-6 py-4 border-t border-slate-100 shrink-0 flex-wrap">
          {running ? (
            <button onClick={stop} className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold border border-slate-300 rounded-xl text-slate-700 hover:bg-slate-50">
              <Square className="w-3.5 h-3.5" /> Stop after the current items
            </button>
          ) : (
            <button onClick={onDownloadCourse} className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold border border-slate-300 rounded-xl text-slate-700 hover:bg-slate-50">
              <Download className="w-4 h-4" /> Download course as PowerPoint
            </button>
          )}
          <div className="ml-auto flex items-center gap-2">
            {finished ? (
              <button onClick={onClose} className="flex items-center gap-2 px-5 py-2.5 bg-sky-600 hover:bg-sky-700 text-white text-sm font-bold rounded-xl"><BookOpen className="w-4 h-4" /> Back to the course</button>
            ) : !running && (
              <>
              {!nothingToDo && needPresenter && !canStart && (
                <span className="text-xs text-slate-500 max-w-[220px] text-right">For the videos, choose a presenter and voice and tick the box above.</span>
              )}
              <button onClick={start} disabled={!canStart} className="flex items-center gap-2 px-5 py-2.5 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-sm font-bold rounded-xl">
                <Sparkles className="w-4 h-4" /> Build it
              </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
