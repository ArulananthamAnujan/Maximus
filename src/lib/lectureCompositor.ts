/**
 * Puts the live board inside the lecture video: the presenter is full screen until the
 * first board step, then the screen splits into the lecturer's materials (code being
 * typed, its output, key points) on the left and the presenter on the right. The
 * browser plays the lecture once and records the result with the presenter's voice.
 */
import type { Board, BoardStep } from '../components/course/LectureBoard';

export const W = 1280;
export const H = 720;
const BOARD = { x: 28, y: 28, w: 852, h: 664 };
const PRESENTER = { x: 900, y: 28, w: 352, h: 664 };
const SPLIT_SECONDS = 0.8;

const SANS = 'Inter, "Segoe UI", system-ui, -apple-system, Roboto, sans-serif';
const MONO = 'ui-monospace, "SFMono-Regular", Menlo, Consolas, "Liberation Mono", monospace';

// ─── Timing (same rules as the board in the player) ─────────────────────────

export function stepStarts(board: Board, duration: number): number[] {
  const total = Math.max(1, board.total_words);
  return board.steps.map(s => Math.max(0, (s.at / total) * duration - 0.4));
}

function activeStep(starts: number[], time: number): number {
  let found = -1;
  starts.forEach((t, i) => { if (time >= t) found = i; });
  return found;
}

// ─── Code colouring ─────────────────────────────────────────────────────────

const KEYWORDS: Record<string, string[]> = {
  python: ['def', 'return', 'import', 'from', 'as', 'if', 'elif', 'else', 'for', 'while', 'in', 'not', 'and', 'or', 'is', 'None', 'True', 'False', 'class', 'with', 'try', 'except', 'finally', 'lambda', 'yield', 'pass', 'break', 'continue', 'raise', 'print'],
  sql: ['SELECT', 'FROM', 'WHERE', 'GROUP', 'BY', 'ORDER', 'HAVING', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'ON', 'AS', 'AND', 'OR', 'NOT', 'IN', 'LIMIT', 'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE', 'CREATE', 'TABLE', 'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'DISTINCT', 'NULL', 'IS', 'LIKE', 'BETWEEN', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'DESC', 'ASC'],
  javascript: ['const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'import', 'from', 'export', 'new', 'class', 'await', 'async', 'true', 'false', 'null', 'undefined', 'of', 'in', 'try', 'catch'],
};
const COLOR = { text: '#e2e8f0', keyword: '#7dd3fc', string: '#fcd34d', number: '#fdba74', comment: '#64748b', call: '#6ee7b7', lineNo: '#475569' };

interface Token { text: string; color: string }

function tokenize(line: string, language: string): Token[] {
  const lang = language.toLowerCase();
  const list = KEYWORDS[lang === 'py' ? 'python' : lang === 'js' || lang === 'ts' || lang === 'typescript' ? 'javascript' : lang] ?? [];
  const isSql = lang === 'sql';
  const keywords = new Set(list);
  const comment = isSql ? /^--.*/ : ['python', 'py', 'bash', 'r'].includes(lang) ? /^#.*/ : /^\/\/.*/;
  const out: Token[] = [];
  let i = 0;
  while (i < line.length) {
    const rest = line.slice(i);
    let m: RegExpExecArray | null;
    let color = COLOR.text;
    if ((m = comment.exec(rest))) color = COLOR.comment;
    else if ((m = /^(["'`])(?:\\.|(?!\1).)*\1?/.exec(rest))) color = COLOR.string;
    else if ((m = /^\d+(?:\.\d+)?/.exec(rest))) color = COLOR.number;
    else if ((m = /^[A-Za-z_]\w*/.exec(rest))) {
      const w = m[0];
      if (keywords.has(isSql ? w.toUpperCase() : w)) color = COLOR.keyword;
      else if (line[i + w.length] === '(') color = COLOR.call;
    } else m = /^[\s\S]/.exec(rest)!;
    out.push({ text: m[0], color });
    i += m[0].length;
  }
  return out;
}

// ─── Drawing helpers ────────────────────────────────────────────────────────

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Splits text into lines that fit a width (by words, or by characters for long words). */
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(' ')) {
      const candidate = line ? `${line} ${word}` : word;
      if (ctx.measureText(candidate).width <= width) { line = candidate; continue; }
      if (line) lines.push(line);
      line = word;
      while (ctx.measureText(line).width > width && line.length > 1) {
        let cut = line.length - 1;
        while (cut > 1 && ctx.measureText(line.slice(0, cut)).width > width) cut--;
        lines.push(line.slice(0, cut));
        line = line.slice(cut);
      }
    }
    lines.push(line);
  }
  return lines;
}

/** Draws the presenter video into a rectangle, cropped from the middle to fill it. */
function drawPresenter(ctx: CanvasRenderingContext2D, video: HTMLVideoElement, r: { x: number; y: number; w: number; h: number }, radius: number) {
  const sw = video.videoWidth || W;
  const sh = video.videoHeight || H;
  const target = r.w / r.h;
  let cw = sw, ch = sh;
  if (sw / sh > target) cw = sh * target; else ch = sw / target;
  const cx = (sw - cw) / 2;
  const cy = Math.max(0, (sh - ch) / 2 - (sh - ch) * 0.2); // keep a little more headroom
  ctx.save();
  roundRect(ctx, r.x, r.y, r.w, r.h, radius);
  ctx.clip();
  ctx.fillStyle = '#000';
  ctx.fillRect(r.x, r.y, r.w, r.h);
  try { ctx.drawImage(video, cx, cy, cw, ch, r.x, r.y, r.w, r.h); } catch { /* frame not ready */ }
  ctx.restore();
  if (radius > 0) {
    ctx.save();
    roundRect(ctx, r.x, r.y, r.w, r.h, radius);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }
}

function drawCode(ctx: CanvasRenderingContext2D, step: BoardStep, since: number, gap: number) {
  const { x, y, w, h } = BOARD;
  // Window bar
  ctx.fillStyle = '#020617';
  roundRect(ctx, x, y, w, 46, 18);
  ctx.fill();
  ctx.fillRect(x, y + 28, w, 18);
  ['#f87171', '#fbbf24', '#34d399'].forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(x + 24 + i * 20, y + 23, 6, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.font = `16px ${MONO}`;
  ctx.fillStyle = '#cbd5e1';
  ctx.textBaseline = 'middle';
  ctx.fillText(step.title || 'lesson', x + 96, y + 23);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#64748b';
  ctx.font = `13px ${SANS}`;
  ctx.fillText((step.language || '').toUpperCase(), x + w - 20, y + 23);
  ctx.textAlign = 'left';

  const code = step.code ?? '';
  const typing = Math.min(gap * 0.6, Math.max(1.5, code.length * 0.045));
  const shown = since >= typing ? code.length : Math.floor((since / typing) * code.length);
  const done = shown >= code.length;
  const outputShown = done && !!step.output && since >= typing + 0.6;

  // Output console takes the bottom of the board once it appears
  ctx.font = `17px ${MONO}`;
  const outputLines = step.output ? wrap(ctx, step.output, w - 56).slice(0, 8) : [];
  const outputH = outputShown ? 44 + outputLines.length * 24 : 0;

  // Code, wrapped to the board, scrolled to keep the cursor in view
  ctx.font = `21px ${MONO}`;
  const lineH = 31;
  const gutter = 52;
  const area = { top: y + 64, bottom: y + h - outputH - 18 };
  const rows: Array<{ no: number | null; text: string }> = [];
  code.slice(0, shown).split('\n').forEach((line, n) => {
    const parts = wrap(ctx, line, w - gutter - 40);
    parts.forEach((p, k) => rows.push({ no: k === 0 ? n + 1 : null, text: p }));
  });
  const fits = Math.max(1, Math.floor((area.bottom - area.top) / lineH));
  const visible = rows.slice(Math.max(0, rows.length - fits));
  ctx.textBaseline = 'alphabetic';
  visible.forEach((row, i) => {
    const ly = area.top + (i + 1) * lineH - 8;
    if (row.no !== null) {
      ctx.fillStyle = COLOR.lineNo;
      ctx.textAlign = 'right';
      ctx.fillText(String(row.no), x + gutter - 10, ly);
      ctx.textAlign = 'left';
    }
    let cx = x + gutter + 8;
    for (const t of tokenize(row.text, step.language ?? '')) {
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, cx, ly);
      cx += ctx.measureText(t.text).width;
    }
    if (i === visible.length - 1 && (!done || Math.floor(since * 2) % 2 === 0)) {
      ctx.fillStyle = '#7dd3fc';
      ctx.fillRect(cx + 2, ly - 20, 10, 24);
    }
  });
  if (rows.length === 0) {
    ctx.fillStyle = '#7dd3fc';
    ctx.fillRect(x + gutter + 10, area.top + 4, 10, 24);
  }

  if (outputShown) {
    const oy = y + h - outputH;
    ctx.fillStyle = '#000000';
    ctx.fillRect(x, oy, w, outputH - 18);
    roundRect(ctx, x, oy, w, outputH, 18);
    ctx.fill();
    ctx.fillStyle = '#64748b';
    ctx.font = `12px ${SANS}`;
    ctx.fillText('OUTPUT', x + 28, oy + 24);
    ctx.font = `17px ${MONO}`;
    ctx.fillStyle = '#6ee7b7';
    outputLines.forEach((l, i) => ctx.fillText(l, x + 28, oy + 48 + i * 24));
  }
}

function drawPoints(ctx: CanvasRenderingContext2D, step: BoardStep, since: number, gap: number) {
  const { x, y, w } = BOARD;
  const points = step.points ?? [];
  const each = Math.min(2.5, (gap * 0.7) / Math.max(1, points.length));
  const count = Math.min(points.length, Math.floor(since / each) + 1);
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#7dd3fc';
  ctx.font = `600 15px ${SANS}`;
  ctx.fillText('KEY POINTS', x + 56, y + 92);
  let cy = y + 150;
  if (step.title) {
    ctx.fillStyle = '#ffffff';
    ctx.font = `700 38px ${SANS}`;
    for (const line of wrap(ctx, step.title, w - 112)) { ctx.fillText(line, x + 56, cy); cy += 48; }
    cy += 18;
  }
  ctx.font = `28px ${SANS}`;
  points.slice(0, count).forEach((p, i) => {
    const fade = Math.min(1, (since - i * each) / 0.4);
    ctx.globalAlpha = Math.max(0, fade);
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.arc(x + 66, cy - 9, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f1f5f9';
    for (const line of wrap(ctx, p, w - 150)) { ctx.fillText(line, x + 90, cy); cy += 38; }
    cy += 14;
    ctx.globalAlpha = 1;
  });
}

function drawTitle(ctx: CanvasRenderingContext2D, step: BoardStep) {
  const { x, y, w, h } = BOARD;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#7dd3fc';
  ctx.font = `600 16px ${SANS}`;
  ctx.fillText('NEXT UP', x + w / 2, y + h / 2 - 40);
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 46px ${SANS}`;
  const lines = wrap(ctx, step.title ?? '', w - 120);
  lines.forEach((l, i) => ctx.fillText(l, x + w / 2, y + h / 2 + 20 + i * 56));
  ctx.textAlign = 'left';
}

export interface FrameInfo { title: string; subtitle?: string }

/** Draws one frame of the finished lecture for this moment of the presenter video. */
export function drawFrame(ctx: CanvasRenderingContext2D, video: HTMLVideoElement, board: Board, starts: number[], info: FrameInfo) {
  const time = video.currentTime;
  const duration = video.duration || 1;
  const index = activeStep(starts, time);
  const split = index < 0 ? 0 : Math.min(1, (time - starts[0]) / SPLIT_SECONDS);
  const ease = split < 0.5 ? 2 * split * split : 1 - Math.pow(-2 * split + 2, 2) / 2;

  // Background
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#0b1220');
  bg.addColorStop(1, '#111c33');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Board (fades in as the screen splits)
  if (index >= 0) {
    ctx.save();
    ctx.globalAlpha = ease;
    ctx.fillStyle = '#0f172a';
    roundRect(ctx, BOARD.x, BOARD.y, BOARD.w, BOARD.h, 18);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 2;
    ctx.stroke();
    roundRect(ctx, BOARD.x, BOARD.y, BOARD.w, BOARD.h, 18);
    ctx.clip();
    const step = board.steps[index];
    const start = starts[index];
    const end = starts[index + 1] ?? duration;
    const since = Math.max(0, time - start);
    const gap = Math.max(1, end - start);
    if (step.kind === 'code') drawCode(ctx, step, since, gap);
    else if (step.kind === 'points') drawPoints(ctx, step, since, gap);
    else drawTitle(ctx, step);
    // Progress through the lecture's board
    ctx.fillStyle = 'rgba(56,189,248,0.7)';
    ctx.fillRect(BOARD.x, BOARD.y + BOARD.h - 4, BOARD.w * ((index + 1) / board.steps.length), 4);
    ctx.restore();
  }

  // Presenter: full screen, moving into their panel as the board appears
  const full = { x: 0, y: 0, w: W, h: H };
  const r = {
    x: full.x + (PRESENTER.x - full.x) * ease,
    y: full.y + (PRESENTER.y - full.y) * ease,
    w: full.w + (PRESENTER.w - full.w) * ease,
    h: full.h + (PRESENTER.h - full.h) * ease,
  };
  drawPresenter(ctx, video, r, 18 * ease);

  // Title card at the start
  if (index < 0 || ease < 1) {
    ctx.save();
    ctx.globalAlpha = 1 - ease;
    ctx.font = `700 30px ${SANS}`;
    const boxW = Math.min(760, 80 + ctx.measureText(info.title.slice(0, 60)).width);
    ctx.fillStyle = 'rgba(2,6,23,0.72)';
    roundRect(ctx, 40, H - 150, Math.max(420, boxW), 104, 16);
    ctx.fill();
    ctx.fillStyle = '#7dd3fc';
    ctx.font = `600 15px ${SANS}`;
    ctx.textBaseline = 'alphabetic';
    if (info.subtitle) ctx.fillText(info.subtitle.toUpperCase().slice(0, 70), 68, H - 112);
    ctx.fillStyle = '#ffffff';
    ctx.font = `700 30px ${SANS}`;
    ctx.fillText(info.title.slice(0, 60), 68, H - 72);
    ctx.restore();
  }
}

// ─── Recording ──────────────────────────────────────────────────────────────

export interface ComposeOptions {
  videoUrl: string;
  board: Board;
  info: FrameInfo;
  canvas: HTMLCanvasElement;
  onProgress: (seconds: number, duration: number) => void;
  /** Called when the tab is hidden (recording waits) or shown again. */
  onPausedChange?: (paused: boolean) => void;
  signal: AbortSignal;
}

function pickMimeType(): { mimeType: string; ext: 'mp4' | 'webm'; fileType: string } {
  const candidates: Array<[string, 'mp4' | 'webm']> = [
    // H.264 plays everywhere, including iPhones and iPads
    ['video/mp4;codecs=avc1.42E01F,mp4a.40.2', 'mp4'],
    ['video/mp4;codecs=avc1.42E01F,opus', 'mp4'],
    ['video/mp4', 'mp4'],
    ['video/webm;codecs=vp9,opus', 'webm'],
    ['video/webm;codecs=vp8,opus', 'webm'],
    ['video/webm', 'webm'],
  ];
  for (const [mimeType, ext] of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mimeType)) {
      return { mimeType, ext, fileType: ext === 'mp4' ? 'video/mp4' : 'video/webm' };
    }
  }
  throw new Error('This browser cannot record video. Please use a recent version of Chrome or Edge.');
}

export const canCompose = () => {
  try {
    return typeof MediaRecorder !== 'undefined' && typeof HTMLCanvasElement.prototype.captureStream === 'function' && !!pickMimeType();
  } catch { return false; }
};

/**
 * Plays the presenter video once, drawing every frame with the board, and records it
 * with the presenter's voice. Takes as long as the video. Resolves with the finished file.
 */
export async function composeLectureVideo(opts: ComposeOptions): Promise<File> {
  const { mimeType, ext, fileType } = pickMimeType();
  const video = document.createElement('video');
  video.crossOrigin = 'anonymous';
  video.preload = 'auto';
  video.playsInline = true;
  video.src = opts.videoUrl;
  await new Promise<void>((resolve, reject) => {
    video.addEventListener('loadedmetadata', () => resolve(), { once: true });
    video.addEventListener('error', () => reject(new Error('Could not load the presenter video.')), { once: true });
  });
  const duration = video.duration;
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('Could not read the presenter video.');

  const canvas = opts.canvas;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot draw the video.');
  const starts = stepStarts(opts.board, duration);

  // The voice is taken from the video through the audio graph (not played out loud)
  const audio = new AudioContext();
  const source = audio.createMediaElementSource(video);
  const voice = audio.createMediaStreamDestination();
  source.connect(voice);

  let stream: MediaStream;
  try {
    stream = new MediaStream([...canvas.captureStream(30).getVideoTracks(), ...voice.stream.getAudioTracks()]);
  } catch {
    throw new Error('The browser would not record this video (it may be blocked by storage settings).');
  }
  // Sharp enough to read code (about 19 MB a minute), but never more than about 450 MB
  const videoBits = Math.round(Math.min(2_500_000, Math.max(1_000_000, (450 * 8 * 1_048_576) / duration - 96_000)));
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: videoBits, audioBitsPerSecond: 96_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
  const stopped = new Promise<void>(resolve => { recorder.onstop = () => resolve(); });

  let frame = 0;
  const draw = () => {
    drawFrame(ctx, video, opts.board, starts, opts.info);
    opts.onProgress(video.currentTime, duration);
    frame = requestAnimationFrame(draw);
  };

  // A hidden tab stops drawing, so wait while it is hidden
  const onVisibility = () => {
    if (document.hidden) {
      if (!video.paused) { video.pause(); if (recorder.state === 'recording') recorder.pause(); opts.onPausedChange?.(true); }
    } else if (video.paused && !video.ended && recorder.state === 'paused') {
      recorder.resume();
      video.play().catch(() => {});
      opts.onPausedChange?.(false);
    }
  };
  document.addEventListener('visibilitychange', onVisibility);

  const cleanup = () => {
    cancelAnimationFrame(frame);
    document.removeEventListener('visibilitychange', onVisibility);
    video.pause();
    stream.getTracks().forEach(t => t.stop());
    audio.close().catch(() => {});
  };

  try {
    await audio.resume();
    drawFrame(ctx, video, opts.board, starts, opts.info);
    recorder.start(1000);
    draw();
    await video.play();
    await new Promise<void>((resolve, reject) => {
      video.addEventListener('ended', () => resolve(), { once: true });
      video.addEventListener('error', () => reject(new Error('The presenter video stopped playing.')), { once: true });
      opts.signal.addEventListener('abort', () => reject(new DOMException('Stopped', 'AbortError')), { once: true });
    });
    drawFrame(ctx, video, opts.board, starts, opts.info);
    await new Promise(r => setTimeout(r, 300));
    recorder.stop();
    await stopped;
  } catch (err) {
    if (recorder.state !== 'inactive') recorder.stop();
    cleanup();
    throw err;
  }
  cleanup();
  const blob = new Blob(chunks, { type: fileType });
  return new File([blob], `lecture-with-board.${ext}`, { type: fileType });
}
