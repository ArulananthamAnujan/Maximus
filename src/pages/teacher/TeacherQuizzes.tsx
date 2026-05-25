import { useState, useEffect } from 'react';
import {
  Plus, HelpCircle, Trash2, ChevronDown, ChevronUp, Pencil, X, Check,
  GripVertical, UserPlus, AlertCircle, BookOpen, ChevronRight, Zap,
} from 'lucide-react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { teacherNavItems } from './teacherNav';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import type { Quiz, Course, QuizQuestion } from '../../types';

type QuizWithQuestions = Quiz & { questions?: QuizQuestion[] };

const EMPTY_FORM = { course_id: '', title: '', description: '', time_limit_minutes: '', pass_mark: 70, max_attempts: 3 };

const EMPTY_QUESTION = {
  question: '',
  type: 'mcq' as QuizQuestion['type'],
  options: ['', '', '', ''],
  correct_answer: '',
  points: 1,
};

export default function TeacherQuizzes() {
  const [courses, setCourses]   = useState<Course[]>([]);
  const [quizzes, setQuizzes]   = useState<QuizWithQuestions[]>([]);
  const [loading, setLoading]   = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Quiz | null>(null);
  const [deleteQuestionTarget, setDeleteQuestionTarget] = useState<{ quizId: string; question: QuizQuestion } | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [editQuiz, setEditQuiz]     = useState<QuizWithQuestions | null>(null);
  const [form, setForm]             = useState<typeof EMPTY_FORM>({ ...EMPTY_FORM });
  const [saving, setSaving]         = useState(false);

  const [addingQuestionTo, setAddingQuestionTo]   = useState<string | null>(null);
  const [editingQuestion, setEditingQuestion]     = useState<{ quizId: string; question: QuizQuestion } | null>(null);
  const [questionForm, setQuestionForm]           = useState<typeof EMPTY_QUESTION>({ ...EMPTY_QUESTION });
  const [savingQuestion, setSavingQuestion]       = useState(false);

  // Inline quick-answer state: { questionId -> draft answer string }
  const [quickAnswer, setQuickAnswer] = useState<Record<string, string>>({});
  const [savingQuick, setSavingQuick] = useState<string | null>(null);

  const saveQuickAnswer = async (q: QuizQuestion, value: string) => {
    if (!value.trim()) return;
    setSavingQuick(q.id);
    await supabase.from('quiz_questions').update({ correct_answer: value }).eq('id', q.id);
    setSavingQuick(null);
    setQuickAnswer(prev => { const n = { ...prev }; delete n[q.id]; return n; });
    fetchData();
    toast.success('Correct answer saved');
  };

  const [grantModal, setGrantModal]   = useState<{ quiz: QuizWithQuestions } | null>(null);
  const [grantStudents, setGrantStudents] = useState<Array<{ id: string; full_name: string; email: string; attemptCount: number; extraGranted: number }>>([]);
  const [grantTarget, setGrantTarget] = useState<string | null>(null);
  const [grantAmount, setGrantAmount] = useState(1);
  const [grantNote, setGrantNote]     = useState('');
  const [grantSaving, setGrantSaving] = useState(false);

  const { profile } = useAuth();
  const { toast }   = useToast();

  const fetchData = async () => {
    if (!profile) return;
    const { data: coursesData } = await supabase.from('courses').select('id, title').eq('teacher_id', profile.id);
    if (coursesData) {
      setCourses(coursesData as Course[]);
      const courseIds = coursesData.map(c => c.id);
      if (courseIds.length > 0) {
        const { data: quizzesData } = await supabase
          .from('quizzes')
          .select('*, questions:quiz_questions(*)')
          .in('course_id', courseIds)
          .order('created_at', { ascending: false });
        if (quizzesData) setQuizzes(quizzesData as QuizWithQuestions[]);
      }
      if (!selectedCourseId && coursesData.length > 0) {
        setSelectedCourseId(coursesData[0].id);
      }
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [profile]);

  // ── Derived: quizzes for the selected course ───────────────────────────────
  const courseQuizzes = quizzes.filter(q => q.course_id === selectedCourseId);

  // ── Quiz count per course for the tab badges ───────────────────────────────
  const quizCountByCourse = (courseId: string) => quizzes.filter(q => q.course_id === courseId).length;

  // ── Handlers ──────────────────────────────────────────────────────────────
  const openCreate = () => {
    setForm({ ...EMPTY_FORM, course_id: selectedCourseId || '' });
    setShowCreate(true);
  };

  const openEdit = (quiz: QuizWithQuestions, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditQuiz(quiz);
    setForm({
      course_id: quiz.course_id,
      title: quiz.title,
      description: quiz.description || '',
      time_limit_minutes: quiz.time_limit_minutes ? String(quiz.time_limit_minutes) : '',
      pass_mark: quiz.pass_mark,
      max_attempts: quiz.max_attempts,
    });
  };

  const handleSaveQuiz = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const payload = {
      course_id: form.course_id,
      title: form.title,
      description: form.description,
      time_limit_minutes: form.time_limit_minutes ? parseInt(form.time_limit_minutes) : null,
      pass_mark: form.pass_mark,
      max_attempts: form.max_attempts,
    };
    if (editQuiz) {
      const { error } = await supabase.from('quizzes').update(payload).eq('id', editQuiz.id);
      if (!error) { toast.success('Quiz updated'); setEditQuiz(null); fetchData(); }
      else toast.error('Failed to update quiz');
    } else {
      const { error } = await supabase.from('quizzes').insert(payload);
      if (!error) { toast.success('Quiz created'); setShowCreate(false); fetchData(); }
      else toast.error('Failed to create quiz');
    }
    setSaving(false);
  };

  const handleDeleteQuiz = async () => {
    if (!deleteTarget) return;
    await supabase.from('quizzes').delete().eq('id', deleteTarget.id);
    toast.success('Quiz deleted');
    setDeleteTarget(null);
    fetchData();
  };

  const openAddQuestion = (quizId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setAddingQuestionTo(quizId);
    setQuestionForm({ ...EMPTY_QUESTION });
    if (expanded !== quizId) setExpanded(quizId);
  };

  const openEditQuestion = (quizId: string, q: QuizQuestion, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingQuestion({ quizId, question: q });
    setQuestionForm({
      question: q.question,
      type: q.type,
      options: q.options && q.options.length >= 4 ? [...q.options] : [...(q.options || []), '', '', '', ''].slice(0, 4),
      correct_answer: String(q.correct_answer ?? ''),
      points: q.points,
    });
  };

  const handleSaveQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingQuestion(true);
    const quiz = quizzes.find(q => q.id === (editingQuestion?.quizId || addingQuestionTo));
    const orderIndex = quiz?.questions?.length || 0;
    const payload: Partial<QuizQuestion> = {
      question: questionForm.question,
      type: questionForm.type,
      options: questionForm.type === 'short_answer' ? [] : questionForm.options.filter(o => o.trim()),
      correct_answer: questionForm.correct_answer,
      points: questionForm.points,
    };
    if (editingQuestion) {
      const { error } = await supabase.from('quiz_questions').update(payload).eq('id', editingQuestion.question.id);
      if (!error) { toast.success('Question updated'); setEditingQuestion(null); fetchData(); }
      else toast.error('Failed to update question');
    } else if (addingQuestionTo) {
      const { error } = await supabase.from('quiz_questions').insert({ ...payload, quiz_id: addingQuestionTo, order_index: orderIndex });
      if (!error) { toast.success('Question added'); setAddingQuestionTo(null); fetchData(); }
      else toast.error('Failed to add question');
    }
    setSavingQuestion(false);
  };

  const handleDeleteQuestion = async () => {
    if (!deleteQuestionTarget) return;
    await supabase.from('quiz_questions').delete().eq('id', deleteQuestionTarget.question.id);
    toast.success('Question deleted');
    setDeleteQuestionTarget(null);
    fetchData();
  };

  const openGrantModal = async (quiz: QuizWithQuestions, e: React.MouseEvent) => {
    e.stopPropagation();
    setGrantModal({ quiz });
    setGrantTarget(null);
    setGrantAmount(1);
    setGrantNote('');
    const [attemptsRes, extraRes] = await Promise.all([
      supabase.from('quiz_attempts').select('student_id, count:id').eq('quiz_id', quiz.id),
      supabase.from('quiz_extra_attempts').select('student_id, extra_attempts').eq('quiz_id', quiz.id),
    ]);
    const attemptCounts = new Map<string, number>();
    (attemptsRes.data || []).forEach((r: { student_id: string }) => {
      attemptCounts.set(r.student_id, (attemptCounts.get(r.student_id) || 0) + 1);
    });
    const extraGranted = new Map<string, number>();
    (extraRes.data || []).forEach((r: { student_id: string; extra_attempts: number }) => {
      extraGranted.set(r.student_id, (extraGranted.get(r.student_id) || 0) + r.extra_attempts);
    });
    const studentIds = [...new Set([...attemptCounts.keys()])];
    if (studentIds.length === 0) { setGrantStudents([]); return; }
    const { data: profiles } = await supabase.from('profiles').select('id, full_name, email').in('id', studentIds);
    setGrantStudents((profiles || []).map((p: { id: string; full_name: string; email: string }) => ({
      id: p.id,
      full_name: p.full_name,
      email: p.email,
      attemptCount: attemptCounts.get(p.id) || 0,
      extraGranted: extraGranted.get(p.id) || 0,
    })));
  };

  const handleGrantAttempts = async () => {
    if (!grantModal || !grantTarget || !profile) return;
    setGrantSaving(true);
    const { error } = await supabase.from('quiz_extra_attempts').insert({
      quiz_id: grantModal.quiz.id,
      student_id: grantTarget,
      granted_by: profile.id,
      extra_attempts: grantAmount,
      note: grantNote.trim() || null,
    });
    if (error) {
      toast.error('Failed to grant attempts');
    } else {
      toast.success(`${grantAmount} extra attempt${grantAmount !== 1 ? 's' : ''} granted`);
      setGrantModal(null);
    }
    setGrantSaving(false);
  };

  // ── Sub-components ─────────────────────────────────────────────────────────
  const QuizFormModal = ({ title, onClose }: { title: string; onClose: () => void }) => (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-navy-800 rounded-2xl shadow-2xl w-full max-w-md p-6 animate-slide-up">
        <button onClick={onClose} className="absolute top-4 right-4 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-navy-700 transition-colors">
          <X className="w-4 h-4" />
        </button>
        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-5">{title}</h3>
        <form onSubmit={handleSaveQuiz} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Course</label>
            <select value={form.course_id} onChange={e => setForm(f => ({ ...f, course_id: e.target.value }))} className="input-field" required>
              <option value="">Select course...</option>
              {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Quiz Title</label>
            <input type="text" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className="input-field" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Description (optional)</label>
            <input type="text" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="input-field" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Time Limit (min)</label>
              <input type="number" min="1" value={form.time_limit_minutes} onChange={e => setForm(f => ({ ...f, time_limit_minutes: e.target.value }))} className="input-field text-sm py-2" placeholder="None" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Pass Mark (%)</label>
              <input type="number" min="1" max="100" value={form.pass_mark} onChange={e => setForm(f => ({ ...f, pass_mark: parseInt(e.target.value) }))} className="input-field text-sm py-2" required />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Max Attempts</label>
              <input type="number" min="1" value={form.max_attempts} onChange={e => setForm(f => ({ ...f, max_attempts: parseInt(e.target.value) }))} className="input-field text-sm py-2" required />
            </div>
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm border border-gray-200 dark:border-navy-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-navy-700 transition-colors">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary text-sm py-2 disabled:opacity-60">{saving ? 'Saving...' : title}</button>
          </div>
        </form>
      </div>
    </div>
  );

  const QuestionFormModal = ({ quizId: _quizId, onClose }: { quizId: string; onClose: () => void }) => (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-navy-800 rounded-2xl shadow-2xl w-full max-w-lg p-6 animate-slide-up max-h-[90vh] overflow-y-auto">
        <button onClick={onClose} className="absolute top-4 right-4 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-navy-700 transition-colors">
          <X className="w-4 h-4" />
        </button>
        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-5">
          {editingQuestion ? 'Edit Question' : 'Add Question'}
        </h3>
        <form onSubmit={handleSaveQuestion} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Question</label>
            <textarea
              value={questionForm.question}
              onChange={e => setQuestionForm(f => ({ ...f, question: e.target.value }))}
              className="input-field resize-none"
              rows={3}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Type</label>
              <select
                value={questionForm.type}
                onChange={e => setQuestionForm(f => ({ ...f, type: e.target.value as QuizQuestion['type'], correct_answer: '', options: ['', '', '', ''] }))}
                className="input-field"
              >
                <option value="mcq">Multiple Choice</option>
                <option value="true_false">True / False</option>
                <option value="short_answer">Short Answer</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Points</label>
              <input
                type="number"
                min="1"
                value={questionForm.points}
                onChange={e => setQuestionForm(f => ({ ...f, points: parseInt(e.target.value) || 1 }))}
                className="input-field"
                required
              />
            </div>
          </div>

          {questionForm.type === 'mcq' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Options <span className="text-xs text-gray-400 font-normal">(click circle to mark correct)</span>
              </label>
              <div className="space-y-2">
                {questionForm.options.map((opt, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setQuestionForm(f => ({ ...f, correct_answer: opt }))}
                      className={`w-6 h-6 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors ${
                        questionForm.correct_answer === opt && opt.trim()
                          ? 'border-green-500 bg-green-500 text-white'
                          : 'border-gray-300 dark:border-navy-500 hover:border-green-400'
                      }`}
                    >
                      {questionForm.correct_answer === opt && opt.trim() && <Check className="w-3 h-3" />}
                    </button>
                    <input
                      type="text"
                      value={opt}
                      onChange={e => {
                        const newOpts = [...questionForm.options];
                        const wasCorrect = questionForm.correct_answer === questionForm.options[i];
                        newOpts[i] = e.target.value;
                        setQuestionForm(f => ({ ...f, options: newOpts, correct_answer: wasCorrect ? e.target.value : f.correct_answer }));
                      }}
                      placeholder={`Option ${i + 1}`}
                      className="input-field text-sm py-2 flex-1"
                    />
                  </div>
                ))}
              </div>
              {!questionForm.correct_answer && (
                <p className="text-xs text-orange-500 mt-1">Select the correct answer by clicking the circle</p>
              )}
            </div>
          )}

          {questionForm.type === 'true_false' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Correct Answer</label>
              <div className="flex gap-3">
                {['True', 'False'].map(val => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setQuestionForm(f => ({ ...f, correct_answer: val, options: ['True', 'False'] }))}
                    className={`flex-1 py-2.5 rounded-xl border-2 text-sm font-medium transition-all ${
                      questionForm.correct_answer === val
                        ? 'border-green-500 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                        : 'border-gray-200 dark:border-navy-600 text-gray-600 dark:text-gray-400 hover:border-gray-300'
                    }`}
                  >
                    {val}
                  </button>
                ))}
              </div>
            </div>
          )}

          {questionForm.type === 'short_answer' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Expected Answer <span className="text-xs text-gray-400 font-normal">(grading reference)</span>
              </label>
              <input
                type="text"
                value={questionForm.correct_answer}
                onChange={e => setQuestionForm(f => ({ ...f, correct_answer: e.target.value }))}
                className="input-field"
                placeholder="Model answer..."
                required
              />
            </div>
          )}

          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm border border-gray-200 dark:border-navy-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-navy-700 transition-colors">Cancel</button>
            <button
              type="submit"
              disabled={savingQuestion || (questionForm.type !== 'short_answer' && !questionForm.correct_answer)}
              className="btn-primary text-sm py-2 disabled:opacity-60"
            >
              {savingQuestion ? 'Saving...' : editingQuestion ? 'Save Changes' : 'Add Question'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  // ── Main render ─────────────────────────────────────────────────────────────
  return (
    <DashboardLayout navItems={teacherNavItems} title="Quizzes" subtitle="Create and manage quizzes by subject">
      <div className="space-y-5">
        <div className="flex justify-end">
          <button onClick={openCreate} className="btn-primary text-sm py-2 flex items-center gap-2">
            <Plus className="w-4 h-4" /> New Quiz
          </button>
        </div>

        {loading ? (
          <div className="flex gap-5">
            <div className="w-60 shrink-0 space-y-2">
              {[1,2,3].map(i => <div key={i} className="h-14 rounded-xl bg-gray-100 dark:bg-navy-800 animate-pulse" />)}
            </div>
            <div className="flex-1 space-y-3">
              {[1,2,3].map(i => <div key={i} className="h-16 rounded-xl bg-gray-100 dark:bg-navy-800 animate-pulse" />)}
            </div>
          </div>
        ) : courses.length === 0 ? (
          <div className="card text-center py-16">
            <HelpCircle className="w-10 h-10 text-gray-400 mx-auto mb-3" />
            <h3 className="font-semibold text-gray-900 dark:text-white mb-1">No courses yet</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">Create a course first to add quizzes.</p>
          </div>
        ) : (
          <div className="flex gap-5 items-start">
            {/* ── Left: vertical subject tabs ──────────────────────────────── */}
            <div className="w-60 shrink-0 space-y-1.5 sticky top-4">
              <p className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest px-3 mb-3">Subjects</p>
              {courses.map(course => {
                const count    = quizCountByCourse(course.id);
                const isActive = course.id === selectedCourseId;
                return (
                  <button
                    key={course.id}
                    onClick={() => setSelectedCourseId(course.id)}
                    className={`w-full text-left px-4 py-3 rounded-xl transition-all ${
                      isActive
                        ? 'bg-sky-600 shadow-md shadow-sky-200 dark:shadow-sky-900/30'
                        : 'hover:bg-gray-100 dark:hover:bg-navy-700/60 bg-white dark:bg-navy-800 border border-gray-100 dark:border-navy-700'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${isActive ? 'bg-white/20' : 'bg-sky-100 dark:bg-sky-900/20'}`}>
                        <BookOpen className={`w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-sky-600'}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-semibold leading-snug truncate ${isActive ? 'text-white' : 'text-gray-800 dark:text-white'}`}>
                          {course.title}
                        </p>
                        <p className={`text-xs mt-0.5 ${isActive ? 'text-sky-100' : 'text-gray-400 dark:text-gray-500'}`}>
                          {count} quiz{count !== 1 ? 'zes' : ''}
                        </p>
                      </div>
                      {isActive && <ChevronRight className="w-4 h-4 text-white shrink-0" />}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* ── Right: quiz list for selected course ─────────────────────── */}
            <div className="flex-1 min-w-0">
              {selectedCourseId && (
                <>
                  {/* Course header */}
                  <div className="flex items-center justify-between gap-3 mb-4 p-4 bg-white dark:bg-navy-800 rounded-2xl border border-gray-100 dark:border-navy-700 shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-sky-100 dark:bg-sky-900/20 flex items-center justify-center shrink-0">
                        <BookOpen className="w-4.5 h-4.5 text-sky-600" />
                      </div>
                      <div>
                        <p className="font-bold text-gray-900 dark:text-white">
                          {courses.find(c => c.id === selectedCourseId)?.title}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">{courseQuizzes.length} quiz{courseQuizzes.length !== 1 ? 'zes' : ''}</p>
                      </div>
                    </div>
                  </div>

                  {courseQuizzes.length === 0 ? (
                    <div className="card text-center py-14">
                      <HelpCircle className="w-9 h-9 text-gray-300 dark:text-navy-600 mx-auto mb-3" />
                      <p className="text-sm font-semibold text-gray-900 dark:text-white mb-1">No quizzes for this subject</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">Create a quiz to test student knowledge.</p>
                      <button onClick={openCreate} className="btn-primary text-sm py-2 flex items-center gap-2 mx-auto">
                        <Plus className="w-4 h-4" /> New Quiz
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {courseQuizzes.map(quiz => (
                        <div key={quiz.id} className="card overflow-hidden">
                          <div
                            className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-navy-700/30 transition-colors"
                            onClick={() => setExpanded(expanded === quiz.id ? null : quiz.id)}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-3 flex-wrap">
                                <h3 className="font-semibold text-gray-900 dark:text-white">{quiz.title}</h3>
                                <span className="text-xs bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400 px-2 py-0.5 rounded-full font-medium">
                                  {quiz.questions?.length || 0} Q{quiz.questions?.length !== 1 ? 's' : ''}
                                </span>
                                {quiz.is_published ? (
                                  <span className="text-xs bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded-full font-medium">Published</span>
                                ) : (
                                  <span className="text-xs bg-gray-100 dark:bg-navy-700 text-gray-500 dark:text-gray-400 px-2 py-0.5 rounded-full font-medium">Draft</span>
                                )}
                              </div>
                              <p className="text-xs text-gray-400 mt-1">
                                {quiz.time_limit_minutes ? `${quiz.time_limit_minutes} min` : 'No time limit'} · Pass: {quiz.pass_mark}% · {quiz.max_attempts} attempt{quiz.max_attempts !== 1 ? 's' : ''}
                              </p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0 ml-3">
                              <button
                                onClick={e => openAddQuestion(quiz.id, e)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-blue-600 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-400 hover:opacity-80 transition-opacity"
                              >
                                <Plus className="w-3.5 h-3.5" /> Question
                              </button>
                              <button
                                onClick={e => openGrantModal(quiz, e)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-amber-600 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400 hover:opacity-80 transition-opacity"
                                title="Grant extra attempts"
                              >
                                <UserPlus className="w-3.5 h-3.5" /> Attempts
                              </button>
                              <button
                                onClick={e => openEdit(quiz, e)}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-navy-700 transition-colors"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button
                                onClick={e => { e.stopPropagation(); setDeleteTarget(quiz); }}
                                className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                              {expanded === quiz.id
                                ? <ChevronUp className="w-5 h-5 text-gray-400 ml-1" />
                                : <ChevronDown className="w-5 h-5 text-gray-400 ml-1" />}
                            </div>
                          </div>

                          {expanded === quiz.id && (
                            <div className="border-t border-gray-100 dark:border-navy-700">
                              {quiz.questions && quiz.questions.length > 0 ? (
                                <div className="p-4 space-y-3">
                                  {quiz.questions.slice().sort((a, b) => a.order_index - b.order_index).map((q, idx) => {
                                    const missingAnswer = !q.correct_answer?.trim();
                                    const isQuickOpen   = quickAnswer[q.id] !== undefined;
                                    return (
                                    <div key={q.id} className={`rounded-xl overflow-hidden border ${
                                      missingAnswer
                                        ? 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/10'
                                        : 'border-transparent bg-gray-50 dark:bg-navy-700/50'
                                    }`}>
                                      <div className="p-4">
                                        <div className="flex items-start justify-between gap-3">
                                          <div className="flex items-start gap-3 flex-1 min-w-0">
                                            <GripVertical className="w-4 h-4 text-gray-300 dark:text-navy-500 mt-0.5 shrink-0" />
                                            <div className="flex-1 min-w-0">
                                              <div className="flex items-center gap-2 flex-wrap mb-1.5">
                                                <p className="text-sm font-medium text-gray-900 dark:text-white">{idx + 1}. {q.question}</p>
                                              </div>
                                              <div className="flex items-center gap-2 flex-wrap">
                                                <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-2 py-0.5 rounded-full">
                                                  {q.type === 'mcq' ? 'Multiple Choice' : q.type === 'true_false' ? 'True/False' : 'Short Answer'}
                                                </span>
                                                <span className="text-xs text-gray-400">{q.points} pt{q.points !== 1 ? 's' : ''}</span>
                                                {missingAnswer && (
                                                  <span className="text-xs font-semibold text-red-600 dark:text-red-400 flex items-center gap-1">
                                                    <AlertCircle className="w-3 h-3" /> No correct answer set
                                                  </span>
                                                )}
                                              </div>

                                              {/* Options list */}
                                              {q.options && q.options.length > 0 && (
                                                <div className="mt-2 space-y-1">
                                                  {q.options.map((opt, i) => (
                                                    <div key={i} className={`text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5 ${
                                                      opt === q.correct_answer
                                                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 font-medium'
                                                        : 'text-gray-500 dark:text-gray-400'
                                                    }`}>
                                                      {opt === q.correct_answer && <Check className="w-3 h-3" />}
                                                      {opt}
                                                    </div>
                                                  ))}
                                                </div>
                                              )}
                                              {q.type === 'short_answer' && q.correct_answer && (
                                                <div className="mt-2 text-xs px-3 py-1.5 rounded-lg bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 font-medium flex items-center gap-1.5">
                                                  <Check className="w-3 h-3" /> {q.correct_answer}
                                                </div>
                                              )}
                                            </div>
                                          </div>

                                          <div className="flex items-center gap-1 shrink-0">
                                            {missingAnswer && (
                                              <button
                                                onClick={e => {
                                                  e.stopPropagation();
                                                  setQuickAnswer(prev =>
                                                    prev[q.id] !== undefined
                                                      ? (() => { const n = { ...prev }; delete n[q.id]; return n; })()
                                                      : { ...prev, [q.id]: '' }
                                                  );
                                                }}
                                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
                                                title="Set correct answer"
                                              >
                                                <Zap className="w-3.5 h-3.5" /> Fix
                                              </button>
                                            )}
                                            <button
                                              onClick={e => openEditQuestion(quiz.id, q, e)}
                                              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-white dark:hover:bg-navy-600 transition-colors"
                                            >
                                              <Pencil className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                              onClick={e => { e.stopPropagation(); setDeleteQuestionTarget({ quizId: quiz.id, question: q }); }}
                                              className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                            >
                                              <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                          </div>
                                        </div>
                                      </div>

                                      {/* ── Inline quick-answer panel ─────────────────── */}
                                      {isQuickOpen && (
                                        <div className="border-t border-red-200 dark:border-red-800 bg-white dark:bg-navy-800 p-4 space-y-3">
                                          <p className="text-xs font-bold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                                            <Zap className="w-3.5 h-3.5 text-amber-500" /> Set correct answer
                                          </p>

                                          {q.type === 'mcq' && q.options && q.options.length > 0 && (
                                            <div className="space-y-1.5">
                                              {q.options.filter(o => o.trim()).map(opt => (
                                                <button
                                                  key={opt}
                                                  type="button"
                                                  onClick={() => setQuickAnswer(prev => ({ ...prev, [q.id]: opt }))}
                                                  className={`w-full text-left text-sm px-3 py-2 rounded-lg border-2 transition-all ${
                                                    quickAnswer[q.id] === opt
                                                      ? 'border-green-500 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 font-semibold'
                                                      : 'border-gray-200 dark:border-navy-600 text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-navy-500'
                                                  }`}
                                                >
                                                  <div className="flex items-center gap-2">
                                                    <div className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${
                                                      quickAnswer[q.id] === opt ? 'border-green-500 bg-green-500' : 'border-gray-300 dark:border-navy-500'
                                                    }`}>
                                                      {quickAnswer[q.id] === opt && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                                                    </div>
                                                    {opt}
                                                  </div>
                                                </button>
                                              ))}
                                            </div>
                                          )}

                                          {q.type === 'true_false' && (
                                            <div className="flex gap-2">
                                              {['True', 'False'].map(val => (
                                                <button
                                                  key={val}
                                                  type="button"
                                                  onClick={() => setQuickAnswer(prev => ({ ...prev, [q.id]: val }))}
                                                  className={`flex-1 py-2 rounded-xl border-2 text-sm font-semibold transition-all ${
                                                    quickAnswer[q.id] === val
                                                      ? 'border-green-500 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                                                      : 'border-gray-200 dark:border-navy-600 text-gray-600 dark:text-gray-400 hover:border-gray-300'
                                                  }`}
                                                >
                                                  {val}
                                                </button>
                                              ))}
                                            </div>
                                          )}

                                          {q.type === 'short_answer' && (
                                            <input
                                              type="text"
                                              value={quickAnswer[q.id] || ''}
                                              onChange={e => setQuickAnswer(prev => ({ ...prev, [q.id]: e.target.value }))}
                                              placeholder="Type the correct / model answer..."
                                              className="w-full border border-gray-200 dark:border-navy-600 rounded-lg px-3 py-2 text-sm bg-gray-50 dark:bg-navy-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-green-400 focus:border-transparent"
                                              autoFocus
                                            />
                                          )}

                                          <div className="flex gap-2 justify-end">
                                            <button
                                              type="button"
                                              onClick={() => setQuickAnswer(prev => { const n = { ...prev }; delete n[q.id]; return n; })}
                                              className="px-3 py-1.5 text-xs border border-gray-200 dark:border-navy-600 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-navy-700 transition-colors"
                                            >
                                              Cancel
                                            </button>
                                            <button
                                              type="button"
                                              disabled={!quickAnswer[q.id]?.trim() || savingQuick === q.id}
                                              onClick={() => saveQuickAnswer(q, quickAnswer[q.id])}
                                              className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors disabled:opacity-50"
                                            >
                                              {savingQuick === q.id
                                                ? <><div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Saving...</>
                                                : <><Check className="w-3 h-3" /> Save Answer</>}
                                            </button>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                    );
                                  })}
                                  <button
                                    onClick={e => openAddQuestion(quiz.id, e)}
                                    className="w-full py-2.5 border-2 border-dashed border-gray-200 dark:border-navy-600 rounded-xl text-sm text-gray-400 hover:border-blue-300 hover:text-blue-500 transition-colors flex items-center justify-center gap-2"
                                  >
                                    <Plus className="w-4 h-4" /> Add another question
                                  </button>
                                </div>
                              ) : (
                                <div className="p-8 text-center">
                                  <HelpCircle className="w-8 h-8 text-gray-300 dark:text-navy-500 mx-auto mb-2" />
                                  <p className="text-sm text-gray-400 mb-3">No questions yet</p>
                                  <button
                                    onClick={e => openAddQuestion(quiz.id, e)}
                                    className="btn-primary text-sm py-2 flex items-center gap-2 mx-auto"
                                  >
                                    <Plus className="w-4 h-4" /> Add First Question
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {(showCreate || editQuiz) && (
        <QuizFormModal
          title={editQuiz ? 'Edit Quiz' : 'Create Quiz'}
          onClose={() => { setShowCreate(false); setEditQuiz(null); }}
        />
      )}

      {(addingQuestionTo || editingQuestion) && (
        <QuestionFormModal
          quizId={editingQuestion?.quizId || addingQuestionTo || ''}
          onClose={() => { setAddingQuestionTo(null); setEditingQuestion(null); }}
        />
      )}

      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="Delete Quiz"
        message={`Delete "${deleteTarget?.title}" and all its questions? This cannot be undone.`}
        onConfirm={handleDeleteQuiz}
        onCancel={() => setDeleteTarget(null)}
        confirmText="Delete"
      />

      <ConfirmDialog
        isOpen={!!deleteQuestionTarget}
        title="Delete Question"
        message="Remove this question from the quiz?"
        onConfirm={handleDeleteQuestion}
        onCancel={() => setDeleteQuestionTarget(null)}
        confirmText="Delete"
      />

      {grantModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setGrantModal(null)} />
          <div className="relative bg-white dark:bg-navy-800 rounded-2xl shadow-2xl w-full max-w-md p-6 animate-slide-up">
            <button onClick={() => setGrantModal(null)} className="absolute top-4 right-4 p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-navy-700 transition-colors">
              <X className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <UserPlus className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900 dark:text-white">Grant Extra Attempts</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">{grantModal.quiz.title}</p>
              </div>
            </div>

            {grantStudents.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No students have attempted this quiz yet.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Select Student</label>
                  <select value={grantTarget || ''} onChange={e => setGrantTarget(e.target.value)} className="input-field">
                    <option value="">Choose a student...</option>
                    {grantStudents.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.full_name} ({s.email}) — {s.attemptCount} attempt{s.attemptCount !== 1 ? 's' : ''}{s.extraGranted > 0 ? `, +${s.extraGranted} bonus` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Extra Attempts to Grant</label>
                  <select value={grantAmount} onChange={e => setGrantAmount(parseInt(e.target.value))} className="input-field">
                    {[1,2,3,4,5].map(n => <option key={n} value={n}>{n} attempt{n !== 1 ? 's' : ''}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    Note <span className="text-gray-400 font-normal text-xs">(optional)</span>
                  </label>
                  <input type="text" value={grantNote} onChange={e => setGrantNote(e.target.value)} className="input-field" placeholder="e.g. Technical issue during first attempt" />
                </div>
                <div className="flex gap-3 justify-end pt-2">
                  <button type="button" onClick={() => setGrantModal(null)} className="px-4 py-2 text-sm border border-gray-200 dark:border-navy-600 rounded-xl text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-navy-700 transition-colors">
                    Cancel
                  </button>
                  <button
                    onClick={handleGrantAttempts}
                    disabled={!grantTarget || grantSaving}
                    className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold rounded-xl transition-colors disabled:opacity-50 shadow-sm flex items-center gap-2"
                  >
                    {grantSaving ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <UserPlus className="w-4 h-4" />}
                    Grant Attempts
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
