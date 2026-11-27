/*
  # 057 — Course workspace: schedule, assignments/capstone/labs, teacher guides, feedback

  1. Schedule: courses.start_date and sections.release_at. Students cannot read the lessons,
     materials or assignments of a week before its release date (course staff always can).
  2. Assignments become part of the course design: linked to a week (or the whole course),
     with a kind (assignment, capstone, lab), a brief, a marking rubric and resources.
     Model answers and marking notes live in a separate staff-only table so students can
     never read them. Submissions gain per-criterion rubric scores.
  3. Teacher guides (session plans) per lesson, visible to course staff only.
  4. Week feedback from students (rating + comment), readable by course staff.
  5. Course staff (owner teacher, admin, org admin of the course's organisation) manage all
     of the above through can_manage_course.

  Idempotent.
*/

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Schedule
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE courses  ADD COLUMN IF NOT EXISTS start_date date;
ALTER TABLE sections ADD COLUMN IF NOT EXISTS release_at timestamptz;

CREATE OR REPLACE FUNCTION public.section_is_released(p_section_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT release_at IS NULL OR release_at <= now() FROM sections WHERE id = p_section_id), true);
$$;

CREATE OR REPLACE FUNCTION public.lesson_is_released(p_lesson_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT s.release_at IS NULL OR s.release_at <= now()
    FROM lessons l JOIN sections s ON s.id = l.section_id
    WHERE l.id = p_lesson_id
  ), true);
$$;
GRANT EXECUTE ON FUNCTION public.section_is_released(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.lesson_is_released(uuid) TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "Enrolled students can view course lessons" ON lessons;
CREATE POLICY "Enrolled students can view course lessons"
  ON lessons FOR SELECT TO authenticated
  USING (
    can_manage_course(course_id)
    OR (has_course_access(course_id) AND section_is_released(section_id))
  );

DROP POLICY IF EXISTS "Students can read documents for enrolled courses" ON lesson_documents;
CREATE POLICY "Students can read documents for enrolled courses"
  ON lesson_documents FOR SELECT TO authenticated
  USING (has_course_access(lesson_documents.course_id) AND lesson_is_released(lesson_documents.lesson_id));

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Assignments, capstone projects and labs
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS section_id uuid REFERENCES sections(id) ON DELETE SET NULL;
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'assignment';
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS brief_html text NOT NULL DEFAULT '';
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS rubric jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS resources jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS estimated_minutes integer;
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS order_index integer NOT NULL DEFAULT 0;
ALTER TABLE assignments DROP CONSTRAINT IF EXISTS assignments_kind_check;
ALTER TABLE assignments ADD CONSTRAINT assignments_kind_check CHECK (kind IN ('assignment', 'capstone', 'lab'));
CREATE INDEX IF NOT EXISTS idx_assignments_section ON assignments(section_id);

DROP POLICY IF EXISTS "Enrolled students can view published assignments" ON assignments;
CREATE POLICY "Enrolled students can view published assignments"
  ON assignments FOR SELECT TO authenticated
  USING (is_published = true AND has_course_access(course_id) AND (section_id IS NULL OR section_is_released(section_id)));

DROP POLICY IF EXISTS "Teachers can view all course assignments" ON assignments;
CREATE POLICY "Teachers can view all course assignments"
  ON assignments FOR SELECT TO authenticated USING (can_manage_course(course_id));
DROP POLICY IF EXISTS "Teachers can insert course assignments" ON assignments;
CREATE POLICY "Teachers can insert course assignments"
  ON assignments FOR INSERT TO authenticated WITH CHECK (can_manage_course(course_id));
DROP POLICY IF EXISTS "Teachers can update course assignments" ON assignments;
CREATE POLICY "Teachers can update course assignments"
  ON assignments FOR UPDATE TO authenticated
  USING (can_manage_course(course_id)) WITH CHECK (can_manage_course(course_id));
DROP POLICY IF EXISTS "Teachers can delete course assignments" ON assignments;
CREATE POLICY "Teachers can delete course assignments"
  ON assignments FOR DELETE TO authenticated USING (can_manage_course(course_id));

-- Model answers and marking notes: never visible to students
CREATE TABLE IF NOT EXISTS assignment_private (
  assignment_id uuid PRIMARY KEY REFERENCES assignments(id) ON DELETE CASCADE,
  course_id     uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  solution_html text NOT NULL DEFAULT '',
  marking_notes text NOT NULL DEFAULT '',
  updated_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE assignment_private ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Course staff manage assignment answers" ON assignment_private;
CREATE POLICY "Course staff manage assignment answers"
  ON assignment_private FOR ALL TO authenticated
  USING (can_manage_course(course_id)) WITH CHECK (can_manage_course(course_id));

-- One submission per student per assignment: students "submit" with an upsert on these
-- columns, which needs a unique index on exactly (assignment_id, student_id). Older
-- databases already have one; add it only where it is missing, keeping the latest
-- submission if duplicates exist.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_index i
    WHERE i.indrelid = 'public.assignment_submissions'::regclass
      AND i.indisunique AND i.indpred IS NULL
      AND (SELECT array_agg(a.attname::text ORDER BY a.attname)
             FROM pg_attribute a
            WHERE a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey)) = ARRAY['assignment_id', 'student_id']
      AND i.indnatts = 2
  ) THEN
    DELETE FROM assignment_submissions a
    USING assignment_submissions b
    WHERE a.assignment_id = b.assignment_id AND a.student_id = b.student_id
      AND (COALESCE(a.submitted_at, '-infinity'::timestamptz), a.id) < (COALESCE(b.submitted_at, '-infinity'::timestamptz), b.id);
    ALTER TABLE assignment_submissions ADD CONSTRAINT assignment_submissions_assignment_student_key UNIQUE (assignment_id, student_id);
  END IF;
END $$;

-- Per-criterion rubric scores on submissions
ALTER TABLE assignment_submissions ADD COLUMN IF NOT EXISTS rubric_scores jsonb NOT NULL DEFAULT '{}'::jsonb;

DROP POLICY IF EXISTS "Teachers can view all submissions" ON assignment_submissions;
CREATE POLICY "Teachers can view all submissions"
  ON assignment_submissions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM assignments a WHERE a.id = assignment_submissions.assignment_id AND can_manage_course(a.course_id)));
DROP POLICY IF EXISTS "Teachers can grade submissions" ON assignment_submissions;
CREATE POLICY "Teachers can grade submissions"
  ON assignment_submissions FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM assignments a WHERE a.id = assignment_submissions.assignment_id AND can_manage_course(a.course_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM assignments a WHERE a.id = assignment_submissions.assignment_id AND can_manage_course(a.course_id)));

-- Students must not award themselves rubric scores either
CREATE OR REPLACE FUNCTION public.guard_submission_grading()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM assignments a WHERE a.id = NEW.assignment_id AND can_manage_course(a.course_id)) THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.grade := NULL; NEW.graded_at := NULL; NEW.feedback := ''; NEW.rubric_scores := '{}'::jsonb;
  ELSE
    NEW.grade := OLD.grade; NEW.graded_at := OLD.graded_at; NEW.feedback := OLD.feedback; NEW.rubric_scores := OLD.rubric_scores;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_guard_submission_grading ON assignment_submissions;
CREATE TRIGGER trg_guard_submission_grading
  BEFORE INSERT OR UPDATE ON assignment_submissions
  FOR EACH ROW EXECUTE FUNCTION public.guard_submission_grading();

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Teacher guides (session plans), staff only
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS lesson_teacher_guides (
  lesson_id    uuid PRIMARY KEY REFERENCES lessons(id) ON DELETE CASCADE,
  course_id    uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  content_html text NOT NULL DEFAULT '',
  updated_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE lesson_teacher_guides ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Course staff manage teacher guides" ON lesson_teacher_guides;
CREATE POLICY "Course staff manage teacher guides"
  ON lesson_teacher_guides FOR ALL TO authenticated
  USING (can_manage_course(course_id)) WITH CHECK (can_manage_course(course_id));

-- ════════════════════════════════════════════════════════════════════════════
-- 4. Week feedback from students
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS week_feedback (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id  uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  section_id uuid NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  rating     smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment    text NOT NULL DEFAULT '' CHECK (char_length(comment) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (section_id, student_id)
);
ALTER TABLE week_feedback ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Students manage own week feedback" ON week_feedback;
CREATE POLICY "Students manage own week feedback"
  ON week_feedback FOR ALL TO authenticated
  USING (student_id = auth.uid())
  WITH CHECK (
    student_id = auth.uid()
    AND has_course_access(course_id)
    AND EXISTS (SELECT 1 FROM sections s WHERE s.id = week_feedback.section_id AND s.course_id = week_feedback.course_id)
  );
DROP POLICY IF EXISTS "Course staff read week feedback" ON week_feedback;
CREATE POLICY "Course staff read week feedback"
  ON week_feedback FOR SELECT TO authenticated USING (can_manage_course(course_id));

-- ════════════════════════════════════════════════════════════════════════════
-- 5. Course staff can see who is enrolled and how they are doing
-- ════════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Course staff view enrollments" ON course_enrollments;
CREATE POLICY "Course staff view enrollments"
  ON course_enrollments FOR SELECT TO authenticated USING (can_manage_course(course_id));
DROP POLICY IF EXISTS "Course staff view quiz attempts" ON quiz_attempts;
CREATE POLICY "Course staff view quiz attempts"
  ON quiz_attempts FOR SELECT TO authenticated USING (can_manage_course(course_id));
DROP POLICY IF EXISTS "Course staff view lesson progress" ON lesson_progress;
CREATE POLICY "Course staff view lesson progress"
  ON lesson_progress FOR SELECT TO authenticated USING (can_manage_course(course_id));
