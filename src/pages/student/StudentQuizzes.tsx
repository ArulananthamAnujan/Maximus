import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  HelpCircle, Clock, CheckCircle2, XCircle, AlertCircle,
  Trophy, ChevronRight, ChevronDown, ChevronUp, Lock, Info,
  BookOpen, GraduationCap,
} from 'lucide-react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { studentNavItems } from './studentNav';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useMyEnrollments } from '../../hooks/useProgress';
import { toast as sonnerToast } from 'sonner';
import type { Quiz, QuizQuestion } from '../../types';

interface QuizAttemptRow {
  id: string;
  student_id: string;
  quiz_id: string;
  course_id: string;
  score: number;
  total_points: number;
  percentage: number;
  passed: boolean;
  answers: Record<string, string>;
  attempt_number: number;
  submitted_at: string | null;
  created_at: string;
}

interface QuizWithCourse extends Quiz {
  course: { id: string; title: string };
  attempts: QuizAttemptRow[];
  extraAttemptsGranted: number;
}

interface CourseGroup {
  courseId: string;
  courseTitle: string;
  quizzes: QuizWithCourse[];
}

type ViewState = 'list' | 'taking' | 'results';

const DEFAULT_MAX_ATTEMPTS = 3;
const NO_ENROLLMENTS: never[] = [];

export default function StudentQuizzes() {
  const { profile } = useAuth();
  const [groups, setGroups]             = useState<CourseGroup[]>([]);
  const [loading, setLoading]           = useState(true);
  const [view, setView]                 = useState<ViewState>('list');
  const [activeQuiz, setActiveQuiz]     = useState<QuizWithCourse | null>(null);
  const [questions, setQuestions]       = useState<QuizQuestion[]>([]);
  const [answers, setAnswers]           = useState<Record<string, string>>({});
  const [timeLeft, setTimeLeft]         = useState(0);
  const [lastAttempt, setLastAttempt]   = useState<QuizAttemptRow | null>(null);
  const [submitting, setSubmitting]     = useState(false);
  const [expandedHistory, setExpandedHistory] = useState<Set<string>>(new Set());
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const timerRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef<string>('');

  // A link from a course week names the course and quiz to show (?course=…&quiz=…)
  const [searchParams] = useSearchParams();
  const linkedCourse = searchParams.get('course');
  const linkedQuiz = searchParams.get('quiz');

  const { data: enrollmentData } = useMyEnrollments();
  const enrollments = enrollmentData ?? NO_ENROLLMENTS;
  // Latest answers / in-flight flag, readable from the timer without stale closures
  const answersRef = useRef(answers);
  answersRef.current = answers;
  const submittingRef = useRef(false);

  useEffect(() => { if (profile) fetchQuizzes(); }, [profile, enrollments]);

  useEffect(() => {
    if (loading || !linkedQuiz || view !== 'list') return;
    document.getElementById(`quiz-${linkedQuiz}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [loading, linkedQuiz, selectedCourseId, view]);

  const fetchQuizzes = async () => {
    if (!profile) return;

    const newCourseIds = enrollments.map(e => e.course_id);
    const { data: legacyEnrollments } = await supabase
      .from('enrollments').select('course_id').eq('student_id', profile.id);
    const allCourseIds = [...new Set([...newCourseIds, ...(legacyEnrollments || []).map(e => e.course_id)])];
    if (allCourseIds.length === 0) { setLoading(false); return; }

    const [quizRes, attemptRes, extraRes] = await Promise.all([
      supabase.from('quizzes').select('*, course:courses(id,title)').in('course_id', allCourseIds).eq('is_published', true),
      supabase.from('quiz_attempts').select('id,student_id,quiz_id,course_id,score,total_points,percentage,passed,answers,attempt_number,submitted_at,created_at').eq('student_id', profile.id),
      supabase.from('quiz_extra_attempts').select('quiz_id, extra_attempts').eq('student_id', profile.id),
    ]);

    const attemptsByQuiz = new Map<string, QuizAttemptRow[]>();
    (attemptRes.data || []).forEach(a => {
      if (!attemptsByQuiz.has(a.quiz_id)) attemptsByQuiz.set(a.quiz_id, []);
      attemptsByQuiz.get(a.quiz_id)!.push(a as QuizAttemptRow);
    });

    const extraByQuiz = new Map<string, number>();
    (extraRes.data || []).forEach(r => {
      extraByQuiz.set(r.quiz_id, (extraByQuiz.get(r.quiz_id) || 0) + r.extra_attempts);
    });

    const quizzes: QuizWithCourse[] = (quizRes.data || []).map(q => ({
      ...q,
      attempts: attemptsByQuiz.get(q.id) || [],
      extraAttemptsGranted: extraByQuiz.get(q.id) || 0,
    })) as QuizWithCourse[];

    // Group by course
    const groupMap = new Map<string, CourseGroup>();
    quizzes.forEach(q => {
      const cid = q.course?.id || q.course_id;
      if (!groupMap.has(cid)) {
        groupMap.set(cid, { courseId: cid, courseTitle: q.course?.title || 'Unknown Course', quizzes: [] });
      }
      groupMap.get(cid)!.quizzes.push(q);
    });

    const grouped = Array.from(groupMap.values());
    setGroups(grouped);

    // Opened from a course's week: show that course and point at its quiz
    const wanted = grouped.find(g => g.courseId === linkedCourse);
    if (wanted) {
      setSelectedCourseId(wanted.courseId);
    } else if (grouped.length > 0 && !selectedCourseId) {
      // Auto-select first course
      setSelectedCourseId(grouped[0].courseId);
    }
    setLoading(false);
  };

  const totalAllowed = (quiz: QuizWithCourse) => (quiz.max_attempts ?? DEFAULT_MAX_ATTEMPTS) + quiz.extraAttemptsGranted;
  const attemptsLeft = (quiz: QuizWithCourse) => totalAllowed(quiz) - quiz.attempts.length;

  const getPassMark = (quiz: QuizWithCourse) =>
    (quiz as Quiz & { pass_mark?: number; pass_percentage?: number }).pass_mark
    ?? (quiz as Quiz & { pass_percentage?: number }).pass_percentage
    ?? 60;

  const startQuiz = async (quiz: QuizWithCourse) => {
    const courseId = quiz.course_id;
    const hasAccess = enrollments.some(e => e.course_id === courseId && (e.payment_status === 'not_required' || e.payment_status === 'completed'));
    if (!hasAccess) {
      const { data: legacy } = await supabase.from('enrollments').select('id').eq('student_id', profile!.id).eq('course_id', courseId).maybeSingle();
      if (!legacy) { sonnerToast.error('You need to enrol in this course to take this quiz'); return; }
    }
    if (attemptsLeft(quiz) <= 0) {
      sonnerToast.error('No attempts remaining. Ask your teacher for extra attempts.');
      return;
    }
    // Questions come from a server function that never sends the answer key to the browser.
    const { data, error: questionsError } = await supabase.rpc('get_quiz_questions', { p_quiz_id: quiz.id });
    if (questionsError || !data || data.length === 0) {
      sonnerToast.error('Could not load this quiz. Please try again.');
      return;
    }
    setQuestions(data as QuizQuestion[]);
    setActiveQuiz(quiz);
    setAnswers({});
    startedAtRef.current = new Date().toISOString();
    const timeLimitMins = (quiz as Quiz & { time_limit?: number; time_limit_minutes?: number }).time_limit_minutes
      ?? (quiz as Quiz & { time_limit?: number }).time_limit ?? 0;
    if (timeLimitMins) setTimeLeft(timeLimitMins * 60);
    setView('taking');
  };

  useEffect(() => {
    if (view !== 'taking' || !activeQuiz) return;
    const timeLimitMins = (activeQuiz as Quiz & { time_limit?: number; time_limit_minutes?: number }).time_limit_minutes
      ?? (activeQuiz as Quiz & { time_limit?: number }).time_limit ?? 0;
    if (!timeLimitMins) return;
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [view, activeQuiz]);

  // Auto-submit when the clock reaches zero. Separate from the interval so the answers
  // given so far are submitted (not the empty set captured when the quiz started).
  useEffect(() => {
    if (view !== 'taking' || !activeQuiz || timeLeft !== 0) return;
    const timeLimitMins = (activeQuiz as Quiz & { time_limit?: number; time_limit_minutes?: number }).time_limit_minutes
      ?? (activeQuiz as Quiz & { time_limit?: number }).time_limit ?? 0;
    if (timeLimitMins) submitQuiz();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, view, activeQuiz]);

  const submitQuiz = async () => {
    if (!activeQuiz || !profile || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    if (timerRef.current) clearInterval(timerRef.current);

    // The database grades the attempt, numbers it and enforces the attempt limit;
    // only the answers are sent.
    const { data, error } = await supabase.from('quiz_attempts').insert({
      student_id: profile.id,
      quiz_id: activeQuiz.id,
      course_id: activeQuiz.course_id,
      answers: answersRef.current,
    }).select().maybeSingle();

    if (error || !data) {
      sonnerToast.error(
        error?.message?.includes('No attempts remaining')
          ? 'No attempts remaining. Ask your teacher for extra attempts.'
          : 'Failed to submit quiz. Please try again.'
      );
      submittingRef.current = false;
      setSubmitting(false);
      if (error?.message?.includes('No attempts remaining')) { setView('list'); fetchQuizzes(); }
      return;
    }

    const attempt = data as QuizAttemptRow;
    const passed = !!attempt.passed;
    if (passed) await checkAndIssueCertificate(activeQuiz.course_id);
    setLastAttempt(attempt);
    // Keep the attempt count current so "Try again" respects the limit
    setActiveQuiz(q => (q ? { ...q, attempts: [...q.attempts, attempt] } : q));
    sonnerToast[passed ? 'success' : 'error'](passed ? `You passed with ${attempt.percentage}%!` : `You scored ${attempt.percentage}%. Keep trying!`);
    submittingRef.current = false;
    setSubmitting(false);
    setView('results');
    fetchQuizzes();
  };

  const checkAndIssueCertificate = async (courseId: string) => {
    if (!profile) return;
    const { data: allQuizzes } = await supabase.from('quizzes').select('id, is_required').eq('course_id', courseId);
    if (!allQuizzes) return;
    const requiredQuizIds = allQuizzes.filter(q => q.is_required).map(q => q.id);
    if (requiredQuizIds.length > 0) {
      const { data: passedAttempts } = await supabase.from('quiz_attempts').select('quiz_id, passed').eq('student_id', profile.id).eq('passed', true);
      const passedQuizIds = new Set((passedAttempts || []).map(a => a.quiz_id));
      if (!requiredQuizIds.every(id => passedQuizIds.has(id))) return;
    }
    const { data: allExams } = await supabase.from('exams').select('id').eq('course_id', courseId).eq('is_published', true);
    if (allExams && allExams.length > 0) {
      const examIds = allExams.map(e => e.id);
      const { data: examSubs } = await supabase.from('exam_submissions').select('exam_id, status').eq('student_id', profile.id).in('exam_id', examIds);
      const gradedSubs = new Set((examSubs || []).filter(s => s.status === 'finalised' || s.status === 'graded').map(s => s.exam_id));
      if (!examIds.every(id => gradedSubs.has(id))) return;
    }
    const { data: existing } = await supabase.from('certificates').select('id').eq('student_id', profile.id).eq('course_id', courseId).maybeSingle();
    if (existing) return;
    // The database re-checks lessons, quizzes and exams before accepting this row.
    const { error: certError } = await supabase.from('certificates').insert({ student_id: profile.id, course_id: courseId });
    if (!certError) sonnerToast.success('Certificate earned! Check your certificates page.');
  };

  const formatTime = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  // ── Taking view ──────────────────────────────────────────────────────────────
  if (view === 'taking' && activeQuiz) {
    const timeLimitMins = (activeQuiz as Quiz & { time_limit?: number; time_limit_minutes?: number }).time_limit_minutes
      ?? (activeQuiz as Quiz & { time_limit?: number }).time_limit ?? 0;
    return (
      <DashboardLayout navItems={studentNavItems} title={activeQuiz.title} subtitle={activeQuiz.course?.title}>
        <div className="max-w-3xl mx-auto space-y-5">
          {/* Progress bar + meta */}
          <div className="bg-white dark:bg-navy-800 rounded-2xl border border-gray-100 dark:border-navy-700 p-4 shadow-sm flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
              <span className="font-semibold text-gray-900 dark:text-white">{questions.length} questions</span>
              <span>·</span>
              <span>Pass mark: <strong>{getPassMark(activeQuiz)}%</strong></span>
            </div>
            {timeLimitMins > 0 && (
              <div className={`flex items-center gap-2 font-mono font-bold text-lg px-4 py-1.5 rounded-xl ${
                timeLeft < 60 ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' : 'bg-gray-100 dark:bg-navy-700 text-gray-900 dark:text-white'
              }`}>
                <Clock className="w-4 h-4" /> {formatTime(timeLeft)}
              </div>
            )}
          </div>

          {questions.map((q, idx) => (
            <div key={q.id} className="bg-white dark:bg-navy-800 rounded-2xl border border-gray-100 dark:border-navy-700 p-6 shadow-sm">
              <div className="flex items-start gap-3 mb-5">
                <span className="w-7 h-7 rounded-lg bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                  {idx + 1}
                </span>
                <p className="font-semibold text-gray-900 dark:text-white leading-snug flex-1">
                  {q.question}
                  {q.points > 1 && <span className="ml-2 text-xs text-gray-400 font-normal">({q.points} pts)</span>}
                </p>
              </div>
              {q.type === 'short_answer' ? (
                <textarea
                  value={answers[q.id] || ''}
                  onChange={e => setAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                  className="w-full border border-gray-200 dark:border-navy-600 rounded-xl px-4 py-3 text-sm bg-gray-50 dark:bg-navy-700 text-gray-800 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-transparent resize-none min-h-24"
                  placeholder="Type your answer..."
                />
              ) : (
                <div className="space-y-2">
                  {(q.options as string[]).map((opt, oi) => {
                    const letters = ['A','B','C','D','E'];
                    const selected = answers[q.id] === opt;
                    return (
                      <label key={opt} className={`flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                        selected
                          ? 'border-sky-500 bg-sky-50 dark:bg-sky-900/20 shadow-sm'
                          : 'border-gray-200 dark:border-navy-600 hover:bg-gray-50 dark:hover:bg-navy-700/50'
                      }`}>
                        <div className={`w-7 h-7 rounded-lg text-xs font-bold flex items-center justify-center shrink-0 transition-colors ${
                          selected ? 'bg-sky-500 text-white' : 'bg-gray-100 dark:bg-navy-600 text-gray-500 dark:text-gray-400'
                        }`}>
                          {letters[oi] || oi + 1}
                        </div>
                        <input type="radio" name={q.id} value={opt} checked={selected}
                          onChange={() => setAnswers(prev => ({ ...prev, [q.id]: opt }))} className="sr-only" />
                        <span className="text-sm text-gray-800 dark:text-gray-200">{opt}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          ))}

          <div className="flex gap-3 justify-end pb-8">
            <button onClick={() => setView('list')} className="px-5 py-2.5 text-sm font-semibold border border-gray-200 dark:border-navy-600 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-50 dark:hover:bg-navy-700 transition-colors">
              Cancel
            </button>
            <button onClick={submitQuiz} disabled={submitting}
              className="px-7 py-2.5 bg-sky-600 hover:bg-sky-700 text-white text-sm font-bold rounded-xl transition-colors disabled:opacity-60 shadow-sm">
              {submitting ? 'Submitting...' : 'Submit Quiz'}
            </button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // ── Results view ─────────────────────────────────────────────────────────────
  if (view === 'results' && lastAttempt && activeQuiz) {
    // activeQuiz.attempts already includes the attempt just submitted
    const used = activeQuiz.attempts.length;
    const left = attemptsLeft(activeQuiz);
    const exhausted = left <= 0;
    return (
      <DashboardLayout navItems={studentNavItems} title="Quiz Results" subtitle={activeQuiz.course?.title}>
        <div className="max-w-xl mx-auto">
          <div className="bg-white dark:bg-navy-800 rounded-2xl border border-gray-100 dark:border-navy-700 p-8 text-center shadow-sm">
            <div className={`w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-5 ${
              lastAttempt.passed ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-red-100 dark:bg-red-900/30'
            }`}>
              {lastAttempt.passed
                ? <Trophy className="w-12 h-12 text-emerald-500" />
                : <XCircle className="w-12 h-12 text-red-500" />}
            </div>
            <h2 className="text-3xl font-extrabold text-gray-900 dark:text-white mb-2">
              {lastAttempt.passed ? 'Well done!' : 'Not quite there'}
            </h2>
            <p className="text-gray-500 dark:text-gray-400 mb-6">
              {lastAttempt.passed ? 'You passed this quiz.' : `You did not reach the pass mark of ${getPassMark(activeQuiz)}%.`}
            </p>
            <div className={`text-6xl font-extrabold mb-2 ${lastAttempt.passed ? 'text-emerald-500' : 'text-red-500'}`}>
              {lastAttempt.percentage}%
            </div>
            <p className="text-sm text-gray-400 mb-2">Pass mark: {getPassMark(activeQuiz)}%</p>
            <p className="text-xs text-gray-400 mb-8">Attempt {used} of {totalAllowed(activeQuiz)}</p>

            {!lastAttempt.passed && exhausted && (
              <div className="mb-6 p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 flex items-start gap-3 text-left">
                <Info className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-amber-700 dark:text-amber-300">No attempts remaining</p>
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">Contact your teacher to request additional attempts.</p>
                </div>
              </div>
            )}

            <div className="flex gap-3 justify-center">
              <button onClick={() => setView('list')}
                className="px-5 py-2.5 text-sm font-semibold border border-gray-200 dark:border-navy-600 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-50 dark:hover:bg-navy-700 transition-colors">
                Back to Quizzes
              </button>
              {!lastAttempt.passed && !exhausted && (
                <button onClick={() => startQuiz(activeQuiz)}
                  className="px-6 py-2.5 bg-sky-600 hover:bg-sky-700 text-white text-sm font-bold rounded-xl transition-colors shadow-sm">
                  Try Again ({left} left)
                </button>
              )}
              {lastAttempt.passed && (
                <a href="/student/certificates"
                  className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl transition-colors shadow-sm flex items-center gap-2">
                  <Trophy className="w-4 h-4" /> View Certificate
                </a>
              )}
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // ── List view — university-style vertical subject tabs ───────────────────────
  const activeGroup = groups.find(g => g.courseId === selectedCourseId) ?? groups[0] ?? null;

  const courseStats = (group: CourseGroup) => {
    const total  = group.quizzes.length;
    const passed = group.quizzes.filter(q => q.attempts.some(a => a.passed)).length;
    return { total, passed };
  };

  return (
    <DashboardLayout navItems={studentNavItems} title="Quizzes" subtitle="Test your knowledge by subject">
      {loading ? (
        <div className="flex gap-5">
          <div className="w-64 shrink-0 space-y-2">
            {[1,2,3].map(i => <div key={i} className="h-16 rounded-xl bg-gray-100 dark:bg-navy-800 animate-pulse" />)}
          </div>
          <div className="flex-1 space-y-3">
            {[1,2,3].map(i => <div key={i} className="h-24 rounded-2xl bg-gray-100 dark:bg-navy-800 animate-pulse" />)}
          </div>
        </div>
      ) : groups.length === 0 ? (
        <div className="text-center py-24">
          <div className="w-20 h-20 rounded-2xl bg-sky-50 dark:bg-sky-900/20 flex items-center justify-center mx-auto mb-4">
            <HelpCircle className="w-10 h-10 text-sky-400" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">No quizzes available yet</h3>
          <p className="text-gray-500 dark:text-gray-400">Enrol in a course to access quizzes.</p>
        </div>
      ) : (
        <div className="flex gap-5 items-start">
          {/* ── Left: vertical course tabs ─────────────────────────────────── */}
          <div className="w-64 shrink-0 space-y-1.5 sticky top-4">
            <p className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest px-3 mb-3">Subjects</p>
            {groups.map(group => {
              const { total, passed } = courseStats(group);
              const isActive = group.courseId === (selectedCourseId ?? groups[0]?.courseId);
              const allPassed = passed === total && total > 0;
              return (
                <button
                  key={group.courseId}
                  onClick={() => setSelectedCourseId(group.courseId)}
                  className={`w-full text-left px-4 py-3.5 rounded-xl transition-all group ${
                    isActive
                      ? 'bg-sky-600 shadow-md shadow-sky-200 dark:shadow-sky-900/30'
                      : 'hover:bg-gray-100 dark:hover:bg-navy-700/60 bg-white dark:bg-navy-800 border border-gray-100 dark:border-navy-700'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                      isActive ? 'bg-white/20' : allPassed ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-sky-100 dark:bg-sky-900/20'
                    }`}>
                      {allPassed
                        ? <CheckCircle2 className={`w-4 h-4 ${isActive ? 'text-white' : 'text-emerald-600'}`} />
                        : <BookOpen className={`w-4 h-4 ${isActive ? 'text-white' : 'text-sky-600'}`} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold leading-snug truncate ${isActive ? 'text-white' : 'text-gray-800 dark:text-white'}`}>
                        {group.courseTitle}
                      </p>
                      <p className={`text-xs mt-0.5 ${isActive ? 'text-sky-100' : 'text-gray-400 dark:text-gray-500'}`}>
                        {passed}/{total} passed
                      </p>
                    </div>
                    {isActive && <ChevronRight className="w-4 h-4 text-white shrink-0" />}
                  </div>
                </button>
              );
            })}
          </div>

          {/* ── Right: quiz list for selected course ──────────────────────── */}
          <div className="flex-1 min-w-0">
            {activeGroup && (
              <>
                {/* Course header */}
                <div className="flex items-center gap-3 mb-5 p-4 bg-white dark:bg-navy-800 rounded-2xl border border-gray-100 dark:border-navy-700 shadow-sm">
                  <div className="w-10 h-10 rounded-xl bg-sky-100 dark:bg-sky-900/20 flex items-center justify-center shrink-0">
                    <GraduationCap className="w-5 h-5 text-sky-600" />
                  </div>
                  <div>
                    <h2 className="font-bold text-gray-900 dark:text-white">{activeGroup.courseTitle}</h2>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {activeGroup.quizzes.length} quiz{activeGroup.quizzes.length !== 1 ? 'zes' : ''} ·{' '}
                      {courseStats(activeGroup).passed} passed
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  {activeGroup.quizzes.map((quiz, qIdx) => {
                    const best       = quiz.attempts.reduce<QuizAttemptRow | null>((b, a) => (!b || a.percentage > b.percentage ? a : b), null);
                    const left       = attemptsLeft(quiz);
                    const total      = totalAllowed(quiz);
                    const canAttempt = left > 0;
                    const hasEnrollment = enrollments.some(e => e.course_id === quiz.course_id && (e.payment_status === 'not_required' || e.payment_status === 'completed'));
                    const historyOpen   = expandedHistory.has(quiz.id);
                    const sortedAttempts = [...quiz.attempts].sort((a, b) =>
                      new Date(b.submitted_at ?? b.created_at).getTime() - new Date(a.submitted_at ?? a.created_at).getTime()
                    );
                    const passMark = getPassMark(quiz);

                    return (
                      <div key={quiz.id} id={`quiz-${quiz.id}`}
                        className={`bg-white dark:bg-navy-800 rounded-2xl border shadow-sm overflow-hidden scroll-mt-24 ${quiz.id === linkedQuiz ? 'border-sky-400 ring-2 ring-sky-300 dark:ring-sky-700' : 'border-gray-100 dark:border-navy-700'}`}>
                        <div className="p-5">
                          <div className="flex items-start gap-4">
                            {/* Status badge */}
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                              best?.passed ? 'bg-emerald-100 dark:bg-emerald-900/30' : quiz.attempts.length > 0 ? 'bg-red-100 dark:bg-red-900/20' : 'bg-gray-100 dark:bg-navy-700'
                            }`}>
                              <span className="text-sm font-bold text-gray-500 dark:text-gray-400">{qIdx + 1}</span>
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="font-semibold text-gray-900 dark:text-white">{quiz.title}</p>
                                  <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-500 dark:text-gray-400 flex-wrap">
                                    <span className="flex items-center gap-1">
                                      <CheckCircle2 className="w-3 h-3" />Pass: {passMark}%
                                    </span>
                                    {best && (
                                      <span className={`font-semibold ${best.passed ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
                                        Best: {best.percentage}%
                                      </span>
                                    )}
                                    <span className={left <= 0 ? 'text-red-500 font-semibold' : left === 1 ? 'text-amber-500 font-semibold' : ''}>
                                      {left}/{total} attempts left
                                    </span>
                                    {quiz.extraAttemptsGranted > 0 && (
                                      <span className="text-emerald-600 dark:text-emerald-400 font-semibold">+{quiz.extraAttemptsGranted} bonus</span>
                                    )}
                                  </div>
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                  {quiz.attempts.length > 0 && (
                                    <button
                                      onClick={() => setExpandedHistory(prev => {
                                        const n = new Set(prev);
                                        if (n.has(quiz.id)) n.delete(quiz.id); else n.add(quiz.id);
                                        return n;
                                      })}
                                      className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-navy-700 transition-colors"
                                      title="Attempt history"
                                    >
                                      {historyOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                    </button>
                                  )}
                                  {!hasEnrollment ? (
                                    <div className="flex items-center gap-1 text-sm text-gray-400"><Lock className="w-4 h-4" /> Locked</div>
                                  ) : best?.passed ? (
                                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-xs font-bold rounded-lg">
                                      <CheckCircle2 className="w-3.5 h-3.5" /> Passed
                                    </div>
                                  ) : canAttempt ? (
                                    <button
                                      onClick={() => startQuiz(quiz)}
                                      className="flex items-center gap-1.5 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-sm font-bold rounded-xl transition-colors shadow-sm"
                                    >
                                      {quiz.attempts.length === 0 ? 'Start' : 'Retry'}
                                      <ChevronRight className="w-4 h-4" />
                                    </button>
                                  ) : (
                                    <div className="flex items-center gap-1 text-sm text-amber-500">
                                      <AlertCircle className="w-4 h-4" /> Ask teacher
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Attempt history */}
                        {historyOpen && sortedAttempts.length > 0 && (
                          <div className="border-t border-gray-100 dark:border-navy-700 bg-gray-50 dark:bg-navy-900/30">
                            <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest px-5 py-2.5">Attempt History</p>
                            <div className="divide-y divide-gray-100 dark:divide-navy-700">
                              {sortedAttempts.map((attempt, i) => (
                                <div key={attempt.id} className="flex items-center gap-4 px-5 py-3">
                                  <span className="text-xs text-gray-400 w-16 shrink-0">Attempt #{sortedAttempts.length - i}</span>
                                  <span className={`text-sm font-bold ${attempt.passed ? 'text-emerald-600' : 'text-red-500'}`}>
                                    {attempt.percentage}%
                                  </span>
                                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                                    attempt.passed
                                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                                      : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                  }`}>
                                    {attempt.passed ? 'Passed' : 'Failed'}
                                  </span>
                                  <span className="text-xs text-gray-400 ml-auto">
                                    {new Date(attempt.submitted_at ?? attempt.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
