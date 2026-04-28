import { useState, useEffect, useCallback } from 'react';
import { BookOpen, Clock, CheckCircle2, AlertCircle, ChevronDown, ChevronUp, Send, Star, Eye } from 'lucide-react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { studentNavItems } from './studentNav';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'sonner';

interface ExamQuestion {
  id: string;
  question: string;
  marks: number;
  order_index: number;
}

interface Exam {
  id: string;
  course_id: string;
  title: string;
  description: string;
  instructions: string;
  passage: string;
  time_limit_minutes: number;
  total_marks: number;
  course: { id: string; title: string };
  questions: ExamQuestion[];
}

interface AiScore {
  score: number;
  max_score: number;
  reasoning: string;
  suggestion: string;
}

interface Submission {
  id: string;
  exam_id: string;
  status: 'submitted' | 'ai_graded' | 'teacher_reviewed' | 'finalised';
  answers: Record<string, string>;
  ai_scores: Record<string, AiScore>;
  final_scores: Record<string, { score: number; feedback: string }>;
  total_score: number | null;
  max_score: number | null;
  percentage: number | null;
  submitted_at: string;
  finalised_at: string | null;
}

type View = 'list' | 'taking' | 'result';

export default function StudentExams() {
  const { profile } = useAuth();
  const [exams, setExams] = useState<Exam[]>([]);
  const [submissions, setSubmissions] = useState<Record<string, Submission>>({});
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>('list');
  const [activeExam, setActiveExam] = useState<Exam | null>(null);
  const [activeSubmission, setActiveSubmission] = useState<Submission | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [expandedResult, setExpandedResult] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!profile) return;
    setLoading(true);

    const { data: enrollments } = await supabase
      .from('course_enrollments')
      .select('course_id')
      .eq('user_id', profile.id);
    const { data: legacyEnrollments } = await supabase
      .from('enrollments')
      .select('course_id')
      .eq('student_id', profile.id);

    const courseIds = [
      ...new Set([
        ...(enrollments || []).map(e => e.course_id),
        ...(legacyEnrollments || []).map(e => e.course_id),
      ]),
    ];

    if (courseIds.length === 0) { setLoading(false); return; }

    const [examsRes, subsRes] = await Promise.all([
      supabase
        .from('exams')
        .select('*, course:courses(id,title), questions:exam_questions(*)')
        .in('course_id', courseIds)
        .eq('is_published', true)
        .order('created_at', { ascending: false }),
      supabase
        .from('exam_submissions')
        .select('*')
        .eq('student_id', profile.id),
    ]);

    if (examsRes.data) {
      setExams(
        examsRes.data.map(e => ({
          ...e,
          questions: [...(e.questions || [])].sort((a, b) => a.order_index - b.order_index),
        }))
      );
    }
    if (subsRes.data) {
      const map: Record<string, Submission> = {};
      for (const s of subsRes.data) map[s.exam_id] = s as Submission;
      setSubmissions(map);
    }
    setLoading(false);
  }, [profile]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Timer
  useEffect(() => {
    if (view !== 'taking' || !activeExam?.time_limit_minutes) return;
    setTimeLeft(activeExam.time_limit_minutes * 60);
    const interval = setInterval(() => {
      setTimeLeft(t => {
        if (t === null || t <= 1) { clearInterval(interval); handleSubmit(); return 0; }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [view, activeExam?.id]);

  const startExam = (exam: Exam) => {
    setActiveExam(exam);
    setAnswers({});
    setTimeLeft(exam.time_limit_minutes > 0 ? exam.time_limit_minutes * 60 : null);
    setView('taking');
  };

  const viewResult = (exam: Exam, sub: Submission) => {
    setActiveExam(exam);
    setActiveSubmission(sub);
    setView('result');
  };

  const handleSubmit = async () => {
    if (!activeExam || !profile || submitting) return;
    setSubmitting(true);
    try {
      const { data: sub, error } = await supabase
        .from('exam_submissions')
        .insert({
          exam_id: activeExam.id,
          student_id: profile.id,
          course_id: activeExam.course_id,
          answers,
          status: 'submitted',
        })
        .select()
        .single();

      if (error) throw error;

      // Trigger AI grading
      const { data: { session } } = await supabase.auth.getSession();
      fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/exam-grade`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ submission_id: sub.id }),
      });

      toast.success('Exam submitted! AI is grading your answers now.');
      await fetchData();
      setView('list');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to submit');
    } finally {
      setSubmitting(false);
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const statusBadge = (sub: Submission) => {
    if (sub.status === 'finalised') return <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Results Available</span>;
    if (sub.status === 'teacher_reviewed') return <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-teal-100 text-teal-700">Under Review</span>;
    if (sub.status === 'ai_graded') return <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-sky-100 text-sky-700">AI Graded — Pending Teacher</span>;
    return <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Submitted</span>;
  };

  // ─── Taking view ───────────────────────────────────────────────────────────
  if (view === 'taking' && activeExam) {
    const allAnswered = activeExam.questions.every(q => answers[q.id]?.trim());
    return (
      <DashboardLayout navItems={studentNavItems} role="student">
        <div className="max-w-3xl mx-auto px-4 py-6">
          {/* Header */}
          <div className="bg-slate-800 text-white rounded-2xl p-5 mb-6 flex items-center justify-between gap-4">
            <div>
              <h1 className="text-lg font-bold">{activeExam.title}</h1>
              <p className="text-sm text-slate-300">{activeExam.course?.title} · {activeExam.total_marks} marks</p>
            </div>
            <div className="flex items-center gap-4 shrink-0">
              {timeLeft !== null && (
                <div className={`flex items-center gap-1.5 text-lg font-mono font-bold ${timeLeft < 300 ? 'text-red-400' : 'text-white'}`}>
                  <Clock className="w-5 h-5" />
                  {formatTime(timeLeft)}
                </div>
              )}
              <button onClick={() => setView('list')} className="text-sm text-slate-400 hover:text-white transition-colors">
                Cancel
              </button>
            </div>
          </div>

          {/* Instructions */}
          {activeExam.instructions && (
            <div className="bg-sky-50 border border-sky-200 rounded-xl p-4 mb-6 text-sm text-sky-800">
              <strong>Instructions:</strong> {activeExam.instructions}
            </div>
          )}

          {/* Passage */}
          {activeExam.passage && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 mb-6">
              <h2 className="text-sm font-bold text-slate-600 uppercase tracking-wide mb-3">Reading Passage</h2>
              <div className="prose prose-sm max-w-none text-slate-700 leading-relaxed whitespace-pre-wrap">{activeExam.passage}</div>
            </div>
          )}

          {/* Questions */}
          <div className="space-y-5 mb-8">
            {activeExam.questions.map((q, idx) => (
              <div key={q.id} className="bg-white border border-slate-200 rounded-xl p-5">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <p className="text-sm font-semibold text-slate-800 leading-snug">
                    <span className="text-slate-400 mr-2">Q{idx + 1}.</span>{q.question}
                  </p>
                  <span className="text-xs font-semibold text-teal-600 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-full shrink-0">
                    {q.marks} mark{q.marks !== 1 ? 's' : ''}
                  </span>
                </div>
                <textarea
                  value={answers[q.id] || ''}
                  onChange={e => setAnswers(a => ({ ...a, [q.id]: e.target.value }))}
                  placeholder="Write your answer here..."
                  rows={4}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-700 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-transparent resize-none"
                />
                {answers[q.id]?.trim() && (
                  <p className="text-xs text-emerald-500 mt-1 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Answered
                  </p>
                )}
              </div>
            ))}
          </div>

          {/* Submit */}
          <div className="sticky bottom-4">
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-lg flex items-center justify-between gap-4">
              <p className="text-sm text-slate-500">
                {activeExam.questions.filter(q => answers[q.id]?.trim()).length} of {activeExam.questions.length} answered
              </p>
              {!allAnswered && (
                <p className="text-xs text-amber-600 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" /> You can submit with unanswered questions
                </p>
              )}
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex items-center gap-2 px-6 py-2.5 text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-xl transition-colors disabled:opacity-60"
              >
                {submitting ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Submitting...</> : <><Send className="w-4 h-4" /> Submit Exam</>}
              </button>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // ─── Result view ───────────────────────────────────────────────────────────
  if (view === 'result' && activeExam && activeSubmission) {
    const isFinalised = activeSubmission.status === 'finalised';
    const scores = isFinalised ? activeSubmission.final_scores : activeSubmission.ai_scores;
    const totalEarned = isFinalised ? (activeSubmission.total_score ?? 0) : Object.values(activeSubmission.ai_scores || {}).reduce((s, v) => s + (v.score || 0), 0);
    const totalMax = activeExam.total_marks || activeExam.questions.reduce((s, q) => s + q.marks, 0);
    const pct = totalMax > 0 ? Math.round((totalEarned / totalMax) * 100) : 0;

    return (
      <DashboardLayout navItems={studentNavItems} role="student">
        <div className="max-w-3xl mx-auto px-4 py-6">
          <button onClick={() => setView('list')} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4 transition-colors">
            ← Back to Exams
          </button>

          {/* Score summary */}
          <div className={`rounded-2xl p-6 mb-6 text-white ${isFinalised ? 'bg-gradient-to-br from-teal-600 to-teal-800' : 'bg-gradient-to-br from-slate-600 to-slate-800'}`}>
            <div className="flex items-center gap-3 mb-4">
              {isFinalised ? <CheckCircle2 className="w-6 h-6" /> : <Clock className="w-6 h-6 text-slate-300" />}
              <div>
                <h1 className="text-xl font-bold">{activeExam.title}</h1>
                <p className="text-sm opacity-75">{activeExam.course?.title}</p>
              </div>
            </div>
            {isFinalised ? (
              <div className="flex items-end gap-4">
                <div>
                  <p className="text-5xl font-bold">{pct}%</p>
                  <p className="text-sm opacity-75 mt-1">{totalEarned} / {totalMax} marks</p>
                </div>
                <div className="ml-auto text-right">
                  <p className="text-sm opacity-75">Finalised</p>
                  <p className="text-sm font-medium">{new Date(activeSubmission.finalised_at!).toLocaleDateString('en-AU', { dateStyle: 'medium' })}</p>
                </div>
              </div>
            ) : (
              <div className="bg-white/10 rounded-xl p-4 text-center">
                <p className="text-sm font-semibold">{statusBadge(activeSubmission)}</p>
                <p className="text-sm opacity-75 mt-2">Your results will be available once your teacher has reviewed and finalised the marks.</p>
              </div>
            )}
          </div>

          {/* Per-question results (only when finalised) */}
          {isFinalised && activeExam.questions.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Question Breakdown</h2>
              {activeExam.questions.map((q, idx) => {
                const sc = scores?.[q.id] as { score?: number; feedback?: string } | undefined;
                const earned = sc?.score ?? 0;
                const isExpanded = expandedResult === q.id;
                return (
                  <div key={q.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                    <button
                      onClick={() => setExpandedResult(isExpanded ? null : q.id)}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors text-left"
                    >
                      <span className="text-xs font-bold text-slate-400 w-6 shrink-0">Q{idx + 1}</span>
                      <p className="flex-1 text-sm font-medium text-slate-700 truncate">{q.question}</p>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full shrink-0 ${earned >= q.marks ? 'bg-emerald-100 text-emerald-700' : earned > 0 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-600'}`}>
                        {earned}/{q.marks}
                      </span>
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />}
                    </button>
                    {isExpanded && (
                      <div className="border-t border-slate-100 px-4 py-3 space-y-3 bg-slate-50">
                        <div>
                          <p className="text-xs font-semibold text-slate-500 mb-1">Your Answer</p>
                          <p className="text-sm text-slate-700 whitespace-pre-wrap">{activeSubmission.answers?.[q.id] || <em className="text-slate-400">No answer provided</em>}</p>
                        </div>
                        {sc?.feedback && (
                          <div>
                            <p className="text-xs font-semibold text-slate-500 mb-1">Teacher Feedback</p>
                            <p className="text-sm text-slate-700">{sc.feedback}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Show answers for non-finalised */}
          {!isFinalised && (
            <div className="space-y-3">
              <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Your Submitted Answers</h2>
              {activeExam.questions.map((q, idx) => (
                <div key={q.id} className="bg-white border border-slate-200 rounded-xl p-4">
                  <p className="text-xs font-bold text-slate-400 mb-1">Q{idx + 1} · {q.marks} marks</p>
                  <p className="text-sm font-semibold text-slate-700 mb-2">{q.question}</p>
                  <p className="text-sm text-slate-600 whitespace-pre-wrap">{activeSubmission.answers?.[q.id] || <em className="text-slate-400">No answer provided</em>}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </DashboardLayout>
    );
  }

  // ─── List view ─────────────────────────────────────────────────────────────
  return (
    <DashboardLayout navItems={studentNavItems} role="student">
      <div className="p-4 sm:p-6 max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Exams</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Reading comprehension and open-answer assessments</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-4 border-teal-200 border-t-teal-600 rounded-full animate-spin" />
          </div>
        ) : exams.length === 0 ? (
          <div className="text-center py-20 text-slate-400">
            <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="font-medium">No exams available yet</p>
            <p className="text-sm mt-1">Your teacher will publish exams when they are ready</p>
          </div>
        ) : (
          <div className="space-y-4">
            {exams.map(exam => {
              const sub = submissions[exam.id];
              const canTake = !sub;
              return (
                <div key={exam.id} className="bg-white dark:bg-navy-800 border border-slate-200 dark:border-navy-700 rounded-2xl p-5">
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <h2 className="text-base font-bold text-slate-800 dark:text-white">{exam.title}</h2>
                        {sub && statusBadge(sub)}
                      </div>
                      <p className="text-sm text-slate-500">{exam.course?.title}</p>
                      {exam.description && <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{exam.description}</p>}
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      {sub?.status === 'finalised' ? (
                        <button
                          onClick={() => viewResult(exam, sub)}
                          className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-xl transition-colors"
                        >
                          <Star className="w-4 h-4" /> View Results
                        </button>
                      ) : sub ? (
                        <button
                          onClick={() => viewResult(exam, sub)}
                          className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-slate-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors"
                        >
                          <Eye className="w-4 h-4" /> View Submission
                        </button>
                      ) : (
                        <button
                          onClick={() => startExam(exam)}
                          className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-xl transition-colors"
                        >
                          <BookOpen className="w-4 h-4" /> Start Exam
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-slate-400 flex-wrap">
                    <span className="flex items-center gap-1"><Star className="w-3 h-3" />{exam.total_marks} marks</span>
                    <span className="flex items-center gap-1"><BookOpen className="w-3 h-3" />{exam.questions?.length || 0} questions</span>
                    {exam.time_limit_minutes > 0 && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{exam.time_limit_minutes} min limit</span>}
                    {canTake && exam.passage && <span className="text-sky-500 font-medium">Reading comprehension</span>}
                    {sub?.submitted_at && <span>Submitted {new Date(sub.submitted_at).toLocaleDateString('en-AU', { dateStyle: 'medium' })}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
