/** Text helpers shared by the server-side course build (mirrors src/lib/slides.ts and coursePlan.ts). */

export function escapeHtml(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function stripHtml(html: string): string {
  return String(html ?? '')
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

const ALLOWED = new Set([
  'p', 'br', 'h2', 'h3', 'h4', 'h5', 'ul', 'ol', 'li', 'strong', 'em', 'b', 'i', 'u', 'code', 'pre',
  'blockquote', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'hr', 'div', 'span', 'sub', 'sup', 'a',
]);

/**
 * Keeps simple formatting tags, without any attributes (except safe link targets), and
 * drops everything else. Pages sanitise again when they show the content.
 */
export function cleanHtml(html: string): string {
  return String(html ?? '')
    .replace(/<(script|style|iframe|object|embed|template|noscript)[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g, (tag, name: string, attrs: string) => {
      const t = name.toLowerCase();
      if (!ALLOWED.has(t)) return '';
      if (tag.startsWith('</')) return `</${t}>`;
      if (t === 'a') {
        const href = /href\s*=\s*"(https?:\/\/[^"]*)"/i.exec(attrs)?.[1];
        return href ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">` : '<a>';
      }
      return `<${t}>`;
    });
}

export interface PresentationSlide { slide_number?: number; heading: string; content_html: string; speaker_notes: string }

/** Stores a generated deck in the format the slide viewer reads. */
export function slidesToHtml(slides: PresentationSlide[]): string {
  const body = slides.map((sl, i) => {
    const notes = sl.speaker_notes?.trim()
      ? `<aside class="speaker-notes"><strong>Speaker notes:</strong> ${escapeHtml(sl.speaker_notes.trim())}</aside>`
      : '';
    return `<section class="slide" data-slide="${i + 1}"><h2>${escapeHtml(sl.heading || `Slide ${i + 1}`)}</h2>${cleanHtml(sl.content_html || '')}${notes}</section>`;
  }).join('\n');
  return `<div class="slides-deck">${body}</div>`;
}

// deno-lint-ignore no-explicit-any
type Plan = { brief?: any; material?: { summary?: string } | null } | null;

/** Learners and level to write for: from the saved plan when there is one. */
export function audienceFromPlan(plan: Plan, fallbackLevel = 'intermediate') {
  const b = plan?.brief ?? null;
  const material = plan?.material?.summary;
  const brief = b
    ? { ...b, ...(material ? { teacher_material: material } : {}) }
    : material ? { teacher_material: material } : undefined;
  return {
    target_audience: b ? [b.audience, b.starting_level].filter(Boolean).join(', ') || 'general learners' : 'general learners',
    difficulty: b?.difficulty || fallbackLevel,
    brief,
  };
}
