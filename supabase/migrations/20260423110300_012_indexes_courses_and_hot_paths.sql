/*
  # Additional Performance Indexes

  ## Summary
  Adds indexes for the most-queried columns across public-facing and student pages.

  ## New Indexes
  - courses: composite on (is_published, is_archived) for the public Courses page filter
  - courses: on category, level, is_free for client-side-filtered but still DB-scanned queries
  - courses: on total_students DESC for default "popular" sort
  - sections: on course_id + order_index for CoursePreview and CoursePlayer
  - lessons: on section_id + order_index for nested lesson loading
  - promo_codes: on (code, is_active) for fast promo validation
  - announcements: on (is_active, created_at) for dashboard sidebar
*/

CREATE INDEX IF NOT EXISTS idx_courses_published_archived
  ON courses (is_published, is_archived)
  WHERE is_published = true AND is_archived = false;

CREATE INDEX IF NOT EXISTS idx_courses_popular
  ON courses (total_students DESC NULLS LAST)
  WHERE is_published = true AND is_archived = false;

CREATE INDEX IF NOT EXISTS idx_courses_created_at
  ON courses (created_at DESC)
  WHERE is_published = true AND is_archived = false;

CREATE INDEX IF NOT EXISTS idx_courses_category
  ON courses (category)
  WHERE is_published = true;

CREATE INDEX IF NOT EXISTS idx_courses_level
  ON courses (level)
  WHERE is_published = true;

CREATE INDEX IF NOT EXISTS idx_sections_course_order
  ON sections (course_id, order_index);

CREATE INDEX IF NOT EXISTS idx_lessons_section_order
  ON lessons (section_id, order_index);

CREATE INDEX IF NOT EXISTS idx_promo_codes_lookup
  ON promo_codes (code, is_active);

CREATE INDEX IF NOT EXISTS idx_announcements_active_created
  ON announcements (is_active, created_at DESC)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_assignments_due_date
  ON assignments (course_id, due_date)
  WHERE due_date IS NOT NULL;
