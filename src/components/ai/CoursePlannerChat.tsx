import { useEffect, useRef, useState } from 'react';
import { Send, Sparkles, Loader2, Target, Users, Clock, Hammer, Globe } from 'lucide-react';
import { plannerChat } from '../../lib/ai';
import type { CourseBrief, PlannerMessage, PlannerCourseContext, WebSource } from '../../lib/ai';
import { safeUrl } from '../../lib/utils';

interface Props {
  messages: PlannerMessage[];
  onMessagesChange: (messages: PlannerMessage[]) => void;
  brief: CourseBrief | null;
  onBriefChange: (brief: CourseBrief | null) => void;
  /** Build the curriculum from the agreed brief. */
  onCreate: (brief: CourseBrief) => void;
  /** When planning more weeks for an existing course: its outline and saved plan. */
  context?: PlannerCourseContext | null;
  /** Research from an earlier planning conversation, so it is not repeated. */
  initialResearch?: { notes: string; sources: WebSource[] };
  onResearchChange?: (research: { notes: string; sources: WebSource[] }) => void;
  /** Label for the create button on the plan card. */
  createLabel?: string;
  /** Tap-to-send answers shown before the first reply. */
  openingSuggestions?: string[];
}

export const PLANNER_GREETING: PlannerMessage = {
  role: 'planner',
  content: "Let's plan your course together. Tell me in your own words: what do you want to teach, who is it for, and what should they be able to do when they finish?",
};

const OPENING_SUGGESTIONS = [
  'A short course that gets students job-ready in one skill',
  'Exam preparation for a specific test',
  'Upskilling for people already working',
];

export default function CoursePlannerChat({
  messages, onMessagesChange, brief, onBriefChange, onCreate,
  context, initialResearch, onResearchChange, createLabel, openingSuggestions,
}: Props) {
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>(
    messages[messages.length - 1]?.role === 'planner' && !brief ? (openingSuggestions ?? (messages.length <= 1 ? OPENING_SUGGESTIONS : [])) : [],
  );
  // What the planner has learned from the web so far; sent back each turn so it is not repeated
  const [research, setResearch] = useState<{ notes: string; sources: WebSource[] }>(initialResearch ?? { notes: '', sources: [] });
  const onResearchChangeRef = useRef(onResearchChange);
  onResearchChangeRef.current = onResearchChange;
  const [elapsed, setElapsed] = useState(0);
  const endRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, sending, brief]);

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || sending) return;
    const next: PlannerMessage[] = [...messages, { role: 'teacher', content }];
    onMessagesChange(next);
    setDraft('');
    setSuggestions([]);
    setError('');
    setSending(true);
    try {
      const result = await plannerChat(next, research, context);
      const nextResearch = {
        notes: result.research_notes?.trim() ? result.research_notes : research.notes,
        sources: result.sources ?? research.sources,
      };
      setResearch(nextResearch);
      onResearchChangeRef.current?.(nextResearch);
      onMessagesChange([...next, { role: 'planner', content: result.reply }]);
      setSuggestions(result.ready ? [] : (result.suggestions ?? []).filter(Boolean).slice(0, 4));
      if (result.ready && result.brief) onBriefChange(result.brief);
    } catch (err) {
      // Keep the teacher's message on screen so nothing they typed is lost; they can resend.
      setError(err instanceof Error ? err.message : 'The planner could not reply. Please try again.');
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  // A reply that involves a web search takes noticeably longer; say so instead of a bare spinner
  useEffect(() => {
    if (!sending) { setElapsed(0); return; }
    const started = Date.now();
    const id = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(id);
  }, [sending]);

  const lastIsTeacher = messages[messages.length - 1]?.role === 'teacher';

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4" aria-live="polite">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'teacher' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
              m.role === 'teacher' ? 'bg-sky-600 text-white rounded-br-md' : 'bg-slate-100 text-slate-800 rounded-bl-md'
            }`}>
              {m.content}
            </div>
          </div>
        ))}

        {sending && (
          <div className="flex justify-start">
            <div className="bg-slate-100 text-slate-500 rounded-2xl rounded-bl-md px-4 py-2.5 text-sm flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              {elapsed < 8 ? 'Thinking…' : 'Checking current job ads and skills online. This can take up to a minute…'}
            </div>
          </div>
        )}

        {error && (
          <div role="alert" className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 flex items-center justify-between gap-3">
            <span>{error}</span>
            {lastIsTeacher && (
              <button
                onClick={() => { const last = messages[messages.length - 1]; onMessagesChange(messages.slice(0, -1)); send(last.content); }}
                className="text-xs font-semibold shrink-0 hover:underline"
              >
                Try again
              </button>
            )}
          </div>
        )}

        {brief && !sending && (
          <div className="border border-sky-200 bg-sky-50/60 rounded-2xl p-4 space-y-3">
            <p className="text-xs font-bold uppercase tracking-wide text-sky-700">Course plan</p>
            <p className="font-semibold text-slate-900">{brief.title_idea || brief.topic}</p>
            <dl className="grid sm:grid-cols-2 gap-x-5 gap-y-2.5 text-sm">
              <BriefRow icon={Users} label="For" value={[brief.audience, brief.starting_level].filter(Boolean).join(' · ')} />
              <BriefRow icon={Target} label="Result" value={brief.outcome} />
              <BriefRow icon={Clock} label={context ? 'Adding' : 'Time'} value={context
                ? `${brief.num_modules} new week${brief.num_modules === 1 ? '' : 's'} × ${brief.lessons_per_module} lessons`
                : `${brief.duration_weeks} weeks, about ${brief.hours_per_week} hours a week · ${brief.num_modules} modules × ${brief.lessons_per_module} lessons`} />
              <BriefRow icon={Hammer} label="Approach" value={brief.approach} />
            </dl>
            {brief.projects?.length > 0 && (
              <p className="text-sm text-slate-700"><span className="font-semibold">Projects:</span> {brief.projects.join('; ')}</p>
            )}
            {brief.target_roles?.length > 0 && (
              <p className="text-sm text-slate-700"><span className="font-semibold">Prepares for:</span> {brief.target_roles.join(', ')}</p>
            )}
            {(brief.market_findings?.length ?? 0) > 0 && (
              <div className="bg-white/70 border border-sky-100 rounded-xl p-3">
                <p className="text-xs font-bold text-slate-600 flex items-center gap-1.5 mb-1.5"><Globe className="w-3.5 h-3.5 text-sky-600" /> What employers are asking for</p>
                <ul className="text-sm text-slate-700 space-y-1 list-disc pl-5">
                  {brief.market_findings!.slice(0, 8).map((f, i) => <li key={i}>{f}</li>)}
                </ul>
                {research.sources.length > 0 && (
                  <p className="text-xs text-slate-500 mt-2">
                    Sources:{' '}
                    {research.sources.slice(0, 6).map((src, i) => (
                      <span key={src.url}>
                        {i > 0 && ' · '}
                        <a href={safeUrl(src.url) || undefined} target="_blank" rel="noopener noreferrer" className="text-sky-700 hover:underline">{src.title.length > 48 ? `${src.title.slice(0, 48)}…` : src.title}</a>
                      </span>
                    ))}
                  </p>
                )}
                <p className="text-[11px] text-slate-400 mt-1.5">Found by an online search at the time of planning. Check the sources before relying on them.</p>
              </div>
            )}
            {(brief.market_findings?.length ?? 0) === 0 && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">This plan is based on the AI's general knowledge; no current job-market sources were found. Consider checking a few real job ads.</p>
            )}
            <div className="flex items-center gap-3 pt-1">
              <button onClick={() => onCreate(brief)} className="btn-primary text-sm py-2.5 px-5 flex items-center gap-2">
                <Sparkles className="w-4 h-4" /> {createLabel ?? 'Create this curriculum'}
              </button>
              <span className="text-xs text-slate-500">or keep chatting to change the plan</span>
            </div>
          </div>
        )}

        <div ref={endRef} />
      </div>

      <div className="border-t border-slate-100 px-6 py-3 shrink-0 space-y-2">
        {suggestions.length > 0 && !sending && (
          <div className="flex flex-wrap gap-2">
            {suggestions.map(s => (
              <button
                key={s}
                type="button"
                onClick={() => send(s)}
                className="text-xs font-medium px-3 py-1.5 rounded-full border border-sky-200 text-sky-700 bg-white hover:bg-sky-50 transition-colors text-left"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        <form
          onSubmit={e => { e.preventDefault(); send(draft); }}
          className="flex items-end gap-2"
        >
          <label htmlFor="planner-message" className="sr-only">Your message to the course planner</label>
          <textarea
            id="planner-message"
            ref={inputRef}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(draft); }
            }}
            rows={2}
            maxLength={3000}
            placeholder={brief ? 'Ask for a change, e.g. "make it 4 weeks" or "add interview practice"' : 'Type your answer…'}
            className="input-field text-sm flex-1 resize-none"
            disabled={sending}
          />
          <button
            type="submit"
            disabled={sending || !draft.trim()}
            aria-label="Send"
            className="h-11 w-11 shrink-0 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-40 text-white flex items-center justify-center transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}

function BriefRow({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="flex gap-2">
      <Icon className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
      <div className="min-w-0">
        <dt className="text-xs font-semibold text-slate-500">{label}</dt>
        <dd className="text-slate-800">{value}</dd>
      </div>
    </div>
  );
}
