import { lazy, Suspense, useState } from 'react';
import { Plus, Trash2, ChevronDown, Clock, CheckCircle, AlertCircle, X, Award, HelpCircle, Sparkles, Check } from 'lucide-react';
import NumberInput from '../ui/NumberInput';
import ConfirmDialog from '../ui/ConfirmDialog';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../contexts/ToastContext';
import type { Quiz, QuizQuestion } from '../../types';
import type { WsSection } from '../../lib/workspace';

const AIQuizGeneratorModal = lazy(() => import('../ai/AIQuizGeneratorModal'));

export interface QuizWithQuestions extends Quiz {
  questions?: QuizQuestion[];
}

interface Props {
  courseId: string;
  quizzes: QuizWithQuestions[];
  sections: WsSection[];
  onChanged: () => void;
}

/** Every quiz in the course, with its questions. */
export default function QuizzesTab({ courseId, quizzes, sections, onChanged }: Props) {
  const fetchQuizzes = onChanged;
  const { toast } = useToast();
  const [expandedQuiz, setExpandedQuiz] = useState<string | null>(null);
  const [aiQuizTarget, setAiQuizTarget] = useState<string | null>(null);
  const [showAIQuizFromCurriculum, setShowAIQuizFromCurriculum] = useState(false);
  const [aiQuizNewName, setAIQuizNewName] = useState('');
  const [aiQuizCreating, setAIQuizCreating] = useState(false);
  const [showQuizCreate, setShowQuizCreate] = useState(false);
  const [quizForm, setQuizForm] = useState({ title: '', description: '', time_limit_minutes: '', pass_mark: 70, max_attempts: 3, section_id: '' });
  const [addingQuestionTo, setAddingQuestionTo] = useState<string | null>(null);
  const [questionForm, setQuestionForm] = useState({
    question: '', type: 'mcq' as 'mcq' | 'true_false' | 'short_answer',
    options: ['', '', '', ''], correct_answer: '', points: 1,
  });
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'quiz' | 'question'; id: string; name: string } | null>(null);

  const weekOf = (sectionId: string | null | undefined) => {
    const i = sections.findIndex(s => s.id === sectionId);
    return i >= 0 ? `Week ${i + 1}` : null;
  };

  const handleCreateQuiz = async (e: React.FormEvent) => {
    e.preventDefault();
    const timeLimitVal = quizForm.time_limit_minutes ? parseInt(quizForm.time_limit_minutes) : null;
    const { error } = await supabase.from('quizzes').insert({
      course_id: courseId,
      section_id: quizForm.section_id || null,
      title: quizForm.title,
      description: quizForm.description,
      time_limit: timeLimitVal || 0,
      time_limit_minutes: timeLimitVal,
      pass_percentage: quizForm.pass_mark,
      pass_mark: quizForm.pass_mark,
      max_attempts: quizForm.max_attempts,
      is_published: true,
    });
    if (!error) {
      toast.success('Quiz created');
      setShowQuizCreate(false);
      setQuizForm({ title: '', description: '', time_limit_minutes: '', pass_mark: 70, max_attempts: 3, section_id: '' });
      fetchQuizzes();
    } else toast.error('Failed to create quiz');
  };

  const handleAddQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addingQuestionTo) return;
    const quiz = quizzes.find(q => q.id === addingQuestionTo);
    const filteredOptions = questionForm.type === 'short_answer' ? [] : questionForm.options.filter(o => o.trim());
    const { error } = await supabase.from('quiz_questions').insert({
      quiz_id: addingQuestionTo,
      question: questionForm.question,
      type: questionForm.type,
      options: filteredOptions.length > 0 ? filteredOptions : null,
      correct_answer: questionForm.correct_answer,
      points: questionForm.points,
      order_index: quiz?.questions?.length || 0,
    });
    if (!error) {
      toast.success('Question added');
      setAddingQuestionTo(null);
      setQuestionForm({ question: '', type: 'mcq', options: ['', '', '', ''], correct_answer: '', points: 1 });
      fetchQuizzes();
    } else toast.error('Failed to add question');
  };

  const handleAIQuizFromCurriculum = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiQuizNewName.trim()) return;
    setAIQuizCreating(true);
    try {
      const { data, error } = await supabase
        .from('quizzes')
        .insert({ course_id: courseId, title: aiQuizNewName.trim(), pass_mark: 70, pass_percentage: 70, max_attempts: 3, is_published: true })
        .select('id')
        .single();
      if (error || !data) throw error || new Error('Failed to create quiz');
      fetchQuizzes();
      setAiQuizTarget(data.id);
      setShowAIQuizFromCurriculum(false);
      setAIQuizNewName('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create quiz');
    } finally {
      setAIQuizCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const table = deleteTarget.type === 'quiz' ? 'quizzes' : 'quiz_questions';
    const { error } = await supabase.from(table).delete().eq('id', deleteTarget.id);
    if (error) toast.error('Could not delete it.');
    else toast.success(deleteTarget.type === 'quiz' ? 'Quiz deleted' : 'Question deleted');
    setDeleteTarget(null);
    fetchQuizzes();
  };

  return (
    <>
              <div className="space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <h2 className="font-bold text-slate-800">Quizzes</h2>
                    <p className="text-sm text-slate-500 mt-0.5">Test student knowledge and track progress</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowAIQuizFromCurriculum(true)}
                      className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded-xl transition-colors"
                    >
                      <Sparkles className="w-4 h-4" /> Generate with AI
                    </button>
                    <button onClick={() => setShowQuizCreate(true)} className="btn-primary text-sm py-2 flex items-center gap-2">
                      <Plus className="w-4 h-4" /> New Quiz
                    </button>
                  </div>
                </div>

                {quizzes.length === 0 && (
                  <div className="lms-panel">
                    <div className="flex flex-col items-center justify-center py-16 text-center px-6">
                      <div className="w-14 h-14 bg-sky-100 rounded-2xl flex items-center justify-center mb-4">
                        <HelpCircle className="w-7 h-7 text-sky-400" />
                      </div>
                      <h3 className="font-bold text-slate-800 mb-1">No quizzes yet</h3>
                      <p className="text-sm text-slate-500 max-w-xs mb-4">Create quizzes to assess student understanding and provide feedback.</p>
                      <button onClick={() => setShowAIQuizFromCurriculum(true)} className="flex items-center gap-2 px-4 py-2.5 mb-2 text-sm font-semibold text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded-xl transition-colors">
                        <Sparkles className="w-4 h-4" /> Generate Quiz with AI
                      </button>
                      <button onClick={() => setShowQuizCreate(true)} className="btn-primary text-sm py-2 flex items-center gap-2">
                        <Plus className="w-4 h-4" /> Create First Quiz
                      </button>
                    </div>
                  </div>
                )}

                {quizzes.map(quiz => (
                  <div key={quiz.id} className="lms-panel">
                    <div
                      className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-slate-50 transition-colors"
                      onClick={() => setExpandedQuiz(expandedQuiz === quiz.id ? null : quiz.id)}
                    >
                      <div className="w-10 h-10 bg-sky-100 rounded-xl flex items-center justify-center shrink-0">
                        <HelpCircle className="w-5 h-5 text-sky-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-bold text-slate-800">{quiz.title}</h3>
                          <span className="badge badge-sky">{quiz.questions?.length || 0} questions</span>
                          {weekOf(quiz.section_id) && <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{weekOf(quiz.section_id)}</span>}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-slate-500 flex-wrap">
                          <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{quiz.time_limit_minutes ? `${quiz.time_limit_minutes} min` : 'No time limit'}</span>
                          <span className="flex items-center gap-1"><Award className="w-3 h-3" />Pass: {quiz.pass_mark}%</span>
                          <span className="flex items-center gap-1"><CheckCircle className="w-3 h-3" />{quiz.max_attempts} attempt{quiz.max_attempts !== 1 ? 's' : ''}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={e => { e.stopPropagation(); setAiQuizTarget(quiz.id); }}
                          className="p-1.5 rounded-lg text-sky-400 hover:text-sky-600 hover:bg-sky-50 transition-colors"
                          title="Generate questions with AI"
                        >
                          <Sparkles className="w-4 h-4" />
                        </button>
                        <button onClick={e => { e.stopPropagation(); setDeleteTarget({ type: 'quiz', id: quiz.id, name: quiz.title }); }} className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                        <div className={`p-1.5 rounded-lg text-slate-400 transition-transform ${expandedQuiz === quiz.id ? 'rotate-180' : ''}`}>
                          <ChevronDown className="w-5 h-5" />
                        </div>
                      </div>
                    </div>

                    {expandedQuiz === quiz.id && (
                      <div className="border-t border-slate-100">
                        <div className="p-4 space-y-3">
                          {quiz.questions && quiz.questions.length > 0 ? quiz.questions.map((q, idx) => (
                            <div key={q.id} className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                              <div className="flex items-start gap-3">
                                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-sky-100 text-sky-700 text-xs font-bold shrink-0 mt-0.5">{idx + 1}</span>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-semibold text-slate-800">{q.question}</p>
                                  <div className="flex items-center gap-2 mt-1.5">
                                    <span className="badge badge-sky capitalize">{q.type.replace('_', ' ')}</span>
                                    <span className="text-xs text-slate-400">{q.points} pt{q.points !== 1 ? 's' : ''}</span>
                                  </div>
                                  {q.options && q.options.length > 0 && (
                                    <div className="mt-2.5 grid grid-cols-2 gap-1.5">
                                      {q.options.map((opt, i) => (
                                        <div key={i} className={`text-xs px-3 py-2 rounded-lg flex items-center gap-2 ${opt === q.correct_answer ? 'bg-green-100 text-green-700 font-semibold' : 'bg-white border border-slate-200 text-slate-600'}`}>
                                          {opt === q.correct_answer ? <CheckCircle className="w-3 h-3 shrink-0" /> : <div className="w-3 h-3 rounded-full border border-slate-300 shrink-0" />}
                                          {opt}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                  {q.type === 'short_answer' && (
                                    <p className="text-xs text-green-700 mt-2 flex items-center gap-1 bg-green-50 px-3 py-1.5 rounded-lg">
                                      <CheckCircle className="w-3 h-3 shrink-0" /> Expected: {q.correct_answer}
                                    </p>
                                  )}
                                </div>
                                <button onClick={() => setDeleteTarget({ type: 'question', id: q.id, name: q.question.slice(0, 40) })} className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          )) : (
                            <div className="text-center py-6">
                              <p className="text-sm text-slate-400 font-medium">No questions yet</p>
                            </div>
                          )}

                          {addingQuestionTo === quiz.id ? (
                            <form onSubmit={handleAddQuestion} className="bg-white border border-sky-200 rounded-xl p-4 space-y-3">
                              <div className="flex items-center gap-2 mb-1">
                                <div className="w-5 h-5 bg-sky-500 rounded-full flex items-center justify-center shrink-0">
                                  <Plus className="w-3 h-3 text-white" />
                                </div>
                                <span className="text-sm font-bold text-sky-700">New Question</span>
                              </div>
                              <textarea value={questionForm.question} onChange={e => setQuestionForm(f => ({ ...f, question: e.target.value }))} className="input-field resize-none text-sm" rows={2} placeholder="Enter your question here..." required />
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">Question Type</label>
                                  <select value={questionForm.type} onChange={e => { const t = e.target.value as typeof questionForm.type; setQuestionForm(f => ({ ...f, type: t, options: t === 'true_false' ? ['True', 'False'] : ['', '', '', ''], correct_answer: '' })); }} className="input-field text-sm">
                                    <option value="mcq">Multiple Choice</option>
                                    <option value="true_false">True / False</option>
                                    <option value="short_answer">Short Answer</option>
                                  </select>
                                </div>
                                <div>
                                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">Points</label>
                                  <NumberInput min={1} value={questionForm.points} onChange={n => setQuestionForm(f => ({ ...f, points: n }))} className="input-field text-sm" />
                                </div>
                              </div>

                              {questionForm.type === 'mcq' && (
                                <div className="space-y-2">
                                  <label className="text-xs font-semibold text-slate-500">Answer Options — click radio to mark correct</label>
                                  {questionForm.options.map((opt, i) => (
                                    <div key={i} className={`flex items-center gap-2 p-2 rounded-lg border transition-colors ${questionForm.correct_answer === opt && opt.trim() ? 'border-green-300 bg-green-50' : 'border-slate-200 bg-white'}`}>
                                      <input type="radio" name="correct_mcq" checked={questionForm.correct_answer === opt && opt.trim() !== ''} onChange={() => opt.trim() && setQuestionForm(f => ({ ...f, correct_answer: opt }))} className="accent-green-500 shrink-0" />
                                      <input type="text" value={opt} onChange={e => { const newOpts = [...questionForm.options]; newOpts[i] = e.target.value; setQuestionForm(f => ({ ...f, options: newOpts })); }} className="flex-1 text-sm bg-transparent focus:outline-none text-slate-800 placeholder-slate-300" placeholder={`Option ${i + 1}`} />
                                    </div>
                                  ))}
                                </div>
                              )}

                              {questionForm.type === 'true_false' && (
                                <div className="flex gap-3">
                                  {['True', 'False'].map(v => (
                                    <label key={v} className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border cursor-pointer text-sm font-semibold transition-all ${questionForm.correct_answer === v ? 'border-green-500 bg-green-50 text-green-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                                      <input type="radio" name="correct_tf" value={v} checked={questionForm.correct_answer === v} onChange={() => setQuestionForm(f => ({ ...f, correct_answer: v }))} className="sr-only" />
                                      {v === 'True' ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                                      {v}
                                    </label>
                                  ))}
                                </div>
                              )}

                              {questionForm.type === 'short_answer' && (
                                <div>
                                  <label className="text-xs font-semibold text-slate-500 mb-1.5 block">Expected Answer (for marking guidance)</label>
                                  <input type="text" value={questionForm.correct_answer} onChange={e => setQuestionForm(f => ({ ...f, correct_answer: e.target.value }))} className="input-field text-sm" placeholder="Expected answer..." required />
                                </div>
                              )}

                              {!questionForm.correct_answer && questionForm.type !== 'short_answer' && (
                                <p className="text-xs text-warning-600 flex items-center gap-1 bg-warning-50 px-3 py-2 rounded-lg">
                                  <AlertCircle className="w-3.5 h-3.5 shrink-0" /> Select the correct answer above
                                </p>
                              )}

                              <div className="flex gap-2 pt-1">
                                <button type="submit" className="btn-primary text-sm py-2 flex items-center gap-2"><Check className="w-4 h-4" /> Add Question</button>
                                <button type="button" onClick={() => setAddingQuestionTo(null)} className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">Cancel</button>
                              </div>
                            </form>
                          ) : (
                            <button
                              onClick={() => { setAddingQuestionTo(quiz.id); setQuestionForm({ question: '', type: 'mcq', options: ['', '', '', ''], correct_answer: '', points: 1 }); }}
                              className="flex items-center justify-center gap-2 w-full py-3 border-2 border-dashed border-slate-200 rounded-xl text-sm font-semibold text-slate-500 hover:border-sky-400 hover:text-sky-600 hover:bg-sky-50 transition-all"
                            >
                              <Plus className="w-4 h-4" /> Add Question
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

      {showAIQuizFromCurriculum && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => { if (!aiQuizCreating) setShowAIQuizFromCurriculum(false); }} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm animate-slide-up">
            <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100">
              <div className="w-9 h-9 bg-sky-100 rounded-xl flex items-center justify-center shrink-0">
                <Sparkles className="w-5 h-5 text-sky-600" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-slate-900">Generate Quiz with AI</h3>
                <p className="text-xs text-slate-400 mt-0.5">Name your quiz, then pick a lesson to generate from</p>
              </div>
              {!aiQuizCreating && (
                <button onClick={() => setShowAIQuizFromCurriculum(false)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <form onSubmit={handleAIQuizFromCurriculum} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Quiz Title <span className="text-red-500">*</span></label>
                <input
                  autoFocus
                  type="text"
                  value={aiQuizNewName}
                  onChange={e => setAIQuizNewName(e.target.value)}
                  className="input-field"
                  placeholder="e.g. Reading Skills Assessment"
                  required
                />
              </div>
              <div className="flex items-start gap-2.5 bg-sky-50 border border-sky-200 rounded-xl px-4 py-3 text-xs text-sky-700">
                <Sparkles className="w-3.5 h-3.5 shrink-0 mt-0.5 text-sky-500" />
                The quiz will be created and the AI generator will open so you can pick a lesson from your curriculum and configure question types.
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowAIQuizFromCurriculum(false)} disabled={aiQuizCreating} className="flex-1 px-4 py-2.5 text-sm border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 font-medium transition-colors disabled:opacity-50">
                  Cancel
                </button>
                <button type="submit" disabled={aiQuizCreating || !aiQuizNewName.trim()} className="flex-1 btn-primary text-sm py-2.5 flex items-center justify-center gap-2 disabled:opacity-60">
                  {aiQuizCreating ? (
                    <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Creating...</>
                  ) : (
                    <><Sparkles className="w-4 h-4" /> Continue</>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showQuizCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowQuizCreate(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md animate-slide-up">
            <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100">
              <div className="w-9 h-9 bg-sky-100 rounded-xl flex items-center justify-center">
                <HelpCircle className="w-4.5 h-4.5 text-sky-600" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900">Create New Quiz</h3>
                <p className="text-xs text-slate-400 mt-0.5">Configure your quiz settings below</p>
              </div>
              <button onClick={() => setShowQuizCreate(false)} className="ml-auto p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreateQuiz} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Quiz Title <span className="text-red-500">*</span></label>
                <input type="text" value={quizForm.title} onChange={e => setQuizForm(f => ({ ...f, title: e.target.value }))} className="input-field" placeholder="e.g. Reading Skills Assessment" required />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Description</label>
                <input type="text" value={quizForm.description} onChange={e => setQuizForm(f => ({ ...f, description: e.target.value }))} className="input-field" placeholder="Optional description for students" />
              </div>
              {sections.length > 0 && (
                <div>
                  <label htmlFor="quiz-week" className="block text-sm font-semibold text-slate-700 mb-1.5">Week</label>
                  <select id="quiz-week" value={quizForm.section_id} onChange={e => setQuizForm(f => ({ ...f, section_id: e.target.value }))} className="input-field">
                    <option value="">Not linked to a week (end-of-course quiz)</option>
                    {sections.map((s, i) => <option key={s.id} value={s.id}>Week {i + 1}: {s.title}</option>)}
                  </select>
                </div>
              )}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">Time Limit (min)</label>
                  <input type="number" min="1" value={quizForm.time_limit_minutes} onChange={e => setQuizForm(f => ({ ...f, time_limit_minutes: e.target.value }))} className="input-field text-sm" placeholder="None" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">Pass Mark (%)</label>
                  <NumberInput min={1} max={100} step="1" value={quizForm.pass_mark} onChange={n => setQuizForm(f => ({ ...f, pass_mark: n }))} className="input-field text-sm" required />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">Max Attempts</label>
                  <NumberInput min={1} step="1" value={quizForm.max_attempts} onChange={n => setQuizForm(f => ({ ...f, max_attempts: n }))} className="input-field text-sm" required />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowQuizCreate(false)} className="flex-1 px-4 py-2.5 text-sm border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 font-medium transition-colors">Cancel</button>
                <button type="submit" className="flex-1 btn-primary text-sm py-2.5 flex items-center justify-center gap-2">
                  <Plus className="w-4 h-4" /> Create Quiz
                </button>
              </div>
            </form>
          </div>
        </div>
      )}


      <ConfirmDialog
        isOpen={!!deleteTarget}
        title={deleteTarget?.type === 'quiz' ? 'Delete quiz' : 'Delete question'}
        message={`Are you sure you want to delete "${deleteTarget?.name}"?${deleteTarget?.type === 'quiz' ? ' All its questions and attempts will also be deleted.' : ''}`}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        confirmText="Delete"
      />

      {aiQuizTarget && (
        <Suspense fallback={null}>
          <AIQuizGeneratorModal
            quizId={aiQuizTarget}
            courseId={courseId}
            lessons={sections.flatMap(s => s.lessons.map(l => ({ id: l.id, title: l.title, content: l.content ?? '' })))}
            onClose={() => setAiQuizTarget(null)}
            onAdded={() => { fetchQuizzes(); setAiQuizTarget(null); }}
          />
        </Suspense>
      )}
    </>
  );
}
