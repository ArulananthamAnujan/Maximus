/*
  # Communications and Logs

  1. New Tables
    - announcements — site-wide or course-specific notices
    - activity_logs — audit trail for admin review
    - discussions — course discussion threads
    - live_sessions — scheduled live sessions per course
    - ai_usage_logs — tracks AI feature usage per user
    - flashcards — spaced-repetition study cards per lesson/course

  2. Security
    - RLS on all tables
    - Discussions visible to enrolled students
    - Activity logs visible to admins only
    - AI usage logs visible to owner + admins
*/

-- ─── announcements ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS announcements (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title      text NOT NULL DEFAULT '',
  content    text DEFAULT '',
  author_id  uuid REFERENCES profiles(id) ON DELETE SET NULL,
  course_id  uuid REFERENCES courses(id) ON DELETE CASCADE,
  is_active  boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'announcements_updated_at') THEN
    CREATE TRIGGER announcements_updated_at
      BEFORE UPDATE ON announcements FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_announcements_is_active ON announcements(is_active);
CREATE INDEX IF NOT EXISTS idx_announcements_course_id ON announcements(course_id);

ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active announcements"
  ON announcements FOR SELECT
  USING (is_active = true);

CREATE POLICY "Admins and teachers can manage announcements insert"
  ON announcements FOR INSERT TO authenticated
  WITH CHECK (get_user_role() IN ('admin','teacher'));

CREATE POLICY "Admins and teachers can update announcements"
  ON announcements FOR UPDATE TO authenticated
  USING (auth.uid() = author_id OR get_user_role() = 'admin')
  WITH CHECK (auth.uid() = author_id OR get_user_role() = 'admin');

CREATE POLICY "Admins can delete announcements"
  ON announcements FOR DELETE TO authenticated
  USING (get_user_role() = 'admin');

-- ─── activity_logs ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS activity_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES profiles(id) ON DELETE SET NULL,
  action      text NOT NULL DEFAULT '',
  entity_type text DEFAULT '',
  entity_id   uuid,
  details     jsonb DEFAULT '{}',
  ip_address  text DEFAULT '',
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id    ON activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at DESC);

ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all activity logs"
  ON activity_logs FOR SELECT TO authenticated
  USING (get_user_role() = 'admin');

CREATE POLICY "System can insert activity logs"
  ON activity_logs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id OR get_user_role() = 'admin');

-- ─── discussions ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS discussions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id   uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  lesson_id   uuid REFERENCES lessons(id) ON DELETE CASCADE,
  author_id   uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  parent_id   uuid REFERENCES discussions(id) ON DELETE CASCADE,
  title       text DEFAULT '',
  content     text NOT NULL DEFAULT '',
  upvotes     integer DEFAULT 0,
  is_pinned   boolean DEFAULT false,
  is_resolved boolean DEFAULT false,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'discussions_updated_at') THEN
    CREATE TRIGGER discussions_updated_at
      BEFORE UPDATE ON discussions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_discussions_course_id ON discussions(course_id);
CREATE INDEX IF NOT EXISTS idx_discussions_lesson_id ON discussions(lesson_id);
CREATE INDEX IF NOT EXISTS idx_discussions_author_id ON discussions(author_id);
CREATE INDEX IF NOT EXISTS idx_discussions_parent_id ON discussions(parent_id);

ALTER TABLE discussions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enrolled users can view discussions"
  ON discussions FOR SELECT TO authenticated
  USING (has_course_access(discussions.course_id));

CREATE POLICY "Enrolled users can post discussions"
  ON discussions FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = author_id AND has_course_access(discussions.course_id)
  );

CREATE POLICY "Authors can update own discussions"
  ON discussions FOR UPDATE TO authenticated
  USING (auth.uid() = author_id OR get_user_role() IN ('teacher','admin'))
  WITH CHECK (auth.uid() = author_id OR get_user_role() IN ('teacher','admin'));

CREATE POLICY "Authors and admins can delete discussions"
  ON discussions FOR DELETE TO authenticated
  USING (auth.uid() = author_id OR get_user_role() = 'admin');

-- ─── live_sessions ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS live_sessions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id      uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  teacher_id     uuid REFERENCES profiles(id) ON DELETE SET NULL,
  title          text NOT NULL DEFAULT '',
  description    text DEFAULT '',
  scheduled_at   timestamptz NOT NULL,
  duration_minutes integer DEFAULT 60,
  meeting_url    text DEFAULT '',
  meeting_id     text DEFAULT '',
  status         text DEFAULT 'scheduled' CHECK (status IN ('scheduled','live','completed','cancelled')),
  recording_url  text DEFAULT '',
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'live_sessions_updated_at') THEN
    CREATE TRIGGER live_sessions_updated_at
      BEFORE UPDATE ON live_sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_live_sessions_course_id    ON live_sessions(course_id);
CREATE INDEX IF NOT EXISTS idx_live_sessions_scheduled_at ON live_sessions(scheduled_at);

ALTER TABLE live_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enrolled students can view live sessions"
  ON live_sessions FOR SELECT TO authenticated
  USING (has_course_access(live_sessions.course_id));

CREATE POLICY "Teachers can manage own live sessions insert"
  ON live_sessions FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = teacher_id AND get_user_role() IN ('teacher','admin')
  );

CREATE POLICY "Teachers can update own live sessions"
  ON live_sessions FOR UPDATE TO authenticated
  USING (auth.uid() = teacher_id OR get_user_role() = 'admin')
  WITH CHECK (auth.uid() = teacher_id OR get_user_role() = 'admin');

CREATE POLICY "Teachers can delete own live sessions"
  ON live_sessions FOR DELETE TO authenticated
  USING (auth.uid() = teacher_id OR get_user_role() = 'admin');

-- ─── ai_usage_logs ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_usage_logs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  feature      text NOT NULL DEFAULT '',
  model        text DEFAULT '',
  tokens_used  integer DEFAULT 0,
  course_id    uuid REFERENCES courses(id) ON DELETE SET NULL,
  prompt_hash  text DEFAULT '',
  created_at   timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_logs_user_id    ON ai_usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_logs_created_at ON ai_usage_logs(created_at DESC);

ALTER TABLE ai_usage_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own AI usage"
  ON ai_usage_logs FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all AI usage"
  ON ai_usage_logs FOR SELECT TO authenticated
  USING (get_user_role() = 'admin');

CREATE POLICY "System can log AI usage"
  ON ai_usage_logs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- ─── flashcards ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS flashcards (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  course_id   uuid REFERENCES courses(id) ON DELETE CASCADE,
  lesson_id   uuid REFERENCES lessons(id) ON DELETE CASCADE,
  front       text NOT NULL DEFAULT '',
  back        text NOT NULL DEFAULT '',
  difficulty  text DEFAULT 'medium' CHECK (difficulty IN ('easy','medium','hard')),
  next_review timestamptz DEFAULT now(),
  review_count integer DEFAULT 0,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'flashcards_updated_at') THEN
    CREATE TRIGGER flashcards_updated_at
      BEFORE UPDATE ON flashcards FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_flashcards_user_id   ON flashcards(user_id);
CREATE INDEX IF NOT EXISTS idx_flashcards_course_id ON flashcards(course_id);
CREATE INDEX IF NOT EXISTS idx_flashcards_next_rev  ON flashcards(user_id, next_review);

ALTER TABLE flashcards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own flashcards"
  ON flashcards FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own flashcards"
  ON flashcards FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own flashcards"
  ON flashcards FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own flashcards"
  ON flashcards FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
