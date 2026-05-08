/*
  # Student AI Plans

  ## Overview
  Introduces individual AI plans for students — separate from org-level token packages.
  Students can purchase AI token credits to use AI features like lesson summaries,
  flashcard generation, activity ideas, and quiz assistance directly in the course player.

  ## Pricing Logic (150% profit margin)
  - Actual AI API cost: ~$0.015 USD per token (amortised across task types)
  - 150% profit = charge 2.5x cost = ~$0.0375 USD per token
  - Converted to AUD at ~1.55 rate = ~$0.058 AUD per token
  - Packages priced with slight volume discounts for higher tiers

  ## New Tables
  - `student_ai_plans` — available plan tiers (read-only catalogue)
  - `student_ai_credits` — tracks each student's current token balance
  - `student_ai_usage_logs` — logs every student AI generation

  ## Token Costs for Student Tasks
  - summarize_lesson: 3 tokens
  - flashcards: 4 tokens
  - activity_ideas: 4 tokens
  - quiz_from_content: 6 tokens
*/

-- Plan catalogue
CREATE TABLE IF NOT EXISTS student_ai_plans (
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

ALTER TABLE student_ai_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active student AI plans"
  ON student_ai_plans FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE POLICY "Admins can manage student AI plans"
  ON student_ai_plans FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

CREATE POLICY "Admins can update student AI plans"
  ON student_ai_plans FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- Student credit balances
CREATE TABLE IF NOT EXISTS student_ai_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_balance integer NOT NULL DEFAULT 0,
  total_purchased integer NOT NULL DEFAULT 0,
  total_used integer NOT NULL DEFAULT 0,
  last_purchase_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

ALTER TABLE student_ai_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students can view own credits"
  ON student_ai_credits FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Students can insert own credits"
  ON student_ai_credits FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Students can update own credits"
  ON student_ai_credits FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all student credits"
  ON student_ai_credits FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- Student AI usage log
CREATE TABLE IF NOT EXISTS student_ai_usage_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ai_task text NOT NULL,
  tokens_used integer NOT NULL DEFAULT 0,
  course_id uuid REFERENCES courses(id) ON DELETE SET NULL,
  lesson_id uuid REFERENCES lessons(id) ON DELETE SET NULL,
  success boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE student_ai_usage_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students can view own usage logs"
  ON student_ai_usage_logs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Students can insert own usage logs"
  ON student_ai_usage_logs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all usage logs"
  ON student_ai_usage_logs FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- RPC to deduct student tokens
CREATE OR REPLACE FUNCTION deduct_student_tokens(
  p_user_id uuid,
  p_tokens integer,
  p_ai_task text,
  p_course_id uuid DEFAULT NULL,
  p_lesson_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_balance integer;
BEGIN
  SELECT token_balance INTO v_balance
  FROM student_ai_credits
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF v_balance IS NULL OR v_balance < p_tokens THEN
    RETURN false;
  END IF;

  UPDATE student_ai_credits
  SET token_balance = token_balance - p_tokens,
      total_used = total_used + p_tokens,
      updated_at = now()
  WHERE user_id = p_user_id;

  INSERT INTO student_ai_usage_logs (user_id, ai_task, tokens_used, course_id, lesson_id)
  VALUES (p_user_id, p_ai_task, p_tokens, p_course_id, p_lesson_id);

  RETURN true;
END;
$$;

-- RPC to add student tokens (after purchase)
CREATE OR REPLACE FUNCTION add_student_tokens(
  p_user_id uuid,
  p_tokens integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO student_ai_credits (user_id, token_balance, total_purchased, last_purchase_at)
  VALUES (p_user_id, p_tokens, p_tokens, now())
  ON CONFLICT (user_id) DO UPDATE SET
    token_balance = student_ai_credits.token_balance + p_tokens,
    total_purchased = student_ai_credits.total_purchased + p_tokens,
    last_purchase_at = now(),
    updated_at = now();
END;
$$;

-- Seed plan catalogue
INSERT INTO student_ai_plans (name, description, token_amount, price_cents, is_popular, features, sort_order) VALUES
(
  'Starter',
  'Perfect for occasional use — get AI-powered summaries, flashcards and activities',
  50,
  299,
  false,
  '["Lesson summaries (3 tokens each)", "Flashcard generation (4 tokens each)", "Activity ideas (4 tokens each)", "Valid forever — never expires"]',
  1
),
(
  'Standard',
  'Most popular for regular learners who want AI assistance throughout their courses',
  200,
  999,
  true,
  '["Lesson summaries (3 tokens each)", "Flashcard generation (4 tokens each)", "Activity ideas (4 tokens each)", "Quiz assistance (6 tokens each)", "Valid forever — never expires"]',
  2
),
(
  'Premium',
  'Best value for power learners — AI assistance for every lesson in every course',
  600,
  2499,
  false,
  '["Lesson summaries (3 tokens each)", "Flashcard generation (4 tokens each)", "Activity ideas (4 tokens each)", "Quiz assistance (6 tokens each)", "Priority AI processing", "Valid forever — never expires"]',
  3
);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_student_ai_credits_user_id ON student_ai_credits(user_id);
CREATE INDEX IF NOT EXISTS idx_student_ai_usage_logs_user_id ON student_ai_usage_logs(user_id);
