/*
  # Fix f2f_requests foreign keys to reference profiles instead of auth.users

  ## Problem
  The f2f_requests table has student_id and teacher_id referencing auth.users(id).
  Supabase PostgREST cannot auto-join from auth.users to public.profiles, so
  queries using !f2f_requests_student_id_fkey and !f2f_requests_teacher_id_fkey
  to join profiles return null / empty results.

  ## Fix
  1. Drop the existing FKs that point to auth.users
  2. Re-create them pointing to public.profiles(id)
  This allows Supabase to resolve the join correctly.
*/

-- Drop old FKs referencing auth.users
ALTER TABLE f2f_requests DROP CONSTRAINT IF EXISTS f2f_requests_student_id_fkey;
ALTER TABLE f2f_requests DROP CONSTRAINT IF EXISTS f2f_requests_teacher_id_fkey;

-- Re-add FKs referencing public.profiles
ALTER TABLE f2f_requests
  ADD CONSTRAINT f2f_requests_student_id_fkey
  FOREIGN KEY (student_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE f2f_requests
  ADD CONSTRAINT f2f_requests_teacher_id_fkey
  FOREIGN KEY (teacher_id) REFERENCES profiles(id) ON DELETE CASCADE;
