import { sanitizeHtml } from './utils';
import type { PresentationSlide } from './ai';

export interface ParsedSlide {
  heading: string;
  bodyHtml: string;
  speakerNotes: string;
  slideType: 'title' | 'content' | 'summary';
}

function escapeHtml(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function stripHtml(html: string): string {
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

/** Stores a generated deck in the format the slide viewer reads. Text is escaped. */
export function slidesToHtml(slides: PresentationSlide[]): string {
  const body = slides.map((sl, i) => {
    const notes = sl.speaker_notes?.trim()
      ? `<aside class="speaker-notes"><strong>Speaker notes:</strong> ${escapeHtml(sl.speaker_notes.trim())}</aside>`
      : '';
    return `<section class="slide" data-slide="${i + 1}"><h2>${escapeHtml(sl.heading || `Slide ${i + 1}`)}</h2>${sanitizeHtml(sl.content_html || '')}${notes}</section>`;
  }).join('\n');
  return `<div class="slides-deck">${body}</div>`;
}

export function parseSlidesFromHtml(html: string): ParsedSlide[] {
  if (!html?.trim()) return [{ heading: 'No slides available', bodyHtml: '<p>Try regenerating notes &amp; slides.</p>', speakerNotes: '', slideType: 'content' }];
  const doc = new DOMParser().parseFromString(`<div>${sanitizeHtml(html)}</div>`, 'text/html');
  const root = doc.body.firstElementChild as HTMLElement;
  const slideEls = root.querySelectorAll('.slide');
  if (slideEls.length === 0) return [{ heading: '', bodyHtml: root.innerHTML, speakerNotes: '', slideType: 'content' }];
  return Array.from(slideEls).map((el, idx) => {
    const notesEl = el.querySelector('.speaker-notes');
    const notes = notesEl?.textContent?.trim().replace(/^Speaker notes:?/i, '').trim() || '';
    notesEl?.remove();
    const h2 = el.querySelector('h2');
    const heading = h2?.textContent?.trim() || `Slide ${idx + 1}`;
    h2?.remove();
    const bodyHtml = el.innerHTML.trim();
    const lower = heading.toLowerCase();
    const isSummary = lower.includes('summary') || lower.includes('next steps') || lower.includes('what comes next');
    return { heading, bodyHtml, speakerNotes: notes, slideType: idx === 0 ? 'title' : isSummary ? 'summary' : 'content' };
  });
}

// ─── PowerPoint export ──────────────────────────────────────────────────────

type TextRun = { text: string; options: Record<string, unknown> };

/** Turns a slide body into PowerPoint paragraphs: real bullets, numbered lists and code blocks. */
function bodyToRuns(html: string, color: string): { runs: TextRun[]; chars: number } {
  const doc = new DOMParser().parseFromString(`<div>${sanitizeHtml(html)}</div>`, 'text/html');
  const root = doc.body.firstElementChild as HTMLElement;
  const runs: TextRun[] = [];
  let chars = 0;
  const push = (text: string, options: Record<string, unknown>) => {
    const clean = text.replace(/\s+\n/g, '\n').trim();
    if (!clean) return;
    chars += clean.length;
    runs.push({ text: clean, options: { color, breakLine: true, paraSpaceAfter: 4, ...options } });
  };
  const walk = (node: Element) => {
    for (const child of Array.from(node.children)) {
      const tag = child.tagName.toLowerCase();
      if (tag === 'ul' || tag === 'ol') {
        for (const li of Array.from(child.children)) {
          push(li.textContent || '', { bullet: tag === 'ol' ? { type: 'number' } : true });
        }
      } else if (tag === 'pre') {
        push(child.textContent || '', { fontFace: 'Consolas', fontSize: 11, color: '0F172A', highlight: 'F1F5F9' });
      } else if (/^h[1-6]$/.test(tag)) {
        push(child.textContent || '', { bold: true });
      } else if (tag === 'div' || tag === 'section') {
        walk(child);
      } else {
        push(child.textContent || '', {});
      }
    }
  };
  walk(root);
  if (runs.length === 0) push(root.textContent || '', {});
  return { runs, chars };
}

/** Smaller text for fuller slides, so content stays inside the slide. */
function fontSizeFor(chars: number): number {
  if (chars < 260) return 18;
  if (chars < 420) return 16;
  if (chars < 600) return 14;
  if (chars < 850) return 12;
  return 11;
}

export interface SlideDeck {
  title: string;
  slides: ParsedSlide[];
}

/**
 * Builds one .pptx from one or more decks (a lesson, a week, or a whole course) and
 * downloads it. Speaker notes go into PowerPoint's presenter notes.
 */
export async function downloadPptx(fileTitle: string, decks: SlideDeck[], cover?: { title: string; subtitle?: string }) {
  const pptxgen = (await import('pptxgenjs')).default;
  const prs = new pptxgen();
  // 10 x 5.625 inches; every position below is for this size.
  prs.layout = 'LAYOUT_16x9';
  prs.title = fileTitle;

  const NAVY = '111827';
  const BLUE = '3B82F6';
  const LIGHT_BLUE = 'DBEAFE';
  const WHITE = 'FFFFFF';
  const SLATE = '334155';
  const LIGHT_GRAY = 'F8FAFC';

  const addCover = (title: string, subtitle?: string) => {
    const s = prs.addSlide();
    s.background = { color: NAVY };
    s.addShape(prs.ShapeType.rect, { x: 0, y: 3.9, w: 10, h: 0.06, fill: { color: BLUE } });
    s.addText(title, { x: 0.6, y: 1.2, w: 8.8, h: 2.0, fontSize: 34, bold: true, color: WHITE, fontFace: 'Calibri', valign: 'bottom', fit: 'shrink' });
    if (subtitle) s.addText(subtitle, { x: 0.6, y: 3.25, w: 8.8, h: 0.55, fontSize: 14, color: '94A3B8', fontFace: 'Calibri' });
  };

  if (cover) addCover(cover.title, cover.subtitle);

  for (const deck of decks) {
    deck.slides.forEach((slide, idx) => {
      if (slide.slideType === 'title' || idx === 0) {
        const s = prs.addSlide();
        s.background = { color: NAVY };
        s.addShape(prs.ShapeType.rect, { x: 0, y: 3.9, w: 10, h: 0.06, fill: { color: BLUE } });
        s.addText(slide.heading || deck.title, { x: 0.6, y: 1.0, w: 8.8, h: 2.1, fontSize: 32, bold: true, color: WHITE, fontFace: 'Calibri', valign: 'bottom', fit: 'shrink' });
        const sub = stripHtml(slide.bodyHtml || '');
        if (sub) s.addText(sub.slice(0, 220), { x: 0.6, y: 3.15, w: 8.8, h: 0.7, fontSize: 14, color: '94A3B8', fontFace: 'Calibri', valign: 'top' });
        if (slide.speakerNotes) s.addNotes(slide.speakerNotes);
        return;
      }
      const dark = slide.slideType === 'summary';
      const s = prs.addSlide();
      s.background = { color: dark ? '0F2744' : WHITE };
      if (!dark) {
        s.addShape(prs.ShapeType.rect, { x: 0, y: 0, w: 0.07, h: 5.625, fill: { color: BLUE } });
        s.addShape(prs.ShapeType.rect, { x: 0, y: 0, w: 10, h: 0.85, fill: { color: LIGHT_GRAY } });
        s.addShape(prs.ShapeType.rect, { x: 0, y: 0.85, w: 10, h: 0.04, fill: { color: LIGHT_BLUE } });
      } else {
        s.addShape(prs.ShapeType.rect, { x: 0, y: 0, w: 10, h: 0.06, fill: { color: BLUE } });
      }
      s.addText(slide.heading, { x: 0.3, y: 0.1, w: 8.9, h: 0.65, fontSize: 22, bold: true, color: dark ? WHITE : NAVY, fontFace: 'Calibri', valign: 'middle', fit: 'shrink' });
      s.addText(String(idx + 1), { x: 9.2, y: 0.2, w: 0.5, h: 0.4, fontSize: 9, color: '94A3B8', align: 'right' });
      const { runs, chars } = bodyToRuns(slide.bodyHtml || '', dark ? 'E2E8F0' : SLATE);
      if (runs.length) {
        s.addText(runs, {
          x: 0.4, y: 1.05, w: 9.2, h: 4.0,
          fontSize: fontSizeFor(chars), fontFace: 'Calibri', valign: 'top', fit: 'shrink',
        });
      }
      s.addText(deck.title, { x: 0.3, y: 5.25, w: 8.5, h: 0.25, fontSize: 8, color: '94A3B8' });
      if (slide.speakerNotes) s.addNotes(slide.speakerNotes);
    });
  }

  await prs.writeFile({ fileName: `${fileTitle.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'slides'}.pptx` });
}
