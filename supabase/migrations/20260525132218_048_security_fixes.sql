/*
  # Security fixes

  1. announcements SELECT policy — require authentication (was open to anonymous)
  2. activity_logs INSERT policy — restrict to own user_id only (was allow any authenticated user to log as anyone)
  3. deduct_org_tokens RPC — verify caller is an active member of the org before deducting tokens
*/

-- ── 1. announcements: require authentication for SELECT ──────────────────────
DROP POLICY IF EXISTS "Anyone can view active announcements" ON announcements;

CREATE POLICY "Authenticated users can view active announcements"
  ON announcements FOR SELECT TO authenticated
  USING (is_active = true);

-- ── 2. activity_logs: users may only insert rows for themselves ───────────────
DROP POLICY IF EXISTS "System can insert activity logs" ON activity_logs;

CREATE POLICY "Users can insert own activity logs"
  ON activity_logs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- ── 3. deduct_org_tokens: verify org membership before deducting ─────────────
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
  -- Verify the calling user is an active member of the organisation
  IF NOT EXISTS (
    SELECT 1 FROM org_members
    WHERE org_id = p_org_id
      AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Forbidden: caller is not a member of this organisation';
  END IF;

  -- p_user_id must match the authenticated caller
  IF p_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Forbidden: p_user_id does not match authenticated user';
  END IF;

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
