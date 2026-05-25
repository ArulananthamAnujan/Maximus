import { useState, useEffect, useRef } from 'react';
import {
  HelpCircle, Clock, CheckCircle2, XCircle, AlertCircle,
  Trophy, ChevronRight, ChevronDown, ChevronUp, Lock, Info,
} from 'lucide-react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { studentNavItems } from './studentNav';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useMyEnrollments } from '../../hooks/useProgress';
import { toast as sonnerToast } from 'sonner';
import type { Quiz, QuizQuestion, QuizAttempt } from '../../types';

interface QuizWithCourse extends Quiz {
  course: { id: string; title: string };
  attempts: QuizAttempt[];
  extraAttemptsGranted: number;
}

type ViewState = 'list' | 'taking' | 'results';

const MAX_BASE_ATTEMPTS = 3;

export default function StudentQuizzes() {
  const { profile } = useAuth();
  const [quizzes, setQuizzes]           = useState<QuizWithCourse[]>([]);
  const [loading, setLoading]           = useState(true);
  const [view, setView]                 = useState<ViewState>('list');
  const [activeQuiz, setActiveQuiz]     = useState<QuizWithCourse | null>(null);
  const [questions, setQuestions]       = useState<QuizQuestion[]>([]);
  const [answers, setAnswers]           = useState<Record<string, string>>({});
  const [timeLeft, setTimeLeft]         = useState(0);
  const [lastAttempt, setLastAttempt]   = useState<QuizAttempt | null>(null);
  const [submitting, setSubmitting]     = useState(false);
  const [expandedHistory, setExpandedHistory] = useState<Set<string>>(new Set());
  const timerRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef  = useRef<string>('');

  const { data: enrollments = [] } = useMyEnrollments();

  useEffect(() => { if (profile) fetchQuizzes(); }, [profile, enrollments]);

  const fetchQuizzes = async () => {
    if (!profile) return;

    const newCourseIds = enrollments.map(e => e.course_id);
    const { data: legacyEnrollments } = await supabase
      .from('enrollments').select('course_id').eq('student_id', profile.id);
    const allCourseIds = [...new Set([...newCourseIds, ...(legacyEnrollments || []).map(e => e.course_id)])];
    if (allCourseIds.length === 0) { setLoading(false); return; }

    const [quizRes, attemptRes, extraRes] = await Promise.all([
      supabase.from('quizzes').select('*, course:courses(id,title)').in('course_id', allCourseIds),
      supabase.from('quiz_attempts').select('*').eq('student_id', profile.id),
      supabase.from('quiz_extra_attempts').select('quiz_id, extra_attempts').eq('student_id', profile.id),
    ]);

    const attemptsByQuiz = new Map<string, QuizAttempt[]>();
    (attemptRes.data || []).forEach(a => {
      if (!attemptsByQuiz.has(a.quiz_id)) attemptsByQuiz.set(a.quiz_id, []);
      attemptsByQuiz.get(a.quiz_id)!.push(a as QuizAttempt);
    });

    const extraByQuiz = new Map<string, number>();
    (extraRes.data || []).forEach(r => {
      extraByQuiz.set(r.quiz_id, (extraByQuiz.get(r.quiz_id) || 0) + r.extra_attempts);
    });

    setQuizzes((quizRes.data || []).map(q => ({
      ...q,
      attempts: attemptsByQuiz.get(q.id) || [],
      extraAttemptsGranted: extraByQuiz.get(q.id) || 0,
    })) as QuizWithCourse[]);
    setLoading(false);
  };

  const totalAllowed = (quiz: QuizWithCourse) => MAX_BASE_ATTEMPTS + quiz.extraAttemptsGranted;
  const attemptsLeft = (quiz: QuizWithCourse) => totalAllowed(quiz) - quiz.attempts.length;

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

    const { data } = await supabase.from('quiz_questions').select('*').eq('quiz_id', quiz.id).order('order_index');
    setQuestions((data || []) as QuizQuestion[]);
    setActiveQuiz(quiz);
    setAnswers({});
    startedAtRef.current = new Date().toISOString();
    if (quiz.time_limit_minutes) setTimeLeft(quiz.time_limit_minutes * 60);
    setView('taking');
  };

  useEffect(() => {
    if (view !== 'taking' || !activeQuiz?.time_limit_minutes) return;
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) { submitQuiz(); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [view, activeQuiz]);

  const submitQuiz = async () => {
    if (!activeQuiz || !profile || submitting) return;
    setSubmitting(true);
    if (timerRef.current) clearInterval(timerRef.current);

    let score = 0, total = 0;
    questions.forEach(q => {
      total += q.points;
      if (q.type !== 'short_answer' && answers[q.id]?.toLowerCase() === q.correct_answer.toLowerCase()) {
        score += q.points;
      }
    });
    const percent = total > 0 ? Math.round((score / total) * 100) : 0;
    const passed = percent >= activeQuiz.pass_mark;
    const attemptNumber = activeQuiz.attempts.length + 1;

    const { data } = await supabase.from('quiz_attempts').insert({
      quiz_id: activeQuiz.id, student_id: profile.id,
      score: percent, total_points: total, passed, answers,
      attempt_number: attemptNumber,
    }).select().maybeSingle();

    await supabase.from('user_quiz_attempts').insert({
      user_id: profile.id, quiz_id: activeQuiz.id, course_id: activeQuiz.course_id,
      score, max_score: total, passed, answers,
      attempt_number: attemptNumber, started_at: startedAtRef.current,
    }).then(() => {});

    // Auto-issue certificate if passed and all required quizzes done
    if (passed) {
      await checkAndIssueCertificate(activeQuiz.course_id);
    }

    if (data) setLastAttempt(data as QuizAttempt);
    sonnerToast[passed ? 'success' : 'error'](passed ? `You passed with ${percent}%!` : `You scored ${percent}%. Keep trying!`);
    setSubmitting(false);
    setView('results');
    fetchQuizzes();
  };

  const checkAndIssueCertificate = async (courseId: string) => {
    if (!profile) return;
    // Check all required quizzes for this course are passed
    const { data: allQuizzes } = await supabase.from('quizzes').select('id, is_required').eq('course_id', courseId);
    if (!allQuizzes) return;
    const requiredIds = allQuizzes.filter(q => q.is_required).map(q => q.id);
    if (requiredIds.length === 0) return;
    const { data: passedAttempts } = await supabase.from('quiz_attempts').select('quiz_id, passed').eq('student_id', profile.id).eq('passed', true);
    const passedQuizIds = new Set((passedAttempts || []).map(a => a.quiz_id));
    const allPassed = requiredIds.every(id => passedQuizIds.has(id));
    if (!allPassed) return;

    // Check certificate doesn't already exist
    const { data: existing } = await supabase.from('certificates').select('id').eq('student_id', profile.id).eq('course_id', courseId).maybeSingle();
    if (existing) return;

    await supabase.from('certificates').insert({ student_id: profile.id, course_id: courseId });
    sonnerToast.success('Certificate earned! Check your certificates page.');
  };

  const formatTime = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  // ── Taking view ─────────────────────────────────────────────────────────────
  if (view === 'taking' && activeQuiz) {
    return (
      <DashboardLayout navItems={studentNavItems} title={activeQuiz.title} subtitle="Answer all questions carefully">
        <div className="max-w-3xl mx-auto space-y-6">
          <div className="flex items-center justify-between bg-white dark:bg-navy-800 rounded-2xl border border-gray-100 dark:border-navy-700 p-4 shadow-sm">
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {questions.length} questions · Pass mark: {activeQuiz.pass_mark}%
            </span>
            {activeQuiz.time_limit_minutes && (
              <div className={`flex items-center gap-2 font-mono font-bold text-lg ${timeLeft < 60 ? 'text-red-500' : 'text-gray-900 dark:text-white'}`}>
                <Clock className="w-5 h-5" /> {formatTime(timeLeft)}
              </div>
            )}
          </div>

          {questions.map((q, idx) => (
            <div key={q.id} className="bg-white dark:bg-navy-800 rounded-2xl border border-gray-100 dark:border-navy-700 p-6 shadow-sm">
              <p className="font-semibold text-gray-900 dark:text-white mb-4">
                <span className="text-sky-600 mr-2 font-bold">{idx + 1}.</span>{q.question}
                {q.points > 1 && <span className="ml-2 text-xs text-gray-400 font-normal">({q.points} pts)</span>}
              </p>
              {q.type === 'short_answer' ? (
                <textarea
                  value={answers[q.id] || ''}
                  onChange={e => setAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                  className="input-field min-h-20 resize-none"
                  placeholder="Type your answer..."
                />
              ) : (
                <div className="space-y-2">
                  {(q.options as string[]).map(opt => (
                    <label key={opt} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                      answers[q.id] === opt
                        ? 'border-sky-500 bg-sky-50 dark:bg-sky-900/20 shadow-sm'
                        : 'border-gray-200 dark:border-navy-600 hover:bg-gray-50 dark:hover:bg-navy-700'
                    }`}>
                      <div className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${
                        answers[q.id] === opt ? 'border-sky-500 bg-sky-500' : 'border-gray-300 dark:border-navy-500'
                      }`}>
                        {answers[q.id] === opt && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                      </div>
                      <input type="radio" name={q.id} value={opt} checked={answers[q.id] === opt}
                        onChange={() => setAnswers(prev => ({ ...prev, [q.id]: opt }))} className="sr-only" />
                      <span className="text-sm text-gray-800 dark:text-gray-200">{opt}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          ))}

          <div className="flex gap-3 justify-end pb-6">
            <button onClick={() => setView('list')} className="px-4 py-2.5 text-sm font-semibold border border-gray-200 dark:border-navy-600 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-50 dark:hover:bg-navy-700 transition-colors">
              Cancel
            </button>
            <button onClick={submitQuiz} disabled={submitting}
              className="px-6 py-2.5 bg-sky-600 hover:bg-sky-700 text-white text-sm font-bold rounded-xl transition-colors disabled:opacity-60 shadow-sm">
              {submitting ? 'Submitting...' : 'Submit Quiz'}
            </button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // ── Results view ─────────────────────────────────────────────────────────────
  if (view === 'results' && lastAttempt && activeQuiz) {
    const used = activeQuiz.attempts.length + 1;
    const left = attemptsLeft(activeQuiz) - 1;
    const exhausted = left <= 0;

    return (
      <DashboardLayout navItems={studentNavItems} title="Quiz Results" subtitle="">
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
              {lastAttempt.passed ? 'You passed this quiz.' : `You did not reach the pass mark of ${activeQuiz.pass_mark}%.`}
            </p>
            <div className={`text-6xl font-extrabold mb-2 ${lastAttempt.passed ? 'text-emerald-500' : 'text-red-500'}`}>
              {lastAttempt.score}%
            </div>
            <p className="text-sm text-gray-400 mb-2">Pass mark: {activeQuiz.pass_mark}%</p>
            <p className="text-xs text-gray-400 mb-8">Attempt {used} of {totalAllowed(activeQuiz)}</p>

            {!lastAttempt.passed && exhausted && (
              <div className="mb-6 p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 flex items-start gap-3 text-left">
                <Info className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-amber-700 dark:text-amber-300">No attempts remaining</p>
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                    Contact your teacher to request additional attempts.
                  </p>
                </div>
              </div>
            )}

            <div className="flex gap-3 justify-center">
              <button onClick={() => setView('list')}
                className="px-4 py-2.5 text-sm font-semibold border border-gray-200 dark:border-navy-600 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-50 dark:hover:bg-navy-700 transition-colors">
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

  // ── List view ────────────────────────────────────────────────────────────────
  return (
    <DashboardLayout navItems={studentNavItems} title="Quizzes" subtitle="Test your knowledge">
      <div className="space-y-4">
        {loading ? (
          <div className="space-y-4">{[1, 2, 3].map(i => <div key={i} className="bg-white dark:bg-navy-800 rounded-2xl h-24 animate-pulse" />)}</div>
        ) : quizzes.length === 0 ? (
          <div className="text-center py-20">
            <HelpCircle className="w-12 h-12 text-gray-300 dark:text-navy-600 mx-auto mb-3" />
            <p className="text-gray-500 dark:text-gray-400">No quizzes available yet</p>
          </div>
        ) : (
          quizzes.map(quiz => {
            const best = quiz.attempts.reduce<QuizAttempt | null>((b, a) => (!b || a.score > b.score ? a : b), null);
            const left  = attemptsLeft(quiz);
            const total = totalAllowed(quiz);
            const canAttempt = left > 0;
            const hasEnrollment = enrollments.some(e => e.course_id === quiz.course_id && (e.payment_status === 'not_required' || e.payment_status === 'completed'));
            const historyOpen = expandedHistory.has(quiz.id);
            const sortedAttempts = [...quiz.attempts].sort((a, b) => new Date(b.submitted_at ?? b.created_at).getTime() - new Date(a.submitted_at ?? a.created_at).getTime());

            return (
              <div key={quiz.id} className="bg-white dark:bg-navy-800 rounded-2xl border border-gray-100 dark:border-navy-700 shadow-sm overflow-hidden">
                <div className="p-5 flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
                    best?.passed ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-sky-100 dark:bg-sky-900/20'
                  }`}>
                    {best?.passed
                      ? <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                      : <HelpCircle className="w-6 h-6 text-sky-600" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 dark:text-white">{quiz.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{quiz.course?.title}</p>
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-500 dark:text-gray-400 flex-wrap">
                      {quiz.time_limit_minutes && (
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{quiz.time_limit_minutes} min</span>
                      )}
                      <span>Pass: {quiz.pass_mark}%</span>
                      {best && (
                        <span className={best.passed ? 'text-emerald-600 font-semibold' : 'text-red-500'}>
                          Best: {best.score}%
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
                      <button onClick={() => setExpandedHistory(prev => {
                        const n = new Set(prev);
                        if (n.has(quiz.id)) n.delete(quiz.id); else n.add(quiz.id);
                        return n;
                      })} className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-navy-700 transition-colors" title="History">
                        {historyOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    )}
                    {!hasEnrollment ? (
                      <div className="flex items-center gap-1 text-sm text-gray-400"><Lock className="w-4 h-4" /> Locked</div>
                    ) : canAttempt ? (
                      <button onClick={() => startQuiz(quiz)}
                        className="flex items-center gap-1.5 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-sm font-bold rounded-xl transition-colors shadow-sm">
                        {quiz.attempts.length === 0 ? 'Start' : 'Retry'} <ChevronRight className="w-4 h-4" />
                      </button>
                    ) : (
                      <div className="flex items-center gap-1 text-sm text-amber-500">
                        <AlertCircle className="w-4 h-4" /> Ask teacher
                      </div>
                    )}
                  </div>
                </div>

                {historyOpen && sortedAttempts.length > 0 && (
                  <div className="border-t border-gray-100 dark:border-navy-700 bg-gray-50 dark:bg-navy-900/30">
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide px-5 py-2">Attempt History</p>
                    <div className="divide-y divide-gray-100 dark:divide-navy-700">
                      {sortedAttempts.map((attempt, i) => (
                        <div key={attempt.id} className="flex items-center gap-4 px-5 py-3">
                          <span className="text-xs text-gray-400 w-16">#{sortedAttempts.length - i}</span>
                          <span className={`text-sm font-bold ${attempt.passed ? 'text-emerald-600' : 'text-red-500'}`}>
                            {attempt.score}%
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                            attempt.passed
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                              : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                          }`}>
                            {attempt.passed ? 'Passed' : 'Failed'}
                          </span>
                          <span className="text-xs text-gray-400 ml-auto">
                            {new Date(attempt.submitted_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </DashboardLayout>
  );
}
