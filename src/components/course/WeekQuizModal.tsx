import { useState } from 'react';
import { X, Sparkles, Loader2, Check } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase';
import { generateQuiz } from '../../lib/ai';
import type { AIQuizQuestion } from '../../lib/ai';
import { audienceFromPlan } from '../../lib/coursePlan';
import { stripHtml } from '../../lib/slides';
import { weekLessons } from '../../lib/workspace';
import type { Workspace } from '../../lib/workspace';
import NumberInput from '../ui/NumberInput';

interface Props {
  ws: Workspace;
  section: { id: string; title: string };
  onClose: () => void;
  onCreated: () => Promise<void>;
}

/** Writes a quiz from the week's own notes, reviewed by the teacher, and links it to the week. */
export default function WeekQuizModal({ ws, section, onClose, onCreated }: Props) {
  const [count, setCount] = useState(8);
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [types, setTypes] = useState<Array<'mcq' | 'true_false'>>(['mcq', 'true_false']);
  const [questions, setQuestions] = useState<AIQuizQuestion[] | null>(null);
  const [keep, setKeep] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState<'' | 'generate' | 'save'>('');
  const [error, setError] = useState('');

  const weekText = async () => {
    const sec = ws.sections.find(s => s.id === section.id);
    const lessons = sec ? weekLessons(sec, ws) : [];
    const { data } = await supabase.from('lesson_documents').select('lesson_id, content_html').eq('type', 'notes').in('lesson_id', lessons.map(l => l.id));
    const byLesson = new Map((data ?? []).map(d => [d.lesson_id, d.content_html]));
    return lessons
      .map(l => `## ${l.title}\n${stripHtml(byLesson.get(l.id) || l.content || l.description || '')}`)
      .join('\n\n')
      .slice(0, 16000);
  };

  const generate = async () => {
    setBusy('generate');
    setError('');
    try {
      const text = await weekText();
      if (text.replace(/##.*\n/g, '').trim().length < 300) throw new Error('This week needs lesson notes first; the quiz is written from them.');
      const { brief } = audienceFromPlan(ws.plan);
      const r = await generateQuiz({ lesson_content: text, num_questions: count, question_types: types, difficulty, brief });
      const qs = (r.questions ?? []).filter(q => q.question && q.correct_answer);
      if (qs.length === 0) throw new Error('The AI returned no usable questions. Please try again.');
      setQuestions(qs);
      setKeep(new Set(qs.map((_, i) => i)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not write the quiz.');
    } finally {
      setBusy('');
    }
  };

  const save = async () => {
    if (!questions) return;
    const chosen = questions.filter((_, i) => keep.has(i));
    if (chosen.length === 0) return;
    setBusy('save');
    try {
      const { data: quiz, error: qErr } = await supabase.from('quizzes').insert({
        course_id: ws.course.id, section_id: section.id, title: `${section.title}: check your understanding`,
        pass_mark: 70, pass_percentage: 70, max_attempts: 3, is_published: true, is_required: true,
      }).select('id').single();
      if (qErr || !quiz) throw new Error('Could not create the quiz.');
      const rows = chosen.map((q, i) => ({
        quiz_id: quiz.id,
        question: q.question,
        type: q.type === 'true_false' ? 'true_false' : 'mcq',
        options: q.options?.length ? q.options : ['True', 'False'],
        correct_answer: q.correct_answer,
        explanation: q.explanation || '',
        points: q.points || 1,
        order_index: i,
      }));
      const { error: rowsErr } = await supabase.from('quiz_questions').insert(rows);
      if (rowsErr) throw new Error('The quiz was created but its questions could not be saved.');
      toast.success(`Quiz added to ${section.title}`);
      await onCreated();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the quiz.');
    } finally {
      setBusy('');
    }
  };

  const toggleType = (t: 'mcq' | 'true_false') =>
    setTypes(prev => prev.includes(t) ? (prev.length > 1 ? prev.filter(x => x !== t) : prev) : [...prev, t]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={busy ? undefined : onClose} />
      <div role="dialog" aria-modal="true" aria-labelledby="week-quiz-title" className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100">
          <div className="flex-1 min-w-0">
            <h3 id="week-quiz-title" className="font-bold text-slate-900">Quiz for this week</h3>
            <p className="text-xs text-slate-500 truncate">{section.title} · written from the week's lesson notes</p>
          </div>
          <button onClick={onClose} disabled={!!busy} aria-label="Close" className="p-2 rounded-lg text-slate-400 hover:bg-slate-100"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {error && <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">{error}</p>}
          {!questions ? (
            <div className="space-y-4">
              <div className="flex gap-4 flex-wrap">
                <div>
                  <label htmlFor="quiz-count" className="block text-xs font-semibold text-slate-600 mb-1.5">Questions</label>
                  <NumberInput id="quiz-count" min={3} max={20} value={count} onChange={setCount} className="input-field text-sm w-24" />
                </div>
                <div>
                  <label htmlFor="quiz-diff" className="block text-xs font-semibold text-slate-600 mb-1.5">Difficulty</label>
                  <select id="quiz-diff" value={difficulty} onChange={e => setDifficulty(e.target.value as typeof difficulty)} className="input-field text-sm">
                    <option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option>
                  </select>
                </div>
                <fieldset>
                  <legend className="block text-xs font-semibold text-slate-600 mb-1.5">Question types</legend>
                  <div className="flex gap-3 pt-2">
                    <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={types.includes('mcq')} onChange={() => toggleType('mcq')} className="accent-sky-600" /> Multiple choice</label>
                    <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={types.includes('true_false')} onChange={() => toggleType('true_false')} className="accent-sky-600" /> True / false</label>
                  </div>
                </fieldset>
              </div>
              <p className="text-xs text-slate-500">Students are marked automatically. You review every question before it is added.</p>
            </div>
          ) : (
            <ol className="space-y-3">
              {questions.map((q, i) => (
                <li key={i} className={`border rounded-xl p-3 ${keep.has(i) ? 'border-slate-200' : 'border-slate-100 opacity-50'}`}>
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input type="checkbox" checked={keep.has(i)} onChange={() => setKeep(prev => { const n = new Set(prev); if (n.has(i)) n.delete(i); else n.add(i); return n; })} className="mt-1 accent-sky-600" />
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium text-slate-800">{i + 1}. {q.question}</span>
                      <span className="mt-1.5 flex flex-wrap gap-1.5">
                        {(q.options?.length ? q.options : ['True', 'False']).map(o => (
                          <span key={o} className={`text-xs px-2 py-1 rounded-md ${o === q.correct_answer ? 'bg-emerald-100 text-emerald-800 font-semibold' : 'bg-slate-50 text-slate-600'}`}>
                            {o === q.correct_answer && <Check className="inline w-3 h-3 mr-0.5" />}{o}
                          </span>
                        ))}
                      </span>
                      {q.explanation && <span className="block text-xs text-slate-500 mt-1.5">{q.explanation}</span>}
                    </span>
                  </label>
                </li>
              ))}
            </ol>
          )}
        </div>
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-slate-100">
          {questions ? (
            <>
              <button onClick={() => setQuestions(null)} disabled={!!busy} className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-700">Start again</button>
              <button onClick={save} disabled={!!busy || keep.size === 0} className="flex items-center gap-2 px-5 py-2.5 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-sm font-bold rounded-xl">
                {busy === 'save' && <Loader2 className="w-4 h-4 animate-spin" />} Add {keep.size} question{keep.size === 1 ? '' : 's'} to the week
              </button>
            </>
          ) : (
            <>
              <button onClick={onClose} className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-700">Cancel</button>
              <button onClick={generate} disabled={!!busy} className="flex items-center gap-2 px-5 py-2.5 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-sm font-bold rounded-xl">
                {busy === 'generate' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Write the questions
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
