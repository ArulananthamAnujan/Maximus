import { useCallback, useEffect, useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatDate } from '../../lib/workspace';
import type { WsAssignment } from '../../lib/workspace';
import GradeSubmissionModal from './GradeSubmissionModal';
import type { GradableSubmission } from './GradeSubmissionModal';

interface Props {
  assignment: WsAssignment;
  onClose: () => void;
  onChanged: () => void;
}

/** Everything students handed in for one assignment, with marking. */
export default function SubmissionsModal({ assignment, onClose, onChanged }: Props) {
  const [subs, setSubs] = useState<GradableSubmission[] | null>(null);
  const [grading, setGrading] = useState<GradableSubmission | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from('assignment_submissions')
      .select('id, content, file_url, grade, feedback, rubric_scores, submitted_at, student:profiles(full_name, email)')
      .eq('assignment_id', assignment.id)
      .order('submitted_at', { ascending: true });
    setSubs((data ?? []) as unknown as GradableSubmission[]);
  }, [assignment.id]);

  useEffect(() => { load(); }, [load]);

  const total = assignment.total_points ?? 100;
  const toMark = (subs ?? []).filter(s => s.grade == null).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-labelledby="subs-title" className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[88vh] flex flex-col">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100">
          <div className="flex-1 min-w-0">
            <h3 id="subs-title" className="font-bold text-slate-900 truncate">{assignment.title}</h3>
            <p className="text-xs text-slate-500">{subs === null ? 'Loading…' : `${subs.length} handed in · ${toMark} to mark`}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-2 rounded-lg text-slate-400 hover:bg-slate-100"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {subs === null ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
          ) : subs.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-slate-500">Nothing handed in yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {subs.map(s => (
                <li key={s.id} className="flex items-center gap-3 px-6 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{s.student?.full_name || s.student?.email || 'Student'}</p>
                    <p className="text-xs text-slate-500">{s.submitted_at ? `Handed in ${formatDate(s.submitted_at)}` : 'Draft'}</p>
                  </div>
                  {s.grade != null ? (
                    <button onClick={() => setGrading(s)} className="text-sm font-semibold text-emerald-700 hover:underline">{s.grade}/{total}</button>
                  ) : (
                    <button onClick={() => setGrading(s)} className="px-3 py-1.5 text-xs font-semibold bg-sky-600 hover:bg-sky-700 text-white rounded-lg">Mark</button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {grading && (
        <GradeSubmissionModal
          assignment={{ id: assignment.id, title: assignment.title, total_points: assignment.total_points, rubric: assignment.rubric }}
          submission={grading}
          onClose={() => setGrading(null)}
          onSaved={() => { setGrading(null); load(); onChanged(); }}
        />
      )}
    </div>
  );
}
