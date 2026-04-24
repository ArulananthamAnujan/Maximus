import { useState, useEffect } from 'react';
import {
  FileText, Presentation, ChevronLeft, ChevronRight,
  Download, BookOpen, X, Maximize2, Minimize2, Loader2,
} from 'lucide-react';
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

// ─── Strip HTML tags to plain text ──────────────────────────────────────────
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Parse HTML into structured blocks for PDF rendering
interface TextBlock {
  type: 'h1' | 'h2' | 'h3' | 'p' | 'bullet' | 'quote';
  text: string;
}

function parseHtmlToBlocks(html: string): TextBlock[] {
  const blocks: TextBlock[] = [];
  const div = document.createElement('div');
  div.innerHTML = html;

  function processNode(node: Element) {
    const tag = node.tagName?.toLowerCase();
    const text = node.textContent?.trim() || '';
    if (!text) return;
    if (tag === 'h1') blocks.push({ type: 'h1', text });
    else if (tag === 'h2') blocks.push({ type: 'h2', text });
    else if (tag === 'h3') blocks.push({ type: 'h3', text });
    else if (tag === 'blockquote') blocks.push({ type: 'quote', text });
    else if (tag === 'li') blocks.push({ type: 'bullet', text });
    else if (tag === 'p') blocks.push({ type: 'p', text });
    else if (tag === 'ul' || tag === 'ol') {
      node.querySelectorAll('li').forEach(li => {
        blocks.push({ type: 'bullet', text: li.textContent?.trim() || '' });
      });
      return;
    } else if (node.children.length > 0) {
      Array.from(node.children).forEach(child => processNode(child as Element));
      return;
    } else {
      blocks.push({ type: 'p', text });
    }
  }

  Array.from(div.children).forEach(child => processNode(child as Element));
  return blocks.filter(b => b.text.length > 0);
}

// ─── PDF generation (jspdf) ─────────────────────────────────────────────────
async function generatePdf(title: string, contentHtml: string) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const pageW = 210;
  const pageH = 297;
  const marginL = 20;
  const marginR = 20;
  const marginT = 20;
  const marginB = 20;
  const usableW = pageW - marginL - marginR;
  let y = marginT;

  const addPage = () => { doc.addPage(); y = marginT; };
  const checkPage = (needed: number) => { if (y + needed > pageH - marginB) addPage(); };

  // Header bar
  doc.setFillColor(15, 118, 110);
  doc.rect(0, 0, pageW, 14, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('LESSON NOTES', marginL, 9);
  doc.text(new Date().toLocaleDateString(), pageW - marginR, 9, { align: 'right' });

  y = 24;

  // Title
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  const titleLines = doc.splitTextToSize(title, usableW);
  titleLines.forEach((line: string) => {
    checkPage(10);
    doc.text(line, marginL, y);
    y += 10;
  });

  // Divider
  doc.setDrawColor(14, 165, 233);
  doc.setLineWidth(0.8);
  doc.line(marginL, y + 2, pageW - marginR, y + 2);
  y += 8;

  const blocks = parseHtmlToBlocks(contentHtml);

  for (const block of blocks) {
    if (block.type === 'h2') {
      checkPage(14);
      y += 4;
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 118, 110);
      const lines = doc.splitTextToSize(block.text, usableW);
      lines.forEach((line: string) => { checkPage(8); doc.text(line, marginL, y); y += 8; });
      y += 2;
    } else if (block.type === 'h3') {
      checkPage(12);
      y += 3;
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 41, 59);
      const lines = doc.splitTextToSize(block.text, usableW);
      lines.forEach((line: string) => { checkPage(7); doc.text(line, marginL, y); y += 7; });
    } else if (block.type === 'bullet') {
      checkPage(7);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(51, 65, 85);
      doc.setFillColor(14, 165, 233);
      doc.circle(marginL + 2, y - 1.5, 1, 'F');
      const lines = doc.splitTextToSize(block.text, usableW - 8);
      lines.forEach((line: string, idx: number) => {
        checkPage(6);
        doc.text(line, marginL + 6, y);
        if (idx < lines.length - 1) y += 6;
      });
      y += 6;
    } else if (block.type === 'quote') {
      checkPage(12);
      y += 2;
      doc.setFillColor(240, 249, 255);
      const lines = doc.splitTextToSize(block.text, usableW - 10);
      const boxH = lines.length * 6 + 6;
      doc.roundedRect(marginL, y - 4, usableW, boxH, 2, 2, 'F');
      doc.setFillColor(14, 165, 233);
      doc.rect(marginL, y - 4, 2, boxH, 'F');
      doc.setFontSize(10);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(3, 105, 161);
      lines.forEach((line: string) => { checkPage(6); doc.text(line, marginL + 5, y); y += 6; });
      y += 4;
    } else {
      checkPage(7);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(51, 65, 85);
      const lines = doc.splitTextToSize(block.text, usableW);
      lines.forEach((line: string) => { checkPage(6); doc.text(line, marginL, y); y += 6; });
      y += 2;
    }
  }

  // Footer on every page
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.4);
    doc.line(marginL, pageH - 12, pageW - marginR, pageH - 12);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(148, 163, 184);
    doc.text(title, marginL, pageH - 7);
    doc.text(`Page ${p} of ${totalPages}`, pageW - marginR, pageH - 7, { align: 'right' });
  }

  doc.save(`${title.replace(/[^a-z0-9]/gi, '_')}.pdf`);
}

// ─── PPTX generation (pptxgenjs) ────────────────────────────────────────────
interface ParsedSlide {
  slideNumber: number;
  heading: string;
  contentHtml: string;
  speakerNotes: string;
}

function parseSlidesFromHtml(slidesHtml: string): ParsedSlide[] {
  const div = document.createElement('div');
  div.innerHTML = slidesHtml;
  const slideEls = div.querySelectorAll('.slide');
  return Array.from(slideEls).map((el, idx) => {
    const h2 = el.querySelector('h2');
    const notes = el.querySelector('.speaker-notes');
    const heading = h2?.textContent?.trim() || `Slide ${idx + 1}`;
    if (notes) notes.remove();
    if (h2) h2.remove();
    return {
      slideNumber: idx + 1,
      heading,
      contentHtml: el.innerHTML,
      speakerNotes: notes?.textContent?.trim().replace(/^Speaker notes:/, '').trim() || '',
    };
  });
}

async function generatePptx(title: string, slidesHtml: string) {
  const PptxGenJS = (await import('pptxgenjs')).default;
  const pptx = new PptxGenJS();

  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = 'Maximus Academy';
  pptx.title = title;

  // Brand colours
  const BRAND = '0E7490';     // teal-600
  const DARK  = '0F172A';     // slate-900
  const BODY  = '334155';     // slate-700
  const LIGHT = 'F0F9FF';     // sky-50
  const WHITE = 'FFFFFF';
  const ACCENT = '0EA5E9';    // sky-500

  const slides = parseSlidesFromHtml(slidesHtml);

  slides.forEach((s, idx) => {
    const slide = pptx.addSlide();

    // Background
    slide.background = { color: idx === 0 ? DARK : WHITE };

    if (idx === 0) {
      // ── Title slide ──────────────────────────────────────────────────────
      slide.addShape(pptx.ShapeType.rect, {
        x: 0, y: 0, w: '100%', h: 0.12,
        fill: { color: BRAND },
        line: { color: BRAND },
      });
      slide.addShape(pptx.ShapeType.rect, {
        x: 0, y: 4.88, w: '100%', h: 0.12,
        fill: { color: BRAND },
        line: { color: BRAND },
      });
      slide.addText(s.heading, {
        x: 0.6, y: 1.2, w: 11.8, h: 1.6,
        fontSize: 36,
        bold: true,
        color: WHITE,
        align: 'center',
        fontFace: 'Calibri',
      });
      slide.addText(title, {
        x: 0.6, y: 2.9, w: 11.8, h: 0.6,
        fontSize: 18,
        color: ACCENT,
        align: 'center',
        fontFace: 'Calibri',
      });
      slide.addText(new Date().toLocaleDateString('en-AU', { year: 'numeric', month: 'long' }), {
        x: 0.6, y: 3.7, w: 11.8, h: 0.4,
        fontSize: 13,
        color: '94A3B8',
        align: 'center',
        fontFace: 'Calibri',
      });
    } else {
      // ── Content slide ────────────────────────────────────────────────────
      // Top accent bar
      slide.addShape(pptx.ShapeType.rect, {
        x: 0, y: 0, w: '100%', h: 0.08,
        fill: { color: BRAND },
        line: { color: BRAND },
      });
      // Slide number badge
      slide.addShape(pptx.ShapeType.rect, {
        x: 11.8, y: 0.18, w: 0.6, h: 0.4,
        fill: { color: LIGHT },
        line: { color: ACCENT },
        rounding: true,
      });
      slide.addText(`${idx + 1}`, {
        x: 11.8, y: 0.18, w: 0.6, h: 0.4,
        fontSize: 9, bold: true, color: ACCENT, align: 'center',
      });

      // Heading
      slide.addText(s.heading, {
        x: 0.5, y: 0.2, w: 11.0, h: 0.7,
        fontSize: 22,
        bold: true,
        color: DARK,
        fontFace: 'Calibri',
      });
      // Underline accent
      slide.addShape(pptx.ShapeType.rect, {
        x: 0.5, y: 0.95, w: 2.5, h: 0.04,
        fill: { color: ACCENT },
        line: { color: ACCENT },
      });

      // Parse content into bullet points
      const contentDiv = document.createElement('div');
      contentDiv.innerHTML = s.contentHtml;
      const bullets: { text: string; level: number; bold: boolean }[] = [];

      const processEl = (el: Element, level = 0) => {
        const tag = el.tagName?.toLowerCase();
        const text = el.textContent?.trim() || '';
        if (!text) return;
        if (tag === 'h3') bullets.push({ text, level: 0, bold: true });
        else if (tag === 'li') bullets.push({ text: `• ${text}`, level: level > 0 ? 1 : 0, bold: false });
        else if (tag === 'p') bullets.push({ text, level: 0, bold: false });
        else if (tag === 'ul' || tag === 'ol') {
          Array.from(el.children).forEach(c => processEl(c as Element, level + 1));
          return;
        } else if (el.children.length) {
          Array.from(el.children).forEach(c => processEl(c as Element, level));
          return;
        }
      };
      Array.from(contentDiv.children).forEach(c => processEl(c as Element));

      if (bullets.length > 0) {
        const textItems = bullets.map(b => ({
          text: b.text,
          options: {
            fontSize: b.bold ? 14 : 13,
            bold: b.bold,
            color: b.bold ? DARK : BODY,
            breakLine: true,
            indentLevel: b.level,
          },
        }));
        slide.addText(textItems, {
          x: 0.5, y: 1.1, w: 11.5, h: 3.5,
          fontFace: 'Calibri',
          valign: 'top',
        });
      }

      // Speaker notes
      if (s.speakerNotes) {
        slide.addText(`Notes: ${s.speakerNotes}`, {
          x: 0.5, y: 4.6, w: 11.5, h: 0.3,
          fontSize: 8,
          color: '94A3B8',
          italic: true,
          fontFace: 'Calibri',
        });
      }

      // Footer line
      slide.addShape(pptx.ShapeType.rect, {
        x: 0, y: 4.9, w: '100%', h: 0.06,
        fill: { color: 'E2E8F0' },
        line: { color: 'E2E8F0' },
      });
    }

    if (s.speakerNotes) slide.addNotes(s.speakerNotes);
  });

  await pptx.writeFile({ fileName: `${title.replace(/[^a-z0-9]/gi, '_')}.pptx` });
}

// ─── Slides Viewer ───────────────────────────────────────────────────────────
function SlidesViewer({ doc }: { doc: LessonDocument }) {
  const [slide, setSlide] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [dlPdf, setDlPdf] = useState(false);
  const [dlPptx, setDlPptx] = useState(false);

  const parser = typeof window !== 'undefined' ? new DOMParser() : null;
  const parsed = parser?.parseFromString(doc.content_html, 'text/html');
  const slideEls = parsed ? Array.from(parsed.querySelectorAll('.slide')) : [];
  const total = slideEls.length;
  const currentHtml = slideEls[slide]?.innerHTML || doc.content_html;

  return (
    <div className={`${fullscreen ? 'fixed inset-0 z-50 bg-slate-900 flex flex-col' : 'relative'}`}>
      {/* Toolbar */}
      <div className={`flex items-center gap-2 px-4 py-2.5 ${fullscreen ? 'bg-slate-800 border-b border-slate-700' : 'bg-slate-800 rounded-t-xl border border-slate-700'}`}>
        <div className="w-7 h-7 rounded-lg bg-teal-900 flex items-center justify-center shrink-0">
          <Presentation className="w-3.5 h-3.5 text-teal-300" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate">{doc.title}</p>
          {total > 0 && <p className="text-xs text-slate-400">Slide {slide + 1} of {total}</p>}
        </div>
        <button
          onClick={async () => { setDlPdf(true); try { await generatePdf(doc.title, doc.content_html); } finally { setDlPdf(false); } }}
          disabled={dlPdf}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-red-300 hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-60 border border-red-900"
          title="Download as PDF"
        >
          {dlPdf ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3" />} PDF
        </button>
        <button
          onClick={async () => { setDlPptx(true); try { await generatePptx(doc.title, doc.content_html); } finally { setDlPptx(false); } }}
          disabled={dlPptx}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-sky-300 hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-60 border border-sky-800"
          title="Download as PowerPoint"
        >
          {dlPptx ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />} PPT
        </button>
        <button onClick={() => setFullscreen(f => !f)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-700 transition-colors">
          {fullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>
        {fullscreen && (
          <button onClick={() => setFullscreen(false)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-700 transition-colors">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Slide content */}
      <div className={`flex-1 overflow-auto ${fullscreen ? 'flex items-center justify-center bg-slate-900 p-8' : 'border-x border-b border-slate-200'}`}>
        <div className={`${fullscreen ? 'w-full max-w-4xl bg-white rounded-2xl shadow-2xl p-12 min-h-80' : 'p-6 bg-white min-h-60'}`}>
          <div className="prose prose-slate max-w-none text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: currentHtml }} />
        </div>
      </div>

      {/* Navigation */}
      {total > 1 && (
        <div className={`flex items-center justify-between px-4 py-3 ${fullscreen ? 'bg-slate-800 border-t border-slate-700' : 'bg-slate-50 border-x border-b border-slate-200 rounded-b-xl'}`}>
          <button onClick={() => setSlide(s => Math.max(0, s - 1))} disabled={slide === 0}
            className={`flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors disabled:opacity-40 ${fullscreen ? 'text-white hover:bg-slate-700' : 'text-slate-600 hover:bg-slate-100 border border-slate-200'}`}>
            <ChevronLeft className="w-3.5 h-3.5" /> Prev
          </button>
          <div className="flex items-center gap-1">
            {Array.from({ length: total }).map((_, idx) => (
              <button key={idx} onClick={() => setSlide(idx)}
                className={`h-1.5 rounded-full transition-all ${idx === slide ? (fullscreen ? 'w-5 bg-sky-400' : 'w-5 bg-teal-500') : (fullscreen ? 'w-1.5 bg-slate-600' : 'w-1.5 bg-slate-300')}`} />
            ))}
          </div>
          <button onClick={() => setSlide(s => Math.min(total - 1, s + 1))} disabled={slide === total - 1}
            className={`flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors disabled:opacity-40 ${fullscreen ? 'text-white hover:bg-slate-700' : 'text-slate-600 hover:bg-slate-100 border border-slate-200'}`}>
            Next <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Notes Viewer ────────────────────────────────────────────────────────────
function NotesViewer({ doc }: { doc: LessonDocument }) {
  const [dlPdf, setDlPdf] = useState(false);

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-2.5 bg-white border-b border-slate-100">
        <div className="w-7 h-7 rounded-lg bg-teal-100 flex items-center justify-center shrink-0">
          <FileText className="w-3.5 h-3.5 text-teal-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800 truncate">{doc.title}</p>
          <p className="text-xs text-slate-400">Lesson Notes</p>
        </div>
        <button
          onClick={async () => {
            setDlPdf(true);
            try { await generatePdf(doc.title, doc.content_html); }
            finally { setDlPdf(false); }
          }}
          disabled={dlPdf}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors disabled:opacity-60 shadow-sm"
        >
          {dlPdf ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
          Download PDF
        </button>
      </div>
      <div className="p-5 bg-white">
        <div className="prose prose-slate prose-sm max-w-none leading-relaxed"
          dangerouslySetInnerHTML={{ __html: doc.content_html }} />
      </div>
    </div>
  );
}

// ─── Main viewer ─────────────────────────────────────────────────────────────
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
        const loaded = (data || []) as LessonDocument[];
        setDocs(loaded);
        if (loaded.length > 0) setActiveDoc(loaded[0].id);
        setLoading(false);
      });
  }, [lessonId]);

  if (loading) return (
    <div className="flex items-center gap-2 py-4 text-xs text-slate-400">
      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading documents...
    </div>
  );

  if (docs.length === 0) return (
    <div className="py-4 text-center text-xs text-slate-400">
      No notes or slides generated yet.
    </div>
  );

  const currentDoc = docs.find(d => d.id === activeDoc) || docs[0];

  return (
    <div className="space-y-3">
      {docs.length > 1 && (
        <div className="flex items-center gap-2 flex-wrap">
          {docs.map(doc => {
            const isNotes = doc.type === 'notes';
            const isActive = activeDoc === doc.id;
            return (
              <button key={doc.id} onClick={() => setActiveDoc(doc.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all ${
                  isActive
                    ? isNotes ? 'bg-teal-100 text-teal-700 border-teal-300' : 'bg-slate-800 text-white border-slate-700'
                    : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                }`}>
                {isNotes ? <FileText className="w-3 h-3" /> : <Presentation className="w-3 h-3" />}
                {isNotes ? 'Notes (PDF)' : 'Slides (PPT)'}
              </button>
            );
          })}
        </div>
      )}
      {currentDoc.type === 'slides'
        ? <SlidesViewer doc={currentDoc} />
        : <NotesViewer doc={currentDoc} />
      }
    </div>
  );
}

// ─── Compact badges for lesson row ───────────────────────────────────────────
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
        <span className="flex items-center gap-0.5 text-xs bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded font-medium">
          <FileText className="w-2.5 h-2.5" /> PDF
        </span>
      )}
      {counts.slides > 0 && (
        <span className="flex items-center gap-0.5 text-xs bg-slate-800 text-white px-1.5 py-0.5 rounded font-medium">
          <BookOpen className="w-2.5 h-2.5" /> PPT
        </span>
      )}
    </span>
  );
}
