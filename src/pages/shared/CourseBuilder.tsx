import { useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Plus, Sparkles, Upload, BookOpen, Loader2, FileText, AlertCircle, CheckCircle2, X, Copy } from 'lucide-react';
import { toast } from 'sonner';
import DashboardLayout from '../../components/layout/DashboardLayout';
import type { NavItem } from '../../components/layout/DashboardLayout';
import { supabase } from '../../lib/supabase';
import { safeUrl } from '../../lib/utils';
import { useAuth } from '../../contexts/AuthContext';
import { loadWorkspace, readiness, totalMinutes, weekLessons } from '../../lib/workspace';
import type { AssignmentKind, ReadinessItem, Workspace, WsAssignment } from '../../lib/workspace';
import { loadSlideDecks } from '../../lib/courseContent';
import { downloadPptx } from '../../lib/slides';
import CourseHeader from '../../components/course/CourseHeader';
import type { WorkspaceTab } from '../../components/course/CourseHeader';
import WeeksView from '../../components/course/WeeksView';
import AssistantPanel from '../../components/course/AssistantPanel';
import type { QuizWithQuestions } from '../../components/course/QuizzesTab';
import type { BuildFocus } from '../../components/course/BuildCourseModal';
import { callLectureApi } from '../../lib/lectureApi';
import { loadLatestBuild, kickServerBuild, stopServerBuild, buildCounts } from '../../lib/courseBuildJob';
import type { BuildJob, BuildTask } from '../../lib/courseBuildJob';

const LessonPanel = lazy(() => import('../../components/course/LessonPanel'));
const OverviewView = lazy(() => import('../../components/course/OverviewView'));
const ScheduleView = lazy(() => import('../../components/course/ScheduleView'));
const ResultsView = lazy(() => import('../../components/course/ResultsView'));
const CourseSettings = lazy(() => import('../../components/course/CourseSettings'));
const AssignmentsList = lazy(() => import('../../components/course/AssignmentsList'));
const QuizzesTab = lazy(() => import('../../components/course/QuizzesTab'));
const ExamsTab = lazy(() => import('../../components/course/ExamsTab'));
const PublishDialog = lazy(() => import('../../components/course/PublishDialog'));
const PlanWeeksModal = lazy(() => import('../../components/course/PlanWeeksModal'));
const WeekQuizModal = lazy(() => import('../../components/course/WeekQuizModal'));
const AssignmentEditorModal = lazy(() => import('../../components/course/AssignmentEditorModal'));
const BuildCourseModal = lazy(() => import('../../components/course/BuildCourseModal'));
const CopyCourseModal = lazy(() => import('../../components/course/CopyCourseModal'));
const SubmissionsModal = lazy(() => import('../../components/course/SubmissionsModal'));
const AICourseGeneratorModal = lazy(() => import('../../components/ai/AICourseGeneratorModal'));
const LectureVideoModal = lazy(() => import('../../components/ai/LectureVideoModal'));
const CourseContentStudio = lazy(() => import('../../components/ai/CourseContentStudio'));
const CourseLecturesModal = lazy(() => import('../../components/ai/CourseLecturesModal'));

interface CourseBuilderProps {
  navItems: NavItem[];
  role: 'admin' | 'teacher';
}

interface CourseCard {
  id: string;
  title: string;
  short_description: string | null;
  thumbnail_url: string | null;
  is_published: boolean | null;
  updated_at: string | null;
  start_date: string | null;
}

type AssessSub = 'projects' | 'quizzes' | 'exams';
const TABS: WorkspaceTab[] = ['overview', 'weeks', 'assessments', 'schedule', 'results', 'settings'];

const Loading = () => (
  <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
);

export default function CourseBuilder({ navItems, role }: CourseBuilderProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const params = useParams<{ courseId?: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { profile } = useAuth();
  // e.g. /teacher/builder, /admin/builder or /org/builder
  const basePath = location.pathname.split('/').slice(0, 3).join('/');
  const courseId = searchParams.get('courseId') || params.courseId || '';
  const tabParam = searchParams.get('tab') as WorkspaceTab | null;
  const tab: WorkspaceTab = tabParam && TABS.includes(tabParam) ? tabParam : 'weeks';

  const [courses, setCourses] = useState<CourseCard[] | null>(null);
  const [ws, setWs] = useState<Workspace | null>(null);
  const [wsError, setWsError] = useState('');
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null);
  const [assessSub, setAssessSub] = useState<AssessSub>('projects');
  const [quizzesFull, setQuizzesFull] = useState<QuizWithQuestions[]>([]);

  // Dialogs
  const [newCourse, setNewCourse] = useState<null | 'ai' | 'upload'>(null);
  const [creatingBlank, setCreatingBlank] = useState(false);
  const [planner, setPlanner] = useState<null | { message?: string; upload?: boolean }>(null);
  const [studio, setStudio] = useState<null | { sectionIds?: string[]; autoStart?: boolean }>(null);
  const [showLectures, setShowLectures] = useState(false);
  const [lectureSection, setLectureSection] = useState<{ id: string; title: string } | null>(null);
  const [weekQuiz, setWeekQuiz] = useState<{ id: string; title: string } | null>(null);
  const [assignmentEditor, setAssignmentEditor] = useState<null | { kind: AssignmentKind; sectionId?: string | null; assignment?: WsAssignment }>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [build, setBuild] = useState<null | { only?: BuildFocus; showLatest?: boolean }>(null);
  const [latestBuild, setLatestBuild] = useState<{ job: BuildJob; tasks: BuildTask[] } | null>(null);
  const [dismissedBuild, setDismissedBuild] = useState<string | null>(() => {
    try { return localStorage.getItem('maximus-build-dismissed'); } catch { return null; }
  });
  const [marking, setMarking] = useState<WsAssignment | null>(null);
  const [copying, setCopying] = useState<null | { id: string; title: string; start_date: string | null }>(null);
  const [marksVersion, setMarksVersion] = useState(0);
  const [downloading, setDownloading] = useState(false);

  const setParams = useCallback((changes: Record<string, string | null>, replace = false) => {
    const next = new URLSearchParams(searchParams);
    for (const [k, v] of Object.entries(changes)) {
      if (v === null) next.delete(k); else next.set(k, v);
    }
    setSearchParams(next, { replace });
  }, [searchParams, setSearchParams]);

  const setTab = (t: WorkspaceTab) => { setSelectedLessonId(null); setParams({ tab: t === 'weeks' ? null : t }); };
  const openCourse = (id: string) => {
    if (params.courseId) navigate(`${basePath}?courseId=${id}`);
    else setParams({ courseId: id, tab: null });
  };
  const backToCourses = () => {
    setWs(null);
    if (params.courseId) navigate(basePath); else setParams({ courseId: null, tab: null });
  };

  // ── Data ──────────────────────────────────────────────────────────────────
  const fetchCourses = useCallback(async () => {
    if (!profile) return;
    let q = supabase.from('courses').select('id, title, short_description, thumbnail_url, is_published, updated_at, start_date');
    if (role === 'teacher') q = q.eq('teacher_id', profile.id);
    const { data } = await q.order('updated_at', { ascending: false });
    setCourses((data ?? []) as CourseCard[]);
  }, [profile, role]);

  const loadSeq = useRef(0);
  const reload = useCallback(async () => {
    if (!courseId) return;
    const seq = ++loadSeq.current;
    try {
      const next = await loadWorkspace(courseId);
      if (seq !== loadSeq.current) return;
      setWs(next);
      setWsError('');
    } catch (e) {
      if (seq !== loadSeq.current) return;
      setWsError(e instanceof Error ? e.message : 'Could not load this course.');
    }
  }, [courseId]);

  const fetchQuizzesFull = useCallback(async () => {
    if (!courseId) return;
    const { data } = await supabase.from('quizzes').select('*, questions:quiz_questions(*)').eq('course_id', courseId).order('created_at');
    setQuizzesFull(((data ?? []) as QuizWithQuestions[]).map(q => ({
      ...q, questions: [...(q.questions ?? [])].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0)),
    })));
  }, [courseId]);

  useEffect(() => { if (!courseId) fetchCourses(); }, [courseId, fetchCourses]);
  useEffect(() => {
    setWs(null);
    setWsError('');
    setSelectedLessonId(null);
    reload();
  }, [reload]);
  useEffect(() => { if (tab === 'assessments' && assessSub === 'quizzes') fetchQuizzesFull(); }, [tab, assessSub, fetchQuizzesFull]);

  // Arriving from "Create this course": write notes and slides for every lesson straight away
  useEffect(() => {
    if (searchParams.get('materials') !== 'generate' || !ws || ws.course.id !== courseId) return;
    if (ws.sections.length) setStudio({ autoStart: true });
    setParams({ materials: null }, true);
  }, [searchParams, ws, courseId, setParams]);

  // While lecture videos are being made, check on them; this also adds finished ones to the course
  const lecturesMaking = !!ws?.lectures.some(l => l.status === 'rendering' || l.status === 'saving');
  useEffect(() => {
    if (!lecturesMaking || !courseId) return;
    const id = setInterval(() => {
      callLectureApi('course_status', { course_id: courseId }).then(() => reload()).catch(() => {});
    }, 45000);
    return () => clearInterval(id);
  }, [lecturesMaking, courseId, reload]);

  // A build running on the server: show progress, refresh as items finish, nudge it if it stalls
  const refreshBuild = useCallback(async () => {
    if (!courseId) return;
    const b = await loadLatestBuild(courseId).catch(() => null);
    setLatestBuild(b);
  }, [courseId]);
  useEffect(() => { setLatestBuild(null); refreshBuild(); }, [refreshBuild]);
  const buildRunning = latestBuild?.job.status === 'running';
  const buildFinished = latestBuild ? buildCounts(latestBuild.tasks).finished : 0;
  const lastKick = useRef(0);
  useEffect(() => {
    if (!buildRunning) return;
    const id = setInterval(() => { refreshBuild(); }, 10000);
    return () => clearInterval(id);
  }, [buildRunning, refreshBuild]);
  useEffect(() => { if (buildFinished > 0) reload(); }, [buildFinished, reload]);
  useEffect(() => {
    if (!buildRunning || !latestBuild) return;
    const quietFor = Date.now() - new Date(latestBuild.job.updated_at).getTime();
    if (quietFor > 6 * 60 * 1000 && Date.now() - lastKick.current > 5 * 60 * 1000) {
      lastKick.current = Date.now();
      kickServerBuild(latestBuild.job.id).catch(() => {});
    }
  }, [buildRunning, latestBuild]);

  const reloadAll = useCallback(async () => {
    await reload();
    if (tab === 'assessments' && assessSub === 'quizzes') await fetchQuizzesFull();
  }, [reload, fetchQuizzesFull, tab, assessSub]);

  const ready = useMemo(() => (ws ? readiness(ws) : { percent: 0, items: [] as ReadinessItem[] }), [ws]);

  // ── Actions ───────────────────────────────────────────────────────────────
  const createBlankCourse = async () => {
    if (!profile) return;
    setCreatingBlank(true);
    const { data, error } = await supabase.from('courses').insert({
      title: 'Untitled course', teacher_id: profile.id, is_published: false,
      is_free: true, is_paid: false, price: 0, price_amount: 0, category: 'General', level: 'beginner',
    }).select('id').single();
    setCreatingBlank(false);
    if (error || !data) { toast.error('Could not create the course.'); return; }
    navigate(`${basePath}?courseId=${data.id}&tab=settings`);
  };

  const downloadCourse = async () => {
    if (!ws) return;
    setDownloading(true);
    try {
      const decks = await loadSlideDecks(ws.sections.flatMap(s => s.lessons));
      if (decks.length === 0) { toast.error('There are no slides yet. Write notes and slides first.'); return; }
      await downloadPptx(ws.course.title, decks, { title: ws.course.title, subtitle: `${ws.sections.length} weeks` });
    } catch {
      toast.error('Could not build the PowerPoint file.');
    } finally {
      setDownloading(false);
    }
  };

  const fixItem = (item: ReadinessItem) => {
    if (!ws) return;
    switch (item.key) {
      case 'content': if (ws.sections.length === 0) setPlanner({}); else setTab('weeks'); break;
      case 'description': case 'thumbnail': setTab('settings'); break;
      case 'notes': case 'slides': setBuild({ only: 'materials' }); break;
      case 'guides': setBuild({ only: 'guides' }); break;
      case 'quizzes': setBuild({ only: 'quizzes' }); break;
      case 'capstone': setAssignmentEditor({ kind: 'capstone', sectionId: null }); break;
      case 'schedule': setTab('schedule'); break;
      case 'lectures': setBuild({ only: 'lectures' }); break;
    }
  };

  const summary = useMemo(() => {
    if (!ws) return '';
    const b = ws.plan?.brief;
    const lessons = ws.sections.reduce((n, s) => n + weekLessons(s, ws).length, 0);
    const hours = Math.round(totalMinutes(ws) / 60);
    const parts = [
      b?.audience,
      `${ws.sections.length} week${ws.sections.length === 1 ? '' : 's'}`,
      lessons ? `${lessons} lesson${lessons === 1 ? '' : 's'}` : null,
      hours ? `about ${hours} hours` : null,
      b?.target_roles?.length ? `leads to ${b.target_roles.slice(0, 2).join(' or ')}` : null,
    ];
    return parts.filter(Boolean).join(' · ');
  }, [ws]);

  // ── Course picker ─────────────────────────────────────────────────────────
  if (!courseId) {
    return (
      <DashboardLayout navItems={navItems} title="Course builder" subtitle="Choose a course or start a new one">
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-3">
            <button onClick={() => setNewCourse('ai')} className="text-left bg-white border border-sky-200 hover:border-sky-400 rounded-xl p-4 flex gap-3 items-start">
              <span className="w-10 h-10 rounded-xl bg-sky-100 flex items-center justify-center shrink-0"><Sparkles className="w-5 h-5 text-sky-600" /></span>
              <span>
                <span className="block font-semibold text-slate-900">New course with AI</span>
                <span className="block text-sm text-slate-500">Plan it in a conversation; the AI checks what employers want</span>
              </span>
            </button>
            <button onClick={() => setNewCourse('upload')} className="text-left bg-white border border-slate-200 hover:border-sky-400 rounded-xl p-4 flex gap-3 items-start">
              <span className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0"><Upload className="w-5 h-5 text-emerald-600" /></span>
              <span>
                <span className="block font-semibold text-slate-900">From my own material</span>
                <span className="block text-sm text-slate-500">Upload a syllabus, notes or slides (PDF, Word, PowerPoint)</span>
              </span>
            </button>
            <button onClick={createBlankCourse} disabled={creatingBlank} className="text-left bg-white border border-slate-200 hover:border-sky-400 rounded-xl p-4 flex gap-3 items-start disabled:opacity-60">
              <span className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">{creatingBlank ? <Loader2 className="w-5 h-5 text-slate-500 animate-spin" /> : <Plus className="w-5 h-5 text-slate-600" />}</span>
              <span>
                <span className="block font-semibold text-slate-900">Blank course</span>
                <span className="block text-sm text-slate-500">Start empty and add weeks yourself</span>
              </span>
            </button>
          </div>

          <section aria-labelledby="my-courses">
            <h2 id="my-courses" className="text-sm font-semibold text-slate-700 mb-3">Your courses</h2>
            {courses === null ? <Loading /> : courses.length === 0 ? (
              <div className="bg-white border border-dashed border-slate-300 rounded-xl px-6 py-12 text-center">
                <BookOpen className="w-9 h-9 text-slate-300 mx-auto mb-2" />
                <p className="text-sm text-slate-600">No courses yet. Start one above.</p>
              </div>
            ) : (
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {courses.map(c => {
                  const thumb = safeUrl(c.thumbnail_url);
                  return (
                    <li key={c.id} className="relative">
                      <button onClick={() => setCopying({ id: c.id, title: c.title, start_date: c.start_date })} aria-label={`Copy ${c.title} for a new term`}
                        className="absolute top-2 right-2 z-10 flex items-center gap-1 px-2 py-1 text-xs font-semibold bg-white/90 hover:bg-white border border-slate-200 rounded-lg text-slate-700 shadow-sm">
                        <Copy className="w-3.5 h-3.5" /> Copy
                      </button>
                      <button onClick={() => openCourse(c.id)} className="w-full text-left bg-white border border-slate-200 hover:border-sky-400 hover:shadow-sm rounded-xl overflow-hidden transition">
                        <div className="aspect-[16/7] bg-gradient-to-br from-sky-100 to-slate-100">
                          {thumb && <img src={thumb} alt="" className="w-full h-full object-cover" />}
                        </div>
                        <div className="p-4">
                          <div className="flex items-start gap-2">
                            <p className="flex-1 font-semibold text-slate-900 line-clamp-2">{c.title}</p>
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${c.is_published ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                              {c.is_published ? 'Published' : 'Draft'}
                            </span>
                          </div>
                          {c.short_description && <p className="text-sm text-slate-500 mt-1 line-clamp-2">{c.short_description}</p>}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        {newCourse && (
          <Suspense fallback={null}>
            <AICourseGeneratorModal onClose={() => setNewCourse(null)} navigatePrefix={basePath} startWithUpload={newCourse === 'upload'} />
          </Suspense>
        )}
        {copying && (
          <Suspense fallback={null}>
            <CopyCourseModal course={copying} onClose={() => setCopying(null)} onCopied={id => { setCopying(null); toast.success('Course copied. You are now editing the copy.'); navigate(`${basePath}?courseId=${id}&tab=schedule`); }} />
          </Suspense>
        )}
      </DashboardLayout>
    );
  }

  // ── Course workspace ──────────────────────────────────────────────────────
  if (!ws) {
    return (
      <DashboardLayout navItems={navItems} title="Course builder">
        {wsError ? (
          <div className="max-w-lg mx-auto mt-10 bg-white border border-slate-200 rounded-xl p-6 text-center">
            <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-2" />
            <p className="text-sm text-slate-700">{wsError}</p>
            <div className="flex justify-center gap-2 mt-4">
              <button onClick={() => reload()} className="px-4 py-2 text-sm font-semibold bg-sky-600 text-white rounded-lg">Try again</button>
              <button onClick={backToCourses} className="px-4 py-2 text-sm border border-slate-300 rounded-lg text-slate-700">My courses</button>
            </div>
          </div>
        ) : <Loading />}
      </DashboardLayout>
    );
  }

  const courseTitle = ws.course.title || 'Course';
  const side = selectedLessonId ? (
    <Suspense fallback={<Loading />}>
      <LessonPanel key={selectedLessonId} ws={ws} lessonId={selectedLessonId} onClose={() => setSelectedLessonId(null)} onChanged={reload} />
    </Suspense>
  ) : (
    <AssistantPanel
      ws={ws}
      onBuildAll={() => setBuild({})}
      onOpenPlanner={opts => setPlanner(opts ?? {})}
      onOpenStudio={ids => setStudio({ sectionIds: ids })}
      onOpenLectures={() => setShowLectures(true)}
      onOpenWeekQuiz={s => setWeekQuiz(s)}
      onDraftCapstone={() => setAssignmentEditor({ kind: 'capstone', sectionId: null })}
      onOpenSchedule={() => setTab('schedule')}
      onDownloadCourse={downloading ? () => {} : downloadCourse}
    />
  );

  return (
    <DashboardLayout navItems={navItems} title="Course builder" subtitle={courseTitle}>
      <div className="space-y-5">
        <CourseHeader
          title={courseTitle}
          summary={summary}
          published={!!ws.course.is_published}
          percent={ready.percent}
          items={ready.items}
          tab={tab}
          onTab={setTab}
          onBack={backToCourses}
          onPreview={() => navigate(`/preview/course/${ws.course.id}`, { state: { back: `${location.pathname}${location.search}` } })}
          onPublish={() => setPublishOpen(true)}
          onItem={fixItem}
        />

        {latestBuild && (() => {
          const c = buildCounts(latestBuild.tasks);
          if (buildRunning) {
            return (
              <div role="status" className="flex items-center gap-3 flex-wrap bg-sky-50 border border-sky-200 rounded-xl px-4 py-3 text-sm text-sky-900">
                <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                <span className="flex-1 min-w-[200px]">Building the course in the background: <strong>{c.done} of {c.total}</strong> done{c.failed ? `, ${c.failed} could not be made` : ''}. You can keep working or leave this page.</span>
                <div className="w-32 h-1.5 bg-sky-100 rounded-full overflow-hidden"><div className="h-full bg-sky-500" style={{ width: `${c.total ? Math.round((c.finished / c.total) * 100) : 0}%` }} /></div>
                <button onClick={() => setBuild({ showLatest: true })} className="text-xs font-semibold underline">Details</button>
                <button onClick={() => stopServerBuild(latestBuild.job.id).then(refreshBuild).catch(() => toast.error('Could not stop the build.'))} className="text-xs font-semibold underline">Stop</button>
              </div>
            );
          }
          const recent = latestBuild.job.finished_at && Date.now() - new Date(latestBuild.job.finished_at).getTime() < 24 * 3600 * 1000;
          if (!recent || dismissedBuild === latestBuild.job.id) return null;
          return (
            <div role="status" className={`flex items-center gap-3 flex-wrap rounded-xl px-4 py-3 text-sm border ${c.failed || latestBuild.job.status === 'stopped' ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-emerald-50 border-emerald-200 text-emerald-900'}`}>
              {c.failed || latestBuild.job.status === 'stopped' ? <AlertCircle className="w-4 h-4 shrink-0" /> : <CheckCircle2 className="w-4 h-4 shrink-0" />}
              <span className="flex-1 min-w-[200px]">
                {latestBuild.job.status === 'stopped' ? 'The course build was stopped' : 'The course build finished'}: {c.done} done{c.failed ? `, ${c.failed} could not be made` : ''}.
                {latestBuild.job.error ? ` ${latestBuild.job.error}` : ''}
              </span>
              <button onClick={() => setBuild({ showLatest: true })} className="text-xs font-semibold underline">Details</button>
              <button aria-label="Dismiss" onClick={() => { setDismissedBuild(latestBuild.job.id); try { localStorage.setItem('maximus-build-dismissed', latestBuild.job.id); } catch { /* ignore */ } }} className="p-1 rounded hover:bg-black/5"><X className="w-3.5 h-3.5" /></button>
            </div>
          );
        })()}

        <Suspense fallback={<Loading />}>
          {tab === 'overview' && (
            <OverviewView ws={ws} items={ready.items} onFix={fixItem} onEditPlan={() => setPlanner({})} onEditDescription={() => setTab('settings')} />
          )}

          {tab === 'weeks' && (
            <WeeksView
              ws={ws}
              selectedLessonId={selectedLessonId}
              side={side}
              onSelectLesson={setSelectedLessonId}
              onReload={reload}
              onOpenStudio={ids => setStudio({ sectionIds: ids })}
              onOpenLecture={s => setLectureSection(s)}
              onOpenWeekQuiz={s => setWeekQuiz(s)}
              onOpenAssignment={opts => setAssignmentEditor(opts)}
              onOpenQuizzes={() => { setAssessSub('quizzes'); setTab('assessments'); }}
              onBuildAll={() => setBuild({})}
            />
          )}

          {tab === 'assessments' && (
            <div className="space-y-4">
              <div className="flex gap-1 p-1 bg-slate-100 rounded-xl w-fit" role="tablist" aria-label="Assessments">
                {([['projects', 'Projects & assignments'], ['quizzes', 'Quizzes'], ['exams', 'Exams']] as const).map(([id, label]) => (
                  <button key={id} role="tab" aria-selected={assessSub === id} onClick={() => setAssessSub(id)}
                    className={`px-3.5 py-1.5 rounded-lg text-sm font-medium ${assessSub === id ? 'bg-white text-sky-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>
                    {label}
                  </button>
                ))}
              </div>
              {assessSub === 'projects' && (
                <AssignmentsList key={marksVersion} ws={ws} onOpen={opts => setAssignmentEditor(opts)} onMark={a => setMarking(a)} />
              )}
              {assessSub === 'quizzes' && (
                <QuizzesTab courseId={ws.course.id} quizzes={quizzesFull} sections={ws.sections} onChanged={() => { fetchQuizzesFull(); reload(); }} />
              )}
              {assessSub === 'exams' && <ExamsTab courseId={ws.course.id} courseTitle={courseTitle} />}
            </div>
          )}

          {tab === 'schedule' && <ScheduleView key={ws.course.id} ws={ws} onSaved={reload} />}
          {tab === 'results' && <ResultsView ws={ws} />}
          {tab === 'settings' && (
            <CourseSettings courseId={ws.course.id} onSaved={reload}
              onCopy={() => setCopying({ id: ws.course.id, title: ws.course.title, start_date: ws.course.start_date })} />
          )}
        </Suspense>
      </div>

      <Suspense fallback={null}>
        {build && (
          <BuildCourseModal ws={ws} only={build.only} showLatest={build.showLatest} onClose={() => { setBuild(null); reload(); refreshBuild(); }} onChanged={() => { reload(); }} onDownloadCourse={downloadCourse} />
        )}
        {publishOpen && (
          <PublishDialog ws={ws} percent={ready.percent} items={ready.items} onClose={() => setPublishOpen(false)} onChanged={reload} onFix={fixItem} />
        )}
        {planner && (
          <PlanWeeksModal
            courseId={ws.course.id}
            courseTitle={courseTitle}
            sections={ws.sections}
            initialMessage={planner.message}
            startWithUpload={planner.upload}
            onClose={() => { setPlanner(null); reload(); }}
            onInserted={ids => { setPlanner(null); setTab('weeks'); reload(); if (ids.length) setStudio({ sectionIds: ids, autoStart: true }); }}
          />
        )}
        {studio && (
          <CourseContentStudio
            courseId={ws.course.id}
            courseTitle={courseTitle}
            initialSectionIds={studio.sectionIds}
            autoStart={studio.autoStart}
            onClose={() => { setStudio(null); reload(); }}
            onChanged={() => { reload(); }}
          />
        )}
        {showLectures && (
          <CourseLecturesModal
            courseId={ws.course.id}
            courseTitle={courseTitle}
            sections={ws.sections.map(s => ({ id: s.id, title: s.title, lessonCount: s.lessons.length }))}
            onClose={() => { setShowLectures(false); reload(); }}
            onLessonAdded={() => { reload(); }}
          />
        )}
        {lectureSection && (
          <LectureVideoModal
            sectionId={lectureSection.id}
            sectionTitle={lectureSection.title}
            onClose={() => { setLectureSection(null); reload(); }}
            onLessonAdded={() => { reload(); }}
          />
        )}
        {weekQuiz && (
          <WeekQuizModal ws={ws} section={weekQuiz} onClose={() => setWeekQuiz(null)} onCreated={reloadAll} />
        )}
        {copying && (
          <CopyCourseModal course={copying} onClose={() => setCopying(null)} onCopied={id => { setCopying(null); toast.success('Course copied. You are now editing the copy.'); navigate(`${basePath}?courseId=${id}&tab=schedule`); }} />
        )}
        {marking && (
          <SubmissionsModal assignment={marking} onClose={() => setMarking(null)} onChanged={() => setMarksVersion(v => v + 1)} />
        )}
        {assignmentEditor && (
          <AssignmentEditorModal
            courseId={ws.course.id}
            kind={assignmentEditor.kind}
            sectionId={assignmentEditor.sectionId}
            assignment={assignmentEditor.assignment}
            onClose={() => setAssignmentEditor(null)}
            onSaved={reload}
          />
        )}
      </Suspense>

      {downloading && (
        <div role="status" className="fixed bottom-4 right-4 z-40 flex items-center gap-2 bg-slate-900 text-white text-sm rounded-xl px-4 py-2.5 shadow-lg">
          <FileText className="w-4 h-4" /> Building the PowerPoint…
        </div>
      )}
    </DashboardLayout>
  );
}
