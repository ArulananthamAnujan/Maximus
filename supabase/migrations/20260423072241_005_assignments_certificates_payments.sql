/*
  # Assignments, Certificates, and Payments

  1. New Tables
    - assignments — course assignments with due dates
    - assignment_submissions — student submissions for assignments
    - certificates — awarded certificates on course completion
    - payments — payment records linked to enrollments
    - promo_codes — discount codes for courses

  2. Security
    - RLS on all tables
    - Students can only access their own data
    - Certificates allow anonymous SELECT for public verification page
    - Teachers can manage assignments for their courses
*/

-- ─── assignments ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS assignments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id    uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  teacher_id   uuid REFERENCES profiles(id) ON DELETE SET NULL,
  title        text NOT NULL DEFAULT '',
  description  text DEFAULT '',
  due_date     timestamptz,
  total_points integer DEFAULT 100,
  is_published boolean DEFAULT false,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'assignments_updated_at') THEN
    CREATE TRIGGER assignments_updated_at
      BEFORE UPDATE ON assignments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_assignments_course_id  ON assignments(course_id);
CREATE INDEX IF NOT EXISTS idx_assignments_teacher_id ON assignments(teacher_id);
CREATE INDEX IF NOT EXISTS idx_assignments_due_date   ON assignments(due_date);

ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enrolled students can view published assignments"
  ON assignments FOR SELECT TO authenticated
  USING (
    is_published = true AND has_course_access(assignments.course_id)
  );

CREATE POLICY "Teachers can view all course assignments"
  ON assignments FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM courses c WHERE c.id = assignments.course_id AND (c.teacher_id = auth.uid() OR get_user_role() = 'admin'))
  );

CREATE POLICY "Teachers can insert course assignments"
  ON assignments FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = teacher_id AND get_user_role() IN ('teacher','admin')
  );

CREATE POLICY "Teachers can update course assignments"
  ON assignments FOR UPDATE TO authenticated
  USING (auth.uid() = teacher_id OR get_user_role() = 'admin')
  WITH CHECK (auth.uid() = teacher_id OR get_user_role() = 'admin');

CREATE POLICY "Teachers can delete course assignments"
  ON assignments FOR DELETE TO authenticated
  USING (auth.uid() = teacher_id OR get_user_role() = 'admin');

-- ─── assignment_submissions ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS assignment_submissions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id  uuid NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  student_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content        text DEFAULT '',
  file_url       text DEFAULT '',
  grade          integer,
  feedback       text DEFAULT '',
  status         text DEFAULT 'submitted' CHECK (status IN ('submitted','graded','returned')),
  submitted_at   timestamptz DEFAULT now(),
  graded_at      timestamptz,
  UNIQUE (assignment_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_submissions_assignment ON assignment_submissions(assignment_id);
CREATE INDEX IF NOT EXISTS idx_submissions_student    ON assignment_submissions(student_id);

ALTER TABLE assignment_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students can view own submissions"
  ON assignment_submissions FOR SELECT TO authenticated
  USING (auth.uid() = student_id);

CREATE POLICY "Teachers can view all submissions"
  ON assignment_submissions FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM assignments a
      JOIN courses c ON c.id = a.course_id
      WHERE a.id = assignment_submissions.assignment_id
        AND (c.teacher_id = auth.uid() OR get_user_role() = 'admin')
    )
  );

CREATE POLICY "Students can submit assignments"
  ON assignment_submissions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = student_id);

CREATE POLICY "Students can update own submissions"
  ON assignment_submissions FOR UPDATE TO authenticated
  USING (auth.uid() = student_id AND status = 'submitted')
  WITH CHECK (auth.uid() = student_id);

CREATE POLICY "Teachers can grade submissions"
  ON assignment_submissions FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM assignments a
      JOIN courses c ON c.id = a.course_id
      WHERE a.id = assignment_submissions.assignment_id
        AND (c.teacher_id = auth.uid() OR get_user_role() = 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM assignments a
      JOIN courses c ON c.id = a.course_id
      WHERE a.id = assignment_submissions.assignment_id
        AND (c.teacher_id = auth.uid() OR get_user_role() = 'admin')
    )
  );

-- ─── certificates ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS certificates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  course_id       uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  certificate_url text DEFAULT '',
  issued_at       timestamptz DEFAULT now(),
  revoked         boolean DEFAULT false,
  revoked_at      timestamptz,
  verification_code text UNIQUE DEFAULT encode(gen_random_bytes(8), 'hex'),
  UNIQUE (student_id, course_id)
);

CREATE INDEX IF NOT EXISTS idx_certificates_student  ON certificates(student_id);
CREATE INDEX IF NOT EXISTS idx_certificates_course   ON certificates(course_id);
CREATE INDEX IF NOT EXISTS idx_certificates_verify   ON certificates(verification_code);

ALTER TABLE certificates ENABLE ROW LEVEL SECURITY;

-- Allow anyone to verify a certificate by verification_code
CREATE POLICY "Anyone can verify certificates"
  ON certificates FOR SELECT
  USING (revoked = false);

CREATE POLICY "Students can view own certificates"
  ON certificates FOR SELECT TO authenticated
  USING (auth.uid() = student_id);

CREATE POLICY "Admins can manage certificates"
  ON certificates FOR INSERT TO authenticated
  WITH CHECK (get_user_role() = 'admin');

CREATE POLICY "Admins can update certificates"
  ON certificates FOR UPDATE TO authenticated
  USING (get_user_role() = 'admin')
  WITH CHECK (get_user_role() = 'admin');

-- ─── payments ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  course_id         uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  enrollment_id     uuid REFERENCES course_enrollments(id) ON DELETE SET NULL,
  stripe_session_id text DEFAULT '',
  stripe_payment_id text DEFAULT '',
  amount            numeric NOT NULL DEFAULT 0,
  currency          text DEFAULT 'aud',
  status            text DEFAULT 'pending' CHECK (status IN ('pending','completed','failed','refunded')),
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'payments_updated_at') THEN
    CREATE TRIGGER payments_updated_at
      BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_payments_user_id   ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_course_id ON payments(course_id);
CREATE INDEX IF NOT EXISTS idx_payments_status    ON payments(status);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own payments"
  ON payments FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all payments"
  ON payments FOR SELECT TO authenticated
  USING (get_user_role() = 'admin');

CREATE POLICY "System can insert payments"
  ON payments FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id OR get_user_role() = 'admin');

CREATE POLICY "Admins can update payments"
  ON payments FOR UPDATE TO authenticated
  USING (get_user_role() = 'admin')
  WITH CHECK (get_user_role() = 'admin');

-- ─── promo_codes ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS promo_codes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code             text UNIQUE NOT NULL,
  discount_type    text DEFAULT 'percentage' CHECK (discount_type IN ('percentage','fixed')),
  discount_value   numeric NOT NULL DEFAULT 0,
  max_uses         integer DEFAULT 0,
  used_count       integer DEFAULT 0,
  valid_from       timestamptz DEFAULT now(),
  valid_until      timestamptz,
  course_id        uuid REFERENCES courses(id) ON DELETE SET NULL,
  is_active        boolean DEFAULT true,
  created_at       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_promo_codes_code ON promo_codes(code);

ALTER TABLE promo_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can look up promo codes"
  ON promo_codes FOR SELECT TO authenticated
  USING (is_active = true AND (valid_until IS NULL OR valid_until > now()));

CREATE POLICY "Admins can manage promo codes"
  ON promo_codes FOR INSERT TO authenticated
  WITH CHECK (get_user_role() = 'admin');

CREATE POLICY "Admins can update promo codes"
  ON promo_codes FOR UPDATE TO authenticated
  USING (get_user_role() = 'admin')
  WITH CHECK (get_user_role() = 'admin');

CREATE POLICY "Admins can delete promo codes"
  ON promo_codes FOR DELETE TO authenticated
  USING (get_user_role() = 'admin');
