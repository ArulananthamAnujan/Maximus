/*
  # Org Students, Plan Feature Gating, and Student-Org Scoping

  ## Overview
  - Adds org_students table to track which students belong to which organisation
  - Updates plan_tier CHECK to add 'professional' tier between starter and enterprise
  - Adds feature_flags JSONB column to organisations for granular AI feature control
  - Updates token_packages to carry a recommended plan_tier
  - RLS policies so org admins can manage their students

  ## New Tables

  ### org_students
  - Links student profiles to an organisation
  - org_admin can enrol students by email
  - Students scoped to an org see only that org's published courses

  ## Modified Tables
  - organizations: plan_tier CHECK updated, feature_flags JSONB added
  - token_packages: plan_tier column added (recommends which plan this package suits)

  ## Security
  - RLS on org_students
  - org_admin can view/insert/delete org_students for their org only
*/

-- ── 1. Update plan_tier CHECK on organizations ────────────────────────────────
ALTER TABLE organizations DROP CONSTRAINT IF EXISTS organizations_plan_tier_check;
ALTER TABLE organizations ADD CONSTRAINT organizations_plan_tier_check
  CHECK (plan_tier IN ('starter', 'professional', 'growth', 'enterprise'));

-- ── 2. Add feature_flags JSONB column ────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'organizations' AND column_name = 'feature_flags'
  ) THEN
    ALTER TABLE organizations ADD COLUMN feature_flags jsonb NOT NULL DEFAULT '{
      "ai_course_outline": true,
      "ai_lesson_content": true,
      "ai_quiz_generation": false,
      "ai_flashcards": false,
      "ai_full_curriculum": false,
      "ai_presentations": false,
      "ai_exams": false,
      "student_ai_access": false
    }'::jsonb;
  END IF;
END $$;

-- ── 3. Add plan_tier to token_packages ────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'token_packages' AND column_name = 'plan_tier'
  ) THEN
    ALTER TABLE token_packages ADD COLUMN plan_tier text NOT NULL DEFAULT 'starter';
  END IF;
END $$;

-- ── 4. Update seeded packages with plan tiers ─────────────────────────────────
UPDATE token_packages SET plan_tier = 'starter'      WHERE name = 'Starter';
UPDATE token_packages SET plan_tier = 'professional' WHERE name = 'Growth';
UPDATE token_packages SET plan_tier = 'professional' WHERE name = 'Pro';
UPDATE token_packages SET plan_tier = 'enterprise'   WHERE name = 'Enterprise';

-- ── 5. Update seeded packages with better pricing for a profit business ───────
UPDATE token_packages SET
  name = 'Starter',
  description = '200 AI tokens — perfect for small teams testing the platform',
  token_amount = 200,
  price_cents = 1900,
  is_popular = false,
  plan_tier = 'starter'
WHERE name = 'Starter';

UPDATE token_packages SET
  name = 'Professional',
  description = '1,000 AI tokens — for active course creators with full AI access',
  token_amount = 1000,
  price_cents = 4900,
  is_popular = true,
  plan_tier = 'professional'
WHERE name = 'Growth';

UPDATE token_packages SET
  name = 'Business',
  description = '3,000 AI tokens — full feature set including exams & presentations',
  token_amount = 3000,
  price_cents = 9900,
  is_popular = false,
  plan_tier = 'growth'
WHERE name = 'Pro';

UPDATE token_packages SET
  name = 'Enterprise',
  description = '10,000 AI tokens — unlimited-feel for large training departments',
  token_amount = 10000,
  price_cents = 24900,
  is_popular = false,
  plan_tier = 'enterprise'
WHERE name = 'Enterprise';

-- ── 6. org_students table ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS org_students (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  enrolled_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  enrolled_at timestamptz DEFAULT now(),
  is_active   boolean NOT NULL DEFAULT true,
  UNIQUE (org_id, user_id)
);

ALTER TABLE org_students ENABLE ROW LEVEL SECURITY;

-- admins: full access
CREATE POLICY "Admins can view all org students"
  ON org_students FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can insert org students"
  ON org_students FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can update org students"
  ON org_students FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can delete org students"
  ON org_students FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- org owners: manage students in their org
CREATE POLICY "Org owners can view their org students"
  ON org_students FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = org_students.org_id
        AND org_members.user_id = auth.uid()
        AND org_members.role = 'owner'
    )
  );

CREATE POLICY "Org owners can add students to their org"
  ON org_students FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = org_id
        AND org_members.user_id = auth.uid()
        AND org_members.role = 'owner'
    )
  );

CREATE POLICY "Org owners can update their org students"
  ON org_students FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = org_students.org_id
        AND org_members.user_id = auth.uid()
        AND org_members.role = 'owner'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = org_students.org_id
        AND org_members.user_id = auth.uid()
        AND org_members.role = 'owner'
    )
  );

CREATE POLICY "Org owners can remove students from their org"
  ON org_students FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = org_students.org_id
        AND org_members.user_id = auth.uid()
        AND org_members.role = 'owner'
    )
  );

-- students: can view their own memberships
CREATE POLICY "Students can view their own org memberships"
  ON org_students FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ── 7. Indexes ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_org_students_org_id  ON org_students(org_id);
CREATE INDEX IF NOT EXISTS idx_org_students_user_id ON org_students(user_id);
