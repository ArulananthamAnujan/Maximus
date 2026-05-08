/*
  # Update token package pricing for profitability

  ## Business Logic
  - AI generation cost (full_curriculum): ~$0.30 USD per generation
  - Full curriculum costs 20 tokens
  - Target revenue: $1.99 per full_curriculum generation
  - Therefore: target price per token = $1.99 / 20 = ~$0.0995
  - Packages are priced at ~$0.10/token with volume discounts for higher tiers

  ## New Pricing
  - Starter:      200 tokens  = $19.99 AUD  ($0.10/token)
  - Professional: 1,000 tokens = $89.99 AUD  ($0.09/token)
  - Business:     3,000 tokens = $249.99 AUD ($0.083/token)
  - Enterprise:   10,000 tokens = $749.99 AUD ($0.075/token)

  ## Token Cost Reference (unchanged)
  - full_curriculum:    20 tokens = ~$1.99 at Starter pricing
  - lesson_content:      8 tokens = ~$0.80
  - presentation_slides: 10 tokens = ~$1.00
  - generate_exam:       10 tokens = ~$1.00
  - course_outline:       5 tokens = ~$0.50
*/

UPDATE token_packages SET
  price_cents = 1999,
  description = '200 AI tokens — perfect for small teams testing the platform. ~10 full curriculum generations.'
WHERE plan_tier = 'starter';

UPDATE token_packages SET
  price_cents = 8999,
  description = '1,000 AI tokens — for active course creators with full AI access. ~50 full curriculum generations.'
WHERE plan_tier = 'professional';

UPDATE token_packages SET
  price_cents = 24999,
  description = '3,000 AI tokens — full feature set including exams & presentations. ~150 full curriculum generations.'
WHERE plan_tier = 'growth';

UPDATE token_packages SET
  price_cents = 74999,
  description = '10,000 AI tokens — unlimited-feel for large training departments. ~500 full curriculum generations.'
WHERE plan_tier = 'enterprise';
