import { useCallback, useEffect, useRef, useState } from 'react';
import { X, Video, Loader2, CheckCircle2, AlertTriangle, RefreshCw, Play, UserRound } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface Props {
  sectionId: string;
  sectionTitle: string;
  onClose: () => void;
  /** Called when a finished video has been added to the module as a lesson. */
  onLessonAdded: () => void;
}

interface Part {
  id: string;
  part_index: number;
  part_count: number;
  title: string;
  script: string;
  status: 'draft' | 'rendering' | 'saving' | 'ready' | 'failed';
  error_message: string | null;
  duration_seconds: number | null;
}

interface AvatarOption { id: string; name: string; gender: string | null; preview_image_url: string | null; default_voice_id: string | null }
interface VoiceOption { id: string; name: string; gender: string | null; language: string | null; locale: string | null; preview_audio_url: string | null }

const MAX_PART_CHARS = 4800;
const POLL_MS = 15000;
// Spoken English runs at roughly 900 characters a minute.
const minutesFor = (chars: number) => Math.max(1, Math.round(chars / 900));

async function callLectureApi<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Please sign in again.');
  let res: Response;
  try {
    res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/lecture-video`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ action, ...payload }),
    });
  } catch {
    throw new Error('Could not reach the server. Please check your connection and try again.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
  return data as T;
}

export default function LectureVideoModal({ sectionId, sectionTitle, onClose, onLessonAdded }: Props) {
  const [parts, setParts] = useState<Part[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'' | 'draft' | 'save' | 'render' | 'discard'>('');
  const [error, setError] = useState('');
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [avatars, setAvatars] = useState<AvatarOption[]>([]);
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [optionsError, setOptionsError] = useState('');
  const [avatarId, setAvatarId] = useState('');
  const [voiceId, setVoiceId] = useState('');
  const readyCountRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

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
    callLectureApi<{ parts: Part[] }>('sync', { section_id: sectionId })
      .then(r => { if (active) { readyCountRef.current = r.parts.filter(p => p.status === 'ready').length; setParts(r.parts); } })
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
      callLectureApi<{ parts: Part[] }>('sync', { section_id: sectionId }).then(r => applyParts(r.parts)).catch(() => {});
    }, POLL_MS);
    return () => clearInterval(id);
  }, [inProgress, sectionId, applyParts]);

  // Presenters and voices are only needed once there is a script to approve
  useEffect(() => {
    if (!hasDrafts || avatars.length > 0 || optionsError) return;
    let active = true;
    callLectureApi<{ avatars: AvatarOption[]; voices: VoiceOption[] }>('options')
      .then(r => {
        if (!active) return;
        setAvatars(r.avatars);
        setVoices(r.voices);
        if (r.avatars[0]) {
          setAvatarId(r.avatars[0].id);
          setVoiceId(r.avatars[0].default_voice_id || r.voices[0]?.id || '');
        }
      })
      .catch(e => { if (active) setOptionsError(e instanceof Error ? e.message : 'Could not load presenters.'); });
    return () => { active = false; };
  }, [hasDrafts, avatars.length, optionsError]);

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

  const selectAvatar = (a: AvatarOption) => {
    setAvatarId(a.id);
    if (a.default_voice_id) setVoiceId(a.default_voice_id);
  };

  const playVoice = (url: string | null) => {
    if (!url) return;
    audioRef.current?.pause();
    audioRef.current = new Audio(url);
    audioRef.current.play().catch(() => {});
  };
  useEffect(() => () => { audioRef.current?.pause(); }, []);

  const totalMinutes = drafts.reduce((sum, p) => sum + minutesFor(scriptOf(p).length), 0);
  const selectedVoice = voices.find(v => v.id === voiceId);

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
                          : 'The presenter video is being made. This usually takes several minutes; you can close this window and come back.'}
                    </p>
                  </div>
                </div>
              ))}

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

                  {/* Presenter */}
                  <div>
                    <p className="text-sm font-semibold text-slate-700 mb-2">Presenter</p>
                    {optionsError ? (
                      <div className="flex items-center justify-between gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
                        <span>{optionsError}</span>
                        <button onClick={() => setOptionsError('')} className="flex items-center gap-1 text-xs font-semibold shrink-0 hover:underline"><RefreshCw className="w-3 h-3" /> Retry</button>
                      </div>
                    ) : avatars.length === 0 ? (
                      <p className="text-sm text-slate-400 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading presenters…</p>
                    ) : (
                      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 max-h-56 overflow-y-auto pr-1">
                        {avatars.map(a => (
                          <button
                            key={a.id}
                            type="button"
                            onClick={() => selectAvatar(a)}
                            aria-pressed={avatarId === a.id}
                            className={`rounded-xl border-2 overflow-hidden text-left transition-colors ${avatarId === a.id ? 'border-sky-500 ring-2 ring-sky-200' : 'border-slate-200 hover:border-slate-300'}`}
                          >
                            <div className="aspect-square bg-slate-100">
                              {a.preview_image_url
                                ? <img src={a.preview_image_url} alt="" loading="lazy" className="w-full h-full object-cover" />
                                : <div className="w-full h-full flex items-center justify-center"><UserRound className="w-6 h-6 text-slate-300" /></div>}
                            </div>
                            <p className="text-[11px] font-medium text-slate-700 px-1.5 py-1 truncate">{a.name}</p>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Voice */}
                  {voices.length > 0 && (
                    <div>
                      <label htmlFor="lecture-voice" className="block text-sm font-semibold text-slate-700 mb-1.5">Voice</label>
                      <div className="flex items-center gap-2">
                        <select id="lecture-voice" value={voiceId} onChange={e => setVoiceId(e.target.value)} className="input-field text-sm flex-1">
                          {!voices.some(v => v.id === voiceId) && voiceId && <option value={voiceId}>Presenter's own voice</option>}
                          {voices.map(v => (
                            <option key={v.id} value={v.id}>{v.name}{v.gender ? ` · ${v.gender}` : ''}{v.locale ? ` · ${v.locale}` : ''}</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => playVoice(selectedVoice?.preview_audio_url ?? null)}
                          disabled={!selectedVoice?.preview_audio_url}
                          className="flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-40 shrink-0"
                        >
                          <Play className="w-3.5 h-3.5" /> Listen
                        </button>
                      </div>
                    </div>
                  )}
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
    </div>
  );
}
