import { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ChevronLeft, CheckCircle2, Circle, Play, FileText,
  Link as LinkIcon, BookOpen, Lock, Menu, X, ChevronDown, ChevronUp,
  BookMarked, Sparkles, ClipboardList, Clock, Brain, Zap,
  ChevronRight, ListVideo, Award, AlignLeft, HelpCircle, ExternalLink,
  Trophy,
} from 'lucide-react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { studentNavItems } from './studentNav';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useHasCourseAccess } from '../../hooks/useAccess';
import { useCourseProgress, useUpdateLessonProgress } from '../../hooks/useProgress';
import { toast as sonnerToast } from 'sonner';
import type { Course, Section, Lesson, Quiz, QuizAttempt } from '../../types';

const FlashcardStudyModal = lazy(() => import('../../components/ai/FlashcardStudyModal'));
const LessonDocumentViewer = lazy(() => import('../../components/ui/LessonDocumentViewer').then(m => ({ default: m.default })));

interface SectionWithLessons extends Section {
  lessons: Lesson[];
}

interface Activity {
  id: string;
  title: string;
  type: string;
  instructions: string;
  estimated_minutes: number;
}

interface QuizWithAttempt extends Quiz {
  bestAttempt: QuizAttempt | null;
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

type TabId = 'lesson' | 'materials' | 'activities' | 'ai-tools';

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
  const [activities, setActivities] = useState<Activity[]>([]);
  const [quizzes, setQuizzes] = useState<QuizWithAttempt[]>([]);
  const [tokenBalance, setTokenBalance] = useState<number | null>(null);
  const [generatingAI, setGeneratingAI] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<TabId>('lesson');

  const { hasAccess, isLoading: accessLoading } = useHasCourseAccess(courseId);
  const { data: courseProgressRows = [] } = useCourseProgress(courseId);
  const updateProgressMutation = useUpdateLessonProgress();

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const progressSaveTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionStartTime = useRef<number>(Date.now());

  useEffect(() => {
    const completed = new Set(
      courseProgressRows.filter(p => p.status === 'completed').map(p => p.lesson_id)
    );
    setCompletedLessons(completed);
    // If all required lessons are already complete, try to issue a certificate in case it was missed
    if (courseId && profile && courseProgressRows.length > 0) {
      const reqLessons = sections.flatMap(s => s.lessons.filter(l => l.is_required));
      if (reqLessons.length > 0 && reqLessons.every(l => completed.has(l.id))) {
        maybeIssueCertificate(courseId);
      }
    }
  }, [courseProgressRows]);

  useEffect(() => {
    if (!courseId || !profile) return;
    const fetchData = async () => {
      const [courseRes, sectionsRes, quizRes, attemptRes] = await Promise.all([
        supabase.from('courses').select('*, teacher:profiles(full_name, avatar_url)').eq('id', courseId).maybeSingle(),
        supabase.from('sections').select('*, lessons(*)').eq('course_id', courseId).order('order_index'),
        supabase.from('quizzes').select('*').eq('course_id', courseId).order('created_at'),
        supabase.from('quiz_attempts').select('*').eq('student_id', profile.id),
      ]);

      if (courseRes.data) setCourse(courseRes.data as Course);

      if (sectionsRes.data) {
        const secs = sectionsRes.data.map(s => ({
          ...s,
          lessons: [...(s.lessons || [])].sort((a, b) => a.order_index - b.order_index),
        })) as SectionWithLessons[];
        setSections(secs);

        // Resume from last accessed lesson via lesson_progress, fall back to first lesson
        const allLessonsFlat = secs.flatMap(s => s.lessons);
        let resumeLesson = allLessonsFlat[0];
        try {
          const { data: progressRows } = await supabase
            .from('lesson_progress')
            .select('lesson_id, updated_at, status')
            .eq('student_id', profile.id)
            .eq('course_id', courseId)
            .order('updated_at', { ascending: false })
            .limit(1);
          if (progressRows && progressRows.length > 0) {
            const lastLessonId = progressRows[0].lesson_id;
            const lastStatus = progressRows[0].status;
            const found = allLessonsFlat.find(l => l.id === lastLessonId);
            if (found) {
              if (lastStatus === 'completed') {
                const idx = allLessonsFlat.findIndex(l => l.id === lastLessonId);
                resumeLesson = allLessonsFlat[idx + 1] ?? found;
              } else {
                resumeLesson = found;
              }
            }
          }
        } catch { /* fall back to first lesson */ }

        setActiveLesson(resumeLesson);
        const owningSection = secs.find(s => s.lessons.some(l => l.id === resumeLesson?.id));
        if (owningSection) setExpandedSections(new Set([owningSection.id]));
      }

      if (quizRes.data) {
        const attempts = (attemptRes.data || []) as QuizAttempt[];
        const quizzesWithAttempts: QuizWithAttempt[] = (quizRes.data as Quiz[]).map(q => {
          const qAttempts = attempts.filter(a => a.quiz_id === q.id);
          const best = qAttempts.sort((a, b) => b.score - a.score)[0] || null;
          return { ...q, bestAttempt: best };
        });
        setQuizzes(quizzesWithAttempts);
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
        setActivities((data || []) as Activity[]);
        sonnerToast.success('Activities generated!');
        setActiveTab('activities');
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
    setActiveTab('lesson');

    supabase.from('lessons').select('ai_summary, ai_summary_generated_at').eq('id', activeLesson.id).maybeSingle()
      .then(({ data }) => setLessonSummary(data?.ai_summary ? { summary: data.ai_summary, generated_at: data.ai_summary_generated_at } : null));

    supabase.from('flashcards').select('id, front, back').eq('lesson_id', activeLesson.id).order('order_index')
      .then(({ data }) => setFlashcards((data || []) as Array<{ id: string; front: string; back: string }>));

    supabase.from('lesson_activities').select('id, title, type, instructions, estimated_minutes').eq('lesson_id', activeLesson.id).order('order_index')
      .then(({ data }) => setActivities((data || []) as Activity[]));
  }, [activeLesson?.id]);

  useEffect(() => {
    if (!activeLesson || !courseProgressRows.length) return;
    const row = courseProgressRows.find(p => p.lesson_id === activeLesson.id);
    if (row && row.last_position_seconds > 0 && videoRef.current) {
      videoRef.current.currentTime = row.last_position_seconds;
    }
    sessionStartTime.current = Date.now();
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

  // Returns the quiz for a section (if any)
  const getQuizForSection = (sectionId: string) =>
    quizzes.find(q => q.section_id === sectionId) ?? null;

  // A section is "quiz-passed" if it has no quiz, or its quiz has been passed
  const isSectionQuizPassed = (sectionId: string) => {
    const q = getQuizForSection(sectionId);
    if (!q) return true;
    return q.bestAttempt?.passed === true;
  };

  // A section is locked if any earlier section has an unpassed quiz
  const isSectionLocked = (sectionIndex: number) => {
    for (let i = 0; i < sectionIndex; i++) {
      if (!isSectionQuizPassed(sections[i].id)) return true;
    }
    return false;
  };

  // Is the active lesson the last lesson of its section, and that section has an unpassed quiz?
  const activeSectionIndex = sections.findIndex(s => s.lessons.some(l => l.id === activeLesson?.id));
  const activeSectionQuiz = activeSectionIndex >= 0 ? getQuizForSection(sections[activeSectionIndex].id) : null;
  const activeSectionAllLessonsComplete =
    activeSectionIndex >= 0 &&
    sections[activeSectionIndex].lessons.every(l => completedLessons.has(l.id));
  const isLastLessonInSection =
    activeSectionIndex >= 0 &&
    activeLesson?.id === sections[activeSectionIndex].lessons[sections[activeSectionIndex].lessons.length - 1]?.id;
  // Block "Next" if section is finished but quiz not yet passed
  const mustTakeSectionQuiz =
    isLastLessonInSection &&
    activeSectionAllLessonsComplete &&
    activeSectionQuiz !== null &&
    activeSectionQuiz.bestAttempt?.passed !== true;

  // Issues a certificate if the course has no blocking conditions (no required quizzes unpassed, no ungraded exams)
  const maybeIssueCertificate = async (cId: string) => {
    if (!profile) return;

    // Already have one?
    const { data: existing } = await supabase.from('certificates').select('id').eq('student_id', profile.id).eq('course_id', cId).maybeSingle();
    if (existing) return;

    // All required quizzes passed?
    const { data: allQuizzes } = await supabase.from('quizzes').select('id, is_required').eq('course_id', cId);
    const requiredQuizIds = (allQuizzes || []).filter(q => q.is_required).map(q => q.id);
    if (requiredQuizIds.length > 0) {
      const { data: passedAttempts } = await supabase.from('quiz_attempts')
        .select('quiz_id').eq('student_id', profile.id).eq('passed', true).in('quiz_id', requiredQuizIds);
      const passedIds = new Set((passedAttempts || []).map(a => a.quiz_id));
      if (!requiredQuizIds.every(id => passedIds.has(id))) return;
    }

    // All published exams graded/finalised?
    const { data: allExams } = await supabase.from('exams').select('id').eq('course_id', cId).eq('is_published', true);
    const examIds = (allExams || []).map(e => e.id);
    if (examIds.length > 0) {
      const { data: examSubs } = await supabase.from('exam_submissions')
        .select('exam_id, status').eq('student_id', profile.id).in('exam_id', examIds);
      const gradedIds = new Set((examSubs || []).filter(s => s.status === 'finalised' || s.status === 'graded').map(s => s.exam_id));
      if (!examIds.every(id => gradedIds.has(id))) return;
    }

    await supabase.from('certificates').insert({ student_id: profile.id, course_id: cId });
    sonnerToast.success('Certificate issued! Check your certificates page.', { duration: 5000 });
  };

  const handleMarkComplete = async () => {
    if (!activeLesson || !profile || completedLessons.has(activeLesson.id) || !courseId) return;
    setMarking(true);
    updateProgressMutation.mutate({
      lessonId: activeLesson.id, courseId,
      lastPositionSeconds: videoRef.current ? Math.floor(videoRef.current.currentTime) : 0,
      timeSpentSeconds: Math.floor((Date.now() - sessionStartTime.current) / 1000),
      progressPercent: 100, status: 'completed', completedAt: new Date().toISOString(),
    });
    const newCompleted = new Set(completedLessons).add(activeLesson.id);
    setCompletedLessons(newCompleted);
    const newProgress = allRequired.length > 0 ? Math.round((newCompleted.size / allRequired.length) * 100) : 0;
    await Promise.all([
      supabase.from('enrollments').update({ progress_percent: newProgress }).eq('student_id', profile.id).eq('course_id', courseId),
      supabase.from('course_enrollments').update({ progress_percent: newProgress, last_accessed_at: new Date().toISOString() }).eq('user_id', profile.id).eq('course_id', courseId),
    ]);

    if (newProgress === 100) await maybeIssueCertificate(courseId);

    toast.success('Lesson marked as complete!');
    setMarking(false);
  };

  const goToLesson = (lesson: Lesson, bypassGate = false) => {
    if (!hasAccess && !lesson.is_preview) {
      sonnerToast.error('You need to enrol to access this lesson');
      return;
    }
    if (!bypassGate && hasAccess) {
      const targetSectionIndex = sections.findIndex(s => s.lessons.some(l => l.id === lesson.id));
      if (targetSectionIndex > 0 && isSectionLocked(targetSectionIndex)) {
        const blockingSection = sections.slice(0, targetSectionIndex).findLast(s => !isSectionQuizPassed(s.id));
        if (blockingSection) {
          sonnerToast.error(`Complete the "${blockingSection.title}" quiz first to unlock this section`);
        }
        return;
      }
    }
    setActiveLesson(lesson);
    setSidebarOpen(false);
    const owningSection = sections.find(s => s.lessons.some(l => l.id === lesson.id));
    if (owningSection) setExpandedSections(prev => new Set([...prev, owningSection.id]));
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

  const CourseSidebar = () => (
    <div className="flex flex-col h-full">
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

      <div className="flex-1 overflow-y-auto">
        {sections.map((section, si) => {
          const isExpanded = expandedSections.has(section.id);
          const sectionCompleted = section.lessons.filter(l => completedLessons.has(l.id)).length;
          const hasActiveLesson = section.lessons.some(l => l.id === activeLesson?.id);
          const sectionLocked = hasAccess && isSectionLocked(si);
          const sectionQuiz = getQuizForSection(section.id);
          const quizPassed = isSectionQuizPassed(section.id);
          const allLessonsInSectionDone = section.lessons.every(l => completedLessons.has(l.id));
          const showQuizRequired = !sectionLocked && sectionQuiz && !quizPassed && allLessonsInSectionDone;

          return (
            <div key={section.id} className="border-b border-gray-100 dark:border-navy-700/60 last:border-0">
              <button
                onClick={() => !sectionLocked && setExpandedSections(prev => {
                  const next = new Set(prev);
                  if (next.has(section.id)) next.delete(section.id);
                  else next.add(section.id);
                  return next;
                })}
                className={`w-full flex items-center gap-3 px-4 py-3 transition-colors text-left ${
                  sectionLocked
                    ? 'opacity-50 cursor-not-allowed bg-gray-50 dark:bg-navy-900/30'
                    : hasActiveLesson
                      ? 'bg-sky-50 dark:bg-sky-900/10 hover:bg-sky-100 dark:hover:bg-sky-900/20'
                      : 'bg-gray-50 dark:bg-navy-900/30 hover:bg-gray-100 dark:hover:bg-navy-800/50'
                }`}
              >
                {sectionLocked && <Lock className="w-3.5 h-3.5 text-gray-400 shrink-0" />}
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-bold uppercase tracking-wide truncate ${
                    sectionLocked ? 'text-gray-400 dark:text-gray-500'
                      : hasActiveLesson ? 'text-sky-700 dark:text-sky-400'
                      : 'text-gray-700 dark:text-gray-300'
                  }`}>
                    Week {si + 1}: {section.title}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {sectionLocked
                      ? 'Locked — complete previous quiz'
                      : `${sectionCompleted}/${section.lessons.length} complete`}
                  </p>
                </div>
                {!sectionLocked && (isExpanded
                  ? <ChevronUp className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                  : <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0" />)}
              </button>

              {/* Quiz required banner inside sidebar */}
              {!sectionLocked && isExpanded && showQuizRequired && (
                <div className="mx-3 mb-2 mt-1 flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                  <HelpCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                  <p className="text-xs text-amber-700 dark:text-amber-300 font-semibold flex-1">Quiz required to continue</p>
                </div>
              )}

              {!sectionLocked && isExpanded && (
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
                        <div className={`mt-0.5 shrink-0 w-5 h-5 rounded-full flex items-center justify-center ${
                          isCompleted ? 'bg-emerald-500 text-white'
                            : isActive ? 'border-2 border-sky-500 text-sky-500'
                            : canAccess ? 'border-2 border-gray-200 dark:border-navy-600 text-gray-300'
                            : 'bg-gray-100 dark:bg-navy-700 text-gray-300'
                        }`}>
                          {isCompleted ? <CheckCircle2 className="w-3 h-3" />
                            : !canAccess ? <Lock className="w-2.5 h-2.5" />
                            : isActive ? <Play className="w-2.5 h-2.5 ml-0.5" />
                            : <Circle className="w-2.5 h-2.5" />}
                        </div>

                        <div className="flex-1 min-w-0">
                          <p className={`text-xs font-medium leading-snug ${isActive ? 'text-sky-700 dark:text-sky-400' : 'text-gray-700 dark:text-gray-300'}`}>
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

  const tabs: { id: TabId; label: string; icon: typeof BookOpen; count?: number }[] = [
    { id: 'lesson', label: 'Lesson', icon: BookOpen },
    { id: 'materials', label: 'Notes & Slides', icon: AlignLeft },
    { id: 'activities', label: 'Activities', icon: ClipboardList, count: activities.length + quizzes.length },
    { id: 'ai-tools', label: 'AI Tools', icon: Sparkles },
  ];

  const activityTypeColors: Record<string, string> = {
    practice: 'border-blue-200 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-800',
    reflection: 'border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800',
    discussion: 'border-emerald-200 bg-emerald-50 dark:bg-emerald-900/20 dark:border-emerald-800',
    project: 'border-sky-200 bg-sky-50 dark:bg-sky-900/20 dark:border-sky-800',
    research: 'border-slate-200 bg-slate-50 dark:bg-slate-800 dark:border-slate-700',
  };
  const activityTypeText: Record<string, string> = {
    practice: 'text-blue-700 dark:text-blue-300',
    reflection: 'text-amber-700 dark:text-amber-300',
    discussion: 'text-emerald-700 dark:text-emerald-300',
    project: 'text-sky-700 dark:text-sky-300',
    research: 'text-slate-700 dark:text-slate-300',
  };

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

        {/* Main content */}
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
              <div className="hidden lg:flex ml-auto items-center gap-2 text-xs text-gray-500 dark:text-gray-400 bg-white dark:bg-navy-800 border border-gray-100 dark:border-navy-700 px-3 py-1.5 rounded-full">
                <div className="w-16 h-1.5 bg-gray-100 dark:bg-navy-700 rounded-full overflow-hidden">
                  <div className="h-full bg-sky-500 rounded-full" style={{ width: `${progress}%` }} />
                </div>
                <span className="font-semibold text-sky-600">{progress}%</span>
              </div>
            </div>

            {activeLesson ? (
              <div className="space-y-4">

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
                          <span className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-2 py-0.5 rounded-md font-semibold">Preview</span>
                        )}
                      </div>
                      <h1 className="text-xl font-bold text-gray-900 dark:text-white leading-snug">
                        {activeLesson.title}
                      </h1>
                      {course && <p className="text-xs text-gray-400 mt-1">{course.title}</p>}
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

                {/* Tab bar */}
                <div className="flex items-center bg-gray-100 dark:bg-navy-800 p-1 rounded-xl border border-gray-200 dark:border-navy-700 gap-1">
                  {tabs.map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex items-center gap-1.5 flex-1 justify-center px-3 py-2.5 text-xs sm:text-sm font-semibold rounded-lg transition-all ${
                        activeTab === tab.id
                          ? 'bg-white dark:bg-navy-700 text-gray-900 dark:text-white shadow-sm'
                          : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                      }`}
                    >
                      <tab.icon className="w-3.5 h-3.5 shrink-0" />
                      <span className="hidden sm:inline truncate">{tab.label}</span>
                      {tab.count !== undefined && tab.count > 0 && (
                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full leading-none ${
                          activeTab === tab.id ? 'bg-sky-100 text-sky-700' : 'bg-gray-200 dark:bg-navy-600 text-gray-600 dark:text-gray-400'
                        }`}>{tab.count}</span>
                      )}
                    </button>
                  ))}
                </div>

                {/* ── Tab: Lesson ── */}
                {activeTab === 'lesson' && (
                  <div className="space-y-5">

                    {/* AI Summary */}
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
                          </div>
                        )}
                      </div>
                    )}

                    {/* Flashcards quick-access */}
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

                    {/* Video content */}
                    {activeLesson.type === 'video' && activeLesson.url && (() => {
                      const url = activeLesson.url;
                      const ytMatch = url.match(/(?:v=|youtu\.be\/)([^&?\s]+)/);
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
                                setCompletedLessons(prev => {
                                  const next = new Set([...prev, activeLesson.id]);
                                  const newProg = allRequired.length > 0 ? Math.round((next.size / allRequired.length) * 100) : 0;
                                  if (newProg === 100) maybeIssueCertificate(courseId);
                                  return next;
                                });
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

                    {/* Text / Article content — rich reading experience */}
                    {(activeLesson.type === 'article' || activeLesson.type === 'text') && (
                      <div className="bg-white dark:bg-navy-800 rounded-2xl border border-gray-100 dark:border-navy-700 shadow-sm overflow-hidden">
                        {activeLesson.content ? (
                          <>
                            {/* Reading header */}
                            <div className="px-8 pt-8 pb-4 border-b border-gray-50 dark:border-navy-700">
                              <div className="flex items-center gap-2 mb-1">
                                <FileText className="w-4 h-4 text-blue-400" />
                                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Reading</span>
                              </div>
                              <h2 className="text-lg font-bold text-gray-900 dark:text-white">{activeLesson.title}</h2>
                              {activeLesson.duration_minutes > 0 && (
                                <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                                  <Clock className="w-3 h-3" /> Estimated {activeLesson.duration_minutes} min read
                                </p>
                              )}
                            </div>
                            {/* Content */}
                            <div className="lesson-text-content px-8 py-8"
                              dangerouslySetInnerHTML={{ __html: activeLesson.content }} />
                          </>
                        ) : (
                          <div className="flex flex-col items-center py-16 px-8 text-center">
                            <BookOpen className="w-10 h-10 text-gray-200 dark:text-navy-600 mb-3" />
                            <p className="text-gray-500 dark:text-gray-400 text-sm">No content available for this lesson yet.</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Link content */}
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
                          <ExternalLink className="w-4 h-4" /> Open Resource
                        </a>
                      </div>
                    )}

                    {/* PDF content */}
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
                            <ExternalLink className="w-3.5 h-3.5" /> Open
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

                    {/* Quiz gate — shown when all section lessons are done but quiz not passed */}
                    {mustTakeSectionQuiz && activeSectionQuiz && (
                      <div className="rounded-2xl overflow-hidden border-2 border-amber-400 dark:border-amber-600 shadow-md">
                        <div className="flex items-center gap-3 px-5 py-4 bg-amber-50 dark:bg-amber-900/30">
                          <div className="w-10 h-10 rounded-xl bg-amber-500 flex items-center justify-center shrink-0">
                            <Trophy className="w-5 h-5 text-white" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-amber-900 dark:text-amber-200">Section quiz required</p>
                            <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                              You have completed all lessons in <strong>{sections[activeSectionIndex]?.title}</strong>. Pass the quiz below to unlock the next section.
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 px-5 py-4 bg-white dark:bg-navy-800">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{activeSectionQuiz.title}</p>
                            <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                              {activeSectionQuiz.time_limit_minutes && (
                                <span className="flex items-center gap-1 text-xs text-gray-400">
                                  <Clock className="w-3 h-3" /> {activeSectionQuiz.time_limit_minutes} min
                                </span>
                              )}
                              <span className="text-xs text-gray-400">Pass mark: {activeSectionQuiz.pass_mark}%</span>
                            </div>
                          </div>
                          <Link
                            to="/student/quizzes"
                            className="shrink-0 flex items-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold rounded-xl transition-colors shadow-sm"
                          >
                            <HelpCircle className="w-4 h-4" /> Take Quiz
                          </Link>
                        </div>
                      </div>
                    )}

                    {/* Lesson navigation */}
                    <div className="flex items-center justify-between gap-4 pt-2">
                      {prevLesson ? (
                        <button onClick={() => goToLesson(prevLesson)}
                          className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-navy-800 border border-gray-200 dark:border-navy-700 text-gray-700 dark:text-gray-300 text-sm font-semibold rounded-xl hover:bg-gray-50 dark:hover:bg-navy-700 transition-colors shadow-sm">
                          <ChevronLeft className="w-4 h-4" />
                          <span className="hidden sm:inline">Previous</span>
                        </button>
                      ) : <div />}
                      <div className="text-xs text-gray-400 font-medium">{currentIndex + 1} / {allLessons.length}</div>
                      {mustTakeSectionQuiz ? (
                        <Link
                          to="/student/quizzes"
                          className="flex items-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold rounded-xl transition-colors shadow-sm"
                        >
                          <HelpCircle className="w-4 h-4" />
                          <span className="hidden sm:inline">Take Quiz</span>
                          <span className="sm:hidden">Quiz</span>
                          <ChevronRight className="w-4 h-4" />
                        </Link>
                      ) : nextLesson ? (
                        <button onClick={() => goToLesson(nextLesson)}
                          className="flex items-center gap-2 px-4 py-2.5 bg-sky-600 hover:bg-sky-700 text-white text-sm font-bold rounded-xl transition-colors shadow-sm">
                          <span className="hidden sm:inline">Next Lesson</span>
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
                  </div>
                )}

                {/* ── Tab: Notes & Slides ── */}
                {activeTab === 'materials' && courseId && (
                  <Suspense fallback={<div className="h-24 rounded-2xl bg-gray-50 dark:bg-navy-800 animate-pulse" />}>
                    <LessonDocumentViewer lessonId={activeLesson.id} courseId={courseId} />
                  </Suspense>
                )}

                {/* ── Tab: Activities & Quizzes ── */}
                {activeTab === 'activities' && (
                  <div className="space-y-6">

                    {/* Quizzes for this course */}
                    {quizzes.length > 0 && (
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <HelpCircle className="w-4 h-4 text-sky-600" />
                            <h3 className="text-sm font-bold text-gray-800 dark:text-white">Course Quizzes</h3>
                            <span className="text-xs bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400 px-2 py-0.5 rounded-full font-semibold">{quizzes.length}</span>
                          </div>
                          <Link to="/student/quizzes" className="text-xs text-sky-600 dark:text-sky-400 font-semibold hover:underline flex items-center gap-1">
                            All quizzes <ChevronRight className="w-3.5 h-3.5" />
                          </Link>
                        </div>
                        <div className="space-y-2">
                          {quizzes.map(quiz => {
                            const attempt = quiz.bestAttempt;
                            const passed = attempt?.passed;
                            const score = attempt
                              ? (attempt.total_points > 0 ? Math.round((attempt.score / attempt.total_points) * 100) : attempt.score)
                              : null;
                            return (
                              <div key={quiz.id}
                                className="flex items-center gap-4 p-4 bg-white dark:bg-navy-800 rounded-2xl border border-gray-100 dark:border-navy-700 shadow-sm">
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                                  passed ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-sky-100 dark:bg-sky-900/20'
                                }`}>
                                  {passed
                                    ? <Trophy className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                                    : <HelpCircle className="w-5 h-5 text-sky-600 dark:text-sky-400" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{quiz.title}</p>
                                  <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                                    {quiz.time_limit_minutes && (
                                      <span className="flex items-center gap-1 text-xs text-gray-400">
                                        <Clock className="w-3 h-3" /> {quiz.time_limit_minutes} min
                                      </span>
                                    )}
                                    <span className="text-xs text-gray-400">Pass: {quiz.pass_mark}%</span>
                                    {score !== null && (
                                      <span className={`text-xs font-semibold ${passed ? 'text-emerald-600' : 'text-amber-500'}`}>
                                        Best: {score}% {passed ? '✓' : ''}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <Link to="/student/quizzes"
                                  className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl transition-colors ${
                                    passed
                                      ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100'
                                      : 'bg-sky-600 text-white hover:bg-sky-700'
                                  }`}>
                                  {passed ? 'Retake' : 'Start'}
                                  <ChevronRight className="w-3 h-3" />
                                </Link>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Lesson activities */}
                    {activities.length > 0 ? (
                      <div>
                        <div className="flex items-center gap-2 mb-3">
                          <ClipboardList className="w-4 h-4 text-teal-600" />
                          <h3 className="text-sm font-bold text-gray-800 dark:text-white">Practice Activities</h3>
                          <span className="text-xs bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400 px-2 py-0.5 rounded-full font-semibold">{activities.length}</span>
                        </div>
                        <div className="space-y-3">
                          {activities.map(activity => (
                            <div key={activity.id}
                              className={`rounded-2xl border p-5 ${activityTypeColors[activity.type] || activityTypeColors.practice}`}>
                              <div className="flex items-start justify-between gap-3 mb-3">
                                <h4 className={`text-sm font-bold leading-snug ${activityTypeText[activity.type] || activityTypeText.practice}`}>
                                  {activity.title}
                                </h4>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className={`text-xs font-semibold capitalize px-2 py-1 rounded-lg bg-white/70 dark:bg-black/20 ${activityTypeText[activity.type] || activityTypeText.practice}`}>
                                    {activity.type}
                                  </span>
                                  {activity.estimated_minutes > 0 && (
                                    <span className={`flex items-center gap-1 text-xs font-medium ${activityTypeText[activity.type] || activityTypeText.practice} opacity-75`}>
                                      <Clock className="w-3 h-3" />{activity.estimated_minutes}m
                                    </span>
                                  )}
                                </div>
                              </div>
                              {activity.instructions && (
                                <p className={`text-sm leading-relaxed ${activityTypeText[activity.type] || activityTypeText.practice} opacity-90`}>
                                  {activity.instructions}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : quizzes.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-16 text-center bg-white dark:bg-navy-800 rounded-2xl border border-dashed border-gray-200 dark:border-navy-600">
                        <div className="w-14 h-14 rounded-2xl bg-gray-100 dark:bg-navy-700 flex items-center justify-center mb-3">
                          <ClipboardList className="w-7 h-7 text-gray-300 dark:text-gray-500" />
                        </div>
                        <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">No activities yet</p>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 max-w-xs">Use AI Tools to generate practice activities for this lesson.</p>
                        <button onClick={() => setActiveTab('ai-tools')}
                          className="mt-4 flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold rounded-xl transition-colors">
                          <Sparkles className="w-4 h-4" /> Generate Activities
                        </button>
                      </div>
                    ) : null}
                  </div>
                )}

                {/* ── Tab: AI Tools ── */}
                {activeTab === 'ai-tools' && hasAccess && (
                  <div className="space-y-5">
                    {/* Token balance */}
                    <div className="flex items-center justify-between px-5 py-4 bg-white dark:bg-navy-800 rounded-2xl border border-gray-100 dark:border-navy-700 shadow-sm">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                          <Zap className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-gray-800 dark:text-white">AI Token Balance</p>
                          <p className="text-xs text-gray-400">Used for generating lesson content</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`text-2xl font-extrabold ${(tokenBalance ?? 0) < 4 ? 'text-red-500' : 'text-amber-600 dark:text-amber-400'}`}>
                          {tokenBalance ?? 0}
                        </span>
                        <Link to="/student/ai-plans"
                          className="text-xs font-bold px-3 py-1.5 bg-amber-100 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 rounded-lg hover:bg-amber-200 transition-colors">
                          Top up
                        </Link>
                      </div>
                    </div>

                    {/* AI action cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {[
                        { task: 'summarize_lesson', label: 'Summarise Lesson', desc: 'Get a quick AI-generated summary of this lesson', cost: 3, icon: BookOpen, color: 'text-sky-500', bg: 'bg-sky-50 dark:bg-sky-900/10', border: 'border-sky-200 dark:border-sky-800/40', hover: 'hover:border-sky-400' },
                        { task: 'flashcards', label: 'Generate Flashcards', desc: 'Create study flashcards from lesson content', cost: 4, icon: Brain, color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-900/10', border: 'border-amber-200 dark:border-amber-800/40', hover: 'hover:border-amber-400' },
                        { task: 'activity_ideas', label: 'Practice Activities', desc: 'Get hands-on practice exercises for this lesson', cost: 4, icon: Zap, color: 'text-teal-500', bg: 'bg-teal-50 dark:bg-teal-900/10', border: 'border-teal-200 dark:border-teal-800/40', hover: 'hover:border-teal-400' },
                      ].map(({ task, label, desc, cost, icon: Icon, color, bg, border, hover }) => (
                        <button key={task}
                          onClick={() => generateStudentAI(task)}
                          disabled={!!generatingAI || (tokenBalance ?? 0) < cost}
                          className={`flex flex-col gap-3 p-4 rounded-2xl border ${border} ${bg} ${hover} disabled:opacity-40 disabled:cursor-not-allowed transition-all text-left shadow-sm`}>
                          <div className={`w-9 h-9 rounded-xl bg-white dark:bg-navy-700 flex items-center justify-center shadow-sm ${color}`}>
                            {generatingAI === task
                              ? <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                              : <Icon className="w-4 h-4" />}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-gray-800 dark:text-white leading-tight">{label}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">{desc}</p>
                          </div>
                          <div className="flex items-center gap-1.5 mt-auto">
                            <Zap className="w-3 h-3 text-amber-500" />
                            <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">{cost} tokens</span>
                          </div>
                        </button>
                      ))}
                    </div>

                    {/* Generated flashcards */}
                    {flashcards.length > 0 && (
                      <button onClick={() => setShowFlashcards(true)}
                        className="flex items-center gap-3 w-full px-4 py-3.5 bg-white dark:bg-navy-800 border border-amber-200 dark:border-amber-800/50 hover:bg-amber-50 dark:hover:bg-amber-900/10 rounded-2xl transition-colors text-left shadow-sm group">
                        <div className="w-8 h-8 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
                          <BookMarked className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-bold text-gray-800 dark:text-white">Study Flashcards</p>
                          <p className="text-xs text-gray-400">{flashcards.length} cards ready to study</p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-amber-500 transition-colors" />
                      </button>
                    )}

                    {/* AI summary */}
                    {lessonSummary && (
                      <div className="rounded-2xl overflow-hidden border border-sky-200 dark:border-sky-800/50 shadow-sm">
                        <button onClick={() => setSummaryOpen(o => !o)}
                          className="w-full flex items-center gap-3 px-4 py-3.5 bg-gradient-to-r from-sky-50 to-blue-50 dark:from-sky-900/20 dark:to-blue-900/20 hover:from-sky-100 hover:to-blue-100 dark:hover:from-sky-900/30 transition-colors text-left">
                          <div className="w-7 h-7 rounded-lg bg-sky-500 flex items-center justify-center shrink-0">
                            <Sparkles className="w-3.5 h-3.5 text-white" />
                          </div>
                          <span className="text-sm font-bold text-sky-800 dark:text-sky-300 flex-1">AI Lesson Summary</span>
                          {summaryOpen ? <ChevronUp className="w-4 h-4 text-sky-400" /> : <ChevronDown className="w-4 h-4 text-sky-400" />}
                        </button>
                        {summaryOpen && (
                          <div className="p-5 bg-white dark:bg-navy-800">
                            <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{lessonSummary.summary}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'ai-tools' && !hasAccess && (
                  <div className="flex flex-col items-center justify-center py-16 text-center bg-white dark:bg-navy-800 rounded-2xl border border-gray-100 dark:border-navy-700">
                    <div className="w-14 h-14 rounded-2xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mb-4">
                      <Lock className="w-7 h-7 text-amber-400" />
                    </div>
                    <p className="text-sm font-bold text-gray-800 dark:text-white mb-1">Enrol to use AI Tools</p>
                    <p className="text-xs text-gray-400 max-w-xs">AI-powered tools are available to enrolled students only.</p>
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

      {/* Global lesson text styles */}
      <style>{`
        .lesson-text-content {
          font-family: Georgia, 'Times New Roman', serif;
          color: #1e293b;
          line-height: 1.85;
          font-size: 1rem;
          max-width: 70ch;
        }
        .dark .lesson-text-content { color: #cbd5e1; }
        .lesson-text-content h1 {
          font-family: system-ui, -apple-system, sans-serif;
          font-size: 1.75rem; font-weight: 800; color: #0f172a;
          margin: 2.5rem 0 1rem; line-height: 1.2;
          padding-bottom: 0.5rem; border-bottom: 2px solid #e2e8f0;
        }
        .dark .lesson-text-content h1 { color: #f1f5f9; border-color: #334155; }
        .lesson-text-content h2 {
          font-family: system-ui, -apple-system, sans-serif;
          font-size: 1.25rem; font-weight: 700; color: #0f172a;
          margin: 2rem 0 0.75rem; padding: 0.65rem 0.65rem 0.65rem 1rem;
          border-left: 4px solid #3b82f6;
          background: linear-gradient(to right, #eff6ff, transparent);
          border-radius: 0 8px 8px 0;
        }
        .dark .lesson-text-content h2 {
          color: #f1f5f9;
          background: linear-gradient(to right, rgba(59,130,246,0.12), transparent);
        }
        .lesson-text-content h3 {
          font-family: system-ui, -apple-system, sans-serif;
          font-size: 1rem; font-weight: 700; color: #1e40af;
          margin: 1.5rem 0 0.5rem;
          text-transform: uppercase; letter-spacing: 0.05em; font-size: 0.8rem;
        }
        .dark .lesson-text-content h3 { color: #93c5fd; }
        .lesson-text-content p {
          margin-bottom: 1.1rem; color: #334155;
        }
        .dark .lesson-text-content p { color: #94a3b8; }
        .lesson-text-content ul { padding-left: 0; margin-bottom: 1.1rem; list-style: none; }
        .lesson-text-content ul li {
          color: #334155; line-height: 1.75; margin-bottom: 0.5rem;
          padding-left: 1.75rem; position: relative;
        }
        .dark .lesson-text-content ul li { color: #94a3b8; }
        .lesson-text-content ul li::before {
          content: ''; position: absolute; left: 0.25rem; top: 0.65em;
          width: 8px; height: 8px; border-radius: 50%; background: #3b82f6;
        }
        .lesson-text-content ol {
          padding-left: 0; margin-bottom: 1.1rem; list-style: none; counter-reset: item;
        }
        .lesson-text-content ol li {
          color: #334155; line-height: 1.75; margin-bottom: 0.6rem;
          padding-left: 2.25rem; position: relative; counter-increment: item;
        }
        .dark .lesson-text-content ol li { color: #94a3b8; }
        .lesson-text-content ol li::before {
          content: counter(item); position: absolute; left: 0; top: 0.1em;
          width: 1.5rem; height: 1.5rem; border-radius: 50%;
          background: #1e293b; color: white;
          font-size: 0.7rem; font-weight: 700; display: flex;
          align-items: center; justify-content: center;
          font-family: system-ui, sans-serif;
        }
        .dark .lesson-text-content ol li::before { background: #334155; }
        .lesson-text-content strong { color: #1e3a5f; font-weight: 700; }
        .dark .lesson-text-content strong { color: #93c5fd; }
        .lesson-text-content em { color: #0369a1; font-style: italic; }
        .dark .lesson-text-content em { color: #7dd3fc; }
        .lesson-text-content blockquote {
          border-left: 4px solid #3b82f6; margin: 1.75rem 0;
          padding: 1rem 1.5rem; background: #eff6ff;
          border-radius: 0 12px 12px 0; color: #1e40af;
          font-style: italic; line-height: 1.7;
        }
        .dark .lesson-text-content blockquote {
          background: rgba(59,130,246,0.1); color: #bfdbfe;
        }
        .lesson-text-content code {
          background: #f1f5f9; color: #0f172a; padding: 0.15em 0.5em;
          border-radius: 4px; font-size: 0.85em; font-family: monospace;
          border: 1px solid #e2e8f0;
        }
        .dark .lesson-text-content code { background: #1e293b; color: #e2e8f0; border-color: #334155; }
        .lesson-text-content pre {
          background: #0f172a; color: #e2e8f0; padding: 1.25rem;
          border-radius: 12px; overflow-x: auto; margin: 1.25rem 0;
          font-size: 0.875rem; line-height: 1.6;
        }
        .lesson-text-content table {
          width: 100%; border-collapse: collapse; margin: 1.5rem 0;
          font-size: 0.9rem; font-family: system-ui, sans-serif;
          border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        .lesson-text-content th {
          background: #1e293b; color: white; padding: 0.75rem 1rem;
          text-align: left; font-weight: 600;
        }
        .lesson-text-content td {
          padding: 0.65rem 1rem; border-bottom: 1px solid #e2e8f0; color: #334155;
        }
        .dark .lesson-text-content td { border-color: #334155; color: #94a3b8; }
        .lesson-text-content tr:nth-child(even) td { background: #f8fafc; }
        .dark .lesson-text-content tr:nth-child(even) td { background: rgba(30,41,59,0.4); }
        .lesson-text-content a { color: #2563eb; text-decoration: underline; }
        .lesson-text-content a:hover { color: #1d4ed8; }
        .dark .lesson-text-content a { color: #60a5fa; }
        .lesson-text-content hr {
          border: none; border-top: 2px solid #e2e8f0; margin: 2rem 0;
        }
        .dark .lesson-text-content hr { border-color: #334155; }
        .lesson-text-content img {
          max-width: 100%; border-radius: 12px; margin: 1rem 0;
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        }
      `}</style>

      {showFlashcards && flashcards.length > 0 && (
        <Suspense fallback={null}>
          <FlashcardStudyModal cards={flashcards} onClose={() => setShowFlashcards(false)} />
        </Suspense>
      )}
    </DashboardLayout>
  );
}
