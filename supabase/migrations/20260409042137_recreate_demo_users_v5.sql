
/*
  # Recreate Demo Users - v5

  Final version handling all generated column constraints in auth.identities.

  Demo credentials:
  - admin@maximus.edu.au    / Admin1234!
  - teacher@maximus.edu.au  / Teacher1234!
  - student@maximus.edu.au  / Student1234!
*/

DO $$
DECLARE
  admin_uid   uuid := '6c0e7959-b621-42ce-8598-868a8fc2e073';
  teacher_uid uuid := '494bced9-f191-429c-8b0b-1f19680e4442';
  student_uid uuid := '4bb5f4e6-5ca5-4bfa-a4a0-4974e06ae7c5';
BEGIN

  -- Nullify FK refs from public schema
  UPDATE public.promo_codes   SET created_by = NULL WHERE created_by IN (admin_uid, teacher_uid, student_uid);
  UPDATE public.announcements SET created_by = NULL WHERE created_by IN (admin_uid, teacher_uid, student_uid);
  UPDATE public.courses       SET teacher_id = NULL WHERE teacher_id IN (admin_uid, teacher_uid, student_uid);
  DELETE FROM public.activity_logs WHERE user_id IN (admin_uid, teacher_uid, student_uid);

  -- Clean auth tables
  DELETE FROM auth.identities     WHERE user_id IN (admin_uid, teacher_uid, student_uid);
  DELETE FROM auth.sessions       WHERE user_id IN (admin_uid, teacher_uid, student_uid);
  DELETE FROM auth.refresh_tokens WHERE user_id IN (admin_uid::text, teacher_uid::text, student_uid::text);
  DELETE FROM auth.users          WHERE id      IN (admin_uid, teacher_uid, student_uid);

  -- Recreate auth users
  INSERT INTO auth.users (
    instance_id, id, aud, role,
    email, encrypted_password,
    email_confirmed_at,
    confirmation_token, recovery_token,
    email_change_token_new, email_change,
    raw_app_meta_data, raw_user_meta_data,
    is_super_admin, created_at, updated_at,
    phone, phone_change, phone_change_token,
    email_change_token_current, email_change_confirm_status,
    reauthentication_token,
    is_sso_user, deleted_at, is_anonymous
  ) VALUES
  (
    '00000000-0000-0000-0000-000000000000', admin_uid,
    'authenticated', 'authenticated',
    'admin@maximus.edu.au', crypt('Admin1234!', gen_salt('bf')),
    now(), '', '', '', '',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"role":"admin","full_name":"Alex Morrison"}'::jsonb,
    false, now(), now(), NULL, '', '', '', 0, '', false, NULL, false
  ),
  (
    '00000000-0000-0000-0000-000000000000', teacher_uid,
    'authenticated', 'authenticated',
    'teacher@maximus.edu.au', crypt('Teacher1234!', gen_salt('bf')),
    now(), '', '', '', '',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"role":"teacher","full_name":"Sarah Thompson"}'::jsonb,
    false, now(), now(), NULL, '', '', '', 0, '', false, NULL, false
  ),
  (
    '00000000-0000-0000-0000-000000000000', student_uid,
    'authenticated', 'authenticated',
    'student@maximus.edu.au', crypt('Student1234!', gen_salt('bf')),
    now(), '', '', '', '',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"role":"student","full_name":"James Wilson"}'::jsonb,
    false, now(), now(), NULL, '', '', '', 0, '', false, NULL, false
  );

  -- Recreate identities (email is a generated column, omit it)
  INSERT INTO auth.identities (id, provider_id, user_id, identity_data, provider, created_at, updated_at)
  VALUES
  (
    gen_random_uuid(), 'admin@maximus.edu.au', admin_uid,
    jsonb_build_object('sub', admin_uid::text, 'email', 'admin@maximus.edu.au', 'email_verified', true, 'phone_verified', false),
    'email', now(), now()
  ),
  (
    gen_random_uuid(), 'teacher@maximus.edu.au', teacher_uid,
    jsonb_build_object('sub', teacher_uid::text, 'email', 'teacher@maximus.edu.au', 'email_verified', true, 'phone_verified', false),
    'email', now(), now()
  ),
  (
    gen_random_uuid(), 'student@maximus.edu.au', student_uid,
    jsonb_build_object('sub', student_uid::text, 'email', 'student@maximus.edu.au', 'email_verified', true, 'phone_verified', false),
    'email', now(), now()
  );

  -- Recreate profiles
  INSERT INTO public.profiles (id, email, full_name, role, is_active, bio)
  VALUES
    (admin_uid,   'admin@maximus.edu.au',   'Alex Morrison',  'admin',   true, 'Platform administrator for Maximus Academy Australia.'),
    (teacher_uid, 'teacher@maximus.edu.au', 'Sarah Thompson', 'teacher', true, 'Senior Business Communication instructor with 10+ years experience.'),
    (student_uid, 'student@maximus.edu.au', 'James Wilson',   'student', true, 'Aspiring business professional based in Sydney, Australia.')
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email, full_name = EXCLUDED.full_name,
    role = EXCLUDED.role, is_active = true;

  -- Restore public references
  UPDATE public.courses       SET teacher_id = teacher_uid WHERE teacher_id IS NULL;
  UPDATE public.promo_codes   SET created_by = admin_uid   WHERE created_by IS NULL;
  UPDATE public.announcements SET created_by = admin_uid   WHERE created_by IS NULL;

  -- Restore activity logs
  INSERT INTO public.activity_logs (user_id, action, resource_type, resource_id, details) VALUES
    (admin_uid,   'create', 'course', 'aa000000-0000-0000-0000-000000000001', 'Created course: Business Communication Mastery'),
    (teacher_uid, 'create', 'quiz',   'a0000000-0000-0000-0000-000000000001', 'Created quiz: Module 1 Knowledge Check'),
    (student_uid, 'enroll', 'course', 'aa000000-0000-0000-0000-000000000001', 'Enrolled in: Business Communication Mastery');

END $$;
