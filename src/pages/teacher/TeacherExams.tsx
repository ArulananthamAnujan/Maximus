import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, ChevronDown, ChevronUp, BookOpen, Clock, Star, CheckCircle2, AlertCircle, CreditCard as Edit2, Eye, Check, X, Users, Sparkles, FileText, ChevronRight } from 'lucide-react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { teacherNavItems } from './teacherNav';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'sonner';

interface Course { id: string; title: string; }

interface ExamQuestion {
  id: string;
  question: string;
  marks: number;
  sample_answer: string;
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
  is_published: boolean;
  created_at: string;
  questions: ExamQuestion[];
  course?: { title: string };
}

interface AiScore { score: number; max_score: number; reasoning: string; suggestion: string; }

interface Submission {
  id: string;
  exam_id: string;
  student_id: string;
  status: string;
  answers: Record<string, string>;
  ai_scores: Record<string, AiScore>;
  teacher_scores: Record<string, { score: number; feedback: string }>;
  final_scores: Record<string, { score: number; feedback: string }>;
  total_score: number | null;
  max_score: number | null;
  percentage: number | null;
  submitted_at: string;
  student?: { full_name: string; email: string };
}

type Panel = 'list' | 'create' | 'review';

export default function TeacherExams() {
  const { profile } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [submissions, setSubmissions] = useState<Record<string, Submission[]>>({});
  const [loading, setLoading] = useState(true);
  const [panel, setPanel] = useState<Panel>('list');
  const [expandedExam, setExpandedExam]         = useState<string | null>(null);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [activeExam, setActiveExam] = useState<Exam | null>(null);
  const [reviewSub, setReviewSub] = useState<Submission | null>(null);
  const [finalising, setFinalising] = useState(false);

  // Create form
  const [form, setForm] = useState({
    course_id: '', title: '', description: '', instructions: 'Read the passage carefully and answer all questions in full sentences.',
    passage: '', time_limit_minutes: '60',
  });
  const [questions, setQuestions] = useState<{ question: string; marks: number; sample_answer: string }[]>([
    { question: '', marks: 5, sample_answer: '' },
  ]);
  const [saving, setSaving] = useState(false);

  // Review state: teacher score overrides per question
  const [teacherEdits, setTeacherEdits] = useState<Record<string, { score: string; feedback: string }>>({});
  const [expandedQ, setExpandedQ] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!profile) return;
    setLoading(true);

    const { data: coursesData } = await supabase
      .from('courses').select('id, title').eq('teacher_id', profile.id);
    if (coursesData) {
      setCourses(coursesData);
      if (!selectedCourseId && coursesData.length > 0) setSelectedCourseId(coursesData[0].id);
    }

    const courseIds = (coursesData || []).map(c => c.id);
    if (courseIds.length === 0) { setLoading(false); return; }

    const { data: examsData } = await supabase
      .from('exams')
      .select('*, course:courses(title), questions:exam_questions(*)')
      .in('course_id', courseIds)
      .order('created_at', { ascending: false });

    if (examsData) {
      setExams(examsData.map(e => ({
        ...e,
        questions: [...(e.questions || [])].sort((a, b) => a.order_index - b.order_index),
      })));

      // Fetch submissions for all exams
      const examIds = examsData.map(e => e.id);
      if (examIds.length > 0) {
        const { data: subsData } = await supabase
          .from('exam_submissions')
          .select('*, student:profiles(full_name, email)')
          .in('exam_id', examIds)
          .order('submitted_at');
        if (subsData) {
          const map: Record<string, Submission[]> = {};
          for (const s of subsData) {
            if (!map[s.exam_id]) map[s.exam_id] = [];
            map[s.exam_id].push(s as Submission);
          }
          setSubmissions(map);
        }
      }
    }
    setLoading(false);
  }, [profile]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCreate = async () => {
    if (!profile || !form.course_id || !form.title) { toast.error('Course and title are required'); return; }
    if (questions.some(q => !q.question.trim())) { toast.error('All questions need text'); return; }
    setSaving(true);
    try {
      const totalMarks = questions.reduce((s, q) => s + q.marks, 0);
      const { data: exam, error } = await supabase.from('exams').insert({
        course_id: form.course_id,
        teacher_id: profile.id,
        title: form.title,
        description: form.description,
        instructions: form.instructions,
        passage: form.passage,
        time_limit_minutes: parseInt(form.time_limit_minutes) || 0,
        total_marks: totalMarks,
        is_published: false,
      }).select().single();

      if (error) throw error;

      const qRows = questions.map((q, i) => ({
        exam_id: exam.id,
        question: q.question,
        marks: q.marks,
        sample_answer: q.sample_answer,
        order_index: i,
      }));
      await supabase.from('exam_questions').insert(qRows);

      toast.success('Exam created');
      setPanel('list');
      setForm({ course_id: '', title: '', description: '', instructions: 'Read the passage carefully and answer all questions in full sentences.', passage: '', time_limit_minutes: '60' });
      setQuestions([{ question: '', marks: 5, sample_answer: '' }]);
      fetchData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create');
    } finally {
      setSaving(false);
    }
  };

  const togglePublish = async (exam: Exam) => {
    const { error } = await supabase.from('exams').update({ is_published: !exam.is_published }).eq('id', exam.id);
    if (error) { toast.error('Failed to update'); return; }
    toast.success(exam.is_published ? 'Exam unpublished' : 'Exam published — students can now take it');
    fetchData();
  };

  const deleteExam = async (id: string) => {
    if (!confirm('Delete this exam and all submissions?')) return;
    await supabase.from('exams').delete().eq('id', id);
    toast.success('Exam deleted');
    fetchData();
  };

  const openReview = (exam: Exam, sub: Submission) => {
    setActiveExam(exam);
    setReviewSub(sub);
    // Pre-fill teacher edits from existing ai_scores or teacher_scores
    const edits: Record<string, { score: string; feedback: string }> = {};
    for (const q of exam.questions) {
      const ts = sub.teacher_scores?.[q.id];
      const ai = sub.ai_scores?.[q.id];
      edits[q.id] = {
        score: String(ts?.score ?? ai?.score ?? ''),
        feedback: ts?.feedback ?? ai?.suggestion ?? '',
      };
    }
    setTeacherEdits(edits);
    setExpandedQ(null);
    setPanel('review');
  };

  const handleFinalise = async () => {
    if (!activeExam || !reviewSub || !profile) return;
    setFinalising(true);
    try {
      const finalScores: Record<string, { score: number; feedback: string }> = {};
      let totalEarned = 0;
      const totalMax = activeExam.questions.reduce((s, q) => s + q.marks, 0);

      for (const q of activeExam.questions) {
        const edit = teacherEdits[q.id];
        const score = Math.max(0, Math.min(q.marks, parseInt(edit?.score || '0') || 0));
        finalScores[q.id] = { score, feedback: edit?.feedback || '' };
        totalEarned += score;
      }

      const pct = totalMax > 0 ? parseFloat(((totalEarned / totalMax) * 100).toFixed(2)) : 0;

      const { error } = await supabase.from('exam_submissions').update({
        teacher_scores: teacherEdits,
        final_scores: finalScores,
        status: 'finalised',
        total_score: totalEarned,
        max_score: totalMax,
        percentage: pct,
        teacher_reviewed_at: new Date().toISOString(),
        finalised_at: new Date().toISOString(),
      }).eq('id', reviewSub.id);

      if (error) throw error;
      toast.success(`Marks finalised — student can now see their ${pct}% result`);
      setPanel('list');
      fetchData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to finalise');
    } finally {
      setFinalising(false);
    }
  };

  // ─── Review panel ──────────────────────────────────────────────────────────
  if (panel === 'review' && activeExam && reviewSub) {
    return (
      <DashboardLayout navItems={teacherNavItems} role="teacher">
        <div className="max-w-3xl mx-auto px-4 py-6">
          <button onClick={() => setPanel('list')} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4 transition-colors">
            ← Back to Exams
          </button>

          <div className="bg-slate-800 text-white rounded-2xl p-5 mb-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h1 className="text-lg font-bold">{activeExam.title}</h1>
                <p className="text-sm text-slate-300">Student: {reviewSub.student?.full_name || 'Unknown'}</p>
                <p className="text-xs text-slate-400 mt-0.5">Submitted {new Date(reviewSub.submitted_at).toLocaleDateString('en-AU', { dateStyle: 'long' })}</p>
              </div>
              <span className={`text-xs font-semibold px-2 py-1 rounded-full ${reviewSub.status === 'ai_graded' ? 'bg-sky-500/20 text-sky-300' : 'bg-slate-500/30 text-slate-300'}`}>
                {reviewSub.status === 'ai_graded' ? 'AI Graded' : reviewSub.status}
              </span>
            </div>
          </div>

          {/* AI overall feedback */}
          {reviewSub.teacher_scores?._overall_feedback && (
            <div className="bg-sky-50 border border-sky-200 rounded-xl p-4 mb-6">
              <div className="flex items-center gap-2 mb-1">
                <Sparkles className="w-4 h-4 text-sky-500" />
                <p className="text-xs font-bold text-sky-700 uppercase tracking-wide">AI Overall Feedback</p>
              </div>
              <p className="text-sm text-sky-800">{reviewSub.teacher_scores._overall_feedback as unknown as string}</p>
            </div>
          )}

          {/* Questions */}
          <div className="space-y-4 mb-6">
            {activeExam.questions.map((q, idx) => {
              const ai = reviewSub.ai_scores?.[q.id];
              const edit = teacherEdits[q.id] || { score: '', feedback: '' };
              const isOpen = expandedQ === q.id;
              return (
                <div key={q.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <button
                    onClick={() => setExpandedQ(isOpen ? null : q.id)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors text-left"
                  >
                    <span className="text-xs font-bold text-slate-400 shrink-0 w-5">Q{idx + 1}</span>
                    <p className="flex-1 text-sm font-semibold text-slate-700 truncate">{q.question}</p>
                    <div className="flex items-center gap-2 shrink-0">
                      {ai && (
                        <span className="text-xs text-sky-600 font-semibold">AI: {ai.score}/{ai.max_score}</span>
                      )}
                      <span className="text-xs text-slate-400">Max: {q.marks}</span>
                      {isOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                    </div>
                  </button>

                  {isOpen && (
                    <div className="border-t border-slate-100 p-4 space-y-4 bg-slate-50">
                      {/* Student answer */}
                      <div>
                        <p className="text-xs font-bold text-slate-500 mb-1">Student's Answer</p>
                        <p className="text-sm text-slate-700 whitespace-pre-wrap bg-white border border-slate-200 rounded-lg p-3">
                          {reviewSub.answers?.[q.id] || <em className="text-slate-400">No answer provided</em>}
                        </p>
                      </div>
                      {/* Model answer */}
                      {q.sample_answer && (
                        <div>
                          <p className="text-xs font-bold text-slate-500 mb-1">Model Answer</p>
                          <p className="text-sm text-slate-600 whitespace-pre-wrap">{q.sample_answer}</p>
                        </div>
                      )}
                      {/* AI assessment */}
                      {ai && (
                        <div className="bg-sky-50 border border-sky-200 rounded-lg p-3">
                          <div className="flex items-center gap-2 mb-1">
                            <Sparkles className="w-3.5 h-3.5 text-sky-500" />
                            <p className="text-xs font-bold text-sky-700">AI Assessment — {ai.score}/{ai.max_score} marks</p>
                          </div>
                          <p className="text-xs text-sky-800 mb-1">{ai.reasoning}</p>
                          {ai.suggestion && ai.suggestion !== 'Well done!' && (
                            <p className="text-xs text-sky-600 italic">Tip: {ai.suggestion}</p>
                          )}
                        </div>
                      )}
                      {/* Teacher override */}
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-1">Your Score (max {q.marks})</label>
                          <input
                            type="number"
                            min={0}
                            max={q.marks}
                            value={edit.score}
                            onChange={e => setTeacherEdits(prev => ({ ...prev, [q.id]: { ...prev[q.id], score: e.target.value } }))}
                            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="block text-xs font-semibold text-slate-600 mb-1">Feedback to Student</label>
                          <input
                            type="text"
                            value={edit.feedback}
                            onChange={e => setTeacherEdits(prev => ({ ...prev, [q.id]: { ...prev[q.id], feedback: e.target.value } }))}
                            placeholder="Optional feedback..."
                            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Score preview + finalise */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm font-bold text-slate-700">Total Score Preview</p>
                <p className="text-2xl font-bold text-teal-600 mt-1">
                  {activeExam.questions.reduce((s, q) => s + (parseInt(teacherEdits[q.id]?.score || '0') || 0), 0)}
                  <span className="text-slate-400 text-base font-normal"> / {activeExam.questions.reduce((s, q) => s + q.marks, 0)}</span>
                </p>
              </div>
              <button
                onClick={handleFinalise}
                disabled={finalising}
                className="flex items-center gap-2 px-6 py-3 text-sm font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-xl transition-colors disabled:opacity-60"
              >
                {finalising ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Finalising...</> : <><Check className="w-4 h-4" /> Finalise & Release Marks</>}
              </button>
            </div>
            <p className="text-xs text-slate-400">Once finalised, the student will see their result immediately.</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // ─── Create panel ──────────────────────────────────────────────────────────
  if (panel === 'create') {
    return (
      <DashboardLayout navItems={teacherNavItems} role="teacher">
        <div className="max-w-3xl mx-auto px-4 py-6">
          <div className="flex items-center gap-3 mb-6">
            <button onClick={() => setPanel('list')} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors">
              <X className="w-4 h-4" />
            </button>
            <h1 className="text-xl font-bold text-slate-900">Create Exam</h1>
          </div>

          <div className="space-y-5">
            {/* Basic info */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
              <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Exam Details</h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Course <span className="text-red-500">*</span></label>
                  <select value={form.course_id} onChange={e => setForm(f => ({ ...f, course_id: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400">
                    <option value="">Select a course...</option>
                    {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Exam Title <span className="text-red-500">*</span></label>
                  <input type="text" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. IELTS Reading Comprehension Practice" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Description</label>
                  <input type="text" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Brief description for students" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Time Limit (minutes, 0 = no limit)</label>
                  <input type="number" min={0} value={form.time_limit_minutes} onChange={e => setForm(f => ({ ...f, time_limit_minutes: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Instructions for Students</label>
                  <input type="text" value={form.instructions} onChange={e => setForm(f => ({ ...f, instructions: e.target.value }))} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" />
                </div>
              </div>
            </div>

            {/* Passage */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5">
              <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-3">Reading Passage / Stimulus</h2>
              <p className="text-xs text-slate-400 mb-3">Leave blank if this is a question-only exam with no reading passage.</p>
              <textarea
                value={form.passage}
                onChange={e => setForm(f => ({ ...f, passage: e.target.value }))}
                placeholder="Paste the reading passage here. Students will see this before answering questions."
                rows={8}
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-700 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-400 resize-none"
              />
            </div>

            {/* Questions */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Questions</h2>
                <button
                  onClick={() => setQuestions(q => [...q, { question: '', marks: 5, sample_answer: '' }])}
                  className="flex items-center gap-1.5 text-xs font-semibold text-teal-600 hover:text-teal-700 border border-teal-200 hover:bg-teal-50 rounded-lg px-3 py-1.5 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Question
                </button>
              </div>
              <div className="space-y-4">
                {questions.map((q, idx) => (
                  <div key={idx} className="border border-slate-200 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-bold text-slate-500">Question {idx + 1}</span>
                      {questions.length > 1 && (
                        <button onClick={() => setQuestions(qs => qs.filter((_, i) => i !== idx))} className="p-1 text-slate-400 hover:text-red-500 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <div className="space-y-3">
                      <div className="flex gap-3">
                        <div className="flex-1">
                          <label className="block text-xs font-semibold text-slate-500 mb-1">Question Text <span className="text-red-500">*</span></label>
                          <textarea
                            value={q.question}
                            onChange={e => setQuestions(qs => qs.map((x, i) => i === idx ? { ...x, question: e.target.value } : x))}
                            placeholder="e.g. According to the passage, what is the main argument?"
                            rows={2}
                            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 resize-none"
                          />
                        </div>
                        <div className="w-20">
                          <label className="block text-xs font-semibold text-slate-500 mb-1">Marks</label>
                          <input
                            type="number"
                            min={1}
                            value={q.marks}
                            onChange={e => setQuestions(qs => qs.map((x, i) => i === idx ? { ...x, marks: parseInt(e.target.value) || 1 } : x))}
                            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1">Model / Sample Answer (used by AI for grading)</label>
                        <textarea
                          value={q.sample_answer}
                          onChange={e => setQuestions(qs => qs.map((x, i) => i === idx ? { ...x, sample_answer: e.target.value } : x))}
                          placeholder="Write the ideal answer. AI will use this to assess student responses."
                          rows={2}
                          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-600 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-400 resize-none"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
                <span>{questions.length} question{questions.length !== 1 ? 's' : ''}</span>
                <span className="font-semibold text-teal-600">Total: {questions.reduce((s, q) => s + q.marks, 0)} marks</span>
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <button onClick={() => setPanel('list')} className="px-4 py-2 text-sm border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
              <button onClick={handleCreate} disabled={saving} className="flex items-center gap-2 px-6 py-2 text-sm font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-xl transition-colors disabled:opacity-60">
                {saving ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Saving...</> : 'Create Exam (Draft)'}
              </button>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // ─── List panel ────────────────────────────────────────────────────────────
  const courseExams = exams.filter(e => e.course_id === selectedCourseId);
  const examCountByCourse = (cid: string) => exams.filter(e => e.course_id === cid).length;
  const pendingByCourse   = (cid: string) => exams
    .filter(e => e.course_id === cid)
    .reduce((n, e) => n + (submissions[e.id] || []).filter(s => s.status === 'ai_graded' || s.status === 'submitted').length, 0);

  return (
    <DashboardLayout navItems={teacherNavItems} title="Exams" subtitle="AI-marked, teacher-reviewed open-answer assessments">
      <div className="space-y-5">
        <div className="flex justify-end">
          <button onClick={() => setPanel('create')} className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-xl transition-colors shadow-sm">
            <Plus className="w-4 h-4" /> New Exam
          </button>
        </div>

        {loading ? (
          <div className="flex gap-5">
            <div className="w-60 shrink-0 space-y-2">
              {[1,2,3].map(i => <div key={i} className="h-14 rounded-xl bg-gray-100 dark:bg-navy-800 animate-pulse" />)}
            </div>
            <div className="flex-1 space-y-3">
              {[1,2].map(i => <div key={i} className="h-20 rounded-2xl bg-gray-100 dark:bg-navy-800 animate-pulse" />)}
            </div>
          </div>
        ) : courses.length === 0 ? (
          <div className="text-center py-20 text-slate-400">
            <Edit2 className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="font-medium">No courses yet</p>
            <p className="text-sm mt-1">Create a course first, then add exams to it.</p>
          </div>
        ) : (
          <div className="flex gap-5 items-start">
            {/* ── Left: vertical subject tabs ──────────────────────────────── */}
            <div className="w-60 shrink-0 space-y-1.5 sticky top-4">
              <p className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest px-3 mb-3">Subjects</p>
              {courses.map(course => {
                const count    = examCountByCourse(course.id);
                const pending  = pendingByCourse(course.id);
                const isActive = course.id === selectedCourseId;
                return (
                  <button
                    key={course.id}
                    onClick={() => setSelectedCourseId(course.id)}
                    className={`w-full text-left px-4 py-3 rounded-xl transition-all ${
                      isActive
                        ? 'bg-teal-600 shadow-md shadow-teal-200 dark:shadow-teal-900/30'
                        : 'hover:bg-gray-100 dark:hover:bg-navy-700/60 bg-white dark:bg-navy-800 border border-gray-100 dark:border-navy-700'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${isActive ? 'bg-white/20' : 'bg-teal-100 dark:bg-teal-900/20'}`}>
                        <FileText className={`w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-teal-600'}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-semibold leading-snug truncate ${isActive ? 'text-white' : 'text-gray-800 dark:text-white'}`}>
                          {course.title}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <p className={`text-xs ${isActive ? 'text-teal-100' : 'text-gray-400 dark:text-gray-500'}`}>
                            {count} exam{count !== 1 ? 's' : ''}
                          </p>
                          {pending > 0 && (
                            <span className={`text-xs font-bold px-1.5 py-0.5 rounded-md ${isActive ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'}`}>
                              {pending} pending
                            </span>
                          )}
                        </div>
                      </div>
                      {isActive && <ChevronRight className="w-4 h-4 text-white shrink-0" />}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* ── Right: exam list for selected course ─────────────────────── */}
            <div className="flex-1 min-w-0">
              {selectedCourseId && (
                <>
                  {/* Course header */}
                  <div className="flex items-center justify-between gap-3 mb-4 p-4 bg-white dark:bg-navy-800 rounded-2xl border border-gray-100 dark:border-navy-700 shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-teal-100 dark:bg-teal-900/20 flex items-center justify-center shrink-0">
                        <FileText className="w-4 h-4 text-teal-600" />
                      </div>
                      <div>
                        <p className="font-bold text-gray-900 dark:text-white">
                          {courses.find(c => c.id === selectedCourseId)?.title}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">{courseExams.length} exam{courseExams.length !== 1 ? 's' : ''}</p>
                      </div>
                    </div>
                  </div>

                  {courseExams.length === 0 ? (
                    <div className="text-center py-16 bg-white dark:bg-navy-800 rounded-2xl border border-gray-100 dark:border-navy-700">
                      <Edit2 className="w-10 h-10 mx-auto mb-3 text-gray-300 dark:text-navy-600" />
                      <p className="font-semibold text-gray-900 dark:text-white mb-1">No exams for this subject</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Create reading comprehension or open-answer exams for your students.</p>
                      <button onClick={() => setPanel('create')} className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-xl transition-colors mx-auto">
                        <Plus className="w-4 h-4" /> Create Exam
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {courseExams.map(exam => {
                        const subs       = submissions[exam.id] || [];
                        const pending    = subs.filter(s => s.status === 'ai_graded' || s.status === 'submitted').length;
                        const isExpanded = expandedExam === exam.id;
                        return (
                          <div key={exam.id} className="bg-white dark:bg-navy-800 border border-gray-200 dark:border-navy-700 rounded-2xl overflow-hidden shadow-sm">
                            <div className="flex items-center gap-3 p-5">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap mb-1">
                                  <h2 className="text-base font-bold text-gray-900 dark:text-white">{exam.title}</h2>
                                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${exam.is_published ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-gray-100 text-gray-500 dark:bg-navy-700 dark:text-gray-400'}`}>
                                    {exam.is_published ? 'Published' : 'Draft'}
                                  </span>
                                  {pending > 0 && (
                                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 flex items-center gap-1">
                                      <AlertCircle className="w-3 h-3" /> {pending} need{pending === 1 ? 's' : ''} review
                                    </span>
                                  )}
                                </div>
                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                  {exam.total_marks} marks · {exam.questions.length} question{exam.questions.length !== 1 ? 's' : ''}
                                  {exam.time_limit_minutes > 0 ? ` · ${exam.time_limit_minutes} min` : ''}
                                </p>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <button
                                  onClick={() => togglePublish(exam)}
                                  className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
                                    exam.is_published
                                      ? 'text-gray-600 dark:text-gray-300 border-gray-200 dark:border-navy-600 hover:bg-gray-50 dark:hover:bg-navy-700'
                                      : 'text-emerald-600 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'
                                  }`}
                                >
                                  {exam.is_published ? 'Unpublish' : 'Publish'}
                                </button>
                                <button
                                  onClick={() => setExpandedExam(isExpanded ? null : exam.id)}
                                  className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-200 dark:border-navy-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-navy-700 transition-colors"
                                >
                                  <Users className="w-3.5 h-3.5" /> {subs.length}
                                  {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                </button>
                                <button onClick={() => deleteExam(exam.id)} className="p-1.5 text-gray-400 hover:text-red-500 transition-colors">
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>

                            {isExpanded && (
                              <div className="border-t border-gray-100 dark:border-navy-700">
                                {subs.length === 0 ? (
                                  <p className="text-sm text-gray-400 text-center py-6">No submissions yet</p>
                                ) : (
                                  <div className="divide-y divide-gray-100 dark:divide-navy-700">
                                    {subs.map(sub => {
                                      const isFinalised = sub.status === 'finalised';
                                      const needsReview = sub.status === 'ai_graded' || sub.status === 'submitted';
                                      return (
                                        <div key={sub.id} className="flex items-center gap-3 px-5 py-3">
                                          <div className="flex-1 min-w-0">
                                            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">{sub.student?.full_name || 'Student'}</p>
                                            <p className="text-xs text-gray-400">{sub.student?.email} · {new Date(sub.submitted_at).toLocaleDateString('en-AU', { dateStyle: 'medium' })}</p>
                                          </div>
                                          <div className="flex items-center gap-3 shrink-0">
                                            {isFinalised && (
                                              <span className="text-sm font-bold text-teal-600">{sub.total_score}/{sub.max_score} ({sub.percentage}%)</span>
                                            )}
                                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                                              isFinalised ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
                                              needsReview ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                                              'bg-gray-100 text-gray-500 dark:bg-navy-700 dark:text-gray-400'
                                            }`}>
                                              {isFinalised ? 'Finalised' : needsReview ? 'Needs Review' : sub.status}
                                            </span>
                                            <button
                                              onClick={() => openReview(exam, sub)}
                                              className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
                                                needsReview
                                                  ? 'text-white bg-teal-600 hover:bg-teal-700'
                                                  : 'text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-navy-600 hover:bg-gray-50 dark:hover:bg-navy-700'
                                              }`}
                                            >
                                              {needsReview ? <><CheckCircle2 className="w-3.5 h-3.5" /> Review & Mark</> : <><Eye className="w-3.5 h-3.5" /> View</>}
                                            </button>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
