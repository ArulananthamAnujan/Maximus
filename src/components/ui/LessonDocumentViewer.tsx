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

// ─── PPTX generation — pure browser, zero dependencies ──────────────────────
// Builds a valid .pptx (Office Open XML ZIP) without any npm package.

interface ParsedSlide {
  slideNumber: number;
  heading: string;
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
    notesEl?.remove();
    h2?.remove();
    // Collect visible text lines as bullets
    const bullets: string[] = [];
    const gather = (node: Element) => {
      const tag = node.tagName?.toLowerCase();
      const text = node.textContent?.trim() || '';
      if (!text) return;
      if (['li', 'p', 'h3'].includes(tag)) { bullets.push(text); return; }
      Array.from(node.children).forEach(c => gather(c as Element));
    };
    Array.from(el.children).forEach(c => gather(c as Element));
    return { slideNumber: idx + 1, heading, bullets, speakerNotes: notes };
  });
}

function xmlEscape(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

// EMU conversion: 1 inch = 914400 EMU, slide is 12192000 x 6858000 EMU (widescreen 16:9)
const W = 12192000;
const H = 6858000;
const emu = (inch: number) => Math.round(inch * 914400);

function makeSlideXml(s: ParsedSlide, isTitle: boolean, courseTitle: string): string {
  const BG = isTitle ? '0F172A' : 'FFFFFF';
  const headingColor = isTitle ? 'FFFFFF' : '0F172A';
  const subColor = isTitle ? '0EA5E9' : '334155';
  const barColor = '0E7490';

  // Top accent bar shape (800 EMU tall)
  const accentBar = `
    <p:sp>
      <p:nvSpPr><p:cNvPr id="2" name="Bar"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr/></p:nvSpPr>
      <p:spPr>
        <a:xfrm><a:off x="0" y="0"/><a:ext cx="${W}" cy="${emu(0.1)}"/></a:xfrm>
        <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
        <a:solidFill><a:srgbClr val="${barColor}"/></a:solidFill>
        <a:ln><a:noFill/></a:ln>
      </p:spPr>
      <p:txBody><a:bodyPr/><a:lstStyle/><a:p/></p:txBody>
    </p:sp>`;

  // Heading text box
  const headingY = isTitle ? emu(1.5) : emu(0.18);
  const headingH = isTitle ? emu(1.4) : emu(0.65);
  const headingSize = isTitle ? 3600 : 2400;
  const headingTx = `
    <p:sp>
      <p:nvSpPr><p:cNvPr id="3" name="Heading"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr/></p:nvSpPr>
      <p:spPr>
        <a:xfrm><a:off x="${emu(0.4)}" y="${headingY}"/><a:ext cx="${W - emu(0.8)}" cy="${headingH}"/></a:xfrm>
        <a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/>
      </p:spPr>
      <p:txBody>
        <a:bodyPr wrap="square" lIns="${emu(0.05)}" rIns="${emu(0.05)}" tIns="${emu(0.05)}" bIns="${emu(0.05)}"/>
        <a:lstStyle/>
        <a:p>
          <a:pPr algn="${isTitle ? 'ctr' : 'l'}"/>
          <a:r><a:rPr lang="en-AU" sz="${headingSize}" b="1" dirty="0">
            <a:solidFill><a:srgbClr val="${headingColor}"/></a:solidFill>
            <a:latin typeface="Calibri"/>
          </a:rPr><a:t>${xmlEscape(s.heading)}</a:t></a:r>
        </a:p>
      </p:txBody>
    </p:sp>`;

  // Title slide subtitle (course name + date)
  const subtitleTx = isTitle ? `
    <p:sp>
      <p:nvSpPr><p:cNvPr id="5" name="Sub"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr/></p:nvSpPr>
      <p:spPr>
        <a:xfrm><a:off x="${emu(0.4)}" y="${emu(3.1)}"/><a:ext cx="${W - emu(0.8)}" cy="${emu(0.6)}"/></a:xfrm>
        <a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/>
      </p:spPr>
      <p:txBody>
        <a:bodyPr wrap="square"/>
        <a:lstStyle/>
        <a:p><a:pPr algn="ctr"/>
          <a:r><a:rPr lang="en-AU" sz="1800" dirty="0">
            <a:solidFill><a:srgbClr val="${subColor}"/></a:solidFill>
            <a:latin typeface="Calibri"/>
          </a:rPr><a:t>${xmlEscape(courseTitle)}</a:t></a:r>
        </a:p>
      </p:txBody>
    </p:sp>
    <p:sp>
      <p:nvSpPr><p:cNvPr id="6" name="Date"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr/></p:nvSpPr>
      <p:spPr>
        <a:xfrm><a:off x="${emu(0.4)}" y="${emu(3.85)}"/><a:ext cx="${W - emu(0.8)}" cy="${emu(0.4)}"/></a:xfrm>
        <a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/>
      </p:spPr>
      <p:txBody>
        <a:bodyPr wrap="square"/>
        <a:lstStyle/>
        <a:p><a:pPr algn="ctr"/>
          <a:r><a:rPr lang="en-AU" sz="1300" dirty="0">
            <a:solidFill><a:srgbClr val="94A3B8"/></a:solidFill>
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
        <a:xfrm><a:off x="${emu(0.4)}" y="${emu(1.05)}"/><a:ext cx="${W - emu(0.8)}" cy="${H - emu(1.55)}"/></a:xfrm>
        <a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/>
      </p:spPr>
      <p:txBody>
        <a:bodyPr wrap="square" lIns="${emu(0.05)}" rIns="${emu(0.05)}" tIns="${emu(0.08)}" bIns="${emu(0.05)}"/>
        <a:lstStyle/>
        ${s.bullets.map(b => `
        <a:p>
          <a:pPr marL="${emu(0.2)}" indent="${emu(-0.2)}">
            <a:buChar char="•"/>
          </a:pPr>
          <a:r><a:rPr lang="en-AU" sz="1400" dirty="0">
            <a:solidFill><a:srgbClr val="334155"/></a:solidFill>
            <a:latin typeface="Calibri"/>
          </a:rPr><a:t>${xmlEscape(b)}</a:t></a:r>
        </a:p>`).join('')}
      </p:txBody>
    </p:sp>` : '';

  // Bottom footer bar
  const footerBar = !isTitle ? `
    <p:sp>
      <p:nvSpPr><p:cNvPr id="7" name="Footer"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr/></p:nvSpPr>
      <p:spPr>
        <a:xfrm><a:off x="0" y="${H - emu(0.08)}"/><a:ext cx="${W}" cy="${emu(0.08)}"/></a:xfrm>
        <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
        <a:solidFill><a:srgbClr val="E2E8F0"/></a:solidFill>
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
      <a:solidFill><a:srgbClr val="${BG}"/></a:solidFill>
      <a:effectLst/>
    </p:bgPr></p:bg>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/>
        <a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
      ${accentBar}${headingTx}${subtitleTx}${bulletsXml}${footerBar}
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

// Minimal ZIP builder — no external library needed
function uint8(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

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
      0x50,0x4B,0x03,0x04, // sig
      0x14,0x00,           // version needed
      0x00,0x00,           // flags
      0x00,0x00,           // compression (stored)
      0x00,0x00,0x00,0x00, // mod time/date
      ...le32(crc),
      ...le32(size),
      ...le32(size),
      ...le16(nameBytes.length),
      0x00,0x00,           // extra length
      ...nameBytes,
    ]);
    parts.push(localHeader, entry.data);
    centralDir.push(new Uint8Array([
      0x50,0x4B,0x01,0x02, // sig
      0x14,0x00,           // version made by
      0x14,0x00,           // version needed
      0x00,0x00,           // flags
      0x00,0x00,           // compression
      0x00,0x00,0x00,0x00, // mod time/date
      ...le32(crc),
      ...le32(size),
      ...le32(size),
      ...le16(nameBytes.length),
      0x00,0x00,           // extra length
      0x00,0x00,           // comment length
      0x00,0x00,           // disk start
      0x00,0x00,           // int attr
      0x20,0x00,0x00,0x00, // ext attr
      ...le32(offset),
      ...nameBytes,
    ]));
    offset += localHeader.length + size;
  }

  const cdSize = centralDir.reduce((s, b) => s + b.length, 0);
  const eocd = new Uint8Array([
    0x50,0x4B,0x05,0x06, // sig
    0x00,0x00,0x00,0x00, // disk numbers
    ...le16(entries.length),
    ...le16(entries.length),
    ...le32(cdSize),
    ...le32(offset),
    0x00,0x00,           // comment length
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

  const add = (name: string, content: string) =>
    entries.push({ name, data: uint8(content) });

  // [Content_Types].xml
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

  // _rels/.rels
  add('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`);

  // ppt/_rels/presentation.xml.rels
  const presRels = slides.map((_, i) =>
    `<Relationship Id="rId${i + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i + 1}.xml"/>`
  ).join('');
  add('ppt/_rels/presentation.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>
  ${presRels}
</Relationships>`);

  // ppt/presentation.xml
  const slideIdList = slides.map((_, i) =>
    `<p:sldId id="${256 + i}" r:id="rId${i + 2}"/>`
  ).join('');
  add('ppt/presentation.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
                xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
                xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
                saveSubsetFonts="1">
  <p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>
  <p:sldIdLst>${slideIdList}</p:sldIdLst>
  <p:sldSz cx="${W}" cy="${H}" type="screen16x9"/>
  <p:notesSz cx="6858000" cy="9144000"/>
</p:presentation>`);

  // Minimal slide master + layout (required by spec)
  const masterXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
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
</p:sldMaster>`;
  add('ppt/slideMasters/slideMaster1.xml', masterXml);
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

  // Individual slides
  for (let i = 0; i < slides.length; i++) {
    const s = slides[i];
    add(`ppt/slides/slide${i + 1}.xml`, makeSlideXml(s, i === 0, title));

    // Slide rels (points to layout)
    const slideRels: string[] = [
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

      {/* Slide content — fixed height so navigating slides never resizes the card */}
      <div className={`${fullscreen ? 'flex items-center justify-center bg-slate-900 p-8' : 'border-x border-b border-slate-200 bg-white'}`}
        style={{ height: fullscreen ? 'calc(100vh - 112px)' : '420px', overflow: 'hidden' }}>
        <div className={`${fullscreen ? 'w-full max-w-4xl bg-white rounded-2xl shadow-2xl p-12' : 'p-6 bg-white'} h-full overflow-y-auto`}>
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
      <div className="p-6 bg-white">
        <style>{`
          .notes-body h2 { font-size: 1.15rem; font-weight: 700; color: #0f172a; margin: 1.5rem 0 0.5rem; padding-bottom: 0.25rem; border-bottom: 2px solid #e2e8f0; }
          .notes-body h3 { font-size: 1rem; font-weight: 600; color: #1e293b; margin: 1.25rem 0 0.4rem; }
          .notes-body p { color: #334155; line-height: 1.75; margin: 0.6rem 0; }
          .notes-body ul, .notes-body ol { padding-left: 1.4rem; margin: 0.5rem 0 0.75rem; color: #334155; }
          .notes-body li { margin: 0.3rem 0; line-height: 1.65; }
          .notes-body strong { color: #0f172a; font-weight: 600; }
          .notes-body em { color: #475569; }
          .notes-body mark { background: #fef9c3; color: #713f12; padding: 0.05rem 0.3rem; border-radius: 3px; }
          .notes-body code { background: #f1f5f9; color: #0f172a; padding: 0.1rem 0.35rem; border-radius: 4px; font-size: 0.85em; font-family: monospace; }
          .notes-body pre { background: #1e293b; color: #e2e8f0; padding: 1rem; border-radius: 8px; overflow-x: auto; font-size: 0.85rem; margin: 0.75rem 0; }
          .notes-body blockquote { border-left: 4px solid #0ea5e9; background: #f0f9ff; color: #0c4a6e; padding: 0.75rem 1rem; border-radius: 0 8px 8px 0; margin: 0.75rem 0; font-style: italic; }
          .notes-body table { width: 100%; border-collapse: collapse; margin: 1rem 0; font-size: 0.9rem; }
          .notes-body th { background: #0f172a; color: #f8fafc; padding: 0.6rem 0.9rem; text-align: left; font-weight: 600; }
          .notes-body td { padding: 0.55rem 0.9rem; border-bottom: 1px solid #e2e8f0; color: #334155; }
          .notes-body tr:nth-child(even) td { background: #f8fafc; }
          .notes-body details { border: 1px solid #e2e8f0; border-radius: 8px; margin: 0.75rem 0; overflow: hidden; }
          .notes-body details summary { background: #f1f5f9; padding: 0.65rem 1rem; font-weight: 600; color: #1e293b; cursor: pointer; user-select: none; list-style: none; display: flex; align-items: center; gap: 0.5rem; }
          .notes-body details summary::before { content: '▶'; font-size: 0.7rem; color: #64748b; transition: transform 0.2s; }
          .notes-body details[open] summary::before { transform: rotate(90deg); }
          .notes-body details > *:not(summary) { padding: 0.75rem 1rem; }
        `}</style>
        <div className="notes-body" dangerouslySetInnerHTML={{ __html: doc.content_html }} />
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
