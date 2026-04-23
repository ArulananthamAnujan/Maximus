/*
  # Add Maximus Academy Course Catalog

  Inserts 8 specific courses for Maximus Academy Australia:
  1. IELTS Preparation
  2. PTE Preparation
  3. Japanese Language Course
  4. French Language Course
  5. Spanish Language Course
  6. Xero Beginner Course
  7. Test Preparation (General)
  8. Short Courses & Workshops

  Uses the teacher profile ID from the seeded data.
  Courses use ON CONFLICT DO NOTHING to avoid duplicates.
*/

DO $$
DECLARE
  teacher_id uuid;
BEGIN
  SELECT id INTO teacher_id FROM public.profiles WHERE role = 'teacher' LIMIT 1;

  INSERT INTO public.courses (id, title, short_description, description, category, level, price, is_free, duration_hours, total_lessons, thumbnail_url, teacher_id, is_published, is_archived, rating, total_students)
  VALUES
    (
      gen_random_uuid(),
      'IELTS Preparation',
      'Comprehensive IELTS preparation covering all four skills: Listening, Reading, Writing, and Speaking.',
      'Our IELTS Preparation course is designed to help you achieve your target band score. We cover all four test components with expert-led strategies, practice tests, and personalised feedback. Whether you are aiming for Band 6, 7, or higher, our structured program gives you the skills and confidence to succeed.',
      'Test Preparation',
      'beginner',
      450.00,
      false,
      40,
      32,
      'https://images.pexels.com/photos/4144923/pexels-photo-4144923.jpeg',
      teacher_id,
      true,
      false,
      4.8,
      127
    ),
    (
      gen_random_uuid(),
      'PTE Academic Preparation',
      'Master the PTE Academic exam with targeted practice, AI-scored mock tests, and proven strategies.',
      'The PTE Academic Preparation course provides an intensive study program covering all PTE question types. You will learn time management strategies, practise with realistic mock tests, and receive detailed performance analysis to identify and improve your weak areas.',
      'Test Preparation',
      'intermediate',
      420.00,
      false,
      36,
      28,
      'https://images.pexels.com/photos/5427869/pexels-photo-5427869.jpeg',
      teacher_id,
      true,
      false,
      4.7,
      98
    ),
    (
      gen_random_uuid(),
      'Japanese Language Course',
      'Learn Japanese from scratch — hiragana, katakana, kanji, and everyday conversation.',
      'This Japanese Language Course takes you from complete beginner to conversational proficiency. You will master the writing systems (hiragana, katakana, and essential kanji), build vocabulary, study grammar, and practise real-world conversations. Ideal for travel, work, or cultural interest.',
      'Language Learning',
      'beginner',
      380.00,
      false,
      48,
      36,
      'https://images.pexels.com/photos/5926382/pexels-photo-5926382.jpeg',
      teacher_id,
      true,
      false,
      4.9,
      74
    ),
    (
      gen_random_uuid(),
      'French Language Course',
      'Speak French with confidence — from bonjour to business conversations.',
      'Our French Language Course is perfect for beginners and intermediate learners. You will develop all four language skills through interactive lessons, audio exercises, and live conversation practice. By the end, you will be ready for travel, study, or professional use in French-speaking environments.',
      'Language Learning',
      'beginner',
      360.00,
      false,
      45,
      34,
      'https://images.pexels.com/photos/5935791/pexels-photo-5935791.jpeg',
      teacher_id,
      true,
      false,
      4.8,
      62
    ),
    (
      gen_random_uuid(),
      'Spanish Language Course',
      'From hola to fluent — learn Spanish for travel, work, and everyday life.',
      'Spanish is one of the world''s most spoken languages. This course covers pronunciation, grammar, vocabulary, and conversation for beginners through to intermediate levels. Our immersive approach ensures you build real-world language skills quickly and effectively.',
      'Language Learning',
      'beginner',
      360.00,
      false,
      45,
      34,
      'https://images.pexels.com/photos/5935234/pexels-photo-5935234.jpeg',
      teacher_id,
      true,
      false,
      4.7,
      55
    ),
    (
      gen_random_uuid(),
      'Xero Beginner Course',
      'Get job-ready with Xero — the cloud accounting software used by thousands of businesses.',
      'This hands-on Xero Beginner Course teaches you to set up and manage accounts, process invoices, reconcile bank transactions, run payroll, and generate financial reports. Perfect for small business owners, bookkeepers, and administrative professionals looking to add a sought-after skill.',
      'Professional Skills',
      'beginner',
      320.00,
      false,
      20,
      18,
      'https://images.pexels.com/photos/6693661/pexels-photo-6693661.jpeg',
      teacher_id,
      true,
      false,
      4.6,
      143
    ),
    (
      gen_random_uuid(),
      'General Test Preparation',
      'Build study skills and exam strategies for academic and professional tests.',
      'This General Test Preparation course equips students with essential study techniques, time management skills, critical thinking strategies, and exam-specific approaches applicable across a wide range of tests. Ideal for students preparing for university entrance exams, professional certifications, or general academic assessments.',
      'Test Preparation',
      'beginner',
      280.00,
      false,
      24,
      20,
      'https://images.pexels.com/photos/4144101/pexels-photo-4144101.jpeg',
      teacher_id,
      true,
      false,
      4.5,
      89
    ),
    (
      gen_random_uuid(),
      'Short Courses & Workshops',
      'Intensive skill-building workshops designed for busy professionals and lifelong learners.',
      'Our Short Courses & Workshops series offers focused, high-impact learning experiences in a condensed format. Each workshop targets a specific skill — from communication and leadership to digital literacy and personal development. Perfect for professionals seeking to upskill quickly without a long-term commitment.',
      'Professional Skills',
      'beginner',
      150.00,
      false,
      8,
      10,
      'https://images.pexels.com/photos/3184465/pexels-photo-3184465.jpeg',
      teacher_id,
      true,
      false,
      4.6,
      201
    )
  ON CONFLICT DO NOTHING;
END $$;
