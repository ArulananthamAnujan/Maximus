import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X, Loader2, CheckCircle2, AlertTriangle, Download, FileText, Presentation, Sparkles, Square } from 'lucide-react';
import {
  loadCourseStructure, loadMaterialStatus, generateLessonMaterials, runWithLimit, loadSlideDecks, hasOwnNotes,
} from '../../lib/courseContent';
import type { ContentSection, LessonJob, LessonMaterials } from '../../lib/courseContent';
import { loadCoursePlan } from '../../lib/coursePlan';
import type { CoursePlan } from '../../lib/coursePlan';
import { downloadPptx } from '../../lib/slides';

interface Props {
  courseId: string;
  courseTitle: string;
  /** Weeks to select when the screen opens; all weeks when omitted. */
  initialSectionIds?: string[];
  /** Start generating straight away (used right after new weeks are created). */
  autoStart?: boolean;
  onClose: () => void;
  /** Called whenever materials were saved, so the page can refresh. */
  onChanged: () => void;
}

type LessonState = { stage: 'queued' | 'notes' | 'slides' | 'guide' | 'done' | 'failed'; error?: string };

// Lessons generated at the same time. Each lesson is two AI requests (notes, then slides).
const PARALLEL_LESSONS = 3;
// Rough wall-clock per lesson for the time estimate.
const MINUTES_PER_LESSON = 1.5;

export default function CourseContentStudio({ courseId, courseTitle, initialSectionIds, autoStart, onClose, onChanged }: Props) {
  const [sections, setSections] = useState<ContentSection[]>([]);
  const [status, setStatus] = useState<Map<string, LessonMaterials>>(new Map());
  const [plan, setPlan] = useState<CoursePlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<'missing' | 'all'>('missing');
  const [includeGuides, setIncludeGuides] = useState(false);
  const [running, setRunning] = useState(false);
  const [lessonState, setLessonState] = useState<Record<string, LessonState>>({});
  const [summary, setSummary] = useState<{ done: number; failed: number; stopped: boolean } | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const autoStarted = useRef(false);
  const onChangedRef = useRef(onChanged);
  onChangedRef.current = onChanged;
  // Only the first value matters; a new array from the parent must not reload the screen
  const initialSectionIdsRef = useRef(initialSectionIds);

  const refreshStatus = useCallback(async (secs: ContentSection[]) => {
    setStatus(await loadMaterialStatus(secs.flatMap(s => s.lessons.map(l => l.id))));
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [secs, savedPlan] = await Promise.all([loadCourseStructure(courseId), loadCoursePlan(courseId)]);
        if (!active) return;
        setSections(secs);
        setPlan(savedPlan);
        const initial = initialSectionIdsRef.current;
        const wanted = initial?.length ? initial : secs.map(s => s.id);
        setSelected(new Set(wanted.filter(id => secs.some(s => s.id === id))));
        await refreshStatus(secs);
      } catch {
        if (active) setLoadError('Could not load this course. Please close and try again.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [courseId, refreshStatus]);

  const jobs = useMemo<LessonJob[]>(() => {
    const list: LessonJob[] = [];
    for (const section of sections) {
      if (!selected.has(section.id)) continue;
      for (const lesson of section.lessons) {
        const st = status.get(lesson.id) ?? { notes: false, slides: false };
        // Never replace text the teacher wrote themselves, unless rewriting everything
        const needNotes = mode === 'all' || (!st.notes && !hasOwnNotes(lesson));
        const needSlides = mode === 'all' || needNotes || !st.slides;
        const needGuide = includeGuides && (mode === 'all' || needNotes || !st.guide);
        if (needNotes || needSlides || needGuide) list.push({ section, lesson, needNotes, needSlides, needGuide });
      }
    }
    return list;
  }, [sections, selected, status, mode, includeGuides]);

  const start = useCallback(async () => {
    if (jobs.length === 0 || running) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    setSummary(null);
    setMessage('');
    setLessonState(Object.fromEntries(jobs.map(j => [j.lesson.id, { stage: 'queued' } as LessonState])));
    let done = 0;
    let failed = 0;
    const ctx = { courseId, courseTitle, plan, sections };

    await runWithLimit(jobs, PARALLEL_LESSONS, async (job) => {
      const id = job.lesson.id;
      try {
        await generateLessonMaterials(job, ctx, stage => setLessonState(prev => ({ ...prev, [id]: { stage } })));
        done += 1;
        setLessonState(prev => ({ ...prev, [id]: { stage: 'done' } }));
        setStatus(prev => new Map(prev).set(id, { notes: true, slides: true, guide: prev.get(id)?.guide || !!job.needGuide }));
        onChangedRef.current();
      } catch (err) {
        failed += 1;
        const text = err instanceof Error ? err.message : 'Generation failed.';
        setLessonState(prev => ({ ...prev, [id]: { stage: 'failed', error: text } }));
        // Out of tokens or not allowed: every remaining lesson would fail the same way.
        if (/not enough tokens|insufficient tokens|permission|inactive/i.test(text)) controller.abort();
      }
    }, controller.signal);

    const stopped = controller.signal.aborted;
    setRunning(false);
    setSummary({ done, failed, stopped });
    abortRef.current = null;
    await refreshStatus(sections);
  }, [jobs, running, courseId, courseTitle, plan, sections, refreshStatus]);

  useEffect(() => {
    if (autoStart && !loading && !autoStarted.current && jobs.length > 0) {
      autoStarted.current = true;
      start();
    }
  }, [autoStart, loading, jobs.length, start]);

  // Leaving the page mid-run would silently drop the unfinished lessons.
  useEffect(() => {
    if (!running) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [running]);

  const stop = () => abortRef.current?.abort();

  const handleClose = () => {
    if (running && !window.confirm('Stop generating? Lessons that have finished are saved, and you can continue the rest later.')) return;
    abortRef.current?.abort();
    onClose();
  };

  const toggleWeek = (id: string) => setSelected(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const allSelected = sections.length > 0 && sections.every(s => selected.has(s.id));

  const downloadWeek = async (section: ContentSection) => {
    setDownloading(section.id);
    setMessage('');
    try {
      const decks = await loadSlideDecks(section.lessons);
      if (decks.length === 0) { setMessage(`"${section.title}" has no slides yet.`); return; }
      await downloadPptx(`${courseTitle} - ${section.title}`, decks, { title: section.title, subtitle: courseTitle });
    } catch {
      setMessage('Could not create the PowerPoint file. Please try again.');
    } finally {
      setDownloading(null);
    }
  };

  const downloadCourse = async () => {
    setDownloading('course');
    setMessage('');
    try {
      const decks = await loadSlideDecks(sections.flatMap(s => s.lessons));
      if (decks.length === 0) { setMessage('This course has no slides yet.'); return; }
      await downloadPptx(courseTitle, decks, { title: courseTitle, subtitle: `${sections.length} weeks` });
    } catch {
      setMessage('Could not create the PowerPoint file. Please try again.');
    } finally {
      setDownloading(null);
    }
  };

  const finishedCount = Object.values(lessonState).filter(s => s.stage === 'done' || s.stage === 'failed').length;
  const runTotal = Object.keys(lessonState).length;
  const minutes = Math.max(1, Math.round((jobs.length * MINUTES_PER_LESSON) / PARALLEL_LESSONS));
  const totalLessons = sections.reduce((n, s) => n + s.lessons.length, 0);
  const lessonsWithSlides = Array.from(status.values()).filter(s => s.slides).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />
      <div role="dialog" aria-modal="true" aria-labelledby="studio-title" className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100 shrink-0">
          <div className="w-9 h-9 bg-blue-100 rounded-xl flex items-center justify-center shrink-0">
            <FileText className="w-4 h-4 text-blue-600" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 id="studio-title" className="font-bold text-slate-900">Course materials</h3>
            <p className="text-xs text-slate-500 truncate">Complete study notes, slides built from them, and optional teacher guides</p>
          </div>
          <button onClick={handleClose} aria-label="Close" className="p-2 rounded-lg text-slate-400 hover:bg-slate-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {loading ? (
            <div className="flex items-center justify-center gap-3 py-16 text-sm text-slate-500">
              <Loader2 className="w-5 h-5 animate-spin text-blue-500" /> Loading the course…
            </div>
          ) : loadError ? (
            <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{loadError}</p>
          ) : sections.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-12">This course has no weeks yet. Create the curriculum first.</p>
          ) : (
            <>
              {!plan?.brief && (
                <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5">
                  Tip: plan the course with the AI planner first, and the notes and slides will be written for your learners, their level and the job they are aiming for.
                </p>
              )}

              {/* Weeks */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold text-slate-700">Weeks</p>
                  <button
                    type="button"
                    disabled={running}
                    onClick={() => setSelected(allSelected ? new Set() : new Set(sections.map(s => s.id)))}
                    className="text-xs font-semibold text-blue-700 hover:underline disabled:opacity-40"
                  >
                    {allSelected ? 'Clear selection' : 'Select all weeks'}
                  </button>
                </div>
                <div className="border border-slate-200 rounded-xl divide-y divide-slate-100">
                  {sections.map(section => {
                    const st = section.lessons.map(l => status.get(l.id) ?? { notes: false, slides: false });
                    const notesDone = st.filter(x => x.notes).length;
                    const slidesDone = st.filter(x => x.slides).length;
                    const complete = section.lessons.length > 0 && notesDone === section.lessons.length && slidesDone === section.lessons.length;
                    const weekStates = section.lessons.map(l => lessonState[l.id]).filter(Boolean);
                    const busy = weekStates.some(s => s.stage === 'notes' || s.stage === 'slides' || s.stage === 'guide');
                    const weekFailed = weekStates.filter(s => s.stage === 'failed');
                    return (
                      <div key={section.id} className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            id={`week-${section.id}`}
                            checked={selected.has(section.id)}
                            onChange={() => toggleWeek(section.id)}
                            disabled={running}
                            className="w-4 h-4 accent-blue-600 shrink-0"
                          />
                          <label htmlFor={`week-${section.id}`} className="flex-1 min-w-0 cursor-pointer">
                            <span className="block text-sm font-medium text-slate-800 truncate">{section.title}</span>
                            <span className="block text-xs text-slate-500">
                              {section.lessons.length === 0
                                ? 'No lessons'
                                : `Notes ${notesDone}/${section.lessons.length} · Slides ${slidesDone}/${section.lessons.length}`}
                            </span>
                          </label>
                          {busy && <Loader2 className="w-4 h-4 animate-spin text-blue-500 shrink-0" />}
                          {!busy && complete && <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />}
                          <button
                            type="button"
                            onClick={() => downloadWeek(section)}
                            disabled={slidesDone === 0 || downloading !== null}
                            title="Download this week's slides as PowerPoint"
                            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-40 shrink-0"
                          >
                            {downloading === section.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />} PPT
                          </button>
                        </div>
                        {weekStates.length > 0 && (
                          <ul className="mt-2 ml-7 space-y-1">
                            {section.lessons.filter(l => lessonState[l.id]).map(l => {
                              const ls = lessonState[l.id];
                              return (
                                <li key={l.id} className="flex items-start gap-2 text-xs">
                                  {ls.stage === 'done' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-px" />}
                                  {ls.stage === 'failed' && <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-px" />}
                                  {(ls.stage === 'notes' || ls.stage === 'slides' || ls.stage === 'guide') && <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500 shrink-0 mt-px" />}
                                  {ls.stage === 'queued' && <span className="w-3.5 h-3.5 rounded-full border border-slate-300 shrink-0 mt-px" />}
                                  <span className="min-w-0">
                                    <span className="text-slate-700">{l.title}</span>
                                    <span className="text-slate-400">
                                      {ls.stage === 'notes' && ' — writing notes…'}
                                      {ls.stage === 'slides' && ' — building slides from the notes…'}
                                      {ls.stage === 'guide' && ' — writing the teacher guide…'}
                                    </span>
                                    {ls.stage === 'failed' && <span className="block text-red-600">{ls.error}</span>}
                                  </span>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                        {!running && weekFailed.length > 0 && (
                          <p className="ml-7 mt-1 text-xs text-red-600">{weekFailed.length} lesson{weekFailed.length === 1 ? '' : 's'} failed. Start again to retry only what is missing.</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Mode */}
              <fieldset disabled={running} className="space-y-2">
                <legend className="text-sm font-semibold text-slate-700 mb-1">What to generate</legend>
                <label className="flex items-start gap-2.5 text-sm text-slate-700 cursor-pointer">
                  <input type="radio" name="studio-mode" checked={mode === 'missing'} onChange={() => setMode('missing')} className="mt-1 accent-blue-600" />
                  <span><strong>Fill in what's missing</strong><span className="block text-xs text-slate-500">Lessons that already have notes and slides are left as they are.</span></span>
                </label>
                <label className="flex items-start gap-2.5 text-sm text-slate-700 cursor-pointer">
                  <input type="radio" name="studio-mode" checked={mode === 'all'} onChange={() => setMode('all')} className="mt-1 accent-blue-600" />
                  <span><strong>Regenerate everything in the selected weeks</strong><span className="block text-xs text-slate-500">Replaces existing notes and slides, including any edits made to them.</span></span>
                </label>
                <label className="flex items-start gap-2.5 text-sm text-slate-700 cursor-pointer pt-1">
                  <input type="checkbox" checked={includeGuides} onChange={e => setIncludeGuides(e.target.checked)} className="mt-1 accent-blue-600" />
                  <span><strong>Also write teacher guides</strong><span className="block text-xs text-slate-500">A session plan per lesson for live classes: timings, activities, questions, misconceptions. Teachers only.</span></span>
                </label>
              </fieldset>

              {message && <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">{message}</p>}

              {summary && !running && (
                <p className={`text-sm rounded-xl px-4 py-2.5 border ${summary.failed ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-emerald-50 border-emerald-200 text-emerald-800'}`}>
                  {summary.stopped && summary.failed === 0 ? 'Stopped. ' : ''}
                  {summary.done} lesson{summary.done === 1 ? '' : 's'} finished
                  {summary.failed ? `, ${summary.failed} failed` : ''}.
                  {(summary.failed || summary.stopped) ? ' Start again to continue with what is missing.' : ' Students can now see the notes and slides in each lesson.'}
                </p>
              )}
            </>
          )}
        </div>

        {!loading && !loadError && sections.length > 0 && (
          <div className="px-6 py-4 border-t border-slate-100 shrink-0 space-y-3">
            {running && (
              <div>
                <div className="flex justify-between text-xs text-slate-500 mb-1">
                  <span>Generating {finishedCount} of {runTotal} lessons… keep this window open</span>
                  <span>{runTotal ? Math.round((finishedCount / runTotal) * 100) : 0}%</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-1.5">
                  <div className="bg-blue-500 h-1.5 rounded-full transition-all duration-500" style={{ width: `${runTotal ? (finishedCount / runTotal) * 100 : 0}%` }} />
                </div>
              </div>
            )}
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <button
                type="button"
                onClick={downloadCourse}
                disabled={lessonsWithSlides === 0 || downloading !== null}
                className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-40"
              >
                {downloading === 'course' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Presentation className="w-3.5 h-3.5" />}
                Whole course as PowerPoint ({lessonsWithSlides}/{totalLessons} lessons)
              </button>
              {running ? (
                <button onClick={stop} className="flex items-center gap-2 px-5 py-2.5 border border-slate-300 text-sm font-semibold text-slate-700 rounded-xl hover:bg-slate-50">
                  <Square className="w-3.5 h-3.5" /> Stop after current lessons
                </button>
              ) : (
                <button
                  onClick={start}
                  disabled={jobs.length === 0}
                  className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-colors"
                >
                  <Sparkles className="w-4 h-4" />
                  {jobs.length === 0 ? 'Everything selected is done' : `Generate ${jobs.length} lesson${jobs.length === 1 ? '' : 's'} (about ${minutes} min)`}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
