import { summarizeMaterial } from './ai';
import type { MaterialSummary } from './ai';

/** Largest teacher file the AI reads in one go. */
export const MAX_MATERIAL_BYTES = 12 * 1024 * 1024;
export const MATERIAL_ACCEPT = '.pdf,.docx,.pptx,.txt,.md';

function xmlText(xml: string, paragraphTag: string, textTag: string): string {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const paras = Array.from(doc.getElementsByTagName(paragraphTag));
  return paras
    .map(p => Array.from(p.getElementsByTagName(textTag)).map(t => t.textContent ?? '').join(''))
    .filter(line => line.trim())
    .join('\n');
}

async function docxText(file: File): Promise<string> {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(file);
  const xml = await zip.file('word/document.xml')?.async('string');
  if (!xml) throw new Error('This Word file could not be read.');
  return xmlText(xml, 'w:p', 'w:t');
}

async function pptxText(file: File): Promise<string> {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(file);
  const slideNumber = (name: string) => Number(name.match(/(\d+)\.xml$/)?.[1] ?? 0);
  const slides = Object.keys(zip.files).filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => slideNumber(a) - slideNumber(b));
  if (slides.length === 0) throw new Error('This PowerPoint file has no slides that could be read.');
  const parts: string[] = [];
  for (const name of slides) {
    const n = slideNumber(name);
    const text = xmlText(await zip.file(name)!.async('string'), 'a:p', 'a:t');
    const notesFile = zip.file(`ppt/notesSlides/notesSlide${n}.xml`);
    const notes = notesFile ? xmlText(await notesFile.async('string'), 'a:p', 'a:t') : '';
    parts.push(`--- Slide ${n} ---\n${text}${notes ? `\nSpeaker notes: ${notes}` : ''}`);
  }
  return parts.join('\n\n');
}

function base64Of(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(new Error('The file could not be read.'));
    reader.readAsDataURL(file);
  });
}

/**
 * Reads a teacher's file and asks the AI to summarise it for course planning.
 * PDFs go to the AI as documents (it reads text, tables and images); Word, PowerPoint
 * and text files are converted to text in the browser first.
 */
export async function readMaterial(file: File): Promise<MaterialSummary & { file_name: string }> {
  if (file.size > MAX_MATERIAL_BYTES) throw new Error('That file is larger than 12 MB. Please upload a smaller file or split it.');
  const name = file.name.toLowerCase();
  let summary: MaterialSummary;
  if (name.endsWith('.pdf')) {
    summary = await summarizeMaterial({ file_name: file.name, material_pdf_base64: await base64Of(file) });
  } else {
    const text = name.endsWith('.docx') ? await docxText(file)
      : name.endsWith('.pptx') ? await pptxText(file)
        : name.endsWith('.txt') || name.endsWith('.md') ? await file.text()
          : (() => { throw new Error('Please upload a PDF, Word (.docx), PowerPoint (.pptx) or text file.'); })();
    if (text.trim().length < 200) throw new Error('There is too little text in that file to plan a course from.');
    summary = await summarizeMaterial({ file_name: file.name, material_text: text.slice(0, 60000) });
  }
  return { ...summary, file_name: file.name };
}
