/*
  # 053 — Access-control hardening

  Closes holes that let ordinary accounts act with privileges they should not have.
  Every statement is idempotent so the migration can be re-run safely.

  1.  Sign-up can no longer choose its own role (always "student").
  2.  Users cannot change their own role / is_active / email on `profiles`;
      co-admins can only (de)activate students and teachers.
  3.  Students cannot self-enrol in paid courses or edit payment fields on enrolments.
  4.  Token / earnings functions are no longer callable from the browser.
  5.  Users cannot edit their own AI credit balances, fabricate payments or earnings.
  6.  Certificates can only be self-issued when the course is genuinely complete.
  7.  Quizzes are graded by the database, attempt limits are enforced, and the
      answer key is no longer readable by students.
  8.  Students cannot grade their own exams or assignments.
  9.  Org owners cannot edit their own token balance / plan.
  10. Org admins can only edit sections/lessons of their own organisation's courses.
  11. Org-owner policies that compared a column with itself are fixed.
  12. Refunded / pending enrolments no longer keep access to documents, activities, exams.
  13. Stripe purchases are fulfilled exactly once (no replayed token credits).
*/

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Sign-up always creates a student
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- The role is never taken from user-supplied sign-up metadata. Staff accounts are
  -- created by the admin-create-user function, which sets the role afterwards with
  -- the service key.
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name', ''), split_part(NEW.email, '@', 1)),
    'student'
  )
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;
  RETURN NEW;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Protect privileged columns on profiles
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.guard_profile_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  -- No end-user JWT: service role, auth trigger or SQL console.
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;

  SELECT role INTO v_role FROM profiles WHERE id = auth.uid();
  IF v_role = 'admin' THEN RETURN NEW; END IF;

  IF NEW.role IS DISTINCT FROM OLD.role
     OR NEW.email IS DISTINCT FROM OLD.email
     OR NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'You are not allowed to change role or email' USING ERRCODE = '42501';
  END IF;

  IF NEW.is_active IS DISTINCT FROM OLD.is_active
     AND NOT (v_role = 'co_admin' AND OLD.role IN ('student', 'teacher') AND OLD.id <> auth.uid()) THEN
    RAISE EXCEPTION 'You are not allowed to activate or deactivate this account' USING ERRCODE = '42501';
  END IF;

  -- Co-admins may edit student/teacher profiles only.
  IF OLD.id <> auth.uid() AND NOT (v_role = 'co_admin' AND OLD.role IN ('student', 'teacher')) THEN
    RAISE EXCEPTION 'You are not allowed to edit this profile' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_profile ON profiles;
CREATE TRIGGER trg_guard_profile
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_privileged_columns();

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Enrolments: no self-enrolment in paid courses, payment fields read-only
-- ════════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Students can insert own enrollment" ON enrollments;
DROP POLICY IF EXISTS "Staff enrol or self-enrol in free course" ON enrollments;
CREATE POLICY "Staff enrol or self-enrol in free course"
  ON enrollments FOR INSERT TO authenticated
  WITH CHECK (
    get_my_role() IN ('admin', 'co_admin')
    OR (
      auth.uid() = student_id
      AND EXISTS (
        SELECT 1 FROM courses c
        WHERE c.id = enrollments.course_id
          AND c.is_published = true
          AND (c.is_free = true OR (COALESCE(c.is_paid, false) = false AND COALESCE(c.price_amount, c.price, 0) = 0))
      )
    )
  );

DROP POLICY IF EXISTS "Users can enroll in free courses" ON course_enrollments;
CREATE POLICY "Users can enroll in free courses"
  ON course_enrollments FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND (
      get_my_role() = 'admin'
      OR (
        payment_status = 'not_required'
        AND COALESCE(amount_paid, 0) = 0
        AND EXISTS (
          SELECT 1 FROM courses c
          WHERE c.id = course_enrollments.course_id
            AND (c.is_free = true OR (COALESCE(c.is_paid, false) = false AND COALESCE(c.price_amount, c.price, 0) = 0))
        )
      )
    )
  );

CREATE OR REPLACE FUNCTION public.guard_enrollment_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR get_my_role() IN ('admin', 'co_admin') THEN RETURN NEW; END IF;

  IF TG_TABLE_NAME = 'enrollments' THEN
    IF (NEW.student_id, NEW.course_id) IS DISTINCT FROM (OLD.student_id, OLD.course_id) THEN
      RAISE EXCEPTION 'Enrolment ownership is read-only' USING ERRCODE = '42501';
    END IF;
  ELSIF (NEW.user_id, NEW.course_id, NEW.payment_status, NEW.payment_id, NEW.enrollment_type,
         NEW.amount_paid, NEW.currency, NEW.admin_note)
        IS DISTINCT FROM
        (OLD.user_id, OLD.course_id, OLD.payment_status, OLD.payment_id, OLD.enrollment_type,
         OLD.amount_paid, OLD.currency, OLD.admin_note) THEN
    RAISE EXCEPTION 'Payment fields are read-only' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_enrollments ON enrollments;
CREATE TRIGGER trg_guard_enrollments
  BEFORE UPDATE ON enrollments
  FOR EACH ROW EXECUTE FUNCTION public.guard_enrollment_columns();

DROP TRIGGER IF EXISTS trg_guard_course_enrollments ON course_enrollments;
CREATE TRIGGER trg_guard_course_enrollments
  BEFORE UPDATE ON course_enrollments
  FOR EACH ROW EXECUTE FUNCTION public.guard_enrollment_columns();

-- ════════════════════════════════════════════════════════════════════════════
-- 4. Token / earnings functions
-- ════════════════════════════════════════════════════════════════════════════
ALTER FUNCTION public.add_student_tokens(uuid, integer) SET search_path = public;
ALTER FUNCTION public.add_teacher_tokens(uuid, integer) SET search_path = public;
ALTER FUNCTION public.record_teacher_earning(uuid, uuid, uuid, integer, text) SET search_path = public;
ALTER FUNCTION public.grant_org_tokens(uuid, integer, text) SET search_path = public;
ALTER FUNCTION public.notify_teacher_on_f2f_request() SET search_path = public;

-- Server-side only (edge functions use the service role).
REVOKE EXECUTE ON FUNCTION public.add_student_tokens(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.add_teacher_tokens(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_teacher_earning(uuid, uuid, uuid, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_student_tokens(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.add_teacher_tokens(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_teacher_earning(uuid, uuid, uuid, integer, text) TO service_role;

-- deduct_org_tokens is only called by the ai-generate function with the service role,
-- where auth.uid() is NULL. The previous version rejected every such call, so
-- organisations were never charged for AI usage.
CREATE OR REPLACE FUNCTION public.deduct_org_tokens(
  p_org_id uuid,
  p_user_id uuid,
  p_ai_task text,
  p_tokens integer,
  p_ai_log_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance integer;
BEGIN
  IF p_tokens IS NULL OR p_tokens <= 0 THEN
    RAISE EXCEPTION 'Invalid token amount';
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'Forbidden: p_user_id does not match authenticated user';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM org_members WHERE org_id = p_org_id AND user_id = p_user_id) THEN
    RAISE EXCEPTION 'Forbidden: user is not a member of this organisation';
  END IF;

  SELECT token_balance INTO v_balance FROM organizations WHERE id = p_org_id FOR UPDATE;
  IF v_balance IS NULL OR v_balance < p_tokens THEN
    RETURN false;
  END IF;

  UPDATE organizations
  SET token_balance = token_balance - p_tokens, updated_at = now()
  WHERE id = p_org_id;

  INSERT INTO token_usage_log (org_id, user_id, ai_task, tokens_deducted, ai_log_id)
  VALUES (p_org_id, p_user_id, p_ai_task, p_tokens, p_ai_log_id);

  RETURN true;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.deduct_org_tokens(uuid, uuid, text, integer, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.deduct_org_tokens(uuid, uuid, text, integer, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.deduct_student_tokens(
  p_user_id uuid,
  p_tokens integer,
  p_ai_task text,
  p_course_id uuid DEFAULT NULL,
  p_lesson_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance integer;
BEGIN
  -- A negative amount used to *add* tokens, and any user could drain anyone else.
  IF p_tokens IS NULL OR p_tokens <= 0 THEN
    RAISE EXCEPTION 'Invalid token amount';
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT token_balance INTO v_balance
  FROM student_ai_credits
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF v_balance IS NULL OR v_balance < p_tokens THEN
    RETURN false;
  END IF;

  UPDATE student_ai_credits
  SET token_balance = token_balance - p_tokens,
      total_used = total_used + p_tokens,
      updated_at = now()
  WHERE user_id = p_user_id;

  INSERT INTO student_ai_usage_logs (user_id, ai_task, tokens_used, course_id, lesson_id)
  VALUES (p_user_id, p_ai_task, p_tokens, p_course_id, p_lesson_id);

  RETURN true;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.deduct_student_tokens(uuid, integer, text, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.deduct_student_tokens(uuid, integer, text, uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_teacher_earnings_summary(p_teacher_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  -- Only the teacher themself or an admin may read earnings.
  IF auth.uid() IS NOT NULL
     AND auth.uid() <> p_teacher_id
     AND COALESCE(get_my_role(), '') <> 'admin' THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'total_gross_cents', COALESCE(SUM(gross_amount_cents), 0),
    'total_earned_cents', COALESCE(SUM(teacher_share_cents) FILTER (WHERE status != 'refunded'), 0),
    'available_cents', COALESCE(SUM(teacher_share_cents) FILTER (WHERE status = 'available'), 0),
    'paid_out_cents', COALESCE(SUM(teacher_share_cents) FILTER (WHERE status = 'paid_out'), 0),
    'total_sales', COUNT(*) FILTER (WHERE status != 'refunded'),
    'this_month_cents', COALESCE(SUM(teacher_share_cents) FILTER (
      WHERE status != 'refunded'
      AND created_at >= date_trunc('month', now())
    ), 0)
  ) INTO v_result
  FROM teacher_earnings
  WHERE teacher_id = p_teacher_id;

  RETURN v_result;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_teacher_earnings_summary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_teacher_earnings_summary(uuid) TO authenticated, service_role;

-- ════════════════════════════════════════════════════════════════════════════
-- 5. Balances, payments and earnings are written by the server only
-- ════════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Students can insert own credits" ON student_ai_credits;
DROP POLICY IF EXISTS "Students can update own credits" ON student_ai_credits;
DROP POLICY IF EXISTS "Teachers can insert own AI credits" ON teacher_ai_credits;
DROP POLICY IF EXISTS "Teachers can update own AI credits" ON teacher_ai_credits;
DROP POLICY IF EXISTS "System can insert earnings" ON teacher_earnings;
DROP POLICY IF EXISTS "System can insert payments" ON payments;
DROP POLICY IF EXISTS "Admins can insert payments" ON payments;
CREATE POLICY "Admins can insert payments"
  ON payments FOR INSERT TO authenticated
  WITH CHECK (get_my_role() = 'admin');

-- Notifications are created by the f2f_requests trigger; nobody inserts them directly.
DROP POLICY IF EXISTS "System can insert notifications" ON f2f_notifications;

-- ════════════════════════════════════════════════════════════════════════════
-- 6. Certificates
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.can_self_issue_certificate(p_course uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND has_course_access(p_course, auth.uid())
    -- every required lesson completed
    AND NOT EXISTS (
      SELECT 1 FROM lessons l
      WHERE l.course_id = p_course AND COALESCE(l.is_required, true)
        AND NOT EXISTS (
          SELECT 1 FROM lesson_progress lp
          WHERE lp.lesson_id = l.id
            AND auth.uid() IN (lp.student_id, lp.user_id)
            AND (lp.is_completed = true OR lp.status = 'completed')
        )
    )
    -- every required, published quiz passed
    AND NOT EXISTS (
      SELECT 1 FROM quizzes q
      WHERE q.course_id = p_course AND q.is_required AND q.is_published
        AND NOT EXISTS (
          SELECT 1 FROM quiz_attempts a
          WHERE a.quiz_id = q.id AND auth.uid() IN (a.student_id, a.user_id) AND a.passed
        )
    )
    -- every published exam finalised by the teacher
    AND NOT EXISTS (
      SELECT 1 FROM exams e
      WHERE e.course_id = p_course AND e.is_published
        AND NOT EXISTS (
          SELECT 1 FROM exam_submissions s
          WHERE s.exam_id = e.id AND s.student_id = auth.uid() AND s.status = 'finalised'
        )
    );
$$;
REVOKE EXECUTE ON FUNCTION public.can_self_issue_certificate(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_self_issue_certificate(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Students can insert own certificates" ON certificates;
CREATE POLICY "Students can insert own certificates"
  ON certificates FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = student_id
    AND COALESCE(revoked, false) = false
    AND public.can_self_issue_certificate(course_id)
  );

-- Teachers can issue certificates for their own courses (the Teacher > Certificates page).
DROP POLICY IF EXISTS "Teachers can issue certificates for own courses" ON certificates;
CREATE POLICY "Teachers can issue certificates for own courses"
  ON certificates FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM courses c WHERE c.id = certificates.course_id AND c.teacher_id = auth.uid())
  );

DROP POLICY IF EXISTS "Teachers can view certificates for own courses" ON certificates;
CREATE POLICY "Teachers can view certificates for own courses"
  ON certificates FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM courses c WHERE c.id = certificates.course_id AND c.teacher_id = auth.uid())
  );

-- ════════════════════════════════════════════════════════════════════════════
-- 7. Quizzes: server-side grading, attempt limits, hidden answer key
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.regrade_quiz_attempt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student uuid;
  v_course  uuid;
  v_pass    integer;
  v_max     integer;
  v_extra   integer;
  v_used    integer;
  v_total   integer;
  v_score   integer;
BEGIN
  -- Service role / SQL console inserts are trusted as-is.
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;

  v_student := auth.uid();

  SELECT course_id, COALESCE(pass_mark, pass_percentage, 60), COALESCE(max_attempts, 3)
    INTO v_course, v_pass, v_max
  FROM quizzes
  WHERE id = NEW.quiz_id AND is_published = true;

  IF NOT FOUND OR NOT has_course_access(v_course, v_student) THEN
    RAISE EXCEPTION 'You do not have access to this quiz' USING ERRCODE = '42501';
  END IF;

  -- Serialise attempts per student+quiz so two tabs cannot both take the last attempt.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_student::text || ':' || NEW.quiz_id::text, 0));

  SELECT COALESCE(SUM(extra_attempts), 0) INTO v_extra
  FROM quiz_extra_attempts
  WHERE quiz_id = NEW.quiz_id AND student_id = v_student;

  SELECT COUNT(*) INTO v_used
  FROM quiz_attempts
  WHERE quiz_id = NEW.quiz_id AND v_student IN (student_id, user_id);

  IF v_used >= v_max + v_extra THEN
    RAISE EXCEPTION 'No attempts remaining for this quiz' USING ERRCODE = 'P0001';
  END IF;

  -- Grade from the stored answer key; whatever score the browser sent is ignored.
  SELECT COALESCE(SUM(points), 0),
         COALESCE(SUM(points) FILTER (
           WHERE type <> 'short_answer'
             AND COALESCE(correct_answer, '') <> ''
             AND lower(btrim(NEW.answers->>(id::text))) = lower(btrim(correct_answer))
         ), 0)
    INTO v_total, v_score
  FROM quiz_questions
  WHERE quiz_id = NEW.quiz_id;

  NEW.student_id     := v_student;
  NEW.user_id        := NULL;
  NEW.course_id      := v_course;
  NEW.score          := v_score;
  NEW.total_points   := v_total;
  NEW.percentage     := CASE WHEN v_total > 0 THEN ROUND(v_score * 100.0 / v_total) ELSE 0 END;
  NEW.passed         := NEW.percentage >= v_pass;
  NEW.attempt_number := v_used + 1;
  NEW.submitted_at   := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_regrade_quiz_attempt ON quiz_attempts;
CREATE TRIGGER trg_regrade_quiz_attempt
  BEFORE INSERT ON quiz_attempts
  FOR EACH ROW EXECUTE FUNCTION public.regrade_quiz_attempt();

-- The answer key is only readable by the course's teacher and admins.
DROP POLICY IF EXISTS "Students can view questions of published quizzes" ON quiz_questions;
DROP POLICY IF EXISTS "Course staff can view quiz questions" ON quiz_questions;
CREATE POLICY "Course staff can view quiz questions"
  ON quiz_questions FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM quizzes q JOIN courses c ON c.id = q.course_id
      WHERE q.id = quiz_questions.quiz_id
        AND (c.teacher_id = auth.uid() OR get_my_role() = 'admin')
    )
  );

-- Students load questions through this function, which never returns the answers.
CREATE OR REPLACE FUNCTION public.get_quiz_questions(p_quiz_id uuid)
RETURNS TABLE (
  id uuid,
  quiz_id uuid,
  question text,
  type text,
  options jsonb,
  points integer,
  order_index integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT qq.id, qq.quiz_id, qq.question, qq.type, qq.options, qq.points, qq.order_index
  FROM quiz_questions qq
  JOIN quizzes q ON q.id = qq.quiz_id
  WHERE qq.quiz_id = p_quiz_id
    AND auth.uid() IS NOT NULL
    AND q.is_published = true
    AND has_course_access(q.course_id, auth.uid())
  ORDER BY qq.order_index;
$$;
REVOKE EXECUTE ON FUNCTION public.get_quiz_questions(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_quiz_questions(uuid) TO authenticated, service_role;

-- ════════════════════════════════════════════════════════════════════════════
-- 8. Exams and assignments: students cannot grade themselves
-- ════════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Students can insert their own submissions" ON exam_submissions;
CREATE POLICY "Students can insert their own submissions"
  ON exam_submissions FOR INSERT TO authenticated
  WITH CHECK (
    student_id = auth.uid()
    AND status = 'submitted'
    AND total_score IS NULL
    AND percentage IS NULL
    AND COALESCE(ai_scores, '{}'::jsonb) = '{}'::jsonb
    AND COALESCE(teacher_scores, '{}'::jsonb) = '{}'::jsonb
    AND COALESCE(final_scores, '{}'::jsonb) = '{}'::jsonb
    AND EXISTS (
      SELECT 1 FROM exams e
      WHERE e.id = exam_submissions.exam_id
        AND e.is_published = true
        AND e.course_id = exam_submissions.course_id
        AND has_course_access(e.course_id)
    )
  );

DROP POLICY IF EXISTS "Teachers can update submissions for their exams" ON exam_submissions;
CREATE POLICY "Teachers can update submissions for their exams"
  ON exam_submissions FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM exams e
      WHERE e.id = exam_submissions.exam_id
        AND (e.teacher_id = auth.uid()
             OR EXISTS (SELECT 1 FROM courses c WHERE c.id = e.course_id AND c.teacher_id = auth.uid())
             OR get_my_role() = 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM exams e
      WHERE e.id = exam_submissions.exam_id
        AND (e.teacher_id = auth.uid()
             OR EXISTS (SELECT 1 FROM courses c WHERE c.id = e.course_id AND c.teacher_id = auth.uid())
             OR get_my_role() = 'admin')
    )
  );

DROP POLICY IF EXISTS "Students can submit assignments" ON assignment_submissions;
CREATE POLICY "Students can submit assignments"
  ON assignment_submissions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = student_id AND status = 'submitted' AND grade IS NULL AND graded_at IS NULL);

DROP POLICY IF EXISTS "Students can update own submissions" ON assignment_submissions;
CREATE POLICY "Students can update own submissions"
  ON assignment_submissions FOR UPDATE TO authenticated
  USING (auth.uid() = student_id AND status = 'submitted' AND grade IS NULL)
  WITH CHECK (auth.uid() = student_id AND status = 'submitted' AND grade IS NULL AND graded_at IS NULL);

-- ════════════════════════════════════════════════════════════════════════════
-- 9. Organisations: billing fields are admin-only
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.guard_org_billing_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR get_my_role() = 'admin' THEN RETURN NEW; END IF;
  IF (NEW.token_balance, NEW.plan_tier, NEW.feature_flags, NEW.is_active, NEW.stripe_customer_id, NEW.slug)
     IS DISTINCT FROM
     (OLD.token_balance, OLD.plan_tier, OLD.feature_flags, OLD.is_active, OLD.stripe_customer_id, OLD.slug) THEN
    RAISE EXCEPTION 'Billing fields are read-only' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_org_billing ON organizations;
CREATE TRIGGER trg_guard_org_billing
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION public.guard_org_billing_columns();

-- ════════════════════════════════════════════════════════════════════════════
-- 10. Sections / lessons: org admins only manage their own organisation's courses
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.can_manage_course(p_course_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM courses c
    WHERE c.id = p_course_id
      AND (
        c.teacher_id = auth.uid()
        OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
        OR (c.org_id IS NOT NULL AND EXISTS (
              SELECT 1 FROM org_members om
              JOIN profiles p ON p.id = om.user_id
              WHERE om.user_id = auth.uid() AND om.org_id = c.org_id AND p.role = 'org_admin'))
      )
  );
$$;
REVOKE EXECUTE ON FUNCTION public.can_manage_course(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_course(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Teachers can manage own course sections" ON sections;
CREATE POLICY "Teachers can manage own course sections"
  ON sections FOR INSERT TO authenticated
  WITH CHECK (can_manage_course(course_id));

DROP POLICY IF EXISTS "Teachers can update own sections" ON sections;
CREATE POLICY "Teachers can update own sections"
  ON sections FOR UPDATE TO authenticated
  USING (can_manage_course(course_id))
  WITH CHECK (can_manage_course(course_id));

DROP POLICY IF EXISTS "Teachers can delete own sections" ON sections;
CREATE POLICY "Teachers can delete own sections"
  ON sections FOR DELETE TO authenticated
  USING (can_manage_course(course_id));

DROP POLICY IF EXISTS "Teachers can manage own course lessons insert" ON lessons;
CREATE POLICY "Teachers can manage own course lessons insert"
  ON lessons FOR INSERT TO authenticated
  WITH CHECK (can_manage_course(course_id));

DROP POLICY IF EXISTS "Teachers can update own course lessons" ON lessons;
CREATE POLICY "Teachers can update own course lessons"
  ON lessons FOR UPDATE TO authenticated
  USING (can_manage_course(course_id))
  WITH CHECK (can_manage_course(course_id));

DROP POLICY IF EXISTS "Teachers can delete own course lessons" ON lessons;
CREATE POLICY "Teachers can delete own course lessons"
  ON lessons FOR DELETE TO authenticated
  USING (can_manage_course(course_id));

-- ════════════════════════════════════════════════════════════════════════════
-- 11. Org-owner policies that compared org_members.org_id with itself
-- ════════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Org owners can add students to their org" ON org_students;
CREATE POLICY "Org owners can add students to their org"
  ON org_students FOR INSERT TO authenticated
  WITH CHECK (is_org_owner(org_students.org_id));

DROP POLICY IF EXISTS "Org owners can insert token purchases for their org" ON token_purchases;
CREATE POLICY "Org owners can insert token purchases for their org"
  ON token_purchases FOR INSERT TO authenticated
  WITH CHECK (is_org_owner(token_purchases.org_id) AND status = 'pending');

-- ════════════════════════════════════════════════════════════════════════════
-- 12. Content access follows payment status (refunded / pending lose access)
-- ════════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Students can read documents for enrolled courses" ON lesson_documents;
CREATE POLICY "Students can read documents for enrolled courses"
  ON lesson_documents FOR SELECT TO authenticated
  USING (has_course_access(lesson_documents.course_id));

DROP POLICY IF EXISTS "Students can read activities for enrolled courses" ON lesson_activities;
CREATE POLICY "Students can read activities for enrolled courses"
  ON lesson_activities FOR SELECT TO authenticated
  USING (
    has_course_access(lesson_activities.course_id)
    OR EXISTS (
      SELECT 1 FROM courses c
      WHERE c.id = lesson_activities.course_id
        AND (c.teacher_id = auth.uid() OR get_my_role() = 'admin')
    )
  );

DROP POLICY IF EXISTS "Students can view published exams for enrolled courses" ON exams;
CREATE POLICY "Students can view published exams for enrolled courses"
  ON exams FOR SELECT TO authenticated
  USING (is_published = true AND has_course_access(exams.course_id));

DROP POLICY IF EXISTS "Authenticated users can read exam questions" ON exam_questions;
CREATE POLICY "Authenticated users can read exam questions"
  ON exam_questions FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM exams e
      WHERE e.id = exam_questions.exam_id
        AND (
          e.teacher_id = auth.uid()
          OR EXISTS (SELECT 1 FROM courses c WHERE c.id = e.course_id AND c.teacher_id = auth.uid())
          OR get_my_role() = 'admin'
          OR (e.is_published = true AND has_course_access(e.course_id))
        )
    )
  );

-- ════════════════════════════════════════════════════════════════════════════
-- 13. Stripe: fulfil each checkout session exactly once
-- ════════════════════════════════════════════════════════════════════════════
-- AI-plan purchases have no course, so the payment row must allow a NULL course.
ALTER TABLE payments ALTER COLUMN course_id DROP NOT NULL;

CREATE TABLE IF NOT EXISTS stripe_fulfillments (
  session_id   text PRIMARY KEY,
  user_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  kind         text NOT NULL CHECK (kind IN ('course', 'ai_plan')),
  course_id    uuid REFERENCES courses(id) ON DELETE SET NULL,
  tokens       integer NOT NULL DEFAULT 0,
  amount_cents integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE stripe_fulfillments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view stripe fulfillments" ON stripe_fulfillments;
CREATE POLICY "Admins can view stripe fulfillments"
  ON stripe_fulfillments FOR SELECT TO authenticated
  USING (get_my_role() = 'admin');

/*
  Called by the stripe-webhook and stripe-verify-session functions (service role only).
  Both may see the same session, and the browser can replay verify-session, so the
  session id is claimed first; everything else happens only for the first caller, in
  one transaction. Returns true when this call did the fulfilment, false when the
  session had already been fulfilled.
*/
CREATE OR REPLACE FUNCTION public.fulfill_stripe_session(
  p_session_id     text,
  p_user_id        uuid,
  p_kind           text,
  p_course_id      uuid DEFAULT NULL,
  p_teacher_id     uuid DEFAULT NULL,
  p_tokens         integer DEFAULT 0,
  p_amount_cents   integer DEFAULT 0,
  p_payment_intent text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claimed integer;
BEGIN
  IF p_session_id IS NULL OR p_session_id = '' OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'session id and user id are required';
  END IF;
  IF p_kind NOT IN ('course', 'ai_plan') THEN
    RAISE EXCEPTION 'unknown purchase kind %', p_kind;
  END IF;

  INSERT INTO stripe_fulfillments (session_id, user_id, kind, course_id, tokens, amount_cents)
  VALUES (p_session_id, p_user_id, p_kind, p_course_id, COALESCE(p_tokens, 0), COALESCE(p_amount_cents, 0))
  ON CONFLICT (session_id) DO NOTHING;
  GET DIAGNOSTICS v_claimed = ROW_COUNT;
  IF v_claimed = 0 THEN
    RETURN false;
  END IF;

  IF p_kind = 'ai_plan' THEN
    IF COALESCE(p_tokens, 0) <= 0 THEN
      RAISE EXCEPTION 'token amount must be positive';
    END IF;
    PERFORM add_student_tokens(p_user_id, p_tokens);
  ELSE
    IF p_course_id IS NULL THEN
      RAISE EXCEPTION 'course id is required for a course purchase';
    END IF;

    INSERT INTO course_enrollments (user_id, course_id, enrollment_type, payment_status, payment_id, amount_paid, currency)
    VALUES (p_user_id, p_course_id, 'paid', 'completed', COALESCE(p_payment_intent, ''), COALESCE(p_amount_cents, 0) / 100.0, 'AUD')
    ON CONFLICT (user_id, course_id) DO UPDATE SET
      enrollment_type = 'paid',
      payment_status  = 'completed',
      payment_id      = EXCLUDED.payment_id,
      amount_paid     = EXCLUDED.amount_paid,
      currency        = EXCLUDED.currency;   -- progress and enrolled_at are kept

    INSERT INTO enrollments (student_id, course_id)
    VALUES (p_user_id, p_course_id)
    ON CONFLICT (student_id, course_id) DO NOTHING;

    IF p_teacher_id IS NOT NULL AND COALESCE(p_amount_cents, 0) > 0
       AND EXISTS (SELECT 1 FROM profiles WHERE id = p_teacher_id) THEN
      PERFORM record_teacher_earning(p_teacher_id, p_course_id, p_user_id, p_amount_cents, p_payment_intent);
    END IF;
  END IF;

  INSERT INTO payments (user_id, course_id, amount, currency, status, stripe_session_id, stripe_payment_id)
  SELECT p_user_id, CASE WHEN p_kind = 'course' THEN p_course_id END, COALESCE(p_amount_cents, 0) / 100.0,
         'AUD', 'completed', p_session_id, p_payment_intent
  WHERE NOT EXISTS (SELECT 1 FROM payments WHERE stripe_session_id = p_session_id);

  RETURN true;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fulfill_stripe_session(text, uuid, text, uuid, uuid, integer, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fulfill_stripe_session(text, uuid, text, uuid, uuid, integer, integer, text) TO service_role;
