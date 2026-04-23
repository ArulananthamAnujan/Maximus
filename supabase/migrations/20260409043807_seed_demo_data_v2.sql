
/*
  # Seed Demo Data for All Roles (v2)

  Corrected column names and constraint values:
  - quiz_questions.type uses 'mcq' not 'multiple_choice'
  - sections uses order_index not position
  - lessons uses type 'video','pdf','article','link'
  - certificates uses certificate_id column
  - promo_codes uses usage_limit and usage_count
  - announcements uses created_by not author_id, no target_type
*/

DO $$
DECLARE
  v_teacher_id uuid := '494bced9-f191-429c-8b0b-1f19680e4442';
  v_student_id uuid := '4bb5f4e6-5ca5-4bfa-a4a0-4974e06ae7c5';
  v_admin_id   uuid := '6c0e7959-b621-42ce-8598-868a8fc2e073';
  v_course1    uuid := '9170d2af-8369-4dc4-86f5-5806db1f2ddb';
  v_course2    uuid := 'd531dc2a-7cc2-461d-a769-9b006a016dea';
  v_course3    uuid := '87db5187-4f0e-4c69-927f-938556fa7097';
  v_assign1    uuid := gen_random_uuid();
  v_assign2    uuid := gen_random_uuid();
  v_quiz1      uuid := gen_random_uuid();
  v_cert_id    uuid := gen_random_uuid();
  v_section1   uuid := gen_random_uuid();
  v_section2   uuid := gen_random_uuid();
  v_lesson1    uuid := gen_random_uuid();
  v_lesson2    uuid := gen_random_uuid();
  v_lesson3    uuid := gen_random_uuid();
  v_lesson4    uuid := gen_random_uuid();
  i            int;
BEGIN

  -- ── Enrollments ──────────────────────────────────────────────────────────
  INSERT INTO enrollments (student_id, course_id, progress_percent, completed_at)
  VALUES
    (v_student_id, v_course1, 75,  NULL),
    (v_student_id, v_course2, 100, NOW() - INTERVAL '5 days'),
    (v_student_id, v_course3, 30,  NULL)
  ON CONFLICT (student_id, course_id) DO UPDATE
    SET progress_percent = EXCLUDED.progress_percent,
        completed_at     = EXCLUDED.completed_at;

  -- ── Sections ─────────────────────────────────────────────────────────────
  INSERT INTO sections (id, course_id, title, order_index)
  VALUES
    (v_section1, v_course1, 'Getting Started',  1),
    (v_section2, v_course1, 'Core Vocabulary',  2)
  ON CONFLICT (id) DO NOTHING;

  -- ── Lessons ──────────────────────────────────────────────────────────────
  INSERT INTO lessons (id, section_id, title, type, content, duration_minutes, order_index, is_required)
  VALUES
    (v_lesson1, v_section1, 'Introduction to French',      'video',   'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 12, 1, true),
    (v_lesson2, v_section1, 'Basic Pronunciation Guide',   'article', 'In French, every syllable is equally stressed. Focus on nasal vowels and silent final consonants. Practice: "bon", "vin", "brun".', 8, 2, true),
    (v_lesson3, v_section2, 'Numbers 1 to 20',             'video',   'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 10, 1, true),
    (v_lesson4, v_section2, 'Days of the Week',            'article', 'Lundi (Monday), Mardi (Tuesday), Mercredi (Wednesday), Jeudi (Thursday), Vendredi (Friday), Samedi (Saturday), Dimanche (Sunday).', 6, 2, false)
  ON CONFLICT (id) DO NOTHING;

  -- ── Lesson Progress ───────────────────────────────────────────────────────
  INSERT INTO lesson_progress (student_id, lesson_id, completed_at)
  VALUES
    (v_student_id, v_lesson1, NOW() - INTERVAL '3 days'),
    (v_student_id, v_lesson2, NOW() - INTERVAL '2 days'),
    (v_student_id, v_lesson3, NOW() - INTERVAL '1 day')
  ON CONFLICT (student_id, lesson_id) DO NOTHING;

  -- ── Assignments ──────────────────────────────────────────────────────────
  INSERT INTO assignments (id, course_id, title, description, due_date, max_marks, is_required)
  VALUES
    (v_assign1, v_course1,
     'French Conversation Practice',
     'Record a 2-minute spoken French conversation on any topic and upload the audio file. Focus on pronunciation and natural flow.',
     NOW() + INTERVAL '7 days', 100, true),
    (v_assign2, v_course2,
     'Spanish Vocabulary Essay',
     'Write a 300-word essay in Spanish using at least 20 vocabulary words from Module 2.',
     NOW() + INTERVAL '3 days', 80, true)
  ON CONFLICT (id) DO NOTHING;

  -- Student submission (ungraded — shows in teacher pending grades count)
  INSERT INTO assignment_submissions (assignment_id, student_id, content, submitted_at)
  VALUES (
    v_assign1, v_student_id,
    'Bonjour! Je m''appelle Marie. Je suis étudiante à Sydney. J''aime les langues étrangères.',
    NOW() - INTERVAL '1 day'
  ) ON CONFLICT DO NOTHING;

  -- ── Live Sessions ─────────────────────────────────────────────────────────
  INSERT INTO live_sessions (course_id, teacher_id, title, description, meeting_link, scheduled_at, duration_minutes)
  VALUES
    (v_course1, v_teacher_id,
     'French Pronunciation Workshop',
     'Live practice of French phonetics with native speaker exercises.',
     'https://meet.google.com/abc-demo-001',
     NOW() + INTERVAL '2 days', 60),
    (v_course2, v_teacher_id,
     'Spanish Grammar Q&A',
     'Open Q&A on subjunctive and conditional tenses.',
     'https://zoom.us/j/demo002',
     NOW() + INTERVAL '5 days', 45),
    (v_course3, v_teacher_id,
     'Business Communication: Presentations',
     'Practical techniques for professional presentations.',
     'https://teams.microsoft.com/l/demo003',
     NOW() + INTERVAL '10 days', 90)
  ON CONFLICT DO NOTHING;

  -- ── Quiz ─────────────────────────────────────────────────────────────────
  INSERT INTO quizzes (id, course_id, title, description, time_limit_minutes, pass_mark, max_attempts, is_required)
  VALUES (
    v_quiz1, v_course1,
    'French Basics Quiz',
    'Test your knowledge of French greetings and basic phrases.',
    15, 60, 3, true
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO quiz_questions (quiz_id, question, type, options, correct_answer, points, order_index)
  VALUES
    (v_quiz1, 'How do you say "Good morning" in French?', 'mcq',
     '["Bonsoir","Bonjour","Bonne nuit","Au revoir"]', 'Bonjour', 1, 1),
    (v_quiz1, 'The French word "merci" means "thank you".', 'true_false',
     '["True","False"]', 'True', 1, 2),
    (v_quiz1, 'Translate to French: "My name is John"', 'short_answer',
     NULL, 'Je m''appelle John', 2, 3)
  ON CONFLICT DO NOTHING;

  -- ── Certificate ───────────────────────────────────────────────────────────
  INSERT INTO certificates (id, student_id, course_id, certificate_id, issued_at, revoked)
  VALUES (
    v_cert_id,
    v_student_id,
    v_course2,
    'MAXIMUS-2026-' || UPPER(SUBSTRING(v_cert_id::text FROM 1 FOR 8)),
    NOW() - INTERVAL '5 days',
    false
  ) ON CONFLICT (id) DO NOTHING;

  -- ── Payments ─────────────────────────────────────────────────────────────
  INSERT INTO payments (student_id, course_id, amount, currency, status, discount_percent)
  VALUES
    (v_student_id, v_course2,   0.00, 'AUD', 'completed', 0),
    (v_student_id, v_course3, 297.00, 'AUD', 'completed', 0)
  ON CONFLICT DO NOTHING;

  -- Historical payments for revenue chart (spread over 30 days)
  FOR i IN 1..18 LOOP
    INSERT INTO payments (student_id, course_id, amount, currency, status, created_at, discount_percent)
    VALUES (
      v_student_id,
      CASE WHEN i % 3 = 0 THEN v_course1 WHEN i % 3 = 1 THEN v_course2 ELSE v_course3 END,
      (ARRAY[197.00, 297.00, 397.00, 247.00, 347.00])[ ((i-1) % 5) + 1 ],
      'AUD',
      'completed',
      NOW() - (i * INTERVAL '40 hours'),
      0
    );
  END LOOP;

  -- ── Announcements ─────────────────────────────────────────────────────────
  INSERT INTO announcements (title, content, created_by, is_active)
  VALUES
    ('Welcome to Maximus Academy!',
     'We are thrilled to have you here. Explore world-class language and business courses designed to accelerate your professional growth.',
     v_admin_id, true),
    ('New Courses Available — July 2026',
     'Three new courses just added: Advanced Business Writing, Japanese for Beginners, and Data Analysis with Excel. Use code WELCOME20 for 20% off!',
     v_admin_id, true)
  ON CONFLICT DO NOTHING;

  -- ── Activity Logs ─────────────────────────────────────────────────────────
  INSERT INTO activity_logs (user_id, action, resource_type, resource_id, details)
  VALUES
    (v_admin_id,   'create', 'course',       v_course1,             'Created course: French Language Course'),
    (v_admin_id,   'create', 'user',          v_teacher_id,          'Created teacher account: teacher@maximus.edu.au'),
    (v_teacher_id, 'create', 'assignment',    v_assign1,             'Created assignment: French Conversation Practice'),
    (v_teacher_id, 'create', 'quiz',          v_quiz1,               'Created quiz: French Basics Quiz'),
    (v_student_id, 'enroll', 'course',        v_course1,             'Enrolled in: French Language Course'),
    (v_student_id, 'enroll', 'course',        v_course2,             'Enrolled in: Spanish Language Course'),
    (v_student_id, 'complete','course',       v_course2,             'Completed: Spanish Language Course'),
    (v_admin_id,   'update', 'course',        v_course3,             'Published: Advanced Business Communication'),
    (v_teacher_id, 'create', 'live_session',  gen_random_uuid(),     'Scheduled: French Pronunciation Workshop'),
    (v_admin_id,   'create', 'announcement',  gen_random_uuid(),     'Sent announcement: Welcome to Maximus Academy!')
  ON CONFLICT DO NOTHING;

  -- ── Promo Codes ───────────────────────────────────────────────────────────
  INSERT INTO promo_codes (code, discount_percent, usage_limit, usage_count, expires_at, is_active, created_by)
  VALUES
    ('WELCOME20', 20, 100,  3, NOW() + INTERVAL '90 days',  true,  v_admin_id),
    ('LAUNCH50',  50,  50,  0, NOW() + INTERVAL '30 days',  true,  v_admin_id),
    ('STUDENT10', 10, 200, 12, NOW() + INTERVAL '180 days', true,  v_admin_id),
    ('EARLYBIRD', 30,  20, 20, NOW() - INTERVAL '1 day',    false, v_admin_id)
  ON CONFLICT (code) DO UPDATE SET
    discount_percent = EXCLUDED.discount_percent,
    usage_limit      = EXCLUDED.usage_limit,
    expires_at       = EXCLUDED.expires_at,
    is_active        = EXCLUDED.is_active;

END $$;

-- Refresh course student counts
UPDATE courses
SET total_students = (
  SELECT COUNT(*) FROM enrollments WHERE enrollments.course_id = courses.id
);
