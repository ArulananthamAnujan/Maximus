import { useState } from 'react';
import { X, Copy, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatDate } from '../../lib/workspace';

interface Props {
  course: { id: string; title: string; start_date?: string | null };
  onClose: () => void;
  onCopied: (newCourseId: string) => void;
}

/** Copies a course for a new term or group: all content, none of the students. */
export default function CopyCourseModal({ course, onClose, onCopied }: Props) {
  const [title, setTitle] = useState(`${course.title} (copy)`);
  const [start, setStart] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const copy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { setError('Give the copy a title.'); return; }
    setBusy(true);
    setError('');
    const { data, error: rpcError } = await supabase.rpc('copy_course', { p_course: course.id, p_title: title.trim(), p_start: start || null });
    setBusy(false);
    if (rpcError || !data) {
      setError(/cannot copy/i.test(rpcError?.message ?? '') ? 'You do not have permission to copy this course.' : 'Could not copy the course. Please try again.');
      return;
    }
    onCopied(data as string);
  };

  const datesMove = !!course.start_date && !!start;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={busy ? undefined : onClose} />
      <form onSubmit={copy} role="dialog" aria-modal="true" aria-labelledby="copy-title" className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100">
          <div className="w-9 h-9 bg-sky-100 rounded-xl flex items-center justify-center shrink-0"><Copy className="w-4 h-4 text-sky-600" /></div>
          <div className="flex-1 min-w-0">
            <h3 id="copy-title" className="font-bold text-slate-900">Copy for a new term</h3>
            <p className="text-xs text-slate-500 truncate">{course.title}</p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="p-2 rounded-lg text-slate-400 hover:bg-slate-100"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label htmlFor="copy-name" className="block text-sm font-semibold text-slate-700 mb-1.5">Title of the copy</label>
            <input id="copy-name" value={title} onChange={e => setTitle(e.target.value)} maxLength={200} className="input-field" placeholder="e.g. ML Bootcamp, Term 2 2027" autoFocus />
          </div>
          <div>
            <label htmlFor="copy-start" className="block text-sm font-semibold text-slate-700 mb-1.5">New start date <span className="font-normal text-slate-500">(optional)</span></label>
            <input id="copy-start" type="date" value={start} onChange={e => setStart(e.target.value)} className="input-field w-48" />
            <p className="text-xs text-slate-500 mt-1.5">
              {datesMove
                ? `Week opening dates and due dates move to match (the original started ${formatDate(course.start_date)}).`
                : course.start_date
                  ? 'Without a new start date, opening and due dates are cleared; set them on the Schedule tab.'
                  : 'You can set when each week opens on the Schedule tab.'}
            </p>
          </div>
          <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 space-y-1">
            <p><strong>Copied:</strong> weeks, lessons, notes, slides, teacher guides, activities, flashcards, quizzes, assignments and projects (with model answers), exams and finished lecture videos.</p>
            <p><strong>Not copied:</strong> students, progress, submissions, marks, certificates and feedback. The copy starts as a draft.</p>
          </div>
          {error && <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-100">
          <button type="button" onClick={onClose} disabled={busy} className="px-4 py-2 text-sm border border-slate-200 rounded-xl text-slate-700">Cancel</button>
          <button type="submit" disabled={busy} className="flex items-center gap-2 px-5 py-2 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-sm font-bold rounded-xl">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Copy className="w-4 h-4" />} Copy course
          </button>
        </div>
      </form>
    </div>
  );
}
