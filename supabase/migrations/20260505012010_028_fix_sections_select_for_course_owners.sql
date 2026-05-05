/*
  # Fix sections SELECT policy for course owners (teachers and org_admins)

  ## Problem
  The only SELECT policy on `sections` allows viewing sections of *published* courses.
  When a teacher or org_admin creates a new course (is_published = false) and adds
  sections, they cannot read back those sections because the course is unpublished.
  This causes the curriculum tab to appear empty after creation.

  ## Fix
  Add a SELECT policy that lets the course owner (teacher_id = auth.uid()) and
  admins/org_admins view sections of their own courses regardless of publish status.
*/

CREATE POLICY "Course owners can view own course sections"
  ON sections FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM courses c
      WHERE c.id = sections.course_id
        AND (
          c.teacher_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'
          )
          OR EXISTS (
            SELECT 1 FROM org_members om
            JOIN profiles p ON p.id = auth.uid()
            WHERE om.user_id = auth.uid()
              AND om.org_id = c.org_id
              AND p.role = 'org_admin'
          )
        )
    )
  );
