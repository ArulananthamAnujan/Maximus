/*
  # Fix quiz schema alignment and progress tracking

  ## Changes

  1. lesson_progress table
     - Add `status`, `progress_percent`, `time_spent_seconds`, `created_at` columns
     - Backfill status from is_completed
     - Add unique constraint on (lesson_id, student_id) for upsert support

  2. quiz_attempts table
     - Add `submitted_at` column (mirrors created_at)
     - Add `percentage` column (score as percent)

  3. quizzes table
     - Add `is_required`, `section_id`, `pass_mark`, `max_attempts` columns

  4. certificates
     - Allow students to self-insert their own certificates

  5. quiz_extra_attempts
     - Fix INSERT policy to include WITH CHECK clause

  6. lesson_progress RLS policies
     - Enable RLS + add SELECT/INSERT/UPDATE policies for students
*/

-- ── 1. lesson_progress enhancements ──────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lesson_progress' AND column_name = 'status'
  ) THEN
    ALTER TABLE lesson_progress ADD COLUMN status text NOT NULL DEFAULT 'not_started';
    UPDATE lesson_progress SET status = CASE WHEN is_completed THEN 'completed' ELSE 'in_progress' END;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lesson_progress' AND column_name = 'progress_percent'
  ) THEN
    ALTER TABLE lesson_progress ADD COLUMN progress_percent integer NOT NULL DEFAULT 0;
    UPDATE lesson_progress SET progress_percent = CASE WHEN is_completed THEN 100 ELSE COALESCE(watch_percentage, 0) END;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lesson_progress' AND column_name = 'time_spent_seconds'
  ) THEN
    ALTER TABLE lesson_progress ADD COLUMN time_spent_seconds integer NOT NULL DEFAULT 0;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lesson_progress' AND column_name = 'created_at'
  ) THEN
    ALTER TABLE lesson_progress ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
  END IF;
END $$;

-- Add updated_at if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lesson_progress' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE lesson_progress ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
  END IF;
END $$;

-- Unique constraint for upsert (student_id + lesson_id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'lesson_progress_student_lesson_unique'
  ) THEN
    ALTER TABLE lesson_progress ADD CONSTRAINT lesson_progress_student_lesson_unique
      UNIQUE (student_id, lesson_id);
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Enable RLS
ALTER TABLE lesson_progress ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'lesson_progress' AND policyname = 'Students can view own progress v2') THEN
    CREATE POLICY "Students can view own progress v2"
      ON lesson_progress FOR SELECT TO authenticated
      USING (auth.uid() = student_id OR auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'lesson_progress' AND policyname = 'Students can insert own progress v2') THEN
    CREATE POLICY "Students can insert own progress v2"
      ON lesson_progress FOR INSERT TO authenticated
      WITH CHECK (auth.uid() = student_id OR auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'lesson_progress' AND policyname = 'Students can update own progress v2') THEN
    CREATE POLICY "Students can update own progress v2"
      ON lesson_progress FOR UPDATE TO authenticated
      USING (auth.uid() = student_id OR auth.uid() = user_id)
      WITH CHECK (auth.uid() = student_id OR auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'lesson_progress' AND policyname = 'Teachers and admins can view all progress v2') THEN
    CREATE POLICY "Teachers and admins can view all progress v2"
      ON lesson_progress FOR SELECT TO authenticated
      USING (
        EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('teacher', 'admin', 'co_admin'))
      );
  END IF;
END $$;

-- ── 2. quiz_attempts enhancements ────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quiz_attempts' AND column_name = 'submitted_at'
  ) THEN
    ALTER TABLE quiz_attempts ADD COLUMN submitted_at timestamptz DEFAULT now();
    UPDATE quiz_attempts SET submitted_at = created_at WHERE submitted_at IS NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quiz_attempts' AND column_name = 'percentage'
  ) THEN
    ALTER TABLE quiz_attempts ADD COLUMN percentage integer DEFAULT 0;
    UPDATE quiz_attempts
    SET percentage = ROUND((score::numeric * 100) / NULLIF(total_points, 0))
    WHERE total_points > 0;
  END IF;
END $$;

-- ── 3. quizzes enhancements ───────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quizzes' AND column_name = 'is_required'
  ) THEN
    ALTER TABLE quizzes ADD COLUMN is_required boolean NOT NULL DEFAULT true;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quizzes' AND column_name = 'section_id'
  ) THEN
    ALTER TABLE quizzes ADD COLUMN section_id uuid REFERENCES sections(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quizzes' AND column_name = 'pass_mark'
  ) THEN
    ALTER TABLE quizzes ADD COLUMN pass_mark integer DEFAULT 60;
    UPDATE quizzes SET pass_mark = COALESCE(pass_percentage, 60);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quizzes' AND column_name = 'max_attempts'
  ) THEN
    ALTER TABLE quizzes ADD COLUMN max_attempts integer NOT NULL DEFAULT 3;
  END IF;
END $$;

-- ── 4. certificates: allow students to self-insert ───────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'certificates' AND policyname = 'Students can insert own certificates'
  ) THEN
    CREATE POLICY "Students can insert own certificates"
      ON certificates FOR INSERT TO authenticated
      WITH CHECK (auth.uid() = student_id);
  END IF;
END $$;

-- ── 5. quiz_extra_attempts: fix INSERT policy ─────────────────────────────────

DROP POLICY IF EXISTS "Teachers can grant extra attempts" ON quiz_extra_attempts;

CREATE POLICY "Teachers can grant extra attempts"
  ON quiz_extra_attempts FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('teacher', 'admin', 'co_admin'))
  );
