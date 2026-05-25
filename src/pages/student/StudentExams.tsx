import { useState, useEffect, useCallback } from 'react';
import {
  BookOpen, Clock, CheckCircle2, AlertCircle, ChevronDown, ChevronUp,
  Send, Star, Eye, GraduationCap, ChevronRight, FileText,
} from 'lucide-react';
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

interface CourseGroup {
  courseId: string;
  courseTitle: string;
  exams: Exam[];
}

type View = 'list' | 'taking' | 'result';

export default function StudentExams() {
  const { profile } = useAuth();
  const [groups, setGroups]               = useState<CourseGroup[]>([]);
  const [submissions, setSubmissions]     = useState<Record<string, Submission>>({});
  const [loading, setLoading]             = useState(true);
  const [view, setView]                   = useState<View>('list');
  const [activeExam, setActiveExam]       = useState<Exam | null>(null);
  const [activeSubmission, setActiveSubmission] = useState<Submission | null>(null);
  const [answers, setAnswers]             = useState<Record<string, string>>({});
  const [submitting, setSubmitting]       = useState(false);
  const [timeLeft, setTimeLeft]           = useState<number | null>(null);
  const [expandedResult, setExpandedResult] = useState<string | null>(null);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!profile) return;
    setLoading(true);

    const { data: enrollments } = await supabase.from('course_enrollments').select('course_id').eq('user_id', profile.id);
    const { data: legacyEnrollments } = await supabase.from('enrollments').select('course_id').eq('student_id', profile.id);

    const courseIds = [...new Set([
      ...(enrollments || []).map(e => e.course_id),
      ...(legacyEnrollments || []).map(e => e.course_id),
    ])];

    if (courseIds.length === 0) { setLoading(false); return; }

    const [examsRes, subsRes] = await Promise.all([
      supabase.from('exams')
        .select('*, course:courses(id,title), questions:exam_questions(*)')
        .in('course_id', courseIds)
        .eq('is_published', true)
        .order('created_at', { ascending: false }),
      supabase.from('exam_submissions').select('*').eq('student_id', profile.id),
    ]);

    const exams: Exam[] = (examsRes.data || []).map(e => ({
      ...e,
      questions: [...(e.questions || [])].sort((a, b) => a.order_index - b.order_index),
    }));

    // Group by course
    const groupMap = new Map<string, CourseGroup>();
    exams.forEach(exam => {
      const cid = exam.course?.id || exam.course_id;
      if (!groupMap.has(cid)) {
        groupMap.set(cid, { courseId: cid, courseTitle: exam.course?.title || 'Unknown Course', exams: [] });
      }
      groupMap.get(cid)!.exams.push(exam);
    });

    const grouped = Array.from(groupMap.values());
    setGroups(grouped);
    if (grouped.length > 0 && !selectedCourseId) setSelectedCourseId(grouped[0].courseId);

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
      const { data: sub, error } = await supabase.from('exam_submissions').insert({
        exam_id: activeExam.id,
        student_id: profile.id,
        course_id: activeExam.course_id,
        answers,
        status: 'submitted',
      }).select().single();

      if (error) throw error;

      const { data: { session } } = await supabase.auth.getSession();
      fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/exam-grade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
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

  const formatTime = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

  const statusBadge = (sub: Submission) => {
    if (sub.status === 'finalised')        return <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">Results Available</span>;
    if (sub.status === 'teacher_reviewed') return <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400">Under Review</span>;
    if (sub.status === 'ai_graded')        return <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400">AI Graded — Pending Teacher</span>;
    return <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">Submitted</span>;
  };

  // ── Taking view ──────────────────────────────────────────────────────────────
  if (view === 'taking' && activeExam) {
    const allAnswered = activeExam.questions.every(q => answers[q.id]?.trim());
    const answeredCount = activeExam.questions.filter(q => answers[q.id]?.trim()).length;
    return (
      <DashboardLayout navItems={studentNavItems} title={activeExam.title} subtitle={activeExam.course?.title}>
        <div className="max-w-3xl mx-auto space-y-5">
          {/* Sticky header */}
          <div className="bg-[#14234b] text-white rounded-2xl p-4 flex items-center justify-between gap-4 shadow-md">
            <div>
              <p className="font-bold">{activeExam.title}</p>
              <p className="text-sm text-white/70">{activeExam.course?.title} · {activeExam.total_marks} marks</p>
            </div>
            <div className="flex items-center gap-4 shrink-0">
              {timeLeft !== null && (
                <div className={`flex items-center gap-1.5 text-lg font-mono font-bold px-3 py-1 rounded-lg ${
                  timeLeft < 300 ? 'bg-red-500/20 text-red-300' : 'bg-white/10 text-white'
                }`}>
                  <Clock className="w-4 h-4" />{formatTime(timeLeft)}
                </div>
              )}
              <button onClick={() => setView('list')} className="text-sm text-white/50 hover:text-white transition-colors">Cancel</button>
            </div>
          </div>

          {/* Instructions */}
          {activeExam.instructions && (
            <div className="bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 rounded-xl p-4 text-sm text-sky-800 dark:text-sky-300">
              <strong>Instructions:</strong> {activeExam.instructions}
            </div>
          )}

          {/* Reading passage */}
          {activeExam.passage && (
            <div className="bg-white dark:bg-navy-800 border border-gray-200 dark:border-navy-700 rounded-2xl p-6">
              <h2 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                <BookOpen className="w-4 h-4" />Reading Passage
              </h2>
              <div className="prose prose-sm max-w-none text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">{activeExam.passage}</div>
            </div>
          )}

          {/* Questions */}
          <div className="space-y-4">
            {activeExam.questions.map((q, idx) => (
              <div key={q.id} className="bg-white dark:bg-navy-800 border border-gray-200 dark:border-navy-700 rounded-2xl p-5">
                <div className="flex items-start gap-3 mb-4">
                  <span className="w-7 h-7 rounded-lg bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                    {idx + 1}
                  </span>
                  <div className="flex-1 flex items-start justify-between gap-3">
                    <p className="text-sm font-semibold text-gray-800 dark:text-white leading-snug">{q.question}</p>
                    <span className="text-xs font-semibold text-teal-600 bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800 px-2 py-0.5 rounded-full shrink-0">
                      {q.marks} mark{q.marks !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
                <textarea
                  value={answers[q.id] || ''}
                  onChange={e => setAnswers(a => ({ ...a, [q.id]: e.target.value }))}
                  placeholder="Write your answer here..."
                  rows={4}
                  className="w-full border border-gray-200 dark:border-navy-600 rounded-xl px-4 py-3 text-sm bg-gray-50 dark:bg-navy-700 text-gray-800 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-transparent resize-none"
                />
                {answers[q.id]?.trim() && (
                  <p className="text-xs text-emerald-500 mt-1.5 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Answered
                  </p>
                )}
              </div>
            ))}
          </div>

          {/* Sticky submit bar */}
          <div className="sticky bottom-4 pb-2">
            <div className="bg-white dark:bg-navy-800 border border-gray-200 dark:border-navy-700 rounded-2xl p-4 shadow-xl flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                  {answeredCount} / {activeExam.questions.length} answered
                </p>
                {!allAnswered && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> You can still submit with unanswered questions
                  </p>
                )}
              </div>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex items-center gap-2 px-6 py-2.5 text-sm font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-xl transition-colors disabled:opacity-60 shadow-sm"
              >
                {submitting
                  ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Submitting...</>
                  : <><Send className="w-4 h-4" /> Submit Exam</>}
              </button>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // ── Result view ──────────────────────────────────────────────────────────────
  if (view === 'result' && activeExam && activeSubmission) {
    const isFinalised = activeSubmission.status === 'finalised';
    const scores = isFinalised ? activeSubmission.final_scores : activeSubmission.ai_scores;
    const totalEarned = isFinalised
      ? (activeSubmission.total_score ?? 0)
      : Object.values(activeSubmission.ai_scores || {}).reduce((s, v) => s + (v.score || 0), 0);
    const totalMax = activeExam.total_marks || activeExam.questions.reduce((s, q) => s + q.marks, 0);
    const pct = totalMax > 0 ? Math.round((totalEarned / totalMax) * 100) : 0;

    return (
      <DashboardLayout navItems={studentNavItems} title="Exam Results" subtitle={activeExam.course?.title}>
        <div className="max-w-3xl mx-auto space-y-5">
          <button onClick={() => setView('list')} className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors">
            ← Back to Exams
          </button>

          {/* Score card */}
          <div className={`rounded-2xl p-6 text-white shadow-md ${
            isFinalised
              ? 'bg-gradient-to-br from-teal-600 to-teal-800'
              : 'bg-gradient-to-br from-[#14234b] to-[#1e3a6e]'
          }`}>
            <div className="flex items-center gap-3 mb-5">
              {isFinalised ? <CheckCircle2 className="w-6 h-6" /> : <Clock className="w-6 h-6 text-white/60" />}
              <div>
                <h1 className="text-xl font-bold">{activeExam.title}</h1>
                <p className="text-sm text-white/60">{activeExam.course?.title}</p>
              </div>
            </div>
            {isFinalised ? (
              <div className="flex items-end gap-6">
                <div>
                  <p className="text-5xl font-extrabold">{pct}%</p>
                  <p className="text-sm text-white/60 mt-1">{totalEarned} / {totalMax} marks</p>
                </div>
                <div className="ml-auto text-right">
                  <p className="text-xs text-white/50">Finalised</p>
                  <p className="text-sm font-semibold">
                    {new Date(activeSubmission.finalised_at!).toLocaleDateString('en-AU', { dateStyle: 'medium' })}
                  </p>
                </div>
              </div>
            ) : (
              <div className="bg-white/10 rounded-xl p-4 text-center">
                <div className="mb-2">{statusBadge(activeSubmission)}</div>
                <p className="text-sm text-white/70">Your results will be available once your teacher has reviewed and finalised marks.</p>
              </div>
            )}
          </div>

          {/* Question breakdown */}
          {isFinalised && activeExam.questions.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">Question Breakdown</h2>
              {activeExam.questions.map((q, idx) => {
                const sc = scores?.[q.id] as { score?: number; feedback?: string } | undefined;
                const earned = sc?.score ?? 0;
                const isExpanded = expandedResult === q.id;
                return (
                  <div key={q.id} className="bg-white dark:bg-navy-800 border border-gray-200 dark:border-navy-700 rounded-2xl overflow-hidden">
                    <button
                      onClick={() => setExpandedResult(isExpanded ? null : q.id)}
                      className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 dark:hover:bg-navy-700/50 transition-colors text-left"
                    >
                      <span className="text-xs font-bold text-gray-400 w-6 shrink-0">Q{idx + 1}</span>
                      <p className="flex-1 text-sm font-medium text-gray-700 dark:text-gray-200 truncate">{q.question}</p>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full shrink-0 ${
                        earned >= q.marks ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                        : earned > 0 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                        : 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                      }`}>
                        {earned}/{q.marks}
                      </span>
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />}
                    </button>
                    {isExpanded && (
                      <div className="border-t border-gray-100 dark:border-navy-700 px-5 py-4 space-y-3 bg-gray-50 dark:bg-navy-900/30">
                        <div>
                          <p className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-1">Your Answer</p>
                          <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                            {activeSubmission.answers?.[q.id] || <em className="text-gray-400">No answer provided</em>}
                          </p>
                        </div>
                        {sc?.feedback && (
                          <div>
                            <p className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-1">Teacher Feedback</p>
                            <p className="text-sm text-gray-700 dark:text-gray-300">{sc.feedback}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Show submitted answers while awaiting marks */}
          {!isFinalised && (
            <div className="space-y-3">
              <h2 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">Your Submitted Answers</h2>
              {activeExam.questions.map((q, idx) => (
                <div key={q.id} className="bg-white dark:bg-navy-800 border border-gray-200 dark:border-navy-700 rounded-2xl p-5">
                  <p className="text-xs font-bold text-gray-400 mb-1">Q{idx + 1} · {q.marks} marks</p>
                  <p className="text-sm font-semibold text-gray-700 dark:text-white mb-2">{q.question}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap">
                    {activeSubmission.answers?.[q.id] || <em className="text-gray-400">No answer provided</em>}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </DashboardLayout>
    );
  }

  // ── List view — university-style vertical subject tabs ───────────────────────
  const activeGroup = groups.find(g => g.courseId === selectedCourseId) ?? groups[0] ?? null;

  const courseStats = (group: CourseGroup) => {
    const total     = group.exams.length;
    const submitted = group.exams.filter(e => submissions[e.id]).length;
    const graded    = group.exams.filter(e => submissions[e.id]?.status === 'finalised').length;
    return { total, submitted, graded };
  };

  return (
    <DashboardLayout navItems={studentNavItems} title="Exams" subtitle="Reading comprehension and open-answer assessments">
      {loading ? (
        <div className="flex gap-5">
          <div className="w-64 shrink-0 space-y-2">
            {[1,2,3].map(i => <div key={i} className="h-16 rounded-xl bg-gray-100 dark:bg-navy-800 animate-pulse" />)}
          </div>
          <div className="flex-1 space-y-3">
            {[1,2].map(i => <div key={i} className="h-28 rounded-2xl bg-gray-100 dark:bg-navy-800 animate-pulse" />)}
          </div>
        </div>
      ) : groups.length === 0 ? (
        <div className="text-center py-24">
          <div className="w-20 h-20 rounded-2xl bg-teal-50 dark:bg-teal-900/20 flex items-center justify-center mx-auto mb-4">
            <BookOpen className="w-10 h-10 text-teal-400" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">No exams available yet</h3>
          <p className="text-gray-500 dark:text-gray-400">Your teacher will publish exams when they are ready.</p>
        </div>
      ) : (
        <div className="flex gap-5 items-start">
          {/* ── Left: vertical course tabs ─────────────────────────────────── */}
          <div className="w-64 shrink-0 space-y-1.5 sticky top-4">
            <p className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest px-3 mb-3">Subjects</p>
            {groups.map(group => {
              const { total, submitted, graded } = courseStats(group);
              const isActive  = group.courseId === (selectedCourseId ?? groups[0]?.courseId);
              const allGraded = graded === total && total > 0;
              return (
                <button
                  key={group.courseId}
                  onClick={() => setSelectedCourseId(group.courseId)}
                  className={`w-full text-left px-4 py-3.5 rounded-xl transition-all ${
                    isActive
                      ? 'bg-teal-600 shadow-md shadow-teal-200 dark:shadow-teal-900/30'
                      : 'hover:bg-gray-100 dark:hover:bg-navy-700/60 bg-white dark:bg-navy-800 border border-gray-100 dark:border-navy-700'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                      isActive ? 'bg-white/20' : allGraded ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-teal-100 dark:bg-teal-900/20'
                    }`}>
                      {allGraded
                        ? <CheckCircle2 className={`w-4 h-4 ${isActive ? 'text-white' : 'text-emerald-600'}`} />
                        : <FileText className={`w-4 h-4 ${isActive ? 'text-white' : 'text-teal-600'}`} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold leading-snug truncate ${isActive ? 'text-white' : 'text-gray-800 dark:text-white'}`}>
                        {group.courseTitle}
                      </p>
                      <p className={`text-xs mt-0.5 ${isActive ? 'text-teal-100' : 'text-gray-400 dark:text-gray-500'}`}>
                        {submitted}/{total} submitted
                      </p>
                    </div>
                    {isActive && <ChevronRight className="w-4 h-4 text-white shrink-0" />}
                  </div>
                </button>
              );
            })}
          </div>

          {/* ── Right: exam list for selected course ──────────────────────── */}
          <div className="flex-1 min-w-0">
            {activeGroup && (
              <>
                {/* Course header */}
                <div className="flex items-center gap-3 mb-5 p-4 bg-white dark:bg-navy-800 rounded-2xl border border-gray-100 dark:border-navy-700 shadow-sm">
                  <div className="w-10 h-10 rounded-xl bg-teal-100 dark:bg-teal-900/20 flex items-center justify-center shrink-0">
                    <GraduationCap className="w-5 h-5 text-teal-600" />
                  </div>
                  <div>
                    <h2 className="font-bold text-gray-900 dark:text-white">{activeGroup.courseTitle}</h2>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {activeGroup.exams.length} exam{activeGroup.exams.length !== 1 ? 's' : ''} ·{' '}
                      {courseStats(activeGroup).submitted} submitted
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  {activeGroup.exams.map((exam, eIdx) => {
                    const sub    = submissions[exam.id];
                    const canTake = !sub;
                    return (
                      <div key={exam.id} className="bg-white dark:bg-navy-800 border border-gray-200 dark:border-navy-700 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex items-start gap-4">
                          {/* Number badge */}
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                            sub?.status === 'finalised' ? 'bg-emerald-100 dark:bg-emerald-900/30'
                            : sub ? 'bg-amber-100 dark:bg-amber-900/20'
                            : 'bg-gray-100 dark:bg-navy-700'
                          }`}>
                            <span className="text-sm font-bold text-gray-500 dark:text-gray-400">{eIdx + 1}</span>
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-3 mb-2">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h3 className="font-bold text-gray-900 dark:text-white">{exam.title}</h3>
                                  {sub && statusBadge(sub)}
                                </div>
                                {exam.description && (
                                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">{exam.description}</p>
                                )}
                              </div>
                              <div className="shrink-0">
                                {sub?.status === 'finalised' ? (
                                  <button
                                    onClick={() => viewResult(exam, sub)}
                                    className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-teal-700 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/20 hover:bg-teal-100 dark:hover:bg-teal-900/40 border border-teal-200 dark:border-teal-800 rounded-xl transition-colors"
                                  >
                                    <Star className="w-4 h-4" /> View Results
                                  </button>
                                ) : sub ? (
                                  <button
                                    onClick={() => viewResult(exam, sub)}
                                    className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-navy-700 hover:bg-gray-100 dark:hover:bg-navy-600 border border-gray-200 dark:border-navy-600 rounded-xl transition-colors"
                                  >
                                    <Eye className="w-4 h-4" /> View Submission
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => startExam(exam)}
                                    className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-xl transition-colors shadow-sm"
                                  >
                                    <BookOpen className="w-4 h-4" /> Start Exam
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Meta row */}
                            <div className="flex items-center gap-4 text-xs text-gray-400 dark:text-gray-500 flex-wrap">
                              <span className="flex items-center gap-1"><Star className="w-3 h-3" />{exam.total_marks} marks</span>
                              <span className="flex items-center gap-1"><BookOpen className="w-3 h-3" />{exam.questions?.length || 0} questions</span>
                              {exam.time_limit_minutes > 0 && (
                                <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{exam.time_limit_minutes} min</span>
                              )}
                              {canTake && exam.passage && (
                                <span className="text-sky-500 dark:text-sky-400 font-medium">Reading comprehension</span>
                              )}
                              {sub?.submitted_at && (
                                <span>Submitted {new Date(sub.submitted_at).toLocaleDateString('en-AU', { dateStyle: 'medium' })}</span>
                              )}
                            </div>
                          </div>
                        </div>
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
