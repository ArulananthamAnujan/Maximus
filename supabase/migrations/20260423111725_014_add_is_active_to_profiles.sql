/*
  # Add is_active column to profiles

  ## Summary
  Re-adds the is_active boolean to profiles so admins can activate/deactivate
  accounts without deleting them (soft-delete pattern). All existing users
  default to active = true.

  ## Changes
  - profiles: ADD COLUMN is_active BOOLEAN DEFAULT true
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'is_active'
  ) THEN
    ALTER TABLE profiles ADD COLUMN is_active boolean NOT NULL DEFAULT true;
  END IF;
END $$;
