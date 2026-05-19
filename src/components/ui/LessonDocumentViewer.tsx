import { useState, useEffect, useRef } from 'react';
import {
  FileText, ChevronLeft, ChevronRight, Download, BookOpen, X,
  Maximize2, Minimize2, Loader2, Grid3x3 as Grid3X3, LayoutList,
  Pencil, Check, AlignLeft, Presentation, ChevronDown, ChevronUp,
  Bookmark, Clock, Brain,
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

// ─── HTML Utilities ──────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n').trim();
}

interface TextBlock {
  type: 'h1' | 'h2' | 'h3' | 'p' | 'bullet' | 'quote' | 'numbered';
  text: string;
  level?: number;
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
    else if (tag === 'li') {
      const parent = node.parentElement?.tagName?.toLowerCase();
      blocks.push({ type: parent === 'ol' ? 'numbered' : 'bullet', text });
    } else if (tag === 'p') blocks.push({ type: 'p', text });
    else if (tag === 'ul') { node.querySelectorAll('li').forEach(li => blocks.push({ type: 'bullet', text: li.textContent?.trim() || '' })); return; }
    else if (tag === 'ol') { let c = 1; node.querySelectorAll('li').forEach(li => blocks.push({ type: 'numbered', text: li.textContent?.trim() || '', level: c++ })); return; }
    else if (node.children.length > 0) { Array.from(node.children).forEach(child => processNode(child as Element)); return; }
    else blocks.push({ type: 'p', text });
  }
  Array.from(div.children).forEach(child => processNode(child as Element));
  return blocks.filter(b => b.text.length > 0);
}

// ─── PDF Generation ──────────────────────────────────────────────────────────

async function generatePdf(title: string, contentHtml: string) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = 210, pageH = 297, mL = 22, mR = 22, mT = 20, mB = 22;
  const usableW = pageW - mL - mR;
  let y = mT;
  const addPage = () => { doc.addPage(); y = mT; };
  const checkPage = (needed: number) => { if (y + needed > pageH - mB) addPage(); };

  doc.setFillColor(17, 24, 39); doc.rect(0, 0, pageW, 18, 'F');
  doc.setFillColor(59, 130, 246); doc.rect(0, 15, pageW, 3, 'F');
  doc.setTextColor(255, 255, 255); doc.setFontSize(7.5); doc.setFont('helvetica', 'bold');
  doc.text('LESSON NOTES', mL, 11);
  doc.text(new Date().toLocaleDateString('en-AU', { year: 'numeric', month: 'long', day: 'numeric' }), pageW - mR, 11, { align: 'right' });
  y = 28;

  doc.setTextColor(17, 24, 39); doc.setFontSize(20); doc.setFont('helvetica', 'bold');
  const titleLines = doc.splitTextToSize(title, usableW);
  titleLines.forEach((line: string) => { checkPage(12); doc.text(line, mL, y); y += 11; });
  y += 2;
  doc.setDrawColor(59, 130, 246); doc.setLineWidth(0.8); doc.line(mL, y, pageW - mR, y); y += 7;

  const blocks = parseHtmlToBlocks(contentHtml);
  let numberedCounter = 0;
  for (const block of blocks) {
    if (block.type !== 'numbered') numberedCounter = 0;
    if (block.type === 'h1') {
      checkPage(16); y += 4;
      doc.setFillColor(239, 246, 255); doc.setDrawColor(147, 197, 253); doc.setLineWidth(0.3);
      const h1Lines = doc.splitTextToSize(block.text, usableW - 6);
      doc.roundedRect(mL, y - 5, usableW, h1Lines.length * 9 + 6, 2, 2, 'FD');
      doc.setFontSize(15); doc.setFont('helvetica', 'bold'); doc.setTextColor(29, 78, 216);
      h1Lines.forEach((line: string) => { checkPage(9); doc.text(line, mL + 4, y); y += 9; }); y += 3;
    } else if (block.type === 'h2') {
      checkPage(14); y += 5;
      doc.setFillColor(59, 130, 246); doc.rect(mL, y - 5, 3, 11, 'F');
      doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.setTextColor(17, 24, 39);
      const lines = doc.splitTextToSize(block.text, usableW - 6);
      lines.forEach((line: string) => { checkPage(9); doc.text(line, mL + 6, y); y += 9; }); y += 2;
    } else if (block.type === 'h3') {
      checkPage(12); y += 3;
      doc.setFontSize(11.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 41, 59);
      const lines = doc.splitTextToSize(block.text, usableW);
      lines.forEach((line: string) => { checkPage(7); doc.text(line, mL, y); y += 7; });
    } else if (block.type === 'bullet') {
      checkPage(7); doc.setFontSize(11); doc.setFont('helvetica', 'normal'); doc.setTextColor(51, 65, 85);
      doc.setFillColor(59, 130, 246); doc.circle(mL + 2.5, y - 1.8, 1.2, 'F');
      const lines = doc.splitTextToSize(block.text, usableW - 10);
      lines.forEach((line: string, idx: number) => { checkPage(6); doc.text(line, mL + 7, y); if (idx < lines.length - 1) y += 6; }); y += 6;
    } else if (block.type === 'numbered') {
      checkPage(7); numberedCounter++;
      doc.setFillColor(17, 24, 39); doc.circle(mL + 3, y - 1.8, 2.5, 'F');
      doc.setTextColor(255, 255, 255); doc.setFontSize(8); doc.setFont('helvetica', 'bold');
      doc.text(String(numberedCounter), mL + 3, y - 0.5, { align: 'center' });
      doc.setFontSize(11); doc.setFont('helvetica', 'normal'); doc.setTextColor(51, 65, 85);
      const lines = doc.splitTextToSize(block.text, usableW - 10);
      lines.forEach((line: string, idx: number) => { checkPage(6); doc.text(line, mL + 8, y); if (idx < lines.length - 1) y += 6; }); y += 6;
    } else if (block.type === 'quote') {
      checkPage(14); y += 3;
      doc.setFillColor(239, 246, 255);
      const lines = doc.splitTextToSize(block.text, usableW - 14);
      const boxH = lines.length * 6 + 10;
      doc.roundedRect(mL, y - 5, usableW, boxH, 2, 2, 'F');
      doc.setFillColor(59, 130, 246); doc.rect(mL, y - 5, 3, boxH, 'F');
      doc.setFontSize(10); doc.setFont('helvetica', 'italic'); doc.setTextColor(30, 64, 175);
      lines.forEach((line: string) => { checkPage(6); doc.text(line, mL + 8, y); y += 6; }); y += 5;
    } else {
      checkPage(7); doc.setFontSize(11); doc.setFont('helvetica', 'normal'); doc.setTextColor(51, 65, 85);
      const lines = doc.splitTextToSize(block.text, usableW);
      lines.forEach((line: string) => { checkPage(6.5); doc.text(line, mL, y); y += 6.5; }); y += 2;
    }
  }

  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFillColor(248, 250, 252); doc.rect(0, pageH - 14, pageW, 14, 'F');
    doc.setDrawColor(226, 232, 240); doc.setLineWidth(0.4); doc.line(mL, pageH - 14, pageW - mR, pageH - 14);
    doc.setFillColor(59, 130, 246); doc.rect(0, pageH - 14, 4, 14, 'F');
    doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 116, 139);
    doc.text(title.length > 60 ? title.slice(0, 57) + '...' : title, mL, pageH - 6);
    doc.text(`Page ${p} of ${totalPages}`, pageW - mR, pageH - 6, { align: 'right' });
  }
  doc.save(`${title.replace(/[^a-z0-9]/gi, '_')}.pdf`);
}

// ─── PPT Generation ──────────────────────────────────────────────────────────

interface ParsedSlide {
  heading: string;
  bodyHtml: string;
  speakerNotes: string;
  slideType: 'title' | 'content' | 'summary';
}

async function generatePptx(title: string, slides: ParsedSlide[]) {
  const pptxgen = (await import('pptxgenjs')).default;
  const prs = new pptxgen();
  prs.layout = 'LAYOUT_WIDE';

  const NAVY = '111827';
  const BLUE = '3B82F6';
  const LIGHT_BLUE = 'DBEAFE';
  const WHITE = 'FFFFFF';
  const SLATE = '334155';
  const LIGHT_GRAY = 'F8FAFC';

  slides.forEach((slide, idx) => {
    const s = prs.addSlide();
    if (slide.slideType === 'title' || idx === 0) {
      s.addShape(prs.ShapeType.rect, { x: 0, y: 0, w: '100%', h: '100%', fill: { color: NAVY } });
      s.addShape(prs.ShapeType.rect, { x: 0, y: 3.8, w: '100%', h: 0.06, fill: { color: BLUE } });
      s.addText(slide.heading || title, { x: 0.6, y: 1.2, w: 8.8, h: 1.8, fontSize: 36, bold: true, color: WHITE, fontFace: 'Calibri', align: 'left', wrap: true });
      const bodyText = stripHtml(slide.bodyHtml || '');
      if (bodyText) s.addText(bodyText, { x: 0.6, y: 3.1, w: 8.8, h: 0.6, fontSize: 14, color: '94A3B8', fontFace: 'Calibri', align: 'left', wrap: true });
      s.addText(`Slide ${idx + 1} of ${slides.length}`, { x: 8.5, y: 4.9, w: 1, h: 0.2, fontSize: 8, color: '475569', align: 'right' });
    } else if (slide.slideType === 'summary') {
      s.addShape(prs.ShapeType.rect, { x: 0, y: 0, w: '100%', h: '100%', fill: { color: '0F2744' } });
      s.addShape(prs.ShapeType.rect, { x: 0, y: 0, w: '100%', h: 0.06, fill: { color: BLUE } });
      s.addText(slide.heading, { x: 0.5, y: 0.25, w: 9, h: 0.65, fontSize: 22, bold: true, color: WHITE, fontFace: 'Calibri' });
      const bodyText = stripHtml(slide.bodyHtml || '');
      if (bodyText) s.addText(bodyText, { x: 0.5, y: 1.1, w: 9, h: 3.5, fontSize: 13, color: 'CBD5E1', fontFace: 'Calibri', wrap: true });
    } else {
      s.addShape(prs.ShapeType.rect, { x: 0, y: 0, w: '100%', h: '100%', fill: { color: WHITE } });
      s.addShape(prs.ShapeType.rect, { x: 0, y: 0, w: 0.07, h: '100%', fill: { color: BLUE } });
      s.addShape(prs.ShapeType.rect, { x: 0, y: 0, w: '100%', h: 0.85, fill: { color: LIGHT_GRAY } });
      s.addShape(prs.ShapeType.rect, { x: 0, y: 0.85, w: '100%', h: 0.04, fill: { color: LIGHT_BLUE } });
      s.addText(slide.heading, { x: 0.25, y: 0.1, w: 9.1, h: 0.65, fontSize: 20, bold: true, color: NAVY, fontFace: 'Calibri' });
      s.addText(`${idx + 1}`, { x: 9.0, y: 0.12, w: 0.4, h: 0.4, fontSize: 9, color: '94A3B8', align: 'right' });
      const bodyText = stripHtml(slide.bodyHtml || '');
      if (bodyText) s.addText(bodyText, { x: 0.25, y: 1.05, w: 9.1, h: 3.55, fontSize: 13, color: SLATE, fontFace: 'Calibri', wrap: true, valign: 'top' });
      s.addShape(prs.ShapeType.rect, { x: 0, y: 4.9, w: '100%', h: 0.2, fill: { color: LIGHT_GRAY } });
      s.addText(title, { x: 0.25, y: 4.92, w: 8, h: 0.16, fontSize: 7, color: '94A3B8' });
    }
    if (slide.speakerNotes) s.addNotes(slide.speakerNotes);
  });

  prs.writeFile({ fileName: `${title.replace(/[^a-z0-9]/gi, '_')}.pptx` });
}

// ─── Parse slides ────────────────────────────────────────────────────────────

function parseSlidesFromHtml(html: string): ParsedSlide[] {
  if (!html?.trim()) return [{ heading: 'No slides available', bodyHtml: '<p>Try regenerating notes &amp; slides.</p>', speakerNotes: '', slideType: 'content' }];
  const div = document.createElement('div');
  div.innerHTML = html;
  const slideEls = div.querySelectorAll('.slide');
  if (slideEls.length === 0) return [{ heading: '', bodyHtml: html, speakerNotes: '', slideType: 'content' }];
  return Array.from(slideEls).map((el, idx) => {
    const notesEl = el.querySelector('.speaker-notes');
    const notes = notesEl?.textContent?.trim().replace(/^Speaker notes:?/i, '').trim() || '';
    notesEl?.remove();
    const h2 = el.querySelector('h2');
    const heading = h2?.textContent?.trim() || `Slide ${idx + 1}`;
    h2?.remove();
    const bodyHtml = el.innerHTML.trim();
    const isTitle = idx === 0;
    const isSummary = heading.toLowerCase().includes('summary') || heading.toLowerCase().includes('next steps');
    return { heading, bodyHtml, speakerNotes: notes, slideType: isTitle ? 'title' : isSummary ? 'summary' : 'content' };
  });
}

// ─── Slide Display ───────────────────────────────────────────────────────────

function SlideDisplay({ slide, index, total, fullscreen }: { slide: ParsedSlide; index: number; total: number; fullscreen: boolean }) {
  const [showNotes, setShowNotes] = useState(false);
  const isTitle = slide.slideType === 'title';
  const isSummary = slide.slideType === 'summary';

  return (
    <div className="flex flex-col h-full">
      <div className={`flex-1 relative overflow-hidden ${
        isTitle ? 'bg-gradient-to-br from-gray-900 via-blue-950 to-gray-900'
        : isSummary ? 'bg-gradient-to-br from-blue-950 via-blue-900 to-gray-900'
        : 'bg-white'
      }`}>
        <div className="absolute top-0 left-0 right-0 h-1 bg-blue-500" />
        {!isTitle && !isSummary && <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-blue-500" />}
        <div className={`absolute top-3 right-4 text-xs font-mono tabular-nums ${isTitle || isSummary ? 'text-blue-400/50' : 'text-slate-400'}`}>
          {index + 1} / {total}
        </div>
        <div className={`flex flex-col justify-center h-full ${isTitle ? 'px-12 py-10 text-center' : 'pl-10 pr-8 py-8'} ${fullscreen ? 'px-20 py-16' : ''}`}>
          {isTitle ? (
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-900/60 border border-blue-700/50 rounded-full text-blue-300 text-xs font-semibold mb-6">
                <Presentation className="w-3 h-3" /> Lecture Slides
              </div>
              <h1 className={`font-bold text-white mb-4 leading-tight tracking-tight ${fullscreen ? 'text-5xl' : 'text-3xl'}`}>
                {slide.heading}
              </h1>
              {slide.bodyHtml && (
                <div className={`text-blue-200/80 leading-relaxed ${fullscreen ? 'text-xl' : 'text-sm'} notes-body-dark`}
                  dangerouslySetInnerHTML={{ __html: slide.bodyHtml }} />
              )}
            </div>
          ) : (
            <>
              <h2 className={`font-bold mb-5 leading-tight ${fullscreen ? 'text-3xl' : 'text-xl'} ${isSummary ? 'text-white' : 'text-gray-900'}`}>
                {slide.heading}
              </h2>
              <div className={`leading-relaxed ${fullscreen ? 'text-lg' : 'text-sm'} ${isSummary ? 'notes-body-dark' : 'notes-body-light'}`}
                dangerouslySetInnerHTML={{ __html: slide.bodyHtml }} />
            </>
          )}
        </div>
        {!isTitle && !isSummary && (
          <div className="absolute bottom-0 left-0 right-0 h-px bg-slate-100" />
        )}
      </div>

      {slide.speakerNotes && (
        <div className="border-t border-amber-200/60 bg-amber-50/80">
          <button onClick={() => setShowNotes(n => !n)} className="flex items-center gap-2 w-full px-4 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-100/80 transition-colors">
            <span className="w-4 h-4 rounded-full bg-amber-300/60 text-amber-800 flex items-center justify-center font-bold text-xs">N</span>
            {showNotes ? 'Hide' : 'Show'} Instructor Notes
            {showNotes ? <ChevronUp className="w-3 h-3 ml-auto" /> : <ChevronDown className="w-3 h-3 ml-auto" />}
          </button>
          {showNotes && (
            <div className="px-5 py-3 text-xs text-amber-900 leading-relaxed border-t border-amber-100">
              {slide.speakerNotes}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Slides Viewer ───────────────────────────────────────────────────────────

function SlidesViewer({ doc }: { doc: LessonDocument }) {
  const [slide, setSlide] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [dlPdf, setDlPdf] = useState(false);
  const [dlPpt, setDlPpt] = useState(false);
  const [view, setView] = useState<'slides' | 'grid'>('slides');

  const slides = parseSlidesFromHtml(doc.content_html);
  const total = slides.length;
  const current = slides[slide] || slides[0];
  const goTo = (idx: number) => { setSlide(idx); setView('slides'); };

  useEffect(() => {
    if (!fullscreen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') setSlide(s => Math.min(total - 1, s + 1));
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') setSlide(s => Math.max(0, s - 1));
      if (e.key === 'Escape') setFullscreen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [fullscreen, total]);

  return (
    <>
      <style>{`
        .notes-body-light h3{font-size:.9em;font-weight:700;color:#111827;margin:.6rem 0 .3rem}
        .notes-body-light p{color:#374151;margin-bottom:.4rem;line-height:1.7}
        .notes-body-light ul,.notes-body-light ol{padding-left:1.3rem;margin-bottom:.4rem}
        .notes-body-light li{color:#374151;margin-bottom:.3rem;line-height:1.65}
        .notes-body-light li::marker{color:#3B82F6}
        .notes-body-light strong{color:#1D4ED8;font-weight:700}
        .notes-body-light blockquote{border-left:3px solid #3B82F6;padding:.4rem .75rem;margin:.5rem 0;background:#EFF6FF;border-radius:0 4px 4px 0;color:#1E40AF;font-style:italic}
        .notes-body-dark h3{font-size:.9em;font-weight:700;color:#BAE6FD;margin:.6rem 0 .3rem}
        .notes-body-dark p{color:#BFDBFE;margin-bottom:.4rem;line-height:1.7}
        .notes-body-dark ul,.notes-body-dark ol{padding-left:1.3rem;margin-bottom:.4rem}
        .notes-body-dark li{color:#BFDBFE;margin-bottom:.3rem;line-height:1.65}
        .notes-body-dark strong{color:#93C5FD;font-weight:700}
      `}</style>

      <div className={`${fullscreen ? 'fixed inset-0 z-50 flex flex-col bg-gray-950' : 'relative rounded-2xl overflow-hidden border border-slate-200 dark:border-navy-600 shadow-lg'}`}>
        {/* Toolbar */}
        <div className="flex items-center gap-2 px-4 py-3 bg-gray-900 border-b border-gray-800">
          <div className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-600/30 flex items-center justify-center shrink-0">
            <Presentation className="w-4 h-4 text-blue-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white truncate leading-tight">{doc.title}</p>
            <p className="text-xs text-slate-400">{slide + 1} of {total} slides</p>
          </div>

          <div className="flex items-center gap-0.5 bg-gray-800 rounded-lg p-0.5 border border-gray-700">
            <button onClick={() => setView('slides')} className={`p-1.5 rounded-md transition-colors ${view === 'slides' ? 'bg-gray-600 text-white' : 'text-slate-400 hover:text-white'}`}>
              <LayoutList className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setView('grid')} className={`p-1.5 rounded-md transition-colors ${view === 'grid' ? 'bg-gray-600 text-white' : 'text-slate-400 hover:text-white'}`}>
              <Grid3X3 className="w-3.5 h-3.5" />
            </button>
          </div>

          <button onClick={async () => { setDlPdf(true); try { await generatePdf(doc.title, doc.content_html); } finally { setDlPdf(false); } }} disabled={dlPdf}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50 shadow-sm">
            {dlPdf ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3" />} PDF
          </button>
          <button onClick={async () => { setDlPpt(true); try { await generatePptx(doc.title, slides); } finally { setDlPpt(false); } }} disabled={dlPpt}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold bg-orange-600 hover:bg-orange-700 text-white rounded-lg transition-colors disabled:opacity-50 shadow-sm">
            {dlPpt ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />} PPT
          </button>
          <button onClick={() => setFullscreen(f => !f)} className="p-1.5 rounded-lg text-slate-400 hover:bg-gray-700 transition-colors">
            {fullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          {fullscreen && (
            <button onClick={() => setFullscreen(false)} className="p-1.5 rounded-lg text-slate-400 hover:bg-gray-700 transition-colors">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Slide area */}
        {view === 'grid' ? (
          <div className={`overflow-auto p-4 bg-gray-950 ${fullscreen ? 'flex-1' : 'max-h-[460px]'}`}>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {slides.map((s, idx) => (
                <button key={idx} onClick={() => goTo(idx)}
                  className={`relative rounded-xl overflow-hidden border-2 text-left transition-all hover:scale-[1.02] ${idx === slide ? 'border-blue-500 shadow-lg shadow-blue-900/40' : 'border-gray-700 hover:border-gray-500'}`}>
                  <div className={`p-3 min-h-[90px] ${s.slideType === 'title' ? 'bg-gray-800' : s.slideType === 'summary' ? 'bg-blue-950' : 'bg-white'}`}>
                    {s.slideType !== 'content' && <div className="absolute top-0 left-0 right-0 h-0.5 bg-blue-500" />}
                    {s.slideType === 'content' && <div className="absolute top-0 left-0 bottom-0 w-1 bg-blue-500" />}
                    <p className={`text-xs font-bold leading-tight line-clamp-2 mb-1.5 ${s.slideType !== 'content' ? 'text-white' : 'text-gray-900'}`}>
                      {s.heading || `Slide ${idx + 1}`}
                    </p>
                    <div className={`text-xs leading-snug line-clamp-3 opacity-60 ${s.slideType !== 'content' ? 'text-slate-300' : 'text-slate-500'}`}
                      dangerouslySetInnerHTML={{ __html: s.bodyHtml.replace(/<[^>]+>/g, ' ').slice(0, 120) }} />
                  </div>
                  <div className={`absolute top-2 right-2 text-xs font-mono opacity-40 ${s.slideType !== 'content' ? 'text-slate-400' : 'text-slate-400'}`}>{idx + 1}</div>
                  {idx === slide && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500" />}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className={fullscreen ? 'flex-1 overflow-hidden' : 'aspect-[16/9] relative overflow-hidden'}>
            <div className={fullscreen ? 'h-full' : 'absolute inset-0'}>
              <SlideDisplay slide={current} index={slide} total={total} fullscreen={fullscreen} />
            </div>
          </div>
        )}

        {/* Navigation bar */}
        {view === 'slides' && total > 1 && (
          <div className="flex items-center gap-3 px-4 py-2.5 bg-gray-900 border-t border-gray-800">
            <button onClick={() => setSlide(s => Math.max(0, s - 1))} disabled={slide === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-30 border border-gray-700">
              <ChevronLeft className="w-3.5 h-3.5" /> Prev
            </button>
            <div className="flex-1 text-center text-xs text-slate-400 font-mono select-none">
              Slide {slide + 1} of {total}
            </div>
            <button onClick={() => setSlide(s => Math.min(total - 1, s + 1))} disabled={slide === total - 1}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-30 border border-gray-700">
              Next <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </>
  );
}

// ─── Notes Viewer ────────────────────────────────────────────────────────────

function estimateReadTime(html: string): number {
  const words = stripHtml(html).split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

function NotesViewer({ doc }: { doc: LessonDocument }) {
  const [dlPdf, setDlPdf] = useState(false);
  const [showNotepad, setShowNotepad] = useState(false);
  const [myNotes, setMyNotes] = useState('');
  const [saved, setSaved] = useState(false);
  const storageKey = `lesson_notes_${doc.id}`;
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const readTime = estimateReadTime(doc.content_html);

  useEffect(() => {
    const stored = localStorage.getItem(storageKey);
    if (stored) setMyNotes(stored);
  }, [storageKey]);

  const handleNoteChange = (val: string) => {
    setMyNotes(val);
    setSaved(false);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      localStorage.setItem(storageKey, val);
      setSaved(true);
    }, 800);
  };

  const hasContent = doc.content_html?.trim().length > 0;

  return (
    <div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-navy-600 shadow-sm bg-white dark:bg-navy-800">

      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 bg-gradient-to-r from-blue-600 to-blue-700">
        <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
          <FileText className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-white truncate leading-tight">{doc.title}</p>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="flex items-center gap-1 text-xs text-blue-100">
              <Clock className="w-3 h-3" /> {readTime} min read
            </span>
            <span className="flex items-center gap-1 text-xs text-blue-100">
              <Brain className="w-3 h-3" /> Lesson Notes
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowNotepad(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all ${
              showNotepad ? 'bg-white text-blue-700 border-white' : 'bg-white/10 border-white/30 text-white hover:bg-white/20'
            }`}>
            <Pencil className="w-3 h-3" /> My Notes
          </button>
          <button onClick={async () => { setDlPdf(true); try { await generatePdf(doc.title, doc.content_html); } finally { setDlPdf(false); } }} disabled={dlPdf}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white/10 hover:bg-white/20 border border-white/30 text-white rounded-lg transition-colors disabled:opacity-50">
            {dlPdf ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            PDF
          </button>
        </div>
      </div>

      <div className={`${showNotepad ? 'grid grid-cols-1 lg:grid-cols-5' : ''}`}>
        {/* Notes content */}
        <div className={`${showNotepad ? 'lg:col-span-3' : ''}`}>
          {hasContent ? (
            <div className="notes-rich-content p-6 lg:p-8">
              <div dangerouslySetInnerHTML={{ __html: doc.content_html }} />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 px-8 text-center">
              <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
                <FileText className="w-8 h-8 text-slate-300" />
              </div>
              <p className="text-base font-semibold text-slate-500 mb-1">No notes yet</p>
              <p className="text-sm text-slate-400 max-w-xs">
                Notes haven't been generated for this lesson yet. Your teacher may add them soon.
              </p>
            </div>
          )}
        </div>

        {/* Personal notepad */}
        {showNotepad && (
          <div className="lg:col-span-2 flex flex-col border-t lg:border-t-0 lg:border-l border-slate-100 dark:border-navy-700 bg-amber-50/40 dark:bg-navy-700/30">
            <div className="flex items-center justify-between px-4 py-3 border-b border-amber-200/60 bg-amber-50/60">
              <div className="flex items-center gap-2">
                <Pencil className="w-3.5 h-3.5 text-amber-600" />
                <span className="text-xs font-semibold text-amber-700">My Notes</span>
              </div>
              <div className="flex items-center gap-2">
                {saved && (
                  <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
                    <Check className="w-3 h-3" /> Saved
                  </span>
                )}
                <button onClick={() => setShowNotepad(false)} className="p-1 text-slate-400 hover:text-slate-600 rounded transition-colors">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <textarea
              value={myNotes}
              onChange={e => handleNoteChange(e.target.value)}
              placeholder="Take notes as you read... saved automatically in your browser."
              className="flex-1 w-full p-4 text-sm text-slate-700 dark:text-slate-300 bg-transparent border-none outline-none resize-none leading-relaxed placeholder:text-slate-400 font-mono"
              style={{ minHeight: '300px' }}
            />
            <div className="px-4 py-2 border-t border-amber-100 bg-amber-50/40">
              <p className="text-xs text-amber-600/70">Notes are saved locally in your browser</p>
            </div>
          </div>
        )}
      </div>

      <style>{`
        .notes-rich-content {
          font-family: Georgia, 'Times New Roman', serif;
          color: #1e293b;
          line-height: 1.8;
        }
        .notes-rich-content h1 {
          font-size: 1.6rem; font-weight: 800; color: #0f172a;
          margin: 2.5rem 0 1rem; line-height: 1.25;
          font-family: system-ui, -apple-system, sans-serif;
        }
        .notes-rich-content h2 {
          font-size: 1.2rem; font-weight: 700; color: #0f172a;
          margin: 2rem 0 0.75rem; padding: 0.6rem 0 0.6rem 1rem;
          border-left: 4px solid #3b82f6;
          background: linear-gradient(to right, #eff6ff, transparent);
          border-radius: 0 6px 6px 0;
          font-family: system-ui, -apple-system, sans-serif;
        }
        .notes-rich-content h3 {
          font-size: 1rem; font-weight: 700; color: #1e40af;
          margin: 1.5rem 0 0.5rem;
          font-family: system-ui, -apple-system, sans-serif;
          text-transform: uppercase; letter-spacing: 0.04em; font-size: 0.8rem;
        }
        .notes-rich-content p {
          font-size: 0.95rem; color: #334155; line-height: 1.85;
          margin-bottom: 1rem;
        }
        .notes-rich-content ul {
          padding-left: 0; margin-bottom: 1rem; list-style: none;
        }
        .notes-rich-content ul li {
          font-size: 0.95rem; color: #334155; line-height: 1.75;
          margin-bottom: 0.4rem; padding-left: 1.5rem; position: relative;
        }
        .notes-rich-content ul li::before {
          content: ''; position: absolute; left: 0; top: 0.65em;
          width: 8px; height: 8px; border-radius: 50%;
          background: #3b82f6;
        }
        .notes-rich-content ol {
          padding-left: 0; margin-bottom: 1rem; list-style: none; counter-reset: item;
        }
        .notes-rich-content ol li {
          font-size: 0.95rem; color: #334155; line-height: 1.75;
          margin-bottom: 0.5rem; padding-left: 2rem; position: relative;
          counter-increment: item;
        }
        .notes-rich-content ol li::before {
          content: counter(item); position: absolute; left: 0; top: 0.1em;
          width: 1.4rem; height: 1.4rem; border-radius: 50%;
          background: #1e293b; color: white;
          font-size: 0.7rem; font-weight: 700; display: flex;
          align-items: center; justify-content: center;
          font-family: system-ui, sans-serif;
        }
        .notes-rich-content strong { color: #1e3a5f; font-weight: 700; }
        .notes-rich-content em { color: #0369a1; font-style: italic; }
        .notes-rich-content blockquote {
          border-left: 4px solid #3b82f6; margin: 1.5rem 0;
          padding: 1rem 1.25rem; background: #eff6ff;
          border-radius: 0 10px 10px 0; color: #1e40af;
          font-size: 0.95rem; font-style: italic; line-height: 1.7;
        }
        .notes-rich-content code {
          background: #f1f5f9; color: #0f172a; padding: 0.15em 0.45em;
          border-radius: 4px; font-size: 0.85em; font-family: monospace;
        }
        .notes-rich-content table {
          width: 100%; border-collapse: collapse; margin: 1.25rem 0;
          font-size: 0.9rem; font-family: system-ui, sans-serif;
        }
        .notes-rich-content th {
          background: #1e293b; color: white; padding: 0.6rem 0.9rem;
          text-align: left; font-weight: 600;
        }
        .notes-rich-content td {
          padding: 0.55rem 0.9rem; border-bottom: 1px solid #e2e8f0; color: #334155;
        }
        .notes-rich-content tr:nth-child(even) td { background: #f8fafc; }
      `}</style>
    </div>
  );
}

// ─── Main Viewer ─────────────────────────────────────────────────────────────

export default function LessonDocumentViewer({ lessonId, courseId }: Props) {
  const [docs, setDocs] = useState<LessonDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeDoc, setActiveDoc] = useState<string | null>(null);
  void courseId;

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
    <div className="flex items-center gap-2 py-8 text-sm text-slate-400">
      <Loader2 className="w-4 h-4 animate-spin text-blue-500" /> Loading lesson materials...
    </div>
  );

  if (docs.length === 0) return (
    <div className="flex flex-col items-center justify-center py-16 px-8 text-center rounded-2xl border border-dashed border-slate-200 dark:border-navy-600 bg-slate-50 dark:bg-navy-800/40">
      <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-navy-700 flex items-center justify-center mb-3">
        <Bookmark className="w-7 h-7 text-slate-300 dark:text-slate-500" />
      </div>
      <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">No materials yet</p>
      <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 max-w-xs">
        Notes and slides haven't been generated for this lesson yet.
      </p>
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
                className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl border transition-all ${
                  isActive
                    ? isNotes ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'bg-gray-900 text-white border-gray-900 shadow-sm'
                    : 'bg-white dark:bg-navy-700 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-navy-600 hover:border-slate-300 hover:bg-slate-50'
                }`}>
                {isNotes ? <AlignLeft className="w-3.5 h-3.5" /> : <Presentation className="w-3.5 h-3.5" />}
                {isNotes ? 'Lesson Notes' : 'Slides'}
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
    supabase.from('lesson_documents').select('type').eq('lesson_id', lessonId)
      .then(({ data }) => {
        if (!data) return;
        setCounts({ notes: data.filter(d => d.type === 'notes').length, slides: data.filter(d => d.type === 'slides').length });
      });
  }, [lessonId]);

  if (!counts || (counts.notes === 0 && counts.slides === 0)) return null;

  return (
    <span className="flex items-center gap-1">
      {counts.notes > 0 && (
        <span className="flex items-center gap-0.5 text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-md font-semibold">
          <FileText className="w-2.5 h-2.5" /> Notes
        </span>
      )}
      {counts.slides > 0 && (
        <span className="flex items-center gap-0.5 text-xs bg-gray-900 text-white px-1.5 py-0.5 rounded-md font-semibold">
          <BookOpen className="w-2.5 h-2.5" /> Slides
        </span>
      )}
    </span>
  );
}
