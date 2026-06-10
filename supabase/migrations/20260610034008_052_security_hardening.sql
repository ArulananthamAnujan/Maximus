-- 1. Enforce resolution_note immutability at DB level
--    Once resolution_note is set (non-null), it cannot be changed.
CREATE OR REPLACE FUNCTION lock_resolution_note()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.resolution_note IS NOT NULL AND NEW.resolution_note IS DISTINCT FROM OLD.resolution_note THEN
    RAISE EXCEPTION 'resolution_note cannot be modified once set';
  END IF;
  -- Also prevent reverting status from resolved → open
  IF OLD.status = 'resolved' AND NEW.status = 'open' THEN
    RAISE EXCEPTION 'A resolved message cannot be re-opened';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_lock_resolution_note
BEFORE UPDATE ON contact_messages
FOR EACH ROW EXECUTE FUNCTION lock_resolution_note();

-- 2. Add field length constraints to contact_messages
ALTER TABLE contact_messages
  ADD CONSTRAINT contact_messages_name_length    CHECK (char_length(name)    BETWEEN 1 AND 200),
  ADD CONSTRAINT contact_messages_email_length   CHECK (char_length(email)   BETWEEN 3 AND 200),
  ADD CONSTRAINT contact_messages_subject_length CHECK (char_length(subject) <= 200),
  ADD CONSTRAINT contact_messages_message_length CHECK (char_length(message) BETWEEN 1 AND 5000);

-- 3. Add length constraints to faqs
ALTER TABLE faqs
  ADD CONSTRAINT faqs_question_length CHECK (char_length(question) BETWEEN 1 AND 500),
  ADD CONSTRAINT faqs_answer_length   CHECK (char_length(answer)   BETWEEN 1 AND 5000);

-- 4. Index to speed up public FAQ queries
CREATE INDEX IF NOT EXISTS idx_faqs_active ON faqs (is_active, sort_order) WHERE is_active = true;
