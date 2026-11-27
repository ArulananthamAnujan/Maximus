import { useCallback, useEffect, useState } from 'react';
import { X, Loader2, Sparkles, Check } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase';
import { formatDate } from '../../lib/workspace';
import type { WsAssignment } from '../../lib/workspace';
import { requestMarkSuggestion, loadMarkSuggestions, suggestionToScores, suggestedTotal } from '../../lib/aiMarking';
import type { MarkSuggestion } from '../../lib/aiMarking';
import GradeSubmissionModal from './GradeSubmissionModal';
import type { GradableSubmission } from './GradeSubmissionModal';
import ConfirmDialog from '../ui/ConfirmDialog';

interface Props {
  assignment: WsAssignment;
  onClose: () => void;
  onChanged: () => void;
}

// Out of tokens or not on the plan: the rest would fail the same way.
const STOP_ALL = /not enough tokens|insufficient tokens|not available on your current plan|inactive/i;

/** Everything students handed in for one assignment, with marking and AI-suggested marks. */
export default function SubmissionsModal({ assignment, onClose, onChanged }: Props) {
  const [subs, setSubs] = useState<GradableSubmission[] | null>(null);
  const [suggestions, setSuggestions] = useState<Map<string, MarkSuggestion>>(new Map());
  const [grading, setGrading] = useState<GradableSubmission | null>(null);
  const [batch, setBatch] = useState<{ done: number; total: number } | null>(null);
  const [confirmAccept, setConfirmAccept] = useState(false);
  const [accepting, setAccepting] = useState(false);

  const load = useCallback(async () => {
    const [{ data }, s] = await Promise.all([
      supabase.from('assignment_submissions')
        .select('id, content, file_url, grade, feedback, rubric_scores, submitted_at, student:profiles(full_name, email)')
        .eq('assignment_id', assignment.id)
        .order('submitted_at', { ascending: true }),
      loadMarkSuggestions(assignment.id).catch(() => new Map<string, MarkSuggestion>()),
    ]);
    setSubs((data ?? []) as unknown as GradableSubmission[]);
    setSuggestions(s);
  }, [assignment.id]);

  useEffect(() => { load(); }, [load]);

  const total = assignment.total_points ?? 100;
  const unmarked = (subs ?? []).filter(s => s.grade == null);
  const needSuggestion = unmarked.filter(s => !suggestions.has(s.id) && s.content?.trim());
  const readyToAccept = unmarked.filter(s => suggestions.has(s.id));

  const suggestAll = async () => {
    const list = needSuggestion;
    setBatch({ done: 0, total: list.length });
    let done = 0;
    let failed = 0;
    let stop = '';
    let next = 0;
    const lane = async () => {
      while (next < list.length && !stop) {
        const sub = list[next++];
        try {
          const s = await requestMarkSuggestion(assignment, sub);
          setSuggestions(prev => new Map(prev).set(sub.id, s));
        } catch (e) {
          failed += 1;
          const text = e instanceof Error ? e.message : '';
          if (STOP_ALL.test(text)) stop = text;
        }
        done += 1;
        setBatch({ done, total: list.length });
      }
    };
    await Promise.all([lane(), lane()]);
    setBatch(null);
    if (stop) toast.error(stop);
    else if (failed) toast.error(`${failed} could not be marked by the AI. You can mark them yourself or try again.`);
    else toast.success('Suggested marks are ready to check.');
  };

  const acceptAll = async () => {
    setConfirmAccept(false);
    setAccepting(true);
    let saved = 0;
    for (const sub of readyToAccept) {
      const s = suggestions.get(sub.id)!;
      const { error } = await supabase.from('assignment_submissions').update({
        grade: Math.round(suggestedTotal(assignment, s)),
        rubric_scores: assignment.rubric.length ? suggestionToScores(assignment.rubric, s) : {},
        feedback: s.feedback,
        status: 'graded',
        graded_at: new Date().toISOString(),
      }).eq('id', sub.id);
      if (!error) saved += 1;
    }
    setAccepting(false);
    toast.success(`${saved} mark${saved === 1 ? '' : 's'} saved. Students can now see them.`);
    await load();
    onChanged();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={batch || accepting ? undefined : onClose} />
      <div role="dialog" aria-modal="true" aria-labelledby="subs-title" className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[88vh] flex flex-col">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100">
          <div className="flex-1 min-w-0">
            <h3 id="subs-title" className="font-bold text-slate-900 truncate">{assignment.title}</h3>
            <p className="text-xs text-slate-500">{subs === null ? 'Loading…' : `${subs.length} handed in · ${unmarked.length} to mark`}</p>
          </div>
          <button onClick={onClose} disabled={!!batch || accepting} aria-label="Close" className="p-2 rounded-lg text-slate-400 hover:bg-slate-100"><X className="w-4 h-4" /></button>
        </div>

        {subs && unmarked.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap px-6 py-3 border-b border-slate-100 bg-slate-50">
            {batch ? (
              <p className="flex items-center gap-2 text-sm text-slate-700"><Loader2 className="w-4 h-4 animate-spin text-sky-600" /> Marking {batch.done} of {batch.total}…</p>
            ) : (
              <>
                <button onClick={suggestAll} disabled={needSuggestion.length === 0 || accepting}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-sky-300 text-sky-700 bg-white hover:bg-sky-50 disabled:opacity-50">
                  <Sparkles className="w-3.5 h-3.5" /> {needSuggestion.length ? `Suggest marks for ${needSuggestion.length}` : 'All have suggestions'}
                </button>
                {readyToAccept.length > 0 && (
                  <button onClick={() => setConfirmAccept(true)} disabled={accepting}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-sky-600 hover:bg-sky-700 text-white disabled:opacity-50">
                    {accepting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Accept {readyToAccept.length} suggested mark{readyToAccept.length === 1 ? '' : 's'}
                  </button>
                )}
                <span className="text-xs text-slate-500">Suggestions are only visible to staff until you accept them.</span>
              </>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {subs === null ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
          ) : subs.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-slate-500">Nothing handed in yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {subs.map(s => {
                const sug = suggestions.get(s.id);
                return (
                  <li key={s.id} className="flex items-center gap-3 px-6 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{s.student?.full_name || s.student?.email || 'Student'}</p>
                      <p className="text-xs text-slate-500">
                        {s.submitted_at ? `Handed in ${formatDate(s.submitted_at)}` : 'Draft'}
                        {s.grade == null && sug && <span className={`ml-1.5 font-semibold ${sug.confidence === 'low' ? 'text-amber-700' : 'text-sky-700'}`}>· AI suggests {suggestedTotal(assignment, sug)}/{total}{sug.confidence === 'low' ? ' (low confidence)' : ''}</span>}
                      </p>
                    </div>
                    {s.grade != null ? (
                      <button onClick={() => setGrading(s)} className="text-sm font-semibold text-emerald-700 hover:underline">{s.grade}/{total}</button>
                    ) : (
                      <button onClick={() => setGrading(s)} className="px-3 py-1.5 text-xs font-semibold bg-sky-600 hover:bg-sky-700 text-white rounded-lg">{sug ? 'Check' : 'Mark'}</button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
      {grading && (
        <GradeSubmissionModal
          assignment={assignment}
          submission={grading}
          suggestion={suggestions.get(grading.id) ?? null}
          onClose={() => setGrading(null)}
          onSaved={() => { setGrading(null); load(); onChanged(); }}
        />
      )}
      <ConfirmDialog
        isOpen={confirmAccept}
        title="Accept the suggested marks?"
        message={`${readyToAccept.length} student${readyToAccept.length === 1 ? '' : 's'} will see the AI's suggested mark and feedback as their result. Check any with low confidence first.`}
        confirmText="Accept and release"
        onConfirm={acceptAll}
        onCancel={() => setConfirmAccept(false)}
      />
    </div>
  );
}
