import { useCallback, useEffect, useRef, useState } from 'react';
import { X, Code2, Film, Video, Loader2, CheckCircle2, AlertTriangle, UserRound } from 'lucide-react';
import { callLectureApi, MAX_LECTURE_PART_CHARS as MAX_PART_CHARS, lectureMinutes as minutesFor } from '../../lib/lectureApi';
import { supabase } from '../../lib/supabase';
import ComposeLectureModal from '../course/ComposeLectureModal';
import type { ComposablePart } from '../course/ComposeLectureModal';
import type { Board } from '../course/LectureBoard';
import type { LecturePart as Part } from '../../lib/lectureApi';
import LecturePresenterPicker from './LecturePresenterPicker';

interface Props {
  sectionId: string;
  sectionTitle: string;
  onClose: () => void;
  /** Called when a finished video has been added to the module as a lesson. */
  onLessonAdded: () => void;
}

const POLL_MS = 15000;

export default function LectureVideoModal({ sectionId, sectionTitle, onClose, onLessonAdded }: Props) {
  const [parts, setParts] = useState<Part[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'' | 'draft' | 'save' | 'render' | 'discard' | 'board'>('');
  const [error, setError] = useState('');
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [avatarId, setAvatarId] = useState('');
  // What the presenter service last said about videos still being made
  const [checks, setChecks] = useState<Record<string, { status: string; progress: number | null }>>({});
  const [lastCheck, setLastCheck] = useState<number | null>(null);
  // Lessons whose video already has the board inside it
  const [embedded, setEmbedded] = useState<Set<string>>(new Set());
  const [composing, setComposing] = useState<ComposablePart | null>(null);
  const [notice, setNotice] = useState('');
  const readyLessonIds = parts.filter(p => p.status === 'ready' && p.lesson_id).map(p => p.lesson_id as string).join(',');
  const loadEmbedded = useCallback(async () => {
    const ids = readyLessonIds ? readyLessonIds.split(',') : [];
    if (!ids.length) { setEmbedded(new Set()); return; }
    const { data } = await supabase.from('lesson_boards').select('lesson_id, board').in('lesson_id', ids);
    setEmbedded(new Set((data ?? []).filter(r => (r.board as { embedded?: boolean } | null)?.embedded).map(r => r.lesson_id as string)));
  }, [readyLessonIds]);
  useEffect(() => { loadEmbedded().catch(() => {}); }, [loadEmbedded]);

  /** Puts the original presenter video back on the lesson. */
  const restoreOriginal = async (p: Part) => {
    if (!p.lesson_id || !p.storage_path) return;
    const url = supabase.storage.from('course-videos').getPublicUrl(p.storage_path).data.publicUrl;
    await supabase.from('lessons').update({ url, video_url: url, video_storage_path: p.storage_path }).eq('id', p.lesson_id);
    const { data } = await supabase.from('lesson_boards').select('board').eq('lesson_id', p.lesson_id).maybeSingle();
    if (data?.board) {
      await supabase.from('lesson_boards').update({ board: { ...(data.board as object), embedded: false }, updated_at: new Date().toISOString() }).eq('lesson_id', p.lesson_id);
    }
    await loadEmbedded();
  };

  const remakeBoard = async () => {
    // A new board makes a video with the old board inside it out of date
    const outdated = parts.filter(p => p.lesson_id && embedded.has(p.lesson_id));
    await run('board', () => callLectureApi('board', { section_id: sectionId }));
    for (const p of outdated) await restoreOriginal(p).catch(() => {});
    if (outdated.length) setNotice('The board changed, so the lesson is back to the original video. Put the board inside the video again when you are happy with it.');
  };
  const [voiceId, setVoiceId] = useState('');
  const readyCountRef = useRef(0);

  // Kept in a ref so the status timer below is not restarted every time the parent re-renders
  const onLessonAddedRef = useRef(onLessonAdded);
  onLessonAddedRef.current = onLessonAdded;

  const applyParts = useCallback((next: Part[]) => {
    setParts(next);
    const ready = next.filter(p => p.status === 'ready').length;
    if (ready > readyCountRef.current) onLessonAddedRef.current();
    readyCountRef.current = ready;
  }, []);

  // Load what exists for this module
  useEffect(() => {
    let active = true;
    callLectureApi<{ parts: Part[]; checks?: typeof checks }>('sync', { section_id: sectionId })
      .then(r => { if (active) { readyCountRef.current = r.parts.filter(p => p.status === 'ready').length; setParts(r.parts); setChecks(r.checks ?? {}); setLastCheck(Date.now()); } })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : 'Could not load.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [sectionId]);

  const inProgress = parts.some(p => p.status === 'rendering' || p.status === 'saving');
  const drafts = parts.filter(p => p.status === 'draft' || p.status === 'failed');
  const hasDrafts = drafts.length > 0;

  // While a video is being made, check on it regularly
  useEffect(() => {
    if (!inProgress) return;
    const id = setInterval(() => {
      callLectureApi<{ parts: Part[]; checks?: typeof checks }>('sync', { section_id: sectionId })
        .then(r => { applyParts(r.parts); setChecks(r.checks ?? {}); setLastCheck(Date.now()); }).catch(() => {});
    }, POLL_MS);
    return () => clearInterval(id);
  }, [inProgress, sectionId, applyParts]);

  const run = async (kind: typeof busy, fn: () => Promise<{ parts: Part[] }>) => {
    setBusy(kind);
    setError('');
    try {
      applyParts((await fn()).parts);
      if (kind === 'draft' || kind === 'discard') setEdits({});
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy('');
    }
  };

  const scriptOf = (p: Part) => edits[p.id] ?? p.script;
  const tooLong = drafts.some(p => scriptOf(p).length > MAX_PART_CHARS);

  const handleRender = () => run('render', async () => {
    // Save any edits first so the video is made from exactly what is on screen
    for (const p of drafts) {
      if (edits[p.id] !== undefined && edits[p.id] !== p.script) {
        await callLectureApi('save_script', { id: p.id, script: edits[p.id] });
      }
    }
    return callLectureApi<{ parts: Part[] }>('render', { section_id: sectionId, avatar_id: avatarId, voice_id: voiceId });
  });

  const totalMinutes = drafts.reduce((sum, p) => sum + minutesFor(scriptOf(p).length), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={busy ? undefined : onClose} />
      <div role="dialog" aria-modal="true" aria-labelledby="lecture-video-title" className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100 shrink-0">
          <div className="w-9 h-9 bg-sky-100 rounded-xl flex items-center justify-center shrink-0">
            <Video className="w-4 h-4 text-sky-600" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 id="lecture-video-title" className="font-bold text-slate-900">AI lecture video</h3>
            <p className="text-xs text-slate-400 truncate">{sectionTitle}</p>
          </div>
          <button onClick={onClose} disabled={!!busy} aria-label="Close" className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 disabled:opacity-40">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {error && (
            <div role="alert" className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>
          )}

          {loading ? (
            <div className="flex items-center justify-center gap-3 py-16 text-sm text-slate-500">
              <Loader2 className="w-5 h-5 animate-spin text-sky-500" /> Loading…
            </div>
          ) : busy === 'draft' ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <Loader2 className="w-8 h-8 animate-spin text-sky-500" />
              <p className="text-sm font-medium text-slate-700">Writing the lecture script from this module's lessons…</p>
              <p className="text-xs text-slate-400">This usually takes under a minute.</p>
            </div>
          ) : parts.length === 0 ? (
            <div className="text-center py-10 space-y-4">
              <div className="w-16 h-16 bg-sky-50 rounded-2xl flex items-center justify-center mx-auto">
                <UserRound className="w-8 h-8 text-sky-500" />
              </div>
              <div>
                <p className="font-semibold text-slate-800">Create a lecture for this module</p>
                <p className="text-sm text-slate-500 max-w-md mx-auto mt-1">
                  An AI presenter teaches the key concepts from this module's lessons in a 5 to 10 minute video.
                  You review and approve the script before any video is made.
                </p>
              </div>
              <button
                onClick={() => run('draft', () => callLectureApi('draft', { section_id: sectionId }))}
                className="px-5 py-2.5 bg-sky-600 hover:bg-sky-700 text-white text-sm font-bold rounded-xl transition-colors"
              >
                Write the script
              </button>
            </div>
          ) : (
            <>
              {/* Finished and in-progress parts */}
              {parts.filter(p => !['draft', 'failed'].includes(p.status)).map(p => (
                <div key={p.id} className="flex items-center gap-3 border border-slate-200 rounded-xl px-4 py-3">
                  {p.status === 'ready'
                    ? <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                    : <Loader2 className="w-5 h-5 text-sky-500 animate-spin shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-800 truncate">{p.title}</p>
                    <p className="text-xs text-slate-500">
                      {p.status === 'ready'
                        ? `Ready and added to the module as a lesson${p.duration_seconds ? ` (${Math.max(1, Math.round(p.duration_seconds / 60))} min)` : ''}.`
                        : p.status === 'saving'
                          ? 'Video finished. Saving it to your course…'
                          : 'The presenter video is being made. Longer parts can take 30 minutes or more; you can close this window and come back.'}
                    </p>
                    {p.status === 'rendering' && p.error_message && (
                      <p role="alert" className="mt-1 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5">{p.error_message}</p>
                    )}
                    {p.status === 'rendering' && !p.error_message && checks[p.id] && (
                      <p className="mt-0.5 text-xs text-slate-500">
                        Presenter service: {checks[p.id].status === 'completed' ? 'finished, saving to your course' : checks[p.id].status}
                        {checks[p.id].progress !== null ? ` (${Math.round(checks[p.id].progress!)}%)` : ''}
                        {lastCheck ? ` · checked ${new Date(lastCheck).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}
                      </p>
                    )}
                  </div>
                </div>
              ))}

              {/* Live board beside the video: code typed as the presenter speaks */}
              <div className="border border-slate-200 rounded-xl px-4 py-3 space-y-2">
                <div className="flex items-center gap-3 flex-wrap">
                  <Code2 className="w-5 h-5 text-sky-600 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-800">Live board</p>
                    <p className="text-xs text-slate-500">
                      {parts.some(p => p.board?.steps?.length)
                        ? `Shown beside the video: ${parts.reduce((n, p) => n + (p.board?.steps?.length ?? 0), 0)} steps of code, output and key points, timed to what the presenter says.`
                        : 'Shows the code being typed and its output (or the key points) beside the presenter, timed to what the presenter says.'}
                    </p>
                  </div>
                  <button
                    onClick={remakeBoard}
                    disabled={!!busy}
                    className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border border-sky-300 text-sky-700 bg-white hover:bg-sky-50 disabled:opacity-50"
                  >
                    {busy === 'board' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Code2 className="w-3.5 h-3.5" />}
                    {busy === 'board' ? 'Designing the board…' : parts.some(p => p.board?.steps?.length) ? 'Make the board again' : 'Add live board'}
                  </button>
                </div>
                {notice && <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5">{notice}</p>}
                {parts.filter(p => p.status === 'ready' && p.lesson_id && p.storage_path && p.board?.steps?.length).map(p => {
                  const inside = embedded.has(p.lesson_id as string);
                  return (
                    <div key={p.id} className="flex items-center gap-2 flex-wrap bg-slate-50 rounded-lg px-3 py-2">
                      <span className="flex-1 min-w-[180px] text-xs text-slate-700">
                        {parts.length > 1 && <strong className="font-semibold">Part {p.part_index + 1}: </strong>}
                        {inside ? 'The board is inside the video.' : 'The board shows beside the video.'}
                      </span>
                      <button
                        onClick={() => setComposing({ id: p.id, title: p.title, lesson_id: p.lesson_id as string, storage_path: p.storage_path as string, board: p.board as unknown as Board })}
                        disabled={!!busy}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-sky-600 hover:bg-sky-700 text-white disabled:opacity-50"
                      >
                        <Film className="w-3.5 h-3.5" /> {inside ? 'Make it again' : 'Put the board inside the video'}
                      </button>
                      {inside && (
                        <button onClick={() => restoreOriginal(p)} disabled={!!busy} className="text-xs font-semibold text-slate-600 hover:underline">Use the original video</button>
                      )}
                    </div>
                  );
                })}
                {parts.some(p => p.board?.steps?.length) && (
                  <ol className="text-xs text-slate-600 space-y-1 max-h-40 overflow-y-auto pl-1">
                    {parts.flatMap(p => p.board?.steps ?? []).map((st, i) => (
                      <li key={i} className="flex gap-2 min-w-0">
                        <span className="text-slate-400 w-5 text-right shrink-0">{i + 1}.</span>
                        <span className="font-medium text-slate-700 shrink-0">{st.kind === 'code' ? 'Code' : st.kind === 'points' ? 'Points' : 'Heading'}:</span>
                        <span className="truncate font-mono">{st.kind === 'code' ? (st.code ?? '').split('\n')[0] : st.kind === 'points' ? (st.title || (st.points ?? [])[0]) : st.title}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>

              {/* Script review */}
              {hasDrafts && (
                <>
                  <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800 flex gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>Read the script and correct anything inaccurate before making the video. The presenter says exactly what is written here, and each video is charged by the minute.</span>
                  </div>

                  {drafts.map(p => {
                    const text = scriptOf(p);
                    const over = text.length > MAX_PART_CHARS;
                    return (
                      <div key={p.id}>
                        <div className="flex items-baseline justify-between gap-3 mb-1.5">
                          <label htmlFor={`script-${p.id}`} className="text-sm font-semibold text-slate-700">{p.title}</label>
                          <span className={`text-xs shrink-0 ${over ? 'text-red-600 font-semibold' : 'text-slate-400'}`}>
                            {text.length.toLocaleString()} / {MAX_PART_CHARS.toLocaleString()} characters · about {minutesFor(text.length)} min
                          </span>
                        </div>
                        {p.status === 'failed' && p.error_message && (
                          <p role="alert" className="text-xs text-red-600 mb-1.5">{p.error_message}</p>
                        )}
                        <textarea
                          id={`script-${p.id}`}
                          value={text}
                          onChange={e => setEdits(prev => ({ ...prev, [p.id]: e.target.value }))}
                          rows={10}
                          className={`input-field text-sm leading-relaxed font-normal ${over ? 'border-red-400' : ''}`}
                        />
                        {over && <p className="text-xs text-red-600 mt-1">This part is too long for one video. Please shorten it.</p>}
                      </div>
                    );
                  })}

                  {/* Presenter and voice */}
                  <LecturePresenterPicker
                    avatarId={avatarId}
                    voiceId={voiceId}
                    onChange={v => { setAvatarId(v.avatarId); setVoiceId(v.voiceId); }}
                  />
                </>
              )}
            </>
          )}
        </div>

        {!loading && parts.length > 0 && busy !== 'draft' && (
          <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-slate-100 shrink-0">
            <div className="flex items-center gap-2">
              {!inProgress && (
                <button
                  onClick={() => run('draft', () => callLectureApi('draft', { section_id: sectionId }))}
                  disabled={!!busy}
                  className="px-3.5 py-2 text-xs font-semibold border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  Write a new script
                </button>
              )}
              {hasDrafts && (
                <button
                  onClick={() => run('discard', () => callLectureApi('discard', { section_id: sectionId }))}
                  disabled={!!busy}
                  className="px-3.5 py-2 text-xs font-semibold text-slate-500 hover:text-red-600 disabled:opacity-50"
                >
                  Discard script
                </button>
              )}
            </div>
            {hasDrafts ? (
              <button
                onClick={handleRender}
                disabled={!!busy || tooLong || !avatarId || !voiceId}
                className="flex items-center gap-2 px-5 py-2.5 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-colors"
              >
                {busy === 'render' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Video className="w-4 h-4" />}
                {busy === 'render' ? 'Starting…' : `Make video (about ${totalMinutes} min)`}
              </button>
            ) : (
              <button onClick={onClose} className="px-5 py-2.5 border border-slate-200 text-sm font-semibold text-slate-700 rounded-xl hover:bg-slate-50">
                Close
              </button>
            )}
          </div>
        )}
      </div>
      {composing && (
        <ComposeLectureModal
          part={composing}
          courseId={parts.find(p => p.id === composing.id)?.course_id ?? ''}
          heading={sectionTitle}
          subheading={parts.length > 1 ? `Lecture · part ${(parts.find(p => p.id === composing.id)?.part_index ?? 0) + 1} of ${parts.length}` : 'Lecture'}
          onClose={() => setComposing(null)}
          onDone={() => { loadEmbedded().catch(() => {}); onLessonAddedRef.current(); }}
        />
      )}
    </div>
  );
}
