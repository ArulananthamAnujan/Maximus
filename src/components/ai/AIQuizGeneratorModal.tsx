import { useState } from 'react';
import { X, Sparkles, Trash2, Check, AlertCircle } from 'lucide-react';
import { useGenerateQuiz } from '../../hooks/useAI';
import AILoader from '../ui/AILoader';
import { supabase } from '../../lib/supabase';
import { toast } from 'sonner';
import type { AIQuizQuestion } from '../../lib/ai';

interface Lesson {
  id: string;
  title: string;
  content?: string;
}

interface Props {
  quizId: string;
  courseId: string;
  lessons: Lesson[];
  onClose: () => void;
  onAdded: () => void;
}

const QUESTION_TYPES = [
  { value: 'mcq', label: 'Multiple Choice' },
  { value: 'true_false', label: 'True / False' },
  { value: 'short_answer', label: 'Short Answer' },
] as const;

export default function AIQuizGeneratorModal({ quizId, courseId, lessons, onClose, onAdded }: Props) {
  const generateMutation = useGenerateQuiz(courseId);

  const [step, setStep] = useState<'form' | 'generating' | 'preview'>('form');
  const [form, setForm] = useState({
    lessonId: lessons[0]?.id || '',
    numQuestions: 5,
    questionTypes: ['mcq'] as ('mcq' | 'true_false' | 'short_answer')[],
    difficulty: 'medium' as 'easy' | 'medium' | 'hard',
  });
  const [questions, setQuestions] = useState<AIQuizQuestion[]>([]);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);

  const toggleType = (t: 'mcq' | 'true_false' | 'short_answer') => {
    setForm(f => {
      const has = f.questionTypes.includes(t);
      if (has && f.questionTypes.length === 1) return f;
      return {
        ...f,
        questionTypes: has ? f.questionTypes.filter(x => x !== t) : [...f.questionTypes, t],
      };
    });
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    const lesson = lessons.find(l => l.id === form.lessonId);
    if (!lesson?.content) {
      setError('The selected lesson has no content. Add content to the lesson first.');
      return;
    }
    setError('');
    setStep('generating');
    try {
      const result = await generateMutation.mutateAsync({
        lesson_content: lesson.content.slice(0, 10000),
        num_questions: form.numQuestions,
        question_types: form.questionTypes,
        difficulty: form.difficulty,
      });
      setQuestions(result.questions);
      setStep('preview');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
      setStep('form');
    }
  };

  const updateQuestion = (i: number, patch: Partial<AIQuizQuestion>) =>
    setQuestions(qs => qs.map((q, j) => j === i ? { ...q, ...patch } : q));

  const deleteQuestion = (i: number) =>
    setQuestions(qs => qs.filter((_, j) => j !== i));

  const handleAddToQuiz = async () => {
    setAdding(true);
    try {
      // Get current max order_index
      const { data: existing } = await supabase
        .from('quiz_questions')
        .select('order_index')
        .eq('quiz_id', quizId)
        .order('order_index', { ascending: false })
        .limit(1);

      const startIdx = (existing?.[0]?.order_index ?? -1) + 1;

      const rows = questions.map((q, i) => {
        const opts = q.options && q.options.length > 0 ? q.options : null;
        const correctIdx = opts ? opts.findIndex(o => o === q.correct_answer) : 0;
        return {
          quiz_id: quizId,
          question: q.question,
          type: q.type,
          options: opts,
          correct_answer: correctIdx >= 0 ? correctIdx : 0,
          correct_answer_text: q.correct_answer,
          explanation: q.explanation || '',
          points: q.points,
          order_index: startIdx + i,
        };
      });

      const { error: insertErr } = await supabase.from('quiz_questions').insert(rows);
      if (insertErr) throw insertErr;

      toast.success(`Added ${questions.length} questions to the quiz`);
      onAdded();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add questions');
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={step === 'generating' ? undefined : onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100 shrink-0">
          <div className="w-8 h-8 bg-sky-100 rounded-xl flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-sky-600" />
          </div>
          <div>
            <h3 className="font-bold text-slate-900">Generate Quiz from Lesson</h3>
            <p className="text-xs text-slate-400">
              {step === 'form' && 'Select a lesson and configure your quiz'}
              {step === 'generating' && 'AI is crafting your questions...'}
              {step === 'preview' && `${questions.length} questions generated — review before adding`}
            </p>
          </div>
          {step !== 'generating' && (
            <button onClick={onClose} className="ml-auto p-1.5 rounded-lg text-slate-400 hover:bg-slate-100">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {step === 'form' && (
            <form id="ai-quiz-form" onSubmit={handleGenerate} className="p-6 space-y-5">
              {error && (
                <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />{error}
                </div>
              )}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Source Lesson <span className="text-red-500">*</span></label>
                <select value={form.lessonId} onChange={e => setForm(f => ({ ...f, lessonId: e.target.value }))} className="input-field">
                  {lessons.map(l => <option key={l.id} value={l.id}>{l.title}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Number of Questions <span className="text-xs font-normal text-slate-400">(3-20)</span></label>
                  <input type="number" min={3} max={20} value={form.numQuestions} onChange={e => setForm(f => ({ ...f, numQuestions: Number(e.target.value) }))} className="input-field" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Difficulty</label>
                  <select value={form.difficulty} onChange={e => setForm(f => ({ ...f, difficulty: e.target.value as typeof form.difficulty }))} className="input-field">
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Question Types</label>
                <div className="flex gap-2 flex-wrap">
                  {QUESTION_TYPES.map(qt => (
                    <button
                      key={qt.value}
                      type="button"
                      onClick={() => toggleType(qt.value)}
                      className={`px-3 py-2 text-sm rounded-lg border font-medium transition-all ${form.questionTypes.includes(qt.value) ? 'border-sky-500 bg-sky-50 text-sky-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
                    >
                      {qt.label}
                    </button>
                  ))}
                </div>
              </div>
            </form>
          )}

          {step === 'generating' && (
            <div className="p-12"><AILoader /></div>
          )}

          {step === 'preview' && (
            <div className="p-5 space-y-3">
              {questions.map((q, i) => (
                <div key={i} className="border border-slate-200 rounded-xl p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-sky-100 text-sky-700 text-xs font-bold shrink-0 mt-0.5">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <textarea
                        value={q.question}
                        onChange={e => updateQuestion(i, { question: e.target.value })}
                        className="w-full text-sm font-medium text-slate-800 bg-transparent border-0 focus:outline-none resize-none p-0"
                        rows={2}
                      />
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-xs px-2 py-0.5 rounded-md font-medium ${q.type === 'mcq' ? 'bg-sky-100 text-sky-700' : q.type === 'true_false' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
                          {q.type === 'mcq' ? 'MCQ' : q.type === 'true_false' ? 'True/False' : 'Short Answer'}
                        </span>
                        <span className="text-xs text-slate-400">{q.points} pt{q.points !== 1 ? 's' : ''}</span>
                      </div>
                      {q.options && q.options.length > 0 && (
                        <div className="mt-2.5 grid grid-cols-2 gap-1.5">
                          {q.options.map((opt, oi) => (
                            <div key={oi} className={`text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5 ${opt === q.correct_answer ? 'bg-green-100 text-green-700 font-semibold' : 'bg-slate-50 text-slate-600 border border-slate-100'}`}>
                              {opt === q.correct_answer && <Check className="w-3 h-3 shrink-0" />}
                              {opt}
                            </div>
                          ))}
                        </div>
                      )}
                      {q.type === 'short_answer' && (
                        <p className="text-xs text-green-700 mt-2 bg-green-50 px-3 py-1.5 rounded-lg flex items-center gap-1.5">
                          <Check className="w-3 h-3 shrink-0" /> {q.correct_answer}
                        </p>
                      )}
                      {q.explanation && (
                        <p className="text-xs text-slate-500 mt-2 italic">{q.explanation}</p>
                      )}
                    </div>
                    <button onClick={() => deleteQuestion(i)} className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-slate-100 shrink-0">
          {step === 'form' && (
            <>
              <button onClick={onClose} className="px-4 py-2.5 text-sm border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 font-medium">Cancel</button>
              <button type="submit" form="ai-quiz-form" className="btn-primary text-sm py-2.5 px-6 flex items-center gap-2">
                <Sparkles className="w-4 h-4" /> Generate Questions
              </button>
            </>
          )}
          {step === 'preview' && (
            <>
              <button onClick={() => { setStep('form'); setQuestions([]); }} className="px-4 py-2.5 text-sm border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 font-medium">
                Start Over
              </button>
              <button onClick={handleAddToQuiz} disabled={adding || questions.length === 0} className="btn-primary text-sm py-2.5 px-6 flex items-center gap-2 disabled:opacity-60">
                {adding ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Adding...</> : <><Check className="w-4 h-4" />Add {questions.length} Questions to Quiz</>}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
