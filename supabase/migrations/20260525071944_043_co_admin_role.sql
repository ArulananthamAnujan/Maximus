/*
  # Add co_admin role support

  ## Changes

  1. profiles table
     - co_admin is a valid role value (column is text, no change needed)

  2. RLS policies
     - co_admin can view all profiles (like admin)
     - co_admin can view all certificates
     - co_admin can view all payments
     - co_admin can view course_enrollments

  3. Notes
     - co_admin CANNOT create/delete users (only admin can via edge function)
     - co_admin CANNOT access AI usage, org management, or settings
     - co_admin CAN view students, teachers, payments, certificates, enrollments
*/

-- co_admin can view all profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'Co-admins can view all profiles'
  ) THEN
    CREATE POLICY "Co-admins can view all profiles"
      ON profiles FOR SELECT
      TO authenticated
      USING (
        EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'co_admin')
      );
  END IF;
END $$;

-- co_admin can update profiles (e.g. activate/deactivate students)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'Co-admins can update profiles'
  ) THEN
    CREATE POLICY "Co-admins can update profiles"
      ON profiles FOR UPDATE
      TO authenticated
      USING (
        EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'co_admin')
      )
      WITH CHECK (
        EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'co_admin')
      );
  END IF;
END $$;

-- co_admin can view all certificates
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'certificates' AND policyname = 'Co-admins can view certificates'
  ) THEN
    CREATE POLICY "Co-admins can view certificates"
      ON certificates FOR SELECT
      TO authenticated
      USING (
        EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'co_admin')
      );
  END IF;
END $$;

-- co_admin can view all payments
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'payments' AND policyname = 'Co-admins can view payments'
  ) THEN
    CREATE POLICY "Co-admins can view payments"
      ON payments FOR SELECT
      TO authenticated
      USING (
        EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'co_admin')
      );
  END IF;
END $$;

-- co_admin can view course_enrollments
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'course_enrollments' AND policyname = 'Co-admins can view course enrollments'
  ) THEN
    CREATE POLICY "Co-admins can view course enrollments"
      ON course_enrollments FOR SELECT
      TO authenticated
      USING (
        EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'co_admin')
      );
  END IF;
END $$;

-- co_admin can view enrollments
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'enrollments' AND policyname = 'Co-admins can view enrollments'
  ) THEN
    CREATE POLICY "Co-admins can view enrollments"
      ON enrollments FOR SELECT
      TO authenticated
      USING (
        EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'co_admin')
      );
  END IF;
END $$;

-- Allow co_admin to insert into course_enrollments (enroll students)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'course_enrollments' AND policyname = 'Co-admins can insert course enrollments'
  ) THEN
    CREATE POLICY "Co-admins can insert course enrollments"
      ON course_enrollments FOR INSERT
      TO authenticated
      WITH CHECK (
        EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'co_admin'))
      );
  END IF;
END $$;
