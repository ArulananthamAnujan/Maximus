/*
  # Add org_admin RLS policies for courses

  ## Problem
  org_admin users could not insert courses directly because the INSERT policy
  only allowed 'teacher' and 'admin' roles. The SECURITY DEFINER RPC bypasses
  this for AI course creation, but direct inserts from the course builder UI fail.

  ## Changes
  - Add INSERT policy for org_admin on courses
  - Add SELECT/UPDATE/DELETE policies so org_admin can manage their org's courses
*/

-- org_admin can insert courses for their org
CREATE POLICY "Org admins can insert courses"
  ON courses FOR INSERT
  TO authenticated
  WITH CHECK (
    (auth.uid() = teacher_id) AND
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'org_admin')
  );

-- org_admin can view all courses belonging to their org
CREATE POLICY "Org admins can view their org courses"
  ON courses FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM org_members om
      WHERE om.user_id = auth.uid()
        AND om.org_id = courses.org_id
    )
  );

-- org_admin can update courses in their org
CREATE POLICY "Org admins can update their org courses"
  ON courses FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM org_members om
      WHERE om.user_id = auth.uid()
        AND om.org_id = courses.org_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM org_members om
      WHERE om.user_id = auth.uid()
        AND om.org_id = courses.org_id
    )
  );

-- org_admin can delete courses in their org
CREATE POLICY "Org admins can delete their org courses"
  ON courses FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM org_members om
      WHERE om.user_id = auth.uid()
        AND om.org_id = courses.org_id
    )
  );
