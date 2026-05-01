import { useState, useEffect, useCallback } from 'react';
import {
  FileText, ChevronLeft, ChevronRight,
  Download, BookOpen, Maximize2, Minimize2, Loader2,
  Target, Lightbulb, FlaskConical, ListChecks, LayoutPanelLeft,
  StickyNote,
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

// ─── HTML helpers ────────────────────────────────────────────────────────────

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
  type: 'h1' | 'h2' | 'h3' | 'p' | 'bullet' | 'numbered' | 'quote';
  text: string;
  indent?: number;
}

function parseHtmlToBlocks(html: string): TextBlock[] {
  const blocks: TextBlock[] = [];
  const div = document.createElement('div');
  div.innerHTML = html;

  let listCounter = 0;
  function processNode(node: Element) {
    const tag = node.tagName?.toLowerCase();
    const text = node.textContent?.trim() || '';
    if (!text) return;
    if (tag === 'h1') { blocks.push({ type: 'h1', text }); }
    else if (tag === 'h2') { blocks.push({ type: 'h2', text }); }
    else if (tag === 'h3') { blocks.push({ type: 'h3', text }); }
    else if (tag === 'blockquote') { blocks.push({ type: 'quote', text }); }
    else if (tag === 'li') {
      const inOl = node.closest('ol') !== null;
      if (inOl) { listCounter++; blocks.push({ type: 'numbered', text, indent: listCounter }); }
      else blocks.push({ type: 'bullet', text });
    }
    else if (tag === 'ol') {
      listCounter = 0;
      node.querySelectorAll('li').forEach(li => {
        listCounter++;
        blocks.push({ type: 'numbered', text: li.textContent?.trim() || '', indent: listCounter });
      });
    }
    else if (tag === 'ul') {
      node.querySelectorAll('li').forEach(li => {
        blocks.push({ type: 'bullet', text: li.textContent?.trim() || '' });
      });
    }
    else if (tag === 'p') { blocks.push({ type: 'p', text }); }
    else if (node.children.length > 0) {
      Array.from(node.children).forEach(c => processNode(c as Element));
    } else {
      blocks.push({ type: 'p', text });
    }
  }

  Array.from(div.children).forEach(c => processNode(c as Element));
  return blocks.filter(b => b.text.length > 0);
}

// ─── PDF generation ──────────────────────────────────────────────────────────
async function generatePdf(title: string, contentHtml: string) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const pageW = 210, pageH = 297;
  const mL = 18, mR = 18, mT = 28, mB = 22;
  const usableW = pageW - mL - mR;
  let y = mT;
  let pageNum = 1;

  // ── helpers ──
  const newPage = () => {
    doc.addPage();
    pageNum++;
    y = mT;
    // Running header on each new page
    doc.setFillColor(15, 118, 110);
    doc.rect(0, 0, pageW, 10, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.text('LESSON NOTES', mL, 6.5);
    doc.text(title.slice(0, 60), pageW / 2, 6.5, { align: 'center' });
    doc.text(new Date().toLocaleDateString(), pageW - mR, 6.5, { align: 'right' });
  };

  const check = (needed: number) => { if (y + needed > pageH - mB) newPage(); };

  // ── Cover page ──
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageW, 80, 'F');
  doc.setFillColor(14, 165, 233);
  doc.rect(0, 80, pageW, 2, 'F');

  doc.setTextColor(14, 165, 233);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('LESSON NOTES', mL, 24);

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  const titleLines = doc.splitTextToSize(title, usableW);
  titleLines.forEach((line: string, i: number) => {
    doc.text(line, mL, 38 + i * 12);
  });

  doc.setTextColor(148, 163, 184);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(new Date().toLocaleDateString('en-AU', { year: 'numeric', month: 'long', day: 'numeric' }), mL, 72);

  y = 96;

  // ── Key points box (if extractable) ──
  const kpMatch = contentHtml.match(/<ul[^>]*>([\s\S]*?)<\/ul>/i);
  if (kpMatch) {
    doc.setFillColor(240, 249, 255);
    doc.roundedRect(mL, y, usableW, 10, 2, 2, 'F');
    doc.setFillColor(14, 165, 233);
    doc.roundedRect(mL, y, 3, 10, 1, 1, 'F');
    doc.setTextColor(3, 105, 161);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('KEY LEARNING POINTS', mL + 6, y + 6.5);
    y += 14;
  }

  const blocks = parseHtmlToBlocks(contentHtml);

  for (const block of blocks) {
    if (block.type === 'h1') {
      check(20);
      y += 6;
      // Section divider
      doc.setFillColor(15, 23, 42);
      doc.rect(mL, y - 5, usableW, 14, 'F');
      doc.setFillColor(14, 165, 233);
      doc.rect(mL, y - 5, 3, 14, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      const lines = doc.splitTextToSize(block.text, usableW - 8);
      doc.text(lines[0], mL + 6, y + 4);
      y += 14;
    } else if (block.type === 'h2') {
      check(16);
      y += 5;
      doc.setFillColor(240, 253, 250);
      doc.roundedRect(mL, y - 4, usableW, 12, 2, 2, 'F');
      doc.setFillColor(15, 118, 110);
      doc.roundedRect(mL, y - 4, 3, 12, 1, 1, 'F');
      doc.setTextColor(15, 118, 110);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      const lines = doc.splitTextToSize(block.text, usableW - 8);
      lines.forEach((line: string) => { check(8); doc.text(line, mL + 6, y + 4); y += 8; });
      y += 2;
    } else if (block.type === 'h3') {
      check(12);
      y += 3;
      doc.setTextColor(30, 41, 59);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      const lines = doc.splitTextToSize(block.text, usableW);
      lines.forEach((line: string) => { check(7); doc.text(line, mL, y); y += 7; });
      // Underline
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.3);
      doc.line(mL, y, mL + Math.min(block.text.length * 1.8, usableW), y);
      y += 2;
    } else if (block.type === 'bullet') {
      check(7);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(51, 65, 85);
      doc.setFillColor(14, 165, 233);
      doc.circle(mL + 2.5, y - 1.5, 1.2, 'F');
      const lines = doc.splitTextToSize(block.text, usableW - 9);
      lines.forEach((line: string, idx: number) => {
        check(6);
        doc.text(line, mL + 7, y);
        if (idx < lines.length - 1) y += 6;
      });
      y += 6;
    } else if (block.type === 'numbered') {
      check(7);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(51, 65, 85);
      // Circle number
      doc.setFillColor(15, 118, 110);
      doc.circle(mL + 2.5, y - 1.5, 2.8, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(7);
      doc.text(String(block.indent ?? 1), mL + 2.5, y - 0.5, { align: 'center' });
      doc.setFontSize(10);
      doc.setTextColor(51, 65, 85);
      const lines = doc.splitTextToSize(block.text, usableW - 9);
      lines.forEach((line: string, idx: number) => {
        check(6);
        doc.text(line, mL + 7, y);
        if (idx < lines.length - 1) y += 6;
      });
      y += 6;
    } else if (block.type === 'quote') {
      check(14);
      y += 3;
      const lines = doc.splitTextToSize(block.text, usableW - 12);
      const boxH = lines.length * 6 + 8;
      doc.setFillColor(254, 252, 232);
      doc.roundedRect(mL, y - 4, usableW, boxH, 2, 2, 'F');
      doc.setFillColor(234, 179, 8);
      doc.roundedRect(mL, y - 4, 3, boxH, 1, 1, 'F');
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bolditalic');
      doc.setTextColor(133, 77, 14);
      // Quote mark
      doc.setFontSize(20);
      doc.setTextColor(253, 224, 71);
      doc.text('\u201C', mL + 5, y + 4);
      doc.setFontSize(9);
      doc.setTextColor(133, 77, 14);
      doc.setFont('helvetica', 'italic');
      lines.forEach((line: string) => { check(6); doc.text(line, mL + 10, y + 2); y += 6; });
      y += 6;
    } else {
      // paragraph
      check(7);
      doc.setFontSize(10.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(51, 65, 85);
      const lines = doc.splitTextToSize(block.text, usableW);
      lines.forEach((line: string) => { check(6.5); doc.text(line, mL, y); y += 6.5; });
      y += 2;
    }
  }

  // ── Footer on every page ──
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    if (p === 1) {
      // Cover page footer already styled
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.3);
      doc.line(mL, pageH - 12, pageW - mR, pageH - 12);
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(148, 163, 184);
      doc.text(title, mL, pageH - 7);
      doc.text(`Page ${p} of ${total}`, pageW - mR, pageH - 7, { align: 'right' });
    } else {
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.3);
      doc.line(mL, pageH - 12, pageW - mR, pageH - 12);
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(148, 163, 184);
      doc.text(title, mL, pageH - 7);
      doc.text(`Page ${p} of ${total}`, pageW - mR, pageH - 7, { align: 'right' });
    }
  }

  doc.save(`${title.replace(/[^a-z0-9]/gi, '_')}.pdf`);
}

// ─── PPTX generation — pure browser, zero dependencies ──────────────────────

interface ParsedSlide {
  slideNumber: number;
  heading: string;
  slideType: string;
  bullets: string[];
  speakerNotes: string;
}

function parseSlidesFromHtml(slidesHtml: string): ParsedSlide[] {
  const div = document.createElement('div');
  div.innerHTML = slidesHtml;
  const slideEls = div.querySelectorAll('.slide');
  return Array.from(slideEls).map((el, idx) => {
    const h2 = el.querySelector('h2');
    const notesEl = el.querySelector('.speaker-notes');
    const heading = h2?.textContent?.trim() || `Slide ${idx + 1}`;
    const notes = notesEl?.textContent?.trim().replace(/^Speaker notes:?/i, '').trim() || '';
    const slideType = (el as HTMLElement).dataset?.slideType || 'concept';
    notesEl?.remove();
    h2?.remove();
    const bullets: string[] = [];
    const gather = (node: Element) => {
      const tag = node.tagName?.toLowerCase();
      const text = node.textContent?.trim() || '';
      if (!text) return;
      if (['li', 'p', 'h3'].includes(tag)) { bullets.push(text); return; }
      Array.from(node.children).forEach(c => gather(c as Element));
    };
    Array.from(el.children).forEach(c => gather(c as Element));
    return { slideNumber: idx + 1, heading, slideType, bullets, speakerNotes: notes };
  });
}

function xmlEscape(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

const W = 12192000, H = 6858000;
const emu = (inch: number) => Math.round(inch * 914400);

// Slide theme colors by type
const THEMES: Record<string, { bg: string; heading: string; accent: string; text: string; bar: string }> = {
  title:      { bg: '0F172A', heading: 'FFFFFF', accent: '0EA5E9', text: 'CBD5E1', bar: '0EA5E9' },
  objectives: { bg: '0C4A6E', heading: 'FFFFFF', accent: '38BDF8', text: 'BAE6FD', bar: '38BDF8' },
  concept:    { bg: 'FFFFFF', heading: '0F172A', accent: '0F766E', text: '334155', bar: '0F766E' },
  example:    { bg: 'F0FDF4', heading: '14532D', accent: '16A34A', text: '166534', bar: '16A34A' },
  activity:   { bg: 'FFF7ED', heading: '7C2D12', accent: 'EA580C', text: '9A3412', bar: 'EA580C' },
  summary:    { bg: '1E1B4B', heading: 'FFFFFF', accent: 'A78BFA', text: 'C4B5FD', bar: 'A78BFA' },
};

function makeSlideXml(s: ParsedSlide, courseTitle: string): string {
  const theme = THEMES[s.slideType] || THEMES.concept;
  const isTitle = s.slideType === 'title';
  const isDark = ['title', 'objectives', 'summary'].includes(s.slideType);

  const accentBar = `
    <p:sp>
      <p:nvSpPr><p:cNvPr id="2" name="Bar"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr/></p:nvSpPr>
      <p:spPr>
        <a:xfrm><a:off x="0" y="0"/><a:ext cx="${W}" cy="${emu(0.12)}"/></a:xfrm>
        <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
        <a:solidFill><a:srgbClr val="${theme.bar}"/></a:solidFill>
        <a:ln><a:noFill/></a:ln>
      </p:spPr>
      <p:txBody><a:bodyPr/><a:lstStyle/><a:p/></p:txBody>
    </p:sp>`;

  // Slide type label badge (top-right)
  const typeLabelMap: Record<string, string> = {
    title: '', objectives: 'LEARNING OBJECTIVES', concept: 'KEY CONCEPT',
    example: 'WORKED EXAMPLE', activity: 'ACTIVITY', summary: 'SUMMARY',
  };
  const typeLabel = typeLabelMap[s.slideType] || s.slideType.toUpperCase();
  const typeBadge = !isTitle && typeLabel ? `
    <p:sp>
      <p:nvSpPr><p:cNvPr id="8" name="TypeLabel"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr/></p:nvSpPr>
      <p:spPr>
        <a:xfrm><a:off x="${W - emu(1.8)}" y="${emu(0.18)}"/><a:ext cx="${emu(1.6)}" cy="${emu(0.3)}"/></a:xfrm>
        <a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val 20000"/></a:avLst></a:prstGeom>
        <a:solidFill><a:srgbClr val="${theme.bar}"><a:alpha val="25000"/></a:srgbClr></a:solidFill>
        <a:ln w="6350"><a:solidFill><a:srgbClr val="${theme.bar}"/></a:solidFill></a:ln>
      </p:spPr>
      <p:txBody>
        <a:bodyPr anchor="ctr" lIns="${emu(0.05)}" rIns="${emu(0.05)}"/>
        <a:lstStyle/>
        <a:p><a:pPr algn="ctr"/>
          <a:r><a:rPr lang="en-AU" sz="700" b="1" dirty="0">
            <a:solidFill><a:srgbClr val="${theme.accent}"/></a:solidFill>
            <a:latin typeface="Calibri"/>
          </a:rPr><a:t>${xmlEscape(typeLabel)}</a:t></a:r>
        </a:p>
      </p:txBody>
    </p:sp>` : '';

  // Slide number (bottom-left, non-title)
  const slideNum = !isTitle ? `
    <p:sp>
      <p:nvSpPr><p:cNvPr id="9" name="SlideNum"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr/></p:nvSpPr>
      <p:spPr>
        <a:xfrm><a:off x="${emu(0.15)}" y="${H - emu(0.38)}"/><a:ext cx="${emu(0.5)}" cy="${emu(0.32)}"/></a:xfrm>
        <a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/>
      </p:spPr>
      <p:txBody>
        <a:bodyPr anchor="ctr"/>
        <a:lstStyle/>
        <a:p><a:pPr algn="l"/>
          <a:r><a:rPr lang="en-AU" sz="800" dirty="0">
            <a:solidFill><a:srgbClr val="${isDark ? '64748B' : '94A3B8'}"/></a:solidFill>
            <a:latin typeface="Calibri"/>
          </a:rPr><a:t>${s.slideNumber}</a:t></a:r>
        </a:p>
      </p:txBody>
    </p:sp>` : '';

  // Heading
  const headingY = isTitle ? emu(1.8) : emu(0.55);
  const headingH = isTitle ? emu(1.6) : emu(0.75);
  const headingSz = isTitle ? 3800 : 2600;
  const headingTx = `
    <p:sp>
      <p:nvSpPr><p:cNvPr id="3" name="Heading"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr/></p:nvSpPr>
      <p:spPr>
        <a:xfrm><a:off x="${emu(0.4)}" y="${headingY}"/><a:ext cx="${W - emu(0.8)}" cy="${headingH}"/></a:xfrm>
        <a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/>
      </p:spPr>
      <p:txBody>
        <a:bodyPr wrap="square" lIns="${emu(0.05)}" rIns="${emu(0.05)}" tIns="0" bIns="0" anchor="${isTitle ? 'ctr' : 'b'}"/>
        <a:lstStyle/>
        <a:p>
          <a:pPr algn="${isTitle ? 'ctr' : 'l'}"/>
          <a:r><a:rPr lang="en-AU" sz="${headingSz}" b="1" dirty="0">
            <a:solidFill><a:srgbClr val="${theme.heading}"/></a:solidFill>
            <a:latin typeface="Calibri"/>
          </a:rPr><a:t>${xmlEscape(s.heading)}</a:t></a:r>
        </a:p>
      </p:txBody>
    </p:sp>`;

  // Accent divider line (below heading, non-title)
  const dividerLine = !isTitle ? `
    <p:sp>
      <p:nvSpPr><p:cNvPr id="10" name="Divider"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr/></p:nvSpPr>
      <p:spPr>
        <a:xfrm><a:off x="${emu(0.4)}" y="${emu(1.4)}"/><a:ext cx="${emu(2)}" cy="${emu(0.04)}"/></a:xfrm>
        <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
        <a:solidFill><a:srgbClr val="${theme.accent}"/></a:solidFill>
        <a:ln><a:noFill/></a:ln>
      </p:spPr>
      <p:txBody><a:bodyPr/><a:lstStyle/><a:p/></p:txBody>
    </p:sp>` : '';

  // Title slide extras
  const titleExtras = isTitle ? `
    <p:sp>
      <p:nvSpPr><p:cNvPr id="5" name="Sub"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr/></p:nvSpPr>
      <p:spPr>
        <a:xfrm><a:off x="${emu(0.4)}" y="${emu(3.6)}"/><a:ext cx="${W - emu(0.8)}" cy="${emu(0.6)}"/></a:xfrm>
        <a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/>
      </p:spPr>
      <p:txBody>
        <a:bodyPr wrap="square"/>
        <a:lstStyle/>
        <a:p><a:pPr algn="ctr"/>
          <a:r><a:rPr lang="en-AU" sz="1600" dirty="0">
            <a:solidFill><a:srgbClr val="${theme.accent}"/></a:solidFill>
            <a:latin typeface="Calibri"/>
          </a:rPr><a:t>${xmlEscape(courseTitle)}</a:t></a:r>
        </a:p>
      </p:txBody>
    </p:sp>
    <p:sp>
      <p:nvSpPr><p:cNvPr id="6" name="Date"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr/></p:nvSpPr>
      <p:spPr>
        <a:xfrm><a:off x="${emu(0.4)}" y="${emu(4.4)}"/><a:ext cx="${W - emu(0.8)}" cy="${emu(0.4)}"/></a:xfrm>
        <a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/>
      </p:spPr>
      <p:txBody>
        <a:bodyPr wrap="square"/>
        <a:lstStyle/>
        <a:p><a:pPr algn="ctr"/>
          <a:r><a:rPr lang="en-AU" sz="1100" dirty="0">
            <a:solidFill><a:srgbClr val="475569"/></a:solidFill>
            <a:latin typeface="Calibri"/>
          </a:rPr><a:t>${xmlEscape(new Date().toLocaleDateString('en-AU', { year: 'numeric', month: 'long' }))}</a:t></a:r>
        </a:p>
      </p:txBody>
    </p:sp>` : '';

  // Content bullets
  const bulletsXml = !isTitle && s.bullets.length > 0 ? `
    <p:sp>
      <p:nvSpPr><p:cNvPr id="4" name="Body"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr/></p:nvSpPr>
      <p:spPr>
        <a:xfrm><a:off x="${emu(0.4)}" y="${emu(1.6)}"/><a:ext cx="${W - emu(0.8)}" cy="${H - emu(2.1)}"/></a:xfrm>
        <a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/>
      </p:spPr>
      <p:txBody>
        <a:bodyPr wrap="square" lIns="${emu(0.05)}" rIns="${emu(0.05)}" tIns="${emu(0.08)}" bIns="${emu(0.05)}"/>
        <a:lstStyle/>
        ${s.bullets.map((b, bi) => `
        <a:p>
          <a:pPr marL="${emu(0.25)}" indent="${emu(-0.25)}" spc="${bi === 0 ? 0 : -150}">
            <a:buClr><a:srgbClr val="${theme.accent}"/></a:buClr>
            <a:buChar char="▸"/>
          </a:pPr>
          <a:r><a:rPr lang="en-AU" sz="1500" dirty="0">
            <a:solidFill><a:srgbClr val="${theme.text}"/></a:solidFill>
            <a:latin typeface="Calibri"/>
          </a:rPr><a:t>${xmlEscape(b)}</a:t></a:r>
        </a:p>`).join('')}
      </p:txBody>
    </p:sp>` : '';

  // Footer bar
  const footerBar = !isTitle ? `
    <p:sp>
      <p:nvSpPr><p:cNvPr id="7" name="Footer"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr/></p:nvSpPr>
      <p:spPr>
        <a:xfrm><a:off x="0" y="${H - emu(0.35)}"/><a:ext cx="${W}" cy="${emu(0.35)}"/></a:xfrm>
        <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
        <a:solidFill><a:srgbClr val="${isDark ? '1E293B' : 'F1F5F9'}"/></a:solidFill>
        <a:ln><a:noFill/></a:ln>
      </p:spPr>
      <p:txBody><a:bodyPr/><a:lstStyle/><a:p/></p:txBody>
    </p:sp>` : '';

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
       xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
       xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:bg><p:bgPr>
      <a:solidFill><a:srgbClr val="${theme.bg}"/></a:solidFill>
      <a:effectLst/>
    </p:bgPr></p:bg>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/>
        <a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
      ${accentBar}${typeBadge}${headingTx}${dividerLine}${titleExtras}${bulletsXml}${footerBar}${slideNum}
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sld>`;
}

function makeNotesXml(notes: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:notes xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
         xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
         xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree>
    <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
    <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/>
      <a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
    <p:sp><p:nvSpPr><p:cNvPr id="2" name="Notes"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr>
      <p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr>
      <p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/>
        <a:p><a:r><a:rPr lang="en-AU" dirty="0"/><a:t>${xmlEscape(notes)}</a:t></a:r></a:p>
      </p:txBody>
    </p:sp>
  </p:spTree></p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:notes>`;
}

function uint8(str: string): Uint8Array { return new TextEncoder().encode(str); }

function crc32(buf: Uint8Array): number {
  const table = (crc32 as unknown as { t?: Uint32Array }).t ??
    (() => {
      const t = new Uint32Array(256);
      for (let i = 0; i < 256; i++) {
        let c = i;
        for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        t[i] = c;
      }
      return ((crc32 as unknown as { t?: Uint32Array }).t = t);
    })();
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function le16(n: number) { return [(n & 0xFF), (n >> 8) & 0xFF]; }
function le32(n: number) { return [(n & 0xFF), (n >> 8) & 0xFF, (n >> 16) & 0xFF, (n >> 24) & 0xFF]; }

interface ZipEntry { name: string; data: Uint8Array; }

function buildZip(entries: ZipEntry[]): Uint8Array {
  const parts: Uint8Array[] = [];
  const centralDir: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = uint8(entry.name);
    const crc = crc32(entry.data);
    const size = entry.data.length;
    const localHeader = new Uint8Array([
      0x50,0x4B,0x03,0x04, 0x14,0x00, 0x00,0x00, 0x00,0x00,
      0x00,0x00,0x00,0x00, ...le32(crc), ...le32(size), ...le32(size),
      ...le16(nameBytes.length), 0x00,0x00, ...nameBytes,
    ]);
    parts.push(localHeader, entry.data);
    centralDir.push(new Uint8Array([
      0x50,0x4B,0x01,0x02, 0x14,0x00, 0x14,0x00, 0x00,0x00, 0x00,0x00,
      0x00,0x00,0x00,0x00, ...le32(crc), ...le32(size), ...le32(size),
      ...le16(nameBytes.length), 0x00,0x00, 0x00,0x00, 0x00,0x00, 0x00,0x00,
      0x20,0x00,0x00,0x00, ...le32(offset), ...nameBytes,
    ]));
    offset += localHeader.length + size;
  }

  const cdSize = centralDir.reduce((s, b) => s + b.length, 0);
  const eocd = new Uint8Array([
    0x50,0x4B,0x05,0x06, 0x00,0x00,0x00,0x00,
    ...le16(entries.length), ...le16(entries.length),
    ...le32(cdSize), ...le32(offset), 0x00,0x00,
  ]);

  const all = [...parts, ...centralDir, eocd];
  const total = all.reduce((s, b) => s + b.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const b of all) { out.set(b, pos); pos += b.length; }
  return out;
}

async function generatePptx(title: string, slidesHtml: string) {
  const slides = parseSlidesFromHtml(slidesHtml);
  if (slides.length === 0) return;

  const entries: ZipEntry[] = [];
  const add = (name: string, content: string) => entries.push({ name, data: uint8(content) });

  const slideTypes = slides.map((_, i) =>
    `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`
  ).join('');
  const noteTypes = slides.filter(s => s.speakerNotes).map((_, i) =>
    `<Override PartName="/ppt/notesSlides/notesSlide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml"/>`
  ).join('');

  add('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
  <Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
  ${slideTypes}${noteTypes}
</Types>`);

  add('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`);

  const presRels = slides.map((_, i) =>
    `<Relationship Id="rId${i + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i + 1}.xml"/>`
  ).join('');
  add('ppt/_rels/presentation.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>
  ${presRels}
</Relationships>`);

  const slideIdList = slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 2}"/>`).join('');
  add('ppt/presentation.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
                xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
                xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" saveSubsetFonts="1">
  <p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>
  <p:sldIdLst>${slideIdList}</p:sldIdLst>
  <p:sldSz cx="${W}" cy="${H}" type="screen16x9"/>
  <p:notesSz cx="6858000" cy="9144000"/>
</p:presentation>`);

  add('ppt/slideMasters/slideMaster1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
             xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
             xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree>
    <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
    <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/>
      <a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
  </p:spTree></p:cSld>
  <p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>
  <p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>
</p:sldMaster>`);

  add('ppt/slideMasters/_rels/slideMaster1.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
</Relationships>`);

  add('ppt/slideLayouts/slideLayout1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
             xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
             xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1">
  <p:cSld name="Blank"><p:spTree>
    <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
    <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/>
      <a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
  </p:spTree></p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sldLayout>`);

  add('ppt/slideLayouts/_rels/slideLayout1.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>
</Relationships>`);

  for (let i = 0; i < slides.length; i++) {
    const s = slides[i];
    add(`ppt/slides/slide${i + 1}.xml`, makeSlideXml(s, title));

    const slideRels = [
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>`,
    ];
    if (s.speakerNotes) {
      slideRels.push(`<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide${i + 1}.xml"/>`);
    }
    add(`ppt/slides/_rels/slide${i + 1}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${slideRels.join('')}
</Relationships>`);

    if (s.speakerNotes) {
      add(`ppt/notesSlides/notesSlide${i + 1}.xml`, makeNotesXml(s.speakerNotes));
      add(`ppt/notesSlides/_rels/notesSlide${i + 1}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="../slides/slide${i + 1}.xml"/>
</Relationships>`);
    }
  }

  const zip = buildZip(entries);
  const blob = new Blob([zip], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${title.replace(/[^a-z0-9]/gi, '_')}.pptx`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Slide type icons & theme ────────────────────────────────────────────────

const SLIDE_META: Record<string, {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  bgClass: string;
  headingClass: string;
  accentClass: string;
  badgeBg: string;
  badgeText: string;
  bulletColor: string;
}> = {
  title:      { icon: LayoutPanelLeft, label: 'Title',       bgClass: 'bg-slate-900',      headingClass: 'text-white',       accentClass: 'bg-sky-500',    badgeBg: 'bg-sky-500/20',    badgeText: 'text-sky-300',   bulletColor: 'text-sky-400' },
  objectives: { icon: Target,          label: 'Objectives',  bgClass: 'bg-sky-900',         headingClass: 'text-white',       accentClass: 'bg-sky-400',    badgeBg: 'bg-sky-400/20',    badgeText: 'text-sky-200',   bulletColor: 'text-sky-300' },
  concept:    { icon: Lightbulb,       label: 'Concept',     bgClass: 'bg-white',           headingClass: 'text-slate-900',   accentClass: 'bg-teal-600',   badgeBg: 'bg-teal-50',       badgeText: 'text-teal-700',  bulletColor: 'text-slate-700' },
  example:    { icon: FlaskConical,    label: 'Example',     bgClass: 'bg-green-50',        headingClass: 'text-green-900',   accentClass: 'bg-green-500',  badgeBg: 'bg-green-100',     badgeText: 'text-green-800', bulletColor: 'text-green-800' },
  activity:   { icon: ListChecks,      label: 'Activity',    bgClass: 'bg-orange-50',       headingClass: 'text-orange-900',  accentClass: 'bg-orange-500', badgeBg: 'bg-orange-100',    badgeText: 'text-orange-800',bulletColor: 'text-orange-800' },
  summary:    { icon: StickyNote,      label: 'Summary',     bgClass: 'bg-slate-800',       headingClass: 'text-white',       accentClass: 'bg-violet-400', badgeBg: 'bg-violet-400/20', badgeText: 'text-violet-200',bulletColor: 'text-slate-300' },
};

function getSlideType(el: Element): string {
  return (el as HTMLElement).dataset?.slideType || 'concept';
}

interface ParsedSlideUI {
  index: number;
  heading: string;
  slideType: string;
  bodyHtml: string;
  speakerNotes: string;
}

function parseSlidesForUI(slidesHtml: string): ParsedSlideUI[] {
  const div = document.createElement('div');
  div.innerHTML = slidesHtml;
  const slideEls = div.querySelectorAll('.slide');
  return Array.from(slideEls).map((el, idx) => {
    const cloned = el.cloneNode(true) as Element;
    const h2 = cloned.querySelector('h2');
    const notesEl = cloned.querySelector('.speaker-notes');
    const heading = h2?.textContent?.trim() || `Slide ${idx + 1}`;
    const notes = notesEl?.textContent?.trim().replace(/^Speaker notes:?/i, '').trim() || '';
    const slideType = getSlideType(el);
    notesEl?.remove();
    h2?.remove();
    return { index: idx, heading, slideType, bodyHtml: cloned.innerHTML, speakerNotes: notes };
  });
}

// ─── Slides Viewer ───────────────────────────────────────────────────────────
function SlidesViewer({ doc }: { doc: LessonDocument }) {
  const [slide, setSlide] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [dlPdf, setDlPdf] = useState(false);
  const [dlPptx, setDlPptx] = useState(false);

  const slides = parseSlidesForUI(doc.content_html);
  const total = slides.length;
  const current = slides[slide];
  const meta = SLIDE_META[current?.slideType] || SLIDE_META.concept;
  const TypeIcon = meta.icon;

  const prev = useCallback(() => setSlide(s => Math.max(0, s - 1)), []);
  const next = useCallback(() => setSlide(s => Math.min(total - 1, s + 1)), [total]);

  useEffect(() => {
    if (!fullscreen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') next();
      else if (e.key === 'ArrowLeft') prev();
      else if (e.key === 'Escape') setFullscreen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [fullscreen, next, prev]);

  const toolbar = (
    <div className={`flex items-center gap-2 px-4 py-2.5 shrink-0 ${fullscreen ? 'bg-slate-900 border-b border-slate-700' : 'bg-slate-900 rounded-t-xl'}`}>
      <div className="w-7 h-7 rounded-lg bg-slate-700 flex items-center justify-center shrink-0">
        <LayoutPanelLeft className="w-3.5 h-3.5 text-slate-300" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white truncate">{doc.title}</p>
        {total > 0 && <p className="text-xs text-slate-500">{slide + 1} / {total}</p>}
      </div>
      <button
        onClick={() => setShowNotes(n => !n)}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-colors border ${showNotes ? 'bg-amber-500/20 text-amber-300 border-amber-700' : 'text-slate-400 hover:bg-slate-700 border-slate-700'}`}
        title="Toggle speaker notes"
      >
        <StickyNote className="w-3 h-3" /> Notes
      </button>
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
      <button onClick={() => setFullscreen(f => !f)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-700 transition-colors" title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
        {fullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
      </button>
    </div>
  );

  if (total === 0) {
    return (
      <div className="rounded-xl overflow-hidden border border-slate-700">
        {toolbar}
        <div className="bg-white p-8 text-center text-slate-400 text-sm">No slides found.</div>
      </div>
    );
  }

  const slideContent = current && (
    <div className={`relative flex-1 flex flex-col overflow-hidden ${meta.bgClass} transition-colors duration-300`}>
      {/* Top accent bar */}
      <div className={`h-1 w-full ${meta.accentClass} shrink-0`} />

      {/* Slide inner */}
      <div className="flex-1 flex flex-col px-8 py-6 overflow-hidden">
        {/* Badge + heading row */}
        <div className="flex items-start gap-3 mb-4">
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold shrink-0 mt-0.5 ${meta.badgeBg} ${meta.badgeText}`}>
            <TypeIcon className="w-3 h-3" />
            {meta.label}
          </div>
          <div className="flex-1">
            <h2 className={`text-2xl font-extrabold leading-tight ${meta.headingClass}`}>
              {current.heading}
            </h2>
            <div className={`mt-2 h-0.5 w-16 rounded-full ${meta.accentClass}`} />
          </div>
        </div>

        {/* Body content */}
        <div className={`flex-1 overflow-auto text-sm leading-relaxed slide-body ${
          ['title', 'objectives', 'summary'].includes(current.slideType)
            ? 'prose-invert-slide'
            : 'prose prose-slate'
        } max-w-none`}
          dangerouslySetInnerHTML={{ __html: current.bodyHtml }}
        />
      </div>

      {/* Bottom footer */}
      <div className={`h-8 px-8 flex items-center justify-between text-xs shrink-0 ${
        ['title', 'objectives', 'summary'].includes(current.slideType)
          ? 'bg-black/20 text-slate-500'
          : 'bg-slate-100 text-slate-400'
      }`}>
        <span className="truncate">{doc.title}</span>
        <span className="shrink-0 font-medium">{slide + 1} / {total}</span>
      </div>
    </div>
  );

  const speakerNotes = showNotes && current?.speakerNotes && (
    <div className="shrink-0 bg-amber-950/80 border-t border-amber-900 px-6 py-3">
      <p className="text-xs font-bold text-amber-400 mb-1 uppercase tracking-wide">Speaker Notes</p>
      <p className="text-xs text-amber-100 leading-relaxed">{current.speakerNotes}</p>
    </div>
  );

  // Slide thumbnail strip
  const thumbnailStrip = (
    <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide px-2 py-2 bg-slate-950 shrink-0">
      {slides.map((s, idx) => {
        const m = SLIDE_META[s.slideType] || SLIDE_META.concept;
        const Icon = m.icon;
        return (
          <button
            key={idx}
            onClick={() => setSlide(idx)}
            className={`relative shrink-0 w-16 h-10 rounded overflow-hidden border-2 transition-all ${
              idx === slide ? 'border-sky-400 scale-105' : 'border-slate-700 hover:border-slate-500 opacity-60 hover:opacity-100'
            } ${m.bgClass}`}
            title={s.heading}
          >
            <div className={`absolute top-0 left-0 right-0 h-0.5 ${m.accentClass}`} />
            <div className="flex flex-col items-center justify-center h-full gap-0.5">
              <Icon className={`w-3 h-3 ${['title','objectives','summary'].includes(s.slideType) ? 'text-white' : 'text-slate-600'}`} />
              <span className={`text-[7px] font-bold truncate w-full text-center px-1 ${['title','objectives','summary'].includes(s.slideType) ? 'text-slate-300' : 'text-slate-500'}`}>{idx + 1}</span>
            </div>
          </button>
        );
      })}
    </div>
  );

  if (fullscreen) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-slate-950">
        {toolbar}
        <div className="flex-1 flex flex-col overflow-hidden">
          {slideContent}
          {speakerNotes}
        </div>
        {/* Nav bar */}
        <div className="flex items-center justify-between px-6 py-3 bg-slate-900 border-t border-slate-700 shrink-0">
          <button onClick={prev} disabled={slide === 0}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-slate-700 hover:bg-slate-600 rounded-xl transition-colors disabled:opacity-30">
            <ChevronLeft className="w-4 h-4" /> Previous
          </button>
          {thumbnailStrip}
          <button onClick={next} disabled={slide === total - 1}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-sky-600 hover:bg-sky-500 rounded-xl transition-colors disabled:opacity-30">
            Next <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl overflow-hidden border border-slate-700 shadow-lg flex flex-col">
      {toolbar}
      <div className="flex flex-col" style={{ minHeight: 360 }}>
        {slideContent}
        {speakerNotes}
      </div>
      {/* Navigation */}
      <div className="flex items-center gap-3 bg-slate-950 border-t border-slate-800 px-4 py-2.5 shrink-0">
        <button onClick={prev} disabled={slide === 0}
          className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors disabled:opacity-30">
          <ChevronLeft className="w-3.5 h-3.5" /> Prev
        </button>
        {thumbnailStrip}
        <button onClick={next} disabled={slide === total - 1}
          className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-sky-700 hover:bg-sky-600 rounded-lg transition-colors disabled:opacity-30">
          Next <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// ─── Notes Viewer ────────────────────────────────────────────────────────────
function NotesViewer({ doc }: { doc: LessonDocument }) {
  const [dlPdf, setDlPdf] = useState(false);

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
      <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-teal-700 to-teal-600">
        <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
          <FileText className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-white truncate">{doc.title}</p>
          <p className="text-xs text-teal-200">Lesson Notes</p>
        </div>
        <button
          onClick={async () => {
            setDlPdf(true);
            try { await generatePdf(doc.title, doc.content_html); }
            finally { setDlPdf(false); }
          }}
          disabled={dlPdf}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-white/15 hover:bg-white/25 border border-white/20 rounded-lg transition-colors disabled:opacity-60"
        >
          {dlPdf ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
          Download PDF
        </button>
      </div>
      <div className="p-6 bg-white">
        <div
          className="prose prose-slate prose-sm max-w-none leading-relaxed
            prose-headings:font-bold prose-h2:text-teal-700 prose-h2:border-b prose-h2:border-teal-100 prose-h2:pb-1
            prose-h3:text-slate-700 prose-blockquote:border-l-4 prose-blockquote:border-amber-400
            prose-blockquote:bg-amber-50 prose-blockquote:py-1 prose-blockquote:rounded-r
            prose-strong:text-slate-800 prose-li:marker:text-teal-500"
          dangerouslySetInnerHTML={{ __html: doc.content_html }}
        />
      </div>
    </div>
  );
}

// ─── Main viewer ─────────────────────────────────────────────────────────────
export default function LessonDocumentViewer({ lessonId, courseId: _courseId }: Props) {
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
                    ? isNotes ? 'bg-teal-600 text-white border-teal-700 shadow-sm' : 'bg-slate-800 text-white border-slate-700 shadow-sm'
                    : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:text-slate-700'
                }`}>
                {isNotes ? <FileText className="w-3 h-3" /> : <LayoutPanelLeft className="w-3 h-3" />}
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
