/*
  # Fix get_user_role() function

  The function was querying `FROM profiles WHERE id = user_id` but `user_id`
  was never defined, causing it to always return 'student'. This broke the
  admin RLS check on courses UPDATE, making it impossible for admins to save
  course changes (e.g. switching paid → free).

  Fix: replace the undefined `user_id` reference with `auth.uid()`.
*/

CREATE OR REPLACE FUNCTION get_user_role()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  cached text;
  result text;
BEGIN
  BEGIN
    cached := current_setting('app.user_role_cache', true);
  EXCEPTION WHEN OTHERS THEN
    cached := NULL;
  END;

  IF cached IS NOT NULL AND cached != '' THEN
    RETURN cached;
  END IF;

  SELECT role INTO result FROM profiles WHERE id = auth.uid();
  result := COALESCE(result, 'student');

  PERFORM set_config('app.user_role_cache', result, true);
  RETURN result;
END;
$$;
