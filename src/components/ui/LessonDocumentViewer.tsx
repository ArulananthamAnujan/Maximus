import { useState, useEffect } from 'react';
import { FileText, Presentation, ChevronLeft, ChevronRight, Download, BookOpen, X, Maximize2, Minimize2, Loader2, List, Grid3x3 as Grid3X3 } from 'lucide-react';
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
    }
    else if (tag === 'p') blocks.push({ type: 'p', text });
    else if (tag === 'ul') {
      node.querySelectorAll('li').forEach(li => {
        blocks.push({ type: 'bullet', text: li.textContent?.trim() || '' });
      });
      return;
    } else if (tag === 'ol') {
      let counter = 1;
      node.querySelectorAll('li').forEach(li => {
        blocks.push({ type: 'numbered', text: li.textContent?.trim() || '', level: counter++ });
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
  const marginL = 22;
  const marginR = 22;
  const marginT = 20;
  const marginB = 22;
  const usableW = pageW - marginL - marginR;
  let y = marginT;

  const addPage = () => { doc.addPage(); y = marginT; };
  const checkPage = (needed: number) => { if (y + needed > pageH - marginB) addPage(); };

  // ── Header bar ────────────────────────────────────────────────────────────
  doc.setFillColor(15, 118, 110);
  doc.rect(0, 0, pageW, 16, 'F');
  // Accent stripe
  doc.setFillColor(20, 184, 166);
  doc.rect(0, 13, pageW, 3, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('LESSON NOTES', marginL, 10);
  doc.text(new Date().toLocaleDateString('en-AU', { year: 'numeric', month: 'long', day: 'numeric' }), pageW - marginR, 10, { align: 'right' });

  y = 26;

  // ── Title ─────────────────────────────────────────────────────────────────
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  const titleLines = doc.splitTextToSize(title, usableW);
  titleLines.forEach((line: string) => {
    checkPage(12);
    doc.text(line, marginL, y);
    y += 12;
  });
  y += 2;

  // Divider
  doc.setDrawColor(14, 165, 233);
  doc.setLineWidth(1);
  doc.line(marginL, y, pageW - marginR, y);
  y += 8;

  const blocks = parseHtmlToBlocks(contentHtml);
  let numberedCounter = 0;

  for (const block of blocks) {
    if (block.type !== 'numbered') numberedCounter = 0;

    if (block.type === 'h1') {
      checkPage(16);
      y += 5;
      // Teal background label
      doc.setFillColor(240, 253, 250);
      doc.setDrawColor(20, 184, 166);
      doc.setLineWidth(0.3);
      const h1Lines = doc.splitTextToSize(block.text, usableW - 6);
      const boxH = h1Lines.length * 9 + 6;
      doc.roundedRect(marginL, y - 5, usableW, boxH, 2, 2, 'FD');
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 118, 110);
      h1Lines.forEach((line: string) => { checkPage(9); doc.text(line, marginL + 3, y); y += 9; });
      y += 3;
    } else if (block.type === 'h2') {
      checkPage(14);
      y += 5;
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 118, 110);
      // Left border accent
      doc.setFillColor(14, 165, 233);
      doc.rect(marginL, y - 5, 2.5, 10, 'F');
      const lines = doc.splitTextToSize(block.text, usableW - 6);
      lines.forEach((line: string) => { checkPage(9); doc.text(line, marginL + 5, y); y += 9; });
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
      // Teal bullet dot
      doc.setFillColor(14, 165, 233);
      doc.circle(marginL + 2.5, y - 1.8, 1.2, 'F');
      const lines = doc.splitTextToSize(block.text, usableW - 10);
      lines.forEach((line: string, idx: number) => {
        checkPage(6);
        doc.text(line, marginL + 7, y);
        if (idx < lines.length - 1) y += 6;
      });
      y += 6;
    } else if (block.type === 'numbered') {
      checkPage(7);
      numberedCounter++;
      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(51, 65, 85);
      // Numbered circle
      doc.setFillColor(15, 118, 110);
      doc.circle(marginL + 3, y - 1.8, 2.5, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.text(String(numberedCounter), marginL + 3, y - 0.5, { align: 'center' });
      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(51, 65, 85);
      const lines = doc.splitTextToSize(block.text, usableW - 10);
      lines.forEach((line: string, idx: number) => {
        checkPage(6);
        doc.text(line, marginL + 8, y);
        if (idx < lines.length - 1) y += 6;
      });
      y += 6;
    } else if (block.type === 'quote') {
      checkPage(14);
      y += 3;
      doc.setFillColor(240, 249, 255);
      const lines = doc.splitTextToSize(block.text, usableW - 12);
      const boxH = lines.length * 6 + 8;
      doc.roundedRect(marginL, y - 5, usableW, boxH, 2, 2, 'F');
      doc.setFillColor(14, 165, 233);
      doc.rect(marginL, y - 5, 3, boxH, 'F');
      // Quote mark
      doc.setFontSize(20);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(14, 165, 233);
      doc.text('\u201C', marginL + 5, y + 2);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(3, 105, 161);
      lines.forEach((line: string) => { checkPage(6); doc.text(line, marginL + 12, y); y += 6; });
      y += 5;
    } else {
      // paragraph
      checkPage(7);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(51, 65, 85);
      const lines = doc.splitTextToSize(block.text, usableW);
      lines.forEach((line: string) => { checkPage(6.5); doc.text(line, marginL, y); y += 6.5; });
      y += 2;
    }
  }

  // ── Key Points sidebar (if room, append at bottom) ────────────────────────
  // Footer on every page
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    // Footer stripe
    doc.setFillColor(248, 250, 252);
    doc.rect(0, pageH - 14, pageW, 14, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.4);
    doc.line(marginL, pageH - 14, pageW - marginR, pageH - 14);
    // Footer teal accent
    doc.setFillColor(15, 118, 110);
    doc.rect(0, pageH - 14, 4, 14, 'F');
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(title.length > 60 ? title.slice(0, 57) + '...' : title, marginL, pageH - 6);
    doc.text(`Page ${p} of ${totalPages}`, pageW - marginR, pageH - 6, { align: 'right' });
  }

  doc.save(`${title.replace(/[^a-z0-9]/gi, '_')}.pdf`);
}

// ─── Slides Viewer — rich interactive HTML ───────────────────────────────────

interface ParsedSlide {
  heading: string;
  bodyHtml: string;
  speakerNotes: string;
  slideType: 'title' | 'content' | 'summary';
}

function parseSlidesFromHtml(html: string): ParsedSlide[] {
  const div = document.createElement('div');
  div.innerHTML = html;
  const slideEls = div.querySelectorAll('.slide');

  if (slideEls.length === 0) {
    // Fallback: treat entire HTML as a single slide
    return [{
      heading: '',
      bodyHtml: html,
      speakerNotes: '',
      slideType: 'content',
    }];
  }

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

    return {
      heading,
      bodyHtml,
      speakerNotes: notes,
      slideType: isTitle ? 'title' : isSummary ? 'summary' : 'content',
    };
  });
}

function SlideDisplay({ slide, index, total, fullscreen }: { slide: ParsedSlide; index: number; total: number; fullscreen: boolean }) {
  const [showNotes, setShowNotes] = useState(false);

  const isTitle = slide.slideType === 'title';
  const isSummary = slide.slideType === 'summary';

  return (
    <div className="flex flex-col h-full">
      {/* Slide canvas */}
      <div className={`flex-1 relative overflow-hidden ${isTitle ? 'bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900' : isSummary ? 'bg-gradient-to-br from-teal-900 via-teal-800 to-slate-900' : 'bg-white'}`}>
        {/* Top accent bar */}
        <div className={`absolute top-0 left-0 right-0 h-1.5 ${isTitle || isSummary ? 'bg-teal-400' : 'bg-teal-600'}`} />

        {/* Slide number badge */}
        <div className="absolute top-4 right-5 text-xs font-mono opacity-40 text-slate-400">
          {index + 1} / {total}
        </div>

        {/* Content */}
        <div className={`flex flex-col justify-center h-full px-10 py-8 ${fullscreen ? 'px-16 py-12' : ''}`}>
          {isTitle ? (
            <div className="text-center">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-teal-800/50 rounded-full text-teal-300 text-xs font-semibold mb-6 border border-teal-700/50">
                <Presentation className="w-3 h-3" /> Presentation
              </div>
              <h1 className={`font-bold text-white mb-4 leading-tight ${fullscreen ? 'text-5xl' : 'text-3xl'}`}>
                {slide.heading}
              </h1>
              {slide.bodyHtml && (
                <div className={`text-slate-400 leading-relaxed ${fullscreen ? 'text-xl' : 'text-base'}`}
                  dangerouslySetInnerHTML={{ __html: slide.bodyHtml }} />
              )}
            </div>
          ) : (
            <>
              <h2 className={`font-bold mb-5 leading-tight ${fullscreen ? 'text-3xl' : 'text-xl'} ${isSummary ? 'text-white' : 'text-slate-900'}`}>
                {slide.heading}
              </h2>
              <div
                className={`leading-relaxed slide-body ${fullscreen ? 'text-lg' : 'text-sm'} ${isSummary ? 'slide-body-dark' : 'slide-body-light'}`}
                dangerouslySetInnerHTML={{ __html: slide.bodyHtml }}
              />
            </>
          )}
        </div>

        {/* Bottom accent line */}
        <div className={`absolute bottom-0 left-0 right-0 h-0.5 ${isTitle || isSummary ? 'bg-teal-700' : 'bg-slate-100'}`} />
      </div>

      {/* Speaker notes panel */}
      {slide.speakerNotes && (
        <div>
          <button
            onClick={() => setShowNotes(n => !n)}
            className="flex items-center gap-2 w-full px-4 py-2 bg-amber-50 border-t border-amber-200 text-xs font-medium text-amber-700 hover:bg-amber-100 transition-colors"
          >
            <span className="w-4 h-4 rounded bg-amber-200 flex items-center justify-center text-amber-700 text-xs font-bold shrink-0">N</span>
            {showNotes ? 'Hide' : 'Show'} Speaker Notes
          </button>
          {showNotes && (
            <div className="px-5 py-3 bg-amber-50 border-t border-amber-100 text-xs text-amber-800 leading-relaxed">
              {slide.speakerNotes}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SlidesViewer({ doc }: { doc: LessonDocument }) {
  const [slide, setSlide] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [dlPdf, setDlPdf] = useState(false);
  const [view, setView] = useState<'slides' | 'grid'>('slides');

  const slides = parseSlidesFromHtml(doc.content_html);
  const total = slides.length;
  const current = slides[slide] || slides[0];

  const goTo = (idx: number) => { setSlide(idx); setView('slides'); };

  return (
    <>
      <style>{`
        .slide-body-light h3 { font-size: 1em; font-weight: 700; color: #0F172A; margin-bottom: 0.5rem; margin-top: 0.75rem; }
        .slide-body-light p { color: #334155; margin-bottom: 0.4rem; line-height: 1.6; }
        .slide-body-light ul, .slide-body-light ol { padding-left: 1.2rem; margin-bottom: 0.4rem; }
        .slide-body-light li { color: #334155; margin-bottom: 0.35rem; line-height: 1.6; }
        .slide-body-light strong { color: #0E7490; font-weight: 700; }
        .slide-body-light blockquote { border-left: 3px solid #0EA5E9; padding-left: 0.75rem; color: #0369A1; font-style: italic; margin: 0.5rem 0; background: #F0F9FF; padding: 0.5rem 0.75rem; border-radius: 0 4px 4px 0; }
        .slide-body-dark h3 { font-size: 1em; font-weight: 700; color: #99F6E4; margin-bottom: 0.5rem; margin-top: 0.75rem; }
        .slide-body-dark p { color: #CCFBF1; margin-bottom: 0.4rem; line-height: 1.6; }
        .slide-body-dark ul, .slide-body-dark ol { padding-left: 1.2rem; margin-bottom: 0.4rem; }
        .slide-body-dark li { color: #CCFBF1; margin-bottom: 0.35rem; line-height: 1.6; }
        .slide-body-dark strong { color: #5EEAD4; font-weight: 700; }
      `}</style>
      <div className={`${fullscreen ? 'fixed inset-0 z-50 flex flex-col bg-slate-900' : 'relative rounded-xl overflow-hidden border border-slate-200'}`}>
        {/* Toolbar */}
        <div className={`flex items-center gap-2 px-4 py-2.5 ${fullscreen ? 'bg-slate-800 border-b border-slate-700' : 'bg-slate-800'}`}>
          <div className="w-7 h-7 rounded-lg bg-teal-900 flex items-center justify-center shrink-0">
            <Presentation className="w-3.5 h-3.5 text-teal-300" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white truncate">{doc.title}</p>
            {total > 0 && <p className="text-xs text-slate-400">Slide {slide + 1} of {total}</p>}
          </div>

          {/* View toggle */}
          <div className="flex items-center gap-0.5 bg-slate-700 rounded-lg p-0.5">
            <button
              onClick={() => setView('slides')}
              className={`p-1.5 rounded-md transition-colors ${view === 'slides' ? 'bg-slate-500 text-white' : 'text-slate-400 hover:text-white'}`}
              title="Slide view"
            >
              <List className="w-3 h-3" />
            </button>
            <button
              onClick={() => setView('grid')}
              className={`p-1.5 rounded-md transition-colors ${view === 'grid' ? 'bg-slate-500 text-white' : 'text-slate-400 hover:text-white'}`}
              title="Grid overview"
            >
              <Grid3X3 className="w-3 h-3" />
            </button>
          </div>

          <button
            onClick={async () => { setDlPdf(true); try { await generatePdf(doc.title, doc.content_html); } finally { setDlPdf(false); } }}
            disabled={dlPdf}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-red-300 hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-60 border border-red-900"
            title="Download as PDF"
          >
            {dlPdf ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3" />} PDF
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

        {/* Main area */}
        {view === 'grid' ? (
          // Slide overview grid
          <div className={`overflow-auto p-4 bg-slate-900 ${fullscreen ? 'flex-1' : 'max-h-[420px]'}`}>
            <div className="grid grid-cols-3 gap-3">
              {slides.map((s, idx) => (
                <button
                  key={idx}
                  onClick={() => goTo(idx)}
                  className={`relative rounded-lg overflow-hidden border-2 transition-all text-left ${idx === slide ? 'border-teal-400 shadow-lg shadow-teal-900/50' : 'border-slate-700 hover:border-slate-500'}`}
                >
                  <div className={`p-3 min-h-20 ${s.slideType === 'title' ? 'bg-slate-800' : s.slideType === 'summary' ? 'bg-teal-900' : 'bg-white'}`}>
                    <p className={`text-xs font-bold leading-tight line-clamp-2 ${s.slideType !== 'content' ? 'text-white' : 'text-slate-900'}`}>
                      {s.heading || `Slide ${idx + 1}`}
                    </p>
                    <div className={`mt-1.5 text-xs leading-tight line-clamp-3 opacity-70 ${s.slideType !== 'content' ? 'text-slate-300' : 'text-slate-600'}`}
                      dangerouslySetInnerHTML={{ __html: s.bodyHtml.replace(/<[^>]+>/g, ' ') }} />
                  </div>
                  <div className={`absolute top-1 right-1.5 text-xs font-mono opacity-50 ${s.slideType !== 'content' ? 'text-slate-400' : 'text-slate-500'}`}>
                    {idx + 1}
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          // Single slide view
          <div className={`${fullscreen ? 'flex-1 overflow-hidden' : 'min-h-72'}`}>
            <SlideDisplay slide={current} index={slide} total={total} fullscreen={fullscreen} />
          </div>
        )}

        {/* Navigation bar */}
        {view === 'slides' && total > 1 && (
          <div className={`flex items-center justify-between px-4 py-3 ${fullscreen ? 'bg-slate-800 border-t border-slate-700' : 'bg-slate-800 border-t border-slate-700'}`}>
            <button
              onClick={() => setSlide(s => Math.max(0, s - 1))}
              disabled={slide === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-40 border border-slate-600"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Prev
            </button>

            {/* Dot indicators */}
            <div className="flex items-center gap-1 flex-wrap justify-center max-w-xs">
              {Array.from({ length: total }).map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setSlide(idx)}
                  title={slides[idx]?.heading || `Slide ${idx + 1}`}
                  className={`h-1.5 rounded-full transition-all ${idx === slide ? 'w-5 bg-teal-400' : 'w-1.5 bg-slate-600 hover:bg-slate-400'}`}
                />
              ))}
            </div>

            <button
              onClick={() => setSlide(s => Math.min(total - 1, s + 1))}
              disabled={slide === total - 1}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-40 border border-slate-600"
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

  // suppress unused warning — courseId may be used for future RLS scoping
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
                {isNotes ? 'Notes (PDF)' : 'Slides'}
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
          <BookOpen className="w-2.5 h-2.5" /> Slides
        </span>
      )}
    </span>
  );
}
