/*
  # Enable ai_full_curriculum for Professional plan

  ## Change
  The "ai full curriculum" AI feature is now available on the Professional plan.
  Previously it was restricted to Growth and Enterprise only.

  ## Updates
  - Update all existing orgs on the 'professional' plan to have ai_full_curriculum = true
    in their feature_flags JSONB column.
  - The frontend PLAN_FEATURES constant has been updated to match.
*/

UPDATE organizations
SET feature_flags = jsonb_set(
  COALESCE(feature_flags, '{}'::jsonb),
  '{ai_full_curriculum}',
  'true'::jsonb
)
WHERE plan_tier = 'professional';
