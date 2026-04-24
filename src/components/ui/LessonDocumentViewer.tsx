import { useState, useEffect } from 'react';
import { FileText, Presentation, ChevronLeft, ChevronRight, Download, BookOpen, X, Maximize2, Minimize2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface LessonDocument {
  id: string;
  type: 'notes' | 'slides' | 'handout';
  title: string;
  content_html: string;
  order_index: number;
}

interface Props {
  lessonId: string;
  courseId: string;
}

function downloadHtml(title: string, html: string, type: 'notes' | 'slides' | 'handout') {
  const isSlides = type === 'slides';
  const slideStyles = isSlides ? `
    .slides-deck { display: block; }
    .slide { page-break-after: always; border: 1px solid #e2e8f0; border-radius: 12px; padding: 40px 48px; margin-bottom: 32px; min-height: 400px; background: #fff; }
    .slide h2 { font-size: 24px; font-weight: 700; color: #0f172a; margin-bottom: 20px; padding-bottom: 12px; border-bottom: 3px solid #0ea5e9; }
    .slide h3 { font-size: 18px; font-weight: 600; color: #1e293b; margin-bottom: 12px; }
    .slide p { color: #334155; line-height: 1.7; margin-bottom: 12px; }
    .slide ul, .slide ol { color: #334155; padding-left: 24px; margin-bottom: 12px; }
    .slide li { margin-bottom: 6px; line-height: 1.6; }
    .speaker-notes { margin-top: 24px; padding: 14px 16px; background: #f8fafc; border-left: 4px solid #94a3b8; border-radius: 4px; font-size: 13px; color: #64748b; font-style: italic; }
  ` : `
    body { max-width: 780px; margin: 40px auto; }
    h2 { font-size: 22px; font-weight: 700; color: #0f172a; margin: 28px 0 12px; }
    h3 { font-size: 17px; font-weight: 600; color: #1e293b; margin: 20px 0 8px; }
    p { color: #334155; line-height: 1.75; margin-bottom: 14px; }
    ul, ol { color: #334155; padding-left: 24px; margin-bottom: 14px; }
    li { margin-bottom: 6px; line-height: 1.65; }
    blockquote { border-left: 4px solid #0ea5e9; margin: 0; padding: 12px 20px; background: #f0f9ff; color: #0369a1; border-radius: 4px; }
    strong { color: #0f172a; }
    code { background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; }
  `;
  const full = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1e293b; padding: 40px 24px; background: #f8fafc; line-height: 1.6; }
    ${slideStyles}
  </style>
</head>
<body>${html}</body>
</html>`;
  const blob = new Blob([full], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${title.replace(/[^a-z0-9]/gi, '_')}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

function SlidesViewer({ doc }: { doc: LessonDocument }) {
  const [slide, setSlide] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);

  // Parse slides from the slides-deck HTML
  const parser = typeof window !== 'undefined' ? new DOMParser() : null;
  const parsed = parser?.parseFromString(doc.content_html, 'text/html');
  const slideEls = parsed ? Array.from(parsed.querySelectorAll('.slide')) : [];
  const total = slideEls.length;

  const currentHtml = slideEls[slide]?.innerHTML || doc.content_html;
  const heading = slideEls[slide]?.querySelector('h2')?.textContent || '';

  return (
    <div className={`${fullscreen ? 'fixed inset-0 z-50 bg-slate-900 flex flex-col' : 'relative'}`}>
      {/* Slide toolbar */}
      <div className={`flex items-center gap-3 px-4 py-2.5 ${fullscreen ? 'bg-slate-800 border-b border-slate-700' : 'bg-slate-50 border-b border-slate-200 rounded-t-xl'}`}>
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${fullscreen ? 'bg-sky-900' : 'bg-sky-100'}`}>
          <Presentation className={`w-3.5 h-3.5 ${fullscreen ? 'text-sky-300' : 'text-sky-600'}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold truncate ${fullscreen ? 'text-white' : 'text-slate-800'}`}>{doc.title}</p>
          {total > 0 && <p className={`text-xs ${fullscreen ? 'text-slate-400' : 'text-slate-400'}`}>Slide {slide + 1} of {total}{heading ? ` — ${heading}` : ''}</p>}
        </div>
        <button
          onClick={() => downloadHtml(doc.title, doc.content_html, 'slides')}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${fullscreen ? 'text-sky-300 hover:bg-slate-700' : 'text-sky-600 hover:bg-sky-50 border border-sky-200'}`}
        >
          <Download className="w-3.5 h-3.5" /> Download
        </button>
        <button
          onClick={() => setFullscreen(f => !f)}
          className={`p-1.5 rounded-lg transition-colors ${fullscreen ? 'text-slate-300 hover:bg-slate-700' : 'text-slate-400 hover:bg-slate-100'}`}
        >
          {fullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>
        {fullscreen && (
          <button onClick={() => setFullscreen(false)} className="p-1.5 rounded-lg text-slate-300 hover:bg-slate-700 transition-colors">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Slide content */}
      <div className={`flex-1 overflow-hidden ${fullscreen ? 'flex items-center justify-center bg-slate-900 p-8' : ''}`}>
        <div className={`${fullscreen ? 'w-full max-w-4xl bg-white rounded-2xl shadow-2xl p-12 min-h-80' : 'p-6 bg-white min-h-64'}`}>
          <div
            className="prose prose-slate max-w-none text-sm leading-relaxed"
            dangerouslySetInnerHTML={{ __html: currentHtml }}
          />
        </div>
      </div>

      {/* Navigation */}
      {total > 1 && (
        <div className={`flex items-center justify-between px-4 py-3 ${fullscreen ? 'bg-slate-800 border-t border-slate-700' : 'bg-slate-50 border-t border-slate-200 rounded-b-xl'}`}>
          <button
            onClick={() => setSlide(s => Math.max(0, s - 1))}
            disabled={slide === 0}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors disabled:opacity-40 ${fullscreen ? 'text-white hover:bg-slate-700 disabled:hover:bg-transparent' : 'text-slate-600 hover:bg-slate-100 border border-slate-200'}`}
          >
            <ChevronLeft className="w-3.5 h-3.5" /> Previous
          </button>
          <div className="flex items-center gap-1">
            {Array.from({ length: total }).map((_, idx) => (
              <button
                key={idx}
                onClick={() => setSlide(idx)}
                className={`w-1.5 h-1.5 rounded-full transition-all ${idx === slide ? (fullscreen ? 'bg-sky-400 w-4' : 'bg-sky-500 w-4') : (fullscreen ? 'bg-slate-600' : 'bg-slate-300')}`}
              />
            ))}
          </div>
          <button
            onClick={() => setSlide(s => Math.min(total - 1, s + 1))}
            disabled={slide === total - 1}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors disabled:opacity-40 ${fullscreen ? 'text-white hover:bg-slate-700 disabled:hover:bg-transparent' : 'text-slate-600 hover:bg-slate-100 border border-slate-200'}`}
          >
            Next <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

function NotesViewer({ doc }: { doc: LessonDocument }) {
  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-2.5 bg-slate-50 border-b border-slate-200">
        <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
          <FileText className="w-3.5 h-3.5 text-emerald-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800 truncate">{doc.title}</p>
          <p className="text-xs text-slate-400">Lesson Notes</p>
        </div>
        <button
          onClick={() => downloadHtml(doc.title, doc.content_html, 'notes')}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-600 hover:bg-emerald-50 border border-emerald-200 rounded-lg transition-colors"
        >
          <Download className="w-3.5 h-3.5" /> Download
        </button>
      </div>
      <div className="p-5 bg-white">
        <div
          className="prose prose-slate prose-sm max-w-none leading-relaxed"
          dangerouslySetInnerHTML={{ __html: doc.content_html }}
        />
      </div>
    </div>
  );
}

export default function LessonDocumentViewer({ lessonId, courseId }: Props) {
  const [docs, setDocs] = useState<LessonDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeDoc, setActiveDoc] = useState<string | null>(null);

  useEffect(() => {
    if (!lessonId) return;
    setLoading(true);
    supabase
      .from('lesson_documents')
      .select('id, type, title, content_html, order_index')
      .eq('lesson_id', lessonId)
      .order('order_index')
      .then(({ data }) => {
        const docs = (data || []) as LessonDocument[];
        setDocs(docs);
        if (docs.length > 0) setActiveDoc(docs[0].id);
        setLoading(false);
      });
  }, [lessonId]);

  if (loading) return (
    <div className="flex items-center gap-2 py-4 text-xs text-slate-400">
      <div className="w-3.5 h-3.5 border-2 border-slate-200 border-t-slate-400 rounded-full animate-spin" />
      Loading documents...
    </div>
  );

  if (docs.length === 0) return null;

  const currentDoc = docs.find(d => d.id === activeDoc) || docs[0];

  return (
    <div className="space-y-3">
      {/* Tab selector */}
      {docs.length > 1 && (
        <div className="flex items-center gap-2 flex-wrap">
          {docs.map(doc => {
            const isNotes = doc.type === 'notes';
            const isActive = activeDoc === doc.id;
            return (
              <button
                key={doc.id}
                onClick={() => setActiveDoc(doc.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all ${
                  isActive
                    ? isNotes
                      ? 'bg-emerald-100 text-emerald-700 border-emerald-300'
                      : 'bg-sky-100 text-sky-700 border-sky-300'
                    : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                }`}
              >
                {isNotes ? <FileText className="w-3 h-3" /> : <Presentation className="w-3 h-3" />}
                {isNotes ? 'Lesson Notes' : 'Slides'}
              </button>
            );
          })}
        </div>
      )}

      {/* Viewer */}
      {currentDoc.type === 'slides' ? (
        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <SlidesViewer doc={currentDoc} />
        </div>
      ) : (
        <NotesViewer doc={currentDoc} />
      )}
    </div>
  );
}

// Compact document badges for the lesson row in curriculum builder
export function LessonDocumentBadges({ lessonId }: { lessonId: string }) {
  const [counts, setCounts] = useState<{ notes: number; slides: number } | null>(null);

  useEffect(() => {
    supabase
      .from('lesson_documents')
      .select('type')
      .eq('lesson_id', lessonId)
      .then(({ data }) => {
        if (!data) return;
        setCounts({
          notes: data.filter(d => d.type === 'notes').length,
          slides: data.filter(d => d.type === 'slides').length,
        });
      });
  }, [lessonId]);

  if (!counts || (counts.notes === 0 && counts.slides === 0)) return null;

  return (
    <span className="flex items-center gap-1">
      {counts.notes > 0 && (
        <span className="flex items-center gap-0.5 text-xs bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-medium">
          <FileText className="w-2.5 h-2.5" /> Notes
        </span>
      )}
      {counts.slides > 0 && (
        <span className="flex items-center gap-0.5 text-xs bg-sky-100 text-sky-700 px-1.5 py-0.5 rounded font-medium">
          <BookOpen className="w-2.5 h-2.5" /> Slides
        </span>
      )}
    </span>
  );
}
