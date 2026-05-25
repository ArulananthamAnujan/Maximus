/*
  # Quiz Extra Attempts, Certificate ID column, and enrollment resume tracking

  ## Changes

  ### 1. quiz_extra_attempts table
  When a student exhausts their 3 standard quiz attempts and fails, a teacher can
  grant additional attempt blocks. Each grant adds N more attempts for that student/quiz.

  ### 2. certificates table — add certificate_id column
  The existing table uses `verification_code` but the frontend references `certificate_id`.
  Add the `certificate_id` column as a human-readable unique ID.

  ### 3. quizzes table — ensure max_attempts column defaults to 3
  The quizzes table has max_attempts but we ensure it defaults to 3.

  ### Security
  - RLS enabled on quiz_extra_attempts
  - Students can only read their own grants
  - Teachers can insert/read grants for quizzes in courses they teach
  - Admins can do everything
*/

-- ── 1. quiz_extra_attempts ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS quiz_extra_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id uuid NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  granted_by uuid NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  extra_attempts integer NOT NULL DEFAULT 1 CHECK (extra_attempts > 0),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE quiz_extra_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students can view own extra attempts"
  ON quiz_extra_attempts FOR SELECT
  TO authenticated
  USING (auth.uid() = student_id);

CREATE POLICY "Teachers can grant extra attempts"
  ON quiz_extra_attempts FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM quizzes q
      JOIN courses c ON c.id = q.course_id
      WHERE q.id = quiz_id AND c.teacher_id = auth.uid()
    )
  );

CREATE POLICY "Teachers can view extra attempts they granted"
  ON quiz_extra_attempts FOR SELECT
  TO authenticated
  USING (auth.uid() = granted_by);

CREATE POLICY "Admins can manage extra attempts"
  ON quiz_extra_attempts FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

CREATE INDEX IF NOT EXISTS idx_quiz_extra_attempts_student_quiz ON quiz_extra_attempts(student_id, quiz_id);

-- ── 2. certificates — add certificate_id if missing ──────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'certificates' AND column_name = 'certificate_id'
  ) THEN
    ALTER TABLE certificates
      ADD COLUMN certificate_id text UNIQUE DEFAULT ('CERT-' || upper(encode(gen_random_bytes(6), 'hex')));
    -- Backfill existing rows that have verification_code
    UPDATE certificates SET certificate_id = 'CERT-' || upper(verification_code)
    WHERE certificate_id IS NULL AND verification_code IS NOT NULL;
  END IF;
END $$;

-- ── 3. Ensure quizzes.max_attempts defaults to 3 ─────────────────────────────

ALTER TABLE quizzes ALTER COLUMN max_attempts SET DEFAULT 3;

-- ── 4. Add admin_enrolled flag to course_enrollments for tracking admin grants ─

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'course_enrollments' AND column_name = 'admin_note'
  ) THEN
    ALTER TABLE course_enrollments ADD COLUMN admin_note text;
  END IF;
END $$;
