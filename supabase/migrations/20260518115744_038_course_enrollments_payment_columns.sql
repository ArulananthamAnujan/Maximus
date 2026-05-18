/*
  # Add payment columns to course_enrollments

  ## Changes
  - Adds `enrollment_type` (free/paid) to course_enrollments
  - Adds `amount_paid` (numeric) to record what was charged
  - Adds `currency` (text) for the payment currency
  These are needed by the Stripe webhook to record payment details on enrollment.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'course_enrollments' AND column_name = 'enrollment_type'
  ) THEN
    ALTER TABLE course_enrollments ADD COLUMN enrollment_type text DEFAULT 'free';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'course_enrollments' AND column_name = 'amount_paid'
  ) THEN
    ALTER TABLE course_enrollments ADD COLUMN amount_paid numeric DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'course_enrollments' AND column_name = 'currency'
  ) THEN
    ALTER TABLE course_enrollments ADD COLUMN currency text DEFAULT 'AUD';
  END IF;
END $$;
