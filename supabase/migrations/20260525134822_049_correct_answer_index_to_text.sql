/*
  # Convert correct_answer from integer index to option text

  ## Problem
  The quiz_questions table stores correct_answer as an integer index (0, 1, 2…)
  referencing the options array, but the application code treats it as a string
  (the actual option text). This mismatch causes no answer to ever be highlighted
  and teachers cannot update answers via the UI.

  ## Changes
  1. Convert all existing rows: replace the integer index with the corresponding
     options[index] text value.
  2. Alter the column type from integer to text.

  ## Notes
  - Uses options[correct_answer::int] array subscript (1-based in Postgres, but
    jsonb arrays are 0-based via jsonb_array_element).
  - Rows where correct_answer is already NULL or out of range are set to ''.
*/

-- Step 1: add a temporary text column
ALTER TABLE quiz_questions ADD COLUMN IF NOT EXISTS correct_answer_text text DEFAULT '';

-- Step 2: populate it by resolving the index against the options jsonb array
UPDATE quiz_questions
SET correct_answer_text = COALESCE(
  options->(correct_answer::int)#>>'{}',
  ''
)
WHERE correct_answer IS NOT NULL;

-- Step 3: drop the old integer column and rename the text one
ALTER TABLE quiz_questions DROP COLUMN correct_answer;
ALTER TABLE quiz_questions RENAME COLUMN correct_answer_text TO correct_answer;
