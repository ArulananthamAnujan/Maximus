/*
  # Migrate Legacy Enrollments to course_enrollments

  ## Summary
  Copies all rows from the legacy `enrollments` table into the new `course_enrollments`
  table so that `useMyEnrollments` (which only queries `course_enrollments`) returns
  data for existing students.

  ## Changes
  - Inserts missing rows from `enrollments` → `course_enrollments`
  - Maps `student_id` → `user_id`
  - Sets `payment_status = 'not_required'` for all migrated rows
  - Sets `completed_at` where `progress_percent = 100`
  - Skips duplicates via ON CONFLICT DO NOTHING
*/

INSERT INTO course_enrollments (
  id,
  user_id,
  course_id,
  payment_status,
  progress_percent,
  last_accessed_at,
  enrolled_at,
  completed_at
)
SELECT
  e.id,
  e.student_id,
  e.course_id,
  'not_required'::text,
  COALESCE(e.progress_percent, 0),
  COALESCE(e.enrolled_at, now()),
  COALESCE(e.enrolled_at, now()),
  CASE WHEN e.progress_percent = 100 THEN e.enrolled_at ELSE NULL END
FROM enrollments e
WHERE e.student_id IS NOT NULL
ON CONFLICT (user_id, course_id) DO NOTHING;
