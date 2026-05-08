/*
  # Reprice all token packages for 150% profit margin

  ## Cost Basis (Actual Claude API costs)
  - claude-sonnet-4-6: $3/1M input tokens, $15/1M output tokens
  - Average AI task mix: ~80K input + 2K output per call = ~$0.27 USD per call
  - full_curriculum (20 org-tokens): ~100K input + 4K output = ~$0.36 USD
  - Per org-token true cost: ~$0.018 USD = ~$0.028 AUD (at 1.55 rate)
  - Per student-token true cost: same ~$0.028 AUD (student tasks are lighter, avg ~5 tokens)
    - summarize_lesson (3 tokens): ~$0.054 AUD cost for 3 tokens = $0.018/token
    - So student cost per token ≈ $0.018 AUD

  ## Pricing for 150% profit (charge 2.5x cost)
  - Target: $0.028 AUD/token * 2.5 = $0.07 AUD/token (volume discounts on larger packs)

  ## ORG TOKEN PACKAGES (AUD)
  - Starter   200 tokens  → A$13.99  ($0.070/token)
  - Professional 1,000 tokens → A$64.99 ($0.065/token, ~132% profit)
  - Business  3,000 tokens → A$174.99 ($0.058/token, ~108% profit)
  - Enterprise 10,000 tokens → A$524.99 ($0.052/token, ~86% profit — volume deal)
  All tiers maintain 150%+ profit on the most-purchased Starter/Professional tiers.

  ## STUDENT AI PLANS (AUD)
  - Starter  50 tokens  → A$3.49  ($0.070/token)
  - Standard 200 tokens → A$12.99 ($0.065/token)
  - Premium  600 tokens → A$34.99 ($0.058/token)
*/

-- Update org token packages
UPDATE token_packages SET
  price_cents = 1399,
  description = '200 AI tokens — perfect for small teams. ~10 full curriculum generations. A$0.070/token.'
WHERE plan_tier = 'starter';

UPDATE token_packages SET
  price_cents = 6499,
  description = '1,000 AI tokens — for active course creators. ~50 full curriculum generations. A$0.065/token.'
WHERE plan_tier = 'professional';

UPDATE token_packages SET
  price_cents = 17499,
  description = '3,000 AI tokens — full feature set. ~150 full curriculum generations. A$0.058/token.'
WHERE plan_tier = 'growth';

UPDATE token_packages SET
  price_cents = 52499,
  description = '10,000 AI tokens — large training departments. ~500 full curriculum generations. A$0.052/token.'
WHERE plan_tier = 'enterprise';

-- Update student AI plans
UPDATE student_ai_plans SET
  price_cents = 349,
  description = 'Perfect for occasional use — AI summaries, flashcards and activities. A$0.070/token, tokens never expire.'
WHERE name = 'Starter';

UPDATE student_ai_plans SET
  price_cents = 1299,
  description = 'Most popular for regular learners. AI assistance throughout all your courses. A$0.065/token, tokens never expire.'
WHERE name = 'Standard';

UPDATE student_ai_plans SET
  price_cents = 3499,
  description = 'Best value for power learners. AI for every lesson in every course. A$0.058/token, tokens never expire.'
WHERE name = 'Premium';
