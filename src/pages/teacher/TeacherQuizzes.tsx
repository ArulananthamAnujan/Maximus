import { useState, useEffect } from 'react';
import { Plus, HelpCircle, Trash2, ChevronDown, ChevronUp, Pencil, X, Check, GripVertical } from 'lucide-react';
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
  const [courses, setCourses] = useState<Course[]>([]);
  const [quizzes, setQuizzes] = useState<QuizWithQuestions[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Quiz | null>(null);
  const [deleteQuestionTarget, setDeleteQuestionTarget] = useState<{ quizId: string; question: QuizQuestion } | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [editQuiz, setEditQuiz] = useState<QuizWithQuestions | null>(null);
  const [form, setForm] = useState<typeof EMPTY_FORM>({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);

  const [addingQuestionTo, setAddingQuestionTo] = useState<string | null>(null);
  const [editingQuestion, setEditingQuestion] = useState<{ quizId: string; question: QuizQuestion } | null>(null);
  const [questionForm, setQuestionForm] = useState<typeof EMPTY_QUESTION>({ ...EMPTY_QUESTION });
  const [savingQuestion, setSavingQuestion] = useState(false);

  const { profile } = useAuth();
  const { toast } = useToast();

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
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [profile]);

  const openCreate = () => {
    setForm({ ...EMPTY_FORM });
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
      correct_answer: q.correct_answer,
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

  const QuizFormModal = ({ title, onClose }: { title: string; onClose: () => void }) => (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-navy-800 rounded-2xl shadow-2xl w-full max-w-md p-6 animate-slide-up">
        <button onClick={onClose} className="absolute top-4 right-4 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-navy-700 transition-colors">
          <X className="w-4 h-4" />
        </button>
        <h3 className="font-playfair text-xl font-bold text-gray-900 dark:text-white mb-5">{title}</h3>
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

  const QuestionFormModal = ({ quizId, onClose }: { quizId: string; onClose: () => void }) => (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-navy-800 rounded-2xl shadow-2xl w-full max-w-lg p-6 animate-slide-up max-h-[90vh] overflow-y-auto">
        <button onClick={onClose} className="absolute top-4 right-4 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-navy-700 transition-colors">
          <X className="w-4 h-4" />
        </button>
        <h3 className="font-playfair text-xl font-bold text-gray-900 dark:text-white mb-5">
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
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Options <span className="text-xs text-gray-400 font-normal">(click to set correct answer)</span></label>
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
                        setQuestionForm(f => ({
                          ...f,
                          options: newOpts,
                          correct_answer: wasCorrect ? e.target.value : f.correct_answer,
                        }));
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
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Expected Answer <span className="text-xs text-gray-400 font-normal">(used for grading reference)</span></label>
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

  return (
    <DashboardLayout navItems={teacherNavItems} title="Quizzes" subtitle="Create and manage quizzes for your courses">
      <div className="space-y-5">
        <div className="flex justify-end">
          <button onClick={openCreate} className="btn-primary text-sm py-2 flex items-center gap-2">
            <Plus className="w-4 h-4" /> New Quiz
          </button>
        </div>

        {loading ? (
          <div className="space-y-4">{[1,2,3].map(i => (
            <div key={i} className="card p-5 animate-pulse">
              <div className="h-5 bg-gray-200 dark:bg-navy-700 rounded w-1/3 mb-2" />
              <div className="h-4 bg-gray-200 dark:bg-navy-700 rounded w-1/2" />
            </div>
          ))}</div>
        ) : quizzes.length === 0 ? (
          <div className="card text-center py-16">
            <HelpCircle className="w-10 h-10 text-gray-400 mx-auto mb-3" />
            <h3 className="font-semibold text-gray-900 dark:text-white mb-1">No quizzes yet</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">Create your first quiz to test student knowledge.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {quizzes.map(quiz => (
              <div key={quiz.id} className="card overflow-hidden">
                <div
                  className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-navy-700/30 transition-colors"
                  onClick={() => setExpanded(expanded === quiz.id ? null : quiz.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h3 className="font-semibold text-gray-900 dark:text-white">{quiz.title}</h3>
                      <span className="text-xs bg-gold-100 dark:bg-gold-900/30 text-gold-700 dark:text-gold-400 px-2 py-0.5 rounded-full font-medium">
                        {quiz.questions?.length || 0} question{quiz.questions?.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      {quiz.time_limit_minutes ? `${quiz.time_limit_minutes} min limit` : 'No time limit'} &bull; Pass: {quiz.pass_mark}% &bull; {quiz.max_attempts} attempt{quiz.max_attempts !== 1 ? 's' : ''}
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
                        {quiz.questions
                          .slice()
                          .sort((a, b) => a.order_index - b.order_index)
                          .map((q, idx) => (
                          <div key={q.id} className="bg-gray-50 dark:bg-navy-700/50 rounded-xl p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-start gap-3 flex-1 min-w-0">
                                <GripVertical className="w-4 h-4 text-gray-300 dark:text-navy-500 mt-0.5 shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-gray-900 dark:text-white mb-2">{idx + 1}. {q.question}</p>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-2 py-0.5 rounded-full">
                                      {q.type === 'mcq' ? 'Multiple Choice' : q.type === 'true_false' ? 'True/False' : 'Short Answer'}
                                    </span>
                                    <span className="text-xs text-gray-400">{q.points} pt{q.points !== 1 ? 's' : ''}</span>
                                  </div>
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
                        ))}
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
    </DashboardLayout>
  );
}
