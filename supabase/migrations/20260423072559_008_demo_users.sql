/*
  # Demo Users

  Creates three demo accounts for testing:
    - admin@maximus.edu.au   / Admin1234!    (role: admin)
    - teacher@maximus.edu.au / Teacher1234!  (role: teacher)
    - student@maximus.edu.au / Student1234!  (role: student)

  Uses fixed UUIDs so subsequent re-runs are idempotent (ON CONFLICT DO UPDATE).
*/

DO $$
DECLARE
  admin_uid   uuid := '6c0e7959-b621-42ce-8598-868a8fc2e073';
  teacher_uid uuid := '494bced9-f191-429c-8b0b-1f19680e4442';
  student_uid uuid := '4bb5f4e6-5ca5-4bfa-a4a0-4974e06ae7c5';
BEGIN

  -- Clean up any prior versions cleanly
  DELETE FROM auth.identities     WHERE user_id IN (admin_uid, teacher_uid, student_uid);
  DELETE FROM auth.sessions       WHERE user_id IN (admin_uid, teacher_uid, student_uid);
  DELETE FROM auth.users          WHERE id      IN (admin_uid, teacher_uid, student_uid);

  -- ── auth.users ────────────────────────────────────────────────────────────
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
    reauthentication_token, is_sso_user, deleted_at, is_anonymous
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

  -- ── auth.identities ───────────────────────────────────────────────────────
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

  -- ── profiles ──────────────────────────────────────────────────────────────
  INSERT INTO public.profiles (id, email, full_name, role, bio)
  VALUES
    (admin_uid,   'admin@maximus.edu.au',   'Alex Morrison',  'admin',
     'Platform administrator for Maximus Academy Australia.'),
    (teacher_uid, 'teacher@maximus.edu.au', 'Sarah Thompson', 'teacher',
     'Senior Business Communication instructor with 10+ years experience.'),
    (student_uid, 'student@maximus.edu.au', 'James Wilson',   'student',
     'Aspiring business professional based in Sydney, Australia.')
  ON CONFLICT (id) DO UPDATE SET
    email     = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    role      = EXCLUDED.role,
    bio       = EXCLUDED.bio;

END $$;
