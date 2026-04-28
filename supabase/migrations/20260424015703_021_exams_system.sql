/*
  # Exam System — Reading Comprehension & Open-Answer Exams

  ## Overview
  Adds a full exam system where:
  - Teachers create exams with a passage/stimulus and open-ended questions
  - Students submit typed answers
  - AI auto-grades each answer with a suggested score and reasoning
  - Teacher reviews AI suggestions and can adjust before finalising
  - Once finalised, students can see their scores and feedback

  ## New Tables

  ### exams
  - id, course_id, teacher_id
  - title, description
  - instructions — what students should do (e.g. "Read the passage and answer all questions")
  - passage — the reading/stimulus text students read before answering
  - time_limit_minutes — 0 means no limit
  - total_marks — sum of all question marks
  - is_published — controls student visibility
  - created_at, updated_at

  ### exam_questions
  - id, exam_id
  - question — the question text
  - marks — maximum marks for this question
  - sample_answer — teacher's model answer used by AI for grading
  - order_index

  ### exam_submissions
  - id, exam_id, student_id, course_id
  - answers jsonb — map of question_id → student's typed answer
  - status: 'submitted' | 'ai_graded' | 'teacher_reviewed' | 'finalised'
  - ai_scores jsonb — map of question_id → {score, reasoning, suggestion}
  - teacher_scores jsonb — map of question_id → {score, feedback} (teacher overrides)
  - final_scores jsonb — resolved final scores shown to student
  - total_score, max_score, percentage (computed on finalise)
  - ai_graded_at, teacher_reviewed_at, finalised_at
  - submitted_at

  ## Security
  - RLS enabled on all three tables
  - Students: read published exams for enrolled courses; insert/read own submissions
  - Teachers: full access to their own course exams; read/update submissions for their courses
  - Admins: full access
*/

-- ─── exams ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS exams (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id           uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  teacher_id          uuid REFERENCES profiles(id) ON DELETE SET NULL,
  title               text NOT NULL DEFAULT '',
  description         text DEFAULT '',
  instructions        text DEFAULT 'Read the passage carefully and answer all questions in full sentences.',
  passage             text DEFAULT '',
  time_limit_minutes  integer NOT NULL DEFAULT 0,
  total_marks         integer NOT NULL DEFAULT 0,
  is_published        boolean NOT NULL DEFAULT false,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

ALTER TABLE exams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students can view published exams for enrolled courses"
  ON exams FOR SELECT TO authenticated
  USING (
    is_published = true AND (
      EXISTS (SELECT 1 FROM course_enrollments WHERE course_enrollments.course_id = exams.course_id AND course_enrollments.user_id = auth.uid())
      OR EXISTS (SELECT 1 FROM enrollments WHERE enrollments.course_id = exams.course_id AND enrollments.student_id = auth.uid())
    )
  );

CREATE POLICY "Teachers can manage exams for their courses"
  ON exams FOR SELECT TO authenticated
  USING (
    teacher_id = auth.uid()
    OR EXISTS (SELECT 1 FROM courses WHERE courses.id = exams.course_id AND courses.teacher_id = auth.uid())
    OR (SELECT get_my_role()) = 'admin'
  );

CREATE POLICY "Teachers can insert exams"
  ON exams FOR INSERT TO authenticated
  WITH CHECK (
    teacher_id = auth.uid()
    OR (SELECT get_my_role()) = 'admin'
  );

CREATE POLICY "Teachers can update their exams"
  ON exams FOR UPDATE TO authenticated
  USING (
    teacher_id = auth.uid()
    OR EXISTS (SELECT 1 FROM courses WHERE courses.id = exams.course_id AND courses.teacher_id = auth.uid())
    OR (SELECT get_my_role()) = 'admin'
  )
  WITH CHECK (
    teacher_id = auth.uid()
    OR EXISTS (SELECT 1 FROM courses WHERE courses.id = exams.course_id AND courses.teacher_id = auth.uid())
    OR (SELECT get_my_role()) = 'admin'
  );

CREATE POLICY "Teachers can delete their exams"
  ON exams FOR DELETE TO authenticated
  USING (
    teacher_id = auth.uid()
    OR EXISTS (SELECT 1 FROM courses WHERE courses.id = exams.course_id AND courses.teacher_id = auth.uid())
    OR (SELECT get_my_role()) = 'admin'
  );

-- ─── exam_questions ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS exam_questions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id       uuid NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  question      text NOT NULL DEFAULT '',
  marks         integer NOT NULL DEFAULT 5,
  sample_answer text DEFAULT '',
  order_index   integer NOT NULL DEFAULT 0,
  created_at    timestamptz DEFAULT now()
);

ALTER TABLE exam_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read exam questions"
  ON exam_questions FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM exams
      WHERE exams.id = exam_questions.exam_id
        AND (
          exams.teacher_id = auth.uid()
          OR EXISTS (SELECT 1 FROM courses WHERE courses.id = exams.course_id AND courses.teacher_id = auth.uid())
          OR (SELECT get_my_role()) = 'admin'
          OR (
            exams.is_published = true AND (
              EXISTS (SELECT 1 FROM course_enrollments WHERE course_enrollments.course_id = exams.course_id AND course_enrollments.user_id = auth.uid())
              OR EXISTS (SELECT 1 FROM enrollments WHERE enrollments.course_id = exams.course_id AND enrollments.student_id = auth.uid())
            )
          )
        )
    )
  );

CREATE POLICY "Teachers can insert exam questions"
  ON exam_questions FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM exams
      WHERE exams.id = exam_questions.exam_id
        AND (exams.teacher_id = auth.uid() OR (SELECT get_my_role()) = 'admin')
    )
  );

CREATE POLICY "Teachers can update exam questions"
  ON exam_questions FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM exams
      WHERE exams.id = exam_questions.exam_id
        AND (exams.teacher_id = auth.uid() OR (SELECT get_my_role()) = 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM exams
      WHERE exams.id = exam_questions.exam_id
        AND (exams.teacher_id = auth.uid() OR (SELECT get_my_role()) = 'admin')
    )
  );

CREATE POLICY "Teachers can delete exam questions"
  ON exam_questions FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM exams
      WHERE exams.id = exam_questions.exam_id
        AND (exams.teacher_id = auth.uid() OR (SELECT get_my_role()) = 'admin')
    )
  );

-- ─── exam_submissions ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS exam_submissions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id             uuid NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  student_id          uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  course_id           uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  answers             jsonb NOT NULL DEFAULT '{}',
  status              text NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted', 'ai_graded', 'teacher_reviewed', 'finalised')),
  ai_scores           jsonb DEFAULT '{}',
  teacher_scores      jsonb DEFAULT '{}',
  final_scores        jsonb DEFAULT '{}',
  total_score         integer DEFAULT NULL,
  max_score           integer DEFAULT NULL,
  percentage          numeric(5,2) DEFAULT NULL,
  submitted_at        timestamptz DEFAULT now(),
  ai_graded_at        timestamptz,
  teacher_reviewed_at timestamptz,
  finalised_at        timestamptz,
  UNIQUE (exam_id, student_id)
);

ALTER TABLE exam_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students can insert their own submissions"
  ON exam_submissions FOR INSERT TO authenticated
  WITH CHECK (student_id = auth.uid());

CREATE POLICY "Students can read their own submissions"
  ON exam_submissions FOR SELECT TO authenticated
  USING (
    student_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM exams
      WHERE exams.id = exam_submissions.exam_id
        AND (
          exams.teacher_id = auth.uid()
          OR EXISTS (SELECT 1 FROM courses WHERE courses.id = exams.course_id AND courses.teacher_id = auth.uid())
          OR (SELECT get_my_role()) = 'admin'
        )
    )
  );

CREATE POLICY "Teachers can update submissions for their exams"
  ON exam_submissions FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM exams
      WHERE exams.id = exam_submissions.exam_id
        AND (
          exams.teacher_id = auth.uid()
          OR EXISTS (SELECT 1 FROM courses WHERE courses.id = exams.course_id AND courses.teacher_id = auth.uid())
          OR (SELECT get_my_role()) = 'admin'
        )
    )
    OR student_id = auth.uid()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM exams
      WHERE exams.id = exam_submissions.exam_id
        AND (
          exams.teacher_id = auth.uid()
          OR EXISTS (SELECT 1 FROM courses WHERE courses.id = exams.course_id AND courses.teacher_id = auth.uid())
          OR (SELECT get_my_role()) = 'admin'
        )
    )
    OR student_id = auth.uid()
  );

-- ─── indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_exams_course ON exams(course_id);
CREATE INDEX IF NOT EXISTS idx_exam_questions_exam ON exam_questions(exam_id, order_index);
CREATE INDEX IF NOT EXISTS idx_exam_submissions_student ON exam_submissions(student_id, exam_id);
CREATE INDEX IF NOT EXISTS idx_exam_submissions_exam ON exam_submissions(exam_id);
