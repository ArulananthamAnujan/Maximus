/*
  # Performance Indexes

  Adds indexes for all hot query paths:
  - lesson_progress lookups by user + lesson or user + course
  - course_enrollments lookups by user or course
  - enrollments lookups by student or course
  - quiz_attempts lookups by user + course
  - payments lookups by user, course, status, created_at
  - activity_logs ordered by created_at
  - announcements active filter
  - assignments due_date range scans
  - assignment_submissions grade IS NULL scans
  - live_sessions scheduled_at range scans
*/

-- lesson_progress
CREATE INDEX IF NOT EXISTS idx_lp_user_course    ON lesson_progress(user_id, course_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lp_student_course ON lesson_progress(student_id, course_id) WHERE student_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lp_completed      ON lesson_progress(user_id, is_completed) WHERE user_id IS NOT NULL;

-- course_enrollments
CREATE INDEX IF NOT EXISTS idx_ce_user_accessed  ON course_enrollments(user_id, last_accessed_at DESC);
CREATE INDEX IF NOT EXISTS idx_ce_course_status  ON course_enrollments(course_id, payment_status);

-- enrollments
CREATE INDEX IF NOT EXISTS idx_enroll_student_course ON enrollments(student_id, course_id);
CREATE INDEX IF NOT EXISTS idx_enroll_progress        ON enrollments(student_id, progress_percent);

-- quiz_attempts
CREATE INDEX IF NOT EXISTS idx_qa_user_course ON quiz_attempts(user_id, course_id) WHERE user_id IS NOT NULL;

-- payments
CREATE INDEX IF NOT EXISTS idx_payments_status_date ON payments(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_user_status  ON payments(user_id, status);

-- activity_logs
CREATE INDEX IF NOT EXISTS idx_activity_action     ON activity_logs(action);
CREATE INDEX IF NOT EXISTS idx_activity_entity     ON activity_logs(entity_type, entity_id);

-- announcements
CREATE INDEX IF NOT EXISTS idx_announce_active_date ON announcements(is_active, created_at DESC);

-- assignments
CREATE INDEX IF NOT EXISTS idx_assign_due_published ON assignments(course_id, due_date, is_published);

-- assignment_submissions
CREATE INDEX IF NOT EXISTS idx_sub_ungraded ON assignment_submissions(assignment_id) WHERE grade IS NULL;

-- live_sessions
CREATE INDEX IF NOT EXISTS idx_live_teacher_sched ON live_sessions(teacher_id, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_live_course_sched  ON live_sessions(course_id, scheduled_at);

-- profiles
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);

-- courses
CREATE INDEX IF NOT EXISTS idx_courses_published_cat ON courses(is_published, is_archived, category);
CREATE INDEX IF NOT EXISTS idx_courses_teacher_pub   ON courses(teacher_id, is_published, is_archived);
