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
  /** The live board shown beside the video (code typed, output, key points) */
  board?: { total_words: number; steps: Array<{ kind: string; title?: string; code?: string; points?: string[] }> } | null;
}

export interface AvatarOption { id: string; name: string; gender: string | null; preview_image_url: string | null; default_voice_id: string | null }
export interface VoiceOption { id: string; name: string; gender: string | null; language: string | null; locale: string | null; preview_audio_url: string | null }

export const MAX_LECTURE_PART_CHARS = 4800;
// Spoken English runs at roughly 900 characters a minute.
export const lectureMinutes = (chars: number) => Math.max(1, Math.round(chars / 900));

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
