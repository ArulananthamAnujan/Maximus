import { useEffect, useMemo, useState } from 'react';
import { X, Loader2, ChevronDown, ChevronUp, ExternalLink, Sparkles, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase';
import { sanitizeHtml, safeUrl } from '../../lib/utils';
import { requestMarkSuggestion, loadMarkSuggestion, suggestionToScores, suggestedTotal } from '../../lib/aiMarking';
import type { MarkableAssignment, MarkSuggestion } from '../../lib/aiMarking';
import NumberInput from '../ui/NumberInput';

export interface GradableSubmission {
  id: string;
  content: string | null;
  file_url: string | null;
  grade: number | null;
  feedback: string | null;
  rubric_scores?: Record<string, number> | null;
  submitted_at?: string | null;
  student?: { full_name?: string | null; email?: string | null } | null;
}

interface Props {
  assignment: MarkableAssignment;
  /** An AI suggestion already made for this submission. */
  suggestion?: MarkSuggestion | null;
  submission: GradableSubmission;
  onClose: () => void;
  onSaved: () => void;
}

export default function GradeSubmissionModal({ assignment, submission, suggestion: givenSuggestion, onClose, onSaved }: Props) {
  const rubric = useMemo(() => assignment.rubric ?? [], [assignment.rubric]);
  const total = assignment.total_points ?? 100;
  const [scores, setScores] = useState<Record<string, number>>(submission.rubric_scores ?? {});
  const [manualGrade, setManualGrade] = useState<number>(submission.grade ?? 0);
  const [feedback, setFeedback] = useState(submission.feedback ?? '');
  const [saving, setSaving] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);
  const [answer, setAnswer] = useState<{ solution_html: string; marking_notes: string } | null>(null);
  const [suggestion, setSuggestion] = useState<MarkSuggestion | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const ungraded = submission.grade == null;

  const applySuggestion = (s: MarkSuggestion, replaceFeedback: boolean) => {
    setSuggestion(s);
    if (rubric.length) setScores(suggestionToScores(rubric, s));
    else setManualGrade(suggestedTotal(assignment, s));
    if (replaceFeedback) setFeedback(s.feedback);
  };

  // An earlier suggestion is shown, and filled in when the work is not marked yet
  useEffect(() => {
    let active = true;
    const use = (s: MarkSuggestion | null) => { if (active && s) { if (ungraded) applySuggestion(s, !submission.feedback); else setSuggestion(s); } };
    if (givenSuggestion !== undefined) use(givenSuggestion);
    else loadMarkSuggestion(submission.id).then(use).catch(() => {});
    return () => { active = false; };
    // Once, when the dialog opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submission.id]);

  const suggest = async () => {
    setSuggesting(true);
    try {
      const s = await requestMarkSuggestion(assignment, submission);
      const replace = !feedback.trim() || window.confirm('Replace your feedback with the AI\'s suggested feedback?');
      applySuggestion(s, replace);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'The AI could not suggest a mark.');
    } finally {
      setSuggesting(false);
    }
  };
  const reasonFor = (name: string) => suggestion?.criteria.find(c => c.name.trim().toLowerCase() === name.trim().toLowerCase())?.reason;

  useEffect(() => {
    if (!showAnswer || answer) return;
    supabase.from('assignment_private').select('solution_html, marking_notes').eq('assignment_id', assignment.id).maybeSingle()
      .then(({ data }) => setAnswer(data ?? { solution_html: '', marking_notes: '' }));
  }, [showAnswer, answer, assignment.id]);

  const rubricTotal = useMemo(() => rubric.reduce((n, c) => n + (scores[c.name] ?? 0), 0), [rubric, scores]);
  const scored = rubric.filter(c => scores[c.name] !== undefined).length;
  const grade = rubric.length ? rubricTotal : manualGrade;
  const fileUrl = safeUrl(submission.file_url);

  const save = async () => {
    if (rubric.length && scored < rubric.length) {
      if (!window.confirm(`${rubric.length - scored} criteria have no score yet and will count as 0. Save anyway?`)) return;
    }
    setSaving(true);
    const { error } = await supabase.from('assignment_submissions').update({
      grade: Math.round(grade),
      rubric_scores: scores,
      feedback,
      status: 'graded',
      graded_at: new Date().toISOString(),
    }).eq('id', submission.id);
    setSaving(false);
    if (error) { toast.error('Could not save the mark.'); return; }
    toast.success('Marked');
    onSaved();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={saving ? undefined : onClose} />
      <div role="dialog" aria-modal="true" aria-labelledby="grade-title" className="relative bg-white dark:bg-navy-800 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[94vh] flex flex-col">
        <div className="flex items-center gap-3 px-5 sm:px-6 py-4 border-b border-slate-100">
          <div className="flex-1 min-w-0">
            <h3 id="grade-title" className="font-bold text-slate-900 dark:text-white">Mark submission</h3>
            <p className="text-xs text-slate-500 truncate">{submission.student?.full_name || submission.student?.email || 'Student'} · {assignment.title}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-2 rounded-lg text-slate-400 hover:bg-slate-100"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5 space-y-5">
          <div>
            <p className="text-xs font-semibold text-slate-600 mb-1.5">Student's work</p>
            {submission.content ? (
              <div className="bg-slate-50 dark:bg-navy-700 rounded-xl p-4 text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap max-h-60 overflow-y-auto">{submission.content}</div>
            ) : <p className="text-sm text-slate-500">No written answer.</p>}
            {fileUrl && <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-sm text-sky-700 hover:underline"><ExternalLink className="w-3.5 h-3.5" /> Open attached file</a>}
          </div>

          <div>
            <button onClick={() => setShowAnswer(s => !s)} aria-expanded={showAnswer} className="flex items-center gap-1 text-xs font-semibold text-sky-700">
              {showAnswer ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />} Model answer and marking notes
            </button>
            {showAnswer && (
              answer === null ? <p className="text-xs text-slate-500 mt-2 flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> Loading…</p> : (
                <div className="mt-2 border border-slate-200 rounded-xl p-4 space-y-3 max-h-72 overflow-y-auto">
                  {answer.solution_html ? <div className="prose prose-sm max-w-none [&_pre]:bg-slate-900 [&_pre]:text-slate-100 [&_pre]:p-2 [&_pre]:rounded" dangerouslySetInnerHTML={{ __html: sanitizeHtml(answer.solution_html) }} /> : <p className="text-sm text-slate-500">No model answer saved.</p>}
                  {answer.marking_notes && <p className="text-sm text-slate-700 whitespace-pre-wrap border-t border-slate-100 pt-3"><strong>Marking notes:</strong> {answer.marking_notes}</p>}
                </div>
              )
            )}
          </div>

          <div className="flex items-start gap-3 flex-wrap">
            <button onClick={suggest} disabled={suggesting || !submission.content?.trim()} title={submission.content?.trim() ? undefined : 'There is no written answer to mark'}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-sky-300 text-sky-700 bg-white hover:bg-sky-50 disabled:opacity-50">
              {suggesting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} {suggestion ? 'Suggest again' : 'Suggest marks with AI'}
            </button>
            {suggestion && (
              <div role="status" className="flex-1 min-w-[220px] text-xs bg-sky-50 border border-sky-200 text-sky-900 rounded-lg px-3 py-2 space-y-1">
                <p><strong>AI suggestion: {suggestedTotal(assignment, suggestion)} / {total}</strong> · {suggestion.confidence} confidence. Check each score and the feedback before saving; nothing is shown to the student until you save.</p>
                {suggestion.flags.length > 0 && (
                  <p className="flex items-start gap-1 text-amber-800"><AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0" />{suggestion.flags.join(' · ')}</p>
                )}
              </div>
            )}
          </div>

          {rubric.length > 0 ? (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-slate-600">Rubric: choose a level for each criterion</p>
              {rubric.map(c => (
                <fieldset key={c.name} className="border border-slate-200 rounded-xl p-3">
                  <legend className="px-1 text-sm font-semibold text-slate-800">{c.name} <span className="font-normal text-slate-500">({scores[c.name] ?? '–'} / {c.points})</span></legend>
                  {reasonFor(c.name) && <p className="text-xs text-sky-800 bg-sky-50 rounded-md px-2 py-1.5 mb-2"><Sparkles className="inline w-3 h-3 mr-1" />{reasonFor(c.name)}</p>}
                  <div className="grid sm:grid-cols-2 gap-2">
                    {c.levels.map(lv => {
                      const active = scores[c.name] === lv.points;
                      return (
                        <label key={lv.label} className={`flex gap-2 rounded-lg border p-2.5 cursor-pointer text-xs ${active ? 'border-sky-500 bg-sky-50' : 'border-slate-200 hover:border-slate-300'}`}>
                          <input type="radio" name={`crit-${c.name}`} checked={active} onChange={() => setScores(s => ({ ...s, [c.name]: lv.points }))} className="mt-0.5 accent-sky-600" />
                          <span><strong className="text-slate-800">{lv.label} · {lv.points}</strong><span className="block text-slate-600 mt-0.5">{lv.descriptor}</span></span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              ))}
            </div>
          ) : (
            <div>
              <label htmlFor="manual-grade" className="block text-xs font-semibold text-slate-600 mb-1.5">Mark (out of {total})</label>
              <NumberInput id="manual-grade" min={0} max={total} value={manualGrade} onChange={setManualGrade} className="input-field text-sm w-28" />
            </div>
          )}

          <div>
            <label htmlFor="grade-feedback" className="block text-xs font-semibold text-slate-600 mb-1.5">Feedback for the student</label>
            <textarea id="grade-feedback" value={feedback} onChange={e => setFeedback(e.target.value)} rows={4} className="input-field text-sm resize-y" placeholder="What they did well, and the one or two things that would most improve the work." />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 px-5 sm:px-6 py-4 border-t border-slate-100">
          <p className="text-sm font-semibold text-slate-800">Mark: {Math.round(grade)} / {total}</p>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-700">Cancel</button>
            <button onClick={save} disabled={saving} className="flex items-center gap-2 px-5 py-2 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-sm font-bold rounded-lg">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />} Save mark
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
