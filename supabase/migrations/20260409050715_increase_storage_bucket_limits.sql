/*
  # Increase storage bucket file size limits

  1. Changes
    - `course-videos` bucket: increase limit to 5GB (5368709120 bytes)
    - `course-documents` bucket: increase limit to 5GB (5368709120 bytes)

  Note: Supabase Storage supports resumable uploads (TUS protocol) for large files.
  The UI will use the resumable upload endpoint for files over 6MB.
*/

UPDATE storage.buckets
SET file_size_limit = 5368709120
WHERE id = 'course-videos';

UPDATE storage.buckets
SET file_size_limit = 5368709120
WHERE id = 'course-documents';
