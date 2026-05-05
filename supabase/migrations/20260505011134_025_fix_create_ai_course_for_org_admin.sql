/*
  # Fix create_ai_course RPC for org_admin role

  ## Problem
  The create_ai_course function only allowed 'teacher' and 'admin' roles.
  org_admin users were rejected with "Forbidden" even though they should be
  able to create courses for their organization.

  ## Changes
  - Allow 'org_admin' role in addition to 'teacher' and 'admin'
  - Set org_id on the created course when the caller is an org_admin (or teacher in an org)
*/

CREATE OR REPLACE FUNCTION create_ai_course(payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role text;
  caller_org_id uuid;
  new_course_id uuid;
  module jsonb;
  lesson jsonb;
  new_section_id uuid;
  module_idx int := 0;
  lesson_idx int;
BEGIN
  SELECT role INTO caller_role FROM profiles WHERE id = auth.uid();
  IF caller_role NOT IN ('teacher', 'admin', 'org_admin') THEN
    RAISE EXCEPTION 'Forbidden: only teachers and admins can create courses';
  END IF;

  -- Resolve org_id for org_admin or teacher belonging to an org
  SELECT org_id INTO caller_org_id
  FROM org_members
  WHERE user_id = auth.uid()
  LIMIT 1;

  INSERT INTO courses (
    title, description, short_description, level, category,
    is_free, is_published, teacher_id, org_id
  ) VALUES (
    payload->>'title',
    payload->>'description',
    left(payload->>'description', 120),
    COALESCE(payload->>'level', 'beginner'),
    COALESCE(payload->>'category', 'General'),
    true,
    false,
    auth.uid(),
    caller_org_id
  )
  RETURNING id INTO new_course_id;

  FOR module IN SELECT * FROM jsonb_array_elements(payload->'modules')
  LOOP
    INSERT INTO sections (course_id, title, order_index)
    VALUES (new_course_id, module->>'title', module_idx)
    RETURNING id INTO new_section_id;

    lesson_idx := 0;
    FOR lesson IN SELECT * FROM jsonb_array_elements(module->'lessons')
    LOOP
      INSERT INTO lessons (
        section_id, course_id, title, type, content, duration_minutes, order_index, is_preview
      ) VALUES (
        new_section_id,
        new_course_id,
        lesson->>'title',
        'article',
        COALESCE(lesson->>'description', ''),
        COALESCE((lesson->>'estimated_duration_minutes')::int, 10),
        lesson_idx,
        false
      );
      lesson_idx := lesson_idx + 1;
    END LOOP;

    module_idx := module_idx + 1;
  END LOOP;

  RETURN new_course_id;
END;
$$;
