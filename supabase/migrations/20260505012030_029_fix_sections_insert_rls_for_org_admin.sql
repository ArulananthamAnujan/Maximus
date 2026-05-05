/*
  # Fix sections INSERT policy to include org_admin role

  ## Problem
  The sections INSERT policy used public.get_user_role() which has two overloads
  causing ambiguity errors. It also did not include org_admin, so org admins got
  403 when inserting sections directly from the course builder UI.

  ## Fix
  Drop and recreate the INSERT policy using direct subqueries (no ambiguous function call),
  allowing the course owner (teacher_id) or admin or org_admin to insert sections.
  Same fix applied to DELETE and UPDATE policies for consistency.
*/

-- Sections INSERT
DROP POLICY IF EXISTS "Teachers can manage own course sections" ON sections;
CREATE POLICY "Teachers can manage own course sections"
  ON sections FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM courses c
      WHERE c.id = sections.course_id
        AND (
          c.teacher_id = auth.uid()
          OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','org_admin'))
        )
    )
  );

-- Sections UPDATE
DROP POLICY IF EXISTS "Teachers can update own sections" ON sections;
CREATE POLICY "Teachers can update own sections"
  ON sections FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM courses c
      WHERE c.id = sections.course_id
        AND (
          c.teacher_id = auth.uid()
          OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','org_admin'))
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM courses c
      WHERE c.id = sections.course_id
        AND (
          c.teacher_id = auth.uid()
          OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','org_admin'))
        )
    )
  );

-- Sections DELETE
DROP POLICY IF EXISTS "Teachers can delete own sections" ON sections;
CREATE POLICY "Teachers can delete own sections"
  ON sections FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM courses c
      WHERE c.id = sections.course_id
        AND (
          c.teacher_id = auth.uid()
          OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','org_admin'))
        )
    )
  );

-- Lessons INSERT
DROP POLICY IF EXISTS "Teachers can manage own course lessons insert" ON lessons;
CREATE POLICY "Teachers can manage own course lessons insert"
  ON lessons FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM courses c
      WHERE c.id = lessons.course_id
        AND (
          c.teacher_id = auth.uid()
          OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','org_admin'))
        )
    )
  );

-- Lessons UPDATE
DROP POLICY IF EXISTS "Teachers can update own course lessons" ON lessons;
CREATE POLICY "Teachers can update own course lessons"
  ON lessons FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM courses c
      WHERE c.id = lessons.course_id
        AND (
          c.teacher_id = auth.uid()
          OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','org_admin'))
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM courses c
      WHERE c.id = lessons.course_id
        AND (
          c.teacher_id = auth.uid()
          OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','org_admin'))
        )
    )
  );

-- Lessons DELETE
DROP POLICY IF EXISTS "Teachers can delete own course lessons" ON lessons;
CREATE POLICY "Teachers can delete own course lessons"
  ON lessons FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM courses c
      WHERE c.id = lessons.course_id
        AND (
          c.teacher_id = auth.uid()
          OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','org_admin'))
        )
    )
  );
