/*
  # Backfill missing certificates for completed courses

  ## What this does
  Issues certificates for any student who:
  - Has 100% progress in course_enrollments OR enrollments
  - Does NOT already have a certificate for that course
  - The course has NO required quizzes that are unpassed
  - The course has NO published exams that are ungraded/unfinalised

  ## This is safe to run multiple times
  The INSERT uses ON CONFLICT DO NOTHING due to the UNIQUE(student_id, course_id) constraint.
*/

INSERT INTO certificates (student_id, course_id)
SELECT DISTINCT ce.user_id, ce.course_id
FROM course_enrollments ce
WHERE ce.progress_percent = 100

  -- No certificate yet
  AND NOT EXISTS (
    SELECT 1 FROM certificates cert
    WHERE cert.student_id = ce.user_id
      AND cert.course_id = ce.course_id
  )

  -- No required quizzes that haven't been passed
  AND NOT EXISTS (
    SELECT 1 FROM quizzes q
    WHERE q.course_id = ce.course_id
      AND q.is_required = true
      AND NOT EXISTS (
        SELECT 1 FROM quiz_attempts qa
        WHERE qa.student_id = ce.user_id
          AND qa.quiz_id = q.id
          AND qa.passed = true
      )
  )

  -- No published exams that haven't been graded/finalised
  AND NOT EXISTS (
    SELECT 1 FROM exams e
    WHERE e.course_id = ce.course_id
      AND e.is_published = true
      AND NOT EXISTS (
        SELECT 1 FROM exam_submissions es
        WHERE es.student_id = ce.user_id
          AND es.exam_id = e.id
          AND es.status IN ('graded', 'finalised')
      )
  )

ON CONFLICT (student_id, course_id) DO NOTHING;
