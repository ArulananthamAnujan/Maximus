/*
  # Add Performance Indexes

  Adds indexes on all columns used in WHERE clauses and JOINs across the LMS
  to ensure fast query execution as data grows.

  ## Indexes Added

  ### courses
  - teacher_id: JOIN with profiles
  - is_published, is_archived: common WHERE filters

  ### enrollments
  - student_id: most common lookup (student's courses)
  - course_id: course roster lookups
  - (student_id, course_id): unique pair lookups

  ### lessons
  - section_id: lesson list per section

  ### sections
  - course_id: section list per course

  ### lesson_progress
  - student_id: student progress lookups
  - lesson_id: lesson completion checks
  - (student_id, lesson_id): combined lookup

  ### quiz_attempts
  - student_id: student's attempts
  - quiz_id: attempts per quiz

  ### quizzes
  - course_id: quizzes per course

  ### assignments
  - course_id: assignments per course

  ### assignment_submissions
  - student_id: student's submissions
  - assignment_id: submissions per assignment

  ### certificates
  - student_id: student certificates
  - course_id: course certificates

  ### payments
  - student_id: student payments
  - status: filter by status
  - created_at: order by date

  ### activity_logs
  - user_id: user activity
  - created_at: recent activity ordering

  ### discussions
  - course_id: discussions per course
  - author_id: user's posts

  ### live_sessions
  - course_id: sessions per course
  - teacher_id: teacher's sessions
  - scheduled_at: upcoming sessions

  ### profiles
  - role: filter by user role
  - email: email lookups
*/

-- courses
CREATE INDEX IF NOT EXISTS idx_courses_teacher_id ON courses(teacher_id);
CREATE INDEX IF NOT EXISTS idx_courses_is_published ON courses(is_published);
CREATE INDEX IF NOT EXISTS idx_courses_is_archived ON courses(is_archived);
CREATE INDEX IF NOT EXISTS idx_courses_published_archived ON courses(is_published, is_archived);
CREATE INDEX IF NOT EXISTS idx_courses_category ON courses(category);

-- enrollments
CREATE INDEX IF NOT EXISTS idx_enrollments_student_id ON enrollments(student_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_course_id ON enrollments(course_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_student_course ON enrollments(student_id, course_id);

-- sections
CREATE INDEX IF NOT EXISTS idx_sections_course_id ON sections(course_id);

-- lessons
CREATE INDEX IF NOT EXISTS idx_lessons_section_id ON lessons(section_id);

-- lesson_progress
CREATE INDEX IF NOT EXISTS idx_lesson_progress_student_id ON lesson_progress(student_id);
CREATE INDEX IF NOT EXISTS idx_lesson_progress_lesson_id ON lesson_progress(lesson_id);
CREATE INDEX IF NOT EXISTS idx_lesson_progress_student_lesson ON lesson_progress(student_id, lesson_id);

-- quiz_attempts
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_student_id ON quiz_attempts(student_id);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_quiz_id ON quiz_attempts(quiz_id);

-- quizzes
CREATE INDEX IF NOT EXISTS idx_quizzes_course_id ON quizzes(course_id);

-- quiz_questions
CREATE INDEX IF NOT EXISTS idx_quiz_questions_quiz_id ON quiz_questions(quiz_id);

-- assignments
CREATE INDEX IF NOT EXISTS idx_assignments_course_id ON assignments(course_id);

-- assignment_submissions
CREATE INDEX IF NOT EXISTS idx_assignment_submissions_student_id ON assignment_submissions(student_id);
CREATE INDEX IF NOT EXISTS idx_assignment_submissions_assignment_id ON assignment_submissions(assignment_id);

-- certificates
CREATE INDEX IF NOT EXISTS idx_certificates_student_id ON certificates(student_id);
CREATE INDEX IF NOT EXISTS idx_certificates_course_id ON certificates(course_id);

-- payments
CREATE INDEX IF NOT EXISTS idx_payments_student_id ON payments(student_id);
CREATE INDEX IF NOT EXISTS idx_payments_course_id ON payments(course_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments(created_at DESC);

-- activity_logs
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at DESC);

-- discussions
CREATE INDEX IF NOT EXISTS idx_discussions_course_id ON discussions(course_id);
CREATE INDEX IF NOT EXISTS idx_discussions_author_id ON discussions(author_id);

-- live_sessions
CREATE INDEX IF NOT EXISTS idx_live_sessions_course_id ON live_sessions(course_id);
CREATE INDEX IF NOT EXISTS idx_live_sessions_teacher_id ON live_sessions(teacher_id);
CREATE INDEX IF NOT EXISTS idx_live_sessions_scheduled_at ON live_sessions(scheduled_at);

-- profiles
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);
