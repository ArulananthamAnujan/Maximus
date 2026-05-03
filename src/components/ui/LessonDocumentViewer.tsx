import { useState, useEffect, useRef } from 'react';
import {
  FileText, ChevronLeft, ChevronRight, Download, BookOpen, X,
  Maximize2, Minimize2, Loader2, Grid3x3 as Grid3X3, LayoutList,
  Pencil, Check, AlignLeft, Presentation, ChevronDown, ChevronUp,
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

// ─── HTML Utilities ─────────────────────────────────────────────────────────

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

  // Header
  doc.setFillColor(17, 24, 39); doc.rect(0, 0, pageW, 18, 'F');
  doc.setFillColor(59, 130, 246); doc.rect(0, 15, pageW, 3, 'F');
  doc.setTextColor(255, 255, 255); doc.setFontSize(7.5); doc.setFont('helvetica', 'bold');
  doc.text('LESSON NOTES', mL, 11);
  doc.text(new Date().toLocaleDateString('en-AU', { year: 'numeric', month: 'long', day: 'numeric' }), pageW - mR, 11, { align: 'right' });
  y = 28;

  // Title
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
      // Title slide — dark full-bleed background
      s.addShape(prs.ShapeType.rect, { x: 0, y: 0, w: '100%', h: '100%', fill: { color: NAVY } });
      s.addShape(prs.ShapeType.rect, { x: 0, y: 3.8, w: '100%', h: 0.06, fill: { color: BLUE } });
      s.addText(slide.heading || title, {
        x: 0.6, y: 1.2, w: 8.8, h: 1.8,
        fontSize: 36, bold: true, color: WHITE,
        fontFace: 'Calibri', align: 'left', wrap: true,
      });
      const bodyText = stripHtml(slide.bodyHtml || '');
      if (bodyText) {
        s.addText(bodyText, {
          x: 0.6, y: 3.1, w: 8.8, h: 0.6,
          fontSize: 14, color: '94A3B8', fontFace: 'Calibri', align: 'left', wrap: true,
        });
      }
      s.addText(`Slide ${idx + 1} of ${slides.length}`, {
        x: 8.5, y: 4.9, w: 1, h: 0.2, fontSize: 8, color: '475569', align: 'right',
      });
    } else if (slide.slideType === 'summary') {
      // Summary — teal-ish dark
      s.addShape(prs.ShapeType.rect, { x: 0, y: 0, w: '100%', h: '100%', fill: { color: '0F2744' } });
      s.addShape(prs.ShapeType.rect, { x: 0, y: 0, w: '100%', h: 0.06, fill: { color: BLUE } });
      s.addText(slide.heading, {
        x: 0.5, y: 0.25, w: 9, h: 0.65,
        fontSize: 22, bold: true, color: WHITE, fontFace: 'Calibri',
      });
      const bodyText = stripHtml(slide.bodyHtml || '');
      if (bodyText) {
        s.addText(bodyText, {
          x: 0.5, y: 1.1, w: 9, h: 3.5,
          fontSize: 13, color: 'CBD5E1', fontFace: 'Calibri', wrap: true,
        });
      }
    } else {
      // Standard content slide
      s.addShape(prs.ShapeType.rect, { x: 0, y: 0, w: '100%', h: '100%', fill: { color: WHITE } });
      // Left accent bar
      s.addShape(prs.ShapeType.rect, { x: 0, y: 0, w: 0.07, h: '100%', fill: { color: BLUE } });
      // Header band
      s.addShape(prs.ShapeType.rect, { x: 0, y: 0, w: '100%', h: 0.85, fill: { color: LIGHT_GRAY } });
      s.addShape(prs.ShapeType.rect, { x: 0, y: 0.85, w: '100%', h: 0.04, fill: { color: LIGHT_BLUE } });
      s.addText(slide.heading, {
        x: 0.25, y: 0.1, w: 9.1, h: 0.65,
        fontSize: 20, bold: true, color: NAVY, fontFace: 'Calibri',
      });
      // Slide number
      s.addText(`${idx + 1}`, {
        x: 9.0, y: 0.12, w: 0.4, h: 0.4,
        fontSize: 9, color: '94A3B8', align: 'right',
      });
      // Body text
      const bodyText = stripHtml(slide.bodyHtml || '');
      if (bodyText) {
        s.addText(bodyText, {
          x: 0.25, y: 1.05, w: 9.1, h: 3.55,
          fontSize: 13, color: SLATE, fontFace: 'Calibri', wrap: true,
          valign: 'top',
        });
      }
      // Bottom stripe
      s.addShape(prs.ShapeType.rect, { x: 0, y: 4.9, w: '100%', h: 0.2, fill: { color: LIGHT_GRAY } });
      s.addText(title, {
        x: 0.25, y: 4.92, w: 8, h: 0.16, fontSize: 7, color: '94A3B8',
      });
    }

    // Speaker notes
    if (slide.speakerNotes) {
      s.addNotes(slide.speakerNotes);
    }
  });

  prs.writeFile({ fileName: `${title.replace(/[^a-z0-9]/gi, '_')}.pptx` });
}

// ─── Parse slides from stored HTML ──────────────────────────────────────────

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

// ─── Slide Display Component ─────────────────────────────────────────────────

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
        {/* Top accent */}
        <div className={`absolute top-0 left-0 right-0 h-1 ${isTitle || isSummary ? 'bg-blue-500' : 'bg-blue-500'}`} />
        {/* Left accent bar for content slides */}
        {!isTitle && !isSummary && <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500" />}

        {/* Slide counter */}
        <div className={`absolute top-3 right-4 text-xs font-mono tabular-nums ${isTitle || isSummary ? 'text-blue-400/60' : 'text-slate-300'}`}>
          {index + 1} / {total}
        </div>

        <div className={`flex flex-col justify-center h-full ${
          isTitle ? 'px-12 py-10 text-center' : `pl-8 pr-8 py-6`
        } ${fullscreen ? 'px-20 py-16' : ''}`}>
          {isTitle ? (
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-900/60 border border-blue-700/50 rounded-full text-blue-300 text-xs font-semibold mb-5">
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
              <div className={`font-bold mb-4 leading-tight tracking-tight ${
                fullscreen ? 'text-3xl' : 'text-xl'
              } ${isSummary ? 'text-white' : 'text-gray-900'}`}>
                {slide.heading}
              </div>
              <div className={`leading-relaxed ${fullscreen ? 'text-lg' : 'text-sm'} ${
                isSummary ? 'notes-body-dark' : 'notes-body-light'
              }`} dangerouslySetInnerHTML={{ __html: slide.bodyHtml }} />
            </>
          )}
        </div>
        <div className={`absolute bottom-0 left-0 right-0 h-px ${isTitle || isSummary ? 'bg-blue-800/50' : 'bg-slate-100'}`} />
      </div>

      {/* Speaker notes */}
      {slide.speakerNotes && (
        <div className="border-t border-amber-100 bg-amber-50">
          <button
            onClick={() => setShowNotes(n => !n)}
            className="flex items-center gap-2 w-full px-4 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-100 transition-colors"
          >
            <span className="w-4 h-4 rounded-full bg-amber-200 text-amber-800 flex items-center justify-center font-bold text-xs">N</span>
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

  // Keyboard navigation
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
        .notes-body-light h3 { font-size: 0.9em; font-weight: 700; color: #111827; margin: 0.6rem 0 0.3rem; }
        .notes-body-light p { color: #374151; margin-bottom: 0.35rem; line-height: 1.65; }
        .notes-body-light ul, .notes-body-light ol { padding-left: 1.25rem; margin-bottom: 0.35rem; }
        .notes-body-light li { color: #374151; margin-bottom: 0.3rem; line-height: 1.65; }
        .notes-body-light li::marker { color: #3B82F6; }
        .notes-body-light strong { color: #1D4ED8; font-weight: 700; }
        .notes-body-light blockquote { border-left: 3px solid #3B82F6; padding: 0.4rem 0.75rem; margin: 0.5rem 0; background: #EFF6FF; border-radius: 0 4px 4px 0; color: #1E40AF; font-style: italic; }
        .notes-body-dark h3 { font-size: 0.9em; font-weight: 700; color: #BAE6FD; margin: 0.6rem 0 0.3rem; }
        .notes-body-dark p { color: #BFDBFE; margin-bottom: 0.35rem; line-height: 1.65; }
        .notes-body-dark ul, .notes-body-dark ol { padding-left: 1.25rem; margin-bottom: 0.35rem; }
        .notes-body-dark li { color: #BFDBFE; margin-bottom: 0.3rem; line-height: 1.65; }
        .notes-body-dark strong { color: #93C5FD; font-weight: 700; }
      `}</style>
      <div className={`${fullscreen ? 'fixed inset-0 z-50 flex flex-col bg-gray-900' : 'relative rounded-2xl overflow-hidden shadow-lg border border-slate-200'}`}>
        {/* Toolbar */}
        <div className={`flex items-center gap-2 px-4 py-2.5 ${fullscreen ? 'bg-gray-900 border-b border-gray-700' : 'bg-gray-900'}`}>
          <div className="w-8 h-8 rounded-lg bg-blue-900/60 border border-blue-800/50 flex items-center justify-center shrink-0">
            <Presentation className="w-4 h-4 text-blue-300" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white truncate leading-tight">{doc.title}</p>
            {total > 0 && <p className="text-xs text-slate-400">Slide {slide + 1} of {total}</p>}
          </div>

          <div className="flex items-center gap-0.5 bg-gray-800 rounded-lg p-0.5 border border-gray-700">
            <button onClick={() => setView('slides')} className={`p-1.5 rounded-md transition-colors ${view === 'slides' ? 'bg-gray-600 text-white' : 'text-slate-400 hover:text-white'}`} title="Slide view">
              <LayoutList className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setView('grid')} className={`p-1.5 rounded-md transition-colors ${view === 'grid' ? 'bg-gray-600 text-white' : 'text-slate-400 hover:text-white'}`} title="Grid overview">
              <Grid3X3 className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            onClick={async () => { setDlPdf(true); try { await generatePdf(doc.title, doc.content_html); } finally { setDlPdf(false); } }}
            disabled={dlPdf}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-60 shadow-sm"
            title="Download as PDF"
          >
            {dlPdf ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3" />} PDF
          </button>
          <button
            onClick={async () => { setDlPpt(true); try { await generatePptx(doc.title, slides); } finally { setDlPpt(false); } }}
            disabled={dlPpt}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold bg-orange-600 hover:bg-orange-700 text-white rounded-lg transition-colors disabled:opacity-60 shadow-sm"
            title="Download as PowerPoint"
          >
            {dlPpt ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />} PPT
          </button>
          <button onClick={() => setFullscreen(f => !f)} className="p-1.5 rounded-lg text-slate-400 hover:bg-gray-700 transition-colors" title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
            {fullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          {fullscreen && (
            <button onClick={() => setFullscreen(false)} className="p-1.5 rounded-lg text-slate-400 hover:bg-gray-700 transition-colors">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Main content */}
        {view === 'grid' ? (
          <div className={`overflow-auto p-4 bg-gray-950 ${fullscreen ? 'flex-1' : 'max-h-[420px]'}`}>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {slides.map((s, idx) => (
                <button
                  key={idx}
                  onClick={() => goTo(idx)}
                  className={`relative rounded-xl overflow-hidden border-2 text-left transition-all hover:scale-[1.02] ${
                    idx === slide ? 'border-blue-500 shadow-lg shadow-blue-900/40' : 'border-gray-700 hover:border-gray-500'
                  }`}
                >
                  <div className={`p-3 min-h-[80px] ${
                    s.slideType === 'title' ? 'bg-gray-800'
                    : s.slideType === 'summary' ? 'bg-blue-950'
                    : 'bg-white'
                  }`}>
                    <p className={`text-xs font-bold leading-tight line-clamp-2 mb-1 ${s.slideType !== 'content' ? 'text-white' : 'text-gray-900'}`}>
                      {s.heading || `Slide ${idx + 1}`}
                    </p>
                    <div className={`text-xs leading-tight line-clamp-3 opacity-60 ${s.slideType !== 'content' ? 'text-slate-300' : 'text-slate-500'}`}
                      dangerouslySetInnerHTML={{ __html: s.bodyHtml.replace(/<[^>]+>/g, ' ').slice(0, 120) }} />
                  </div>
                  <div className={`absolute top-1.5 right-2 text-xs font-mono opacity-40 ${s.slideType !== 'content' ? 'text-slate-400' : 'text-slate-400'}`}>{idx + 1}</div>
                  {idx === slide && <div className="absolute top-0 left-0 right-0 h-0.5 bg-blue-500" />}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className={`${fullscreen ? 'flex-1 overflow-hidden' : 'min-h-72'}`}>
            <SlideDisplay slide={current} index={slide} total={total} fullscreen={fullscreen} />
          </div>
        )}

        {/* Navigation */}
        {view === 'slides' && total > 1 && (
          <div className={`flex items-center gap-3 px-4 py-2.5 bg-gray-900 border-t border-gray-800`}>
            <button
              onClick={() => setSlide(s => Math.max(0, s - 1))}
              disabled={slide === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-30 border border-gray-700"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Prev
            </button>

            <div className="flex-1 flex items-center gap-1 justify-center flex-wrap">
              {Array.from({ length: total }).map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setSlide(idx)}
                  title={slides[idx]?.heading || `Slide ${idx + 1}`}
                  className={`h-1.5 rounded-full transition-all ${idx === slide ? 'w-6 bg-blue-500' : 'w-1.5 bg-gray-600 hover:bg-gray-400'}`}
                />
              ))}
            </div>

            <button
              onClick={() => setSlide(s => Math.min(total - 1, s + 1))}
              disabled={slide === total - 1}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-30 border border-gray-700"
            >
              Next <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </>
  );
}

// ─── Notes Viewer ────────────────────────────────────────────────────────────

function NotesViewer({ doc }: { doc: LessonDocument }) {
  const [dlPdf, setDlPdf] = useState(false);
  const [showNotepad, setShowNotepad] = useState(false);
  const [myNotes, setMyNotes] = useState('');
  const [saved, setSaved] = useState(false);
  const storageKey = `lesson_notes_${doc.id}`;
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  return (
    <div className="rounded-2xl overflow-hidden shadow-sm border border-slate-200 bg-white">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3 bg-white border-b border-slate-100">
        <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
          <FileText className="w-4.5 h-4.5 text-blue-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-800 truncate leading-tight">{doc.title}</p>
          <p className="text-xs text-slate-400 mt-0.5">Lesson Notes</p>
        </div>
        <button
          onClick={() => setShowNotepad(v => !v)}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all ${
            showNotepad
              ? 'bg-amber-50 border-amber-200 text-amber-700'
              : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
          }`}
          title="Personal note-taking area"
        >
          <Pencil className="w-3 h-3" />
          My Notes
        </button>
        <button
          onClick={async () => { setDlPdf(true); try { await generatePdf(doc.title, doc.content_html); } finally { setDlPdf(false); } }}
          disabled={dlPdf}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-60 shadow-sm"
        >
          {dlPdf ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
          Download PDF
        </button>
      </div>

      <div className={`${showNotepad ? 'grid grid-cols-1 lg:grid-cols-5' : ''}`}>
        {/* Notes content */}
        <div className={`${showNotepad ? 'lg:col-span-3 border-r border-slate-100' : ''} p-6 bg-white`}>
          {doc.content_html?.trim() ? (
            <div className="notes-content prose-custom max-w-none">
              <div dangerouslySetInnerHTML={{ __html: doc.content_html }} />
            </div>
          ) : (
            <p className="text-sm text-slate-400 text-center py-12">Notes content is empty. Try regenerating notes &amp; slides for this section.</p>
          )}
        </div>

        {/* Personal notepad */}
        {showNotepad && (
          <div className="lg:col-span-2 flex flex-col bg-amber-50/40">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-amber-100">
              <div className="flex items-center gap-2">
                <Pencil className="w-3.5 h-3.5 text-amber-600" />
                <span className="text-xs font-semibold text-amber-700">My Personal Notes</span>
              </div>
              <div className="flex items-center gap-2">
                {saved && (
                  <span className="flex items-center gap-1 text-xs text-green-600">
                    <Check className="w-3 h-3" /> Saved
                  </span>
                )}
                <button onClick={() => setShowNotepad(false)} className="p-1 text-slate-400 hover:text-slate-600 rounded">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <textarea
              value={myNotes}
              onChange={e => handleNoteChange(e.target.value)}
              placeholder="Take notes while you study... Your notes are saved automatically in your browser."
              className="flex-1 w-full p-4 text-sm text-slate-700 bg-transparent border-none outline-none resize-none leading-relaxed placeholder:text-slate-400 font-mono"
              style={{ minHeight: '300px' }}
            />
            <div className="px-4 py-2 border-t border-amber-100">
              <p className="text-xs text-amber-600/70">Notes saved in your browser only</p>
            </div>
          </div>
        )}
      </div>

      <style>{`
        .notes-content h2 {
          font-size: 1.2rem; font-weight: 700; color: #111827;
          margin: 1.75rem 0 0.6rem; padding-bottom: 0.4rem;
          border-bottom: 2px solid #EFF6FF;
          display: flex; align-items: center; gap: 0.4rem;
        }
        .notes-content h2::before {
          content: ''; display: inline-block; width: 4px; height: 1.1em;
          background: #3B82F6; border-radius: 2px; flex-shrink: 0;
        }
        .notes-content h3 { font-size: 1rem; font-weight: 700; color: #1D4ED8; margin: 1.2rem 0 0.4rem; }
        .notes-content p { font-size: 0.92rem; color: #374151; line-height: 1.75; margin-bottom: 0.75rem; }
        .notes-content ul, .notes-content ol { padding-left: 1.4rem; margin-bottom: 0.75rem; }
        .notes-content li { font-size: 0.92rem; color: #374151; line-height: 1.7; margin-bottom: 0.3rem; }
        .notes-content li::marker { color: #3B82F6; }
        .notes-content strong { color: #1E3A5F; font-weight: 700; }
        .notes-content em { color: #0369A1; font-style: italic; }
        .notes-content blockquote {
          border-left: 4px solid #3B82F6; margin: 1rem 0; padding: 0.75rem 1.1rem;
          background: #EFF6FF; border-radius: 0 8px 8px 0; color: #1E40AF;
          font-size: 0.9rem; font-style: italic; line-height: 1.65;
        }
        .notes-content code { background: #F1F5F9; color: #0F172A; padding: 0.15em 0.4em; border-radius: 4px; font-size: 0.85em; }
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
    <div className="flex items-center gap-2 py-6 text-xs text-slate-400">
      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading documents...
    </div>
  );

  if (docs.length === 0) return (
    <div className="py-6 text-center text-xs text-slate-400">No notes or slides generated yet.</div>
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
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl border transition-all ${
                  isActive
                    ? isNotes ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'bg-gray-900 text-white border-gray-900 shadow-sm'
                    : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                }`}>
                {isNotes ? <AlignLeft className="w-3 h-3" /> : <Presentation className="w-3 h-3" />}
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
