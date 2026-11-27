/*
  # 056 — Saved course plan, and course staff can manage generated materials

  1. courses.ai_plan keeps the plan agreed with the AI course planner (brief, research
     notes, sources and the conversation), so later "add more weeks" conversations and
     generated notes, slides and lectures follow the same plan.
  2. Lesson notes/slides, activities, quizzes and quiz questions can be written by anyone
     who manages the course (owner teacher, admin, or an org admin of the course's
     organisation). Before, organisation admins could build a course but every notes,
     slides, quiz and activity insert was silently rejected.

  Idempotent.
*/

ALTER TABLE courses ADD COLUMN IF NOT EXISTS ai_plan jsonb;

-- ── lesson_documents ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Teachers can view documents for own courses" ON lesson_documents;
CREATE POLICY "Teachers can view documents for own courses"
  ON lesson_documents FOR SELECT TO authenticated USING (can_manage_course(course_id));
DROP POLICY IF EXISTS "Teachers can insert documents for own courses" ON lesson_documents;
CREATE POLICY "Teachers can insert documents for own courses"
  ON lesson_documents FOR INSERT TO authenticated WITH CHECK (can_manage_course(course_id));
DROP POLICY IF EXISTS "Teachers can update documents for own courses" ON lesson_documents;
CREATE POLICY "Teachers can update documents for own courses"
  ON lesson_documents FOR UPDATE TO authenticated
  USING (can_manage_course(course_id)) WITH CHECK (can_manage_course(course_id));
DROP POLICY IF EXISTS "Teachers can delete documents for own courses" ON lesson_documents;
CREATE POLICY "Teachers can delete documents for own courses"
  ON lesson_documents FOR DELETE TO authenticated USING (can_manage_course(course_id));

-- ── lesson_activities ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Teachers can insert activities for own courses" ON lesson_activities;
CREATE POLICY "Teachers can insert activities for own courses"
  ON lesson_activities FOR INSERT TO authenticated WITH CHECK (can_manage_course(course_id));
DROP POLICY IF EXISTS "Teachers can update activities for own courses" ON lesson_activities;
CREATE POLICY "Teachers can update activities for own courses"
  ON lesson_activities FOR UPDATE TO authenticated
  USING (can_manage_course(course_id)) WITH CHECK (can_manage_course(course_id));
DROP POLICY IF EXISTS "Teachers can delete activities for own courses" ON lesson_activities;
CREATE POLICY "Teachers can delete activities for own courses"
  ON lesson_activities FOR DELETE TO authenticated USING (can_manage_course(course_id));

-- ── quizzes ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Course staff can view quizzes" ON quizzes;
CREATE POLICY "Course staff can view quizzes"
  ON quizzes FOR SELECT TO authenticated USING (can_manage_course(course_id));
DROP POLICY IF EXISTS "Teachers can manage own quizzes insert" ON quizzes;
CREATE POLICY "Teachers can manage own quizzes insert"
  ON quizzes FOR INSERT TO authenticated WITH CHECK (can_manage_course(course_id));
DROP POLICY IF EXISTS "Teachers can update own quizzes" ON quizzes;
CREATE POLICY "Teachers can update own quizzes"
  ON quizzes FOR UPDATE TO authenticated
  USING (can_manage_course(course_id)) WITH CHECK (can_manage_course(course_id));
DROP POLICY IF EXISTS "Teachers can delete own quizzes" ON quizzes;
CREATE POLICY "Teachers can delete own quizzes"
  ON quizzes FOR DELETE TO authenticated USING (can_manage_course(course_id));

-- ── quiz_questions ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Course staff can view quiz questions" ON quiz_questions;
CREATE POLICY "Course staff can view quiz questions"
  ON quiz_questions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM quizzes q WHERE q.id = quiz_questions.quiz_id AND can_manage_course(q.course_id)));
DROP POLICY IF EXISTS "Teachers can manage quiz questions insert" ON quiz_questions;
CREATE POLICY "Teachers can manage quiz questions insert"
  ON quiz_questions FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM quizzes q WHERE q.id = quiz_questions.quiz_id AND can_manage_course(q.course_id)));
DROP POLICY IF EXISTS "Teachers can update quiz questions" ON quiz_questions;
CREATE POLICY "Teachers can update quiz questions"
  ON quiz_questions FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM quizzes q WHERE q.id = quiz_questions.quiz_id AND can_manage_course(q.course_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM quizzes q WHERE q.id = quiz_questions.quiz_id AND can_manage_course(q.course_id)));
DROP POLICY IF EXISTS "Teachers can delete quiz questions" ON quiz_questions;
CREATE POLICY "Teachers can delete quiz questions"
  ON quiz_questions FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM quizzes q WHERE q.id = quiz_questions.quiz_id AND can_manage_course(q.course_id)));
