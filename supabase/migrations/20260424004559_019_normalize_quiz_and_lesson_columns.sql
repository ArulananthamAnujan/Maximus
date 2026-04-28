/*
  # Normalize Quiz, Quiz Question, and Lesson Column Names

  The application code uses pass_mark, time_limit_minutes for quizzes,
  and string correct_answer + type field for quiz_questions,
  and article/pdf/link types for lessons.
  
  This migration adds compatible columns so the app code works correctly.

  1. Quizzes table
    - Add `pass_mark` column (integer, alias for pass_percentage)  
    - Add `time_limit_minutes` column (integer, alias for time_limit)

  2. Quiz Questions table
    - Add `type` column (text) for question type: mcq, true_false, short_answer
    - Change `correct_answer` to accept text (add correct_answer_text column)

  3. Lessons table
    - Extend `type` check to include article, pdf, link types
    - Add `url` column for link/external URL lessons
*/

-- Quizzes: add pass_mark and time_limit_minutes as proper columns
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='quizzes' AND column_name='pass_mark') THEN
    ALTER TABLE quizzes ADD COLUMN pass_mark integer NOT NULL DEFAULT 70;
    UPDATE quizzes SET pass_mark = pass_percentage WHERE pass_mark = 70;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='quizzes' AND column_name='time_limit_minutes') THEN
    ALTER TABLE quizzes ADD COLUMN time_limit_minutes integer DEFAULT NULL;
    UPDATE quizzes SET time_limit_minutes = NULLIF(time_limit, 0);
  END IF;
END $$;

-- Quiz Questions: add type column for question type
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='quiz_questions' AND column_name='type') THEN
    ALTER TABLE quiz_questions ADD COLUMN type text NOT NULL DEFAULT 'mcq'
      CHECK (type = ANY (ARRAY['mcq','true_false','short_answer']));
  END IF;
END $$;

-- Quiz Questions: add correct_answer_text to store string correct answers
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='quiz_questions' AND column_name='correct_answer_text') THEN
    ALTER TABLE quiz_questions ADD COLUMN correct_answer_text text DEFAULT '';
  END IF;
END $$;

-- Lessons: drop the restrictive type check and allow article, pdf, link
ALTER TABLE lessons DROP CONSTRAINT IF EXISTS lessons_type_check;
ALTER TABLE lessons DROP CONSTRAINT IF EXISTS lessons_lesson_type_check;

ALTER TABLE lessons ADD CONSTRAINT lessons_type_check
  CHECK (type = ANY (ARRAY['video','text','file','quiz','article','pdf','link']));

ALTER TABLE lessons ADD CONSTRAINT lessons_lesson_type_check
  CHECK (lesson_type = ANY (ARRAY['video','text','file','quiz','article','pdf','link']));

-- Lessons: add url column for external links (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='lessons' AND column_name='url') THEN
    ALTER TABLE lessons ADD COLUMN url text DEFAULT '';
  END IF;
END $$;

-- Lessons: add is_required column (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='lessons' AND column_name='is_required') THEN
    ALTER TABLE lessons ADD COLUMN is_required boolean DEFAULT true;
  END IF;
END $$;
