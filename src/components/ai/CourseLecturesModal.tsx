import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X, Video, Loader2, CheckCircle2, AlertTriangle, FileText, Pencil } from 'lucide-react';
import { callLectureApi, lectureMinutes } from '../../lib/lectureApi';
import type { LecturePart } from '../../lib/lectureApi';
import LecturePresenterPicker from './LecturePresenterPicker';
import LectureVideoModal from './LectureVideoModal';

interface WeekInfo { id: string; title: string; lessonCount: number }

interface Props {
  courseId: string;
  courseTitle: string;
  sections: WeekInfo[];
  onClose: () => void;
  /** Called when finished videos have been added to the course as lessons. */
  onLessonAdded: () => void;
}

type WeekStatus = 'none' | 'draft' | 'making' | 'ready' | 'failed';

const POLL_MS = 20000;

function statusOf(parts: LecturePart[]): WeekStatus {
  if (parts.length === 0) return 'none';
  if (parts.some(p => p.status === 'rendering' || p.status === 'saving')) return 'making';
  if (parts.every(p => p.status === 'ready')) return 'ready';
  if (parts.some(p => p.status === 'failed')) return 'failed';
  return 'draft';
}

const STOP_ALL = /not enough tokens|out of credit|not set up|api key|permission|inactive/i;

export default function CourseLecturesModal({ courseId, courseTitle, sections, onClose, onLessonAdded }: Props) {
  const [parts, setParts] = useState<LecturePart[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'' | 'scripts' | 'render'>('');
  const [progress, setProgress] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [avatarId, setAvatarId] = useState('');
  const [voiceId, setVoiceId] = useState('');
  const [reviewed, setReviewed] = useState(false);
  const [reviewWeek, setReviewWeek] = useState<WeekInfo | null>(null);
  const readyCountRef = useRef(0);
  const onLessonAddedRef = useRef(onLessonAdded);
  onLessonAddedRef.current = onLessonAdded;

  const apply = useCallback((next: LecturePart[]) => {
    setParts(next);
    const ready = next.filter(p => p.status === 'ready').length;
    if (ready > readyCountRef.current) onLessonAddedRef.current();
    readyCountRef.current = ready;
  }, []);

  const refresh = useCallback(async () => {
    const r = await callLectureApi<{ parts: LecturePart[] }>('course_status', { course_id: courseId });
    apply(r.parts);
  }, [courseId, apply]);

  useEffect(() => {
    let active = true;
    callLectureApi<{ parts: LecturePart[] }>('course_status', { course_id: courseId })
      .then(r => { if (active) { readyCountRef.current = r.parts.filter(p => p.status === 'ready').length; setParts(r.parts); } })
      .catch(e => { if (active) setErrors([e instanceof Error ? e.message : 'Could not load lectures.']); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [courseId]);

  const byWeek = useMemo(() => {
    const map = new Map<string, LecturePart[]>();
    for (const p of parts) map.set(p.section_id, [...(map.get(p.section_id) ?? []), p]);
    return map;
  }, [parts]);

  const weeks = sections.map(w => ({ ...w, parts: byWeek.get(w.id) ?? [], status: statusOf(byWeek.get(w.id) ?? []) }));
  const needScripts = weeks.filter(w => w.status === 'none' && w.lessonCount > 0);
  const readyToMake = weeks.filter(w => w.status === 'draft' || w.status === 'failed');
  const making = weeks.some(w => w.status === 'making');
  const draftMinutes = readyToMake.reduce((n, w) => n + w.parts.filter(p => p.status !== 'ready').reduce((m, p) => m + lectureMinutes(p.script.length), 0), 0);

  // While videos are being made, check on them (this also saves finished ones to the course)
  useEffect(() => {
    if (!making || busy) return;
    const id = setInterval(() => { refresh().catch(() => {}); }, POLL_MS);
    return () => clearInterval(id);
  }, [making, busy, refresh]);

  const writeScripts = async () => {
    setBusy('scripts');
    setErrors([]);
    const failures: string[] = [];
    for (let i = 0; i < needScripts.length; i++) {
      const week = needScripts[i];
      setProgress(`Writing script ${i + 1} of ${needScripts.length}: ${week.title}`);
      try {
        await callLectureApi('draft', { section_id: week.id });
      } catch (e) {
        const text = e instanceof Error ? e.message : 'Failed.';
        failures.push(`${week.title}: ${text}`);
        if (STOP_ALL.test(text)) break;
      }
    }
    await refresh().catch(() => {});
    setErrors(failures);
    setProgress('');
    setBusy('');
  };

  const makeVideos = async () => {
    setBusy('render');
    setErrors([]);
    const failures: string[] = [];
    for (let i = 0; i < readyToMake.length; i++) {
      const week = readyToMake[i];
      setProgress(`Starting video ${i + 1} of ${readyToMake.length}: ${week.title}`);
      try {
        await callLectureApi('render', { section_id: week.id, avatar_id: avatarId, voice_id: voiceId });
      } catch (e) {
        const text = e instanceof Error ? e.message : 'Failed.';
        failures.push(`${week.title}: ${text}`);
        if (STOP_ALL.test(text)) break;
      }
    }
    await refresh().catch(() => {});
    setErrors(failures);
    setProgress('');
    setReviewed(false);
    setBusy('');
  };

  const label: Record<WeekStatus, string> = {
    none: 'No script yet',
    draft: 'Script ready to review',
    making: 'Video being made…',
    ready: 'Video ready',
    failed: 'Needs attention',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={busy ? undefined : onClose} />
      <div role="dialog" aria-modal="true" aria-labelledby="course-lectures-title" className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100 shrink-0">
          <div className="w-9 h-9 bg-sky-100 rounded-xl flex items-center justify-center shrink-0">
            <Video className="w-4 h-4 text-sky-600" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 id="course-lectures-title" className="font-bold text-slate-900">Weekly AI lectures</h3>
            <p className="text-xs text-slate-500 truncate">{courseTitle}: one presenter-led lecture per week, written from that week's notes</p>
          </div>
          <button onClick={onClose} disabled={!!busy} aria-label="Close" className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 disabled:opacity-40">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {loading ? (
            <div className="flex items-center justify-center gap-3 py-16 text-sm text-slate-500">
              <Loader2 className="w-5 h-5 animate-spin text-sky-500" /> Loading…
            </div>
          ) : (
            <>
              <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5">
                Lectures are written from each week's lesson notes, so generate the notes first (Course materials) for the most complete lectures.
              </p>

              <div className="border border-slate-200 rounded-xl divide-y divide-slate-100">
                {weeks.map(w => {
                  const minutes = w.parts.reduce((m, p) => m + (p.duration_seconds ? Math.round(p.duration_seconds / 60) : lectureMinutes(p.script.length)), 0);
                  const failed = w.parts.find(p => p.status === 'failed');
                  return (
                    <div key={w.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="shrink-0">
                        {w.status === 'ready' && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                        {w.status === 'making' && <Loader2 className="w-4 h-4 animate-spin text-sky-500" />}
                        {w.status === 'failed' && <AlertTriangle className="w-4 h-4 text-red-500" />}
                        {w.status === 'draft' && <FileText className="w-4 h-4 text-amber-500" />}
                        {w.status === 'none' && <span className="block w-4 h-4 rounded-full border border-slate-300" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-800 truncate">{w.title}</p>
                        <p className={`text-xs ${w.status === 'failed' ? 'text-red-600' : 'text-slate-500'}`}>
                          {w.lessonCount === 0 ? 'No lessons yet' : label[w.status]}
                          {w.parts.length > 0 && ` · about ${minutes} min${w.parts.length > 1 ? ` in ${w.parts.length} parts` : ''}`}
                          {failed?.error_message ? ` · ${failed.error_message}` : ''}
                        </p>
                      </div>
                      {w.status !== 'none' && (
                        <button
                          type="button"
                          onClick={() => setReviewWeek(w)}
                          disabled={!!busy}
                          className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-40 shrink-0"
                        >
                          <Pencil className="w-3 h-3" /> {w.status === 'draft' || w.status === 'failed' ? 'Review script' : 'Open'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              {errors.length > 0 && (
                <div role="alert" className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 space-y-1">
                  {errors.map((e, i) => <p key={i}>{e}</p>)}
                </div>
              )}

              {readyToMake.length > 0 && !busy && (
                <div className="space-y-4 border-t border-slate-100 pt-5">
                  <LecturePresenterPicker
                    avatarId={avatarId}
                    voiceId={voiceId}
                    onChange={v => { setAvatarId(v.avatarId); setVoiceId(v.voiceId); }}
                  />
                  <label className="flex items-start gap-2.5 text-sm text-slate-700 cursor-pointer bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                    <input type="checkbox" checked={reviewed} onChange={e => setReviewed(e.target.checked)} className="mt-0.5 accent-sky-600" />
                    <span>I have reviewed the scripts for the {readyToMake.length} week{readyToMake.length === 1 ? '' : 's'} listed as ready. The presenter will say exactly what each script says, and videos are charged by the minute.</span>
                  </label>
                </div>
              )}
            </>
          )}
        </div>

        {!loading && (
          <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-slate-100 shrink-0 flex-wrap">
            {busy ? (
              <p className="flex items-center gap-2 text-sm text-slate-600"><Loader2 className="w-4 h-4 animate-spin text-sky-500" /> {progress}</p>
            ) : (
              <button
                onClick={writeScripts}
                disabled={needScripts.length === 0}
                className="px-4 py-2.5 text-sm font-semibold border border-slate-200 rounded-xl text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              >
                {needScripts.length === 0 ? 'Every week has a script' : `Write scripts for ${needScripts.length} week${needScripts.length === 1 ? '' : 's'}`}
              </button>
            )}
            {!busy && readyToMake.length > 0 && (
              <button
                onClick={makeVideos}
                disabled={!reviewed || !avatarId || !voiceId}
                className="flex items-center gap-2 px-5 py-2.5 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-colors"
              >
                <Video className="w-4 h-4" /> Make {readyToMake.length} video{readyToMake.length === 1 ? '' : 's'} (about {draftMinutes} min in total)
              </button>
            )}
          </div>
        )}
      </div>

      {reviewWeek && (
        <LectureVideoModal
          sectionId={reviewWeek.id}
          sectionTitle={reviewWeek.title}
          onClose={() => { setReviewWeek(null); refresh().catch(() => {}); }}
          onLessonAdded={() => onLessonAddedRef.current()}
        />
      )}
    </div>
  );
}
