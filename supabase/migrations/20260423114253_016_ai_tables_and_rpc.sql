/*
  # AI Usage Logs Schema Update, Flashcards Table, and create_ai_course RPC

  ## Changes
  1. Adds missing columns to existing ai_usage_logs table
  2. Creates flashcards table with RLS
  3. Adds ai_summary columns to lessons
  4. Creates create_ai_course() RPC function (SECURITY DEFINER)
*/

-- Add missing columns to ai_usage_logs if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_usage_logs' AND column_name = 'ai_task'
  ) THEN
    ALTER TABLE ai_usage_logs ADD COLUMN ai_task text NOT NULL DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_usage_logs' AND column_name = 'input_tokens'
  ) THEN
    ALTER TABLE ai_usage_logs ADD COLUMN input_tokens int NOT NULL DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_usage_logs' AND column_name = 'output_tokens'
  ) THEN
    ALTER TABLE ai_usage_logs ADD COLUMN output_tokens int NOT NULL DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_usage_logs' AND column_name = 'cost_estimate_usd'
  ) THEN
    ALTER TABLE ai_usage_logs ADD COLUMN cost_estimate_usd numeric(10, 6) NOT NULL DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_usage_logs' AND column_name = 'success'
  ) THEN
    ALTER TABLE ai_usage_logs ADD COLUMN success boolean NOT NULL DEFAULT true;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_usage_logs' AND column_name = 'error_message'
  ) THEN
    ALTER TABLE ai_usage_logs ADD COLUMN error_message text;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_user_id ON ai_usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_created_at ON ai_usage_logs(created_at);

ALTER TABLE ai_usage_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'ai_usage_logs' AND policyname = 'Users can read own ai usage logs'
  ) THEN
    CREATE POLICY "Users can read own ai usage logs"
      ON ai_usage_logs FOR SELECT
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'ai_usage_logs' AND policyname = 'Admins can read all ai usage logs'
  ) THEN
    CREATE POLICY "Admins can read all ai usage logs"
      ON ai_usage_logs FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
        )
      );
  END IF;
END $$;

-- flashcards table
CREATE TABLE IF NOT EXISTS flashcards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  front text NOT NULL,
  back text NOT NULL,
  order_index int NOT NULL DEFAULT 0,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_flashcards_lesson_id ON flashcards(lesson_id);
CREATE INDEX IF NOT EXISTS idx_flashcards_course_id ON flashcards(course_id);

ALTER TABLE flashcards ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'flashcards' AND policyname = 'Teachers and admins can insert flashcards') THEN
    CREATE POLICY "Teachers and admins can insert flashcards"
      ON flashcards FOR INSERT
      TO authenticated
      WITH CHECK (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('teacher', 'admin'))
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'flashcards' AND policyname = 'Teachers and admins can update flashcards') THEN
    CREATE POLICY "Teachers and admins can update flashcards"
      ON flashcards FOR UPDATE
      TO authenticated
      USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('teacher', 'admin')))
      WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('teacher', 'admin')));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'flashcards' AND policyname = 'Teachers and admins can delete flashcards') THEN
    CREATE POLICY "Teachers and admins can delete flashcards"
      ON flashcards FOR DELETE
      TO authenticated
      USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('teacher', 'admin')));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'flashcards' AND policyname = 'Students can read flashcards for enrolled courses') THEN
    CREATE POLICY "Students can read flashcards for enrolled courses"
      ON flashcards FOR SELECT
      TO authenticated
      USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('teacher', 'admin'))
        OR
        EXISTS (
          SELECT 1 FROM course_enrollments
          WHERE user_id = auth.uid()
            AND course_id = flashcards.course_id
            AND payment_status IN ('not_required', 'completed')
        )
      );
  END IF;
END $$;

-- Add ai_summary columns to lessons
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lessons' AND column_name = 'ai_summary'
  ) THEN
    ALTER TABLE lessons ADD COLUMN ai_summary text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lessons' AND column_name = 'ai_summary_generated_at'
  ) THEN
    ALTER TABLE lessons ADD COLUMN ai_summary_generated_at timestamptz;
  END IF;
END $$;

-- RPC: create_ai_course
CREATE OR REPLACE FUNCTION create_ai_course(payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role text;
  new_course_id uuid;
  module jsonb;
  lesson jsonb;
  new_section_id uuid;
  module_idx int := 0;
  lesson_idx int;
BEGIN
  SELECT role INTO caller_role FROM profiles WHERE id = auth.uid();
  IF caller_role NOT IN ('teacher', 'admin') THEN
    RAISE EXCEPTION 'Forbidden: only teachers and admins can create courses';
  END IF;

  INSERT INTO courses (
    title, description, short_description, level, category,
    is_free, is_published, teacher_id
  ) VALUES (
    payload->>'title',
    payload->>'description',
    left(payload->>'description', 120),
    COALESCE(payload->>'level', 'beginner'),
    COALESCE(payload->>'category', 'General'),
    true,
    false,
    auth.uid()
  )
  RETURNING id INTO new_course_id;

  FOR module IN SELECT * FROM jsonb_array_elements(payload->'modules')
  LOOP
    INSERT INTO sections (course_id, title, order_index)
    VALUES (new_course_id, module->>'title', module_idx)
    RETURNING id INTO new_section_id;

    lesson_idx := 0;
    FOR lesson IN SELECT * FROM jsonb_array_elements(module->'lessons')
    LOOP
      INSERT INTO lessons (
        section_id, course_id, title, type, content, duration_minutes, order_index, is_preview
      ) VALUES (
        new_section_id,
        new_course_id,
        lesson->>'title',
        'article',
        COALESCE(lesson->>'description', ''),
        COALESCE((lesson->>'estimated_duration_minutes')::int, 10),
        lesson_idx,
        false
      );
      lesson_idx := lesson_idx + 1;
    END LOOP;

    module_idx := module_idx + 1;
  END LOOP;

  RETURN new_course_id;
END;
$$;
