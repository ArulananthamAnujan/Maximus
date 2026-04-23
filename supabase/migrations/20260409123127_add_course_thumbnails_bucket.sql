/*
  # Add course-thumbnails storage bucket

  Creates a public storage bucket for course thumbnail images with appropriate
  file size limits and allowed MIME types.
*/

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'course-thumbnails',
  'course-thumbnails',
  true,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload thumbnails"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'course-thumbnails');

CREATE POLICY "Anyone can view thumbnails"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'course-thumbnails');

CREATE POLICY "Authenticated users can update thumbnails"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'course-thumbnails');

CREATE POLICY "Authenticated users can delete thumbnails"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'course-thumbnails');
