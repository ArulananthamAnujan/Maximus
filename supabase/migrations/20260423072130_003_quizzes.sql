/*
  # Quizzes and Quiz Questions

  1. New Tables
    - quizzes — quiz metadata linked to a course
    - quiz_questions — individual questions with options and correct answer

  2. Security
    - RLS on both tables
    - Published quiz questions visible to enrolled students (enrollment check added in 004)
    - Teachers can manage their own quizzes
*/

-- ─── quizzes ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quizzes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id       uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  lesson_id       uuid REFERENCES lessons(id) ON DELETE SET NULL,
  title           text NOT NULL DEFAULT '',
  description     text DEFAULT '',
  time_limit      integer DEFAULT 0,
  pass_percentage integer DEFAULT 70,
  max_attempts    integer DEFAULT 3,
  is_published    boolean DEFAULT false,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'quizzes_updated_at') THEN
    CREATE TRIGGER quizzes_updated_at
      BEFORE UPDATE ON quizzes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_quizzes_course_id ON quizzes(course_id);
CREATE INDEX IF NOT EXISTS idx_quizzes_lesson_id ON quizzes(lesson_id);

ALTER TABLE quizzes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students can view published quizzes"
  ON quizzes FOR SELECT TO authenticated
  USING (is_published = true);

CREATE POLICY "Teachers can manage own quizzes insert"
  ON quizzes FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM courses c WHERE c.id = quizzes.course_id AND (c.teacher_id = auth.uid() OR get_user_role() = 'admin'))
  );

CREATE POLICY "Teachers can update own quizzes"
  ON quizzes FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM courses c WHERE c.id = quizzes.course_id AND (c.teacher_id = auth.uid() OR get_user_role() = 'admin'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM courses c WHERE c.id = quizzes.course_id AND (c.teacher_id = auth.uid() OR get_user_role() = 'admin'))
  );

CREATE POLICY "Teachers can delete own quizzes"
  ON quizzes FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM courses c WHERE c.id = quizzes.course_id AND (c.teacher_id = auth.uid() OR get_user_role() = 'admin'))
  );

-- ─── quiz_questions ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quiz_questions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id         uuid NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  question        text NOT NULL DEFAULT '',
  options         jsonb DEFAULT '[]',
  correct_answer  integer DEFAULT 0,
  explanation     text DEFAULT '',
  points          integer DEFAULT 1,
  order_index     integer DEFAULT 0,
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quiz_questions_quiz_id ON quiz_questions(quiz_id);

ALTER TABLE quiz_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students can view questions of published quizzes"
  ON quiz_questions FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM quizzes q WHERE q.id = quiz_questions.quiz_id AND q.is_published = true)
  );

CREATE POLICY "Teachers can manage quiz questions insert"
  ON quiz_questions FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM quizzes q
      JOIN courses c ON c.id = q.course_id
      WHERE q.id = quiz_questions.quiz_id AND (c.teacher_id = auth.uid() OR get_user_role() = 'admin')
    )
  );

CREATE POLICY "Teachers can update quiz questions"
  ON quiz_questions FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM quizzes q
      JOIN courses c ON c.id = q.course_id
      WHERE q.id = quiz_questions.quiz_id AND (c.teacher_id = auth.uid() OR get_user_role() = 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM quizzes q
      JOIN courses c ON c.id = q.course_id
      WHERE q.id = quiz_questions.quiz_id AND (c.teacher_id = auth.uid() OR get_user_role() = 'admin')
    )
  );

CREATE POLICY "Teachers can delete quiz questions"
  ON quiz_questions FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM quizzes q
      JOIN courses c ON c.id = q.course_id
      WHERE q.id = quiz_questions.quiz_id AND (c.teacher_id = auth.uid() OR get_user_role() = 'admin')
    )
  );
