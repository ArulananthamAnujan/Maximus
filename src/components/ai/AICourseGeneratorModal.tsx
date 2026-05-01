import { useState } from 'react';
import { X, Sparkles, ChevronUp, ChevronDown, Trash2, Plus, Loader2, BookOpen, Layers } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useGenerateCourseOutline } from '../../hooks/useAI';
import AILoader from '../ui/AILoader';
import type { CourseOutlineOutput, AIModuleItem, AILessonItem } from '../../lib/ai';

interface Props {
  onClose: () => void;
  navigatePrefix: string; // '/teacher/builder' or '/admin/builder'
}

type Step = 'form' | 'generating' | 'preview' | 'saving';

const TARGET_AUDIENCES = [
  { value: 'school students K-12', label: 'School Students (K-12)' },
  { value: 'university students', label: 'University Students' },
  { value: 'self-learners', label: 'Self-Learners' },
  { value: 'professionals', label: 'Professionals' },
];

export default function AICourseGeneratorModal({ onClose, navigatePrefix }: Props) {
  const navigate = useNavigate();
  const generateMutation = useGenerateCourseOutline();

  const [step, setStep] = useState<Step>('form');
  const [form, setForm] = useState({
    topic: '',
    target_audience: 'professionals',
    difficulty: 'beginner' as 'beginner' | 'intermediate' | 'advanced',
    num_modules: 5,
    lessons_per_module: 4,
  });

  const [outline, setOutline] = useState<CourseOutlineOutput | null>(null);
  const [error, setError] = useState('');

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setStep('generating');
    try {
      const result = await generateMutation.mutateAsync(form);
      setOutline(result);
      setStep('preview');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
      setStep('form');
    }
  };

  const updateTitle = (v: string) => setOutline(o => o ? { ...o, title: v } : o);
  const updateDesc = (v: string) => setOutline(o => o ? { ...o, description: v } : o);

  const updateModule = (mi: number, patch: Partial<AIModuleItem>) =>
    setOutline(o => o ? { ...o, modules: o.modules.map((m, i) => i === mi ? { ...m, ...patch } : m) } : o);

  const deleteModule = (mi: number) =>
    setOutline(o => o ? { ...o, modules: o.modules.filter((_, i) => i !== mi) } : o);

  const moveModule = (mi: number, dir: -1 | 1) =>
    setOutline(o => {
      if (!o) return o;
      const mods = [...o.modules];
      const ni = mi + dir;
      if (ni < 0 || ni >= mods.length) return o;
      [mods[mi], mods[ni]] = [mods[ni], mods[mi]];
      return { ...o, modules: mods };
    });

  const updateLesson = (mi: number, li: number, patch: Partial<AILessonItem>) =>
    setOutline(o => o ? {
      ...o,
      modules: o.modules.map((m, i) => i === mi ? {
        ...m,
        lessons: m.lessons.map((l, j) => j === li ? { ...l, ...patch } : l),
      } : m),
    } : o);

  const deleteLesson = (mi: number, li: number) =>
    setOutline(o => o ? {
      ...o,
      modules: o.modules.map((m, i) => i === mi ? {
        ...m,
        lessons: m.lessons.filter((_, j) => j !== li),
      } : m),
    } : o);

  const moveLesson = (mi: number, li: number, dir: -1 | 1) =>
    setOutline(o => {
      if (!o) return o;
      const mods = [...o.modules];
      const lessons = [...mods[mi].lessons];
      const ni = li + dir;
      if (ni < 0 || ni >= lessons.length) return o;
      [lessons[li], lessons[ni]] = [lessons[ni], lessons[li]];
      mods[mi] = { ...mods[mi], lessons };
      return { ...o, modules: mods };
    });

  const handleCreate = async () => {
    if (!outline) return;
    setStep('saving');
    try {
      const { data, error: rpcErr } = await supabase.rpc('create_ai_course', {
        payload: {
          title: outline.title,
          description: outline.description,
          level: form.difficulty,
          modules: outline.modules,
        },
      });
      if (rpcErr) throw rpcErr;
      navigate(`${navigatePrefix}?courseId=${data}`);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create course');
      setStep('preview');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={step === 'generating' || step === 'saving' ? undefined : onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100 shrink-0">
          <div className="w-9 h-9 bg-sky-100 rounded-xl flex items-center justify-center">
            <Sparkles className="w-4.5 h-4.5 text-sky-600" />
          </div>
          <div>
            <h2 className="font-bold text-slate-900">Generate Course with AI</h2>
            <p className="text-xs text-slate-400">
              {step === 'form' && 'Fill in details to generate a complete course outline'}
              {step === 'generating' && 'AI is designing your course...'}
              {step === 'preview' && 'Review and edit before creating'}
              {step === 'saving' && 'Creating your course...'}
            </p>
          </div>
          {step !== 'generating' && step !== 'saving' && (
            <button onClick={onClose} className="ml-auto p-1.5 rounded-lg text-slate-400 hover:bg-slate-100">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {step === 'form' && (
            <form id="ai-course-form" onSubmit={handleGenerate} className="p-6 space-y-5">
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>
              )}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Course Topic <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={form.topic}
                  onChange={e => setForm(f => ({ ...f, topic: e.target.value }))}
                  className="input-field"
                  placeholder="e.g. IELTS Academic Writing, Python for Data Science, Xero Accounting..."
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Target Audience</label>
                  <select value={form.target_audience} onChange={e => setForm(f => ({ ...f, target_audience: e.target.value }))} className="input-field">
                    {TARGET_AUDIENCES.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Difficulty</label>
                  <select value={form.difficulty} onChange={e => setForm(f => ({ ...f, difficulty: e.target.value as typeof form.difficulty }))} className="input-field">
                    <option value="beginner">Beginner</option>
                    <option value="intermediate">Intermediate</option>
                    <option value="advanced">Advanced</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Number of Modules <span className="text-xs font-normal text-slate-400">(3-12)</span></label>
                  <input type="number" min={3} max={12} value={form.num_modules} onChange={e => setForm(f => ({ ...f, num_modules: Number(e.target.value) }))} className="input-field" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Lessons per Module <span className="text-xs font-normal text-slate-400">(3-12)</span></label>
                  <input type="number" min={3} max={12} value={form.lessons_per_module} onChange={e => setForm(f => ({ ...f, lessons_per_module: Number(e.target.value) }))} className="input-field" />
                </div>
              </div>
              <div className="flex items-center gap-2 bg-sky-50 border border-sky-100 rounded-xl px-4 py-3 text-xs text-sky-700">
                <Sparkles className="w-4 h-4 shrink-0" />
                AI will generate approximately {form.num_modules * form.lessons_per_module} lessons across {form.num_modules} modules. Generation takes 5-20 seconds.
              </div>
            </form>
          )}

          {step === 'generating' && (
            <div className="p-12">
              <AILoader />
            </div>
          )}

          {step === 'saving' && (
            <div className="flex flex-col items-center justify-center p-12 gap-4">
              <Loader2 className="w-10 h-10 text-sky-500 animate-spin" />
              <p className="text-sm font-medium text-slate-600">Creating your course in the database...</p>
            </div>
          )}

          {(step === 'preview') && outline && (
            <div className="p-6 space-y-4">
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>
              )}
              {/* Course title + description */}
              <div className="space-y-3 pb-4 border-b border-slate-100">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Course Title</label>
                  <input type="text" value={outline.title} onChange={e => updateTitle(e.target.value)} className="input-field text-base font-semibold" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Description</label>
                  <textarea value={outline.description} onChange={e => updateDesc(e.target.value)} className="input-field resize-none" rows={2} />
                </div>
              </div>

              {/* Modules */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-slate-400" />
                  <h3 className="text-sm font-bold text-slate-700">{outline.modules.length} Modules</h3>
                  <span className="text-xs text-slate-400">— {outline.modules.reduce((t, m) => t + m.lessons.length, 0)} lessons total</span>
                </div>
                {outline.modules.map((mod, mi) => (
                  <div key={mi} className="border border-slate-200 rounded-xl overflow-hidden">
                    {/* Module header */}
                    <div className="flex items-center gap-3 px-4 py-3 bg-slate-50 border-b border-slate-100">
                      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-sky-100 text-sky-700 text-xs font-bold shrink-0">{mi + 1}</span>
                      <div className="flex-1 min-w-0">
                        <input
                          type="text"
                          value={mod.title}
                          onChange={e => updateModule(mi, { title: e.target.value })}
                          className="w-full text-sm font-semibold text-slate-800 bg-transparent border-0 focus:outline-none focus:ring-0 p-0"
                        />
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => moveModule(mi, -1)} disabled={mi === 0} className="p-1 rounded text-slate-300 hover:text-slate-600 disabled:opacity-30"><ChevronUp className="w-3.5 h-3.5" /></button>
                        <button onClick={() => moveModule(mi, 1)} disabled={mi === outline.modules.length - 1} className="p-1 rounded text-slate-300 hover:text-slate-600 disabled:opacity-30"><ChevronDown className="w-3.5 h-3.5" /></button>
                        <button onClick={() => deleteModule(mi)} className="p-1 rounded text-slate-300 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>
                    {/* Lessons */}
                    <div className="divide-y divide-slate-50">
                      {mod.lessons.map((lesson, li) => (
                        <div key={li} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50/60">
                          <BookOpen className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                          <span className="text-xs text-slate-300 font-mono w-4 shrink-0">{li + 1}</span>
                          <input
                            type="text"
                            value={lesson.title}
                            onChange={e => updateLesson(mi, li, { title: e.target.value })}
                            className="flex-1 text-sm text-slate-700 bg-transparent border-0 focus:outline-none focus:ring-0 p-0"
                          />
                          <input
                            type="number"
                            min={1}
                            value={lesson.estimated_duration_minutes}
                            onChange={e => updateLesson(mi, li, { estimated_duration_minutes: Number(e.target.value) })}
                            className="w-14 text-xs text-slate-500 bg-transparent border-0 focus:outline-none text-right p-0"
                            title="Duration (minutes)"
                          />
                          <span className="text-xs text-slate-400 shrink-0">min</span>
                          <div className="flex items-center gap-0.5 shrink-0">
                            <button onClick={() => moveLesson(mi, li, -1)} disabled={li === 0} className="p-1 rounded text-slate-200 hover:text-slate-500 disabled:opacity-30"><ChevronUp className="w-3 h-3" /></button>
                            <button onClick={() => moveLesson(mi, li, 1)} disabled={li === mod.lessons.length - 1} className="p-1 rounded text-slate-200 hover:text-slate-500 disabled:opacity-30"><ChevronDown className="w-3 h-3" /></button>
                            <button onClick={() => deleteLesson(mi, li)} className="p-1 rounded text-slate-200 hover:text-red-500"><Trash2 className="w-3 h-3" /></button>
                          </div>
                        </div>
                      ))}
                      <button
                        onClick={() => updateModule(mi, { lessons: [...mod.lessons, { title: 'New Lesson', description: '', estimated_duration_minutes: 10 }] })}
                        className="flex items-center gap-2 w-full px-4 py-2.5 text-xs font-medium text-sky-600 hover:bg-sky-50 transition-colors border-t border-dashed border-slate-100"
                      >
                        <Plus className="w-3 h-3" /> Add Lesson
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-slate-100 shrink-0">
          {step === 'form' && (
            <>
              <button type="button" onClick={onClose} className="px-4 py-2.5 text-sm border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 font-medium">
                Cancel
              </button>
              <button type="submit" form="ai-course-form" className="btn-primary text-sm py-2.5 px-6 flex items-center gap-2">
                <Sparkles className="w-4 h-4" /> Generate Course Outline
              </button>
            </>
          )}
          {step === 'preview' && (
            <>
              <button onClick={() => { setStep('form'); setOutline(null); }} className="px-4 py-2.5 text-sm border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 font-medium">
                Start Over
              </button>
              <button onClick={handleCreate} className="btn-primary text-sm py-2.5 px-6 flex items-center gap-2">
                <BookOpen className="w-4 h-4" /> Create This Course
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
