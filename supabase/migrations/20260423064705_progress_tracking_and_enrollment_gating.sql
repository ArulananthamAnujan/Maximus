/*
  # Progress Tracking and Enrollment Gating

  Adds Udemy-style enrollment gating, granular lesson progress tracking,
  and quiz attempt recording.

  ## Changes

  ### Modified Tables
  - `courses` — adds is_paid, price_amount, preview_enabled columns
  - `lessons` — is_preview column already exists; ensuring it is present

  ### New Tables
  1. `course_enrollments`
     - Tracks student enrollments with type (free/paid/admin_granted)
     - Payment status for gating access
     - Progress tracking per enrollment

  2. `lesson_progress` (new enhanced version)
     - Per-lesson progress with position, time spent, completion
     - UNIQUE constraint on (user_id, lesson_id)

  3. `quiz_attempts` (new version with user_id FK)
     - Records each quiz attempt with score, percentage, pass/fail

  ### Security
  - has_course_access() function for RLS policy reuse
  - RLS on all new tables
  - Students can only access their own data
  - Teachers can read data for their courses
  - Admins have full access

  ### Notes
  - existing `enrollments` table is preserved unchanged
  - existing `lesson_progress` table is preserved; new table is `lesson_progress_v2`
    ACTUALLY: we will rename approach — create `course_enrollments` as new,
    and create `lesson_progress_v2` as the enhanced table since lesson_progress exists
  - existing `quiz_attempts` table stays; we add `user_quiz_attempts` as new table
*/

-- ============================================================
-- 1. Add pricing columns to courses (safe, IF NOT EXISTS)
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='courses' AND column_name='is_paid') THEN
    ALTER TABLE courses ADD COLUMN is_paid boolean NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='courses' AND column_name='price_amount') THEN
    ALTER TABLE courses ADD COLUMN price_amount numeric(10,2) NOT NULL DEFAULT 0 CHECK (price_amount >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='courses' AND column_name='preview_enabled') THEN
    ALTER TABLE courses ADD COLUMN preview_enabled boolean NOT NULL DEFAULT true;
  END IF;
END $$;

-- ============================================================
-- 2. Ensure lessons.is_preview exists (already in schema but safety check)
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='lessons' AND column_name='is_preview') THEN
    ALTER TABLE lessons ADD COLUMN is_preview boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- ============================================================
-- 3. Create course_enrollments table
-- ============================================================
CREATE TABLE IF NOT EXISTS course_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  enrollment_type text NOT NULL CHECK (enrollment_type IN ('free', 'paid', 'admin_granted')),
  payment_status text NOT NULL DEFAULT 'not_required' CHECK (payment_status IN ('not_required', 'pending', 'completed', 'refunded')),
  payment_id text,
  amount_paid numeric(10,2) NOT NULL DEFAULT 0,
  currency text,
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  progress_percent int NOT NULL DEFAULT 0 CHECK (progress_percent >= 0 AND progress_percent <= 100),
  last_accessed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, course_id)
);

CREATE INDEX IF NOT EXISTS idx_course_enrollments_user_id ON course_enrollments(user_id);
CREATE INDEX IF NOT EXISTS idx_course_enrollments_course_id ON course_enrollments(course_id);
CREATE INDEX IF NOT EXISTS idx_course_enrollments_payment_status ON course_enrollments(payment_status);
CREATE INDEX IF NOT EXISTS idx_course_enrollments_last_accessed ON course_enrollments(last_accessed_at DESC);

ALTER TABLE course_enrollments ENABLE ROW LEVEL SECURITY;

-- Students: SELECT own rows
CREATE POLICY "Students can view own enrollments"
  ON course_enrollments FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Students: INSERT only free enrollments (type='free', status='not_required')
CREATE POLICY "Students can self-enroll in free courses"
  ON course_enrollments FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND enrollment_type = 'free'
    AND payment_status = 'not_required'
  );

-- Students: UPDATE own enrollment (progress, last_accessed)
CREATE POLICY "Students can update own enrollment progress"
  ON course_enrollments FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Teachers: SELECT enrollments for their courses
CREATE POLICY "Teachers can view enrollments for their courses"
  ON course_enrollments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM courses
      WHERE courses.id = course_enrollments.course_id
        AND courses.teacher_id = auth.uid()
    )
  );

-- Admins: full access (insert with any enrollment_type)
CREATE POLICY "Admins have full access to enrollments"
  ON course_enrollments FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can insert any enrollment"
  ON course_enrollments FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can update any enrollment"
  ON course_enrollments FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can delete any enrollment"
  ON course_enrollments FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ============================================================
-- 4. Create has_course_access function
-- ============================================================
CREATE OR REPLACE FUNCTION has_course_access(p_user_id uuid, p_course_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_role text;
  v_teacher_id uuid;
  v_has_enrollment boolean;
BEGIN
  -- Check user role
  SELECT role INTO v_role FROM profiles WHERE id = p_user_id;

  -- Admins always have access
  IF v_role = 'admin' THEN RETURN true; END IF;

  -- Teachers who own the course have access
  SELECT teacher_id INTO v_teacher_id FROM courses WHERE id = p_course_id;
  IF v_teacher_id = p_user_id THEN RETURN true; END IF;

  -- Check active enrollment in course_enrollments
  SELECT EXISTS(
    SELECT 1 FROM course_enrollments
    WHERE user_id = p_user_id
      AND course_id = p_course_id
      AND payment_status IN ('completed', 'not_required')
  ) INTO v_has_enrollment;
  IF v_has_enrollment THEN RETURN true; END IF;

  -- Also check legacy enrollments table
  SELECT EXISTS(
    SELECT 1 FROM enrollments
    WHERE student_id = p_user_id
      AND course_id = p_course_id
  ) INTO v_has_enrollment;

  RETURN v_has_enrollment;
END;
$$;

-- ============================================================
-- 5. Create lesson_progress_v2 (enhanced tracking)
-- ============================================================
CREATE TABLE IF NOT EXISTS lesson_progress_v2 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lesson_id uuid NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'completed')),
  progress_percent int NOT NULL DEFAULT 0 CHECK (progress_percent >= 0 AND progress_percent <= 100),
  last_position_seconds int NOT NULL DEFAULT 0,
  time_spent_seconds int NOT NULL DEFAULT 0,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, lesson_id)
);

CREATE INDEX IF NOT EXISTS idx_lp_v2_user_course ON lesson_progress_v2(user_id, course_id);
CREATE INDEX IF NOT EXISTS idx_lp_v2_user_lesson ON lesson_progress_v2(user_id, lesson_id);
CREATE INDEX IF NOT EXISTS idx_lp_v2_course_id ON lesson_progress_v2(course_id);

-- Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION update_lesson_progress_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS lesson_progress_v2_updated_at ON lesson_progress_v2;
CREATE TRIGGER lesson_progress_v2_updated_at
  BEFORE UPDATE ON lesson_progress_v2
  FOR EACH ROW EXECUTE FUNCTION update_lesson_progress_updated_at();

ALTER TABLE lesson_progress_v2 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students can view own lesson progress"
  ON lesson_progress_v2 FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Students can insert own lesson progress if enrolled"
  ON lesson_progress_v2 FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND has_course_access(auth.uid(), course_id)
  );

CREATE POLICY "Students can update own lesson progress"
  ON lesson_progress_v2 FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Teachers can view lesson progress for their courses"
  ON lesson_progress_v2 FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM courses
      WHERE courses.id = lesson_progress_v2.course_id
        AND courses.teacher_id = auth.uid()
    )
  );

CREATE POLICY "Admins have full access to lesson progress"
  ON lesson_progress_v2 FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can insert lesson progress"
  ON lesson_progress_v2 FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can update lesson progress"
  ON lesson_progress_v2 FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ============================================================
-- 6. Create user_quiz_attempts (new, with user_id + attempt_number)
-- ============================================================
CREATE TABLE IF NOT EXISTS user_quiz_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  quiz_id uuid NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  score numeric NOT NULL,
  max_score numeric NOT NULL,
  percentage numeric GENERATED ALWAYS AS (
    CASE WHEN max_score > 0 THEN ROUND((score / max_score) * 100, 2) ELSE 0 END
  ) STORED,
  passed boolean NOT NULL,
  answers jsonb NOT NULL DEFAULT '{}',
  attempt_number int NOT NULL DEFAULT 1,
  started_at timestamptz,
  completed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_uqa_user_quiz ON user_quiz_attempts(user_id, quiz_id);
CREATE INDEX IF NOT EXISTS idx_uqa_user_course ON user_quiz_attempts(user_id, course_id);
CREATE INDEX IF NOT EXISTS idx_uqa_quiz_id ON user_quiz_attempts(quiz_id);

ALTER TABLE user_quiz_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students can view own quiz attempts"
  ON user_quiz_attempts FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Students can insert own quiz attempts if enrolled"
  ON user_quiz_attempts FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND has_course_access(auth.uid(), course_id)
  );

CREATE POLICY "Teachers can view quiz attempts for their courses"
  ON user_quiz_attempts FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM courses
      WHERE courses.id = user_quiz_attempts.course_id
        AND courses.teacher_id = auth.uid()
    )
  );

CREATE POLICY "Admins have full access to quiz attempts"
  ON user_quiz_attempts FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can insert quiz attempts"
  ON user_quiz_attempts FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
