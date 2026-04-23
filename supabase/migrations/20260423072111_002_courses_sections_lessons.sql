/*
  # Courses, Sections, and Lessons (no enrollment-dependent RLS yet)

  1. New Tables
    - courses — main course record with pricing, metadata, publish state
    - sections — ordered sections within a course
    - lessons — individual lessons within a section

  2. Notes
    - Lesson RLS policies referencing enrollments are added in migration 004
      after the enrollments tables are created
*/

-- ─── courses ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS courses (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id          uuid REFERENCES profiles(id) ON DELETE SET NULL,
  title               text NOT NULL DEFAULT '',
  short_description   text DEFAULT '',
  description         text DEFAULT '',
  thumbnail_url       text DEFAULT '',
  category            text DEFAULT '',
  level               text NOT NULL DEFAULT 'beginner' CHECK (level IN ('beginner','intermediate','advanced')),
  language            text DEFAULT 'English',
  duration_hours      numeric DEFAULT 0,
  total_lessons       integer DEFAULT 0,
  total_students      integer DEFAULT 0,
  rating              numeric DEFAULT 0,
  price               numeric DEFAULT 0,
  price_amount        numeric DEFAULT 0,
  is_free             boolean DEFAULT true,
  is_paid             boolean DEFAULT false,
  stripe_payment_link text DEFAULT '',
  is_published        boolean DEFAULT false,
  is_archived         boolean DEFAULT false,
  preview_enabled     boolean DEFAULT false,
  what_you_learn      text[] DEFAULT '{}',
  requirements        text[] DEFAULT '{}',
  tags                text[] DEFAULT '{}',
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'courses_updated_at') THEN
    CREATE TRIGGER courses_updated_at
      BEFORE UPDATE ON courses FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_courses_teacher_id    ON courses(teacher_id);
CREATE INDEX IF NOT EXISTS idx_courses_is_published  ON courses(is_published);
CREATE INDEX IF NOT EXISTS idx_courses_category      ON courses(category);
CREATE INDEX IF NOT EXISTS idx_courses_is_archived   ON courses(is_archived);

ALTER TABLE courses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view published courses"
  ON courses FOR SELECT
  USING (is_published = true AND is_archived = false);

CREATE POLICY "Teachers can view own courses"
  ON courses FOR SELECT TO authenticated
  USING (auth.uid() = teacher_id);

CREATE POLICY "Admins can view all courses"
  ON courses FOR SELECT TO authenticated
  USING (get_user_role() = 'admin');

CREATE POLICY "Teachers can insert own courses"
  ON courses FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = teacher_id AND get_user_role() IN ('teacher','admin'));

CREATE POLICY "Teachers can update own courses"
  ON courses FOR UPDATE TO authenticated
  USING (auth.uid() = teacher_id OR get_user_role() = 'admin')
  WITH CHECK (auth.uid() = teacher_id OR get_user_role() = 'admin');

CREATE POLICY "Admins can delete courses"
  ON courses FOR DELETE TO authenticated
  USING (get_user_role() = 'admin');

-- ─── sections ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sections (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id   uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title       text NOT NULL DEFAULT '',
  order_index integer DEFAULT 0,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'sections_updated_at') THEN
    CREATE TRIGGER sections_updated_at
      BEFORE UPDATE ON sections FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sections_course_id   ON sections(course_id);
CREATE INDEX IF NOT EXISTS idx_sections_order       ON sections(course_id, order_index);

ALTER TABLE sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students can view sections of published courses"
  ON sections FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM courses c WHERE c.id = sections.course_id AND c.is_published = true AND c.is_archived = false)
  );

CREATE POLICY "Teachers can manage own course sections"
  ON sections FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM courses c WHERE c.id = sections.course_id AND (c.teacher_id = auth.uid() OR get_user_role() = 'admin'))
  );

CREATE POLICY "Teachers can update own sections"
  ON sections FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM courses c WHERE c.id = sections.course_id AND (c.teacher_id = auth.uid() OR get_user_role() = 'admin'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM courses c WHERE c.id = sections.course_id AND (c.teacher_id = auth.uid() OR get_user_role() = 'admin'))
  );

CREATE POLICY "Teachers can delete own sections"
  ON sections FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM courses c WHERE c.id = sections.course_id AND (c.teacher_id = auth.uid() OR get_user_role() = 'admin'))
  );

-- ─── lessons ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lessons (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id            uuid NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  course_id             uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title                 text NOT NULL DEFAULT '',
  description           text DEFAULT '',
  type                  text DEFAULT 'video' CHECK (type IN ('video','text','file','quiz')),
  lesson_type           text DEFAULT 'video' CHECK (lesson_type IN ('video','text','file','quiz')),
  video_url             text DEFAULT '',
  video_storage_path    text DEFAULT '',
  duration_minutes      integer DEFAULT 0,
  order_index           integer DEFAULT 0,
  is_preview            boolean DEFAULT false,
  content               text DEFAULT '',
  file_url              text DEFAULT '',
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'lessons_updated_at') THEN
    CREATE TRIGGER lessons_updated_at
      BEFORE UPDATE ON lessons FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_lessons_section_id  ON lessons(section_id);
CREATE INDEX IF NOT EXISTS idx_lessons_course_id   ON lessons(course_id);
CREATE INDEX IF NOT EXISTS idx_lessons_order       ON lessons(course_id, order_index);

ALTER TABLE lessons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view preview lessons of published courses"
  ON lessons FOR SELECT
  USING (
    is_preview = true AND
    EXISTS (SELECT 1 FROM courses c WHERE c.id = lessons.course_id AND c.is_published = true AND c.is_archived = false)
  );

CREATE POLICY "Teachers can manage own course lessons insert"
  ON lessons FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM courses c WHERE c.id = lessons.course_id AND (c.teacher_id = auth.uid() OR get_user_role() = 'admin'))
  );

CREATE POLICY "Teachers can update own course lessons"
  ON lessons FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM courses c WHERE c.id = lessons.course_id AND (c.teacher_id = auth.uid() OR get_user_role() = 'admin'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM courses c WHERE c.id = lessons.course_id AND (c.teacher_id = auth.uid() OR get_user_role() = 'admin'))
  );

CREATE POLICY "Teachers can delete own course lessons"
  ON lessons FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM courses c WHERE c.id = lessons.course_id AND (c.teacher_id = auth.uid() OR get_user_role() = 'admin'))
  );
