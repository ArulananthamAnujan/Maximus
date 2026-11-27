import { useEffect, useMemo, useState } from 'react';
import type { RefObject, ReactNode } from 'react';
import { Terminal, Lightbulb } from 'lucide-react';

export interface BoardStep {
  at: number;
  kind: 'code' | 'points' | 'title';
  title?: string;
  language?: string;
  code?: string;
  output?: string;
  points?: string[];
}
export interface Board {
  total_words: number;
  steps: BoardStep[];
  /** The board has been put inside the lesson's video, so the player does not show it again */
  embedded?: boolean;
  composite_path?: string;
  original_path?: string;
}

interface Props {
  board: Board;
  videoRef: RefObject<HTMLVideoElement | null>;
  /** Shown before the first step. */
  heading?: string;
}

// ─── A tiny highlighter (no HTML injection: it returns React nodes) ─────────
const KEYWORDS: Record<string, string[]> = {
  python: ['def', 'return', 'import', 'from', 'as', 'if', 'elif', 'else', 'for', 'while', 'in', 'not', 'and', 'or', 'is', 'None', 'True', 'False', 'class', 'with', 'try', 'except', 'finally', 'lambda', 'yield', 'pass', 'break', 'continue', 'raise', 'print'],
  sql: ['select', 'from', 'where', 'group', 'by', 'order', 'having', 'join', 'left', 'right', 'inner', 'outer', 'on', 'as', 'and', 'or', 'not', 'in', 'limit', 'insert', 'into', 'values', 'update', 'set', 'delete', 'create', 'table', 'count', 'sum', 'avg', 'min', 'max', 'distinct', 'null', 'is', 'like', 'between', 'case', 'when', 'then', 'else', 'end', 'desc', 'asc'],
  javascript: ['const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'import', 'from', 'export', 'new', 'class', 'await', 'async', 'true', 'false', 'null', 'undefined', 'of', 'in', 'try', 'catch'],
};
KEYWORDS.js = KEYWORDS.javascript;
KEYWORDS.typescript = KEYWORDS.javascript;
KEYWORDS.ts = KEYWORDS.javascript;
KEYWORDS.py = KEYWORDS.python;

function highlight(code: string, language: string): ReactNode[] {
  const lang = language.toLowerCase();
  const keywords = new Set((KEYWORDS[lang] ?? []).map(k => (lang === 'sql' ? k.toUpperCase() : k)));
  const comment = lang === 'sql' ? /^--.*/ : lang === 'python' || lang === 'py' || lang === 'bash' || lang === 'r' ? /^#.*/ : /^\/\/.*/;
  const out: ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i < code.length) {
    const rest = code.slice(i);
    let m: RegExpExecArray | null;
    if ((m = comment.exec(rest))) {
      out.push(<span key={key++} className="text-slate-500 italic">{m[0]}</span>);
    } else if ((m = /^(["'`])(?:\\.|(?!\1).)*\1?/.exec(rest))) {
      out.push(<span key={key++} className="text-amber-300">{m[0]}</span>);
    } else if ((m = /^\d+(?:\.\d+)?/.exec(rest))) {
      out.push(<span key={key++} className="text-orange-300">{m[0]}</span>);
    } else if ((m = /^[A-Za-z_]\w*/.exec(rest))) {
      const word = m[0];
      const isKw = keywords.has(lang === 'sql' ? word.toUpperCase() : word);
      const isCall = !isKw && code[i + word.length] === '(';
      out.push(<span key={key++} className={isKw ? 'text-sky-300 font-semibold' : isCall ? 'text-emerald-300' : undefined}>{word}</span>);
    } else {
      m = /^[\s\S]/.exec(rest)!;
      out.push(m[0]);
    }
    i += m[0].length;
  }
  return out;
}

const fileName = (step: BoardStep) => step.title || ({ python: 'lesson.py', sql: 'query.sql', javascript: 'script.js' } as Record<string, string>)[step.language ?? ''] || 'notes.txt';

/**
 * The board next to a lecture video: code typed as the presenter speaks, then its
 * output, or key points appearing one by one. Everything is worked out from the
 * video's current time, so pausing and skipping always show the right state.
 */
export default function LectureBoard({ board, videoRef, heading }: Props) {
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let frame = 0;
    let last = 0;
    const read = () => { setTime(video.currentTime); if (video.duration && Number.isFinite(video.duration)) setDuration(video.duration); };
    // About 15 updates a second is smooth for typing and leaves the video alone
    const loop = (now: number) => { if (now - last >= 66) { last = now; read(); } frame = requestAnimationFrame(loop); };
    const play = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(loop); };
    const stop = () => { cancelAnimationFrame(frame); read(); };
    read();
    if (!video.paused) play();
    video.addEventListener('play', play);
    video.addEventListener('pause', stop);
    video.addEventListener('seeked', read);
    video.addEventListener('loadedmetadata', read);
    video.addEventListener('ended', stop);
    return () => {
      cancelAnimationFrame(frame);
      video.removeEventListener('play', play);
      video.removeEventListener('pause', stop);
      video.removeEventListener('seeked', read);
      video.removeEventListener('loadedmetadata', read);
      video.removeEventListener('ended', stop);
    };
  }, [videoRef]);

  // Each step's start time, from where its words fall in the script (speech is steady)
  const starts = useMemo(() => {
    const total = Math.max(1, board.total_words);
    // Show each step a moment before the words are spoken
    return board.steps.map(s => Math.max(0, (s.at / total) * duration - 0.4));
  }, [board, duration]);

  const index = duration ? starts.reduce((found, t, i) => (time >= t ? i : found), -1) : -1;
  const step = index >= 0 ? board.steps[index] : null;
  const start = index >= 0 ? starts[index] : 0;
  const end = index >= 0 ? (starts[index + 1] ?? duration) : 0;
  const gap = Math.max(1, end - start);
  const since = Math.max(0, time - start);

  // Code types out over at most 60% of the time before the next step
  const lastCode = useMemo(() => {
    for (let i = index; i >= 0; i--) if (board.steps[i].kind === 'code') return board.steps[i];
    return null;
  }, [board, index]);

  let body: ReactNode;
  if (!step) {
    body = (
      <div className="h-full flex flex-col items-center justify-center text-center px-6">
        <p className="text-xs uppercase tracking-widest text-sky-300/80">Live board</p>
        <p className="mt-2 text-lg font-semibold text-white">{heading || 'Follow along here'}</p>
        <p className="mt-1 text-xs text-slate-400">Code and key points appear as the lecture plays.</p>
      </div>
    );
  } else if (step.kind === 'code' && step.code) {
    const code = step.code;
    const typing = Math.min(gap * 0.6, Math.max(1.5, code.length * 0.045));
    const shown = since >= typing ? code.length : Math.floor((since / typing) * code.length);
    const typed = code.slice(0, shown);
    const done = shown >= code.length;
    const showOutput = done && step.output && since >= typing + 0.6;
    const lines = typed.split('\n');
    body = (
      <div className="h-full flex flex-col min-h-0">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10 bg-slate-950/60">
          <span className="flex gap-1.5" aria-hidden><span className="w-2.5 h-2.5 rounded-full bg-red-400/80" /><span className="w-2.5 h-2.5 rounded-full bg-amber-400/80" /><span className="w-2.5 h-2.5 rounded-full bg-emerald-400/80" /></span>
          <span className="text-xs text-slate-300 font-mono truncate">{fileName(step)}</span>
          <span className="ml-auto text-[10px] uppercase tracking-wide text-slate-500">{step.language}</span>
        </div>
        <pre className="flex-1 min-h-0 overflow-auto p-3 text-[13px] leading-relaxed font-mono text-slate-100">
          {lines.map((line, n) => (
            <div key={n} className="flex">
              <span className="select-none w-7 shrink-0 text-right pr-3 text-slate-600">{n + 1}</span>
              <span className="flex-1 whitespace-pre-wrap break-all min-w-0">
                {highlight(line, step.language ?? '')}
                {n === lines.length - 1 && <span className={`inline-block w-2 h-4 align-middle bg-sky-300 ${done ? 'animate-pulse' : ''}`} aria-hidden />}
              </span>
            </div>
          ))}
        </pre>
        {step.output && (
          <div className={`border-t border-white/10 bg-black/70 transition-opacity duration-300 ${showOutput ? 'opacity-100' : 'opacity-0'}`}>
            <p className="flex items-center gap-1.5 px-3 pt-2 text-[10px] uppercase tracking-wide text-slate-500"><Terminal className="w-3 h-3" /> Output</p>
            <pre className="px-3 pb-3 pt-1 text-[12px] leading-snug font-mono text-emerald-300 whitespace-pre-wrap max-h-32 overflow-auto">{step.output}</pre>
          </div>
        )}
      </div>
    );
  } else if (step.kind === 'points') {
    const points = step.points ?? [];
    const each = Math.min(2.5, (gap * 0.7) / Math.max(1, points.length));
    const visible = Math.min(points.length, Math.floor(since / each) + 1);
    body = (
      <div className="h-full flex flex-col justify-center px-6 py-5">
        <p className="flex items-center gap-2 text-sky-300 text-xs uppercase tracking-widest"><Lightbulb className="w-3.5 h-3.5" /> Key points</p>
        {step.title && <p className="mt-2 text-xl font-semibold text-white">{step.title}</p>}
        <ul className="mt-4 space-y-2.5">
          {points.map((p, n) => (
            <li key={n} className={`flex gap-2.5 text-slate-100 transition-all duration-500 ${n < visible ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-2'}`}>
              <span className="mt-2 w-1.5 h-1.5 rounded-full bg-sky-400 shrink-0" />{p}
            </li>
          ))}
        </ul>
        {lastCode && lastCode !== step && <p className="mt-6 text-[11px] text-slate-500 font-mono truncate">last code: {fileName(lastCode)}</p>}
      </div>
    );
  } else {
    body = (
      <div className="h-full flex flex-col items-center justify-center text-center px-6">
        <p className="text-xs uppercase tracking-widest text-sky-300/80">Next up</p>
        <p className="mt-2 text-2xl font-semibold text-white">{step.title}</p>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full min-w-0 min-h-[240px] rounded-2xl overflow-hidden bg-slate-900 shadow-lg ring-1 ring-black/10" aria-live="off">
      {body}
      {board.steps.length > 1 && (
        <div className="absolute bottom-0 inset-x-0 h-1 bg-white/5" aria-hidden>
          <div className="h-full bg-sky-500/70 transition-all" style={{ width: `${((index + 1) / board.steps.length) * 100}%` }} />
        </div>
      )}
    </div>
  );
}
