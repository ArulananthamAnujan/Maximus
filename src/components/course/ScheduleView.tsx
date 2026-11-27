import { useState } from 'react';
import { CalendarClock, Loader2, Save, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase';
import type { Workspace } from '../../lib/workspace';

interface Props {
  ws: Workspace;
  onSaved: () => Promise<void>;
}

const DAY = 24 * 60 * 60 * 1000;

function dateInput(value: string | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function dateTimeInput(value: string | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${dateInput(value)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Local midnight of a yyyy-mm-dd date, as an ISO timestamp. */
const startOfDay = (yyyyMmDd: string) => new Date(`${yyyyMmDd}T00:00:00`).toISOString();

export default function ScheduleView({ ws, onSaved }: Props) {
  const [start, setStart] = useState(ws.course.start_date ?? '');
  const [releases, setReleases] = useState<Record<string, string>>(
    Object.fromEntries(ws.sections.map(s => [s.id, dateInput(s.release_at)])),
  );
  const [dues, setDues] = useState<Record<string, string>>(
    Object.fromEntries(ws.assignments.map(a => [a.id, dateTimeInput(a.due_date)])),
  );
  const [saving, setSaving] = useState(false);

  /** One week at a time from the start date; assignments due at the end of their week. */
  const fillWeekly = () => {
    if (!start) { toast.error('Choose a start date first.'); return; }
    const base = new Date(`${start}T00:00:00`).getTime();
    const nextReleases: Record<string, string> = {};
    ws.sections.forEach((s, i) => { nextReleases[s.id] = dateInput(new Date(base + i * 7 * DAY).toISOString()); });
    setReleases(nextReleases);
    const nextDues: Record<string, string> = { ...dues };
    for (const a of ws.assignments) {
      const weekIndex = a.section_id ? ws.sections.findIndex(s => s.id === a.section_id) : -1;
      const endWeek = a.kind === 'capstone' || weekIndex < 0 ? ws.sections.length - 1 : weekIndex;
      // Sunday evening of that week (day 6, 23:59 local)
      nextDues[a.id] = dateTimeInput(new Date(base + endWeek * 7 * DAY + 6 * DAY + (23 * 60 + 59) * 60 * 1000).toISOString());
    }
    setDues(nextDues);
  };

  const openAll = () => setReleases(Object.fromEntries(ws.sections.map(s => [s.id, ''])));

  const save = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.from('courses').update({ start_date: start || null }).eq('id', ws.course.id);
      if (error) throw new Error('Could not save the start date.');
      for (const s of ws.sections) {
        const value = releases[s.id] ? startOfDay(releases[s.id]) : null;
        if ((value ?? null) !== (s.release_at ? new Date(s.release_at).toISOString() : null)) {
          const { error: e2 } = await supabase.from('sections').update({ release_at: value }).eq('id', s.id);
          if (e2) throw new Error(`Could not save the date for ${s.title}.`);
        }
      }
      for (const a of ws.assignments) {
        const value = dues[a.id] ? new Date(dues[a.id]).toISOString() : null;
        if (value !== (a.due_date ? new Date(a.due_date).toISOString() : null)) {
          const { error: e3 } = await supabase.from('assignments').update({ due_date: value }).eq('id', a.id);
          if (e3) throw new Error(`Could not save the due date for ${a.title}.`);
        }
      }
      toast.success('Schedule saved');
      await onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save the schedule.');
    } finally {
      setSaving(false);
    }
  };

  const today = dateInput(new Date().toISOString());

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex items-start gap-3">
          <CalendarClock className="w-5 h-5 text-sky-600 mt-0.5 shrink-0" />
          <div>
            <h2 className="font-semibold text-slate-900">When the course runs</h2>
            <p className="text-sm text-slate-500">Students can't open a week's lessons, materials or assignments before its date. Leave a date empty to open that week straight away.</p>
          </div>
        </div>
        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <label htmlFor="course-start" className="block text-xs font-semibold text-slate-600 mb-1.5">Start date</label>
            <input id="course-start" type="date" value={start} onChange={e => setStart(e.target.value)} className="input-field text-sm" />
          </div>
          <button onClick={fillWeekly} className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold border border-slate-300 rounded-lg hover:bg-slate-50">
            <Wand2 className="w-4 h-4" /> One week at a time
          </button>
          <button onClick={openAll} className="px-3 py-2 text-sm font-semibold border border-slate-300 rounded-lg hover:bg-slate-50">Open everything now</button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl">
        <h3 className="px-5 pt-4 pb-2 font-semibold text-slate-900 text-sm">Weeks</h3>
        <ul className="divide-y divide-slate-100">
          {ws.sections.map((s, i) => (
            <li key={s.id} className="flex items-center gap-3 px-5 py-2.5 flex-wrap">
              <span className="w-6 h-6 rounded-full bg-sky-100 text-sky-700 text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
              <span className="flex-1 min-w-[160px] text-sm text-slate-800">{s.title}</span>
              <label htmlFor={`release-${s.id}`} className="text-xs text-slate-500">Opens</label>
              <input id={`release-${s.id}`} type="date" value={releases[s.id] ?? ''} onChange={e => setReleases(r => ({ ...r, [s.id]: e.target.value }))} className="input-field text-sm py-1.5 w-40" />
              <span className="text-xs w-24 text-right text-slate-500">{!releases[s.id] || releases[s.id] <= today ? 'Open now' : 'Locked until then'}</span>
            </li>
          ))}
          {ws.sections.length === 0 && <li className="px-5 py-4 text-sm text-slate-500">No weeks yet.</li>}
        </ul>
      </div>

      {ws.assignments.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl">
          <h3 className="px-5 pt-4 pb-2 font-semibold text-slate-900 text-sm">Due dates</h3>
          <ul className="divide-y divide-slate-100">
            {ws.assignments.map(a => (
              <li key={a.id} className="flex items-center gap-3 px-5 py-2.5 flex-wrap">
                <span className="flex-1 min-w-[160px] text-sm text-slate-800">
                  {a.title}
                  <span className="block text-xs text-slate-500">{a.kind === 'capstone' ? 'Capstone' : ws.sections.find(s => s.id === a.section_id)?.title ?? 'Not linked to a week'}</span>
                </span>
                <label htmlFor={`due-${a.id}`} className="text-xs text-slate-500">Due</label>
                <input id={`due-${a.id}`} type="datetime-local" value={dues[a.id] ?? ''} onChange={e => setDues(d => ({ ...d, [a.id]: e.target.value }))} className="input-field text-sm py-1.5 w-56" />
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex justify-end">
        <button onClick={save} disabled={saving} className="flex items-center gap-2 px-5 py-2.5 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-sm font-bold rounded-xl">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save schedule
        </button>
      </div>
    </div>
  );
}
