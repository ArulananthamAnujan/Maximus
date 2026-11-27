/*
  058: whole-course builds on the server, copying a course for a new term, and AI
  marking suggestions.

  1. course_build_jobs / course_build_tasks
     A teacher starts a build; the course-build edge function works through the tasks
     (notes, slides, teacher guides, lecture scripts and videos, quizzes, capstone) in
     the background, so the teacher can close the page. Only the function (service
     role) writes these tables; course staff can read them to show progress.

  2. copy_course(course, title, start_date)
     Copies a course with its weeks, lessons, notes, slides, teacher guides,
     activities, staff flashcards, quizzes, assignments (with model answers), exams
     and finished lecture videos, as a new draft. Students, progress, submissions,
     certificates and feedback are not copied. Week opening dates and due dates move
     with the new start date.

  3. submission_ai_marks
     AI-suggested rubric scores and feedback for a submission, visible to course
     staff only until a teacher accepts them as the real mark.
*/

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Server-side course builds
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS course_build_jobs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id   uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  created_by  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status      text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'done', 'stopped')),
  options     jsonb NOT NULL DEFAULT '{}'::jsonb,
  error       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS course_build_jobs_one_running
  ON course_build_jobs (course_id) WHERE status = 'running';
CREATE INDEX IF NOT EXISTS idx_course_build_jobs_course ON course_build_jobs (course_id, created_at DESC);

CREATE TABLE IF NOT EXISTS course_build_tasks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id      uuid NOT NULL REFERENCES course_build_jobs(id) ON DELETE CASCADE,
  course_id   uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  -- 1: notes; 2: everything written from the notes; 3: lecture videos (from their scripts)
  phase       smallint NOT NULL CHECK (phase BETWEEN 1 AND 3),
  seq         integer NOT NULL DEFAULT 0,
  kind        text NOT NULL CHECK (kind IN ('notes', 'slides', 'guide', 'lecture_script', 'lecture_video', 'quiz', 'capstone')),
  lesson_id   uuid REFERENCES lessons(id) ON DELETE CASCADE,
  section_id  uuid REFERENCES sections(id) ON DELETE CASCADE,
  label       text NOT NULL DEFAULT '',
  status      text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'done', 'failed', 'skipped')),
  attempts    smallint NOT NULL DEFAULT 0,
  error       text,
  started_at  timestamptz,
  finished_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_course_build_tasks_job ON course_build_tasks (job_id, status, phase, seq);

ALTER TABLE course_build_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_build_tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Course staff read builds" ON course_build_jobs;
CREATE POLICY "Course staff read builds"
  ON course_build_jobs FOR SELECT TO authenticated USING (can_manage_course(course_id));
DROP POLICY IF EXISTS "Course staff read build tasks" ON course_build_tasks;
CREATE POLICY "Course staff read build tasks"
  ON course_build_tasks FOR SELECT TO authenticated USING (can_manage_course(course_id));

-- Hands the worker the next tasks to run: only from the earliest unfinished phase,
-- at most p_limit running at once for the job. Tasks stuck "running" (the worker was
-- stopped mid-task) are retried once, then marked failed.
CREATE OR REPLACE FUNCTION public.claim_build_tasks(p_job uuid, p_limit integer)
RETURNS SETOF course_build_tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phase   smallint;
  v_running integer;
BEGIN
  -- One claimer at a time per job, so the running limit holds
  PERFORM pg_advisory_xact_lock(hashtext('course_build:' || p_job::text));

  UPDATE course_build_tasks
     SET status = CASE WHEN attempts >= 2 THEN 'failed' ELSE 'queued' END,
         error = CASE WHEN attempts >= 2 THEN 'Took too long and was stopped. Try building again.' ELSE error END,
         finished_at = CASE WHEN attempts >= 2 THEN now() ELSE NULL END
   WHERE job_id = p_job AND status = 'running' AND started_at < now() - interval '5 minutes';

  SELECT min(phase) INTO v_phase FROM course_build_tasks WHERE job_id = p_job AND status IN ('queued', 'running');
  IF v_phase IS NULL THEN RETURN; END IF;

  SELECT count(*) INTO v_running FROM course_build_tasks WHERE job_id = p_job AND status = 'running';
  IF v_running >= p_limit THEN RETURN; END IF;

  RETURN QUERY
  UPDATE course_build_tasks t
     SET status = 'running', started_at = now(), attempts = t.attempts + 1
   WHERE t.id IN (
     SELECT id FROM course_build_tasks
      WHERE job_id = p_job AND status = 'queued' AND phase = v_phase
      ORDER BY seq
      LIMIT p_limit - v_running
      FOR UPDATE SKIP LOCKED)
  RETURNING t.*;
END;
$$;

-- Marks the job finished once nothing is left to do. True only for the call that
-- finishes it, so the teacher is told once.
CREATE OR REPLACE FUNCTION public.finish_build_job(p_job uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_done boolean;
BEGIN
  UPDATE course_build_jobs j
     SET status = 'done', finished_at = now(), updated_at = now()
   WHERE j.id = p_job AND j.status = 'running'
     AND NOT EXISTS (SELECT 1 FROM course_build_tasks t WHERE t.job_id = p_job AND t.status IN ('queued', 'running'))
  RETURNING true INTO v_done;
  RETURN coalesce(v_done, false);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_build_tasks(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.finish_build_job(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_build_tasks(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_build_job(uuid) TO service_role;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Copy a course for a new term
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.copy_course(p_course uuid, p_title text, p_start date DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_role    text;
  v_old     courses%ROWTYPE;
  v_new     uuid := gen_random_uuid();
  v_shift   interval;
  v_sec     jsonb;
  v_les     jsonb;
  v_quiz    jsonb;
  v_asg     jsonb;
  v_exam    jsonb;
  v_title   text := left(btrim(coalesce(p_title, '')), 200);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501'; END IF;
  SELECT role INTO v_role FROM profiles WHERE id = v_uid AND coalesce(is_active, true);
  IF v_role IS NULL OR v_role NOT IN ('teacher', 'admin', 'org_admin') OR NOT can_manage_course(p_course) THEN
    RAISE EXCEPTION 'You cannot copy this course' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_old FROM courses WHERE id = p_course;
  IF v_title = '' THEN v_title := left(v_old.title || ' (copy)', 200); END IF;

  -- Dates move with the new start date; without one, opening and due dates are cleared
  v_shift := CASE WHEN p_start IS NOT NULL AND v_old.start_date IS NOT NULL
                  THEN make_interval(days => p_start - v_old.start_date) END;

  SELECT coalesce(jsonb_object_agg(id::text, gen_random_uuid()), '{}'::jsonb) INTO v_sec  FROM sections    WHERE course_id = p_course;
  SELECT coalesce(jsonb_object_agg(id::text, gen_random_uuid()), '{}'::jsonb) INTO v_les  FROM lessons     WHERE course_id = p_course;
  SELECT coalesce(jsonb_object_agg(id::text, gen_random_uuid()), '{}'::jsonb) INTO v_quiz FROM quizzes     WHERE course_id = p_course;
  SELECT coalesce(jsonb_object_agg(id::text, gen_random_uuid()), '{}'::jsonb) INTO v_asg  FROM assignments WHERE course_id = p_course;
  SELECT coalesce(jsonb_object_agg(id::text, gen_random_uuid()), '{}'::jsonb) INTO v_exam FROM exams       WHERE course_id = p_course;

  -- Each row is copied whole, with only the listed columns changed
  INSERT INTO courses
  SELECT (jsonb_populate_record(NULL::courses, to_jsonb(c) || jsonb_build_object(
    'id', v_new, 'title', v_title, 'is_published', false, 'is_archived', false,
    'start_date', p_start, 'total_students', 0, 'rating', NULL, 'stripe_payment_link', NULL,
    'created_at', now(), 'updated_at', now()))).*
  FROM courses c WHERE c.id = p_course;

  INSERT INTO sections
  SELECT (jsonb_populate_record(NULL::sections, to_jsonb(s) || jsonb_build_object(
    'id', v_sec ->> s.id::text, 'course_id', v_new, 'release_at', s.release_at + v_shift,
    'created_at', now(), 'updated_at', now()))).*
  FROM sections s WHERE s.course_id = p_course;

  INSERT INTO lessons
  SELECT (jsonb_populate_record(NULL::lessons, to_jsonb(l) || jsonb_build_object(
    'id', v_les ->> l.id::text, 'course_id', v_new, 'section_id', v_sec ->> l.section_id::text,
    'created_at', now(), 'updated_at', now()))).*
  FROM lessons l WHERE l.course_id = p_course AND v_sec ? l.section_id::text;

  INSERT INTO lesson_documents
  SELECT (jsonb_populate_record(NULL::lesson_documents, to_jsonb(d) || jsonb_build_object(
    'id', gen_random_uuid(), 'course_id', v_new, 'lesson_id', v_les ->> d.lesson_id::text,
    'created_at', now(), 'updated_at', now()))).*
  FROM lesson_documents d WHERE v_les ? d.lesson_id::text;

  INSERT INTO lesson_teacher_guides
  SELECT (jsonb_populate_record(NULL::lesson_teacher_guides, to_jsonb(g) || jsonb_build_object(
    'course_id', v_new, 'lesson_id', v_les ->> g.lesson_id::text, 'updated_at', now()))).*
  FROM lesson_teacher_guides g WHERE v_les ? g.lesson_id::text;

  INSERT INTO lesson_activities
  SELECT (jsonb_populate_record(NULL::lesson_activities, to_jsonb(a) || jsonb_build_object(
    'id', gen_random_uuid(), 'course_id', v_new, 'lesson_id', v_les ->> a.lesson_id::text,
    'created_at', now(), 'updated_at', now()))).*
  FROM lesson_activities a WHERE v_les ? a.lesson_id::text;

  -- Only flashcards made by course staff; students' own cards stay with them
  INSERT INTO flashcards
  SELECT (jsonb_populate_record(NULL::flashcards, to_jsonb(f) || jsonb_build_object(
    'id', gen_random_uuid(), 'course_id', v_new, 'lesson_id', v_les ->> f.lesson_id::text,
    'review_count', 0, 'next_review', NULL, 'created_at', now(), 'updated_at', now()))).*
  FROM flashcards f
  WHERE v_les ? f.lesson_id::text
    AND (f.user_id IS NULL OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = f.user_id AND p.role IN ('teacher', 'admin', 'org_admin')));

  INSERT INTO quizzes
  SELECT (jsonb_populate_record(NULL::quizzes, to_jsonb(q) || jsonb_build_object(
    'id', v_quiz ->> q.id::text, 'course_id', v_new,
    'section_id', v_sec ->> q.section_id::text, 'lesson_id', v_les ->> q.lesson_id::text,
    'created_at', now(), 'updated_at', now()))).*
  FROM quizzes q WHERE q.course_id = p_course;

  INSERT INTO quiz_questions
  SELECT (jsonb_populate_record(NULL::quiz_questions, to_jsonb(qq) || jsonb_build_object(
    'id', gen_random_uuid(), 'quiz_id', v_quiz ->> qq.quiz_id::text, 'created_at', now()))).*
  FROM quiz_questions qq WHERE v_quiz ? qq.quiz_id::text;

  INSERT INTO assignments
  SELECT (jsonb_populate_record(NULL::assignments, to_jsonb(a) || jsonb_build_object(
    'id', v_asg ->> a.id::text, 'course_id', v_new, 'section_id', v_sec ->> a.section_id::text,
    'due_date', a.due_date + v_shift, 'created_at', now(), 'updated_at', now()))).*
  FROM assignments a WHERE a.course_id = p_course;

  INSERT INTO assignment_private
  SELECT (jsonb_populate_record(NULL::assignment_private, to_jsonb(ap) || jsonb_build_object(
    'assignment_id', v_asg ->> ap.assignment_id::text, 'course_id', v_new, 'updated_at', now()))).*
  FROM assignment_private ap WHERE v_asg ? ap.assignment_id::text;

  INSERT INTO exams
  SELECT (jsonb_populate_record(NULL::exams, to_jsonb(e) || jsonb_build_object(
    'id', v_exam ->> e.id::text, 'course_id', v_new, 'created_at', now(), 'updated_at', now()))).*
  FROM exams e WHERE e.course_id = p_course;

  INSERT INTO exam_questions
  SELECT (jsonb_populate_record(NULL::exam_questions, to_jsonb(eq) || jsonb_build_object(
    'id', gen_random_uuid(), 'exam_id', v_exam ->> eq.exam_id::text, 'created_at', now()))).*
  FROM exam_questions eq WHERE v_exam ? eq.exam_id::text;

  -- Finished lecture videos keep pointing at the same video file
  INSERT INTO lecture_videos
  SELECT (jsonb_populate_record(NULL::lecture_videos, to_jsonb(v) || jsonb_build_object(
    'id', gen_random_uuid(), 'course_id', v_new, 'section_id', v_sec ->> v.section_id::text,
    'lesson_id', v_les ->> v.lesson_id::text, 'created_by', v_uid, 'created_at', now(), 'updated_at', now()))).*
  FROM lecture_videos v
  WHERE v.course_id = p_course AND v.status = 'ready' AND v_sec ? v.section_id::text
    AND (v.lesson_id IS NULL OR v_les ? v.lesson_id::text);

  RETURN v_new;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.copy_course(uuid, text, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.copy_course(uuid, text, date) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 3. AI marking suggestions (staff only until accepted)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS submission_ai_marks (
  submission_id uuid PRIMARY KEY REFERENCES assignment_submissions(id) ON DELETE CASCADE,
  assignment_id uuid NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  course_id     uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  suggestion    jsonb NOT NULL,
  created_by    uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_submission_ai_marks_assignment ON submission_ai_marks (assignment_id);
ALTER TABLE submission_ai_marks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Course staff manage AI marks" ON submission_ai_marks;
CREATE POLICY "Course staff manage AI marks"
  ON submission_ai_marks FOR ALL TO authenticated
  USING (can_manage_course(course_id))
  WITH CHECK (
    can_manage_course(course_id)
    AND EXISTS (SELECT 1 FROM assignments a WHERE a.id = submission_ai_marks.assignment_id AND a.course_id = submission_ai_marks.course_id)
    AND EXISTS (SELECT 1 FROM assignment_submissions s WHERE s.id = submission_ai_marks.submission_id AND s.assignment_id = submission_ai_marks.assignment_id)
  );
