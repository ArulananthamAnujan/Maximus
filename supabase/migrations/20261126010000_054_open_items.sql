/*
  # 054 — Closing the remaining open items

  1. Promo codes: columns the app actually uses, server-side validation, real discounts.
  2. Stripe fulfilment: teacher AI plans and promo-code redemption.
  3. Student token charging is server-only.
  4. Exam model answers are hidden from students.
  5. Course videos / documents become private (served through signed links).
  6. Business number (ABN) setting for certificates.

  Deploy the frontend BEFORE applying this migration: the new frontend works with both
  public and private storage, the old one only with public storage.
  Every statement is idempotent.
*/

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Promo codes
-- ════════════════════════════════════════════════════════════════════════════
-- The admin page and checkout read/write these column names; the table was created
-- with different ones (discount_value, valid_until, max_uses, used_count), so promo
-- codes could not be created or applied.
ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS discount_percent integer;
ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS expires_at timestamptz;
ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS usage_limit integer;
ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS usage_count integer NOT NULL DEFAULT 0;
ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES profiles(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'promo_codes' AND column_name = 'discount_value') THEN
    UPDATE promo_codes
    SET discount_percent = LEAST(GREATEST(ROUND(discount_value)::integer, 0), 100)
    WHERE discount_percent IS NULL AND COALESCE(discount_type, 'percentage') = 'percentage';
    -- Fixed-amount codes are not supported by checkout; switch them off rather than guess.
    UPDATE promo_codes SET is_active = false
    WHERE discount_percent IS NULL AND COALESCE(discount_type, 'percentage') <> 'percentage';
    ALTER TABLE promo_codes ALTER COLUMN discount_value SET DEFAULT 0;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'promo_codes' AND column_name = 'valid_until') THEN
    UPDATE promo_codes SET expires_at = valid_until WHERE expires_at IS NULL AND valid_until IS NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'promo_codes' AND column_name = 'max_uses') THEN
    UPDATE promo_codes SET usage_limit = NULLIF(max_uses, 0) WHERE usage_limit IS NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'promo_codes' AND column_name = 'used_count') THEN
    UPDATE promo_codes SET usage_count = COALESCE(used_count, 0) WHERE usage_count = 0;
  END IF;
END $$;

UPDATE promo_codes SET discount_percent = 0 WHERE discount_percent IS NULL;
ALTER TABLE promo_codes ALTER COLUMN discount_percent SET DEFAULT 10;
ALTER TABLE promo_codes ALTER COLUMN discount_percent SET NOT NULL;
ALTER TABLE promo_codes DROP CONSTRAINT IF EXISTS promo_codes_discount_percent_range;
ALTER TABLE promo_codes ADD CONSTRAINT promo_codes_discount_percent_range CHECK (discount_percent BETWEEN 0 AND 100);

-- Only admins can list codes; everyone else checks one code at a time via the function.
DROP POLICY IF EXISTS "Authenticated users can look up promo codes" ON promo_codes;
DROP POLICY IF EXISTS "Admins can view promo codes" ON promo_codes;
CREATE POLICY "Admins can view promo codes"
  ON promo_codes FOR SELECT TO authenticated
  USING (get_my_role() = 'admin');

CREATE OR REPLACE FUNCTION public.validate_promo_code(p_code text, p_course_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Returns the percentage off, or NULL when the code cannot be used.
  SELECT discount_percent
  FROM promo_codes
  WHERE code = upper(btrim(p_code))
    AND is_active = true
    AND discount_percent > 0
    AND (expires_at IS NULL OR expires_at > now())
    AND (usage_limit IS NULL OR usage_count < usage_limit)
    AND (course_id IS NULL OR p_course_id IS NULL OR course_id = p_course_id);
$$;
REVOKE EXECUTE ON FUNCTION public.validate_promo_code(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.validate_promo_code(text, uuid) TO authenticated, service_role;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Stripe fulfilment: teacher AI plans + promo redemption
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE stripe_fulfillments DROP CONSTRAINT IF EXISTS stripe_fulfillments_kind_check;
ALTER TABLE stripe_fulfillments ADD CONSTRAINT stripe_fulfillments_kind_check
  CHECK (kind IN ('course', 'ai_plan', 'teacher_ai_plan'));
ALTER TABLE stripe_fulfillments ADD COLUMN IF NOT EXISTS promo_code text;

DROP FUNCTION IF EXISTS public.fulfill_stripe_session(text, uuid, text, uuid, uuid, integer, integer, text);

CREATE OR REPLACE FUNCTION public.fulfill_stripe_session(
  p_session_id     text,
  p_user_id        uuid,
  p_kind           text,
  p_course_id      uuid DEFAULT NULL,
  p_teacher_id     uuid DEFAULT NULL,
  p_tokens         integer DEFAULT 0,
  p_amount_cents   integer DEFAULT 0,
  p_payment_intent text DEFAULT NULL,
  p_promo_code     text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claimed integer;
  v_promo   text := NULLIF(upper(btrim(COALESCE(p_promo_code, ''))), '');
BEGIN
  IF p_session_id IS NULL OR p_session_id = '' OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'session id and user id are required';
  END IF;
  IF p_kind NOT IN ('course', 'ai_plan', 'teacher_ai_plan') THEN
    RAISE EXCEPTION 'unknown purchase kind %', p_kind;
  END IF;

  -- Claim the session first: only the first caller goes any further.
  INSERT INTO stripe_fulfillments (session_id, user_id, kind, course_id, tokens, amount_cents, promo_code)
  VALUES (p_session_id, p_user_id, p_kind, p_course_id, COALESCE(p_tokens, 0), COALESCE(p_amount_cents, 0), v_promo)
  ON CONFLICT (session_id) DO NOTHING;
  GET DIAGNOSTICS v_claimed = ROW_COUNT;
  IF v_claimed = 0 THEN
    RETURN false;
  END IF;

  IF p_kind IN ('ai_plan', 'teacher_ai_plan') THEN
    IF COALESCE(p_tokens, 0) <= 0 THEN
      RAISE EXCEPTION 'token amount must be positive';
    END IF;
    IF p_kind = 'ai_plan' THEN
      PERFORM add_student_tokens(p_user_id, p_tokens);
    ELSE
      PERFORM add_teacher_tokens(p_user_id, p_tokens);
    END IF;
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

  IF v_promo IS NOT NULL THEN
    UPDATE promo_codes SET usage_count = usage_count + 1 WHERE code = v_promo;
  END IF;

  INSERT INTO payments (user_id, course_id, amount, currency, status, stripe_session_id, stripe_payment_id)
  SELECT p_user_id, CASE WHEN p_kind = 'course' THEN p_course_id END, COALESCE(p_amount_cents, 0) / 100.0,
         'AUD', 'completed', p_session_id, p_payment_intent
  WHERE NOT EXISTS (SELECT 1 FROM payments WHERE stripe_session_id = p_session_id);

  RETURN true;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fulfill_stripe_session(text, uuid, text, uuid, uuid, integer, integer, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fulfill_stripe_session(text, uuid, text, uuid, uuid, integer, integer, text, text) TO service_role;

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Student tokens are charged by the ai-generate function, not the browser
-- ════════════════════════════════════════════════════════════════════════════
REVOKE EXECUTE ON FUNCTION public.deduct_student_tokens(uuid, integer, text, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.deduct_student_tokens(uuid, integer, text, uuid, uuid) TO service_role;

-- ════════════════════════════════════════════════════════════════════════════
-- 4. Exam questions: students never receive the model answers
-- ════════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Authenticated users can read exam questions" ON exam_questions;
DROP POLICY IF EXISTS "Course staff can read exam questions" ON exam_questions;
CREATE POLICY "Course staff can read exam questions"
  ON exam_questions FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM exams e
      WHERE e.id = exam_questions.exam_id
        AND (
          e.teacher_id = auth.uid()
          OR EXISTS (SELECT 1 FROM courses c WHERE c.id = e.course_id AND c.teacher_id = auth.uid())
          OR get_my_role() = 'admin'
        )
    )
  );

CREATE OR REPLACE FUNCTION public.get_exam_questions(p_exam_ids uuid[])
RETURNS TABLE (
  id uuid,
  exam_id uuid,
  question text,
  marks integer,
  order_index integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT q.id, q.exam_id, q.question, q.marks, q.order_index
  FROM exam_questions q
  JOIN exams e ON e.id = q.exam_id
  WHERE q.exam_id = ANY (p_exam_ids)
    AND auth.uid() IS NOT NULL
    AND e.is_published = true
    AND has_course_access(e.course_id, auth.uid())
  ORDER BY q.exam_id, q.order_index;
$$;
REVOKE EXECUTE ON FUNCTION public.get_exam_questions(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_exam_questions(uuid[]) TO authenticated, service_role;

-- ════════════════════════════════════════════════════════════════════════════
-- 5. Private course media
-- ════════════════════════════════════════════════════════════════════════════
-- Files live at <course_id>/<file>. Reading now needs course access (or a free-preview
-- lesson pointing at the file); the app turns stored links into short-lived signed links.
UPDATE storage.buckets SET public = false
WHERE id IN ('course-videos', 'course-documents', 'course-materials');

CREATE OR REPLACE FUNCTION public.can_read_course_media(p_bucket text, p_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1 FROM courses c
      WHERE c.id::text = split_part(p_name, '/', 1)
        AND auth.uid() IS NOT NULL
        AND (has_course_access(c.id, auth.uid()) OR can_manage_course(c.id))
    )
    OR EXISTS (
      -- free-preview lessons of published courses are open to everyone
      SELECT 1 FROM lessons l
      JOIN courses c ON c.id = l.course_id
      WHERE l.is_preview = true
        AND c.is_published = true
        AND c.id::text = split_part(p_name, '/', 1)
        AND (l.url LIKE '%/' || p_bucket || '/' || p_name || '%'
             OR l.video_url LIKE '%/' || p_bucket || '/' || p_name || '%'
             OR l.file_url LIKE '%/' || p_bucket || '/' || p_name || '%')
    );
$$;
GRANT EXECUTE ON FUNCTION public.can_read_course_media(text, text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.can_write_course_media(p_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM courses c
    WHERE c.id::text = split_part(p_name, '/', 1) AND can_manage_course(c.id)
  );
$$;
REVOKE EXECUTE ON FUNCTION public.can_write_course_media(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_write_course_media(text) TO authenticated, service_role;

-- Old "anyone logged in can read / upload / delete" policies, under every name they had.
DROP POLICY IF EXISTS "Anyone authenticated can read videos" ON storage.objects;
DROP POLICY IF EXISTS "Anyone authenticated can read documents" ON storage.objects;
DROP POLICY IF EXISTS "Enrolled users can view course videos" ON storage.objects;
DROP POLICY IF EXISTS "Enrolled users can view course materials" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload thumbnails" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update thumbnails" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete thumbnails" ON storage.objects;

DROP POLICY IF EXISTS "Course members can read course media" ON storage.objects;
CREATE POLICY "Course members can read course media"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (
    bucket_id IN ('course-videos', 'course-documents', 'course-materials')
    AND public.can_read_course_media(bucket_id, name)
  );

DROP POLICY IF EXISTS "Course staff can upload course media" ON storage.objects;
CREATE POLICY "Course staff can upload course media"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id IN ('course-videos', 'course-documents', 'course-materials')
    AND public.can_write_course_media(name)
  );

DROP POLICY IF EXISTS "Course staff can update course media" ON storage.objects;
CREATE POLICY "Course staff can update course media"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id IN ('course-videos', 'course-documents', 'course-materials') AND public.can_write_course_media(name))
  WITH CHECK (bucket_id IN ('course-videos', 'course-documents', 'course-materials') AND public.can_write_course_media(name));

DROP POLICY IF EXISTS "Course staff can delete course media" ON storage.objects;
CREATE POLICY "Course staff can delete course media"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id IN ('course-videos', 'course-documents', 'course-materials') AND public.can_write_course_media(name));

-- Thumbnails and the site logo stay public to view, but only staff can change them.
DROP POLICY IF EXISTS "Staff manage thumbnails insert" ON storage.objects;
CREATE POLICY "Staff manage thumbnails insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'course-thumbnails' AND public.get_my_role() IN ('admin', 'teacher', 'org_admin'));

DROP POLICY IF EXISTS "Staff manage thumbnails update" ON storage.objects;
CREATE POLICY "Staff manage thumbnails update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'course-thumbnails' AND public.get_my_role() IN ('admin', 'teacher', 'org_admin'))
  WITH CHECK (bucket_id = 'course-thumbnails' AND public.get_my_role() IN ('admin', 'teacher', 'org_admin'));

DROP POLICY IF EXISTS "Staff manage thumbnails delete" ON storage.objects;
CREATE POLICY "Staff manage thumbnails delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'course-thumbnails' AND public.get_my_role() IN ('admin', 'teacher', 'org_admin'));

-- ════════════════════════════════════════════════════════════════════════════
-- 6. Business number shown on certificates (blank = line is left off)
-- ════════════════════════════════════════════════════════════════════════════
INSERT INTO site_settings (key, value)
SELECT 'abn', ''
WHERE NOT EXISTS (SELECT 1 FROM site_settings WHERE key = 'abn');
