import { useEffect, useRef, useState } from 'react';
import { X, Loader2, Film, Square, CheckCircle2, AlertTriangle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { resumableUpload } from '../../lib/resumableUpload';
import { composeLectureVideo, drawFrame, stepStarts, canCompose } from '../../lib/lectureCompositor';
import type { Board } from './LectureBoard';

const BUCKET = 'course-videos';

export interface ComposablePart {
  id: string;
  title: string;
  lesson_id: string;
  storage_path: string;
  board: Board;
}

interface Props {
  part: ComposablePart;
  courseId: string;
  heading: string;
  subheading?: string;
  onClose: () => void;
  onDone: () => void;
}

type Stage = 'preview' | 'recording' | 'uploading' | 'done' | 'error';

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** Makes the lecture video with the board inside it, in this browser, and puts it on the lesson. */

function minutesLabel(seconds: number) {
  const mins = Math.max(1, Math.round(seconds / 60));
  return `${mins} minute${mins === 1 ? '' : 's'}`;
}
export default function ComposeLectureModal({ part, courseId, heading, subheading, onClose, onDone }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [stage, setStage] = useState<Stage>('preview');
  const [videoUrl, setVideoUrl] = useState('');
  const [duration, setDuration] = useState(0);
  const [at, setAt] = useState(0);
  const [paused, setPaused] = useState(false);
  const [uploaded, setUploaded] = useState(0);
  const [error, setError] = useState('');
  const supported = canCompose();

  // Signed link to the original presenter video, and a still of the layout to preview
  useEffect(() => {
    let active = true;
    (async () => {
      const { data, error: e } = await supabase.storage.from(BUCKET).createSignedUrl(part.storage_path, 3 * 3600);
      if (!active) return;
      if (e || !data?.signedUrl) { setError('Could not open the presenter video.'); setStage('error'); return; }
      setVideoUrl(data.signedUrl);
      const video = document.createElement('video');
      video.crossOrigin = 'anonymous';
      video.muted = true;
      video.preload = 'auto';
      video.src = data.signedUrl;
      await new Promise<void>(r => { video.addEventListener('loadedmetadata', () => r(), { once: true }); video.addEventListener('error', () => r(), { once: true }); });
      if (!active || !video.duration) return;
      setDuration(video.duration);
      const starts = stepStarts(part.board, video.duration);
      const firstCode = part.board.steps.findIndex(s => s.kind === 'code');
      const i = firstCode >= 0 ? firstCode : 0;
      video.currentTime = Math.min(video.duration - 0.1, (starts[i] ?? 0) + Math.min(6, ((starts[i + 1] ?? video.duration) - (starts[i] ?? 0)) * 0.8));
      await new Promise<void>(r => video.addEventListener('seeked', () => r(), { once: true }));
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (active && canvas && ctx) {
        canvas.width = 1280;
        canvas.height = 720;
        drawFrame(ctx, video, part.board, starts, { title: heading, subtitle: subheading });
      }
    })().catch(() => {});
    return () => { active = false; };
  }, [part, heading, subheading]);

  // Leaving mid-way would lose the recording
  useEffect(() => {
    if (stage !== 'recording' && stage !== 'uploading') return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [stage]);

  const start = async () => {
    if (!canvasRef.current || !videoUrl) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setStage('recording');
    setError('');
    try {
      const file = await composeLectureVideo({
        videoUrl,
        board: part.board,
        info: { title: heading, subtitle: subheading },
        canvas: canvasRef.current,
        onProgress: (s, d) => { setAt(s); setDuration(d); },
        onPausedChange: setPaused,
        signal: controller.signal,
      });

      setStage('uploading');
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Please sign in again.');
      const ext = file.type === 'video/mp4' ? 'mp4' : 'webm';
      const objectName = `${courseId}/lecture-${part.id}-board-${Date.now()}.${ext}`;
      await resumableUpload({
        file, bucket: BUCKET, objectName, accessToken: session.access_token,
        supabaseUrl: import.meta.env.VITE_SUPABASE_URL as string,
        onProgress: ({ bytesUploaded, bytesTotal }) => setUploaded(Math.round((bytesUploaded / bytesTotal) * 100)),
      }).catch(err => {
        const text = err instanceof Error ? err.message : '';
        throw new Error(/413|too large|maximum allowed size/i.test(text)
          ? `The finished video (${Math.round(file.size / 1_048_576)} MB) is larger than your Supabase upload limit. Raise it in Supabase under Storage, Settings, "Upload file size limit", then try again.`
          : 'Could not upload the finished video. Please try again.');
      });
      const url = supabase.storage.from(BUCKET).getPublicUrl(objectName).data.publicUrl;

      // Put it on the lesson; the original stays in storage so it can be restored
      const { data: previous } = await supabase.from('lesson_boards').select('board').eq('lesson_id', part.lesson_id).maybeSingle();
      const oldComposite = (previous?.board as { composite_path?: string } | null)?.composite_path;
      const { error: lessonError } = await supabase.from('lessons').update({ url, video_url: url, video_storage_path: objectName }).eq('id', part.lesson_id);
      if (lessonError) throw new Error('The video was made but could not be put on the lesson.');
      await supabase.from('lesson_boards').upsert({
        lesson_id: part.lesson_id, course_id: courseId,
        board: { ...part.board, embedded: true, composite_path: objectName, original_path: part.storage_path },
        updated_at: new Date().toISOString(),
      });
      if (oldComposite && oldComposite !== objectName) await supabase.storage.from(BUCKET).remove([oldComposite]).catch(() => {});
      setStage('done');
      onDone();
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') { setStage('preview'); return; }
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setStage('error');
    } finally {
      abortRef.current = null;
    }
  };

  const busy = stage === 'recording' || stage === 'uploading';
  const pct = duration ? Math.min(100, Math.round((at / duration) * 100)) : 0;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-2 sm:p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={busy ? undefined : onClose} />
      <div role="dialog" aria-modal="true" aria-labelledby="compose-title" className="relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[96vh] flex flex-col">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
          <div className="w-9 h-9 bg-sky-100 rounded-xl flex items-center justify-center shrink-0"><Film className="w-4 h-4 text-sky-600" /></div>
          <div className="flex-1 min-w-0">
            <h3 id="compose-title" className="font-bold text-slate-900">Put the board inside the video</h3>
            <p className="text-xs text-slate-500 truncate">{part.title}</p>
          </div>
          {!busy && <button onClick={onClose} aria-label="Close" className="p-2 rounded-lg text-slate-400 hover:bg-slate-100"><X className="w-4 h-4" /></button>}
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <canvas ref={canvasRef} width={1280} height={720} className="w-full aspect-video rounded-xl bg-slate-900" aria-label="Preview of the lecture with the board" />

          {stage === 'preview' && (
            <div className="text-sm text-slate-700 space-y-2">
              <p>This is how the lecture will look: the presenter on their own at the start, then your materials on the left and the presenter on the right while they teach.</p>
              <p className="text-xs text-slate-500">
                Making it plays the lecture once in this tab{duration ? `, about ${minutesLabel(duration)}` : ''}, and records it. Keep this tab open and in front until it finishes. Nothing is charged. The original video is kept, so you can switch back.
              </p>
              {!supported && <p role="alert" className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">This browser cannot record video. Please use a recent version of Chrome or Edge on a computer.</p>}
            </div>
          )}

          {stage === 'recording' && (
            <div className="space-y-2" aria-live="polite">
              <p className="text-sm font-semibold text-slate-800">{paused ? 'Waiting: bring this tab back to the front to continue' : `Recording… ${mmss(at)} of ${mmss(duration)}`}</p>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-sky-500 transition-all" style={{ width: `${pct}%` }} /></div>
              <p className="text-xs text-slate-500">Keep this tab open and in front. It is recorded as it plays, so it takes as long as the lecture.</p>
            </div>
          )}

          {stage === 'uploading' && (
            <div className="space-y-2" aria-live="polite">
              <p className="text-sm font-semibold text-slate-800 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Saving the video to your course… {uploaded}%</p>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-emerald-500 transition-all" style={{ width: `${uploaded}%` }} /></div>
            </div>
          )}

          {stage === 'done' && (
            <p className="flex items-center gap-2 text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
              <CheckCircle2 className="w-4 h-4 shrink-0" /> Done. The lesson now plays the lecture with the board inside it.
            </p>
          )}

          {stage === 'error' && (
            <p role="alert" className="flex items-start gap-2 text-sm text-red-800 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {error}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100">
          {stage === 'recording' ? (
            <button onClick={() => abortRef.current?.abort()} className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold border border-slate-300 rounded-xl text-slate-700 hover:bg-slate-50">
              <Square className="w-3.5 h-3.5" /> Stop
            </button>
          ) : stage === 'done' ? (
            <button onClick={onClose} className="px-5 py-2.5 bg-sky-600 hover:bg-sky-700 text-white text-sm font-bold rounded-xl">Close</button>
          ) : stage !== 'uploading' && (
            <>
              <button onClick={onClose} className="px-4 py-2 text-sm border border-slate-200 rounded-xl text-slate-700">Cancel</button>
              <button onClick={start} disabled={!supported || !videoUrl} className="flex items-center gap-2 px-5 py-2.5 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-sm font-bold rounded-xl">
                <Film className="w-4 h-4" /> {stage === 'error' ? 'Try again' : 'Make the video'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
