/*
  # Add Stripe Payment Link to Courses & Clear Dummy Payments

  1. Changes
    - Add `stripe_payment_link` column to courses table (nullable text)
    - Delete all existing dummy payment records so the payments page starts clean

  2. Notes
    - teacher_id is already nullable on courses, so no changes needed there
    - stripe_payment_link stores the full Stripe Payment Link URL per course
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'courses' AND column_name = 'stripe_payment_link'
  ) THEN
    ALTER TABLE courses ADD COLUMN stripe_payment_link text DEFAULT NULL;
  END IF;
END $$;

DELETE FROM payments;
