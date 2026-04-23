/*
  # Storage Buckets

  Creates storage buckets for course media, videos, and thumbnails.
  Uses INSERT ... ON CONFLICT DO NOTHING to be idempotent.

  Buckets:
    - course-videos: private bucket for lesson video files
    - course-materials: private bucket for lesson file attachments
    - course-thumbnails: public bucket for course thumbnail images
    - avatars: public bucket for user profile photos
*/

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('course-videos', 'course-videos', false, 5368709120, ARRAY['video/mp4','video/webm','video/ogg','video/quicktime']),
  ('course-materials', 'course-materials', false, 104857600, ARRAY['application/pdf','application/zip','image/jpeg','image/png','image/gif','image/webp']),
  ('course-thumbnails', 'course-thumbnails', true, 10485760, ARRAY['image/jpeg','image/png','image/webp','image/gif']),
  ('avatars', 'avatars', true, 5242880, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO NOTHING;

-- Storage policies for course-thumbnails (public read)
CREATE POLICY "Public can view thumbnails"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'course-thumbnails');

CREATE POLICY "Teachers can upload thumbnails"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'course-thumbnails' AND
    get_user_role() IN ('teacher','admin')
  );

CREATE POLICY "Teachers can update thumbnails"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'course-thumbnails' AND
    get_user_role() IN ('teacher','admin')
  )
  WITH CHECK (
    bucket_id = 'course-thumbnails' AND
    get_user_role() IN ('teacher','admin')
  );

-- Storage policies for course-videos (authenticated enrolled users)
CREATE POLICY "Enrolled users can view course videos"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'course-videos');

CREATE POLICY "Teachers can upload course videos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'course-videos' AND
    get_user_role() IN ('teacher','admin')
  );

-- Storage policies for course-materials
CREATE POLICY "Enrolled users can view course materials"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'course-materials');

CREATE POLICY "Teachers can upload course materials"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'course-materials' AND
    get_user_role() IN ('teacher','admin')
  );

-- Storage policies for avatars
CREATE POLICY "Public can view avatars"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "Users can upload own avatar"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can update own avatar"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'avatars' AND
    (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'avatars' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );
