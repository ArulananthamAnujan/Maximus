
/*
  # Fix Demo User Authentication v2

  Resets all three demo user passwords with simple, reliable credentials.
  Updates identity_data to include email_verified flag.

  New credentials:
  - admin@maximus.edu.au   → Admin1234!
  - teacher@maximus.edu.au → Teacher1234!
  - student@maximus.edu.au → Student1234!
*/

UPDATE auth.users
SET
  encrypted_password = crypt('Admin1234!', gen_salt('bf')),
  updated_at = now(),
  raw_app_meta_data = '{"provider":"email","providers":["email"]}'::jsonb,
  raw_user_meta_data = '{"role":"admin","full_name":"Alex Morrison"}'::jsonb,
  email_confirmed_at = COALESCE(email_confirmed_at, now()),
  is_sso_user = false,
  deleted_at = null,
  banned_until = null
WHERE email = 'admin@maximus.edu.au';

UPDATE auth.users
SET
  encrypted_password = crypt('Teacher1234!', gen_salt('bf')),
  updated_at = now(),
  raw_app_meta_data = '{"provider":"email","providers":["email"]}'::jsonb,
  raw_user_meta_data = '{"role":"teacher","full_name":"Sarah Johnson"}'::jsonb,
  email_confirmed_at = COALESCE(email_confirmed_at, now()),
  is_sso_user = false,
  deleted_at = null,
  banned_until = null
WHERE email = 'teacher@maximus.edu.au';

UPDATE auth.users
SET
  encrypted_password = crypt('Student1234!', gen_salt('bf')),
  updated_at = now(),
  raw_app_meta_data = '{"provider":"email","providers":["email"]}'::jsonb,
  raw_user_meta_data = '{"role":"student","full_name":"James Wilson"}'::jsonb,
  email_confirmed_at = COALESCE(email_confirmed_at, now()),
  is_sso_user = false,
  deleted_at = null,
  banned_until = null
WHERE email = 'student@maximus.edu.au';

UPDATE auth.identities
SET
  identity_data = jsonb_build_object(
    'sub', user_id::text,
    'email', (SELECT email FROM auth.users u WHERE u.id = auth.identities.user_id),
    'email_verified', true,
    'phone_verified', false
  ),
  updated_at = now()
WHERE user_id IN (
  SELECT id FROM auth.users
  WHERE email IN ('admin@maximus.edu.au','teacher@maximus.edu.au','student@maximus.edu.au')
);
