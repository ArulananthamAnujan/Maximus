/*
  # Lesson Documents Table

  Stores AI-generated documents (lesson notes, presentation slides) tied to a lesson.

  1. New Tables
    - `lesson_documents`
      - `id` (uuid, primary key)
      - `lesson_id` (uuid, FK → lessons)
      - `course_id` (uuid, FK → courses)
      - `type` (text) — 'notes' | 'slides' | 'handout'
      - `title` (text)
      - `content_html` (text) — full HTML content rendered inline
      - `order_index` (integer)
      - `created_at`, `updated_at`

  2. Security
    - RLS enabled
    - Admins and course teachers can manage
    - Enrolled students can read
*/

CREATE TABLE IF NOT EXISTS lesson_documents (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id    uuid NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  course_id    uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  type         text NOT NULL DEFAULT 'notes'
    CHECK (type = ANY (ARRAY['notes','slides','handout'])),
  title        text NOT NULL DEFAULT '',
  content_html text NOT NULL DEFAULT '',
  order_index  integer NOT NULL DEFAULT 0,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);

ALTER TABLE lesson_documents ENABLE ROW LEVEL SECURITY;

-- Teachers/admins can select documents for their courses
CREATE POLICY "Teachers can view documents for own courses"
  ON lesson_documents FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM courses
      WHERE courses.id = lesson_documents.course_id
        AND (courses.teacher_id = auth.uid() OR (SELECT get_my_role()) = 'admin')
    )
  );

-- Teachers/admins can insert
CREATE POLICY "Teachers can insert documents for own courses"
  ON lesson_documents FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM courses
      WHERE courses.id = lesson_documents.course_id
        AND (courses.teacher_id = auth.uid() OR (SELECT get_my_role()) = 'admin')
    )
  );

-- Teachers/admins can update
CREATE POLICY "Teachers can update documents for own courses"
  ON lesson_documents FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM courses
      WHERE courses.id = lesson_documents.course_id
        AND (courses.teacher_id = auth.uid() OR (SELECT get_my_role()) = 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM courses
      WHERE courses.id = lesson_documents.course_id
        AND (courses.teacher_id = auth.uid() OR (SELECT get_my_role()) = 'admin')
    )
  );

-- Teachers/admins can delete
CREATE POLICY "Teachers can delete documents for own courses"
  ON lesson_documents FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM courses
      WHERE courses.id = lesson_documents.course_id
        AND (courses.teacher_id = auth.uid() OR (SELECT get_my_role()) = 'admin')
    )
  );

-- Enrolled students can read
CREATE POLICY "Students can read documents for enrolled courses"
  ON lesson_documents FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM course_enrollments
      WHERE course_enrollments.course_id = lesson_documents.course_id
        AND course_enrollments.user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_lesson_documents_lesson_id ON lesson_documents(lesson_id);
CREATE INDEX IF NOT EXISTS idx_lesson_documents_course_id ON lesson_documents(course_id);
