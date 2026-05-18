/*
  # Sync price_amount from price for existing courses

  Some courses have price set but price_amount is NULL or 0.
  This migration backfills price_amount = price where price_amount is missing,
  and sets is_paid correctly based on whether the course has a non-zero price.
*/

UPDATE courses
SET
  price_amount = price,
  is_paid = (is_free = false AND price > 0)
WHERE
  price_amount IS NULL
  OR (price_amount = 0 AND price > 0);
