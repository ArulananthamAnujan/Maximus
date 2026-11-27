import React, { useRef, useState } from 'react';
import { Upload, FileText, ExternalLink, XCircle, Info, ChevronUp, ChevronDown, ClipboardList } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { resumableUpload } from '../../lib/resumableUpload';
import { useMediaUrl } from '../../hooks/useMediaUrl';

/* Lesson media helpers shared by the course builder and the lesson panel. */

interface UploadState {
  uploading: boolean;
  progress: number;
  fileName: string;
  fileSize: string;
  speed: string;
  uploaded: string;
  abortFn: (() => void) | null;
}

const EMPTY_UPLOAD: UploadState = {
  uploading: false, progress: 0, fileName: '', fileSize: '', speed: '', uploaded: '', abortFn: null,
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function VideoPlayer({ url: storedUrl }: { url: string }) {
  // Uploaded files are private; this swaps in a short-lived signed link.
  const url = useMediaUrl(storedUrl);
  const isYouTube = /youtube\.com|youtu\.be/.test(url);
  const isVimeo = /vimeo\.com/.test(url);

  if (isYouTube) {
    const videoId = url.match(/(?:v=|youtu\.be\/)([^&?\s]+)/)?.[1];
    if (!videoId) return null;
    const thumbnail = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
    return (
      <div className="w-full rounded-xl aspect-video border border-slate-200 bg-black relative overflow-hidden group">
        <img src={thumbnail} alt="Video thumbnail" className="w-full h-full object-cover opacity-80" />
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-semibold px-5 py-3 rounded-full shadow-lg transition-colors text-sm"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
            Watch on YouTube
          </a>
        </div>
      </div>
    );
  }

  if (isVimeo) {
    const videoId = url.match(/vimeo\.com\/(\d+)/)?.[1];
    if (!videoId) return null;
    return (
      <div className="w-full rounded-xl aspect-video border border-slate-200 bg-black relative overflow-hidden flex flex-col items-center justify-center gap-3">
        <svg className="w-12 h-12 text-blue-400" viewBox="0 0 24 24" fill="currentColor"><path d="M23.977 6.416c-.105 2.338-1.739 5.543-4.894 9.609-3.268 4.247-6.026 6.37-8.29 6.37-1.409 0-2.578-1.294-3.553-3.881L5.322 11.4C4.603 8.816 3.834 7.522 3.01 7.522c-.179 0-.806.378-1.881 1.132L0 7.197a315.065 315.065 0 0 0 3.501-3.128C5.08 2.701 6.266 1.984 7.055 1.91c1.867-.18 3.016 1.1 3.447 3.838.465 2.953.787 4.789.968 5.507.537 2.405 1.131 3.607 1.781 3.607.504 0 1.26-.795 2.273-2.383 1.012-1.589 1.553-2.797 1.621-3.62.144-1.365-.395-2.05-1.621-2.05-.578 0-1.167.132-1.77.396 1.177-3.851 3.424-5.722 6.763-5.637 2.466.06 3.63 1.664 3.461 4.848z"/></svg>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white font-semibold px-5 py-3 rounded-full shadow-lg transition-colors text-sm"
        >
          Watch on Vimeo
        </a>
      </div>
    );
  }

  if (!url) return <div className="w-full rounded-xl h-40 border border-slate-200 bg-black/90 flex items-center justify-center text-xs text-slate-400">Loading video…</div>;
  return <video src={url} controls className="w-full rounded-xl max-h-72 border border-slate-200 bg-black" />;
}

export function PDFViewer({ url: storedUrl }: { url: string }) {
  const url = useMediaUrl(storedUrl) || undefined;
  const filename = storedUrl.split('/').pop()?.split('?')[0] || 'Document';
  return (
    <div className="border border-slate-200 dark:border-navy-600 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 dark:bg-navy-800 border-b border-slate-200 dark:border-navy-600">
        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <FileText className="w-3.5 h-3.5 text-red-500" />
          <span className="truncate max-w-xs font-medium">{filename}</span>
        </div>
        <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-sky-600 dark:text-sky-400 hover:underline flex items-center gap-1 shrink-0 ml-2 font-semibold">
          <ExternalLink className="w-3 h-3" /> Open in New Tab
        </a>
      </div>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex flex-col items-center justify-center gap-3 py-10 px-6 hover:bg-slate-50 dark:hover:bg-navy-700/40 transition-colors cursor-pointer group"
      >
        <div className="w-16 h-20 bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800 rounded-lg flex flex-col items-center justify-center gap-1 group-hover:border-red-400 transition-colors">
          <FileText className="w-6 h-6 text-red-500" />
          <span className="text-xs font-bold text-red-600 dark:text-red-400 uppercase tracking-wider">PDF</span>
        </div>
        <p className="text-xs text-slate-400 dark:text-slate-500">Click to open the PDF in a new tab</p>
      </a>
    </div>
  );
}

export function UploadZone({ accept, bucket, path, onUploaded, label, icon: Icon, hint }: {
  accept: string; bucket: string; path: string;
  onUploaded: (url: string, fileName: string) => void;
  label: string; icon: typeof Upload; hint?: string;
}) {
  const [state, setState] = useState<UploadState>(EMPTY_UPLOAD);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const speedRef = useRef<{ lastBytes: number; lastTime: number }>({ lastBytes: 0, lastTime: Date.now() });

  const handleFile = async (file: File) => {
    if (!file) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { alert('Not authenticated'); return; }
    const ext = file.name.split('.').pop();
    const objectName = `${path}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
    speedRef.current = { lastBytes: 0, lastTime: Date.now() };
    const abortController = new AbortController();
    setState({ uploading: true, progress: 0, fileName: file.name, fileSize: formatBytes(file.size), speed: '', uploaded: '0 B', abortFn: () => { abortController.abort(); setState(EMPTY_UPLOAD); } });
    try {
      await resumableUpload({ file, bucket, objectName, accessToken: session.access_token, supabaseUrl, signal: abortController.signal,
        onProgress({ bytesUploaded, bytesTotal }) {
          const now = Date.now();
          const elapsed = (now - speedRef.current.lastTime) / 1000;
          const diff = bytesUploaded - speedRef.current.lastBytes;
          const speed = elapsed > 0 ? diff / elapsed : 0;
          speedRef.current = { lastBytes: bytesUploaded, lastTime: now };
          setState(s => ({ ...s, progress: Math.round((bytesUploaded / bytesTotal) * 100), uploaded: formatBytes(bytesUploaded), speed: speed > 0 ? `${formatBytes(speed)}/s` : s.speed }));
        },
      });
      const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(objectName);
      setState(EMPTY_UPLOAD);
      onUploaded(urlData.publicUrl, file.name);
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setState(EMPTY_UPLOAD);
      alert(`Upload failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  if (state.uploading) {
    return (
      <div className="border border-slate-200 rounded-xl p-4 bg-white">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 bg-sky-100 rounded-lg flex items-center justify-center shrink-0">
            <Icon className="w-4 h-4 text-sky-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-800 truncate">{state.fileName}</p>
            <p className="text-xs text-slate-400">{state.fileSize}</p>
          </div>
          {state.abortFn && (
            <button onClick={state.abortFn} className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 transition-colors" title="Cancel">
              <XCircle className="w-4 h-4" />
            </button>
          )}
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>{state.uploaded} of {state.fileSize}</span>
            <span className="font-semibold text-sky-600">{state.progress}%</span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-sky-400 to-sky-600 rounded-full transition-all duration-300" style={{ width: `${state.progress}%` }} />
          </div>
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Uploading...</span>
            {state.speed && <span>{state.speed}</span>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all duration-150 ${dragOver ? 'border-sky-400 bg-sky-50' : 'border-slate-200 hover:border-sky-300 hover:bg-sky-50/50'}`}
      onDragOver={e => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
      onClick={() => inputRef.current?.click()}
    >
      <input ref={inputRef} type="file" accept={accept} className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3 transition-colors ${dragOver ? 'bg-sky-100' : 'bg-slate-100'}`}>
        <Icon className={`w-5 h-5 ${dragOver ? 'text-sky-500' : 'text-slate-400'}`} />
      </div>
      <p className="text-sm font-semibold text-slate-700">{label}</p>
      <p className="text-xs text-slate-400 mt-1">Drag & drop or click to browse</p>
      {hint && <p className="text-xs text-slate-400 mt-0.5">{hint}</p>}
    </div>
  );
}

const VIDEO_HOSTS = [
  {
    name: 'YouTube',
    icon: '▶',
    bg: 'bg-red-50',
    border: 'border-red-100',
    iconColor: 'text-red-600',
    desc: 'Free, unlimited storage. Use Unlisted for private course videos.',
    tip: 'Paste the video URL or share link — it embeds automatically.',
    url: 'https://youtube.com',
  },
  {
    name: 'Vimeo',
    icon: '◈',
    bg: 'bg-sky-50',
    border: 'border-sky-100',
    iconColor: 'text-sky-600',
    desc: 'Ad-free, privacy controls, password protection. Ideal for paid courses.',
    tip: 'Use Vimeo Basic (free) or Pro for domain-locked embeds.',
    url: 'https://vimeo.com',
  },
  {
    name: 'Bunny.net',
    icon: '⚡',
    bg: 'bg-orange-50',
    border: 'border-orange-100',
    iconColor: 'text-orange-600',
    desc: 'Affordable CDN-powered video hosting. HLS streaming, fast globally.',
    tip: 'Upload to Bunny Stream, then paste the .m3u8 or iframe URL here.',
    url: 'https://bunny.net',
  },
  {
    name: 'Google Drive',
    icon: '◑',
    bg: 'bg-emerald-50',
    border: 'border-emerald-100',
    iconColor: 'text-emerald-600',
    desc: 'Easy for small setups. Share video as "Anyone with the link".',
    tip: 'Use the direct download link format for best playback compatibility.',
    url: 'https://drive.google.com',
  },
];

export function VideoHostingTips() {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-sky-100 bg-sky-50 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-sky-100/60 transition-colors"
      >
        <div className="w-5 h-5 bg-sky-100 rounded-md flex items-center justify-center shrink-0">
          <Info className="w-3 h-3 text-sky-600" />
        </div>
        <span className="text-xs font-semibold text-sky-700 flex-1">Recommended video hosting options</span>
        {open ? <ChevronUp className="w-3.5 h-3.5 text-sky-400" /> : <ChevronDown className="w-3.5 h-3.5 text-sky-400" />}
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1 grid grid-cols-2 gap-2.5">
          {VIDEO_HOSTS.map(host => (
            <a
              key={host.name}
              href={host.url}
              target="_blank"
              rel="noopener noreferrer"
              className={`rounded-xl border ${host.border} ${host.bg} p-3 flex flex-col gap-1 hover:shadow-sm transition-shadow group`}
            >
              <div className="flex items-center justify-between mb-0.5">
                <div className="flex items-center gap-1.5">
                  <span className={`text-base font-bold ${host.iconColor}`}>{host.icon}</span>
                  <span className="text-xs font-bold text-slate-800">{host.name}</span>
                </div>
                <ExternalLink className="w-3 h-3 text-slate-300 group-hover:text-slate-500 transition-colors" />
              </div>
              <p className="text-xs text-slate-600 leading-snug">{host.desc}</p>
              <p className="text-xs text-slate-400 leading-snug mt-0.5">{host.tip}</p>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

export function LessonActivitiesPanel({ lessonId }: { lessonId: string }) {
  const [items, setItems] = React.useState<Array<{ id: string; title: string; type: string; instructions: string; estimated_minutes: number }>>([]);
  const [loaded, setLoaded] = React.useState(false);

  React.useEffect(() => {
    supabase
      .from('lesson_activities')
      .select('id, title, type, instructions, estimated_minutes')
      .eq('lesson_id', lessonId)
      .order('order_index')
      .then(({ data }) => { setItems((data || []) as typeof items); setLoaded(true); });
  }, [lessonId]);

  if (!loaded || items.length === 0) return null;

  const typeColor: Record<string, string> = {
    practice: 'bg-blue-50 text-blue-700 border-blue-200',
    reflection: 'bg-violet-50 text-violet-700 border-violet-200',
    discussion: 'bg-amber-50 text-amber-700 border-amber-200',
    project: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    research: 'bg-sky-50 text-sky-700 border-sky-200',
  };

  return (
    <div className="space-y-2">
      <p className="text-xs font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
        <ClipboardList className="w-3.5 h-3.5" /> Activities ({items.length})
      </p>
      {items.map(a => (
        <div key={a.id} className={`rounded-lg border p-3 text-xs ${typeColor[a.type] || typeColor.practice}`}>
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="font-semibold">{a.title}</span>
            <span className="flex items-center gap-1 opacity-70 shrink-0">
              <span className="capitalize font-medium">{a.type}</span>
              {a.estimated_minutes > 0 && <span>· {a.estimated_minutes}m</span>}
            </span>
          </div>
          {a.instructions && <p className="leading-relaxed opacity-90">{a.instructions}</p>}
        </div>
      ))}
    </div>
  );
}

