/*
  # Fix profiles_role_check constraint and create co-admin account

  1. Changes
    - Drops the existing profiles_role_check constraint that excludes 'co_admin'
    - Recreates it to include 'co_admin' as an allowed role
    - Updates handle_new_user trigger to accept 'co_admin' role
    - Creates a default co-admin auth user and profile
*/

-- Step 1: Drop the old constraint
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

-- Step 2: Recreate with co_admin included
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role = ANY (ARRAY['admin'::text, 'co_admin'::text, 'teacher'::text, 'student'::text, 'org_admin'::text]));

-- Step 3: Update handle_new_user trigger function if it enforces a role check
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    CASE
      WHEN NEW.raw_user_meta_data->>'role' IN ('admin','co_admin','teacher','student','org_admin')
        THEN NEW.raw_user_meta_data->>'role'
      ELSE 'student'
    END
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(EXCLUDED.full_name, profiles.full_name),
    role = CASE
      WHEN EXCLUDED.role IN ('admin','co_admin','teacher','student','org_admin')
        THEN EXCLUDED.role
      ELSE profiles.role
    END;
  RETURN NEW;
END;
$$;

-- Step 4: Create default co-admin account in auth.users then profiles
DO $$
DECLARE
  v_user_id uuid;
  v_existing_id uuid;
BEGIN
  -- Check if already exists
  SELECT id INTO v_existing_id FROM auth.users WHERE email = 'coadmin@maximus.edu.au';

  IF v_existing_id IS NULL THEN
    v_user_id := gen_random_uuid();

    INSERT INTO auth.users (
      id, instance_id, aud, role,
      email, encrypted_password, email_confirmed_at,
      raw_user_meta_data, raw_app_meta_data,
      created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) VALUES (
      v_user_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'coadmin@maximus.edu.au',
      crypt('CoAdmin@2024', gen_salt('bf')),
      now(),
      '{"full_name": "Co Admin", "role": "co_admin"}'::jsonb,
      '{"provider": "email", "providers": ["email"]}'::jsonb,
      now(), now(),
      '', '', '', ''
    );

    INSERT INTO profiles (id, email, full_name, role, is_active)
    VALUES (v_user_id, 'coadmin@maximus.edu.au', 'Co Admin', 'co_admin', true)
    ON CONFLICT (id) DO UPDATE SET role = 'co_admin', full_name = 'Co Admin';
  ELSE
    -- User exists, just ensure their profile has co_admin role
    INSERT INTO profiles (id, email, full_name, role, is_active)
    VALUES (v_existing_id, 'coadmin@maximus.edu.au', 'Co Admin', 'co_admin', true)
    ON CONFLICT (id) DO UPDATE SET role = 'co_admin', full_name = 'Co Admin';
  END IF;
END $$;
