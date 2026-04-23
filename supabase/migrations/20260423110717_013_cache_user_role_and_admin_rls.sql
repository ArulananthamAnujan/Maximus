/*
  # Cache user role lookup and fix admin RLS performance

  ## Problem
  get_user_role() runs a SELECT from profiles on EVERY row checked by RLS policies.
  For an admin viewing 9 courses, that triggers 9+ extra DB round-trips.

  ## Fix
  1. Replace get_user_role() body with a cached version using a transaction-local
     variable (set_config/current_setting). First call hits profiles, subsequent
     calls within the same request return the cached value instantly.

  2. Add a separate policy for admin INSERT on courses (currently missing — admins
     can't create courses because the INSERT policy only allows teachers with
     matching teacher_id).

  ## Changes
  - get_user_role() now caches result in session variable request.jwt.role.cached
  - New policy: "Admins can insert courses" on courses FOR INSERT
*/

-- Drop and recreate get_user_role with caching
CREATE OR REPLACE FUNCTION public.get_user_role(user_id uuid DEFAULT auth.uid())
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cached text;
  result text;
BEGIN
  -- Try to read from transaction-local cache
  BEGIN
    cached := current_setting('app.user_role_cache', true);
  EXCEPTION WHEN OTHERS THEN
    cached := NULL;
  END;

  IF cached IS NOT NULL AND cached != '' THEN
    RETURN cached;
  END IF;

  -- First call in this request: hit the DB once
  SELECT role INTO result FROM profiles WHERE id = user_id;
  result := COALESCE(result, 'student');

  -- Cache for the remainder of this request
  PERFORM set_config('app.user_role_cache', result, true);
  RETURN result;
END;
$$;

-- Admins should be able to insert courses (current policy requires teacher_id = auth.uid())
CREATE POLICY "Admins can insert courses"
  ON courses FOR INSERT
  TO authenticated
  WITH CHECK (get_user_role() = 'admin');
