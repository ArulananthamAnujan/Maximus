import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const PRIVATE_BUCKETS = ['course-videos', 'course-documents', 'course-materials'];
const SIGNED_URL_TTL_SECONDS = 3 * 60 * 60;

/** Splits a stored Supabase storage link into bucket + object path, if it is one of ours. */
export function parseStorageUrl(url: string | null | undefined): { bucket: string; path: string } | null {
  if (!url) return null;
  const match = url.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/?#]+)\/([^?#]+)/);
  if (!match) return null;
  const bucket = match[1];
  if (!PRIVATE_BUCKETS.includes(bucket)) return null;
  try {
    return { bucket, path: decodeURIComponent(match[2]) };
  } catch {
    return { bucket, path: match[2] };
  }
}

const cache = new Map<string, { url: string; expires: number }>();

/**
 * Course videos and documents sit in private storage. Lessons store the plain file link;
 * this turns it into a short-lived signed link that only works for people allowed to
 * read the file. Links to anything else (YouTube, external PDFs) are returned unchanged.
 */
export async function resolveMediaUrl(url: string | null | undefined): Promise<string> {
  if (!url) return '';
  const target = parseStorageUrl(url);
  if (!target) return url;
  const key = `${target.bucket}/${target.path}`;
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.url;
  const { data, error } = await supabase.storage.from(target.bucket).createSignedUrl(target.path, SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) return '';
  // Refresh a little before the link really expires
  cache.set(key, { url: data.signedUrl, expires: Date.now() + (SIGNED_URL_TTL_SECONDS - 600) * 1000 });
  return data.signedUrl;
}

/** Forgets the signed link for a stored file, so the next request makes a fresh one. */
export function forgetMediaUrl(url: string | null | undefined) {
  const target = parseStorageUrl(url);
  if (target) cache.delete(`${target.bucket}/${target.path}`);
}

/**
 * Hook form of resolveMediaUrl. Returns '' while a private link is being prepared.
 * Changing `refreshKey` makes a fresh link (for a player whose link has expired).
 */
export function useMediaUrl(url: string | null | undefined, refreshKey = 0): string {
  const needsSigning = !!parseStorageUrl(url);
  const [resolved, setResolved] = useState<string>(needsSigning ? '' : (url ?? ''));

  useEffect(() => {
    let active = true;
    if (!parseStorageUrl(url)) { setResolved(url ?? ''); return; }
    if (refreshKey > 0) forgetMediaUrl(url);
    else setResolved('');
    resolveMediaUrl(url).then(u => { if (active) setResolved(u); });
    return () => { active = false; };
  }, [url, refreshKey]);

  return resolved;
}
