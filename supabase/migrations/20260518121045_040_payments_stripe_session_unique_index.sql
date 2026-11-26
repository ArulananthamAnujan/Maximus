/*
  # Partial unique index on payments.stripe_session_id

  Creates a unique index only for non-null stripe_session_id values,
  enabling idempotent upserts from both the webhook and verify-session function.
*/

ALTER TABLE payments ADD COLUMN IF NOT EXISTS stripe_session_id text;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS stripe_payment_id text;

-- Rows created before Stripe was wired up carry an empty string, which is not a real
-- session id; without this the unique index cannot be built on a fresh database.
UPDATE payments SET stripe_session_id = NULL WHERE stripe_session_id = '';
ALTER TABLE payments ALTER COLUMN stripe_session_id SET DEFAULT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS payments_stripe_session_id_uidx
  ON payments (stripe_session_id)
  WHERE stripe_session_id IS NOT NULL;
