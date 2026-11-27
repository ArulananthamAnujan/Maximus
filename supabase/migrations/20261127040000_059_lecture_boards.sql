/*
  059: live boards for lecture videos.

  A board is what appears next to the AI presenter while a lecture plays: the code
  being typed and what it prints, or the key points, changing as the presenter
  speaks. It is generated from the lecture script by the lecture-video function and
  shown by the lesson player, timed to the video, so existing videos get boards
  without being made again.

  - lesson_boards: the board of one lecture video lesson. Students can read it for
    lessons they can open (same rule as notes and slides); course staff manage it.
  - lecture_videos.board: the board kept with the lecture part, so it is attached to
    the lesson when the video is finished.
  - course_build_tasks: new task kind 'lecture_board'.
  - copy_course(): also copies boards.
  Safe to run more than once.
*/

CREATE TABLE IF NOT EXISTS lesson_boards (
  lesson_id  uuid PRIMARY KEY REFERENCES lessons(id) ON DELETE CASCADE,
  course_id  uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  board      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lesson_boards_course ON lesson_boards (course_id);
ALTER TABLE lesson_boards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Course staff manage lesson boards" ON lesson_boards;
CREATE POLICY "Course staff manage lesson boards"
  ON lesson_boards FOR ALL TO authenticated
  USING (can_manage_course(course_id))
  WITH CHECK (
    can_manage_course(course_id)
    AND EXISTS (SELECT 1 FROM lessons l WHERE l.id = lesson_boards.lesson_id AND l.course_id = lesson_boards.course_id)
  );

DROP POLICY IF EXISTS "Students read boards of lessons they can open" ON lesson_boards;
CREATE POLICY "Students read boards of lessons they can open"
  ON lesson_boards FOR SELECT TO authenticated
  USING (has_course_access(course_id) AND lesson_is_released(lesson_id));

ALTER TABLE lecture_videos ADD COLUMN IF NOT EXISTS board jsonb;

ALTER TABLE course_build_tasks DROP CONSTRAINT IF EXISTS course_build_tasks_kind_check;
ALTER TABLE course_build_tasks ADD CONSTRAINT course_build_tasks_kind_check
  CHECK (kind IN ('notes', 'slides', 'guide', 'lecture_script', 'lecture_video', 'lecture_board', 'quiz', 'capstone'));

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

  -- Live boards of lecture videos
  INSERT INTO lesson_boards
  SELECT (jsonb_populate_record(NULL::lesson_boards, to_jsonb(b) || jsonb_build_object(
    'lesson_id', v_les ->> b.lesson_id::text, 'course_id', v_new, 'updated_at', now()))).*
  FROM lesson_boards b WHERE v_les ? b.lesson_id::text;

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
