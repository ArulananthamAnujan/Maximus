import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Plus, Trash2, GripVertical, ChevronDown, ChevronUp, Video, FileText,
  Link as LinkIcon, BookOpen, Save, Settings, Layers, HelpCircle, Calendar,
  Clock, CheckCircle, AlertCircle, Pencil, Upload, X, Eye,
  PlayCircle, ExternalLink, XCircle, ChevronRight, Image, DollarSign,
  Globe, Lock, Award, BarChart2, AlignLeft, Info, Check, Sparkles,
  LayoutList, ClipboardList,
} from 'lucide-react';
import { resumableUpload } from '../../lib/resumableUpload';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import type { NavItem } from '../../components/layout/DashboardLayout';
import type { Course, Section, Lesson, Quiz, QuizQuestion } from '../../types';

const AICourseGeneratorModal = lazy(() => import('../../components/ai/AICourseGeneratorModal'));
const AILessonToolbar = lazy(() => import('../../components/ai/AILessonToolbar'));
const LessonDocumentViewer = lazy(() => import('../../components/ui/LessonDocumentViewer').then(m => ({ default: m.default })));
import { LessonDocumentBadges } from '../../components/ui/LessonDocumentViewer';
const AIQuizGeneratorModal = lazy(() => import('../../components/ai/AIQuizGeneratorModal'));
const FlashcardsManager = lazy(() => import('../../components/ai/FlashcardsManager'));

// Maps both UI type names and DB type names
const LESSON_ICONS: Record<string, typeof Video> = {
  video: Video, pdf: FileText, article: AlignLeft, link: LinkIcon,
  text: AlignLeft, file: FileText, quiz: HelpCircle,
};
const LESSON_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  video:   { bg: 'bg-sky-100',   text: 'text-sky-600',   border: 'border-sky-200' },
  pdf:     { bg: 'bg-red-100',   text: 'text-red-600',   border: 'border-red-200' },
  file:    { bg: 'bg-red-100',   text: 'text-red-600',   border: 'border-red-200' },
  article: { bg: 'bg-green-100', text: 'text-green-600', border: 'border-green-200' },
  text:    { bg: 'bg-green-100', text: 'text-green-600', border: 'border-green-200' },
  link:    { bg: 'bg-slate-100', text: 'text-slate-500',  border: 'border-slate-200' },
  quiz:    { bg: 'bg-sky-100',   text: 'text-sky-600',   border: 'border-sky-200' },
};
const getLessonIcon = (type: string) => LESSON_ICONS[type] || FileText;
const getLessonColors = (type: string) => LESSON_COLORS[type] || LESSON_COLORS.text;

type Tab = 'details' | 'curriculum' | 'quizzes' | 'exams' | 'flashcards';

interface ExamQuestion { id: string; question: string; marks: number; sample_answer: string; order_index: number; }
interface Exam { id: string; course_id: string; title: string; description: string; instructions: string; passage: string; time_limit_minutes: number; total_marks: number; is_published: boolean; questions: ExamQuestion[]; }

interface CourseBuilderProps {
  navItems: NavItem[];
  role: 'admin' | 'teacher';
}

interface QuizWithQuestions extends Quiz {
  questions?: QuizQuestion[];
}

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

function VideoPlayer({ url }: { url: string }) {
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

  return <video src={url} controls className="w-full rounded-xl max-h-72 border border-slate-200 bg-black" />;
}

function PDFViewer({ url }: { url: string }) {
  const filename = url.split('/').pop()?.split('?')[0] || 'Document';
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

function UploadZone({ accept, bucket, path, onUploaded, label, icon: Icon, hint }: {
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

function VideoHostingTips() {
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

function LessonActivitiesPanel({ lessonId }: { lessonId: string }) {
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
    <div className="mx-4 mb-4 mt-1 space-y-2">
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

function SectionCard({ section, sIdx, expanded, onToggle, onRename, onDelete, onAddLesson, onGenerateDocs, generatingDocs, children }: {
  section: Section & { lessons: Lesson[] };
  sIdx: number;
  expanded: boolean;
  onToggle: () => void;
  onRename: () => void;
  onDelete: () => void;
  onAddLesson: () => void;
  onGenerateDocs: () => void;
  generatingDocs: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="lms-panel">
      <div className="flex items-center gap-3 px-4 py-3.5 bg-slate-50 border-b border-slate-100">
        <div className="cursor-grab text-slate-300 hover:text-slate-400">
          <GripVertical className="w-4 h-4" />
        </div>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-sky-100 text-sky-700 text-xs font-bold shrink-0">{sIdx + 1}</span>
          <span className="font-semibold text-slate-800 truncate">{section.title}</span>
          <span className="text-xs text-slate-400 shrink-0">{section.lessons?.length || 0} lesson{(section.lessons?.length || 0) !== 1 ? 's' : ''}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={onGenerateDocs}
            disabled={generatingDocs || section.lessons?.length === 0}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-all disabled:opacity-50 bg-white border-blue-300 text-blue-700 hover:bg-blue-50"
            title="Generate lesson notes & slides for this section"
          >
            {generatingDocs
              ? <><div className="w-3 h-3 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin" /> Generating...</>
              : <><Sparkles className="w-3 h-3" /> Notes &amp; Slides</>}
          </button>
          <button onClick={onRename} className="p-1.5 rounded-lg text-slate-400 hover:text-sky-600 hover:bg-sky-50 transition-colors" title="Rename section">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button onClick={onDelete} className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors" title="Delete section">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button onClick={onToggle} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors ml-1">
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {expanded && (
        <div>
          {children}
          <button
            onClick={onAddLesson}
            className="flex items-center gap-2 w-full px-5 py-3.5 text-sm font-medium text-sky-600 hover:bg-sky-50 transition-colors border-t border-dashed border-slate-200"
          >
            <Plus className="w-4 h-4" />
            Add Lesson
          </button>
        </div>
      )}
    </div>
  );
}

export default function CourseBuilder({ navItems, role }: CourseBuilderProps) {
  const [searchParams] = useSearchParams();
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<string>(searchParams.get('courseId') || '');
  const [courseData, setCourseData] = useState<Partial<Course & { start_date?: string; end_date?: string; duration_weeks?: number }>>({});
  const [sections, setSections] = useState<(Section & { lessons: Lesson[] })[]>([]);
  const [quizzes, setQuizzes] = useState<QuizWithQuestions[]>([]);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [expandedQuiz, setExpandedQuiz] = useState<string | null>(null);

  // Exams state
  const [exams, setExams] = useState<Exam[]>([]);
  const [expandedExam, setExpandedExam] = useState<string | null>(null);
  const [showExamCreate, setShowExamCreate] = useState(false);
  const [examForm, setExamForm] = useState({ title: '', description: '', instructions: 'Read the passage carefully and answer all questions in full sentences.', passage: '', time_limit_minutes: '60' });
  const [examQuestions, setExamQuestions] = useState<{ question: string; marks: number; sample_answer: string }[]>([{ question: '', marks: 5, sample_answer: '' }]);
  const [savingExam, setSavingExam] = useState(false);
  const [showAIExamGenerator, setShowAIExamGenerator] = useState(false);
  const [aiExamForm, setAIExamForm] = useState({ topic: '', exam_type: 'reading_comprehension' as 'reading_comprehension' | 'question_only', difficulty: 'intermediate', num_questions: 5, marks_per_question: 5, target_audience: '', extra_instructions: '' });
  const [generatingExam, setGeneratingExam] = useState(false);
  const [previewLesson, setPreviewLesson] = useState<Lesson | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('details');
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'section' | 'lesson' | 'quiz' | 'question'; id: string; name: string } | null>(null);

  const [showAIGenerator, setShowAIGenerator] = useState(false);
  const [flashcardsLessonId, setFlashcardsLessonId] = useState<string>('');
  const [flashcardsList, setFlashcardsList] = useState<Array<{ id: string; front: string; back: string; order_index: number }>>([]);
  const [aiQuizTarget, setAiQuizTarget] = useState<string | null>(null);

  // Dynamic categories
  const [categories, setCategories] = useState<string[]>([]);
  const [newCategoryInput, setNewCategoryInput] = useState('');
  const [showNewCategory, setShowNewCategory] = useState(false);

  // AI Curriculum Generator
  const [showAICurriculumPanel, setShowAICurriculumPanel] = useState(false);
  const [aiCurriculumStep, setAICurriculumStep] = useState<'form' | 'loading' | 'preview'>('form');
  const [aiCurriculumForm, setAICurriculumForm] = useState({ topic: '', target_audience: 'general', difficulty: 'beginner', num_sections: 3, lessons_per_section: 3, use_existing_context: true });
  const [aiCurriculumPreview, setAICurriculumPreview] = useState<import('../../lib/ai').AICurriculumSection[]>([]);
  const [aiCurriculumInserting, setAICurriculumInserting] = useState(false);
  const [aiCurriculumInsertStatus, setAICurriculumInsertStatus] = useState('');
  const [aiCurriculumExpanded, setAICurriculumExpanded] = useState<number | null>(0);
  // Background AI content generation (phase 2 — runs after panel closes)
  const [bgGenStatus, setBgGenStatus] = useState<{ total: number; done: number; current: string; errors: number } | null>(null);
  // Batch curriculum generation progress
  const [curriculumGenProgress, setCurriculumGenProgress] = useState<{ done: number; total: number } | null>(null);

  // AI Quiz from Curriculum
  const [showAIQuizFromCurriculum, setShowAIQuizFromCurriculum] = useState(false);
  const [aiQuizNewName, setAIQuizNewName] = useState('');
  const [aiQuizCreating, setAIQuizCreating] = useState(false);

  const [addingSection, setAddingSection] = useState(false);
  const [sectionTitle, setSectionTitle] = useState('');
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [editingSectionTitle, setEditingSectionTitle] = useState('');

  const [addingLessonTo, setAddingLessonTo] = useState<string | null>(null);
  const [lessonForm, setLessonForm] = useState({
    title: '', type: 'video' as 'video' | 'pdf' | 'article' | 'link',
    content: '', url: '', duration_minutes: 10, is_preview: false, is_required: true,
  });

  // Lesson document panel (notes/slides visible without edit mode)
  const [expandedDocsLessonId, setExpandedDocsLessonId] = useState<string | null>(null);
  // Per-section PDF & PPT generation
  const [generatingSectionDocsId, setGeneratingSectionDocsId] = useState<string | null>(null);
  // Guard against state updates after unmount
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  // Inline lesson editing
  const [editingLessonId, setEditingLessonId] = useState<string | null>(null);
  const [editLessonForm, setEditLessonForm] = useState({
    title: '', type: 'video' as 'video' | 'pdf' | 'article' | 'link' | 'text' | 'file',
    content: '', url: '', duration_minutes: 10, is_preview: false, is_required: true,
  });

  const [showQuizCreate, setShowQuizCreate] = useState(false);
  const [quizForm, setQuizForm] = useState({ title: '', description: '', time_limit_minutes: '', pass_mark: 70, max_attempts: 3 });
  const [addingQuestionTo, setAddingQuestionTo] = useState<string | null>(null);
  const [questionForm, setQuestionForm] = useState({
    question: '', type: 'mcq' as 'mcq' | 'true_false' | 'short_answer',
    options: ['', '', '', ''], correct_answer: '', points: 1,
  });

  const { profile } = useAuth();
  const { toast } = useToast();

  const fetchCourses = async () => {
    if (!profile) return;
    let query = supabase.from('courses').select('*');
    if (role === 'teacher') query = query.eq('teacher_id', profile.id);
    const { data } = await query.order('title');
    if (data) setCourses(data as Course[]);
    setLoading(false);
  };

  const fetchSections = async () => {
    if (!selectedCourse) { setSections([]); return; }
    const { data } = await supabase.from('sections').select('*, lessons(*)').eq('course_id', selectedCourse).order('order_index');
    if (data) {
      const sorted = data.map((s: Section & { lessons: Lesson[] }) => ({
        ...s, lessons: [...(s.lessons || [])].sort((a, b) => a.order_index - b.order_index),
      }));
      setSections(sorted as (Section & { lessons: Lesson[] })[]);
      setExpandedSections(new Set(sorted.map((s: Section) => s.id)));
    }
  };

  const fetchQuizzes = async () => {
    if (!selectedCourse) { setQuizzes([]); return; }
    const { data } = await supabase.from('quizzes').select('*, questions:quiz_questions(*)').eq('course_id', selectedCourse).order('created_at');
    if (data) setQuizzes(data as QuizWithQuestions[]);
  };

  const fetchExams = async () => {
    if (!selectedCourse) { setExams([]); return; }
    const { data } = await supabase.from('exams').select('*, questions:exam_questions(*)').eq('course_id', selectedCourse).order('created_at');
    if (data) setExams(data.map(e => ({ ...e, questions: [...(e.questions || [])].sort((a, b) => a.order_index - b.order_index) })) as Exam[]);
  };

  const fetchFlashcards = async (lessonId: string) => {
    const { data } = await supabase.from('flashcards').select('*').eq('lesson_id', lessonId).order('order_index');
    setFlashcardsList((data || []) as Array<{ id: string; front: string; back: string; order_index: number }>);
  };

  const handleAIGenerateCurriculum = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCourse) return;
    setAICurriculumStep('loading');
    setCurriculumGenProgress(null);

    try {
      const { generateFullCurriculum } = await import('../../lib/ai');

      const totalSections = aiCurriculumForm.num_sections;
      // Max 4 sections per AI call to keep response size reliable and avoid timeouts
      const BATCH_SIZE = 4;
      const allSections: import('../../lib/ai').AICurriculumSection[] = [];

      const baseExistingSummary = aiCurriculumForm.use_existing_context && sections.length > 0
        ? sections.map((s, i) => {
            const lessonTitles = (s.lessons || []).map(l => l.title).join(', ');
            return `Week/Section ${i + 1}: "${s.title}"${lessonTitles ? ` — Lessons: ${lessonTitles}` : ''}`;
          }).join('\n')
        : '';

      const totalBatches = Math.ceil(totalSections / BATCH_SIZE);
      setCurriculumGenProgress({ done: 0, total: totalBatches });

      for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
        const sectionsInThisBatch = Math.min(BATCH_SIZE, totalSections - batchIdx * BATCH_SIZE);

        // Build rolling context from what's already been generated
        const alreadyGeneratedSummary = allSections.length > 0
          ? allSections.map((s, i) => {
              const lessonTitles = (s.lessons || []).map(l => l.title).join(', ');
              return `Week/Section ${i + 1}: "${s.title}" — Lessons: ${lessonTitles}`;
            }).join('\n')
          : '';

        const existingSummaryParts = [baseExistingSummary, alreadyGeneratedSummary].filter(Boolean);
        const existingSummary = existingSummaryParts.length > 0 ? existingSummaryParts.join('\n') : undefined;

        const result = await generateFullCurriculum({
          topic: aiCurriculumForm.topic,
          target_audience: aiCurriculumForm.target_audience,
          difficulty: aiCurriculumForm.difficulty,
          num_sections: sectionsInThisBatch,
          lessons_per_section: aiCurriculumForm.lessons_per_section,
          existing_sections_summary: existingSummary,
        });

        const batchSections = Array.isArray(result?.sections) ? result.sections : [];
        if (batchSections.length === 0) {
          throw new Error(`Batch ${batchIdx + 1} returned no sections. Please try again.`);
        }
        allSections.push(...batchSections);
        setCurriculumGenProgress({ done: batchIdx + 1, total: totalBatches });
      }

      if (allSections.length === 0) {
        toast.error('AI returned an empty curriculum. Please try again.');
        setAICurriculumStep('form');
        setCurriculumGenProgress(null);
        return;
      }

      setAICurriculumPreview(allSections);
      setAICurriculumExpanded(0);
      setAICurriculumStep('preview');
      setCurriculumGenProgress(null);
    } catch (err) {
      console.error('Curriculum generation error:', err);
      toast.error(err instanceof Error ? err.message : 'AI generation failed. Please try again.');
      setAICurriculumStep('form');
      setCurriculumGenProgress(null);
    }
  };

  const handleAICurriculumInsert = async () => {
    if (!selectedCourse || !profile) return;
    setAICurriculumInserting(true);
    setAICurriculumInsertStatus('Creating course structure...');

    // ── PHASE 1: Insert all DB records (sections, lessons, quizzes, activities) ──
    // This is fast (pure DB ops) and must complete before we close the panel.
    type SectionBuild = {
      sec: import('../../lib/ai').AICurriculumSection;
      lessons: Array<{ id: string; title: string }>;
      courseId: string;
      courseName: string;
    };

    const sectionBuilds: SectionBuild[] = [];

    try {
      const courseName = courses.find(c => c.id === selectedCourse)?.title || aiCurriculumForm.topic;
      const startIdx = sections.length;
      const totalSections = aiCurriculumPreview.length;

      for (let i = 0; i < totalSections; i++) {
        const sec = aiCurriculumPreview[i];
        setAICurriculumInsertStatus(`Creating structure ${i + 1}/${totalSections}: "${sec.title}"...`);

        const { data: sectionData, error: sectionErr } = await supabase
          .from('sections')
          .insert({ course_id: selectedCourse, title: sec.title, order_index: startIdx + i })
          .select('id')
          .single();
        if (sectionErr || !sectionData) {
          console.error('Section insert error:', sectionErr);
          continue;
        }

        // Insert lessons
        const lessonRows = (sec.lessons || []).map((l, li) => ({
          section_id: sectionData.id,
          course_id: selectedCourse,
          title: l.title,
          type: l.type === 'document' ? 'file' : 'text',
          lesson_type: l.type === 'document' ? 'file' : 'text',
          content: '',
          duration_minutes: l.estimated_duration_minutes || 60,
          order_index: li,
          is_preview: false,
        }));
        let insertedLessons: Array<{ id: string; title: string }> = [];
        if (lessonRows.length > 0) {
          const { data: lessonData, error: lessonErr } = await supabase
            .from('lessons').insert(lessonRows).select('id, title');
          if (!lessonErr && lessonData) insertedLessons = lessonData;
        }

        // Insert quiz
        if (sec.quiz?.questions?.length) {
          const { data: quizData, error: quizErr } = await supabase.from('quizzes').insert({
            course_id: selectedCourse,
            title: sec.quiz.title,
            pass_mark: 70,
            pass_percentage: 70,
            max_attempts: 3,
            is_published: true,
          }).select('id').single();
          if (!quizErr && quizData) {
            const questionRows = sec.quiz.questions.map((q, qi) => {
              const opts: string[] = q.options?.length ? q.options : ['True', 'False'];
              const correctIdx = opts.findIndex(o => o === q.correct_answer);
              return {
                quiz_id: quizData.id,
                question: q.question,
                type: q.type,
                options: opts,
                correct_answer: correctIdx >= 0 ? correctIdx : 0,
                correct_answer_text: q.correct_answer,
                explanation: q.explanation || '',
                points: q.points || 1,
                order_index: qi,
              };
            });
            await supabase.from('quiz_questions').insert(questionRows);
          }
        }

        // Insert activities
        if (sec.activities?.length && insertedLessons.length > 0) {
          const activityRows = sec.activities.map((a, ai) => ({
            lesson_id: insertedLessons[0].id,
            course_id: selectedCourse,
            title: a.title,
            type: a.type,
            instructions: a.instructions,
            estimated_minutes: a.estimated_minutes,
            order_index: ai,
          }));
          await supabase.from('lesson_activities').insert(activityRows);
        }

        sectionBuilds.push({ sec, lessons: insertedLessons, courseId: selectedCourse, courseName });
      }

      // Phase 1 complete — close panel and show curriculum immediately
      toast.success(`${totalSections} sections created! Generating notes & slides in background...`);
      setShowAICurriculumPanel(false);
      setAICurriculumStep('form');
      setAICurriculumPreview([]);
      setAICurriculumInsertStatus('');
      setAICurriculumForm({ topic: '', target_audience: 'general', difficulty: 'beginner', num_sections: 3, lessons_per_section: 3, use_existing_context: true });
      setAICurriculumInserting(false);

      try { await fetchSections(); } catch { /* non-fatal */ }
      try { await fetchQuizzes(); } catch { /* non-fatal */ }
      setActiveTab('curriculum');

    } catch (err) {
      console.error('Curriculum structure insert error:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to create course structure. Please try again.');
      setAICurriculumInsertStatus('');
      setAICurriculumStep('preview');
      setAICurriculumInserting(false);
      return;
    }

    // ── PHASE 2: Generate AI notes + slides in background (non-blocking) ──
    // Panel is already closed. Failures here show a banner but NEVER cause a white screen.
    if (sectionBuilds.length === 0) return;

    setBgGenStatus({ total: sectionBuilds.length, done: 0, current: sectionBuilds[0].sec.title, errors: 0 });

    (async () => {
      const { generateSectionNotes, generateSectionSlides } = await import('../../lib/ai');
      let errors = 0;

      for (let i = 0; i < sectionBuilds.length; i++) {
        if (!mountedRef.current) return;
        const { sec, lessons, courseId, courseName } = sectionBuilds[i];

        if (mountedRef.current) setBgGenStatus(prev => prev ? { ...prev, done: i, current: sec.title } : null);
        if (i > 0) await new Promise(r => setTimeout(r, 300));

        try {
          const sectionLessons = sec.lessons || [];
          const sectionInput = {
            section_title: sec.title,
            course_title: courseName,
            lessons: sectionLessons.map(l => ({ title: l.title, description: '' })),
            target_audience: aiCurriculumForm.target_audience,
            difficulty: aiCurriculumForm.difficulty,
          };

          // One call for all notes + one call for slides — 2 calls per section total
          const [notesResult, slidesResult] = await Promise.allSettled([
            generateSectionNotes(sectionInput),
            generateSectionSlides(sectionInput),
          ]);

          if (!mountedRef.current) return;

          const docRows: Array<{ lesson_id: string; course_id: string; type: string; title: string; content_html: string; order_index: number }> = [];
          const lessonUpdates: Array<{ id: string; content: string }> = [];

          if (notesResult.status === 'fulfilled' && notesResult.value?.lessons?.length) {
            for (const lessonNote of notesResult.value.lessons) {
              const matchedLesson = sectionLessons.find(l =>
                l.title.toLowerCase().trim() === lessonNote.lesson_title?.toLowerCase().trim()
              ) || sectionLessons[notesResult.value.lessons.indexOf(lessonNote)];
              if (matchedLesson && lessonNote.notes_html) {
                lessonUpdates.push({ id: matchedLesson.id, content: lessonNote.notes_html });
                docRows.push({ lesson_id: matchedLesson.id, course_id: courseId, type: 'notes', title: `${matchedLesson.title} — Notes`, content_html: lessonNote.notes_html, order_index: 0 });
              }
            }
          }

          if (slidesResult.status === 'fulfilled' && slidesResult.value?.slides?.length && lessons.length > 0) {
            const slidesHtml = slidesResult.value.slides.map(s =>
              `<section class="slide" data-slide="${s.slide_number}"><h2>${s.heading}</h2>${s.content_html}${s.speaker_notes ? `<aside class="speaker-notes"><strong>Speaker notes:</strong> ${s.speaker_notes}</aside>` : ''}</section>`
            ).join('\n');
            docRows.push({ lesson_id: lessons[0].id, course_id: courseId, type: 'slides', title: slidesResult.value.slides_title || `${sec.title} — Slides`, content_html: `<div class="slides-deck">${slidesHtml}</div>`, order_index: 1 });
          }

          if (!mountedRef.current) return;

          if (docRows.length > 0) {
            Promise.allSettled(lessonUpdates.map(u => supabase.from('lessons').update({ content: u.content }).eq('id', u.id))).catch(() => {});
            await supabase.from('lesson_documents').insert(docRows);
          } else {
            errors++;
          }
        } catch (secErr) {
          console.warn(`Section "${sec.title}" failed:`, secErr);
          errors++;
        }

        if (mountedRef.current) setBgGenStatus(prev => prev ? { ...prev, done: i + 1, errors } : null);
      }

      if (!mountedRef.current) return;

      if (errors === 0) {
        toast.success('All notes and slides have been generated successfully.');
      } else {
        toast.error(`${sectionBuilds.length - errors} of ${sectionBuilds.length} sections generated. Click "Notes & Slides" to retry failed sections.`);
      }
      setBgGenStatus(null);

      try { await fetchSections(); } catch { /* non-fatal */ }
    })().catch(err => {
      console.error('Background generation crashed:', err);
      if (mountedRef.current) {
        setBgGenStatus(null);
        toast.error('Generation stopped unexpectedly. Please click "Notes & Slides" to retry.');
      }
    });
  };

  // Generate notes + slides for ALL sections in the course (called from any section's button)
  // Generate notes (one per lesson, sequentially) + slides for ONE section
  const handleGenerateSectionDocs = (section: Section & { lessons: Lesson[] }) => {
    if (!selectedCourse || generatingSectionDocsId) return;
    if (!section.lessons?.length) {
      toast.error('Add lessons to this section before generating.');
      return;
    }

    const courseId = selectedCourse;
    const courseName = courses.find(c => c.id === courseId)?.title || '';
    // total steps = one per lesson + one slides call
    const total = section.lessons.length + 1;

    setGeneratingSectionDocsId(section.id);
    setBgGenStatus({ total, done: 0, current: `Starting…`, errors: 0 });

    (async () => {
      const { generateLessonNotes, generateSectionSlides } = await import('../../lib/ai');
      if (!mountedRef.current) return;

      const lessonIds = section.lessons.map(l => l.id);
      const docRows: Array<{ lesson_id: string; course_id: string; type: string; title: string; content_html: string; order_index: number }> = [];

      // ── Notes: sequential (one at a time) to avoid concurrent parse failures ─
      let notesGenerated = 0;
      for (let i = 0; i < section.lessons.length; i++) {
        if (!mountedRef.current) return;
        const lesson = section.lessons[i];
        setBgGenStatus(prev => prev ? { ...prev, done: i, current: `Generating notes: ${lesson.title}` } : null);

        let html: string | null = null;
        // Try up to 3 times per lesson
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const r = await generateLessonNotes({
              lesson_title: lesson.title,
              section_title: section.title,
              course_title: courseName,
              target_audience: 'general',
              difficulty: 'intermediate',
            });
            if (r?.content_html?.trim()) { html = r.content_html; break; }
          } catch (err) {
            console.warn(`Notes attempt ${attempt + 1} failed for "${lesson.title}":`, err);
            if (attempt < 2) await new Promise(res => setTimeout(res, 2000));
          }
        }

        if (html) {
          docRows.push({
            lesson_id: lesson.id,
            course_id: courseId,
            type: 'notes',
            title: `${lesson.title} — Notes`,
            content_html: html,
            order_index: 0,
          });
          supabase.from('lessons').update({ content: html }).eq('id', lesson.id).then(() => {}).catch(() => {});
          notesGenerated++;
        }
      }

      if (!mountedRef.current) return;
      setBgGenStatus(prev => prev ? { ...prev, done: section.lessons.length, current: `Generating slides…` } : null);

      // ── Slides: one call covering the whole section ────────────────────────
      let slidesOk = false;
      try {
        const slidesData = await generateSectionSlides({
          section_title: section.title,
          course_title: courseName,
          lessons: section.lessons.map(l => ({ title: l.title, description: '' })),
          target_audience: 'general',
          difficulty: 'intermediate',
        });
        if (slidesData?.slides?.length) {
          const slidesHtml = slidesData.slides.map(s =>
            `<section class="slide" data-slide="${s.slide_number}"><h2>${s.heading}</h2>${s.content_html}${s.speaker_notes ? `<aside class="speaker-notes"><strong>Speaker notes:</strong> ${s.speaker_notes}</aside>` : ''}</section>`
          ).join('\n');
          docRows.push({
            lesson_id: section.lessons[0].id,
            course_id: courseId,
            type: 'slides',
            title: slidesData.slides_title || `${section.title} — Slides`,
            content_html: `<div class="slides-deck">${slidesHtml}</div>`,
            order_index: 1,
          });
          slidesOk = true;
        }
      } catch (err) {
        console.warn(`Slides failed for "${section.title}":`, err);
      }

      if (!mountedRef.current) return;

      // ── Persist ────────────────────────────────────────────────────────────
      if (docRows.length > 0) {
        try {
          await supabase.from('lesson_documents').delete().in('lesson_id', lessonIds);
          await supabase.from('lesson_documents').insert(docRows);
          const parts: string[] = [];
          if (notesGenerated > 0) parts.push(`notes for ${notesGenerated}/${section.lessons.length} lessons`);
          if (slidesOk) parts.push('slides');
          toast.success(`Generated ${parts.join(' & ')} — ${section.title}`);
        } catch (dbErr) {
          console.error('Failed to save documents:', dbErr);
          toast.error('Generated content but failed to save — please try again.');
        }
      } else {
        toast.error(`Could not generate content for "${section.title}". Please try again.`);
      }

      if (mountedRef.current) {
        setBgGenStatus(prev => prev ? { ...prev, done: total } : null);
        setTimeout(() => {
          if (mountedRef.current) {
            setBgGenStatus(null);
            setGeneratingSectionDocsId(null);
          }
        }, 800);
      }
    })().catch(err => {
      console.error('handleGenerateSectionDocs crashed:', err);
      if (mountedRef.current) {
        setBgGenStatus(null);
        setGeneratingSectionDocsId(null);
        toast.error('Generation failed unexpectedly — please try again.');
      }
    });
  };

  const handleAIQuizFromCurriculum = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiQuizNewName.trim() || !selectedCourse) return;
    setAIQuizCreating(true);
    try {
      const { data, error } = await supabase
        .from('quizzes')
        .insert({ course_id: selectedCourse, title: aiQuizNewName.trim(), pass_mark: 70, pass_percentage: 70, max_attempts: 3, is_published: true })
        .select('id')
        .single();
      if (error || !data) throw error || new Error('Failed to create quiz');
      await fetchQuizzes();
      setAiQuizTarget(data.id);
      setShowAIQuizFromCurriculum(false);
      setAIQuizNewName('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create quiz');
    } finally {
      setAIQuizCreating(false);
    }
  };

  const loadCourseData = () => {
    const c = courses.find(c => c.id === selectedCourse);
    if (c) setCourseData(c as typeof courseData);
  };

  useEffect(() => {
    fetchCourses();
    supabase.from('course_categories').select('name').eq('is_active', true).order('sort_order').then(({ data }) => {
      if (data) setCategories(data.map(c => c.name));
    });
  }, [profile]);
  useEffect(() => {
    if (selectedCourse) { fetchSections(); fetchQuizzes(); fetchExams(); loadCourseData(); }
  }, [selectedCourse, courses]);

  const handleSaveDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCourse) return;
    setSaving(true);
    const isFree = Boolean(courseData.is_free);
    const { error } = await supabase.from('courses').update({
      title: courseData.title,
      short_description: courseData.short_description,
      description: courseData.description,
      category: courseData.category,
      level: courseData.level,
      price: isFree ? 0 : (courseData.price ?? 0),
      price_amount: isFree ? 0 : (courseData.price ?? 0),
      is_free: isFree,
      is_paid: !isFree,
      thumbnail_url: courseData.thumbnail_url,
      is_published: Boolean(courseData.is_published),
    }).eq('id', selectedCourse);
    if (!error) { toast.success('Course details saved successfully'); fetchCourses(); }
    else { console.error('Save details error:', error); toast.error('Failed to save details'); }
    setSaving(false);
  };

  const handleAddSection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sectionTitle.trim()) return;
    const { error } = await supabase.from('sections').insert({ course_id: selectedCourse, title: sectionTitle, order_index: sections.length });
    if (!error) { toast.success('Section added'); setSectionTitle(''); setAddingSection(false); fetchSections(); }
    else toast.error('Failed to add section');
  };

  const handleRenameSection = async (id: string) => {
    if (!editingSectionTitle.trim()) return;
    const { error } = await supabase.from('sections').update({ title: editingSectionTitle }).eq('id', id);
    if (!error) { toast.success('Section renamed'); setEditingSectionId(null); fetchSections(); }
    else toast.error('Failed to rename section');
  };

  const handleAddLesson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addingLessonTo) return;
    const section = sections.find(s => s.id === addingLessonTo);
    // Map UI types to DB-allowed values
    const typeMap: Record<string, string> = { article: 'text', pdf: 'file', link: 'text', video: 'video' };
    const dbType = typeMap[lessonForm.type] || lessonForm.type;
    const { error } = await supabase.from('lessons').insert({
      section_id: addingLessonTo,
      course_id: selectedCourse,
      title: lessonForm.title,
      type: dbType,
      lesson_type: dbType,
      content: lessonForm.content,
      url: lessonForm.url,
      duration_minutes: lessonForm.duration_minutes,
      is_preview: lessonForm.is_preview,
      order_index: section?.lessons?.length || 0,
    });
    if (!error) {
      toast.success('Lesson added');
      setAddingLessonTo(null);
      setLessonForm({ title: '', type: 'video', content: '', url: '', duration_minutes: 10, is_preview: false, is_required: true });
      fetchSections();
    } else toast.error('Failed to add lesson');
  };

  const openEditLesson = (lesson: Lesson) => {
    // Map DB types back to UI types for display
    const uiTypeMap: Record<string, 'video' | 'pdf' | 'article' | 'link' | 'text' | 'file'> = {
      text: 'article', file: 'pdf', video: 'video', quiz: 'article',
    };
    const uiType = uiTypeMap[lesson.type] || lesson.type as 'video' | 'pdf' | 'article' | 'link';
    setEditLessonForm({
      title: lesson.title,
      type: uiType,
      content: lesson.content || '',
      url: (lesson as Lesson & { url?: string }).url || lesson.video_url || '',
      duration_minutes: lesson.duration_minutes || 10,
      is_preview: lesson.is_preview || false,
      is_required: (lesson as Lesson & { is_required?: boolean }).is_required !== false,
    });
    setEditingLessonId(lesson.id);
  };

  const handleUpdateLesson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLessonId) return;
    const typeMap: Record<string, string> = { article: 'text', pdf: 'file', link: 'text', video: 'video', text: 'text', file: 'file' };
    const dbType = typeMap[editLessonForm.type] || editLessonForm.type;
    const { error } = await supabase.from('lessons').update({
      title: editLessonForm.title,
      type: dbType,
      lesson_type: dbType,
      content: editLessonForm.content,
      url: editLessonForm.url,
      duration_minutes: editLessonForm.duration_minutes,
      is_preview: editLessonForm.is_preview,
    }).eq('id', editingLessonId);
    if (!error) {
      toast.success('Lesson updated');
      setEditingLessonId(null);
      fetchSections();
    } else {
      toast.error('Failed to update lesson');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const tableMap = { section: 'sections', lesson: 'lessons', quiz: 'quizzes', question: 'quiz_questions' };
    await supabase.from(tableMap[deleteTarget.type] as 'sections' | 'lessons' | 'quizzes' | 'quiz_questions').delete().eq('id', deleteTarget.id);
    toast.success(`${deleteTarget.type.charAt(0).toUpperCase() + deleteTarget.type.slice(1)} deleted`);
    setDeleteTarget(null);
    fetchSections();
    fetchQuizzes();
  };

  const handleCreateQuiz = async (e: React.FormEvent) => {
    e.preventDefault();
    const timeLimitVal = quizForm.time_limit_minutes ? parseInt(quizForm.time_limit_minutes) : null;
    const { error } = await supabase.from('quizzes').insert({
      course_id: selectedCourse,
      title: quizForm.title,
      description: quizForm.description,
      time_limit: timeLimitVal || 0,
      time_limit_minutes: timeLimitVal,
      pass_percentage: quizForm.pass_mark,
      pass_mark: quizForm.pass_mark,
      max_attempts: quizForm.max_attempts,
      is_published: true,
    });
    if (!error) {
      toast.success('Quiz created');
      setShowQuizCreate(false);
      setQuizForm({ title: '', description: '', time_limit_minutes: '', pass_mark: 70, max_attempts: 3 });
      fetchQuizzes();
    } else toast.error('Failed to create quiz');
  };

  const handleAddQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addingQuestionTo) return;
    const quiz = quizzes.find(q => q.id === addingQuestionTo);
    const filteredOptions = questionForm.type === 'short_answer' ? [] : questionForm.options.filter(o => o.trim());
    const correctIdx = filteredOptions.findIndex(o => o === questionForm.correct_answer);
    const { error } = await supabase.from('quiz_questions').insert({
      quiz_id: addingQuestionTo,
      question: questionForm.question,
      type: questionForm.type,
      options: filteredOptions.length > 0 ? filteredOptions : null,
      correct_answer: correctIdx >= 0 ? correctIdx : 0,
      correct_answer_text: questionForm.correct_answer,
      points: questionForm.points,
      order_index: quiz?.questions?.length || 0,
    });
    if (!error) {
      toast.success('Question added');
      setAddingQuestionTo(null);
      setQuestionForm({ question: '', type: 'mcq', options: ['', '', '', ''], correct_answer: '', points: 1 });
      fetchQuizzes();
    } else toast.error('Failed to add question');
  };

  const extData = courseData as { start_date?: string; end_date?: string; duration_weeks?: number };
  const selectedCourseName = courses.find(c => c.id === selectedCourse)?.title || '';
  const totalLessons = sections.reduce((t, s) => t + (s.lessons?.length || 0), 0);
  const totalDuration = sections.reduce((t, s) => t + (s.lessons?.reduce((lt, l) => lt + (l.duration_minutes || 0), 0) || 0), 0);

  const tabs: { id: Tab; label: string; icon: typeof Settings; count?: number }[] = [
    { id: 'details', label: 'Course Info', icon: Info },
    { id: 'curriculum', label: 'Curriculum', icon: Layers, count: totalLessons },
    { id: 'quizzes', label: 'Quizzes', icon: HelpCircle, count: quizzes.length },
    { id: 'exams', label: 'Exams', icon: ClipboardList, count: exams.length },
    { id: 'flashcards', label: 'Flashcards', icon: LayoutList },
  ];

  return (
    <DashboardLayout
      navItems={navItems}
      title="Course Builder"
      subtitle={selectedCourseName ? `Editing: ${selectedCourseName}` : 'Select a course to start building'}
    >
      <div className="space-y-5">
        {!selectedCourse && !loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            {[
              { icon: BookOpen, label: 'Build Curriculum', desc: 'Add sections and lessons', color: 'bg-sky-50 text-sky-600' },
              { icon: Upload, label: 'Upload Content', desc: 'Videos, PDFs and more', color: 'bg-blue-50 text-blue-600' },
              { icon: HelpCircle, label: 'Create Quizzes', desc: 'Test student knowledge', color: 'bg-slate-50 text-slate-600' },
            ].map(({ icon: Icon, label, desc, color }) => (
              <div key={label} className="card p-5 flex items-start gap-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color} shrink-0`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div>
                  <p className="font-semibold text-slate-800">{label}</p>
                  <p className="text-sm text-slate-500 mt-0.5">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Select Course to Edit</label>
            <div className="relative max-w-sm">
              <BookOpen className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <select
                value={selectedCourse}
                onChange={e => { setSelectedCourse(e.target.value); setActiveTab('details'); setPreviewLesson(null); }}
                className="input-field pl-9 pr-4 appearance-none cursor-pointer font-medium"
              >
                <option value="">Choose a course...</option>
                {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>
          </div>
          <button
            onClick={() => setShowAIGenerator(true)}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded-xl transition-colors whitespace-nowrap"
          >
            <Sparkles className="w-4 h-4" /> Generate Course with AI
          </button>
        </div>

        {!selectedCourse && !loading && (
          <div className="lms-panel">
            <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
              <div className="w-16 h-16 bg-sky-100 rounded-2xl flex items-center justify-center mb-5">
                <BookOpen className="w-8 h-8 text-sky-500" />
              </div>
              <h3 className="text-lg font-bold text-slate-800 mb-2">Select a course to start building</h3>
              <p className="text-slate-500 text-sm max-w-sm">Choose a course from the dropdown above to edit its details, add lessons, upload videos, documents and create quizzes.</p>
            </div>
          </div>
        )}

        {selectedCourse && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex gap-1 p-1 bg-slate-100 rounded-xl">
                {tabs.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === tab.id ? 'bg-white text-sky-700 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-white/60'}`}
                  >
                    <tab.icon className="w-4 h-4" />
                    {tab.label}
                    {tab.count !== undefined && tab.count > 0 && (
                      <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${activeTab === tab.id ? 'bg-sky-100 text-sky-600' : 'bg-slate-200 text-slate-500'}`}>
                        {tab.count}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {activeTab === 'curriculum' && (
                <div className="flex items-center gap-4 ml-auto text-xs text-slate-500">
                  <span className="flex items-center gap-1.5"><Layers className="w-3.5 h-3.5 text-sky-400" />{sections.length} sections</span>
                  <span className="flex items-center gap-1.5"><BookOpen className="w-3.5 h-3.5 text-sky-400" />{totalLessons} lessons</span>
                  <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-sky-400" />{Math.floor(totalDuration / 60)}h {totalDuration % 60}m</span>
                </div>
              )}
            </div>

            {activeTab === 'details' && (
              <form onSubmit={handleSaveDetails} className="space-y-4">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div className="lg:col-span-2 space-y-4">
                    <div className="lms-panel">
                      <div className="lms-panel-header">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 bg-sky-100 rounded-lg flex items-center justify-center">
                            <AlignLeft className="w-3.5 h-3.5 text-sky-600" />
                          </div>
                          <h3 className="font-semibold text-slate-800">Basic Information</h3>
                        </div>
                      </div>
                      <div className="p-5 space-y-4">
                        <div>
                          <label className="block text-sm font-semibold text-slate-700 mb-1.5">Course Title <span className="text-red-500">*</span></label>
                          <input type="text" value={courseData.title || ''} onChange={e => setCourseData(d => ({ ...d, title: e.target.value }))} className="input-field text-base font-medium" placeholder="e.g. IELTS Academic Mastery — Band 8+" required />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-slate-700 mb-1.5">Short Description</label>
                          <input type="text" value={courseData.short_description || ''} onChange={e => setCourseData(d => ({ ...d, short_description: e.target.value }))} className="input-field" placeholder="One-line summary shown on course cards (max 120 chars)" maxLength={120} />
                          <p className="text-xs text-slate-400 mt-1">{(courseData.short_description || '').length}/120 characters</p>
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-slate-700 mb-1.5">Full Description</label>
                          <textarea value={courseData.description || ''} onChange={e => setCourseData(d => ({ ...d, description: e.target.value }))} className="input-field resize-none" rows={5} placeholder="Describe what students will learn, prerequisites, and who this course is for..." />
                        </div>
                      </div>
                    </div>

                    <div className="lms-panel">
                      <div className="lms-panel-header">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 bg-sky-100 rounded-lg flex items-center justify-center">
                            <Settings className="w-3.5 h-3.5 text-sky-600" />
                          </div>
                          <h3 className="font-semibold text-slate-800">Course Settings</h3>
                        </div>
                      </div>
                      <div className="p-5 space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Category</label>
                            {showNewCategory ? (
                              <div className="flex gap-2">
                                <input
                                  type="text"
                                  value={newCategoryInput}
                                  onChange={e => setNewCategoryInput(e.target.value)}
                                  placeholder="New category name..."
                                  className="input-field flex-1 text-sm"
                                  autoFocus
                                />
                                <button
                                  type="button"
                                  onClick={async () => {
                                    const name = newCategoryInput.trim();
                                    if (!name) return;
                                    const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
                                    await supabase.from('course_categories').insert({ name, slug });
                                    setCategories(prev => [...prev, name]);
                                    setCourseData(d => ({ ...d, category: name }));
                                    setNewCategoryInput('');
                                    setShowNewCategory(false);
                                  }}
                                  className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg transition-colors"
                                >Save</button>
                                <button
                                  type="button"
                                  onClick={() => { setShowNewCategory(false); setNewCategoryInput(''); }}
                                  className="px-3 py-2 bg-slate-100 dark:bg-navy-700 text-slate-600 dark:text-slate-300 text-xs font-semibold rounded-lg hover:bg-slate-200 dark:hover:bg-navy-600 transition-colors"
                                >Cancel</button>
                              </div>
                            ) : (
                              <div className="flex gap-2">
                                <select
                                  value={courseData.category || ''}
                                  onChange={e => {
                                    if (e.target.value === '__new__') { setShowNewCategory(true); return; }
                                    setCourseData(d => ({ ...d, category: e.target.value }));
                                  }}
                                  className="input-field flex-1"
                                >
                                  {categories.length === 0 && <option value="">Select category...</option>}
                                  {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                                  <option value="__new__">+ Create new category...</option>
                                </select>
                              </div>
                            )}
                          </div>
                          <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Difficulty Level</label>
                            <select value={courseData.level || 'beginner'} onChange={e => setCourseData(d => ({ ...d, level: e.target.value as 'beginner' | 'intermediate' | 'advanced' }))} className="input-field">
                              <option value="beginner">Beginner</option>
                              <option value="intermediate">Intermediate</option>
                              <option value="advanced">Advanced</option>
                            </select>
                          </div>
                        </div>

                        <div className="border border-slate-200 rounded-xl overflow-hidden">
                          <div className="flex items-center gap-2 px-4 py-3 bg-slate-50 border-b border-slate-200">
                            <Calendar className="w-4 h-4 text-slate-400" />
                            <span className="text-sm font-semibold text-slate-700">Course Timeline</span>
                          </div>
                          <div className="p-4 grid grid-cols-3 gap-3">
                            <div>
                              <label className="block text-xs font-semibold text-slate-500 mb-1.5">Start Date</label>
                              <input type="date" value={extData.start_date || ''} onChange={e => setCourseData(d => ({ ...d, start_date: e.target.value }))} className="input-field text-sm" />
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-slate-500 mb-1.5">End Date</label>
                              <input type="date" value={extData.end_date || ''} onChange={e => setCourseData(d => ({ ...d, end_date: e.target.value }))} className="input-field text-sm" />
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-slate-500 mb-1.5">Duration (weeks)</label>
                              <input type="number" min="1" step="1" value={extData.duration_weeks || ''} onChange={e => setCourseData(d => ({ ...d, duration_weeks: parseInt(e.target.value) || undefined }))} className="input-field text-sm" placeholder="e.g. 12" />
                            </div>
                            {extData.start_date && extData.end_date && (
                              <div className="col-span-3 flex items-center gap-2 text-xs text-sky-600 bg-sky-50 px-3 py-2 rounded-lg">
                                <Clock className="w-3.5 h-3.5 shrink-0" />
                                {new Date(extData.start_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })} → {new Date(extData.end_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                                {extData.duration_weeks && ` — ${extData.duration_weeks} weeks`}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="lms-panel">
                      <div className="lms-panel-header">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 bg-sky-100 rounded-lg flex items-center justify-center">
                            <Image className="w-3.5 h-3.5 text-sky-600" />
                          </div>
                          <h3 className="font-semibold text-slate-800">Course Thumbnail</h3>
                        </div>
                      </div>
                      <div className="p-4 space-y-3">
                        {courseData.thumbnail_url ? (
                          <div className="relative rounded-xl overflow-hidden border border-slate-200 aspect-video bg-slate-100">
                            <img src={courseData.thumbnail_url} alt="Thumbnail" className="w-full h-full object-cover" />
                            <button type="button" onClick={() => setCourseData(d => ({ ...d, thumbnail_url: '' }))} className="absolute top-2 right-2 w-7 h-7 bg-black/60 hover:bg-black/80 rounded-lg flex items-center justify-center text-white transition-colors">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <UploadZone
                            accept="image/jpeg,image/png,image/webp,image/gif"
                            bucket="course-thumbnails"
                            path={selectedCourse}
                            onUploaded={(url) => setCourseData(d => ({ ...d, thumbnail_url: url }))}
                            label="Upload Thumbnail Image"
                            icon={Image}
                            hint="JPG, PNG, WebP — recommended 1280×720"
                          />
                        )}
                        <div className="flex items-center gap-2">
                          <div className="h-px bg-slate-200 flex-1" />
                          <span className="text-xs text-slate-400 font-medium">or paste URL</span>
                          <div className="h-px bg-slate-200 flex-1" />
                        </div>
                        <input
                          type="url"
                          value={courseData.thumbnail_url || ''}
                          onChange={e => setCourseData(d => ({ ...d, thumbnail_url: e.target.value }))}
                          className="input-field text-xs"
                          placeholder="Paste image URL (e.g. from Pexels)"
                        />
                      </div>
                    </div>

                    <div className="lms-panel">
                      <div className="lms-panel-header">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 bg-sky-100 rounded-lg flex items-center justify-center">
                            <DollarSign className="w-3.5 h-3.5 text-sky-600" />
                          </div>
                          <h3 className="font-semibold text-slate-800">Pricing</h3>
                        </div>
                      </div>
                      <div className="p-4 space-y-3">
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setCourseData(d => ({ ...d, is_free: false }))}
                            className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-all ${!courseData.is_free ? 'border-sky-500 bg-sky-50 text-sky-700' : 'border-slate-200 text-slate-600 hover:border-sky-200'}`}
                          >
                            <DollarSign className="w-4 h-4" />
                            Paid
                          </button>
                          <button
                            type="button"
                            onClick={() => setCourseData(d => ({ ...d, is_free: true, price: 0, price_amount: 0 }))}
                            className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-all ${courseData.is_free ? 'border-success-500 bg-success-50 text-success-700' : 'border-slate-200 text-slate-600 hover:border-success-200'}`}
                          >
                            <Globe className="w-4 h-4" />
                            Free
                          </button>
                        </div>
                        {!courseData.is_free && (
                          <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Price (AUD)</label>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-medium">$</span>
                              <input type="number" min="0" step="0.01" value={courseData.price_amount ?? courseData.price ?? ''} onChange={e => { const v = e.target.value === '' ? 0 : Number(e.target.value); setCourseData(d => ({ ...d, price: v, price_amount: v })); }} className="input-field pl-7" placeholder="0.00" />
                            </div>
                          </div>
                        )}
                        {courseData.is_free && (
                          <div className="flex items-center gap-2 text-xs text-success-700 bg-success-50 px-3 py-2.5 rounded-lg">
                            <Globe className="w-3.5 h-3.5 shrink-0" />
                            This course is available for free
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="lms-panel">
                      <div className="lms-panel-header">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 bg-sky-100 rounded-lg flex items-center justify-center">
                            <BarChart2 className="w-3.5 h-3.5 text-sky-600" />
                          </div>
                          <h3 className="font-semibold text-slate-800">Overview</h3>
                        </div>
                      </div>
                      <div className="p-4 space-y-2">
                        {[
                          { label: 'Sections', value: sections.length, icon: Layers },
                          { label: 'Lessons', value: totalLessons, icon: BookOpen },
                          { label: 'Quizzes', value: quizzes.length, icon: HelpCircle },
                          { label: 'Duration', value: `${Math.floor(totalDuration / 60)}h ${totalDuration % 60}m`, icon: Clock },
                        ].map(({ label, value, icon: Icon }) => (
                          <div key={label} className="flex items-center justify-between py-1.5">
                            <div className="flex items-center gap-2 text-sm text-slate-500">
                              <Icon className="w-3.5 h-3.5 text-slate-400" />
                              {label}
                            </div>
                            <span className="text-sm font-semibold text-slate-800">{value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setCourseData(d => ({ ...d, is_published: !d.is_published }))}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl border-2 text-sm font-semibold transition-all ${
                      courseData.is_published
                        ? 'border-emerald-400 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                        : 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100'
                    }`}
                  >
                    {courseData.is_published
                      ? <><Eye className="w-4 h-4" /> Published — click to unpublish</>
                      : <><Eye className="w-4 h-4" /> Draft — click to publish</>
                    }
                  </button>
                  <div className="flex gap-3">
                    <button type="button" onClick={() => setActiveTab('curriculum')} className="flex items-center gap-2 btn-ghost text-sm">
                      Go to Curriculum
                      <ChevronRight className="w-4 h-4" />
                    </button>
                    <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2">
                      {saving ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Save className="w-4 h-4" />
                          Save Changes
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </form>
            )}

            {activeTab === 'curriculum' && (
              <div className="space-y-4">

                {/* ─── AI generation progress banner ───────────────────────── */}
                {bgGenStatus && (
                  <div className="flex items-center gap-3 px-5 py-3.5 bg-blue-50 border border-blue-200 rounded-xl">
                    <div className="w-4 h-4 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-blue-900">
                        Generating notes &amp; slides — {bgGenStatus.done}/{bgGenStatus.total} complete
                      </p>
                      <p className="text-xs text-blue-600 truncate mt-0.5">{bgGenStatus.current}</p>
                    </div>
                    <div className="w-28 bg-blue-200 rounded-full h-1.5 shrink-0">
                      <div
                        className="bg-blue-500 h-1.5 rounded-full transition-all duration-500"
                        style={{ width: `${Math.round((bgGenStatus.done / bgGenStatus.total) * 100)}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* ─── AI Curriculum Generator ─────────────────────────────── */}
                {!showAICurriculumPanel ? (
                  <div className="flex items-center justify-between px-5 py-3.5 bg-gradient-to-r from-sky-50 to-blue-50 border border-sky-200 rounded-xl">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-sky-100 rounded-lg flex items-center justify-center shrink-0">
                        <Sparkles className="w-4 h-4 text-sky-600" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-sky-800">Generate Curriculum with AI</p>
                        <p className="text-xs text-sky-600 mt-0.5">AI creates sections, lessons, quizzes and activities</p>
                      </div>
                    </div>
                    <button
                      onClick={() => { setShowAICurriculumPanel(true); setAICurriculumStep('form'); }}
                      className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-sky-700 bg-white hover:bg-sky-50 border border-sky-300 rounded-lg transition-colors whitespace-nowrap shrink-0"
                    >
                      <Sparkles className="w-3.5 h-3.5" /> Generate
                    </button>
                  </div>
                ) : (
                  <div className="lms-panel overflow-hidden">
                    {/* Panel header */}
                    <div className="flex items-center gap-3 px-5 py-4 border-b border-sky-100 bg-gradient-to-r from-sky-50 to-blue-50">
                      <div className="w-8 h-8 bg-sky-100 rounded-lg flex items-center justify-center shrink-0">
                        <Sparkles className="w-4 h-4 text-sky-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-sky-800">
                          {aiCurriculumStep === 'form' && 'Generate Curriculum with AI'}
                          {aiCurriculumStep === 'loading' && 'AI is building your curriculum...'}
                          {aiCurriculumStep === 'preview' && `Preview — ${aiCurriculumPreview.length} sections generated`}
                        </p>
                        <p className="text-xs text-sky-600 mt-0.5">
                          {aiCurriculumStep === 'form' && 'Generates sections, lessons, quizzes & activities'}
                          {aiCurriculumStep === 'loading' && 'This may take up to 30 seconds...'}
                          {aiCurriculumStep === 'preview' && 'Review the curriculum below then click Insert to add it'}
                        </p>
                      </div>
                      {aiCurriculumStep !== 'loading' && !aiCurriculumInserting && (
                        <button onClick={() => { setShowAICurriculumPanel(false); setAICurriculumStep('form'); setAICurriculumPreview([]); }} className="p-1.5 rounded-lg text-sky-400 hover:bg-sky-100 transition-colors">
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    {/* Step: Form */}
                    {aiCurriculumStep === 'form' && (
                      <form onSubmit={handleAIGenerateCurriculum} className="p-5 space-y-4">
                        <div>
                          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Course Topic <span className="text-red-500">*</span></label>
                          <input
                            type="text"
                            value={aiCurriculumForm.topic}
                            onChange={e => setAICurriculumForm(f => ({ ...f, topic: e.target.value }))}
                            className="input-field text-sm"
                            placeholder={courses.find(c => c.id === selectedCourse)?.title || 'e.g. IELTS Academic Writing Skills'}
                            required
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Target Audience</label>
                            <select value={aiCurriculumForm.target_audience} onChange={e => setAICurriculumForm(f => ({ ...f, target_audience: e.target.value }))} className="input-field text-sm">
                              <option value="general">General learners</option>
                              <option value="beginners">Complete beginners</option>
                              <option value="intermediate">Intermediate students</option>
                              <option value="advanced">Advanced students</option>
                              <option value="professionals">Working professionals</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Difficulty</label>
                            <select value={aiCurriculumForm.difficulty} onChange={e => setAICurriculumForm(f => ({ ...f, difficulty: e.target.value }))} className="input-field text-sm">
                              <option value="beginner">Beginner</option>
                              <option value="intermediate">Intermediate</option>
                              <option value="advanced">Advanced</option>
                            </select>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Sections <span className="text-sky-600 font-bold">{aiCurriculumForm.num_sections}</span></label>
                            <input type="range" min={1} max={12} value={aiCurriculumForm.num_sections} onChange={e => setAICurriculumForm(f => ({ ...f, num_sections: Number(e.target.value) }))} className="w-full accent-sky-500" />
                            <div className="flex justify-between text-xs text-slate-400 mt-1"><span>1</span><span>12</span></div>
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Lessons/Section <span className="text-sky-600 font-bold">{aiCurriculumForm.lessons_per_section}</span></label>
                            <input type="range" min={2} max={6} value={aiCurriculumForm.lessons_per_section} onChange={e => setAICurriculumForm(f => ({ ...f, lessons_per_section: Number(e.target.value) }))} className="w-full accent-sky-500" />
                            <div className="flex justify-between text-xs text-slate-400 mt-1"><span>2</span><span>6</span></div>
                          </div>
                        </div>
                        {sections.length > 0 && (
                          <div className={`flex items-start gap-3 rounded-xl px-4 py-3 border ${aiCurriculumForm.use_existing_context ? 'bg-sky-50 border-sky-200' : 'bg-slate-50 border-slate-200'}`}>
                            <div
                              className={`w-8 h-5 rounded-full transition-colors flex items-center shrink-0 mt-0.5 cursor-pointer ${aiCurriculumForm.use_existing_context ? 'bg-sky-500' : 'bg-slate-300'}`}
                              onClick={() => setAICurriculumForm(f => ({ ...f, use_existing_context: !f.use_existing_context }))}
                            >
                              <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform mx-0.5 ${aiCurriculumForm.use_existing_context ? 'translate-x-3' : 'translate-x-0'}`} />
                            </div>
                            <div>
                              <p className={`text-xs font-semibold ${aiCurriculumForm.use_existing_context ? 'text-sky-700' : 'text-slate-600'}`}>
                                Build on existing {sections.length} section{sections.length !== 1 ? 's' : ''}
                              </p>
                              <p className="text-xs text-slate-400 mt-0.5">
                                {aiCurriculumForm.use_existing_context
                                  ? 'AI will see previous weeks and continue from where they left off — no repeated topics'
                                  : 'AI will generate independently without awareness of prior content'}
                              </p>
                            </div>
                          </div>
                        )}
                        <div className="flex items-center gap-2.5 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs text-slate-500">
                          <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          Generates {aiCurriculumForm.num_sections} sections · {aiCurriculumForm.num_sections * aiCurriculumForm.lessons_per_section} lessons · {aiCurriculumForm.num_sections} quizzes · notes &amp; slides per section
                        </div>
                        <div className="flex gap-2">
                          <button type="submit" className="btn-primary text-sm py-2 flex items-center gap-2">
                            <Sparkles className="w-4 h-4" /> Generate Curriculum
                          </button>
                          <button type="button" onClick={() => setShowAICurriculumPanel(false)} className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors">
                            Cancel
                          </button>
                        </div>
                      </form>
                    )}

                    {/* Step: Loading */}
                    {aiCurriculumStep === 'loading' && (
                      <div className="p-12 flex flex-col items-center justify-center gap-5">
                        <div className="relative">
                          <div className="w-14 h-14 rounded-full bg-sky-100 flex items-center justify-center">
                            <Sparkles className="w-7 h-7 text-sky-500 animate-pulse" />
                          </div>
                          <div className="absolute inset-0 rounded-full border-4 border-sky-300 border-t-transparent animate-spin" />
                        </div>
                        <div className="text-center space-y-2">
                          <p className="text-sm font-semibold text-slate-700">AI is crafting your curriculum</p>
                          {curriculumGenProgress ? (
                            <>
                              <p className="text-xs text-slate-500">
                                Batch {curriculumGenProgress.done + 1} of {curriculumGenProgress.total} — building sections {curriculumGenProgress.done * 4 + 1}–{Math.min((curriculumGenProgress.done + 1) * 4, aiCurriculumForm.num_sections)}...
                              </p>
                              <div className="w-48 mx-auto bg-sky-100 rounded-full h-1.5 mt-1">
                                <div
                                  className="bg-sky-500 h-1.5 rounded-full transition-all duration-500"
                                  style={{ width: `${Math.round((curriculumGenProgress.done / curriculumGenProgress.total) * 100)}%` }}
                                />
                              </div>
                            </>
                          ) : (
                            <p className="text-xs text-slate-400">Preparing {aiCurriculumForm.num_sections} sections with lessons, quizzes and activities...</p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Step: Preview */}
                    {aiCurriculumStep === 'preview' && (
                      <div className="divide-y divide-slate-100">
                        {(!aiCurriculumPreview || aiCurriculumPreview.length === 0) && (
                          <div className="p-10 text-center text-slate-400 text-sm">No curriculum sections were generated. Please go back and try again.</div>
                        )}
                        {(aiCurriculumPreview || []).map((sec, si) => (
                          <div key={si} className="overflow-hidden">
                            <button
                              type="button"
                              onClick={() => setAICurriculumExpanded(aiCurriculumExpanded === si ? null : si)}
                              className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50 transition-colors text-left"
                            >
                              <div className="w-7 h-7 rounded-lg bg-sky-100 flex items-center justify-center shrink-0">
                                <Layers className="w-3.5 h-3.5 text-sky-600" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-slate-800 truncate">{sec.title}</p>
                                <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-400">
                                  <span>{sec.lessons?.length || 0} lessons</span>
                                  <span>{sec.quiz?.questions?.length || 0} quiz questions</span>
                                  <span>{sec.activities?.length || 0} activities</span>
                                </div>
                              </div>
                              {aiCurriculumExpanded === si ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />}
                            </button>

                            {aiCurriculumExpanded === si && (
                              <div className="px-5 pb-4 space-y-3 bg-slate-50 border-t border-slate-100">
                                {/* Lessons */}
                                <div className="pt-3">
                                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Lessons</p>
                                  <div className="space-y-1.5">
                                    {sec.lessons?.map((lesson, li) => {
                                      const isDoc = lesson.type === 'document';
                                      return (
                                        <div key={li} className="flex items-center gap-2.5 bg-white rounded-lg px-3 py-2 border border-slate-100">
                                          <div className={`w-6 h-6 rounded flex items-center justify-center shrink-0 ${isDoc ? 'bg-red-100' : 'bg-green-100'}`}>
                                            {isDoc ? <FileText className="w-3.5 h-3.5 text-red-500" /> : <AlignLeft className="w-3.5 h-3.5 text-green-600" />}
                                          </div>
                                          <span className="text-sm text-slate-700 flex-1 min-w-0 truncate">{lesson.title}</span>
                                          <span className={`text-xs px-2 py-0.5 rounded font-medium shrink-0 ${isDoc ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-700'}`}>
                                            {isDoc ? 'Document' : 'Article'}
                                          </span>
                                          <span className="text-xs text-slate-400 shrink-0">{lesson.estimated_duration_minutes}m</span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>

                                {/* Quiz */}
                                {sec.quiz?.questions?.length > 0 && (
                                  <div>
                                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Quiz — {sec.quiz.title}</p>
                                    <div className="space-y-1.5">
                                      {sec.quiz.questions.map((q, qi) => (
                                        <div key={qi} className="flex items-start gap-2.5 bg-white rounded-lg px-3 py-2 border border-slate-100">
                                          <div className="w-6 h-6 rounded bg-sky-100 flex items-center justify-center shrink-0 mt-0.5">
                                            <HelpCircle className="w-3.5 h-3.5 text-sky-600" />
                                          </div>
                                          <div className="flex-1 min-w-0">
                                            <p className="text-sm text-slate-700 truncate">{q.question}</p>
                                            <span className={`text-xs font-medium ${q.type === 'mcq' ? 'text-sky-600' : 'text-amber-600'}`}>{q.type === 'mcq' ? 'Multiple Choice' : 'True/False'}</span>
                                          </div>
                                          <span className="text-xs text-slate-400 shrink-0">{q.points}pt</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* Activities */}
                                {sec.activities?.length > 0 && (
                                  <div>
                                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Activities</p>
                                    <div className="space-y-1.5">
                                      {sec.activities.map((a, ai2) => {
                                        const typeColors: Record<string, string> = {
                                          practice: 'bg-blue-100 text-blue-700',
                                          reflection: 'bg-amber-100 text-amber-700',
                                          discussion: 'bg-green-100 text-green-700',
                                          project: 'bg-rose-100 text-rose-700',
                                          research: 'bg-slate-100 text-slate-700',
                                        };
                                        return (
                                          <div key={ai2} className="flex items-start gap-2.5 bg-white rounded-lg px-3 py-2 border border-slate-100">
                                            <div className="w-6 h-6 rounded bg-amber-100 flex items-center justify-center shrink-0 mt-0.5">
                                              <BarChart2 className="w-3.5 h-3.5 text-amber-600" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                              <p className="text-sm text-slate-700 truncate">{a.title}</p>
                                              <p className="text-xs text-slate-400 truncate mt-0.5">{a.instructions}</p>
                                            </div>
                                            <span className={`text-xs px-2 py-0.5 rounded font-medium capitalize shrink-0 ${typeColors[a.type] || 'bg-slate-100 text-slate-600'}`}>{a.type}</span>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ))}

                        {/* Footer actions */}
                        <div className="border-t border-slate-100 bg-white">
                          {aiCurriculumInserting && aiCurriculumInsertStatus && (
                            <div className="flex items-center gap-2.5 px-5 py-3 bg-sky-50 border-b border-sky-100">
                              <div className="w-3.5 h-3.5 border-2 border-sky-400/40 border-t-sky-500 rounded-full animate-spin shrink-0" />
                              <p className="text-xs text-sky-700 font-medium">{aiCurriculumInsertStatus}</p>
                            </div>
                          )}
                          <div className="flex items-center justify-between px-5 py-4">
                            <button
                              type="button"
                              onClick={() => setAICurriculumStep('form')}
                              disabled={aiCurriculumInserting}
                              className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
                            >
                              Regenerate
                            </button>
                            <div className="flex items-center gap-3">
                              <p className="text-xs text-slate-400 hidden sm:block">Includes lesson notes, slides, quizzes &amp; activities</p>
                              <button
                                type="button"
                                onClick={handleAICurriculumInsert}
                                disabled={aiCurriculumInserting}
                                className="btn-primary text-sm py-2 px-6 flex items-center gap-2 disabled:opacity-60"
                              >
                                {aiCurriculumInserting ? (
                                  <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Building...</>
                                ) : (
                                  <><Sparkles className="w-4 h-4" /> Build Full Curriculum</>
                                )}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {/* ─────────────────────────────────────────────────────────── */}

                {sections.map((section, sIdx) => (
                  <SectionCard
                    key={section.id}
                    section={section}
                    sIdx={sIdx}
                    expanded={expandedSections.has(section.id)}
                    onToggle={() => setExpandedSections(prev => { const n = new Set(prev); n.has(section.id) ? n.delete(section.id) : n.add(section.id); return n; })}
                    onRename={() => { setEditingSectionId(section.id); setEditingSectionTitle(section.title); }}
                    onDelete={() => setDeleteTarget({ type: 'section', id: section.id, name: section.title })}
                    onAddLesson={() => { setAddingLessonTo(section.id); setLessonForm({ title: '', type: 'video', content: '', url: '', duration_minutes: 10, is_preview: false, is_required: true }); }}
                    onGenerateDocs={() => handleGenerateSectionDocs(section)}
                    generatingDocs={generatingSectionDocsId === section.id}
                  >
                    {editingSectionId === section.id && (
                      <div className="px-4 py-3 bg-sky-50 border-b border-sky-100 flex items-center gap-2">
                        <input
                          autoFocus
                          type="text"
                          value={editingSectionTitle}
                          onChange={e => setEditingSectionTitle(e.target.value)}
                          className="input-field flex-1 text-sm py-2"
                          onKeyDown={e => { if (e.key === 'Enter') handleRenameSection(section.id); if (e.key === 'Escape') setEditingSectionId(null); }}
                        />
                        <button onClick={() => handleRenameSection(section.id)} className="btn-primary text-xs py-2 px-3">Save</button>
                        <button onClick={() => setEditingSectionId(null)} className="px-3 py-2 text-xs border border-slate-200 rounded-lg text-slate-600 hover:bg-white transition-colors">Cancel</button>
                      </div>
                    )}

                    {section.lessons?.length === 0 && addingLessonTo !== section.id && (
                      <div className="flex flex-col items-center justify-center py-8 text-center px-4">
                        <BookOpen className="w-8 h-8 text-slate-300 mb-2" />
                        <p className="text-sm text-slate-500 font-medium">No lessons yet</p>
                        <p className="text-xs text-slate-400 mt-0.5">Click "Add Lesson" below to get started</p>
                      </div>
                    )}

                    {section.lessons?.map((lesson, lIdx) => {
                      const Icon = getLessonIcon(lesson.type);
                      const colors = getLessonColors(lesson.type);
                      const isPreview = previewLesson?.id === lesson.id;
                      return (
                        <div key={lesson.id} className="border-b border-slate-100 last:border-0">
                          <div className={`flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors ${isPreview ? 'bg-sky-50' : ''}`}>
                            <GripVertical className="w-3.5 h-3.5 text-slate-300 cursor-grab shrink-0" />
                            <span className="text-xs text-slate-300 font-mono w-5 shrink-0">{lIdx + 1}</span>
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${colors.bg}`}>
                              <Icon className={`w-4 h-4 ${colors.text}`} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-slate-800 truncate">{lesson.title}</p>
                              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                <span className={`text-xs font-medium capitalize px-2 py-0.5 rounded-md ${colors.bg} ${colors.text}`}>{lesson.type}</span>
                                <span className="text-xs text-slate-400 flex items-center gap-1"><Clock className="w-3 h-3" />{lesson.duration_minutes}m</span>
                                {lesson.is_required && <span className="text-xs bg-sky-100 text-sky-700 px-2 py-0.5 rounded-md font-medium flex items-center gap-1"><Lock className="w-2.5 h-2.5" />Required</span>}
                                {lesson.is_preview && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-md font-medium flex items-center gap-1"><Globe className="w-2.5 h-2.5" />Free preview</span>}
                                <LessonDocumentBadges lessonId={lesson.id} />
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {(lesson.url || (lesson as Lesson & { url?: string }).url) && (
                                <button onClick={() => setPreviewLesson(isPreview ? null : lesson)} className={`p-1.5 rounded-lg transition-colors text-xs font-medium flex items-center gap-1 ${isPreview ? 'bg-sky-100 text-sky-600' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600'}`} title="Preview lesson">
                                  <Eye className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {(lesson.type === 'article' || lesson.type === 'text') && lesson.content && (
                                <button
                                  onClick={async () => {
                                    const { summarizeLesson } = await import('../../lib/ai');
                                    const result = await summarizeLesson({ lesson_content: lesson.content }).catch(() => null);
                                    if (!result) { toast.error('Failed to generate summary'); return; }
                                    await supabase.from('lessons').update({
                                      ai_summary: result.summary,
                                      ai_summary_generated_at: new Date().toISOString(),
                                    }).eq('id', lesson.id);
                                    toast.success('Summary generated and saved');
                                  }}
                                  title="Generate AI Summary"
                                  className="p-1.5 rounded-lg text-slate-300 hover:text-sky-500 hover:bg-sky-50 transition-colors"
                                >
                                  <Sparkles className="w-3.5 h-3.5" />
                                </button>
                              )}
                              <button
                                onClick={() => setExpandedDocsLessonId(expandedDocsLessonId === lesson.id ? null : lesson.id)}
                                className={`p-1.5 rounded-lg transition-colors ${expandedDocsLessonId === lesson.id ? 'bg-emerald-100 text-emerald-600' : 'text-slate-400 hover:text-emerald-500 hover:bg-emerald-50'}`}
                                title="View notes & slides"
                              >
                                <FileText className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => editingLessonId === lesson.id ? setEditingLessonId(null) : openEditLesson(lesson)}
                                className={`p-1.5 rounded-lg transition-colors ${editingLessonId === lesson.id ? 'bg-sky-100 text-sky-600' : 'text-slate-400 hover:text-sky-500 hover:bg-sky-50'}`}
                                title="Edit lesson"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => setDeleteTarget({ type: 'lesson', id: lesson.id, name: lesson.title })} className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          {/* Inline lesson edit form */}
                          {editingLessonId === lesson.id && (
                            <form onSubmit={handleUpdateLesson} className="border-t border-sky-100 bg-sky-50/40">
                              <div className="px-4 py-3 flex items-center gap-2 border-b border-sky-100 bg-sky-50">
                                <div className="w-5 h-5 bg-sky-500 rounded-full flex items-center justify-center shrink-0">
                                  <Pencil className="w-3 h-3 text-white" />
                                </div>
                                <span className="text-sm font-bold text-sky-700">Edit Lesson</span>
                                <button type="button" onClick={() => setEditingLessonId(null)} className="ml-auto p-1 rounded text-slate-400 hover:text-slate-600">
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                              <div className="p-4 space-y-4">
                                <div className="grid grid-cols-2 gap-3">
                                  <div>
                                    <label className="block text-xs font-semibold text-slate-500 mb-1.5">Lesson Title <span className="text-red-500">*</span></label>
                                    <input type="text" value={editLessonForm.title} onChange={e => setEditLessonForm(f => ({ ...f, title: e.target.value }))} className="input-field text-sm" required />
                                  </div>
                                  <div>
                                    <label className="block text-xs font-semibold text-slate-500 mb-1.5">Content Type</label>
                                    <div className="grid grid-cols-4 gap-1.5">
                                      {(['video', 'pdf', 'article', 'link'] as const).map(t => {
                                        const TIcon = getLessonIcon(t);
                                        const tColors = getLessonColors(t);
                                        const labels = { video: 'Video', pdf: 'PDF', article: 'Article', link: 'Link' };
                                        const isActive = editLessonForm.type === t || (t === 'article' && editLessonForm.type === 'text') || (t === 'pdf' && editLessonForm.type === 'file');
                                        return (
                                          <button key={t} type="button" onClick={() => setEditLessonForm(f => ({ ...f, type: t, url: '', content: '' }))}
                                            className={`flex flex-col items-center gap-1 p-2 rounded-lg border text-xs font-medium transition-all ${isActive ? `${tColors.bg} ${tColors.text} border-current` : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}>
                                            <TIcon className="w-3.5 h-3.5" />{labels[t]}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>
                                </div>

                                {(editLessonForm.type === 'video') && (
                                  <div>
                                    <label className="block text-xs font-semibold text-slate-500 mb-1.5">Video URL</label>
                                    <input type="url" value={editLessonForm.url} onChange={e => setEditLessonForm(f => ({ ...f, url: e.target.value }))} className="input-field text-sm" placeholder="YouTube / Vimeo / direct video URL" />
                                  </div>
                                )}

                                {(editLessonForm.type === 'pdf' || editLessonForm.type === 'file') && (
                                  <div>
                                    <label className="block text-xs font-semibold text-slate-500 mb-1.5">Document URL</label>
                                    <input type="url" value={editLessonForm.url} onChange={e => setEditLessonForm(f => ({ ...f, url: e.target.value }))} className="input-field text-sm" placeholder="Direct PDF or document URL" />
                                  </div>
                                )}

                                {(editLessonForm.type === 'article' || editLessonForm.type === 'text') && (
                                  <div>
                                    <div className="flex items-center justify-between mb-1.5">
                                      <label className="block text-xs font-semibold text-slate-500">Article Content</label>
                                    </div>
                                    <Suspense fallback={null}>
                                      <AILessonToolbar
                                        lessonTitle={editLessonForm.title}
                                        courseContext={courses.find(c => c.id === selectedCourse)?.title || ''}
                                        currentContent={editLessonForm.content}
                                        onContentChange={html => setEditLessonForm(f => ({ ...f, content: html }))}
                                      />
                                    </Suspense>
                                    <textarea value={editLessonForm.content} onChange={e => setEditLessonForm(f => ({ ...f, content: e.target.value }))} className="input-field resize-none text-sm leading-relaxed" rows={6} placeholder="Write your lesson content here..." />
                                  </div>
                                )}

                                {editLessonForm.type === 'link' && (
                                  <div>
                                    <label className="block text-xs font-semibold text-slate-500 mb-1.5">External URL</label>
                                    <div className="relative">
                                      <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                      <input type="url" value={editLessonForm.url} onChange={e => setEditLessonForm(f => ({ ...f, url: e.target.value }))} className="input-field pl-9 text-sm" placeholder="https://..." />
                                    </div>
                                  </div>
                                )}

                                <div className="flex items-center gap-4 pt-1 flex-wrap">
                                  <div className="flex items-center gap-2">
                                    <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                    <label className="text-xs font-semibold text-slate-500 whitespace-nowrap">Duration</label>
                                    <input type="number" min="1" step="1" value={editLessonForm.duration_minutes} onChange={e => setEditLessonForm(f => ({ ...f, duration_minutes: parseInt(e.target.value) || 1 }))} className="input-field text-sm py-1.5 w-24" />
                                    <span className="text-xs text-slate-400">min</span>
                                  </div>
                                  <label className="flex items-center gap-2 cursor-pointer select-none">
                                    <div className={`w-8 h-5 rounded-full transition-colors flex items-center ${editLessonForm.is_preview ? 'bg-green-500' : 'bg-slate-200'}`} onClick={() => setEditLessonForm(f => ({ ...f, is_preview: !f.is_preview }))}>
                                      <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform mx-0.5 ${editLessonForm.is_preview ? 'translate-x-3' : 'translate-x-0'}`} />
                                    </div>
                                    <span className="text-xs font-semibold text-slate-600">Free preview</span>
                                  </label>
                                </div>

                                <div className="flex gap-2 pt-1">
                                  <button type="submit" className="btn-primary text-sm py-2 flex items-center gap-2">
                                    <Save className="w-4 h-4" /> Save Changes
                                  </button>
                                  <button type="button" onClick={() => setEditingLessonId(null)} className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-white transition-colors">
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            </form>
                          )}

                          {isPreview && lesson.url && (
                            <div className="mx-4 mb-4 mt-1 rounded-xl overflow-hidden border border-sky-200">
                              {lesson.type === 'video' && <VideoPlayer url={lesson.url} />}
                              {lesson.type === 'pdf' && <PDFViewer url={lesson.url} />}
                              {lesson.type === 'link' && (
                                <a href={lesson.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-sky-600 hover:underline p-3 bg-sky-50">
                                  <ExternalLink className="w-4 h-4" /> {lesson.url}
                                </a>
                              )}
                            </div>
                          )}

                          {/* AI-generated documents (notes + slides) — toggle with the doc button */}
                          {expandedDocsLessonId === lesson.id && selectedCourse && (
                            <div className="mx-4 mb-4 mt-1">
                              <Suspense fallback={
                                <div className="flex items-center gap-2 py-3 text-xs text-slate-400">
                                  <div className="w-3.5 h-3.5 border-2 border-slate-200 border-t-slate-400 rounded-full animate-spin" />
                                  Loading documents...
                                </div>
                              }>
                                <LessonDocumentViewer lessonId={lesson.id} courseId={selectedCourse} />
                              </Suspense>
                            </div>
                          )}

                          {/* Activities for this lesson */}
                          <LessonActivitiesPanel lessonId={lesson.id} />
                        </div>
                      );
                    })}

                    {addingLessonTo === section.id && (
                      <form onSubmit={handleAddLesson} className="border-t border-slate-100 bg-slate-50">
                        <div className="px-4 py-3 flex items-center gap-2 border-b border-slate-100 bg-sky-50">
                          <div className="w-5 h-5 bg-sky-500 rounded-full flex items-center justify-center shrink-0">
                            <Plus className="w-3 h-3 text-white" />
                          </div>
                          <span className="text-sm font-bold text-sky-700">New Lesson</span>
                          <button type="button" onClick={() => setAddingLessonTo(null)} className="ml-auto p-1 rounded text-slate-400 hover:text-slate-600">
                            <X className="w-4 h-4" />
                          </button>
                        </div>

                        <div className="p-4 space-y-4">
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-semibold text-slate-500 mb-1.5">Lesson Title <span className="text-red-500">*</span></label>
                              <input type="text" value={lessonForm.title} onChange={e => setLessonForm(f => ({ ...f, title: e.target.value }))} className="input-field text-sm" placeholder="e.g. Introduction to IELTS Reading" required />
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-slate-500 mb-1.5">Content Type</label>
                              <div className="grid grid-cols-4 gap-1.5">
                                {(['video', 'pdf', 'article', 'link'] as const).map(t => {
                                  const Icon = LESSON_ICONS[t];
                                  const colors = LESSON_COLORS[t];
                                  const labels = { video: 'Video', pdf: 'PDF', article: 'Article', link: 'Link' };
                                  return (
                                    <button
                                      key={t}
                                      type="button"
                                      onClick={() => setLessonForm(f => ({ ...f, type: t, url: '', content: '' }))}
                                      className={`flex flex-col items-center gap-1 p-2 rounded-lg border text-xs font-medium transition-all ${lessonForm.type === t ? `${colors.bg} ${colors.text} border-current` : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}
                                    >
                                      <Icon className="w-3.5 h-3.5" />
                                      {labels[t]}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          </div>

                          {lessonForm.type === 'video' && (
                            <div className="space-y-3">
                              <UploadZone
                                accept="video/mp4,video/webm,video/quicktime,video/x-msvideo,video/mpeg,video/ogg"
                                bucket="course-videos"
                                path={selectedCourse}
                                onUploaded={(url) => setLessonForm(f => ({ ...f, url }))}
                                label="Upload Video"
                                icon={Video}
                                hint="MP4, WebM, MOV — up to 5 GB"
                              />
                              <VideoHostingTips />
                              <div className="flex items-center gap-2">
                                <div className="h-px bg-slate-200 flex-1" />
                                <span className="text-xs text-slate-400 font-medium">or paste URL</span>
                                <div className="h-px bg-slate-200 flex-1" />
                              </div>
                              <input type="url" value={lessonForm.url} onChange={e => setLessonForm(f => ({ ...f, url: e.target.value }))} className="input-field text-sm" placeholder="YouTube / Vimeo / Bunny.net / direct video URL" />
                              {lessonForm.url && (
                                <div className="rounded-xl overflow-hidden border border-slate-200">
                                  <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border-b border-slate-200">
                                    <PlayCircle className="w-3.5 h-3.5 text-slate-400" />
                                    <span className="text-xs text-slate-500 font-medium">Preview</span>
                                  </div>
                                  <VideoPlayer url={lessonForm.url} />
                                </div>
                              )}
                            </div>
                          )}

                          {lessonForm.type === 'pdf' && (
                            <div className="space-y-3">
                              <UploadZone
                                accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx"
                                bucket="course-documents"
                                path={selectedCourse}
                                onUploaded={(url) => setLessonForm(f => ({ ...f, url }))}
                                label="Upload Document"
                                icon={FileText}
                                hint="PDF, Word, PowerPoint — up to 5 GB"
                              />
                              <div className="flex items-center gap-2">
                                <div className="h-px bg-slate-200 flex-1" />
                                <span className="text-xs text-slate-400 font-medium">or paste URL</span>
                                <div className="h-px bg-slate-200 flex-1" />
                              </div>
                              <input type="url" value={lessonForm.url} onChange={e => setLessonForm(f => ({ ...f, url: e.target.value }))} className="input-field text-sm" placeholder="Direct PDF URL" />
                              {lessonForm.url && lessonForm.url.includes('.pdf') && <PDFViewer url={lessonForm.url} />}
                            </div>
                          )}

                          {lessonForm.type === 'article' && (
                            <div className="space-y-3">
                              <Suspense fallback={null}>
                                <AILessonToolbar
                                  lessonTitle={lessonForm.title}
                                  courseContext={courses.find(c => c.id === selectedCourse)?.title || ''}
                                  currentContent={lessonForm.content}
                                  onContentChange={html => setLessonForm(f => ({ ...f, content: html }))}
                                />
                              </Suspense>
                              <div>
                                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Article Content</label>
                                <textarea value={lessonForm.content} onChange={e => setLessonForm(f => ({ ...f, content: e.target.value }))} className="input-field resize-none text-sm leading-relaxed" rows={7} placeholder="Write your lesson content here. You can use plain text or markdown formatting." />
                              </div>
                            </div>
                          )}

                          {lessonForm.type === 'link' && (
                            <div>
                              <label className="block text-xs font-semibold text-slate-500 mb-1.5">External URL</label>
                              <div className="relative">
                                <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <input type="url" value={lessonForm.url} onChange={e => setLessonForm(f => ({ ...f, url: e.target.value }))} className="input-field pl-9 text-sm" placeholder="https://..." required />
                              </div>
                            </div>
                          )}

                          <div className="flex items-center gap-4 pt-1 flex-wrap">
                            <div className="flex items-center gap-2">
                              <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <label className="text-xs font-semibold text-slate-500 whitespace-nowrap">Duration</label>
                              <input type="number" min="1" step="1" value={lessonForm.duration_minutes} onChange={e => setLessonForm(f => ({ ...f, duration_minutes: parseInt(e.target.value) || 1 }))} className="input-field text-sm py-1.5 w-24" />
                              <span className="text-xs text-slate-400">min</span>
                            </div>
                            <label className="flex items-center gap-2 cursor-pointer select-none">
                              <div className={`w-8 h-5 rounded-full transition-colors flex items-center ${lessonForm.is_required ? 'bg-sky-500' : 'bg-slate-200'}`} onClick={() => setLessonForm(f => ({ ...f, is_required: !f.is_required }))}>
                                <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform mx-0.5 ${lessonForm.is_required ? 'translate-x-3' : 'translate-x-0'}`} />
                              </div>
                              <span className="text-xs font-semibold text-slate-600">Required</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer select-none">
                              <div className={`w-8 h-5 rounded-full transition-colors flex items-center ${lessonForm.is_preview ? 'bg-green-500' : 'bg-slate-200'}`} onClick={() => setLessonForm(f => ({ ...f, is_preview: !f.is_preview }))}>
                                <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform mx-0.5 ${lessonForm.is_preview ? 'translate-x-3' : 'translate-x-0'}`} />
                              </div>
                              <span className="text-xs font-semibold text-slate-600">Free preview</span>
                            </label>
                          </div>

                          <div className="flex gap-2 pt-1">
                            <button type="submit" className="btn-primary text-sm py-2 flex items-center gap-2">
                              <Check className="w-4 h-4" /> Add Lesson
                            </button>
                            <button type="button" onClick={() => setAddingLessonTo(null)} className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-white transition-colors">
                              Cancel
                            </button>
                          </div>
                        </div>
                      </form>
                    )}
                  </SectionCard>
                ))}

                {sections.length === 0 && (
                  <div className="lms-panel">
                    <div className="flex flex-col items-center justify-center py-16 text-center px-6">
                      <div className="w-14 h-14 bg-sky-100 rounded-2xl flex items-center justify-center mb-4">
                        <Layers className="w-7 h-7 text-sky-400" />
                      </div>
                      <h3 className="font-bold text-slate-800 mb-1">No sections yet</h3>
                      <p className="text-sm text-slate-500 max-w-xs">Add a section to organize your course content into modules or weeks.</p>
                    </div>
                  </div>
                )}

                {addingSection ? (
                  <form onSubmit={handleAddSection} className="lms-panel">
                    <div className="px-4 py-3 bg-sky-50 border-b border-sky-100 flex items-center gap-2">
                      <div className="w-5 h-5 bg-sky-500 rounded-full flex items-center justify-center shrink-0">
                        <Plus className="w-3 h-3 text-white" />
                      </div>
                      <span className="text-sm font-bold text-sky-700">New Section</span>
                    </div>
                    <div className="p-4 flex gap-3">
                      <input autoFocus type="text" value={sectionTitle} onChange={e => setSectionTitle(e.target.value)} className="input-field flex-1 text-sm" placeholder="e.g. Week 1 — Introduction to Reading Skills" />
                      <button type="submit" className="btn-primary text-sm py-2 px-4 whitespace-nowrap">Add Section</button>
                      <button type="button" onClick={() => setAddingSection(false)} className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors whitespace-nowrap">Cancel</button>
                    </div>
                  </form>
                ) : (
                  <button
                    onClick={() => setAddingSection(true)}
                    className="flex items-center justify-center gap-2.5 w-full py-4 border-2 border-dashed border-slate-300 rounded-xl text-sm font-semibold text-slate-500 hover:border-sky-400 hover:text-sky-600 hover:bg-sky-50 transition-all"
                  >
                    <div className="w-6 h-6 rounded-full border-2 border-current flex items-center justify-center">
                      <Plus className="w-3.5 h-3.5" />
                    </div>
                    Add New Section
                  </button>
                )}
              </div>
            )}

            {/* ─── Exams Tab ──────────────────────────────────────────────── */}
            {activeTab === 'exams' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <h2 className="font-bold text-slate-800">Exams</h2>
                    <p className="text-sm text-slate-500 mt-0.5">Reading comprehension and open-answer assessments — AI graded, teacher reviewed</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setShowAIExamGenerator(true)} className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded-lg transition-colors">
                      <Sparkles className="w-4 h-4" /> Generate with AI
                    </button>
                    <button onClick={() => { setShowExamCreate(true); setExamForm({ title: '', description: '', instructions: 'Read the passage carefully and answer all questions in full sentences.', passage: '', time_limit_minutes: '60' }); setExamQuestions([{ question: '', marks: 5, sample_answer: '' }]); }} className="btn-primary text-sm py-2 flex items-center gap-2">
                      <Plus className="w-4 h-4" /> New Exam
                    </button>
                  </div>
                </div>

                {exams.length === 0 ? (
                  <div className="text-center py-14 text-slate-400 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
                    <ClipboardList className="w-10 h-10 mx-auto mb-3 opacity-40" />
                    <p className="font-semibold text-slate-500">No exams yet</p>
                    <p className="text-sm mt-1">Create reading comprehension or open-answer exams for this course</p>
                    <button onClick={() => setShowExamCreate(true)} className="mt-4 btn-primary text-sm py-2 flex items-center gap-2 mx-auto">
                      <Plus className="w-4 h-4" /> Create First Exam
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {exams.map(exam => {
                      const isExpanded = expandedExam === exam.id;
                      return (
                        <div key={exam.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                          <div className="flex items-center gap-3 px-4 py-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-sm font-bold text-slate-800">{exam.title}</p>
                                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${exam.is_published ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                                  {exam.is_published ? 'Published' : 'Draft'}
                                </span>
                              </div>
                              <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5 flex-wrap">
                                <span>{exam.questions.length} question{exam.questions.length !== 1 ? 's' : ''}</span>
                                <span>{exam.total_marks} marks</span>
                                {exam.time_limit_minutes > 0 && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{exam.time_limit_minutes}m</span>}
                                {exam.passage && <span className="text-sky-500">Reading passage included</span>}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                onClick={async () => {
                                  const { error } = await supabase.from('exams').update({ is_published: !exam.is_published }).eq('id', exam.id);
                                  if (!error) fetchExams();
                                }}
                                className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${exam.is_published ? 'text-slate-600 border-slate-200 hover:bg-slate-50' : 'text-emerald-600 border-emerald-200 hover:bg-emerald-50'}`}
                              >
                                {exam.is_published ? 'Unpublish' : 'Publish'}
                              </button>
                              <button
                                onClick={() => setExpandedExam(isExpanded ? null : exam.id)}
                                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                              >
                                {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                              </button>
                              <button
                                onClick={async () => {
                                  if (!confirm('Delete this exam and all submissions?')) return;
                                  await supabase.from('exams').delete().eq('id', exam.id);
                                  fetchExams();
                                }}
                                className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>

                          {isExpanded && (
                            <div className="border-t border-slate-100 bg-slate-50 px-4 py-4 space-y-4">
                              {/* Passage preview */}
                              {exam.passage && (
                                <div>
                                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1.5">Reading Passage</p>
                                  <p className="text-sm text-slate-600 bg-white border border-slate-200 rounded-lg p-3 line-clamp-4">{exam.passage}</p>
                                </div>
                              )}
                              {/* Questions list */}
                              <div>
                                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Questions</p>
                                <div className="space-y-2">
                                  {exam.questions.map((q, qi) => (
                                    <div key={q.id} className="flex items-start gap-3 bg-white border border-slate-200 rounded-lg px-3 py-2.5">
                                      <span className="text-xs font-bold text-slate-400 mt-0.5 shrink-0">Q{qi + 1}</span>
                                      <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-slate-700">{q.question}</p>
                                        {q.sample_answer && <p className="text-xs text-slate-400 mt-0.5 truncate">Model: {q.sample_answer}</p>}
                                      </div>
                                      <span className="text-xs font-bold text-teal-600 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-full shrink-0">{q.marks}m</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Create Exam modal */}
                {showExamCreate && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
                    <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
                      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                        <h3 className="font-bold text-slate-900 text-lg">Create Exam</h3>
                        <button onClick={() => setShowExamCreate(false)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="p-6 space-y-5">
                        {/* Basic details */}
                        <div className="grid grid-cols-2 gap-4">
                          <div className="col-span-2">
                            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Exam Title <span className="text-red-500">*</span></label>
                            <input type="text" value={examForm.title} onChange={e => setExamForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. IELTS Reading Practice — Academic Band 7" className="input-field text-sm w-full" />
                          </div>
                          <div className="col-span-2">
                            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Description</label>
                            <input type="text" value={examForm.description} onChange={e => setExamForm(f => ({ ...f, description: e.target.value }))} placeholder="Brief description shown to students" className="input-field text-sm w-full" />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Time Limit (minutes, 0 = no limit)</label>
                            <input type="number" min={0} step="1" value={examForm.time_limit_minutes} onChange={e => setExamForm(f => ({ ...f, time_limit_minutes: e.target.value }))} className="input-field text-sm w-full" />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Instructions for Students</label>
                            <input type="text" value={examForm.instructions} onChange={e => setExamForm(f => ({ ...f, instructions: e.target.value }))} className="input-field text-sm w-full" />
                          </div>
                        </div>

                        {/* Passage */}
                        <div>
                          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Reading Passage / Stimulus Text</label>
                          <p className="text-xs text-slate-400 mb-2">Paste the article, paragraph, or stimulus students read before answering. Leave blank for pure question-answer format.</p>
                          <textarea
                            value={examForm.passage}
                            onChange={e => setExamForm(f => ({ ...f, passage: e.target.value }))}
                            placeholder="Paste the reading passage here (e.g. IELTS Academic Reading text, news article, literature extract)..."
                            rows={6}
                            className="input-field text-sm w-full resize-none"
                          />
                        </div>

                        {/* Questions */}
                        <div>
                          <div className="flex items-center justify-between mb-3">
                            <label className="text-xs font-semibold text-slate-600">Questions</label>
                            <button type="button" onClick={() => setExamQuestions(q => [...q, { question: '', marks: 5, sample_answer: '' }])} className="text-xs font-semibold text-teal-600 hover:text-teal-700 flex items-center gap-1 border border-teal-200 hover:bg-teal-50 rounded-lg px-3 py-1.5 transition-colors">
                              <Plus className="w-3 h-3" /> Add Question
                            </button>
                          </div>
                          <div className="space-y-3">
                            {examQuestions.map((q, idx) => (
                              <div key={idx} className="border border-slate-200 rounded-xl p-4 bg-slate-50">
                                <div className="flex items-center justify-between mb-3">
                                  <span className="text-xs font-bold text-slate-500">Question {idx + 1}</span>
                                  {examQuestions.length > 1 && (
                                    <button type="button" onClick={() => setExamQuestions(qs => qs.filter((_, i) => i !== idx))} className="p-1 text-slate-400 hover:text-red-500 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                                  )}
                                </div>
                                <div className="space-y-3">
                                  <div className="flex gap-3">
                                    <div className="flex-1">
                                      <label className="block text-xs font-semibold text-slate-500 mb-1">Question Text <span className="text-red-500">*</span></label>
                                      <textarea value={q.question} onChange={e => setExamQuestions(qs => qs.map((x, i) => i === idx ? { ...x, question: e.target.value } : x))} placeholder="e.g. According to the passage, what are the two main causes mentioned by the author?" rows={2} className="input-field text-sm w-full resize-none" />
                                    </div>
                                    <div className="w-20 shrink-0">
                                      <label className="block text-xs font-semibold text-slate-500 mb-1">Marks</label>
                                      <input type="number" min={1} step="1" value={q.marks} onChange={e => setExamQuestions(qs => qs.map((x, i) => i === idx ? { ...x, marks: parseInt(e.target.value) || 1 } : x))} className="input-field text-sm w-full" />
                                    </div>
                                  </div>
                                  <div>
                                    <label className="block text-xs font-semibold text-slate-500 mb-1">Model Answer <span className="text-slate-400 font-normal">(AI uses this to grade students)</span></label>
                                    <textarea value={q.sample_answer} onChange={e => setExamQuestions(qs => qs.map((x, i) => i === idx ? { ...x, sample_answer: e.target.value } : x))} placeholder="Write the ideal answer. Be specific — the more detail, the better the AI grading." rows={2} className="input-field text-sm w-full resize-none text-slate-600" />
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                          <div className="flex items-center justify-between mt-2 text-xs text-slate-400">
                            <span>{examQuestions.length} question{examQuestions.length !== 1 ? 's' : ''}</span>
                            <span className="font-semibold text-teal-600">Total: {examQuestions.reduce((s, q) => s + q.marks, 0)} marks</span>
                          </div>
                        </div>

                        <div className="flex gap-3 pt-2 border-t border-slate-100">
                          <button type="button" onClick={() => setShowExamCreate(false)} className="flex-1 px-4 py-2.5 text-sm border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 font-medium transition-colors">Cancel</button>
                          <button
                            type="button"
                            disabled={savingExam}
                            onClick={async () => {
                              if (!selectedCourse || !profile) return;
                              if (!examForm.title.trim()) { return; }
                              if (examQuestions.some(q => !q.question.trim())) { return; }
                              setSavingExam(true);
                              try {
                                const totalMarks = examQuestions.reduce((s, q) => s + q.marks, 0);
                                const { data: exam, error } = await supabase.from('exams').insert({
                                  course_id: selectedCourse,
                                  teacher_id: profile.id,
                                  title: examForm.title,
                                  description: examForm.description,
                                  instructions: examForm.instructions,
                                  passage: examForm.passage,
                                  time_limit_minutes: parseInt(examForm.time_limit_minutes) || 0,
                                  total_marks: totalMarks,
                                  is_published: false,
                                }).select().single();
                                if (error) throw error;
                                const qRows = examQuestions.map((q, i) => ({ exam_id: exam.id, question: q.question, marks: q.marks, sample_answer: q.sample_answer, order_index: i }));
                                await supabase.from('exam_questions').insert(qRows);
                                setShowExamCreate(false);
                                fetchExams();
                              } catch {
                                // silent — user sees no change, can retry
                              } finally {
                                setSavingExam(false);
                              }
                            }}
                            className="flex-1 btn-primary text-sm py-2.5 flex items-center justify-center gap-2 disabled:opacity-60"
                          >
                            {savingExam ? <><div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Saving...</> : <><Plus className="w-4 h-4" /> Create Exam</>}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                {/* AI Exam Generator modal */}
                {showAIExamGenerator && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
                    <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
                      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-sky-50 to-white">
                        <div className="flex items-center gap-2">
                          <Sparkles className="w-5 h-5 text-sky-500" />
                          <h3 className="font-bold text-slate-900">Generate Exam with AI</h3>
                        </div>
                        <button onClick={() => setShowAIExamGenerator(false)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="p-6 space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="col-span-2">
                            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Topic / Subject <span className="text-red-500">*</span></label>
                            <input
                              type="text"
                              value={aiExamForm.topic}
                              onChange={e => setAIExamForm(f => ({ ...f, topic: e.target.value }))}
                              placeholder="e.g. IELTS Academic Reading — Environmental Issues"
                              className="input-field text-sm w-full"
                            />
                          </div>
                          <div className="col-span-2">
                            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Exam Type</label>
                            <div className="grid grid-cols-2 gap-2">
                              {(['reading_comprehension', 'question_only'] as const).map(t => (
                                <button
                                  key={t}
                                  type="button"
                                  onClick={() => setAIExamForm(f => ({ ...f, exam_type: t }))}
                                  className={`py-2.5 px-3 rounded-lg border text-sm font-medium transition-colors text-left ${aiExamForm.exam_type === t ? 'bg-sky-50 border-sky-400 text-sky-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                                >
                                  {t === 'reading_comprehension' ? '📖 Reading Comprehension' : '✍️ Question Only'}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Difficulty / Level</label>
                            <select value={aiExamForm.difficulty} onChange={e => setAIExamForm(f => ({ ...f, difficulty: e.target.value }))} className="input-field text-sm w-full">
                              <option value="beginner">Beginner</option>
                              <option value="intermediate">Intermediate</option>
                              <option value="upper_intermediate">Upper Intermediate (Band 6-7)</option>
                              <option value="advanced">Advanced (Band 7-8)</option>
                              <option value="proficient">Proficient (Band 8-9)</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Target Audience</label>
                            <input type="text" value={aiExamForm.target_audience} onChange={e => setAIExamForm(f => ({ ...f, target_audience: e.target.value }))} placeholder="e.g. Adult IELTS candidates" className="input-field text-sm w-full" />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Number of Questions</label>
                            <select value={aiExamForm.num_questions} onChange={e => setAIExamForm(f => ({ ...f, num_questions: parseInt(e.target.value) }))} className="input-field text-sm w-full">
                              {[3,4,5,6,7,8,10].map(n => <option key={n} value={n}>{n} questions</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Marks per Question</label>
                            <select value={aiExamForm.marks_per_question} onChange={e => setAIExamForm(f => ({ ...f, marks_per_question: parseInt(e.target.value) }))} className="input-field text-sm w-full">
                              {[2,3,4,5,8,10].map(n => <option key={n} value={n}>{n} marks</option>)}
                            </select>
                          </div>
                          <div className="col-span-2">
                            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Extra Instructions <span className="text-slate-400 font-normal">(optional)</span></label>
                            <input type="text" value={aiExamForm.extra_instructions} onChange={e => setAIExamForm(f => ({ ...f, extra_instructions: e.target.value }))} placeholder="e.g. Focus on inference questions, use formal register" className="input-field text-sm w-full" />
                          </div>
                        </div>
                        <div className="bg-sky-50 rounded-xl p-3 text-xs text-sky-700">
                          AI will generate a full exam: {aiExamForm.exam_type === 'reading_comprehension' ? 'reading passage + ' : ''}{aiExamForm.num_questions} questions with model answers · {aiExamForm.num_questions * aiExamForm.marks_per_question} total marks
                        </div>
                        <div className="flex gap-3 pt-1">
                          <button type="button" onClick={() => setShowAIExamGenerator(false)} className="flex-1 px-4 py-2.5 text-sm border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 font-medium transition-colors">Cancel</button>
                          <button
                            type="button"
                            disabled={generatingExam || !aiExamForm.topic.trim() || !selectedCourse}
                            onClick={async () => {
                              if (!selectedCourse || !profile) return;
                              setGeneratingExam(true);
                              try {
                                const { generateExam } = await import('../../lib/ai');
                                const courseData = courses.find(c => c.id === selectedCourse);
                                const result = await generateExam({
                                  topic: aiExamForm.topic,
                                  course_context: courseData?.title || '',
                                  exam_type: aiExamForm.exam_type,
                                  difficulty: aiExamForm.difficulty,
                                  num_questions: aiExamForm.num_questions,
                                  marks_per_question: aiExamForm.marks_per_question,
                                  target_audience: aiExamForm.target_audience,
                                  extra_instructions: aiExamForm.extra_instructions,
                                });
                                // Save to DB
                                const totalMarks = result.questions.reduce((s, q) => s + q.marks, 0);
                                const { data: exam, error } = await supabase.from('exams').insert({
                                  course_id: selectedCourse,
                                  teacher_id: profile.id,
                                  title: result.title,
                                  description: result.description,
                                  instructions: result.instructions,
                                  passage: result.passage,
                                  time_limit_minutes: result.time_limit_minutes,
                                  total_marks: totalMarks,
                                  is_published: false,
                                }).select().single();
                                if (error) throw error;
                                const qRows = result.questions.map((q, i) => ({
                                  exam_id: exam.id,
                                  question: q.question,
                                  marks: q.marks,
                                  sample_answer: q.sample_answer,
                                  order_index: i,
                                }));
                                await supabase.from('exam_questions').insert(qRows);
                                setShowAIExamGenerator(false);
                                fetchExams();
                              } catch {
                                // silent retry available
                              } finally {
                                setGeneratingExam(false);
                              }
                            }}
                            className="flex-1 btn-primary text-sm py-2.5 flex items-center justify-center gap-2 disabled:opacity-60"
                          >
                            {generatingExam
                              ? <><div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Generating...</>
                              : <><Sparkles className="w-4 h-4" /> Generate Exam</>
                            }
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'flashcards' && (
              <div className="space-y-4">
                <div>
                  <h2 className="font-bold text-slate-800">Flashcards</h2>
                  <p className="text-sm text-slate-500 mt-0.5">Create and manage flashcards for lessons</p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Select Lesson</label>
                  <select
                    value={flashcardsLessonId}
                    onChange={e => {
                      setFlashcardsLessonId(e.target.value);
                      if (e.target.value) fetchFlashcards(e.target.value);
                    }}
                    className="input-field max-w-sm"
                  >
                    <option value="">Choose a lesson...</option>
                    {sections.flatMap(s => s.lessons.map(l => (
                      <option key={l.id} value={l.id}>{s.title} — {l.title}</option>
                    )))}
                  </select>
                </div>
                {flashcardsLessonId && (
                  <Suspense fallback={<div className="text-sm text-slate-400">Loading flashcards...</div>}>
                    <FlashcardsManager
                      lessonId={flashcardsLessonId}
                      courseId={selectedCourse}
                      lessonContent={(() => {
                        const lesson = sections.flatMap(s => s.lessons).find(l => l.id === flashcardsLessonId);
                        return lesson?.content || '';
                      })()}
                      initialCards={flashcardsList}
                      onUpdate={() => fetchFlashcards(flashcardsLessonId)}
                    />
                  </Suspense>
                )}
                {!flashcardsLessonId && (
                  <div className="lms-panel">
                    <div className="flex flex-col items-center justify-center py-14 text-center px-6">
                      <div className="w-12 h-12 bg-sky-100 rounded-2xl flex items-center justify-center mb-4">
                        <LayoutList className="w-6 h-6 text-sky-400" />
                      </div>
                      <h3 className="font-bold text-slate-800 mb-1">Select a lesson</h3>
                      <p className="text-sm text-slate-500 max-w-xs">Choose a lesson above to view, generate, or edit its flashcards.</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'quizzes' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <h2 className="font-bold text-slate-800">Quizzes</h2>
                    <p className="text-sm text-slate-500 mt-0.5">Test student knowledge and track progress</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowAIQuizFromCurriculum(true)}
                      className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded-xl transition-colors"
                    >
                      <Sparkles className="w-4 h-4" /> Generate with AI
                    </button>
                    <button onClick={() => setShowQuizCreate(true)} className="btn-primary text-sm py-2 flex items-center gap-2">
                      <Plus className="w-4 h-4" /> New Quiz
                    </button>
                  </div>
                </div>

                {quizzes.length === 0 && (
                  <div className="lms-panel">
                    <div className="flex flex-col items-center justify-center py-16 text-center px-6">
                      <div className="w-14 h-14 bg-sky-100 rounded-2xl flex items-center justify-center mb-4">
                        <HelpCircle className="w-7 h-7 text-sky-400" />
                      </div>
                      <h3 className="font-bold text-slate-800 mb-1">No quizzes yet</h3>
                      <p className="text-sm text-slate-500 max-w-xs mb-4">Create quizzes to assess student understanding and provide feedback.</p>
                      <button onClick={() => setShowAIQuizFromCurriculum(true)} className="flex items-center gap-2 px-4 py-2.5 mb-2 text-sm font-semibold text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded-xl transition-colors">
                        <Sparkles className="w-4 h-4" /> Generate Quiz with AI
                      </button>
                      <button onClick={() => setShowQuizCreate(true)} className="btn-primary text-sm py-2 flex items-center gap-2">
                        <Plus className="w-4 h-4" /> Create First Quiz
                      </button>
                    </div>
                  </div>
                )}

                {quizzes.map(quiz => (
                  <div key={quiz.id} className="lms-panel">
                    <div
                      className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-slate-50 transition-colors"
                      onClick={() => setExpandedQuiz(expandedQuiz === quiz.id ? null : quiz.id)}
                    >
                      <div className="w-10 h-10 bg-sky-100 rounded-xl flex items-center justify-center shrink-0">
                        <HelpCircle className="w-5 h-5 text-sky-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-bold text-slate-800">{quiz.title}</h3>
                          <span className="badge badge-sky">{quiz.questions?.length || 0} questions</span>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-slate-500 flex-wrap">
                          <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{quiz.time_limit_minutes ? `${quiz.time_limit_minutes} min` : 'No time limit'}</span>
                          <span className="flex items-center gap-1"><Award className="w-3 h-3" />Pass: {quiz.pass_mark}%</span>
                          <span className="flex items-center gap-1"><CheckCircle className="w-3 h-3" />{quiz.max_attempts} attempt{quiz.max_attempts !== 1 ? 's' : ''}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={e => { e.stopPropagation(); setAiQuizTarget(quiz.id); }}
                          className="p-1.5 rounded-lg text-sky-400 hover:text-sky-600 hover:bg-sky-50 transition-colors"
                          title="Generate questions with AI"
                        >
                          <Sparkles className="w-4 h-4" />
                        </button>
                        <button onClick={e => { e.stopPropagation(); setDeleteTarget({ type: 'quiz', id: quiz.id, name: quiz.title }); }} className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                        <div className={`p-1.5 rounded-lg text-slate-400 transition-transform ${expandedQuiz === quiz.id ? 'rotate-180' : ''}`}>
                          <ChevronDown className="w-5 h-5" />
                        </div>
                      </div>
                    </div>

                    {expandedQuiz === quiz.id && (
                      <div className="border-t border-slate-100">
                        <div className="p-4 space-y-3">
                          {quiz.questions && quiz.questions.length > 0 ? quiz.questions.map((q, idx) => (
                            <div key={q.id} className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                              <div className="flex items-start gap-3">
                                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-sky-100 text-sky-700 text-xs font-bold shrink-0 mt-0.5">{idx + 1}</span>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-semibold text-slate-800">{q.question}</p>
                                  <div className="flex items-center gap-2 mt-1.5">
                                    <span className="badge badge-sky capitalize">{q.type.replace('_', ' ')}</span>
                                    <span className="text-xs text-slate-400">{q.points} pt{q.points !== 1 ? 's' : ''}</span>
                                  </div>
                                  {q.options && q.options.length > 0 && (
                                    <div className="mt-2.5 grid grid-cols-2 gap-1.5">
                                      {q.options.map((opt, i) => (
                                        <div key={i} className={`text-xs px-3 py-2 rounded-lg flex items-center gap-2 ${opt === q.correct_answer ? 'bg-green-100 text-green-700 font-semibold' : 'bg-white border border-slate-200 text-slate-600'}`}>
                                          {opt === q.correct_answer ? <CheckCircle className="w-3 h-3 shrink-0" /> : <div className="w-3 h-3 rounded-full border border-slate-300 shrink-0" />}
                                          {opt}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                  {q.type === 'short_answer' && (
                                    <p className="text-xs text-green-700 mt-2 flex items-center gap-1 bg-green-50 px-3 py-1.5 rounded-lg">
                                      <CheckCircle className="w-3 h-3 shrink-0" /> Expected: {q.correct_answer}
                                    </p>
                                  )}
                                </div>
                                <button onClick={() => setDeleteTarget({ type: 'question', id: q.id, name: q.question.slice(0, 40) })} className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          )) : (
                            <div className="text-center py-6">
                              <p className="text-sm text-slate-400 font-medium">No questions yet</p>
                            </div>
                          )}

                          {addingQuestionTo === quiz.id ? (
                            <form onSubmit={handleAddQuestion} className="bg-white border border-sky-200 rounded-xl p-4 space-y-3">
                              <div className="flex items-center gap-2 mb-1">
                                <div className="w-5 h-5 bg-sky-500 rounded-full flex items-center justify-center shrink-0">
                                  <Plus className="w-3 h-3 text-white" />
                                </div>
                                <span className="text-sm font-bold text-sky-700">New Question</span>
                              </div>
                              <textarea value={questionForm.question} onChange={e => setQuestionForm(f => ({ ...f, question: e.target.value }))} className="input-field resize-none text-sm" rows={2} placeholder="Enter your question here..." required />
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">Question Type</label>
                                  <select value={questionForm.type} onChange={e => { const t = e.target.value as typeof questionForm.type; setQuestionForm(f => ({ ...f, type: t, options: t === 'true_false' ? ['True', 'False'] : ['', '', '', ''], correct_answer: '' })); }} className="input-field text-sm">
                                    <option value="mcq">Multiple Choice</option>
                                    <option value="true_false">True / False</option>
                                    <option value="short_answer">Short Answer</option>
                                  </select>
                                </div>
                                <div>
                                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">Points</label>
                                  <input type="number" min="1" value={questionForm.points} onChange={e => setQuestionForm(f => ({ ...f, points: parseInt(e.target.value) || 1 }))} className="input-field text-sm" />
                                </div>
                              </div>

                              {questionForm.type === 'mcq' && (
                                <div className="space-y-2">
                                  <label className="text-xs font-semibold text-slate-500">Answer Options — click radio to mark correct</label>
                                  {questionForm.options.map((opt, i) => (
                                    <div key={i} className={`flex items-center gap-2 p-2 rounded-lg border transition-colors ${questionForm.correct_answer === opt && opt.trim() ? 'border-green-300 bg-green-50' : 'border-slate-200 bg-white'}`}>
                                      <input type="radio" name="correct_mcq" checked={questionForm.correct_answer === opt && opt.trim() !== ''} onChange={() => opt.trim() && setQuestionForm(f => ({ ...f, correct_answer: opt }))} className="accent-green-500 shrink-0" />
                                      <input type="text" value={opt} onChange={e => { const newOpts = [...questionForm.options]; newOpts[i] = e.target.value; setQuestionForm(f => ({ ...f, options: newOpts })); }} className="flex-1 text-sm bg-transparent focus:outline-none text-slate-800 placeholder-slate-300" placeholder={`Option ${i + 1}`} />
                                    </div>
                                  ))}
                                </div>
                              )}

                              {questionForm.type === 'true_false' && (
                                <div className="flex gap-3">
                                  {['True', 'False'].map(v => (
                                    <label key={v} className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border cursor-pointer text-sm font-semibold transition-all ${questionForm.correct_answer === v ? 'border-green-500 bg-green-50 text-green-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                                      <input type="radio" name="correct_tf" value={v} checked={questionForm.correct_answer === v} onChange={() => setQuestionForm(f => ({ ...f, correct_answer: v }))} className="sr-only" />
                                      {v === 'True' ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                                      {v}
                                    </label>
                                  ))}
                                </div>
                              )}

                              {questionForm.type === 'short_answer' && (
                                <div>
                                  <label className="text-xs font-semibold text-slate-500 mb-1.5 block">Expected Answer (for marking guidance)</label>
                                  <input type="text" value={questionForm.correct_answer} onChange={e => setQuestionForm(f => ({ ...f, correct_answer: e.target.value }))} className="input-field text-sm" placeholder="Expected answer..." required />
                                </div>
                              )}

                              {!questionForm.correct_answer && questionForm.type !== 'short_answer' && (
                                <p className="text-xs text-warning-600 flex items-center gap-1 bg-warning-50 px-3 py-2 rounded-lg">
                                  <AlertCircle className="w-3.5 h-3.5 shrink-0" /> Select the correct answer above
                                </p>
                              )}

                              <div className="flex gap-2 pt-1">
                                <button type="submit" className="btn-primary text-sm py-2 flex items-center gap-2"><Check className="w-4 h-4" /> Add Question</button>
                                <button type="button" onClick={() => setAddingQuestionTo(null)} className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">Cancel</button>
                              </div>
                            </form>
                          ) : (
                            <button
                              onClick={() => { setAddingQuestionTo(quiz.id); setQuestionForm({ question: '', type: 'mcq', options: ['', '', '', ''], correct_answer: '', points: 1 }); }}
                              className="flex items-center justify-center gap-2 w-full py-3 border-2 border-dashed border-slate-200 rounded-xl text-sm font-semibold text-slate-500 hover:border-sky-400 hover:text-sky-600 hover:bg-sky-50 transition-all"
                            >
                              <Plus className="w-4 h-4" /> Add Question
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* AI Quiz from Curriculum modal */}
      {showAIQuizFromCurriculum && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => { if (!aiQuizCreating) setShowAIQuizFromCurriculum(false); }} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm animate-slide-up">
            <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100">
              <div className="w-9 h-9 bg-sky-100 rounded-xl flex items-center justify-center shrink-0">
                <Sparkles className="w-5 h-5 text-sky-600" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-slate-900">Generate Quiz with AI</h3>
                <p className="text-xs text-slate-400 mt-0.5">Name your quiz, then pick a lesson to generate from</p>
              </div>
              {!aiQuizCreating && (
                <button onClick={() => setShowAIQuizFromCurriculum(false)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <form onSubmit={handleAIQuizFromCurriculum} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Quiz Title <span className="text-red-500">*</span></label>
                <input
                  autoFocus
                  type="text"
                  value={aiQuizNewName}
                  onChange={e => setAIQuizNewName(e.target.value)}
                  className="input-field"
                  placeholder="e.g. Reading Skills Assessment"
                  required
                />
              </div>
              <div className="flex items-start gap-2.5 bg-sky-50 border border-sky-200 rounded-xl px-4 py-3 text-xs text-sky-700">
                <Sparkles className="w-3.5 h-3.5 shrink-0 mt-0.5 text-sky-500" />
                The quiz will be created and the AI generator will open so you can pick a lesson from your curriculum and configure question types.
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowAIQuizFromCurriculum(false)} disabled={aiQuizCreating} className="flex-1 px-4 py-2.5 text-sm border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 font-medium transition-colors disabled:opacity-50">
                  Cancel
                </button>
                <button type="submit" disabled={aiQuizCreating || !aiQuizNewName.trim()} className="flex-1 btn-primary text-sm py-2.5 flex items-center justify-center gap-2 disabled:opacity-60">
                  {aiQuizCreating ? (
                    <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Creating...</>
                  ) : (
                    <><Sparkles className="w-4 h-4" /> Continue</>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showQuizCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowQuizCreate(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md animate-slide-up">
            <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100">
              <div className="w-9 h-9 bg-sky-100 rounded-xl flex items-center justify-center">
                <HelpCircle className="w-4.5 h-4.5 text-sky-600" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900">Create New Quiz</h3>
                <p className="text-xs text-slate-400 mt-0.5">Configure your quiz settings below</p>
              </div>
              <button onClick={() => setShowQuizCreate(false)} className="ml-auto p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreateQuiz} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Quiz Title <span className="text-red-500">*</span></label>
                <input type="text" value={quizForm.title} onChange={e => setQuizForm(f => ({ ...f, title: e.target.value }))} className="input-field" placeholder="e.g. Reading Skills Assessment" required />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Description</label>
                <input type="text" value={quizForm.description} onChange={e => setQuizForm(f => ({ ...f, description: e.target.value }))} className="input-field" placeholder="Optional description for students" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">Time Limit (min)</label>
                  <input type="number" min="1" value={quizForm.time_limit_minutes} onChange={e => setQuizForm(f => ({ ...f, time_limit_minutes: e.target.value }))} className="input-field text-sm" placeholder="None" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">Pass Mark (%)</label>
                  <input type="number" min="1" max="100" step="1" value={quizForm.pass_mark} onChange={e => setQuizForm(f => ({ ...f, pass_mark: parseInt(e.target.value) }))} className="input-field text-sm" required />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">Max Attempts</label>
                  <input type="number" min="1" step="1" value={quizForm.max_attempts} onChange={e => setQuizForm(f => ({ ...f, max_attempts: parseInt(e.target.value) }))} className="input-field text-sm" required />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowQuizCreate(false)} className="flex-1 px-4 py-2.5 text-sm border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 font-medium transition-colors">Cancel</button>
                <button type="submit" className="flex-1 btn-primary text-sm py-2.5 flex items-center justify-center gap-2">
                  <Plus className="w-4 h-4" /> Create Quiz
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={!!deleteTarget}
        title={`Delete ${deleteTarget?.type ? deleteTarget.type.charAt(0).toUpperCase() + deleteTarget.type.slice(1) : ''}`}
        message={`Are you sure you want to delete "${deleteTarget?.name}"?${deleteTarget?.type === 'section' ? ' All lessons in this section will also be permanently deleted.' : deleteTarget?.type === 'quiz' ? ' All questions will also be deleted.' : ''}`}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        confirmText="Delete"
      />

      {/* AI Course Generator Modal */}
      {showAIGenerator && (
        <Suspense fallback={null}>
          <AICourseGeneratorModal
            onClose={() => setShowAIGenerator(false)}
            navigatePrefix={role === 'admin' ? '/admin/builder' : '/teacher/builder'}
          />
        </Suspense>
      )}

      {/* AI Quiz Generator Modal */}
      {aiQuizTarget && (
        <Suspense fallback={null}>
          <AIQuizGeneratorModal
            quizId={aiQuizTarget}
            courseId={selectedCourse}
            lessons={sections.flatMap(s => s.lessons.map(l => ({ id: l.id, title: l.title, content: l.content })))}
            onClose={() => setAiQuizTarget(null)}
            onAdded={() => { fetchQuizzes(); setAiQuizTarget(null); }}
          />
        </Suspense>
      )}
    </DashboardLayout>
  );
}
