/*
  # Site Settings and Dynamic Course Categories

  1. New Tables
    - `site_settings` — key/value store for platform settings (logo_url, platform_name, etc.)
    - `course_categories` — dynamic categories that admin/teachers can manage

  2. Changes
    - `site_settings`: single-row config table accessible by admins
    - `course_categories`: list of categories with name and optional icon/color

  3. Security
    - RLS on both tables
    - site_settings: only admin can write; anyone can read (for logo display)
    - course_categories: admin can manage; all authenticated users can read

  4. Seed
    - Default categories seeded from existing hardcoded list
    - Default site settings row created
*/

-- site_settings
CREATE TABLE IF NOT EXISTS site_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value text,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE site_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read site settings"
  ON site_settings FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Admins can update site settings"
  ON site_settings FOR UPDATE
  TO authenticated
  USING ((SELECT get_user_role(auth.uid())) = 'admin')
  WITH CHECK ((SELECT get_user_role(auth.uid())) = 'admin');

CREATE POLICY "Admins can insert site settings"
  ON site_settings FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT get_user_role(auth.uid())) = 'admin');

-- Seed default settings
INSERT INTO site_settings (key, value)
VALUES
  ('logo_url', NULL),
  ('platform_name', 'Maximus Academy'),
  ('tagline', 'Learn. Upskill. Achieve.'),
  ('support_email', 'hello@maximus.edu.au'),
  ('support_phone', '+61 2 9123 4567')
ON CONFLICT (key) DO NOTHING;

-- course_categories
CREATE TABLE IF NOT EXISTS course_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  slug text UNIQUE NOT NULL,
  sort_order int DEFAULT 99,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE course_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read active categories"
  ON course_categories FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

CREATE POLICY "Admins can manage categories"
  ON course_categories FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT get_user_role(auth.uid())) IN ('admin', 'teacher'));

CREATE POLICY "Admins can update categories"
  ON course_categories FOR UPDATE
  TO authenticated
  USING ((SELECT get_user_role(auth.uid())) = 'admin')
  WITH CHECK ((SELECT get_user_role(auth.uid())) = 'admin');

CREATE POLICY "Admins can delete categories"
  ON course_categories FOR DELETE
  TO authenticated
  USING ((SELECT get_user_role(auth.uid())) = 'admin');

-- Seed default categories
INSERT INTO course_categories (name, slug, sort_order)
VALUES
  ('IELTS', 'ielts', 1),
  ('PTE', 'pte', 2),
  ('Language', 'language', 3),
  ('Business', 'business', 4),
  ('Technology', 'technology', 5),
  ('Finance', 'finance', 6),
  ('Xero', 'xero', 7),
  ('General', 'general', 8)
ON CONFLICT (name) DO NOTHING;
