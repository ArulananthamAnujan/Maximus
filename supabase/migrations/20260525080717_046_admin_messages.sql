/*
  # Admin Messages Table

  1. New Tables
    - `admin_messages`
      - `id` (uuid, primary key)
      - `from_user_id` (uuid, sender — admin/co_admin)
      - `to_user_id` (uuid, recipient)
      - `subject` (text)
      - `body` (text)
      - `is_read` (boolean, default false)
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS
    - Admins/co_admins can insert messages (sender = themselves)
    - Recipients can read their own messages
    - Recipients can update is_read on their own messages
    - Admins/co_admins can read all messages they sent
*/

CREATE TABLE IF NOT EXISTS admin_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  to_user_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject      text NOT NULL DEFAULT '',
  body         text NOT NULL DEFAULT '',
  is_read      boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_messages_to_user_idx  ON admin_messages(to_user_id);
CREATE INDEX IF NOT EXISTS admin_messages_from_user_idx ON admin_messages(from_user_id);

ALTER TABLE admin_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and co_admins can send messages"
  ON admin_messages FOR INSERT
  TO authenticated
  WITH CHECK (
    from_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'co_admin')
    )
  );

CREATE POLICY "Recipients can read their messages"
  ON admin_messages FOR SELECT
  TO authenticated
  USING (to_user_id = auth.uid());

CREATE POLICY "Senders can read messages they sent"
  ON admin_messages FOR SELECT
  TO authenticated
  USING (from_user_id = auth.uid());

CREATE POLICY "Recipients can mark messages as read"
  ON admin_messages FOR UPDATE
  TO authenticated
  USING (to_user_id = auth.uid())
  WITH CHECK (to_user_id = auth.uid());
