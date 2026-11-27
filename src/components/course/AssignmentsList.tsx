import { useEffect, useState } from 'react';
import { Trophy, ClipboardList, FlaskConical, Plus, EyeOff } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatDate } from '../../lib/workspace';
import type { AssignmentKind, WsAssignment, Workspace } from '../../lib/workspace';

interface Props {
  ws: Workspace;
  onOpen: (opts: { kind: AssignmentKind; sectionId?: string | null; assignment?: WsAssignment }) => void;
  /** Open the hand-ins for marking. */
  onMark: (assignment: WsAssignment) => void;
}

const GROUPS: Array<{ kind: AssignmentKind; title: string; blurb: string; icon: typeof Trophy }> = [
  { kind: 'capstone', title: 'Capstone project', blurb: 'The final project students can show employers.', icon: Trophy },
  { kind: 'assignment', title: 'Assignments', blurb: 'Marked tasks that apply a week\'s lessons.', icon: ClipboardList },
  { kind: 'lab', title: 'Labs', blurb: 'Hands-on practicals with a worked solution.', icon: FlaskConical },
];

export default function AssignmentsList({ ws, onOpen, onMark }: Props) {
  const [counts, setCounts] = useState<Record<string, { total: number; toMark: number }>>({});

  useEffect(() => {
    const ids = ws.assignments.map(a => a.id);
    if (ids.length === 0) { setCounts({}); return; }
    supabase.from('assignment_submissions').select('assignment_id, grade').in('assignment_id', ids).then(({ data }) => {
      const next: Record<string, { total: number; toMark: number }> = {};
      for (const row of data ?? []) {
        const c = next[row.assignment_id] ?? { total: 0, toMark: 0 };
        c.total += 1;
        if (row.grade == null) c.toMark += 1;
        next[row.assignment_id] = c;
      }
      setCounts(next);
    });
  }, [ws.assignments]);

  const weekTitle = (id: string | null) => ws.sections.find(s => s.id === id)?.title;

  return (
    <div className="space-y-4">
      {GROUPS.map(g => {
        const items = ws.assignments.filter(a => a.kind === g.kind);
        return (
          <section key={g.kind} aria-labelledby={`group-${g.kind}`} className="bg-white border border-slate-200 rounded-xl">
            <div className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-100">
              <g.icon className="w-5 h-5 text-slate-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <h3 id={`group-${g.kind}`} className="font-semibold text-slate-900">{g.title}</h3>
                <p className="text-xs text-slate-500">{g.blurb}</p>
              </div>
              <button onClick={() => onOpen({ kind: g.kind, sectionId: null })} className="flex items-center gap-1 text-xs font-semibold text-sky-700 border border-sky-200 rounded-lg px-2.5 py-1.5 hover:bg-sky-50">
                <Plus className="w-3.5 h-3.5" /> New
              </button>
            </div>
            {items.length === 0 ? (
              <p className="px-5 py-4 text-sm text-slate-500">None yet. {g.kind !== 'capstone' && 'You can also add these from each week on the Weeks page.'}</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {items.map(a => {
                  const c = counts[a.id];
                  return (
                    <li key={a.id} className="flex items-center gap-3 px-5 py-3">
                      <button onClick={() => onOpen({ kind: a.kind, assignment: a })} className="flex-1 min-w-0 text-left">
                        <span className="block text-sm font-medium text-slate-800 truncate">{a.title}</span>
                        <span className="block text-xs text-slate-500">
                          {[weekTitle(a.section_id), a.due_date ? `due ${formatDate(a.due_date)}` : 'no due date', `${a.total_points ?? 100} points`, a.rubric.length ? `${a.rubric.length}-criterion rubric` : 'no rubric'].filter(Boolean).join(' · ')}
                        </span>
                      </button>
                      {!a.is_published && <span className="flex items-center gap-1 text-xs text-amber-700"><EyeOff className="w-3.5 h-3.5" /> Hidden</span>}
                      {c && c.total > 0 && (
                        <button onClick={() => onMark(a)} className={`text-xs font-semibold rounded-md px-2 py-1 hover:underline ${c.toMark ? 'bg-amber-50 text-amber-800' : 'bg-slate-50 text-slate-600'}`}>
                          {c.toMark ? `${c.toMark} to mark` : `${c.total} marked`}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
