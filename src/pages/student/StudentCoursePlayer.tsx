import { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ChevronLeft, CheckCircle2, Circle, Play, FileText,
  Link as LinkIcon, BookOpen, Lock, Menu, X, ChevronDown, ChevronUp,
  BookMarked, Sparkles, ClipboardList, Clock, Brain, Zap,
  ChevronRight, ListVideo, Award,
} from 'lucide-react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { studentNavItems } from './studentNav';
import ProgressBar from '../../components/ui/ProgressBar';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useHasCourseAccess } from '../../hooks/useAccess';
import { useCourseProgress, useUpdateLessonProgress } from '../../hooks/useProgress';
import { toast as sonnerToast } from 'sonner';
import type { Course, Section, Lesson } from '../../types';

const FlashcardStudyModal = lazy(() => import('../../components/ai/FlashcardStudyModal'));
const LessonDocumentViewer = lazy(() => import('../../components/ui/LessonDocumentViewer').then(m => ({ default: m.default })));

interface SectionWithLessons extends Section {
  lessons: Lesson[];
}

const TYPE_LABELS: Record<string, string> = {
  video: 'Video', pdf: 'PDF', article: 'Article', link: 'Resource', text: 'Reading',
};
const TYPE_COLORS: Record<string, string> = {
  video: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  pdf: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  article: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  text: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  link: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
};

export default function StudentCoursePlayer() {
  const { courseId } = useParams<{ courseId: string }>();
  const { profile } = useAuth();
  const { toast } = useToast();

  const [course, setCourse] = useState<Course | null>(null);
  const [sections, setSections] = useState<SectionWithLessons[]>([]);
  const [activeLesson, setActiveLesson] = useState<Lesson | null>(null);
  const [completedLessons, setCompletedLessons] = useState<Set<string>>(new Set());
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [lessonSummary, setLessonSummary] = useState<{ summary: string; generated_at: string | null } | null>(null);
  const [flashcards, setFlashcards] = useState<Array<{ id: string; front: string; back: string }>>([]);
  const [showFlashcards, setShowFlashcards] = useState(false);
  const [activities, setActivities] = useState<Array<{ id: string; title: string; type: string; instructions: string; estimated_minutes: number }>>([]);
  const [tokenBalance, setTokenBalance] = useState<number | null>(null);
  const [generatingAI, setGeneratingAI] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  const { hasAccess, isLoading: accessLoading } = useHasCourseAccess(courseId);
  const { data: courseProgressRows = [] } = useCourseProgress(courseId);
  const updateProgressMutation = useUpdateLessonProgress();

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const progressSaveTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionStartTime = useRef<number>(Date.now());
  const lastSavedPosition = useRef<number>(0);

  useEffect(() => {
    const completed = new Set(
      courseProgressRows.filter(p => p.status === 'completed').map(p => p.lesson_id)
    );
    setCompletedLessons(completed);
  }, [courseProgressRows]);

  useEffect(() => {
    if (!courseId || !profile) return;
    const fetchData = async () => {
      const [courseRes, sectionsRes] = await Promise.all([
        supabase.from('courses').select('*, teacher:profiles(full_name, avatar_url)').eq('id', courseId).maybeSingle(),
        supabase.from('sections').select('*, lessons(*)').eq('course_id', courseId).order('order_index'),
      ]);
      if (courseRes.data) setCourse(courseRes.data as Course);
      if (sectionsRes.data) {
        const secs = sectionsRes.data.map(s => ({
          ...s,
          lessons: [...(s.lessons || [])].sort((a, b) => a.order_index - b.order_index),
        })) as SectionWithLessons[];
        setSections(secs);
        const firstLesson = secs[0]?.lessons[0];
        if (firstLesson) setActiveLesson(firstLesson);
        // Expand all sections by default
        setExpandedSections(new Set(secs.map(s => s.id)));
      }
      setLoading(false);
    };
    fetchData();
  }, [courseId, profile]);

  useEffect(() => {
    if (!profile) return;
    supabase.from('student_ai_credits').select('token_balance').eq('user_id', profile.id).maybeSingle()
      .then(({ data }) => setTokenBalance(data?.token_balance ?? 0));
  }, [profile?.id]);

  const STUDENT_AI_COSTS: Record<string, number> = {
    summarize_lesson: 3,
    flashcards: 4,
    activity_ideas: 4,
  };

  const generateStudentAI = async (task: string) => {
    if (!profile || !activeLesson || !courseId) return;
    const cost = STUDENT_AI_COSTS[task] ?? 3;
    if ((tokenBalance ?? 0) < cost) {
      sonnerToast.error(`Not enough tokens. This action costs ${cost} tokens.`);
      return;
    }
    setGeneratingAI(task);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({ task, lesson_id: activeLesson.id, course_id: courseId }),
      });
      if (!res.ok) throw new Error('Generation failed');

      const { data: deducted } = await supabase.rpc('deduct_student_tokens', {
        p_user_id: profile.id, p_tokens: cost, p_ai_task: task,
        p_course_id: courseId, p_lesson_id: activeLesson.id,
      });
      if (deducted) setTokenBalance(b => (b ?? 0) - cost);

      if (task === 'summarize_lesson') {
        const { data } = await supabase.from('lessons').select('ai_summary, ai_summary_generated_at').eq('id', activeLesson.id).maybeSingle();
        if (data?.ai_summary) setLessonSummary({ summary: data.ai_summary, generated_at: data.ai_summary_generated_at });
        setSummaryOpen(true);
        sonnerToast.success('Summary generated!');
      } else if (task === 'flashcards') {
        const { data } = await supabase.from('flashcards').select('id, front, back').eq('lesson_id', activeLesson.id).order('order_index');
        setFlashcards((data || []) as Array<{ id: string; front: string; back: string }>);
        setShowFlashcards(true);
        sonnerToast.success('Flashcards generated!');
      } else if (task === 'activity_ideas') {
        const { data } = await supabase.from('lesson_activities').select('id, title, type, instructions, estimated_minutes').eq('lesson_id', activeLesson.id).order('order_index');
        setActivities((data || []) as Array<{ id: string; title: string; type: string; instructions: string; estimated_minutes: number }>);
        sonnerToast.success('Activities generated!');
      }
    } catch {
      sonnerToast.error('AI generation failed. Please try again.');
    } finally {
      setGeneratingAI(null);
    }
  };

  useEffect(() => {
    if (!activeLesson) return;
    setSummaryOpen(false);
    setFlashcards([]);
    setActivities([]);

    supabase.from('lessons').select('ai_summary, ai_summary_generated_at').eq('id', activeLesson.id).maybeSingle()
      .then(({ data }) => {
        setLessonSummary(data?.ai_summary ? { summary: data.ai_summary, generated_at: data.ai_summary_generated_at } : null);
      });

    supabase.from('flashcards').select('id, front, back').eq('lesson_id', activeLesson.id).order('order_index')
      .then(({ data }) => setFlashcards((data || []) as Array<{ id: string; front: string; back: string }>));

    supabase.from('lesson_activities').select('id, title, type, instructions, estimated_minutes').eq('lesson_id', activeLesson.id).order('order_index')
      .then(({ data }) => setActivities((data || []) as Array<{ id: string; title: string; type: string; instructions: string; estimated_minutes: number }>));
  }, [activeLesson?.id]);

  useEffect(() => {
    if (!activeLesson || !courseProgressRows.length) return;
    const row = courseProgressRows.find(p => p.lesson_id === activeLesson.id);
    if (row && row.last_position_seconds > 0 && videoRef.current) {
      videoRef.current.currentTime = row.last_position_seconds;
    }
    sessionStartTime.current = Date.now();
    lastSavedPosition.current = row?.last_position_seconds ?? 0;
  }, [activeLesson?.id]);

  const saveVideoProgress = useCallback(() => {
    if (!activeLesson || !courseId || !hasAccess) return;
    const video = videoRef.current;
    if (!video || video.duration === 0) return;
    const position = Math.floor(video.currentTime);
    const percent = Math.floor((video.currentTime / video.duration) * 100);
    const timeSpent = Math.floor((Date.now() - sessionStartTime.current) / 1000);
    const isCompleted = percent >= 90;
    updateProgressMutation.mutate({
      lessonId: activeLesson.id, courseId,
      lastPositionSeconds: position, timeSpentSeconds: timeSpent,
      progressPercent: percent, status: isCompleted ? 'completed' : 'in_progress',
      completedAt: isCompleted ? new Date().toISOString() : null,
    });
    lastSavedPosition.current = position;
  }, [activeLesson, courseId, hasAccess, updateProgressMutation]);

  useEffect(() => {
    if (!activeLesson || activeLesson.type !== 'video') return;
    progressSaveTimer.current = setInterval(saveVideoProgress, 15000);
    return () => { if (progressSaveTimer.current) clearInterval(progressSaveTimer.current); };
  }, [activeLesson?.id, saveVideoProgress]);

  const allRequired = sections.flatMap(s => s.lessons.filter(l => l.is_required));
  const completedRequired = allRequired.filter(l => completedLessons.has(l.id)).length;
  const progress = allRequired.length > 0 ? Math.round((completedRequired / allRequired.length) * 100) : 0;

  const allLessons = sections.flatMap(s => s.lessons);
  const currentIndex = allLessons.findIndex(l => l.id === activeLesson?.id);
  const prevLesson = currentIndex > 0 ? allLessons[currentIndex - 1] : null;
  const nextLesson = currentIndex < allLessons.length - 1 ? allLessons[currentIndex + 1] : null;

  const handleMarkComplete = async () => {
    if (!activeLesson || !profile || completedLessons.has(activeLesson.id) || !courseId) return;
    setMarking(true);
    updateProgressMutation.mutate({
      lessonId: activeLesson.id, courseId,
      lastPositionSeconds: videoRef.current ? Math.floor(videoRef.current.currentTime) : 0,
      timeSpentSeconds: Math.floor((Date.now() - sessionStartTime.current) / 1000),
      progressPercent: 100, status: 'completed', completedAt: new Date().toISOString(),
    });
    await supabase.from('lesson_progress').insert({ student_id: profile.id, lesson_id: activeLesson.id }).then(() => {});
    const newCompleted = new Set(completedLessons).add(activeLesson.id);
    setCompletedLessons(newCompleted);
    const newProgress = allRequired.length > 0 ? Math.round((newCompleted.size / allRequired.length) * 100) : 0;
    await supabase.from('enrollments').update({ progress_percent: newProgress }).eq('student_id', profile.id).eq('course_id', courseId);
    await supabase.from('course_enrollments').update({ progress_percent: newProgress, last_accessed_at: new Date().toISOString() }).eq('user_id', profile.id).eq('course_id', courseId);
    toast.success('Lesson marked as complete!');
    setMarking(false);
  };

  const goToLesson = (lesson: Lesson) => {
    if (!hasAccess && !lesson.is_preview) {
      sonnerToast.error('You need to enrol to access this lesson');
      return;
    }
    setActiveLesson(lesson);
    setSidebarOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (loading || accessLoading) {
    return (
      <DashboardLayout navItems={studentNavItems} title="Loading..." subtitle="">
        <div className="flex flex-col items-center justify-center h-64 gap-3">
          <div className="w-10 h-10 border-4 border-sky-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-400">Loading course...</p>
        </div>
      </DashboardLayout>
    );
  }

  if (!hasAccess && !(activeLesson?.is_preview)) {
    return (
      <DashboardLayout navItems={studentNavItems} title="Access Denied" subtitle="">
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-20 h-20 rounded-2xl bg-gray-100 dark:bg-navy-800 flex items-center justify-center mb-5">
            <Lock className="w-10 h-10 text-gray-300 dark:text-navy-600" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Not Enrolled</h3>
          <p className="text-gray-500 dark:text-gray-400 mb-6 max-w-sm">You need to enrol in this course to access the content.</p>
          <div className="flex gap-3">
            <Link to="/student/courses" className="btn-outline">Browse Courses</Link>
            {course && <Link to={`/courses/${courseId}`} className="btn-primary">View Course Details</Link>}
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // Course sidebar content
  const CourseSidebar = () => (
    <div className="flex flex-col h-full">
      {/* Course header */}
      <div className="p-4 bg-gray-50 dark:bg-navy-900/60 border-b border-gray-100 dark:border-navy-700 shrink-0">
        <div className="flex items-center gap-2 mb-3">
          <ListVideo className="w-4 h-4 text-sky-500 shrink-0" />
          <span className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">Course Content</span>
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
            <span>{completedRequired} / {allRequired.length} lessons</span>
            <span className="font-bold text-sky-600">{progress}%</span>
          </div>
          <div className="w-full h-1.5 bg-gray-200 dark:bg-navy-700 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-sky-500 to-blue-500 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
        </div>
        {progress === 100 && (
          <div className="mt-3 flex items-center gap-1.5 text-xs text-emerald-600 font-semibold">
            <Award className="w-3.5 h-3.5" /> Course complete!
          </div>
        )}
      </div>

      {/* Sections */}
      <div className="flex-1 overflow-y-auto">
        {sections.map((section, si) => {
          const isExpanded = expandedSections.has(section.id);
          const sectionCompleted = section.lessons.filter(l => completedLessons.has(l.id)).length;
          return (
            <div key={section.id} className="border-b border-gray-100 dark:border-navy-700/60 last:border-0">
              <button
                onClick={() => setExpandedSections(prev => {
                  const next = new Set(prev);
                  if (next.has(section.id)) next.delete(section.id);
                  else next.add(section.id);
                  return next;
                })}
                className="w-full flex items-center gap-3 px-4 py-3 bg-gray-50 dark:bg-navy-900/30 hover:bg-gray-100 dark:hover:bg-navy-800/50 transition-colors text-left"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide truncate">
                    Section {si + 1}: {section.title}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">{sectionCompleted}/{section.lessons.length} complete</p>
                </div>
                {isExpanded
                  ? <ChevronUp className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                  : <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0" />}
              </button>

              {isExpanded && (
                <div>
                  {section.lessons.map(lesson => {
                    const isCompleted = completedLessons.has(lesson.id);
                    const isActive = activeLesson?.id === lesson.id;
                    const canAccess = hasAccess || lesson.is_preview;
                    const progressRow = courseProgressRows.find(p => p.lesson_id === lesson.id);

                    return (
                      <button
                        key={lesson.id}
                        onClick={() => goToLesson(lesson)}
                        disabled={!canAccess}
                        className={`w-full flex items-start gap-3 px-4 py-3 text-left transition-all ${
                          isActive
                            ? 'bg-sky-50 dark:bg-sky-900/20 border-l-2 border-sky-500'
                            : canAccess
                              ? 'hover:bg-gray-50 dark:hover:bg-navy-700/40 border-l-2 border-transparent'
                              : 'opacity-40 cursor-not-allowed border-l-2 border-transparent'
                        }`}
                      >
                        {/* Status icon */}
                        <div className={`mt-0.5 shrink-0 w-5 h-5 rounded-full flex items-center justify-center ${
                          isCompleted
                            ? 'bg-emerald-500 text-white'
                            : isActive
                              ? 'border-2 border-sky-500 text-sky-500'
                              : canAccess
                                ? 'border-2 border-gray-200 dark:border-navy-600 text-gray-300'
                                : 'bg-gray-100 dark:bg-navy-700 text-gray-300'
                        }`}>
                          {isCompleted
                            ? <CheckCircle2 className="w-3 h-3" />
                            : !canAccess
                              ? <Lock className="w-2.5 h-2.5" />
                              : isActive
                                ? <Play className="w-2.5 h-2.5 ml-0.5" />
                                : <Circle className="w-2.5 h-2.5" />}
                        </div>

                        <div className="flex-1 min-w-0">
                          <p className={`text-xs font-medium leading-snug ${
                            isActive ? 'text-sky-700 dark:text-sky-400' : 'text-gray-700 dark:text-gray-300'
                          }`}>
                            {lesson.title}
                          </p>
                          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${TYPE_COLORS[lesson.type] || TYPE_COLORS.article}`}>
                              {TYPE_LABELS[lesson.type] || lesson.type}
                            </span>
                            {lesson.duration_minutes > 0 && (
                              <span className="flex items-center gap-0.5 text-xs text-gray-400">
                                <Clock className="w-2.5 h-2.5" />{lesson.duration_minutes}m
                              </span>
                            )}
                            {lesson.is_preview && !hasAccess && (
                              <span className="text-xs text-sky-600 font-semibold">Preview</span>
                            )}
                            {progressRow?.status === 'in_progress' && progressRow.progress_percent > 0 && (
                              <span className="text-xs text-amber-500 font-medium">{progressRow.progress_percent}%</span>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <DashboardLayout navItems={studentNavItems} title={course?.title || 'Course'} subtitle="">
      <div className="flex gap-0 -m-4 sm:-m-6 h-[calc(100vh-7rem)]">

        {/* Desktop sidebar */}
        <div className="hidden lg:flex flex-col w-72 border-r border-gray-200 dark:border-navy-700 bg-white dark:bg-navy-800 overflow-hidden shrink-0">
          <CourseSidebar />
        </div>

        {/* Mobile sidebar overlay */}
        {sidebarOpen && (
          <div className="lg:hidden fixed inset-0 z-50 flex">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
            <div className="relative z-10 w-72 bg-white dark:bg-navy-800 flex flex-col shadow-2xl">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-navy-700 shrink-0">
                <p className="font-bold text-sm text-gray-900 dark:text-white">Course Content</p>
                <button onClick={() => setSidebarOpen(false)} className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-white rounded-lg">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <CourseSidebar />
            </div>
          </div>
        )}

        {/* Main content area */}
        <div className="flex-1 overflow-y-auto min-w-0">
          <div className="max-w-4xl mx-auto p-4 sm:p-6">

            {/* Top bar */}
            <div className="flex items-center gap-3 mb-5">
              <button onClick={() => setSidebarOpen(true)}
                className="lg:hidden flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 bg-white dark:bg-navy-800 border border-gray-200 dark:border-navy-700 rounded-xl hover:bg-gray-50 dark:hover:bg-navy-700 transition-colors">
                <Menu className="w-4 h-4" /> Contents
              </button>
              <Link to="/student/courses"
                className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-sky-600 dark:hover:text-sky-400 transition-colors font-medium">
                <ChevronLeft className="w-4 h-4" /> Back to Courses
              </Link>
              {/* Progress pill - desktop */}
              <div className="hidden lg:flex ml-auto items-center gap-2 text-xs text-gray-500 dark:text-gray-400 bg-white dark:bg-navy-800 border border-gray-100 dark:border-navy-700 px-3 py-1.5 rounded-full">
                <div className="w-16 h-1.5 bg-gray-100 dark:bg-navy-700 rounded-full overflow-hidden">
                  <div className="h-full bg-sky-500 rounded-full" style={{ width: `${progress}%` }} />
                </div>
                <span className="font-semibold text-sky-600">{progress}%</span>
              </div>
            </div>

            {activeLesson ? (
              <div className="space-y-6">

                {/* Lesson header */}
                <div className="bg-white dark:bg-navy-800 rounded-2xl border border-gray-100 dark:border-navy-700 p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span className={`text-xs px-2 py-0.5 rounded-md font-semibold ${TYPE_COLORS[activeLesson.type] || TYPE_COLORS.article}`}>
                          {TYPE_LABELS[activeLesson.type] || activeLesson.type}
                        </span>
                        {activeLesson.duration_minutes > 0 && (
                          <span className="flex items-center gap-1 text-xs text-gray-400">
                            <Clock className="w-3 h-3" /> {activeLesson.duration_minutes} min
                          </span>
                        )}
                        {activeLesson.is_preview && !hasAccess && (
                          <span className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-2 py-0.5 rounded-md font-semibold">
                            Preview
                          </span>
                        )}
                      </div>
                      <h1 className="text-xl font-bold text-gray-900 dark:text-white leading-snug">
                        {activeLesson.title}
                      </h1>
                      {course && (
                        <p className="text-xs text-gray-400 mt-1">{course.title}</p>
                      )}
                    </div>
                    <div className="shrink-0 flex items-center gap-2">
                      {hasAccess && completedLessons.has(activeLesson.id) ? (
                        <div className="flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400 font-semibold bg-emerald-50 dark:bg-emerald-900/20 px-3 py-1.5 rounded-xl">
                          <CheckCircle2 className="w-4 h-4" /> Completed
                        </div>
                      ) : hasAccess ? (
                        <button onClick={handleMarkComplete} disabled={marking}
                          className="flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-sm font-bold rounded-xl transition-colors disabled:opacity-60 shadow-sm">
                          <CheckCircle2 className="w-4 h-4" />
                          {marking ? 'Saving…' : 'Mark Complete'}
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>

                {/* AI Quick Summary */}
                {lessonSummary && (
                  <div className="rounded-2xl overflow-hidden border border-sky-200 dark:border-sky-800/50 shadow-sm">
                    <button onClick={() => setSummaryOpen(o => !o)}
                      className="w-full flex items-center gap-3 px-4 py-3.5 bg-gradient-to-r from-sky-50 to-blue-50 dark:from-sky-900/20 dark:to-blue-900/20 hover:from-sky-100 hover:to-blue-100 dark:hover:from-sky-900/30 transition-colors text-left">
                      <div className="w-7 h-7 rounded-lg bg-sky-500 flex items-center justify-center shrink-0">
                        <Sparkles className="w-3.5 h-3.5 text-white" />
                      </div>
                      <span className="text-sm font-bold text-sky-800 dark:text-sky-300 flex-1">AI Summary</span>
                      {summaryOpen ? <ChevronUp className="w-4 h-4 text-sky-400" /> : <ChevronDown className="w-4 h-4 text-sky-400" />}
                    </button>
                    {summaryOpen && (
                      <div className="p-5 bg-white dark:bg-navy-800">
                        <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{lessonSummary.summary}</p>
                        {lessonSummary.generated_at && (
                          <p className="text-xs text-slate-400 mt-3">
                            Generated {new Date(lessonSummary.generated_at).toLocaleDateString('en-AU', { dateStyle: 'medium' })}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Flashcards CTA */}
                {flashcards.length > 0 && (
                  <button onClick={() => setShowFlashcards(true)}
                    className="flex items-center gap-3 w-full px-4 py-3.5 bg-white dark:bg-navy-800 border border-amber-200 dark:border-amber-800/50 hover:bg-amber-50 dark:hover:bg-amber-900/10 rounded-2xl transition-colors text-left shadow-sm group">
                    <div className="w-8 h-8 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
                      <BookMarked className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-bold text-gray-800 dark:text-white">Study Flashcards</p>
                      <p className="text-xs text-gray-400">{flashcards.length} cards for this lesson</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-amber-500 transition-colors" />
                  </button>
                )}

                {/* Lesson content */}
                {activeLesson.type === 'video' && activeLesson.url && (() => {
                  const url = activeLesson.url;
                  const ytMatch = url.match(/(?:v=|youtu\.be\/)([^&?\s]+)/);
                  const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
                  if (ytMatch) {
                    const thumbnail = `https://img.youtube.com/vi/${ytMatch[1]}/hqdefault.jpg`;
                    return (
                      <a href={url} target="_blank" rel="noopener noreferrer"
                        className="block rounded-2xl overflow-hidden bg-black relative aspect-video group cursor-pointer shadow-lg">
                        <img src={thumbnail} alt="Video thumbnail" className="w-full h-full object-cover opacity-75 group-hover:opacity-60 transition-opacity duration-300" />
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                          <div className="w-16 h-16 bg-red-600 group-hover:bg-red-700 rounded-full flex items-center justify-center shadow-2xl transition-all group-hover:scale-110">
                            <svg className="w-7 h-7 text-white ml-1" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                          </div>
                          <span className="text-white text-sm font-bold bg-black/50 px-4 py-1.5 rounded-full backdrop-blur-sm">Watch on YouTube</span>
                        </div>
                      </a>
                    );
                  }
                  if (vimeoMatch) {
                    return (
                      <a href={url} target="_blank" rel="noopener noreferrer"
                        className="flex flex-col items-center justify-center gap-3 rounded-2xl bg-gray-900 aspect-video group cursor-pointer hover:bg-gray-800 transition-colors shadow-lg">
                        <div className="w-16 h-16 bg-blue-500 group-hover:bg-blue-600 rounded-full flex items-center justify-center shadow-2xl transition-all group-hover:scale-110">
                          <svg className="w-7 h-7 text-white ml-1" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                        </div>
                        <span className="text-white text-sm font-bold">Watch on Vimeo</span>
                      </a>
                    );
                  }
                  return (
                    <div className="rounded-2xl overflow-hidden bg-black shadow-lg">
                      <video ref={videoRef} src={url} controls className="w-full aspect-video"
                        onTimeUpdate={() => {
                          const video = videoRef.current;
                          if (!video || !hasAccess) return;
                          const percent = Math.floor((video.currentTime / video.duration) * 100);
                          if (percent >= 90 && activeLesson && !completedLessons.has(activeLesson.id) && courseId) {
                            updateProgressMutation.mutate({
                              lessonId: activeLesson.id, courseId,
                              lastPositionSeconds: Math.floor(video.currentTime),
                              timeSpentSeconds: Math.floor((Date.now() - sessionStartTime.current) / 1000),
                              progressPercent: 100, status: 'completed', completedAt: new Date().toISOString(),
                            });
                            const newCompleted = new Set(completedLessons).add(activeLesson.id);
                            setCompletedLessons(newCompleted);
                            sonnerToast.success('Lesson completed!');
                          }
                        }}
                      />
                    </div>
                  );
                })()}

                {activeLesson.type === 'video' && !activeLesson.url && (
                  <div className="rounded-2xl bg-gray-900 flex items-center justify-center aspect-video shadow-lg">
                    <div className="text-center text-gray-500">
                      <Play className="w-12 h-12 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">Video not available</p>
                    </div>
                  </div>
                )}

                {(activeLesson.type === 'article' || activeLesson.type === 'text') && (
                  activeLesson.content
                    ? <div className="prose dark:prose-invert prose-sm max-w-none bg-white dark:bg-navy-800 rounded-2xl p-7 border border-gray-100 dark:border-navy-700 shadow-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: activeLesson.content }} />
                    : <div className="bg-white dark:bg-navy-800 rounded-2xl p-7 border border-gray-100 dark:border-navy-700 shadow-sm">
                        <div className="flex flex-col items-center py-8 text-center">
                          <BookOpen className="w-10 h-10 text-gray-200 dark:text-navy-600 mb-3" />
                          <p className="text-gray-500 dark:text-gray-400 text-sm">No content available for this lesson yet.</p>
                        </div>
                      </div>
                )}

                {activeLesson.type === 'link' && activeLesson.url && (
                  <div className="bg-white dark:bg-navy-800 rounded-2xl p-6 border border-teal-100 dark:border-teal-800/50 shadow-sm">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-xl bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center">
                        <LinkIcon className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-gray-800 dark:text-white">External Resource</p>
                        <p className="text-xs text-gray-400 truncate max-w-xs">{activeLesson.url}</p>
                      </div>
                    </div>
                    <a href={activeLesson.url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-2 px-4 py-2.5 bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold rounded-xl transition-colors w-fit">
                      <LinkIcon className="w-4 h-4" /> Open Resource
                    </a>
                  </div>
                )}

                {activeLesson.type === 'pdf' && activeLesson.url && (
                  <div className="bg-white dark:bg-navy-800 rounded-2xl border border-orange-100 dark:border-orange-800/40 shadow-sm overflow-hidden">
                    <div className="flex items-center justify-between px-5 py-3.5 border-b border-orange-100 dark:border-orange-800/40 bg-orange-50/50 dark:bg-orange-900/10">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-orange-500" />
                        <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 truncate max-w-xs">
                          {activeLesson.url.split('/').pop()?.split('?')[0] || 'Document'}
                        </span>
                      </div>
                      <a href={activeLesson.url} target="_blank" rel="noopener noreferrer"
                        className="text-xs font-bold text-orange-600 hover:text-orange-700 dark:text-orange-400 flex items-center gap-1">
                        <LinkIcon className="w-3.5 h-3.5" /> Open
                      </a>
                    </div>
                    <a href={activeLesson.url} target="_blank" rel="noopener noreferrer"
                      className="flex flex-col items-center justify-center gap-4 py-14 px-6 hover:bg-orange-50/50 dark:hover:bg-orange-900/10 transition-colors group">
                      <div className="w-20 h-24 bg-orange-50 dark:bg-orange-900/20 border-2 border-orange-200 dark:border-orange-800 rounded-xl flex flex-col items-center justify-center gap-1.5 group-hover:border-orange-400 transition-colors shadow-sm">
                        <FileText className="w-8 h-8 text-orange-500" />
                        <span className="text-xs font-bold text-orange-600 uppercase tracking-wider">PDF</span>
                      </div>
                      <div className="text-center">
                        <p className="font-semibold text-gray-800 dark:text-white text-sm">{activeLesson.title}</p>
                        <p className="text-xs text-gray-400 mt-1">Click to open in a new tab</p>
                      </div>
                    </a>
                  </div>
                )}

                {/* Notes & Slides */}
                {courseId && (
                  <Suspense fallback={<div className="h-24 rounded-2xl bg-gray-50 dark:bg-navy-800 animate-pulse" />}>
                    <LessonDocumentViewer lessonId={activeLesson.id} courseId={courseId} />
                  </Suspense>
                )}

                {/* AI Learning Tools */}
                {hasAccess && (
                  <div className="bg-white dark:bg-navy-800 rounded-2xl border border-gray-100 dark:border-navy-700 shadow-sm overflow-hidden">
                    <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-navy-700 bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-900/10 dark:to-yellow-900/10">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-amber-500 flex items-center justify-center">
                          <Sparkles className="w-3.5 h-3.5 text-white" />
                        </div>
                        <span className="text-sm font-bold text-gray-800 dark:text-white">AI Learning Tools</span>
                      </div>
                      <Link to="/student/ai-plans"
                        className={`flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-lg transition-colors ${
                          (tokenBalance ?? 0) < 4
                            ? 'bg-red-100 text-red-600 dark:bg-red-900/20 dark:text-red-400 hover:bg-red-200'
                            : 'bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 hover:bg-amber-200'
                        }`}>
                        <Zap className="w-3 h-3" />
                        {tokenBalance ?? 0} tokens
                        {(tokenBalance ?? 0) < 4 && <span className="text-red-500">· Top up</span>}
                      </Link>
                    </div>
                    <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      {[
                        { task: 'summarize_lesson', label: 'Summarise Lesson', cost: 3, icon: BookOpen, color: 'text-sky-500', hover: 'hover:border-sky-300 hover:bg-sky-50 dark:hover:bg-sky-900/10' },
                        { task: 'flashcards', label: 'Generate Flashcards', cost: 4, icon: Brain, color: 'text-amber-500', hover: 'hover:border-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/10' },
                        { task: 'activity_ideas', label: 'Practice Activities', cost: 4, icon: Zap, color: 'text-teal-500', hover: 'hover:border-teal-300 hover:bg-teal-50 dark:hover:bg-teal-900/10' },
                      ].map(({ task, label, cost, icon: Icon, color, hover }) => (
                        <button key={task}
                          onClick={() => generateStudentAI(task)}
                          disabled={!!generatingAI || (tokenBalance ?? 0) < cost}
                          className={`flex items-center gap-3 p-3.5 rounded-xl border border-gray-200 dark:border-navy-600 bg-white dark:bg-navy-700/50 ${hover} disabled:opacity-40 disabled:cursor-not-allowed transition-all text-left`}>
                          <div className={`shrink-0 ${color}`}>
                            {generatingAI === task
                              ? <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                              : <Icon className="w-4 h-4" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-gray-800 dark:text-white leading-tight">{label}</p>
                            <p className="text-xs text-gray-400 mt-0.5">{cost} tokens</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Lesson navigation */}
                <div className="flex items-center justify-between gap-4">
                  {prevLesson ? (
                    <button onClick={() => goToLesson(prevLesson)}
                      className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-navy-800 border border-gray-200 dark:border-navy-700 text-gray-700 dark:text-gray-300 text-sm font-semibold rounded-xl hover:bg-gray-50 dark:hover:bg-navy-700 transition-colors shadow-sm">
                      <ChevronLeft className="w-4 h-4" />
                      <span className="hidden sm:inline truncate max-w-32">Previous</span>
                    </button>
                  ) : <div />}
                  <div className="text-xs text-gray-400 font-medium">
                    {currentIndex + 1} / {allLessons.length}
                  </div>
                  {nextLesson ? (
                    <button onClick={() => goToLesson(nextLesson)}
                      className="flex items-center gap-2 px-4 py-2.5 bg-sky-600 hover:bg-sky-700 text-white text-sm font-bold rounded-xl transition-colors shadow-sm">
                      <span className="hidden sm:inline truncate max-w-32">Next Lesson</span>
                      <span className="sm:hidden">Next</span>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  ) : (
                    progress === 100 ? (
                      <Link to="/student/certificates"
                        className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl transition-colors shadow-sm">
                        <Award className="w-4 h-4" /> View Certificate
                      </Link>
                    ) : (
                      <div className="flex items-center gap-2 px-4 py-2.5 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 text-sm font-bold rounded-xl border border-emerald-200 dark:border-emerald-800">
                        <CheckCircle2 className="w-4 h-4" /> Last Lesson
                      </div>
                    )
                  )}
                </div>

                {/* Activities */}
                {activities.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <ClipboardList className="w-4 h-4 text-teal-600" />
                      <h3 className="text-sm font-bold text-gray-800 dark:text-white">Practice Activities</h3>
                      <span className="text-xs bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400 px-2 py-0.5 rounded-full font-semibold">{activities.length}</span>
                    </div>
                    <div className="space-y-3">
                      {activities.map(activity => {
                        const typeColors: Record<string, string> = {
                          practice: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800',
                          reflection: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800',
                          discussion: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800',
                          project: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-900/20 dark:text-sky-300 dark:border-sky-800',
                          research: 'bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
                        };
                        return (
                          <div key={activity.id} className={`rounded-2xl border p-4 ${typeColors[activity.type] || typeColors.practice}`}>
                            <div className="flex items-start justify-between gap-3 mb-2">
                              <h4 className="text-sm font-bold leading-snug">{activity.title}</h4>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="text-xs font-semibold capitalize px-2 py-0.5 rounded-lg bg-white/60 dark:bg-black/20">{activity.type}</span>
                                {activity.estimated_minutes > 0 && (
                                  <span className="flex items-center gap-1 text-xs opacity-75 font-medium">
                                    <Clock className="w-3 h-3" />{activity.estimated_minutes}m
                                  </span>
                                )}
                              </div>
                            </div>
                            {activity.instructions && (
                              <p className="text-sm leading-relaxed opacity-90">{activity.instructions}</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <div className="w-20 h-20 rounded-2xl bg-gray-100 dark:bg-navy-800 flex items-center justify-center mb-4">
                  <BookOpen className="w-10 h-10 text-gray-300 dark:text-navy-600" />
                </div>
                <p className="text-gray-500 dark:text-gray-400 font-medium">Select a lesson to begin</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {showFlashcards && flashcards.length > 0 && (
        <Suspense fallback={null}>
          <FlashcardStudyModal cards={flashcards} onClose={() => setShowFlashcards(false)} />
        </Suspense>
      )}
    </DashboardLayout>
  );
}
