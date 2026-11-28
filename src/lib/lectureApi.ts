import { supabase } from './supabase';

export interface LecturePart {
  id: string;
  section_id: string;
  part_index: number;
  part_count: number;
  title: string;
  script: string;
  status: 'draft' | 'rendering' | 'saving' | 'ready' | 'failed';
  error_message: string | null;
  duration_seconds: number | null;
  lesson_id?: string | null;
  course_id?: string;
  /** Where the finished presenter video is kept in course storage */
  storage_path?: string | null;
  /** The live board shown beside the video (code typed, output, key points) */
  board?: { total_words: number; steps: Array<{ kind: string; title?: string; code?: string; points?: string[] }> } | null;
}

export interface AvatarOption { id: string; name: string; gender: string | null; preview_image_url: string | null; default_voice_id: string | null }
export interface VoiceOption { id: string; name: string; gender: string | null; language: string | null; locale: string | null; preview_audio_url: string | null }

export const MAX_LECTURE_PART_CHARS = 4800;
// Spoken a little slower than normal (about 800 characters a minute)
export const lectureMinutes = (chars: number) => Math.max(1, Math.round(chars / 800));

/** Calls the lecture-video edge function and turns failures into readable messages. */
export async function callLectureApi<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Please sign in again.');
  let res: Response;
  try {
    res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/lecture-video`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ action, ...payload }),
    });
  } catch {
    throw new Error('Could not reach the server. Please check your connection and try again.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
  return data as T;
}

// ─── Making the videos in the teacher's own HeyGen account ──────────────────

/** Lecture scripts as one text file, part by part, ready to paste into HeyGen. */
export function scriptsAsText(heading: string, weeks: Array<{ title: string; parts: LecturePart[] }>): string {
  const lines = [heading, '', 'Paste each part into its own HeyGen video, word for word, so the live board stays in time with the speech.', ''];
  for (const week of weeks) {
    const parts = [...week.parts].sort((a, b) => a.part_index - b.part_index);
    for (const p of parts) {
      lines.push('='.repeat(60));
      lines.push(parts.length > 1 ? `${week.title}: part ${p.part_index + 1} of ${parts.length}` : week.title);
      lines.push(`${p.script.length.toLocaleString()} characters, about ${lectureMinutes(p.script.length)} min`);
      lines.push('='.repeat(60), '', p.script.trim(), '');
    }
  }
  return lines.join('\n');
}

/** Saves text as a file on the teacher's computer. */
export function downloadText(fileName: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** A safe file name from a title. */
export const fileNameFrom = (title: string) => (title.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'lecture');

/** The length of a video file in seconds (0 when the browser cannot read it). */
export function videoLength(file: File): Promise<number> {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    const done = (seconds: number) => { URL.revokeObjectURL(url); resolve(seconds); };
    video.onloadedmetadata = () => done(Number.isFinite(video.duration) ? video.duration : 0);
    video.onerror = () => done(0);
    setTimeout(() => done(0), 15000);
    video.src = url;
  });
}
