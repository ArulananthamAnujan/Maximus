import { useEffect, useRef, useState } from 'react';
import { Loader2, Play, RefreshCw, UserRound } from 'lucide-react';
import { callLectureApi } from '../../lib/lectureApi';
import type { AvatarOption, VoiceOption } from '../../lib/lectureApi';

interface Props {
  avatarId: string;
  voiceId: string;
  onChange: (value: { avatarId: string; voiceId: string }) => void;
}

/** Presenter and voice choice for AI lecture videos, with a voice preview. */
export default function LecturePresenterPicker({ avatarId, voiceId, onChange }: Props) {
  const [avatars, setAvatars] = useState<AvatarOption[]>([]);
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const initialAvatarRef = useRef(avatarId);

  useEffect(() => {
    let active = true;
    setError('');
    callLectureApi<{ avatars: AvatarOption[]; voices: VoiceOption[] }>('options')
      .then(r => {
        if (!active) return;
        const avatarList = Array.isArray(r?.avatars) ? r.avatars : [];
        const voiceList = Array.isArray(r?.voices) ? r.voices : [];
        if (avatarList.length === 0 || voiceList.length === 0) {
          setError('No presenters or voices are available from the video service. Check its account, then try again.');
          return;
        }
        setAvatars(avatarList);
        setVoices(voiceList);
        if (!initialAvatarRef.current && avatarList[0]) {
          onChangeRef.current({ avatarId: avatarList[0].id, voiceId: avatarList[0].default_voice_id || voiceList[0]?.id || '' });
        }
      })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : 'Could not load presenters.'); });
    return () => { active = false; };
  }, [attempt]);

  useEffect(() => () => { audioRef.current?.pause(); }, []);

  const playVoice = (url: string | null) => {
    if (!url) return;
    audioRef.current?.pause();
    audioRef.current = new Audio(url);
    audioRef.current.play().catch(() => {});
  };

  const selectedVoice = voices.find(v => v.id === voiceId);

  if (error) {
    return (
      <div className="flex items-center justify-between gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
        <span>{error}</span>
        <button onClick={() => setAttempt(n => n + 1)} className="flex items-center gap-1 text-xs font-semibold shrink-0 hover:underline"><RefreshCw className="w-3 h-3" /> Retry</button>
      </div>
    );
  }
  if (avatars.length === 0) {
    return <p className="text-sm text-slate-400 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading presenters…</p>;
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-semibold text-slate-700 mb-2">Presenter</p>
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 max-h-56 overflow-y-auto pr-1">
          {avatars.map(a => (
            <button
              key={a.id}
              type="button"
              onClick={() => onChange({ avatarId: a.id, voiceId: a.default_voice_id || voiceId })}
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
      </div>
      {voices.length > 0 && (
        <div>
          <label htmlFor="lecture-voice" className="block text-sm font-semibold text-slate-700 mb-1.5">Voice</label>
          <div className="flex items-center gap-2">
            <select id="lecture-voice" value={voiceId} onChange={e => onChange({ avatarId, voiceId: e.target.value })} className="input-field text-sm flex-1">
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
    </div>
  );
}
