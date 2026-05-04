/*
  # Organizations & Token-Based AI Payment System

  ## Overview
  Introduces a multi-tenant organization model so companies can purchase token packages,
  manage their own teachers/courses, and control AI generation spending.

  ## New Tables
  - organizations: Company/institution with master token balance
  - org_members: Links users to org with role (owner | teacher)
  - token_packages: Purchasable token bundles catalog
  - token_purchases: Ledger of every token top-up
  - token_usage_log: Per-AI-call deduction record tied to org + user

  ## Modified Tables
  - profiles: role CHECK extended to include 'org_admin'
  - courses: org_id FK added

  ## Security
  - RLS enabled on all new tables
  - Policies added after all tables exist to avoid forward-reference errors
*/

-- ── 1. Extend role CHECK ─────────────────────────────────────────────────────
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'teacher', 'student', 'org_admin'));

-- ── 2. organizations ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS organizations (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name               text NOT NULL,
  slug               text UNIQUE NOT NULL,
  logo_url           text,
  website            text,
  description        text,
  token_balance      integer NOT NULL DEFAULT 0 CHECK (token_balance >= 0),
  plan_tier          text NOT NULL DEFAULT 'starter' CHECK (plan_tier IN ('starter','growth','enterprise')),
  is_active          boolean NOT NULL DEFAULT true,
  stripe_customer_id text,
  created_by         uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at         timestamptz DEFAULT now(),
  updated_at         timestamptz DEFAULT now()
);

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- ── 3. org_members ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS org_members (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role        text NOT NULL DEFAULT 'teacher' CHECK (role IN ('owner', 'teacher')),
  invited_by  uuid REFERENCES profiles(id) ON DELETE SET NULL,
  joined_at   timestamptz DEFAULT now(),
  UNIQUE (org_id, user_id)
);

ALTER TABLE org_members ENABLE ROW LEVEL SECURITY;

-- ── 4. Add org_id to courses ─────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'courses' AND column_name = 'org_id'
  ) THEN
    ALTER TABLE courses ADD COLUMN org_id uuid REFERENCES organizations(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_courses_org_id ON courses(org_id);

-- ── 5. token_packages ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS token_packages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  description     text,
  token_amount    integer NOT NULL CHECK (token_amount > 0),
  price_cents     integer NOT NULL CHECK (price_cents > 0),
  currency        text NOT NULL DEFAULT 'usd',
  is_active       boolean NOT NULL DEFAULT true,
  is_popular      boolean NOT NULL DEFAULT false,
  stripe_price_id text,
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE token_packages ENABLE ROW LEVEL SECURITY;

-- ── 6. token_purchases ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS token_purchases (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  package_id          uuid REFERENCES token_packages(id) ON DELETE SET NULL,
  purchased_by        uuid REFERENCES profiles(id) ON DELETE SET NULL,
  token_amount        integer NOT NULL CHECK (token_amount > 0),
  amount_paid_cents   integer NOT NULL DEFAULT 0,
  currency            text NOT NULL DEFAULT 'usd',
  stripe_session_id   text,
  stripe_payment_id   text,
  status              text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','failed','refunded')),
  notes               text,
  created_at          timestamptz DEFAULT now(),
  completed_at        timestamptz
);

ALTER TABLE token_purchases ENABLE ROW LEVEL SECURITY;

-- ── 7. token_usage_log ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS token_usage_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  ai_task         text NOT NULL,
  tokens_deducted integer NOT NULL CHECK (tokens_deducted > 0),
  ai_log_id       uuid REFERENCES ai_usage_logs(id) ON DELETE SET NULL,
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE token_usage_log ENABLE ROW LEVEL SECURITY;

-- ── 8. RLS Policies (all tables exist now) ───────────────────────────────────

-- organizations: super-admin
CREATE POLICY "Admins can view all organizations"
  ON organizations FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can insert organizations"
  ON organizations FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can update organizations"
  ON organizations FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- organizations: org_admin (owner) can see/edit own org
CREATE POLICY "Org owners can view own organization"
  ON organizations FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = organizations.id
        AND org_members.user_id = auth.uid()
        AND org_members.role = 'owner'
    )
  );

CREATE POLICY "Org owners can update own organization"
  ON organizations FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = organizations.id
        AND org_members.user_id = auth.uid()
        AND org_members.role = 'owner'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = organizations.id
        AND org_members.user_id = auth.uid()
        AND org_members.role = 'owner'
    )
  );

-- org_members: org members can see their own record
CREATE POLICY "Members can view their own membership"
  ON org_members FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- org_members: admins full access
CREATE POLICY "Admins can view all org members"
  ON org_members FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can insert org members"
  ON org_members FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can update org members"
  ON org_members FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can delete org members"
  ON org_members FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- org_members: org owners can manage their org members
CREATE POLICY "Org owners can view their org members"
  ON org_members FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM org_members om2
      WHERE om2.org_id = org_members.org_id
        AND om2.user_id = auth.uid()
        AND om2.role = 'owner'
    )
  );

CREATE POLICY "Org owners can insert members into their org"
  ON org_members FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM org_members om2
      WHERE om2.org_id = org_id
        AND om2.user_id = auth.uid()
        AND om2.role = 'owner'
    )
  );

CREATE POLICY "Org owners can delete members from their org"
  ON org_members FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM org_members om2
      WHERE om2.org_id = org_members.org_id
        AND om2.user_id = auth.uid()
        AND om2.role = 'owner'
    )
  );

-- token_packages: all authenticated can view active packages
CREATE POLICY "Authenticated users can view active token packages"
  ON token_packages FOR SELECT TO authenticated
  USING (is_active = true OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can insert token packages"
  ON token_packages FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can update token packages"
  ON token_packages FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- token_purchases: admins
CREATE POLICY "Admins can view all token purchases"
  ON token_purchases FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can insert token purchases"
  ON token_purchases FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can update token purchases"
  ON token_purchases FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- token_purchases: org owners can view/insert for their org
CREATE POLICY "Org owners can view their org token purchases"
  ON token_purchases FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = token_purchases.org_id
        AND org_members.user_id = auth.uid()
        AND org_members.role = 'owner'
    )
  );

CREATE POLICY "Org owners can insert token purchases for their org"
  ON token_purchases FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = org_id
        AND org_members.user_id = auth.uid()
        AND org_members.role = 'owner'
    )
  );

-- token_usage_log: admins
CREATE POLICY "Admins can view all token usage"
  ON token_usage_log FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- token_usage_log: org owners
CREATE POLICY "Org owners can view their org token usage"
  ON token_usage_log FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.org_id = token_usage_log.org_id
        AND org_members.user_id = auth.uid()
        AND org_members.role = 'owner'
    )
  );

-- token_usage_log: individual members see own usage
CREATE POLICY "Members can view their own token usage"
  ON token_usage_log FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ── 9. RPC: deduct_org_tokens (called by ai-generate edge function) ──────────
CREATE OR REPLACE FUNCTION deduct_org_tokens(
  p_org_id        uuid,
  p_user_id       uuid,
  p_ai_task       text,
  p_tokens        integer,
  p_ai_log_id     uuid DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_balance integer;
BEGIN
  SELECT token_balance INTO v_balance
  FROM organizations
  WHERE id = p_org_id
  FOR UPDATE;

  IF v_balance IS NULL OR v_balance < p_tokens THEN
    RETURN false;
  END IF;

  UPDATE organizations
  SET token_balance = token_balance - p_tokens,
      updated_at = now()
  WHERE id = p_org_id;

  INSERT INTO token_usage_log (org_id, user_id, ai_task, tokens_deducted, ai_log_id)
  VALUES (p_org_id, p_user_id, p_ai_task, p_tokens, p_ai_log_id);

  RETURN true;
END;
$$;

-- ── 10. RPC: grant_org_tokens (admin manually tops up) ───────────────────────
CREATE OR REPLACE FUNCTION grant_org_tokens(
  p_org_id  uuid,
  p_tokens  integer,
  p_notes   text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  UPDATE organizations
  SET token_balance = token_balance + p_tokens,
      updated_at = now()
  WHERE id = p_org_id;

  INSERT INTO token_purchases (org_id, token_amount, amount_paid_cents, status, notes, purchased_by, completed_at)
  VALUES (p_org_id, p_tokens, 0, 'completed', COALESCE(p_notes, 'Manual grant by admin'), auth.uid(), now());
END;
$$;

-- ── 11. Seed default token packages ──────────────────────────────────────────
INSERT INTO token_packages (name, description, token_amount, price_cents, is_popular)
VALUES
  ('Starter',    '500 AI tokens — great for trying out course generation',       500,   1900, false),
  ('Growth',     '2,000 AI tokens — perfect for active course creators',         2000,  4900, true),
  ('Pro',        '5,000 AI tokens — for power users building full curricula',    5000,  9900, false),
  ('Enterprise', '20,000 AI tokens — unlimited-feel for large organisations',    20000, 29900, false)
ON CONFLICT DO NOTHING;

-- ── 12. Indexes ───────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_org_members_user_id  ON org_members(user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_org_id   ON org_members(org_id);
CREATE INDEX IF NOT EXISTS idx_token_usage_org_id   ON token_usage_log(org_id);
CREATE INDEX IF NOT EXISTS idx_token_usage_user_id  ON token_usage_log(user_id);
CREATE INDEX IF NOT EXISTS idx_token_purchases_org  ON token_purchases(org_id);
