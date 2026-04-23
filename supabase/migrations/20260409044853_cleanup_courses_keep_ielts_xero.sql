
/*
  # Clean up courses — keep only IELTS and Xero

  Removes all courses except:
  - IELTS Preparation (59102c80-84b8-4533-98dc-597ea80214e3)
  - Xero Beginner Course (421fc7e3-b096-4b68-87fe-89b44af69c0e)

  Also adds timeline columns to courses:
  - start_date: when the course cohort begins
  - end_date: when the course cohort ends
  - duration_weeks: total duration in weeks
*/

-- Remove all courses that are not IELTS or Xero
-- Cascade will handle sections, lessons, enrollments, quizzes etc.
DELETE FROM courses
WHERE id NOT IN (
  '59102c80-84b8-4533-98dc-597ea80214e3',
  '421fc7e3-b096-4b68-87fe-89b44af69c0e'
);

-- Add timeline columns to courses
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'courses' AND column_name = 'start_date'
  ) THEN
    ALTER TABLE courses ADD COLUMN start_date date;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'courses' AND column_name = 'end_date'
  ) THEN
    ALTER TABLE courses ADD COLUMN end_date date;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'courses' AND column_name = 'duration_weeks'
  ) THEN
    ALTER TABLE courses ADD COLUMN duration_weeks integer;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'courses' AND column_name = 'thumbnail_url'
  ) THEN
    ALTER TABLE courses ADD COLUMN thumbnail_url text;
  END IF;
END $$;

-- Set sensible defaults on the two kept courses
UPDATE courses
SET
  start_date     = CURRENT_DATE,
  end_date       = CURRENT_DATE + INTERVAL '12 weeks',
  duration_weeks = 12
WHERE id IN (
  '59102c80-84b8-4533-98dc-597ea80214e3',
  '421fc7e3-b096-4b68-87fe-89b44af69c0e'
);
