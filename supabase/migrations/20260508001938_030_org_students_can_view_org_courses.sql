/*
  # Allow org students to view their org's courses

  ## Problem
  Students added to an organization via org_students table could not see
  their org's courses in the student dashboard because the only SELECT
  policy for students requires is_published = true, and org courses
  may be in draft (unpublished) while still meant to be available to
  org members.

  ## Changes
  - Add SELECT policy on courses for org students (entries in org_students)
    to view all non-archived courses belonging to their organization.
  - This allows org admins to share both published and draft courses
    with their enrolled students.
*/

CREATE POLICY "Org students can view their org courses"
  ON courses FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM org_students os
      WHERE os.user_id = auth.uid()
        AND os.org_id = courses.org_id
        AND os.is_active = true
    )
    AND is_archived = false
  );
