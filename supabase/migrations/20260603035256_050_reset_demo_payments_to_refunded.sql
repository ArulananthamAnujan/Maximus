/*
  # Reset demo/seeded payments to refunded

  ## Summary
  Marks all existing seeded/demo payment records as 'refunded' so they no
  longer count toward real revenue figures. This resets the revenue dashboard
  to zero so only genuine future payments are tracked going forward.

  ## Changes
  - Updates all existing payments with status 'completed' to 'refunded'

  ## Notes
  - Records are preserved for audit purposes, not deleted
  - Real payments going forward will use 'completed' status as normal
*/

UPDATE payments
SET status = 'refunded'
WHERE status = 'completed';
