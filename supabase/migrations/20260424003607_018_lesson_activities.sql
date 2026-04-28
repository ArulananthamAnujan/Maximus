/*
  # Lesson Activities Table

  1. New Tables
    - `lesson_activities`
      - `id` (uuid, primary key)
      - `lesson_id` (uuid, FK → lessons)
      - `course_id` (uuid, FK → courses)
      - `title` (text) — activity name
      - `type` (text) — 'practice' | 'reflection' | 'discussion' | 'project' | 'research'
      - `instructions` (text) — full activity instructions
      - `estimated_minutes` (integer) — time estimate
      - `order_index` (integer)
      - `created_at`, `updated_at` (timestamptz)

  2. Security
    - RLS enabled
    - Teachers/admins can manage activities for their courses
    - Students can read activities for enrolled courses
*/

CREATE TABLE IF NOT EXISTS lesson_activities (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id          uuid NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  course_id          uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title              text NOT NULL DEFAULT '',
  type               text NOT NULL DEFAULT 'practice'
    CHECK (type = ANY (ARRAY['practice','reflection','discussion','project','research'])),
  instructions       text NOT NULL DEFAULT '',
  estimated_minutes  integer NOT NULL DEFAULT 15,
  order_index        integer NOT NULL DEFAULT 0,
  created_at         timestamptz DEFAULT now(),
  updated_at         timestamptz DEFAULT now()
);

ALTER TABLE lesson_activities ENABLE ROW LEVEL SECURITY;

-- Teachers/admins can insert activities for courses they own
CREATE POLICY "Teachers can insert activities for own courses"
  ON lesson_activities FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM courses
      WHERE courses.id = lesson_activities.course_id
        AND (courses.teacher_id = auth.uid() OR (SELECT get_my_role()) = 'admin')
    )
  );

-- Teachers/admins can update activities for their courses
CREATE POLICY "Teachers can update activities for own courses"
  ON lesson_activities FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM courses
      WHERE courses.id = lesson_activities.course_id
        AND (courses.teacher_id = auth.uid() OR (SELECT get_my_role()) = 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM courses
      WHERE courses.id = lesson_activities.course_id
        AND (courses.teacher_id = auth.uid() OR (SELECT get_my_role()) = 'admin')
    )
  );

-- Teachers/admins can delete activities for their courses
CREATE POLICY "Teachers can delete activities for own courses"
  ON lesson_activities FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM courses
      WHERE courses.id = lesson_activities.course_id
        AND (courses.teacher_id = auth.uid() OR (SELECT get_my_role()) = 'admin')
    )
  );

-- Students can read activities for enrolled courses
CREATE POLICY "Students can read activities for enrolled courses"
  ON lesson_activities FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM course_enrollments
      WHERE course_enrollments.course_id = lesson_activities.course_id
        AND course_enrollments.user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM courses
      WHERE courses.id = lesson_activities.course_id
        AND (courses.teacher_id = auth.uid() OR (SELECT get_my_role()) = 'admin')
    )
  );

CREATE INDEX IF NOT EXISTS idx_lesson_activities_lesson_id ON lesson_activities(lesson_id);
CREATE INDEX IF NOT EXISTS idx_lesson_activities_course_id ON lesson_activities(course_id);
