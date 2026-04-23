/*
  # Fix Profiles RLS Infinite Recursion

  ## Problem
  Several policies on the `profiles` table use subqueries that SELECT FROM `profiles`
  (e.g., `EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')`).
  This causes infinite recursion because evaluating the policy triggers itself.

  ## Fix
  Replace the self-referencing subqueries with `auth.jwt()` metadata checks or a
  SECURITY DEFINER function that bypasses RLS, eliminating the recursion.

  We use `get_my_role()` — a SECURITY DEFINER function — to safely read the caller's
  role from the profiles table without triggering RLS.
*/

-- Create a SECURITY DEFINER helper to read the calling user's role without RLS
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$;

-- Drop the recursive policies
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can update any profile" ON profiles;
DROP POLICY IF EXISTS "Teachers can view student profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can insert profiles" ON profiles;

-- Recreate without recursion
CREATE POLICY "Admins can view all profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (get_my_role() = 'admin');

CREATE POLICY "Teachers can view student profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (get_my_role() IN ('teacher', 'admin'));

CREATE POLICY "Admins can update any profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (get_my_role() = 'admin')
  WITH CHECK (get_my_role() = 'admin');

CREATE POLICY "Admins can insert profiles"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (get_my_role() = 'admin');
