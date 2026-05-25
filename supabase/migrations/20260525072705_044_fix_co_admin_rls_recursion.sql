/*
  # Fix co_admin RLS policies — remove infinite recursion

  ## Problem
  The co_admin policies used EXISTS (SELECT 1 FROM profiles WHERE ...) inside
  a profiles RLS policy, causing infinite recursion and breaking profile loads
  for ALL users including admins.

  ## Fix
  Replace the self-referential EXISTS subqueries with get_my_role() which is
  what all other existing policies use. get_my_role() is a SECURITY DEFINER
  function that bypasses RLS when reading the role, avoiding recursion.

  Also extend the existing admin policies to also allow co_admin where appropriate.
*/

-- Drop the broken co_admin policies on profiles
DROP POLICY IF EXISTS "Co-admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Co-admins can update profiles" ON profiles;

-- Extend "Admins can view all profiles" to also cover co_admin
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
CREATE POLICY "Admins can view all profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (get_my_role() = ANY (ARRAY['admin', 'co_admin']));

-- Extend "Admins can update any profile" to also cover co_admin
DROP POLICY IF EXISTS "Admins can update any profile" ON profiles;
CREATE POLICY "Admins can update any profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (get_my_role() = ANY (ARRAY['admin', 'co_admin']))
  WITH CHECK (get_my_role() = ANY (ARRAY['admin', 'co_admin']));

-- Fix co_admin policies on other tables — replace EXISTS subqueries with get_my_role()

-- certificates
DROP POLICY IF EXISTS "Co-admins can view certificates" ON certificates;
CREATE POLICY "Co-admins can view certificates"
  ON certificates FOR SELECT
  TO authenticated
  USING (get_my_role() = ANY (ARRAY['admin', 'co_admin']));

-- payments
DROP POLICY IF EXISTS "Co-admins can view payments" ON payments;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'payments' AND policyname = 'Co-admins can view payments'
  ) THEN
    CREATE POLICY "Co-admins can view payments"
      ON payments FOR SELECT
      TO authenticated
      USING (get_my_role() = ANY (ARRAY['admin', 'co_admin']));
  END IF;
END $$;

-- course_enrollments view
DROP POLICY IF EXISTS "Co-admins can view course enrollments" ON course_enrollments;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'course_enrollments' AND policyname = 'Co-admins can view course enrollments'
  ) THEN
    CREATE POLICY "Co-admins can view course enrollments"
      ON course_enrollments FOR SELECT
      TO authenticated
      USING (get_my_role() = ANY (ARRAY['admin', 'co_admin']));
  END IF;
END $$;

-- course_enrollments insert
DROP POLICY IF EXISTS "Co-admins can insert course enrollments" ON course_enrollments;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'course_enrollments' AND policyname = 'Co-admins can insert course enrollments'
  ) THEN
    CREATE POLICY "Co-admins can insert course enrollments"
      ON course_enrollments FOR INSERT
      TO authenticated
      WITH CHECK (get_my_role() = ANY (ARRAY['admin', 'co_admin']));
  END IF;
END $$;

-- enrollments view for co_admin
DROP POLICY IF EXISTS "Co-admins can view enrollments" ON enrollments;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'enrollments' AND policyname = 'Co-admins can view enrollments'
  ) THEN
    CREATE POLICY "Co-admins can view enrollments"
      ON enrollments FOR SELECT
      TO authenticated
      USING (get_my_role() = ANY (ARRAY['admin', 'co_admin']));
  END IF;
END $$;

-- lesson_progress: fix the self-referential EXISTS on those policies too
DROP POLICY IF EXISTS "Teachers and admins can view all progress v2" ON lesson_progress;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'lesson_progress' AND policyname = 'Teachers and admins can view all progress'
  ) THEN
    CREATE POLICY "Teachers and admins can view all progress"
      ON lesson_progress FOR SELECT
      TO authenticated
      USING (get_my_role() = ANY (ARRAY['teacher', 'admin', 'co_admin']));
  END IF;
END $$;

-- quiz_extra_attempts: fix EXISTS subquery
DROP POLICY IF EXISTS "Teachers can grant extra attempts" ON quiz_extra_attempts;
CREATE POLICY "Teachers can grant extra attempts"
  ON quiz_extra_attempts FOR INSERT
  TO authenticated
  WITH CHECK (get_my_role() = ANY (ARRAY['teacher', 'admin', 'co_admin']));

-- Admins can manage extra attempts select
DROP POLICY IF EXISTS "Admins can manage extra attempts" ON quiz_extra_attempts;
CREATE POLICY "Admins can manage extra attempts"
  ON quiz_extra_attempts FOR SELECT
  TO authenticated
  USING (get_my_role() = ANY (ARRAY['admin', 'co_admin']));
