/*
  # Enrollments and Progress Tracking

  1. New Tables
    - enrollments — legacy enrollment table (student_id, course_id, progress_percent)
    - course_enrollments — new gated enrollment table with payment_status
    - lesson_progress — unified lesson completion tracking (supports legacy student_id and new user_id)
    - quiz_attempts — unified quiz attempt tracking (supports legacy student_id and new user_id)

  2. Functions
    - has_course_access(course_uuid, user_uuid) — SECURITY DEFINER, checks both enrollment tables
    - update_course_progress() — recalculates and updates enrollments.progress_percent after lesson progress insert/update

  3. Security
    - RLS on all tables
    - Users can only access their own records

  4. Notes
    - lesson_progress has UNIQUE indexes for both legacy (student_id) and new (user_id) access patterns
    - quiz_attempts has UNIQUE indexes for both patterns as well
*/

-- ─── enrollments (legacy) ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS enrollments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id       uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  course_id        uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  progress_percent integer DEFAULT 0 CHECK (progress_percent >= 0 AND progress_percent <= 100),
  enrolled_at      timestamptz DEFAULT now(),
  completed_at     timestamptz,
  UNIQUE (student_id, course_id)
);

CREATE INDEX IF NOT EXISTS idx_enrollments_student_id ON enrollments(student_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_course_id  ON enrollments(course_id);

ALTER TABLE enrollments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students can view own enrollments"
  ON enrollments FOR SELECT TO authenticated
  USING (auth.uid() = student_id);

CREATE POLICY "Teachers can view course enrollments"
  ON enrollments FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM courses c WHERE c.id = enrollments.course_id AND (c.teacher_id = auth.uid() OR get_user_role() = 'admin'))
  );

CREATE POLICY "Students can insert own enrollment"
  ON enrollments FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = student_id);

CREATE POLICY "System can update enrollment progress"
  ON enrollments FOR UPDATE TO authenticated
  USING (auth.uid() = student_id OR get_user_role() IN ('teacher','admin'))
  WITH CHECK (auth.uid() = student_id OR get_user_role() IN ('teacher','admin'));

CREATE POLICY "Admins can delete enrollments"
  ON enrollments FOR DELETE TO authenticated
  USING (get_user_role() = 'admin');

-- ─── course_enrollments (new gating) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS course_enrollments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  course_id      uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  payment_status text NOT NULL DEFAULT 'not_required' CHECK (payment_status IN ('not_required','pending','completed','failed','refunded')),
  payment_id     text DEFAULT '',
  progress_percent integer DEFAULT 0 CHECK (progress_percent >= 0 AND progress_percent <= 100),
  last_accessed_at timestamptz DEFAULT now(),
  enrolled_at    timestamptz DEFAULT now(),
  completed_at   timestamptz,
  UNIQUE (user_id, course_id)
);

CREATE INDEX IF NOT EXISTS idx_ce_user_id    ON course_enrollments(user_id);
CREATE INDEX IF NOT EXISTS idx_ce_course_id  ON course_enrollments(course_id);
CREATE INDEX IF NOT EXISTS idx_ce_payment    ON course_enrollments(payment_status);

ALTER TABLE course_enrollments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own course enrollments"
  ON course_enrollments FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Teachers can view their course enrollments"
  ON course_enrollments FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM courses c WHERE c.id = course_enrollments.course_id AND (c.teacher_id = auth.uid() OR get_user_role() = 'admin'))
  );

CREATE POLICY "Users can enroll in free courses"
  ON course_enrollments FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id AND (
      EXISTS (SELECT 1 FROM courses c WHERE c.id = course_enrollments.course_id AND (c.is_free = true OR c.is_paid = false))
      OR get_user_role() = 'admin'
    )
  );

CREATE POLICY "System can update enrollment progress"
  ON course_enrollments FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR get_user_role() IN ('teacher','admin'))
  WITH CHECK (auth.uid() = user_id OR get_user_role() IN ('teacher','admin'));

CREATE POLICY "Admins can delete course enrollments"
  ON course_enrollments FOR DELETE TO authenticated
  USING (get_user_role() = 'admin');

-- ─── has_course_access ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION has_course_access(
  p_course_id uuid,
  p_user_id   uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = p_user_id AND role IN ('admin','teacher')
  ) OR EXISTS (
    SELECT 1 FROM courses WHERE id = p_course_id AND teacher_id = p_user_id
  ) OR EXISTS (
    SELECT 1 FROM enrollments WHERE course_id = p_course_id AND student_id = p_user_id
  ) OR EXISTS (
    SELECT 1 FROM course_enrollments
    WHERE course_id = p_course_id AND user_id = p_user_id
      AND payment_status IN ('not_required','completed')
  );
$$;

-- ─── Add lesson SELECT policy for enrolled students ───────────────────────────
CREATE POLICY "Enrolled students can view course lessons"
  ON lessons FOR SELECT TO authenticated
  USING (
    has_course_access(lessons.course_id) OR
    EXISTS (SELECT 1 FROM courses c WHERE c.id = lessons.course_id AND (c.teacher_id = auth.uid() OR get_user_role() = 'admin'))
  );

-- ─── lesson_progress (unified legacy + new) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS lesson_progress (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- legacy column
  student_id            uuid REFERENCES profiles(id) ON DELETE CASCADE,
  -- new column
  user_id               uuid REFERENCES profiles(id) ON DELETE CASCADE,
  lesson_id             uuid NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  course_id             uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  is_completed          boolean DEFAULT false,
  watch_percentage      integer DEFAULT 0 CHECK (watch_percentage >= 0 AND watch_percentage <= 100),
  last_position_seconds integer DEFAULT 0,
  completed_at          timestamptz,
  updated_at            timestamptz DEFAULT now(),
  CONSTRAINT lp_student_or_user CHECK (student_id IS NOT NULL OR user_id IS NOT NULL)
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'lesson_progress_updated_at') THEN
    CREATE TRIGGER lesson_progress_updated_at
      BEFORE UPDATE ON lesson_progress FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_lp_student_lesson  ON lesson_progress(student_id, lesson_id) WHERE student_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_lp_user_lesson      ON lesson_progress(user_id, lesson_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lp_course_id               ON lesson_progress(course_id);

ALTER TABLE lesson_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own lesson progress"
  ON lesson_progress FOR SELECT TO authenticated
  USING (auth.uid() = student_id OR auth.uid() = user_id);

CREATE POLICY "Teachers can view student progress"
  ON lesson_progress FOR SELECT TO authenticated
  USING (get_user_role() IN ('teacher','admin'));

CREATE POLICY "Users can insert own lesson progress"
  ON lesson_progress FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = student_id OR auth.uid() = user_id);

CREATE POLICY "Users can update own lesson progress"
  ON lesson_progress FOR UPDATE TO authenticated
  USING (auth.uid() = student_id OR auth.uid() = user_id)
  WITH CHECK (auth.uid() = student_id OR auth.uid() = user_id);

-- ─── quiz_attempts (unified legacy + new) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS quiz_attempts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- legacy column
  student_id    uuid REFERENCES profiles(id) ON DELETE CASCADE,
  -- new column
  user_id       uuid REFERENCES profiles(id) ON DELETE CASCADE,
  quiz_id       uuid NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  course_id     uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  score         integer DEFAULT 0,
  total_points  integer DEFAULT 0,
  passed        boolean DEFAULT false,
  answers       jsonb DEFAULT '{}',
  time_taken    integer DEFAULT 0,
  attempt_number integer DEFAULT 1,
  created_at    timestamptz DEFAULT now(),
  CONSTRAINT qa_student_or_user CHECK (student_id IS NOT NULL OR user_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_qa_student_quiz  ON quiz_attempts(student_id, quiz_id) WHERE student_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_qa_user_quiz      ON quiz_attempts(user_id, quiz_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_qa_course_id      ON quiz_attempts(course_id);

ALTER TABLE quiz_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own quiz attempts"
  ON quiz_attempts FOR SELECT TO authenticated
  USING (auth.uid() = student_id OR auth.uid() = user_id);

CREATE POLICY "Teachers can view all quiz attempts"
  ON quiz_attempts FOR SELECT TO authenticated
  USING (get_user_role() IN ('teacher','admin'));

CREATE POLICY "Users can insert own quiz attempts"
  ON quiz_attempts FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = student_id OR auth.uid() = user_id);

-- ─── update_course_progress function + trigger ────────────────────────────────
CREATE OR REPLACE FUNCTION update_course_progress()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_course_id uuid;
  v_user_id   uuid;
  v_total     integer;
  v_completed integer;
  v_pct       integer;
BEGIN
  v_course_id := COALESCE(NEW.course_id, OLD.course_id);
  v_user_id   := COALESCE(NEW.user_id, NEW.student_id, OLD.user_id, OLD.student_id);

  SELECT COUNT(*) INTO v_total FROM lessons WHERE course_id = v_course_id;
  IF v_total = 0 THEN RETURN NEW; END IF;

  -- Count completed for this user (check both user_id and student_id columns)
  SELECT COUNT(*) INTO v_completed
  FROM lesson_progress
  WHERE course_id = v_course_id
    AND is_completed = true
    AND (user_id = v_user_id OR student_id = v_user_id);

  v_pct := ROUND((v_completed::numeric / v_total::numeric) * 100);

  -- Update new enrollments table
  UPDATE course_enrollments
  SET progress_percent = v_pct,
      last_accessed_at = now(),
      completed_at = CASE WHEN v_pct = 100 THEN COALESCE(completed_at, now()) ELSE NULL END
  WHERE course_id = v_course_id AND user_id = v_user_id;

  -- Update legacy enrollments table
  UPDATE enrollments
  SET progress_percent = v_pct,
      completed_at = CASE WHEN v_pct = 100 THEN COALESCE(completed_at, now()) ELSE NULL END
  WHERE course_id = v_course_id AND student_id = v_user_id;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'after_lesson_progress_change') THEN
    CREATE TRIGGER after_lesson_progress_change
      AFTER INSERT OR UPDATE ON lesson_progress
      FOR EACH ROW EXECUTE FUNCTION update_course_progress();
  END IF;
END $$;
