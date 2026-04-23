/*
  # Seed Sample Data for Maximus Academy

  Uses the existing auth user IDs to populate:
  - Profiles with correct roles
  - Sample courses assigned to teacher
  - Sections, lessons, quiz, assignment
  - Student enrollments and lesson progress
  - Promo codes and announcement
*/

DO $$
DECLARE
  admin_uid   uuid := '6c0e7959-b621-42ce-8598-868a8fc2e073';
  teacher_uid uuid := '494bced9-f191-429c-8b0b-1f19680e4442';
  student_uid uuid := '4bb5f4e6-5ca5-4bfa-a4a0-4974e06ae7c5';
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role, is_active, bio)
  VALUES
    (admin_uid,   'admin@maximus.edu.au',   'Admin User',     'admin',   true, 'Platform administrator for Maximus Academy Australia.'),
    (teacher_uid, 'teacher@maximus.edu.au', 'Sarah Thompson', 'teacher', true, 'Senior Business Communication instructor with 10+ years experience in corporate training.'),
    (student_uid, 'student@maximus.edu.au', 'James Wilson',   'student', true, 'Aspiring business professional based in Sydney, Australia.')
  ON CONFLICT (id) DO UPDATE SET
    role      = EXCLUDED.role,
    full_name = EXCLUDED.full_name,
    bio       = EXCLUDED.bio,
    is_active = true;
END $$;

-- Courses
INSERT INTO public.courses (id, title, short_description, description, thumbnail_url, price, category, level, teacher_id, is_published, is_free, duration_hours, total_lessons, total_students, rating, what_you_learn, requirements)
VALUES
  ('aa000000-0000-0000-0000-000000000001',
   'Business Communication Mastery',
   'Master professional communication skills for the modern Australian workplace.',
   'This comprehensive course covers all aspects of professional business communication, from email writing and presentation skills to negotiation and conflict resolution.',
   'https://images.pexels.com/photos/3184291/pexels-photo-3184291.jpeg',
   299.00, 'Business', 'intermediate',
   '494bced9-f191-429c-8b0b-1f19680e4442',
   true, false, 8, 6, 142, 4.8,
   '["Write clear professional emails","Deliver confident presentations","Negotiate effectively","Resolve workplace conflicts"]'::jsonb,
   '["No prior experience needed","Basic computer literacy"]'::jsonb),

  ('bb000000-0000-0000-0000-000000000002',
   'Digital Marketing Fundamentals',
   'Learn to build and execute winning digital marketing strategies.',
   'From SEO and social media to paid advertising and analytics, this course gives you a comprehensive introduction to digital marketing.',
   'https://images.pexels.com/photos/905163/pexels-photo-905163.jpeg',
   199.00, 'Marketing', 'beginner',
   '494bced9-f191-429c-8b0b-1f19680e4442',
   true, false, 6, 18, 98, 4.6,
   '["Create effective social media campaigns","Understand SEO fundamentals","Run Google Ads","Analyse marketing metrics"]'::jsonb,
   '["Basic computer skills","Interest in marketing"]'::jsonb),

  ('cc000000-0000-0000-0000-000000000003',
   'Introduction to Data Analysis',
   'Get started with data analysis using Excel and Python.',
   'This free introductory course teaches you the fundamentals of data analysis. Perfect for beginners who want to start working with data.',
   'https://images.pexels.com/photos/590022/pexels-photo-590022.jpeg',
   0.00, 'Technology', 'beginner',
   '494bced9-f191-429c-8b0b-1f19680e4442',
   true, true, 4, 12, 256, 4.7,
   '["Understand data types and structures","Use Excel for analysis","Write basic Python scripts","Create data visualisations"]'::jsonb,
   '["No programming experience needed","Microsoft Excel (any version)"]'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- Sections
INSERT INTO public.sections (id, course_id, title, order_index) VALUES
  ('10000000-0000-0000-0000-000000000001', 'aa000000-0000-0000-0000-000000000001', 'Module 1: Foundations of Business Communication', 0),
  ('20000000-0000-0000-0000-000000000002', 'aa000000-0000-0000-0000-000000000001', 'Module 2: Written Communication', 1),
  ('30000000-0000-0000-0000-000000000003', 'aa000000-0000-0000-0000-000000000001', 'Module 3: Presentations & Public Speaking', 2)
ON CONFLICT (id) DO NOTHING;

-- Lessons
INSERT INTO public.lessons (id, section_id, title, type, content, url, order_index, is_required, is_preview, duration_minutes) VALUES
  ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Welcome & Course Overview', 'video', '', 'https://www.w3schools.com/html/mov_bbb.mp4', 0, false, true, 5),
  ('50000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'What is Business Communication?', 'article', 'Business communication is the process of sharing information between people within and outside an organisation. Effective communication is a fundamental management function and a critical skill for all professionals in the modern Australian workplace.', '', 1, true, false, 15),
  ('60000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'Communication Styles & Barriers', 'article', 'Understanding different communication styles helps you adapt your message. The four main styles are assertive, passive, aggressive, and passive-aggressive. Common barriers include cultural differences, language barriers, jargon, and poor listening skills.', '', 2, true, false, 20),
  ('70000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000002', 'Professional Email Writing', 'article', 'Writing professional emails requires mastery of structure and tone. Key elements: a clear subject line, professional greeting, concise body, clear call to action, and appropriate sign-off. Always proofread before sending.', '', 0, true, false, 25),
  ('80000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000002', 'Business Report Writing', 'article', 'Business reports should follow a clear structure: executive summary, introduction, methodology, findings, conclusions, and recommendations. Use clear headings, bullet points, and visual aids to make your report easy to navigate.', '', 1, true, false, 30),
  ('90000000-0000-0000-0000-000000000006', '30000000-0000-0000-0000-000000000003', 'Presentation Design Principles', 'article', 'Effective presentations follow the 10-20-30 rule: no more than 10 slides, no longer than 20 minutes, and font size no smaller than 30 points. Use high-quality images, limit text on slides, and practise your delivery.', '', 0, true, false, 20)
ON CONFLICT (id) DO NOTHING;

-- Enrolments for student
INSERT INTO public.enrollments (student_id, course_id, progress_percent) VALUES
  ('4bb5f4e6-5ca5-4bfa-a4a0-4974e06ae7c5', 'aa000000-0000-0000-0000-000000000001', 35),
  ('4bb5f4e6-5ca5-4bfa-a4a0-4974e06ae7c5', 'cc000000-0000-0000-0000-000000000003', 67)
ON CONFLICT (student_id, course_id) DO NOTHING;

-- Lesson progress for student
INSERT INTO public.lesson_progress (student_id, lesson_id) VALUES
  ('4bb5f4e6-5ca5-4bfa-a4a0-4974e06ae7c5', '40000000-0000-0000-0000-000000000001'),
  ('4bb5f4e6-5ca5-4bfa-a4a0-4974e06ae7c5', '50000000-0000-0000-0000-000000000002')
ON CONFLICT (student_id, lesson_id) DO NOTHING;

-- Quiz
INSERT INTO public.quizzes (id, course_id, title, description, time_limit_minutes, pass_mark, max_attempts, is_required) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'aa000000-0000-0000-0000-000000000001', 'Module 1 Knowledge Check', 'Test your understanding of business communication fundamentals.', 15, 70, 3, true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.quiz_questions (quiz_id, question, type, options, correct_answer, points, order_index) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'Which of the following is a common barrier to effective communication?', 'mcq', '["Active listening","Clear language","Cultural differences","Eye contact"]'::jsonb, 'Cultural differences', 1, 0),
  ('a0000000-0000-0000-0000-000000000001', 'Business communication only occurs within an organisation.', 'true_false', '["True","False"]'::jsonb, 'False', 1, 1),
  ('a0000000-0000-0000-0000-000000000001', 'Name one technique to improve your active listening skills.', 'short_answer', '[]'::jsonb, 'paraphrasing', 1, 2);

-- Assignment
INSERT INTO public.assignments (id, course_id, title, description, due_date, max_marks, is_required) VALUES
  ('b0000000-0000-0000-0000-000000000001', 'aa000000-0000-0000-0000-000000000001', 'Professional Email Draft', 'Write a professional email to a client explaining a project delay. Approximately 200-300 words demonstrating the principles covered in Module 2.', now() + interval '14 days', 100, true)
ON CONFLICT (id) DO NOTHING;

-- Promo codes
INSERT INTO public.promo_codes (code, discount_percent, expires_at, is_active, usage_limit, usage_count, created_by) VALUES
  ('WELCOME20', 20, now() + interval '90 days', true, 100, 3, '6c0e7959-b621-42ce-8598-868a8fc2e073'),
  ('AUSSIE50',  50, now() + interval '30 days', true, 50,  1, '6c0e7959-b621-42ce-8598-868a8fc2e073')
ON CONFLICT (code) DO NOTHING;

-- Announcement
INSERT INTO public.announcements (title, content, created_by, is_active) VALUES
  ('Welcome to Maximus Academy!', 'We are thrilled to have you as part of the Maximus Academy community. Explore our growing library of courses and start your learning journey today. Use code WELCOME20 for 20% off your first course!', '6c0e7959-b621-42ce-8598-868a8fc2e073', true);

-- Activity logs
INSERT INTO public.activity_logs (user_id, action, resource_type, resource_id, details) VALUES
  ('6c0e7959-b621-42ce-8598-868a8fc2e073', 'create', 'course', 'aa000000-0000-0000-0000-000000000001', 'Created course: Business Communication Mastery'),
  ('494bced9-f191-429c-8b0b-1f19680e4442', 'create', 'quiz',   'a0000000-0000-0000-0000-000000000001', 'Created quiz: Module 1 Knowledge Check'),
  ('4bb5f4e6-5ca5-4bfa-a4a0-4974e06ae7c5', 'enroll',  'course', 'aa000000-0000-0000-0000-000000000001', 'Enrolled in: Business Communication Mastery');
