/*
  # Teacher Earnings & Payout System

  ## Business Model
  Industry research (Udemy, Teachable, Thinkific):
  - Udemy marketplace: 37% teacher / 63% platform
  - Teachable hosted: 100% teacher (platform earns via subscriptions)
  - Coursera: ~25-40% teacher depending on agreement
  - Skillshare: royalty pool model

  ## Maximus Academy Revenue Split
  Chosen model: 70% teacher / 30% platform
  Rationale:
  - More competitive than Udemy (37%) to attract quality teachers
  - Platform earns 30% to cover AI infrastructure, hosting, payment processing, support
  - Industry average for self-hosted LMS platforms with AI tools
  - Teachers get strong income incentive to create quality content
  - Platform commission covers 150%+ profit target when combined with AI token revenue

  ## New Tables
  - `teacher_ai_plans` — AI token packs specifically for teachers (standalone, not org-dependent)
  - `teacher_ai_credits` — tracks teacher's personal AI token balance
  - `teacher_earnings` — records every course sale with teacher/platform split
  - `teacher_payouts` — tracks payout requests and status

  ## Revenue Split
  - PLATFORM_COMMISSION = 30% of net course sale
  - TEACHER_SHARE = 70% of net course sale
  - Payment processing fee: ~2.9% + $0.30 AUD (Stripe) — deducted before split
*/

-- ─────────────────────────────────────────────
-- Teacher AI Token Plans (independent of orgs)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS teacher_ai_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  token_amount integer NOT NULL,
  price_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'AUD',
  is_active boolean NOT NULL DEFAULT true,
  is_popular boolean NOT NULL DEFAULT false,
  features jsonb NOT NULL DEFAULT '[]',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE teacher_ai_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view teacher AI plans"
  ON teacher_ai_plans FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE POLICY "Admins can manage teacher AI plans"
  ON teacher_ai_plans FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

CREATE POLICY "Admins can update teacher AI plans"
  ON teacher_ai_plans FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- ─────────────────────────────────────────────
-- Teacher AI Credits
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS teacher_ai_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_balance integer NOT NULL DEFAULT 0,
  total_purchased integer NOT NULL DEFAULT 0,
  total_used integer NOT NULL DEFAULT 0,
  last_purchase_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

ALTER TABLE teacher_ai_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers can view own AI credits"
  ON teacher_ai_credits FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Teachers can insert own AI credits"
  ON teacher_ai_credits FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Teachers can update own AI credits"
  ON teacher_ai_credits FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all teacher AI credits"
  ON teacher_ai_credits FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- ─────────────────────────────────────────────
-- Teacher Earnings (per course sale)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS teacher_earnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  student_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  gross_amount_cents integer NOT NULL DEFAULT 0,
  platform_fee_cents integer NOT NULL DEFAULT 0,
  payment_processing_cents integer NOT NULL DEFAULT 0,
  net_amount_cents integer NOT NULL DEFAULT 0,
  teacher_share_cents integer NOT NULL DEFAULT 0,
  platform_share_cents integer NOT NULL DEFAULT 0,
  teacher_share_pct numeric(5,2) NOT NULL DEFAULT 70.00,
  currency text NOT NULL DEFAULT 'AUD',
  payment_reference text,
  stripe_payment_intent text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'available', 'paid_out', 'refunded')),
  available_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE teacher_earnings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers can view own earnings"
  ON teacher_earnings FOR SELECT
  TO authenticated
  USING (auth.uid() = teacher_id);

CREATE POLICY "Admins can view all earnings"
  ON teacher_earnings FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

CREATE POLICY "System can insert earnings"
  ON teacher_earnings FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'teacher')));

CREATE POLICY "Admins can update earnings"
  ON teacher_earnings FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- ─────────────────────────────────────────────
-- Teacher Payout Requests
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS teacher_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'AUD',
  bank_name text,
  account_name text,
  account_number text,
  bsb text,
  paypal_email text,
  payout_method text NOT NULL DEFAULT 'bank' CHECK (payout_method IN ('bank', 'paypal', 'stripe')),
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'processing', 'completed', 'rejected')),
  notes text,
  processed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

ALTER TABLE teacher_payouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers can view own payouts"
  ON teacher_payouts FOR SELECT
  TO authenticated
  USING (auth.uid() = teacher_id);

CREATE POLICY "Teachers can request payouts"
  ON teacher_payouts FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = teacher_id);

CREATE POLICY "Admins can view all payouts"
  ON teacher_payouts FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

CREATE POLICY "Admins can update payout status"
  ON teacher_payouts FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- ─────────────────────────────────────────────
-- RPC: calculate and record teacher earning on sale
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION record_teacher_earning(
  p_teacher_id uuid,
  p_course_id uuid,
  p_student_id uuid,
  p_gross_cents integer,
  p_stripe_payment_intent text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_processing_cents integer;
  v_net_cents integer;
  v_teacher_cents integer;
  v_platform_cents integer;
  v_id uuid;
BEGIN
  -- Stripe processing fee: 2.9% + A$0.30 = 29 cents + 2.9%
  v_processing_cents := ROUND(p_gross_cents * 0.029) + 30;
  v_net_cents := p_gross_cents - v_processing_cents;
  -- 70% teacher, 30% platform
  v_teacher_cents := ROUND(v_net_cents * 0.70);
  v_platform_cents := v_net_cents - v_teacher_cents;

  INSERT INTO teacher_earnings (
    teacher_id, course_id, student_id,
    gross_amount_cents, payment_processing_cents, net_amount_cents,
    teacher_share_cents, platform_share_cents, teacher_share_pct,
    stripe_payment_intent, status, available_at
  ) VALUES (
    p_teacher_id, p_course_id, p_student_id,
    p_gross_cents, v_processing_cents, v_net_cents,
    v_teacher_cents, v_platform_cents, 70.00,
    p_stripe_payment_intent, 'available', now() + interval '7 days'
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- ─────────────────────────────────────────────
-- RPC: get teacher earnings summary
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_teacher_earnings_summary(p_teacher_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'total_gross_cents', COALESCE(SUM(gross_amount_cents), 0),
    'total_earned_cents', COALESCE(SUM(teacher_share_cents) FILTER (WHERE status != 'refunded'), 0),
    'available_cents', COALESCE(SUM(teacher_share_cents) FILTER (WHERE status = 'available'), 0),
    'paid_out_cents', COALESCE(SUM(teacher_share_cents) FILTER (WHERE status = 'paid_out'), 0),
    'total_sales', COUNT(*) FILTER (WHERE status != 'refunded'),
    'this_month_cents', COALESCE(SUM(teacher_share_cents) FILTER (
      WHERE status != 'refunded'
      AND created_at >= date_trunc('month', now())
    ), 0)
  ) INTO v_result
  FROM teacher_earnings
  WHERE teacher_id = p_teacher_id;

  RETURN v_result;
END;
$$;

-- ─────────────────────────────────────────────
-- RPC: add teacher tokens
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION add_teacher_tokens(
  p_user_id uuid,
  p_tokens integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO teacher_ai_credits (user_id, token_balance, total_purchased, last_purchase_at)
  VALUES (p_user_id, p_tokens, p_tokens, now())
  ON CONFLICT (user_id) DO UPDATE SET
    token_balance = teacher_ai_credits.token_balance + p_tokens,
    total_purchased = teacher_ai_credits.total_purchased + p_tokens,
    last_purchase_at = now(),
    updated_at = now();
END;
$$;

-- ─────────────────────────────────────────────
-- Indexes
-- ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_teacher_earnings_teacher_id ON teacher_earnings(teacher_id);
CREATE INDEX IF NOT EXISTS idx_teacher_earnings_course_id ON teacher_earnings(course_id);
CREATE INDEX IF NOT EXISTS idx_teacher_earnings_status ON teacher_earnings(status);
CREATE INDEX IF NOT EXISTS idx_teacher_payouts_teacher_id ON teacher_payouts(teacher_id);
CREATE INDEX IF NOT EXISTS idx_teacher_ai_credits_user_id ON teacher_ai_credits(user_id);

-- ─────────────────────────────────────────────
-- Seed teacher AI plans
-- ─────────────────────────────────────────────
INSERT INTO teacher_ai_plans (name, description, token_amount, price_cents, is_popular, features, sort_order) VALUES
(
  'Creator',
  'For new teachers building their first courses — AI tools for course outlines and lesson content',
  100,
  699,
  false,
  '["Course outline generation (5 tokens)", "Lesson content writing (8 tokens)", "Quiz generation (6 tokens)", "Flashcard sets (4 tokens)", "Tokens never expire"]',
  1
),
(
  'Pro',
  'Most popular — full AI toolkit for active course creators',
  500,
  2999,
  true,
  '["All Creator features", "Full curriculum generation (20 tokens)", "Presentation slides (10 tokens)", "Exam creation (10 tokens)", "Lesson translations (7 tokens)", "Tokens never expire"]',
  2
),
(
  'Studio',
  'Best value for prolific creators — build entire course catalogues with AI',
  2000,
  9999,
  false,
  '["All Pro features", "Section content & notes (8 tokens each)", "Activity idea generation (4 tokens)", "Content rewriting (5 tokens)", "Priority AI processing", "Tokens never expire"]',
  3
);
