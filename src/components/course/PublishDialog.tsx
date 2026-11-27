import { useState } from 'react';
import { X, CheckCircle2, AlertTriangle, Circle, Loader2, Rocket } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase';
import { itemComplete } from '../../lib/workspace';
import type { ReadinessItem, Workspace } from '../../lib/workspace';

interface Props {
  ws: Workspace;
  percent: number;
  items: ReadinessItem[];
  onClose: () => void;
  onChanged: () => Promise<void>;
  onFix: (item: ReadinessItem) => void;
}

export default function PublishDialog({ ws, percent, items, onClose, onChanged, onFix }: Props) {
  const [busy, setBusy] = useState(false);
  const published = !!ws.course.is_published;
  const hasLessons = items.find(i => i.key === 'content')?.done ?? 0;
  const missingRequired = items.filter(i => i.level === 'required' && !itemComplete(i));
  const missingRecommended = items.filter(i => i.level === 'recommended' && i.total > 0 && !itemComplete(i));

  const setPublished = async (value: boolean) => {
    setBusy(true);
    const { error } = await supabase.from('courses').update({ is_published: value }).eq('id', ws.course.id);
    setBusy(false);
    if (error) { toast.error('Could not change the course status.'); return; }
    toast.success(value ? 'Course published. Students can now find and join it.' : 'Course moved back to draft.');
    await onChanged();
    onClose();
  };

  const icon = (item: ReadinessItem) => itemComplete(item)
    ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
    : item.level === 'required' ? <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
      : item.level === 'recommended' ? <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
        : <Circle className="w-4 h-4 text-slate-300 shrink-0" />;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={busy ? undefined : onClose} />
      <div role="dialog" aria-modal="true" aria-labelledby="publish-title" className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100">
          <div className="flex-1">
            <h3 id="publish-title" className="font-bold text-slate-900">{published ? 'This course is published' : 'Publish this course'}</h3>
            <p className="text-xs text-slate-500">{percent}% ready</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-2 rounded-lg text-slate-400 hover:bg-slate-100"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          <ul className="space-y-1.5">
            {items.filter(i => i.total > 0).map(item => (
              <li key={item.key} className="flex items-start gap-2.5 text-sm">
                {icon(item)}
                <span className="flex-1">
                  <span className="text-slate-800">{item.label}</span>
                  {item.total > 1 && <span className="text-slate-500"> · {item.done}/{item.total}</span>}
                  {item.level === 'optional' && <span className="text-xs text-slate-400"> (optional)</span>}
                  {!itemComplete(item) && <span className="block text-xs text-slate-500">{item.hint}</span>}
                </span>
                {!itemComplete(item) && (
                  <button onClick={() => { onClose(); onFix(item); }} className="text-xs font-semibold text-sky-700 hover:underline shrink-0">Fix</button>
                )}
              </li>
            ))}
          </ul>
          {!published && missingRequired.length > 0 && hasLessons > 0 && (
            <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">Students will see an incomplete course. Fix the items in red first if you can.</p>
          )}
          {!published && missingRequired.length === 0 && missingRecommended.length > 0 && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">You can publish now and finish the remaining items later; students will see new material as it is added.</p>
          )}
          {!hasLessons && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">Add at least one lesson before publishing.</p>}
        </div>
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100">
          {published ? (
            <button onClick={() => setPublished(false)} disabled={busy} className="px-4 py-2 text-sm font-semibold border border-slate-300 rounded-lg text-slate-700 disabled:opacity-50">
              {busy ? 'Working…' : 'Unpublish (back to draft)'}
            </button>
          ) : (
            <>
              <button onClick={onClose} className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-700">Not yet</button>
              <button onClick={() => setPublished(true)} disabled={busy || !hasLessons} className="flex items-center gap-2 px-5 py-2 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-sm font-bold rounded-lg">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />} {missingRequired.length ? 'Publish anyway' : 'Publish'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
