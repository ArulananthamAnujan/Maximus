import { useEffect, useRef, useState } from 'react';
import { X, Sparkles, Layers, ChevronDown, ChevronUp, HelpCircle, Info } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase';
import CoursePlannerChat from '../ai/CoursePlannerChat';
import { loadCoursePlan, saveCoursePlan } from '../../lib/coursePlan';
import type { CoursePlan } from '../../lib/coursePlan';
import type { AICurriculumSection, CourseBrief, PlannerMessage, WebSource } from '../../lib/ai';
import type { WsSection } from '../../lib/workspace';

interface Props {
  courseId: string;
  courseTitle: string;
  sections: WsSection[];
  /** Send this to the planner straight away (from the assistant's ask box). */
  initialMessage?: string;
  /** Open the file picker straight away (build from my own material). */
  startWithUpload?: boolean;
  onClose: () => void;
  /** New weeks were added; their notes and slides should be written next. */
  onInserted: (newSectionIds: string[]) => void;
}

type Step = 'plan' | 'loading' | 'preview';

const BATCH_SIZE = 4;

export default function PlanWeeksModal({ courseId, courseTitle, sections, initialMessage, startWithUpload, onClose, onInserted }: Props) {
  const [mode, setMode] = useState<'chat' | 'form'>('chat');
  const [step, setStep] = useState<Step>('plan');
  const [ready, setReady] = useState(false);
  const [plan, setPlan] = useState<CoursePlan | null>(null);
  const [messages, setMessages] = useState<PlannerMessage[]>([]);
  const [brief, setBrief] = useState<CourseBrief | null>(null);
  const [research, setResearch] = useState<{ notes: string; sources: WebSource[] }>({ notes: '', sources: [] });
  const [material, setMaterial] = useState<CoursePlan['material']>(null);
  const [form, setForm] = useState({ topic: courseTitle, target_audience: 'general', difficulty: 'beginner', num_sections: 3, lessons_per_section: 3, use_existing_context: true });
  const [preview, setPreview] = useState<AICurriculumSection[]>([]);
  const [expanded, setExpanded] = useState<number | null>(0);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [inserting, setInserting] = useState(false);
  const [insertStatus, setInsertStatus] = useState('');
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  useEffect(() => {
    let cancelled = false;
    loadCoursePlan(courseId).then(saved => {
      if (cancelled) return;
      setPlan(saved);
      setResearch({ notes: saved?.research_notes ?? '', sources: saved?.sources ?? [] });
      setMaterial(saved?.material ?? null);
      const weeks = sections.length;
      const opener: PlannerMessage = {
        role: 'planner',
        content: weeks === 0
          ? "Let's plan this course's weeks together. Who is it for, and what should they be able to do when they finish?"
          : saved?.brief
            ? `Welcome back. This course has ${weeks} week${weeks === 1 ? '' : 's'}, planned for ${saved.brief.audience || 'your learners'}. What would you like to add or change next? For example more weeks, deeper coverage of a topic, more projects, or job-search preparation.`
            : `This course has ${weeks} week${weeks === 1 ? '' : 's'} so far. Tell me who it is for and what you would like to add next, and I will suggest the best way to extend it.`,
      };
      setMessages([...(saved?.messages ?? []).slice(-20), opener]);
      setReady(true);
    });
    return () => { cancelled = true; };
    // Load once when the dialog opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  const outline = sections.map((s, i) => `${i + 1}. ${s.title}${s.lessons.length ? ` (lessons: ${s.lessons.map(l => l.title).join('; ')})` : ''}`).join('\n');

  const generate = async (req: { topic: string; target_audience: string; difficulty: string; num_sections: number; lessons_per_section: number; use_existing_context: boolean; brief?: CourseBrief; focus?: string }) => {
    setStep('loading');
    setProgress(null);
    try {
      const { generateFullCurriculum } = await import('../../lib/ai');
      const all: AICurriculumSection[] = [];
      const base = req.use_existing_context && sections.length
        ? sections.map((s, i) => `Week/Section ${i + 1}: "${s.title}"${s.lessons.length ? ` — Lessons: ${s.lessons.map(l => l.title).join(', ')}` : ''}`).join('\n')
        : '';
      const existingCount = req.use_existing_context ? sections.length : 0;
      const batches = Math.ceil(req.num_sections / BATCH_SIZE);
      setProgress({ done: 0, total: batches });
      for (let b = 0; b < batches; b++) {
        const count = Math.min(BATCH_SIZE, req.num_sections - b * BATCH_SIZE);
        const sofar = all.map((s, i) => `Week/Section ${existingCount + i + 1}: "${s.title}" — Lessons: ${(s.lessons || []).map(l => l.title).join(', ')}`).join('\n');
        const summary = [base, sofar].filter(Boolean).join('\n') || undefined;
        const result = await generateFullCurriculum({
          topic: req.topic,
          target_audience: req.target_audience,
          difficulty: req.difficulty,
          num_sections: count,
          lessons_per_section: req.lessons_per_section,
          existing_sections_summary: summary,
          start_number: existingCount + all.length + 1,
          focus: req.focus,
          brief: req.brief,
        });
        const got = Array.isArray(result?.sections) ? result.sections : [];
        if (got.length === 0) throw new Error(`Part ${b + 1} came back empty. Please try again.`);
        all.push(...got);
        if (mounted.current) setProgress({ done: b + 1, total: batches });
      }
      if (!mounted.current) return;
      setPreview(all);
      setExpanded(0);
      setStep('preview');
    } catch (err) {
      if (!mounted.current) return;
      toast.error(err instanceof Error ? err.message : 'The AI could not plan these weeks. Please try again.');
      setStep('plan');
    } finally {
      if (mounted.current) setProgress(null);
    }
  };

  const createFromBrief = (agreed: CourseBrief) => {
    const clamp = (n: number, lo: number, hi: number, fb: number) => Math.min(Math.max(Math.round(Number(n)) || fb, lo), hi);
    const merged: CourseBrief = plan?.brief
      ? { ...plan.brief, ...agreed, market_findings: agreed.market_findings?.length ? agreed.market_findings : plan.brief.market_findings }
      : agreed;
    setBrief(merged);
    setForm(f => ({ ...f, num_sections: clamp(agreed.num_modules, 1, 12, 3) }));
    generate({
      topic: courseTitle || agreed.title_idea || agreed.topic,
      target_audience: [merged.audience, merged.starting_level].filter(Boolean).join(', ') || 'general learners',
      difficulty: merged.difficulty || 'beginner',
      num_sections: clamp(agreed.num_modules, 1, 12, 3),
      lessons_per_section: clamp(agreed.lessons_per_module, 2, 8, 4),
      use_existing_context: true,
      brief: merged,
      focus: agreed.approach,
    });
  };

  const insert = async () => {
    setInserting(true);
    const newIds: string[] = [];
    try {
      const startIdx = sections.length;
      for (let i = 0; i < preview.length; i++) {
        const sec = preview[i];
        setInsertStatus(`Adding week ${startIdx + i + 1}: ${sec.title}`);
        const { data: sectionRow, error: secErr } = await supabase.from('sections')
          .insert({ course_id: courseId, title: sec.title, order_index: startIdx + i }).select('id').single();
        if (secErr || !sectionRow) continue;
        newIds.push(sectionRow.id);

        const lessonRows = (sec.lessons || []).map((l, li) => ({
          section_id: sectionRow.id, course_id: courseId, title: l.title, type: 'text', lesson_type: 'text',
          description: l.description || '', content: '', duration_minutes: l.estimated_duration_minutes || 60,
          order_index: li, is_preview: false,
        }));
        let lessons: Array<{ id: string }> = [];
        if (lessonRows.length) {
          const { data } = await supabase.from('lessons').insert(lessonRows).select('id');
          lessons = data ?? [];
        }

        if (sec.quiz?.questions?.length) {
          const { data: quizRow } = await supabase.from('quizzes').insert({
            course_id: courseId, section_id: sectionRow.id, title: sec.quiz.title,
            pass_mark: 70, pass_percentage: 70, max_attempts: 3, is_published: true,
          }).select('id').single();
          if (quizRow) {
            await supabase.from('quiz_questions').insert(sec.quiz.questions.map((q, qi) => ({
              quiz_id: quizRow.id, question: q.question, type: q.type,
              options: q.options?.length ? q.options : ['True', 'False'],
              correct_answer: q.correct_answer ?? '', explanation: q.explanation || '', points: q.points || 1, order_index: qi,
            })));
          }
        }

        if (sec.activities?.length && lessons.length) {
          await supabase.from('lesson_activities').insert(sec.activities.map((a, ai) => ({
            lesson_id: lessons[0].id, course_id: courseId, title: a.title, type: a.type,
            instructions: a.instructions, estimated_minutes: a.estimated_minutes, order_index: ai,
          })));
        }
      }
      if (newIds.length === 0) throw new Error('No weeks could be added. Please try again.');
      if (brief || material !== (plan?.material ?? null)) {
        await saveCoursePlan(courseId, {
          brief: brief ?? plan?.brief ?? null,
          research_notes: research.notes,
          sources: research.sources,
          messages,
          material,
        }).catch(() => {});
      }
      toast.success(`${newIds.length} week${newIds.length === 1 ? '' : 's'} added. Now writing the notes and slides…`);
      onInserted(newIds);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not add the weeks.');
      if (newIds.length) onInserted(newIds);
    } finally {
      if (mounted.current) { setInserting(false); setInsertStatus(''); }
    }
  };

  const busy = step === 'loading' || inserting;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={busy ? undefined : onClose} />
      <div role="dialog" aria-modal="true" aria-labelledby="plan-weeks-title" className="relative bg-white sm:rounded-2xl shadow-2xl w-full max-w-3xl h-full sm:h-[88vh] flex flex-col overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
          <div className="w-9 h-9 bg-sky-100 rounded-xl flex items-center justify-center shrink-0"><Sparkles className="w-4 h-4 text-sky-600" /></div>
          <div className="flex-1 min-w-0">
            <h3 id="plan-weeks-title" className="font-bold text-slate-900">
              {step === 'preview' ? `Check the ${preview.length} new week${preview.length === 1 ? '' : 's'}` : sections.length ? 'Plan more weeks with AI' : 'Plan this course with AI'}
            </h3>
            <p className="text-xs text-slate-500 truncate">
              {step === 'plan' && (mode === 'chat' ? 'The planner knows your existing weeks and this course\'s plan.' : 'Quick form: no conversation.')}
              {step === 'loading' && 'Planning the weeks. This takes under a minute per four weeks.'}
              {step === 'preview' && 'Nothing is added until you press "Add these weeks".'}
            </p>
          </div>
          {!busy && <button onClick={onClose} aria-label="Close" className="p-2 rounded-lg text-slate-400 hover:bg-slate-100"><X className="w-4 h-4" /></button>}
        </div>

        {step === 'plan' && mode === 'chat' && (
          <div className="flex-1 flex flex-col min-h-0">
            {ready ? (
              <CoursePlannerChat
                messages={messages}
                onMessagesChange={setMessages}
                brief={brief}
                onBriefChange={setBrief}
                onCreate={createFromBrief}
                context={{ course_title: courseTitle, existing_outline: outline, saved_brief: plan?.brief ?? null }}
                initialResearch={research}
                onResearchChange={setResearch}
                createLabel={sections.length ? 'Plan these weeks' : 'Plan this curriculum'}
                openingSuggestions={sections.length ? ['Add more weeks', 'Go deeper on one topic', 'Add portfolio projects', 'Add job-search preparation'] : undefined}
                initialMaterial={material}
                onMaterialChange={setMaterial}
                startWithUpload={startWithUpload}
                initialMessage={initialMessage}
              />
            ) : (
              <div className="flex-1 flex items-center justify-center gap-2 text-sm text-slate-500">
                <div className="w-4 h-4 border-2 border-sky-300 border-t-sky-600 rounded-full animate-spin" /> Loading this course's plan…
              </div>
            )}
            <div className="px-5 py-2.5 border-t border-slate-100 text-right">
              <button type="button" onClick={() => setMode('form')} className="text-xs font-medium text-slate-500 hover:text-sky-700">Skip the conversation and use the quick form</button>
            </div>
          </div>
        )}

        {step === 'plan' && mode === 'form' && (
          <form onSubmit={e => { e.preventDefault(); generate({ ...form, brief: plan?.brief ?? undefined }); }} className="flex-1 overflow-y-auto p-5 space-y-4">
            <div>
              <label htmlFor="pw-topic" className="block text-xs font-semibold text-slate-600 mb-1.5">Topic</label>
              <input id="pw-topic" value={form.topic} onChange={e => setForm(f => ({ ...f, topic: e.target.value }))} className="input-field text-sm" required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="pw-aud" className="block text-xs font-semibold text-slate-600 mb-1.5">Who it is for</label>
                <select id="pw-aud" value={form.target_audience} onChange={e => setForm(f => ({ ...f, target_audience: e.target.value }))} className="input-field text-sm">
                  <option value="general">General learners</option>
                  <option value="beginners">Complete beginners</option>
                  <option value="intermediate">Intermediate students</option>
                  <option value="advanced">Advanced students</option>
                  <option value="professionals">Working professionals</option>
                </select>
              </div>
              <div>
                <label htmlFor="pw-diff" className="block text-xs font-semibold text-slate-600 mb-1.5">Level</label>
                <select id="pw-diff" value={form.difficulty} onChange={e => setForm(f => ({ ...f, difficulty: e.target.value }))} className="input-field text-sm">
                  <option value="beginner">Beginner</option>
                  <option value="intermediate">Intermediate</option>
                  <option value="advanced">Advanced</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="pw-weeks" className="block text-xs font-semibold text-slate-600 mb-2">Weeks <span className="text-sky-700 font-bold">{form.num_sections}</span></label>
                <input id="pw-weeks" type="range" min={1} max={12} value={form.num_sections} onChange={e => setForm(f => ({ ...f, num_sections: Number(e.target.value) }))} className="w-full accent-sky-500" />
              </div>
              <div>
                <label htmlFor="pw-lessons" className="block text-xs font-semibold text-slate-600 mb-2">Lessons per week <span className="text-sky-700 font-bold">{form.lessons_per_section}</span></label>
                <input id="pw-lessons" type="range" min={2} max={6} value={form.lessons_per_section} onChange={e => setForm(f => ({ ...f, lessons_per_section: Number(e.target.value) }))} className="w-full accent-sky-500" />
              </div>
            </div>
            {sections.length > 0 && (
              <label className="flex items-start gap-2.5 text-sm text-slate-700">
                <input type="checkbox" checked={form.use_existing_context} onChange={e => setForm(f => ({ ...f, use_existing_context: e.target.checked }))} className="mt-0.5 accent-sky-600" />
                <span>Continue from the {sections.length} existing week{sections.length === 1 ? '' : 's'} without repeating topics</span>
              </label>
            )}
            <p className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
              <Info className="w-3.5 h-3.5 shrink-0" /> {form.num_sections} weeks · {form.num_sections * form.lessons_per_section} lessons · a quiz each week. Notes and slides are written after you add them.
            </p>
            <div className="flex items-center gap-2">
              <button type="submit" className="btn-primary text-sm py-2 flex items-center gap-2"><Sparkles className="w-4 h-4" /> Plan the weeks</button>
              <button type="button" onClick={() => setMode('chat')} className="ml-auto text-xs font-medium text-sky-700 hover:underline">Plan it in a conversation instead</button>
            </div>
          </form>
        )}

        {step === 'loading' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 p-10 text-center">
            <div className="w-12 h-12 rounded-full border-4 border-sky-200 border-t-sky-600 animate-spin" />
            <p className="text-sm font-semibold text-slate-700">Planning the weeks…</p>
            {progress && (
              <>
                <p className="text-xs text-slate-500">Part {Math.min(progress.done + 1, progress.total)} of {progress.total}</p>
                <div className="w-48 bg-sky-100 rounded-full h-1.5"><div className="bg-sky-500 h-1.5 rounded-full transition-all" style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }} /></div>
              </>
            )}
          </div>
        )}

        {step === 'preview' && (
          <>
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
              {preview.map((sec, si) => (
                <div key={si}>
                  <button type="button" onClick={() => setExpanded(expanded === si ? null : si)} className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50 text-left">
                    <div className="w-7 h-7 rounded-lg bg-sky-100 flex items-center justify-center shrink-0"><Layers className="w-3.5 h-3.5 text-sky-600" /></div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">Week {sections.length + si + 1}: {sec.title}</p>
                      <p className="text-xs text-slate-500">{sec.lessons?.length || 0} lessons · {sec.quiz?.questions?.length || 0} quiz questions · {sec.activities?.length || 0} activities</p>
                    </div>
                    {expanded === si ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                  </button>
                  {expanded === si && (
                    <div className="px-5 pb-4 space-y-3 bg-slate-50">
                      <ul className="pt-3 space-y-1.5">
                        {sec.lessons?.map((l, li) => (
                          <li key={li} className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 border border-slate-100 text-sm text-slate-700">
                            <span className="flex-1 min-w-0 truncate">{l.title}</span>
                            <span className="text-xs text-slate-400 shrink-0">{l.estimated_duration_minutes} min</span>
                          </li>
                        ))}
                      </ul>
                      {sec.quiz?.questions?.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-slate-500 mb-1.5">Quiz: {sec.quiz.title}</p>
                          <ul className="space-y-1">
                            {sec.quiz.questions.map((q, qi) => (
                              <li key={qi} className="flex items-start gap-2 text-sm text-slate-700"><HelpCircle className="w-3.5 h-3.5 text-sky-500 mt-0.5 shrink-0" />{q.question}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="border-t border-slate-100 px-5 py-3.5 flex items-center gap-3 flex-wrap">
              {inserting && <p className="text-xs text-sky-700 flex-1 min-w-0 truncate">{insertStatus}</p>}
              {!inserting && (
                <button type="button" onClick={() => setStep('plan')} className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50">
                  {mode === 'chat' ? 'Back to the conversation' : 'Change the settings'}
                </button>
              )}
              <button type="button" onClick={insert} disabled={inserting || preview.length === 0} className="ml-auto btn-primary text-sm py-2 px-5 flex items-center gap-2 disabled:opacity-60">
                {inserting ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Adding…</> : <><Sparkles className="w-4 h-4" /> Add these weeks</>}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
