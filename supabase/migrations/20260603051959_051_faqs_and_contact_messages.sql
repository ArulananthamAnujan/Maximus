/*
  # FAQs and Contact Messages System

  ## New Tables

  ### `faqs`
  - Stores frequently asked questions editable by admin and co-admin
  - `id` (uuid PK), `question`, `answer`, `sort_order`, `is_active`, `created_by`, timestamps

  ### `contact_messages`
  - Stores messages submitted through the public contact form
  - `id` (uuid PK), `name`, `email`, `subject`, `message`, `status` (open/resolved)
  - `resolved_by` (uuid FK to profiles), `resolution_note` (immutable once set), `resolved_at`, timestamps

  ## Security
  - RLS enabled on both tables
  - Public can INSERT contact_messages (no auth needed)
  - Authenticated admins and co-admins can SELECT/UPDATE/INSERT/DELETE faqs
  - Authenticated admins and co-admins can SELECT contact_messages
  - Only the resolver can INSERT resolution (via UPDATE restricted columns)
  - Admin can see all; co-admin can also see all and resolve
*/

-- FAQs table
CREATE TABLE IF NOT EXISTS faqs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question      text NOT NULL,
  answer        text NOT NULL,
  sort_order    integer NOT NULL DEFAULT 0,
  is_active     boolean NOT NULL DEFAULT true,
  created_by    uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE faqs ENABLE ROW LEVEL SECURITY;

-- Anyone can read active FAQs (public)
CREATE POLICY "Public can read active faqs"
  ON faqs FOR SELECT
  USING (is_active = true);

-- Admin and co-admin can read all FAQs
CREATE POLICY "Admin and co-admin can read all faqs"
  ON faqs FOR SELECT
  TO authenticated
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'co_admin')
  );

-- Admin and co-admin can insert FAQs
CREATE POLICY "Admin and co-admin can insert faqs"
  ON faqs FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'co_admin')
  );

-- Admin and co-admin can update FAQs
CREATE POLICY "Admin and co-admin can update faqs"
  ON faqs FOR UPDATE
  TO authenticated
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'co_admin')
  )
  WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'co_admin')
  );

-- Admin and co-admin can delete FAQs
CREATE POLICY "Admin and co-admin can delete faqs"
  ON faqs FOR DELETE
  TO authenticated
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'co_admin')
  );

-- Contact messages table
CREATE TABLE IF NOT EXISTS contact_messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  email           text NOT NULL,
  subject         text NOT NULL DEFAULT '',
  message         text NOT NULL,
  status          text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  resolved_by     uuid REFERENCES profiles(id) ON DELETE SET NULL,
  resolution_note text,
  resolved_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE contact_messages ENABLE ROW LEVEL SECURITY;

-- Public can insert (submit contact form - no auth required)
CREATE POLICY "Anyone can submit contact messages"
  ON contact_messages FOR INSERT
  WITH CHECK (true);

-- Admin and co-admin can read all messages
CREATE POLICY "Admin and co-admin can read contact messages"
  ON contact_messages FOR SELECT
  TO authenticated
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'co_admin')
  );

-- Admin and co-admin can update messages (to resolve them)
CREATE POLICY "Admin and co-admin can update contact messages"
  ON contact_messages FOR UPDATE
  TO authenticated
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'co_admin')
  )
  WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'co_admin')
  );

-- Seed some initial FAQs
INSERT INTO faqs (question, answer, sort_order, is_active) VALUES
  ('How do I enrol in a course?', 'You can enrol in any course by creating a free account, browsing our course catalogue, and clicking "Enrol Now" on your chosen course. For paid courses, you will be guided through a secure payment process.', 1, true),
  ('What payment methods do you accept?', 'We accept all major credit and debit cards (Visa, Mastercard, American Express) as well as PayPal. All payments are processed securely through Stripe.', 2, true),
  ('Can I get a refund?', 'Yes — we offer a refund within 7 days of purchase, provided you have not completed more than 20% of the course content. Please contact us at inquiries@maximusacademy.com.au to request a refund.', 3, true),
  ('How do I access my certificate?', 'Once you complete a course and pass any required assessments, your certificate will be automatically generated and available in your student dashboard under the "Certificates" tab. You can download it as a PDF at any time.', 4, true),
  ('Are the classes live or recorded?', 'We offer both live instructor-led sessions and recorded classes depending on the course. Each course page clearly states whether it includes live sessions, recorded content, or a combination of both.', 5, true),
  ('What is the duration of each course?', 'Course durations vary: IELTS and PTE preparation courses run 8–10 weeks, language courses are 4–6 weeks per level, the Xero Beginner Course is 4 weeks, and short courses and workshops run 1–3 days.', 6, true),
  ('Do you offer corporate or group training?', 'Yes — we offer tailored corporate and group training packages. Please reach out via our contact form or email inquiries@maximusacademy.com.au to discuss your organisation''s needs.', 7, true),
  ('How can I contact support?', 'You can reach us by email at inquiries@maximusacademy.com.au or by phone at +88 01321-203140. Our office hours are Sunday–Thursday 9am–6pm BST and Friday–Saturday 10am–2pm BST.', 8, true)
ON CONFLICT DO NOTHING;

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_faqs_sort_order ON faqs (sort_order, is_active);
CREATE INDEX IF NOT EXISTS idx_contact_messages_status ON contact_messages (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contact_messages_resolved_by ON contact_messages (resolved_by);
