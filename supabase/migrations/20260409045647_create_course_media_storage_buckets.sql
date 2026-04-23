
/*
  # Create storage buckets for course media

  1. New Buckets
    - `course-videos` — stores uploaded lecture video files (mp4, webm, mov, avi)
    - `course-documents` — stores uploaded PDF and document files (pdf, doc, docx, ppt, pptx)

  2. Security
    - Admins and teachers can upload to both buckets
    - Any authenticated user can read (to view lessons they are enrolled in)
    - Files are scoped under course_id/section_id/filename paths
*/

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'course-videos',
  'course-videos',
  true,
  524288000,
  ARRAY[
    'video/mp4',
    'video/webm',
    'video/quicktime',
    'video/x-msvideo',
    'video/mpeg',
    'video/ogg'
  ]
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'course-documents',
  'course-documents',
  true,
  104857600,
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Admins and teachers can upload videos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'course-videos' AND (
      EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'teacher'))
    )
  );

CREATE POLICY "Anyone authenticated can read videos"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'course-videos');

CREATE POLICY "Admins and teachers can delete videos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'course-videos' AND (
      EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'teacher'))
    )
  );

CREATE POLICY "Admins and teachers can upload documents"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'course-documents' AND (
      EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'teacher'))
    )
  );

CREATE POLICY "Anyone authenticated can read documents"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'course-documents');

CREATE POLICY "Admins and teachers can delete documents"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'course-documents' AND (
      EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'teacher'))
    )
  );
