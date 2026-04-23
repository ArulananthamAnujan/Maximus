import { useState, useEffect, useRef } from 'react';
import {
  HelpCircle, Clock, CheckCircle2, XCircle, AlertCircle,
  Trophy, ChevronRight, ChevronDown, ChevronUp, Lock
} from 'lucide-react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { studentNavItems } from './studentNav';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useMyEnrollments } from '../../hooks/useProgress';
import { toast as sonnerToast } from 'sonner';
import type { Quiz, QuizQuestion, QuizAttempt } from '../../types';

interface QuizWithCourse extends Quiz {
  course: { id: string; title: string };
  attempts: QuizAttempt[];
}

type ViewState = 'list' | 'taking' | 'results';

export default function StudentQuizzes() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [quizzes, setQuizzes] = useState<QuizWithCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewState>('list');
  const [activeQuiz, setActiveQuiz] = useState<QuizWithCourse | null>(null);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [timeLeft, setTimeLeft] = useState(0);
  const [lastAttempt, setLastAttempt] = useState<QuizAttempt | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [expandedHistory, setExpandedHistory] = useState<Set<string>>(new Set());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef<string>('');

  const { data: enrollments = [] } = useMyEnrollments();

  useEffect(() => {
    if (!profile) return;
    fetchQuizzes();
  }, [profile, enrollments]);

  const fetchQuizzes = async () => {
    if (!profile) return;

    // Combine course IDs from new and legacy enrollments
    const newCourseIds = enrollments.map(e => e.course_id);

    const { data: legacyEnrollments } = await supabase
      .from('enrollments')
      .select('course_id')
      .eq('student_id', profile.id);
    const legacyCourseIds = (legacyEnrollments || []).map(e => e.course_id);

    const allCourseIds = [...new Set([...newCourseIds, ...legacyCourseIds])];
    if (allCourseIds.length === 0) { setLoading(false); return; }

    const [quizRes, attemptRes] = await Promise.all([
      supabase.from('quizzes').select('*, course:courses(id,title)').in('course_id', allCourseIds),
      supabase.from('quiz_attempts').select('*').eq('student_id', profile.id),
    ]);

    const attemptsByQuiz = new Map<string, QuizAttempt[]>();
    (attemptRes.data || []).forEach(a => {
      if (!attemptsByQuiz.has(a.quiz_id)) attemptsByQuiz.set(a.quiz_id, []);
      attemptsByQuiz.get(a.quiz_id)!.push(a as QuizAttempt);
    });

    setQuizzes((quizRes.data || []).map(q => ({
      ...q,
      attempts: attemptsByQuiz.get(q.id) || [],
    })) as QuizWithCourse[]);
    setLoading(false);
  };

  const startQuiz = async (quiz: QuizWithCourse) => {
    // Check enrollment access
    const courseId = quiz.course_id;
    const hasAccess = enrollments.some(e => e.course_id === courseId && (e.payment_status === 'not_required' || e.payment_status === 'completed'));
    if (!hasAccess) {
      const { data: legacy } = await supabase.from('enrollments').select('id').eq('student_id', profile!.id).eq('course_id', courseId).maybeSingle();
      if (!legacy) {
        sonnerToast.error('You need to enrol in this course to take this quiz');
        return;
      }
    }

    const { data } = await supabase.from('quiz_questions').select('*').eq('quiz_id', quiz.id).order('order_index');
    setQuestions((data || []) as QuizQuestion[]);
    setActiveQuiz(quiz);
    setAnswers({});
    startedAtRef.current = new Date().toISOString();
    if (quiz.time_limit_minutes) {
      setTimeLeft(quiz.time_limit_minutes * 60);
    }
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

    let score = 0;
    let total = 0;
    questions.forEach(q => {
      total += q.points;
      if (q.type !== 'short_answer' && answers[q.id]?.toLowerCase() === q.correct_answer.toLowerCase()) {
        score += q.points;
      }
    });
    const percent = total > 0 ? Math.round((score / total) * 100) : 0;
    const passed = percent >= activeQuiz.pass_mark;
    const attemptNumber = activeQuiz.attempts.length + 1;

    // Insert into legacy quiz_attempts
    const { data } = await supabase.from('quiz_attempts').insert({
      quiz_id: activeQuiz.id,
      student_id: profile.id,
      score: percent,
      total_points: total,
      passed,
      answers,
    }).select().maybeSingle();

    // Also insert into user_quiz_attempts (new table with more detail)
    await supabase.from('user_quiz_attempts').insert({
      user_id: profile.id,
      quiz_id: activeQuiz.id,
      course_id: activeQuiz.course_id,
      score,
      max_score: total,
      passed,
      answers,
      attempt_number: attemptNumber,
      started_at: startedAtRef.current,
    }).then(() => {});

    if (data) setLastAttempt(data as QuizAttempt);
    toast[passed ? 'success' : 'error'](passed ? `You passed with ${percent}%!` : `You scored ${percent}%. Keep trying!`);
    setSubmitting(false);
    setView('results');
    fetchQuizzes();
  };

  const formatTime = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  const toggleHistory = (quizId: string) => {
    setExpandedHistory(prev => {
      const next = new Set(prev);
      if (next.has(quizId)) next.delete(quizId); else next.add(quizId);
      return next;
    });
  };

  if (view === 'taking' && activeQuiz) {
    return (
      <DashboardLayout navItems={studentNavItems} title={activeQuiz.title} subtitle="Answer all questions carefully">
        <div className="max-w-3xl mx-auto space-y-6">
          <div className="flex items-center justify-between card p-4">
            <span className="text-sm text-gray-500 dark:text-gray-400">{questions.length} questions · Pass mark: {activeQuiz.pass_mark}%</span>
            {activeQuiz.time_limit_minutes && (
              <div className={`flex items-center gap-2 font-mono font-bold text-lg ${timeLeft < 60 ? 'text-red-500' : 'text-gray-900 dark:text-white'}`}>
                <Clock className="w-5 h-5" />
                {formatTime(timeLeft)}
              </div>
            )}
          </div>

          {questions.map((q, idx) => (
            <div key={q.id} className="card p-6">
              <p className="font-semibold text-gray-900 dark:text-white mb-4">
                <span className="text-gold-600 mr-2">{idx + 1}.</span>{q.question}
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
                    <label key={opt} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${answers[q.id] === opt ? 'border-gold-500 bg-gold-50 dark:bg-gold-900/20' : 'border-gray-200 dark:border-navy-600 hover:bg-gray-50 dark:hover:bg-navy-700'}`}>
                      <input
                        type="radio"
                        name={q.id}
                        value={opt}
                        checked={answers[q.id] === opt}
                        onChange={() => setAnswers(prev => ({ ...prev, [q.id]: opt }))}
                        className="text-gold-500"
                      />
                      <span className="text-sm text-gray-800 dark:text-gray-200">{opt}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          ))}

          <div className="flex gap-3 justify-end">
            <button onClick={() => setView('list')} className="btn-outline text-sm">Cancel</button>
            <button onClick={submitQuiz} disabled={submitting} className="btn-primary text-sm">
              {submitting ? 'Submitting...' : 'Submit Quiz'}
            </button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (view === 'results' && lastAttempt) {
    return (
      <DashboardLayout navItems={studentNavItems} title="Quiz Results" subtitle="">
        <div className="max-w-xl mx-auto text-center">
          <div className="card p-8">
            <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 ${lastAttempt.passed ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30'}`}>
              {lastAttempt.passed
                ? <Trophy className="w-10 h-10 text-green-600 dark:text-green-400" />
                : <XCircle className="w-10 h-10 text-red-500" />}
            </div>
            <h2 className="font-playfair text-3xl font-bold text-gray-900 dark:text-white mb-2">
              {lastAttempt.passed ? 'Congratulations!' : 'Keep Practising'}
            </h2>
            <p className="text-gray-500 dark:text-gray-400 mb-6">
              {lastAttempt.passed ? 'You passed the quiz.' : 'You did not reach the pass mark.'}
            </p>
            <div className="text-6xl font-bold font-playfair mb-2" style={{ color: lastAttempt.passed ? '#22c55e' : '#ef4444' }}>
              {lastAttempt.score}%
            </div>
            <p className="text-sm text-gray-400 mb-8">Pass mark: {activeQuiz?.pass_mark}%</p>
            <div className="flex gap-3 justify-center">
              <button onClick={() => setView('list')} className="btn-outline text-sm">Back to Quizzes</button>
              {!lastAttempt.passed && activeQuiz && activeQuiz.attempts.length < activeQuiz.max_attempts && (
                <button onClick={() => startQuiz(activeQuiz)} className="btn-primary text-sm">Try Again</button>
              )}
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout navItems={studentNavItems} title="Quizzes" subtitle="Test your knowledge">
      <div className="space-y-4">
        {loading ? (
          <div className="space-y-4">
            {[1,2,3].map(i => <div key={i} className="card p-5 animate-pulse h-24" />)}
          </div>
        ) : quizzes.length === 0 ? (
          <div className="text-center py-20">
            <HelpCircle className="w-12 h-12 text-gray-300 dark:text-navy-600 mx-auto mb-3" />
            <p className="text-gray-500 dark:text-gray-400">No quizzes available yet</p>
          </div>
        ) : (
          quizzes.map(quiz => {
            const best = quiz.attempts.reduce<QuizAttempt | null>((b, a) => (!b || a.score > b.score ? a : b), null);
            const attemptsLeft = quiz.max_attempts - quiz.attempts.length;
            const canAttempt = attemptsLeft > 0;
            const hasEnrollment = enrollments.some(e => e.course_id === quiz.course_id && (e.payment_status === 'not_required' || e.payment_status === 'completed'));
            const historyOpen = expandedHistory.has(quiz.id);
            const sortedAttempts = [...quiz.attempts].sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime());

            return (
              <div key={quiz.id} className="card overflow-hidden">
                <div className="p-5 flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${best?.passed ? 'bg-green-100 dark:bg-green-900/30' : 'bg-gold-100 dark:bg-gold-900/30'}`}>
                    {best?.passed
                      ? <CheckCircle2 className="w-6 h-6 text-green-600" />
                      : <HelpCircle className="w-6 h-6 text-gold-600" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 dark:text-white">{quiz.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{quiz.course?.title}</p>
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-500 dark:text-gray-400 flex-wrap">
                      {quiz.time_limit_minutes && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{quiz.time_limit_minutes} min</span>}
                      <span>Pass: {quiz.pass_mark}%</span>
                      {best && <span className={best.passed ? 'text-green-600' : 'text-red-500'}>Best: {best.score}%</span>}
                      <span>{attemptsLeft}/{quiz.max_attempts} attempts left</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {quiz.attempts.length > 0 && (
                      <button
                        onClick={() => toggleHistory(quiz.id)}
                        className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-navy-700 transition-colors"
                        title="View attempt history"
                      >
                        {historyOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    )}
                    {!hasEnrollment ? (
                      <div className="flex items-center gap-1 text-sm text-gray-400">
                        <Lock className="w-4 h-4" /> Locked
                      </div>
                    ) : canAttempt ? (
                      <button onClick={() => startQuiz(quiz)} className="btn-primary text-sm flex items-center gap-1">
                        {quiz.attempts.length === 0 ? 'Start' : 'Retry'} <ChevronRight className="w-4 h-4" />
                      </button>
                    ) : (
                      <div className="flex items-center gap-1 text-sm text-gray-400">
                        <AlertCircle className="w-4 h-4" /> No attempts left
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
                          <div className={`text-sm font-bold ${attempt.passed ? 'text-green-600' : 'text-red-500'}`}>
                            {attempt.score}%
                          </div>
                          <div className={`text-xs px-2 py-0.5 rounded-full font-semibold ${attempt.passed ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                            {attempt.passed ? 'Passed' : 'Failed'}
                          </div>
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
