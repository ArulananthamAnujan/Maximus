/*
  # Seed Course Catalog and Demo Data

  Recreates all content from the previous database matching the new schema.
  Includes courses, sections, lessons, quizzes, assignments, enrollments,
  lesson progress, certificates, live sessions, announcements, promo codes,
  activity logs, and historical payments.
*/

DO $$
DECLARE
  admin_uid    uuid := '6c0e7959-b621-42ce-8598-868a8fc2e073';
  teacher_uid  uuid := '494bced9-f191-429c-8b0b-1f19680e4442';
  student_uid  uuid := '4bb5f4e6-5ca5-4bfa-a4a0-4974e06ae7c5';

  c_biz        uuid := 'aa000000-0000-0000-0000-000000000001';
  c_mktg       uuid := 'bb000000-0000-0000-0000-000000000002';
  c_data       uuid := 'cc000000-0000-0000-0000-000000000003';
  c_ielts      uuid := '59102c80-84b8-4533-98dc-597ea80214e3';
  c_xero       uuid := '421fc7e3-b096-4b68-87fe-89b44af69c0e';
  c_pte        uuid := 'dd000000-0000-0000-0000-000000000004';
  c_japanese   uuid := 'ee000000-0000-0000-0000-000000000005';
  c_french     uuid := '9170d2af-8369-4dc4-86f5-5806db1f2ddb';
  c_spanish    uuid := 'd531dc2a-7cc2-461d-a769-9b006a016dea';

  s1 uuid := '10000000-0000-0000-0000-000000000001';
  s2 uuid := '20000000-0000-0000-0000-000000000002';
  s3 uuid := '30000000-0000-0000-0000-000000000003';
  sf1 uuid := 'f1000000-0000-0000-0000-000000000001';
  sf2 uuid := 'f2000000-0000-0000-0000-000000000002';

  l1 uuid := '40000000-0000-0000-0000-000000000001';
  l2 uuid := '50000000-0000-0000-0000-000000000002';
  l3 uuid := '60000000-0000-0000-0000-000000000003';
  l4 uuid := '70000000-0000-0000-0000-000000000004';
  l5 uuid := '80000000-0000-0000-0000-000000000005';
  l6 uuid := '90000000-0000-0000-0000-000000000006';
  lf1 uuid := 'f0100000-0000-0000-0000-000000000001';
  lf2 uuid := 'f0200000-0000-0000-0000-000000000002';
  lf3 uuid := 'f0300000-0000-0000-0000-000000000003';
  lf4 uuid := 'f0400000-0000-0000-0000-000000000004';

  q_biz  uuid := 'a0000000-0000-0000-0000-000000000001';
  q_fr   uuid := 'a1000000-0000-0000-0000-000000000001';
  a_biz  uuid := 'b0000000-0000-0000-0000-000000000001';
  a_fr   uuid := 'b1000000-0000-0000-0000-000000000001';
  a_sp   uuid := 'b2000000-0000-0000-0000-000000000002';
  cert1  uuid := 'c0000000-0000-0000-0000-000000000001';

  i int;
BEGIN

  -- ── Courses ───────────────────────────────────────────────────────────────
  INSERT INTO courses (id, title, short_description, description, thumbnail_url, price, price_amount, is_free, is_paid, category, level, teacher_id, is_published, is_archived, duration_hours, total_lessons, total_students, rating, what_you_learn, requirements)
  VALUES
    (c_biz,'Business Communication Mastery','Master professional communication skills for the modern Australian workplace.',
     'This comprehensive course covers all aspects of professional business communication, from email writing and presentation skills to negotiation and conflict resolution.',
     'https://images.pexels.com/photos/3184291/pexels-photo-3184291.jpeg',
     299.00,299.00,false,true,'Business','intermediate',teacher_uid,true,false,8,6,142,4.8,
     ARRAY['Write clear professional emails','Deliver confident presentations','Negotiate effectively','Resolve workplace conflicts'],
     ARRAY['No prior experience needed','Basic computer literacy']),

    (c_mktg,'Digital Marketing Fundamentals','Learn to build and execute winning digital marketing strategies.',
     'From SEO and social media to paid advertising and analytics, this course gives you a comprehensive introduction to digital marketing.',
     'https://images.pexels.com/photos/905163/pexels-photo-905163.jpeg',
     199.00,199.00,false,true,'Marketing','beginner',teacher_uid,true,false,6,18,98,4.6,
     ARRAY['Create effective social media campaigns','Understand SEO fundamentals','Run Google Ads','Analyse marketing metrics'],
     ARRAY['Basic computer skills','Interest in marketing']),

    (c_data,'Introduction to Data Analysis','Get started with data analysis using Excel and Python.',
     'This free introductory course teaches you the fundamentals of data analysis. Perfect for beginners who want to start working with data.',
     'https://images.pexels.com/photos/590022/pexels-photo-590022.jpeg',
     0.00,0.00,true,false,'Technology','beginner',teacher_uid,true,false,4,12,256,4.7,
     ARRAY['Understand data types and structures','Use Excel for analysis','Write basic Python scripts','Create data visualisations'],
     ARRAY['No programming experience needed','Microsoft Excel (any version)']),

    (c_ielts,'IELTS Preparation','Comprehensive IELTS preparation covering all four skills: Listening, Reading, Writing, and Speaking.',
     'Our IELTS Preparation course is designed to help you achieve your target band score. We cover all four test components with expert-led strategies, practice tests, and personalised feedback.',
     'https://images.pexels.com/photos/4144923/pexels-photo-4144923.jpeg',
     450.00,450.00,false,true,'Test Preparation','beginner',teacher_uid,true,false,40,32,127,4.8,
     ARRAY['Master all four IELTS skills','Learn test-taking strategies','Complete practice tests','Achieve your target band score'],
     ARRAY['Intermediate English level','Commitment to regular study']),

    (c_xero,'Xero Beginner Course','Get job-ready with Xero — the cloud accounting software used by thousands of businesses.',
     'This hands-on Xero Beginner Course teaches you to set up and manage accounts, process invoices, reconcile bank transactions, run payroll, and generate financial reports.',
     'https://images.pexels.com/photos/6693661/pexels-photo-6693661.jpeg',
     320.00,320.00,false,true,'Finance','beginner',teacher_uid,true,false,20,18,143,4.6,
     ARRAY['Set up a Xero account','Process invoices and bills','Reconcile bank transactions','Run payroll and financial reports'],
     ARRAY['Basic computer skills','No accounting experience needed']),

    (c_pte,'PTE Academic Preparation','Master the PTE Academic exam with targeted practice, AI-scored mock tests, and proven strategies.',
     'The PTE Academic Preparation course provides an intensive study program covering all PTE question types. You will learn time management strategies, practise with realistic mock tests, and receive detailed performance analysis.',
     'https://images.pexels.com/photos/5427869/pexels-photo-5427869.jpeg',
     420.00,420.00,false,true,'Test Preparation','intermediate',teacher_uid,true,false,36,28,98,4.7,
     ARRAY['Master all PTE question types','Improve time management','Practise with mock tests','Analyse performance gaps'],
     ARRAY['Basic English proficiency','Commitment to study']),

    (c_japanese,'Japanese Language Course','Learn Japanese from scratch — hiragana, katakana, kanji, and everyday conversation.',
     'This Japanese Language Course takes you from complete beginner to conversational proficiency. You will master the writing systems, build vocabulary, study grammar, and practise real-world conversations.',
     'https://images.pexels.com/photos/5926382/pexels-photo-5926382.jpeg',
     380.00,380.00,false,true,'Language Learning','beginner',teacher_uid,true,false,48,36,74,4.9,
     ARRAY['Read hiragana and katakana','Learn essential kanji','Hold basic conversations','Understand Japanese grammar'],
     ARRAY['No Japanese experience needed','Commitment to regular practice']),

    (c_french,'French Language Course','Speak French with confidence — from bonjour to business conversations.',
     'Our French Language Course is perfect for beginners and intermediate learners. You will develop all four language skills through interactive lessons, audio exercises, and live conversation practice.',
     'https://images.pexels.com/photos/5935791/pexels-photo-5935791.jpeg',
     360.00,360.00,false,true,'Language Learning','beginner',teacher_uid,true,false,45,34,62,4.8,
     ARRAY['Hold everyday French conversations','Master French pronunciation','Build essential vocabulary','Read and write in French'],
     ARRAY['No French experience needed','Enthusiasm to learn']),

    (c_spanish,'Spanish Language Course','From hola to fluent — learn Spanish for travel, work, and everyday life.',
     'Spanish is one of the world''s most spoken languages. This course covers pronunciation, grammar, vocabulary, and conversation for beginners through to intermediate levels.',
     'https://images.pexels.com/photos/5935234/pexels-photo-5935234.jpeg',
     360.00,360.00,false,true,'Language Learning','beginner',teacher_uid,true,false,45,34,55,4.7,
     ARRAY['Speak confidently in Spanish','Understand Spanish grammar','Build travel vocabulary','Write in Spanish'],
     ARRAY['No Spanish experience needed','Commitment to regular study'])

  ON CONFLICT (id) DO UPDATE SET
    title=EXCLUDED.title, short_description=EXCLUDED.short_description,
    description=EXCLUDED.description, thumbnail_url=EXCLUDED.thumbnail_url,
    price=EXCLUDED.price, price_amount=EXCLUDED.price_amount,
    is_free=EXCLUDED.is_free, is_paid=EXCLUDED.is_paid,
    category=EXCLUDED.category, level=EXCLUDED.level,
    teacher_id=EXCLUDED.teacher_id, is_published=EXCLUDED.is_published,
    duration_hours=EXCLUDED.duration_hours, total_lessons=EXCLUDED.total_lessons,
    total_students=EXCLUDED.total_students, rating=EXCLUDED.rating,
    what_you_learn=EXCLUDED.what_you_learn, requirements=EXCLUDED.requirements;

  -- ── Sections ──────────────────────────────────────────────────────────────
  INSERT INTO sections (id, course_id, title, order_index) VALUES
    (s1, c_biz, 'Module 1: Foundations of Business Communication', 0),
    (s2, c_biz, 'Module 2: Written Communication', 1),
    (s3, c_biz, 'Module 3: Presentations & Public Speaking', 2),
    (sf1, c_french, 'Getting Started', 0),
    (sf2, c_french, 'Core Vocabulary', 1)
  ON CONFLICT (id) DO NOTHING;

  -- ── Lessons ───────────────────────────────────────────────────────────────
  INSERT INTO lessons (id, section_id, course_id, title, type, lesson_type, video_url, content, order_index, is_preview, duration_minutes) VALUES
    (l1,s1,c_biz,'Welcome & Course Overview','video','video','https://www.w3schools.com/html/mov_bbb.mp4','',0,true,5),
    (l2,s1,c_biz,'What is Business Communication?','text','text','','Business communication is the process of sharing information between people within and outside an organisation. Effective communication is a fundamental management function and a critical skill for all professionals in the modern Australian workplace.',1,false,15),
    (l3,s1,c_biz,'Communication Styles & Barriers','text','text','','Understanding different communication styles helps you adapt your message. The four main styles are assertive, passive, aggressive, and passive-aggressive. Common barriers include cultural differences, language barriers, jargon, and poor listening skills.',2,false,20),
    (l4,s2,c_biz,'Professional Email Writing','text','text','','Writing professional emails requires mastery of structure and tone. Key elements: a clear subject line, professional greeting, concise body, clear call to action, and appropriate sign-off. Always proofread before sending.',0,false,25),
    (l5,s2,c_biz,'Business Report Writing','text','text','','Business reports should follow a clear structure: executive summary, introduction, methodology, findings, conclusions, and recommendations. Use clear headings, bullet points, and visual aids to make your report easy to navigate.',1,false,30),
    (l6,s3,c_biz,'Presentation Design Principles','text','text','','Effective presentations follow the 10-20-30 rule: no more than 10 slides, no longer than 20 minutes, and font size no smaller than 30 points. Use high-quality images, limit text on slides, and practise your delivery.',0,false,20),
    (lf1,sf1,c_french,'Introduction to French','video','video','https://www.youtube.com/watch?v=dQw4w9WgXcQ','',0,true,12),
    (lf2,sf1,c_french,'Basic Pronunciation Guide','text','text','','In French, every syllable is equally stressed. Focus on nasal vowels and silent final consonants. Practice: "bon", "vin", "brun".',1,false,8),
    (lf3,sf2,c_french,'Numbers 1 to 20','video','video','https://www.youtube.com/watch?v=dQw4w9WgXcQ','',0,false,10),
    (lf4,sf2,c_french,'Days of the Week','text','text','','Lundi (Monday), Mardi (Tuesday), Mercredi (Wednesday), Jeudi (Thursday), Vendredi (Friday), Samedi (Saturday), Dimanche (Sunday).',1,false,6)
  ON CONFLICT (id) DO NOTHING;

  -- ── Quizzes ───────────────────────────────────────────────────────────────
  INSERT INTO quizzes (id, course_id, title, description, time_limit, pass_percentage, max_attempts, is_published) VALUES
    (q_biz, c_biz, 'Module 1 Knowledge Check', 'Test your understanding of business communication fundamentals.', 15, 70, 3, true),
    (q_fr,  c_french, 'French Basics Quiz', 'Test your knowledge of French greetings and basic phrases.', 15, 60, 3, true)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO quiz_questions (quiz_id, question, options, correct_answer, explanation, points, order_index) VALUES
    (q_biz,'Which of the following is a common barrier to effective communication?',
     '["Active listening","Clear language","Cultural differences","Eye contact"]'::jsonb,
     2,'Cultural differences create misunderstandings due to varying norms and values.',1,0),
    (q_biz,'Business communication only occurs within an organisation.',
     '["True","False"]'::jsonb,
     1,'Business communication also occurs between organisations and with external stakeholders.',1,1),
    (q_biz,'Which rule guides effective presentation design?',
     '["5-10-15 Rule","10-20-30 Rule","20-30-40 Rule","15-25-35 Rule"]'::jsonb,
     1,'The 10-20-30 rule: 10 slides, 20 minutes, 30pt font minimum.',1,2),
    (q_fr,'How do you say "Good morning" in French?',
     '["Bonsoir","Bonjour","Bonne nuit","Au revoir"]'::jsonb,
     1,'Bonjour means "Hello / Good morning" in French.',1,0),
    (q_fr,'The French word "merci" means "thank you".',
     '["True","False"]'::jsonb,
     0,'Merci does indeed mean "thank you" in French.',1,1),
    (q_fr,'What is the French word for "Wednesday"?',
     '["Lundi","Mardi","Mercredi","Jeudi"]'::jsonb,
     2,'Mercredi means Wednesday in French.',1,2)
  ON CONFLICT DO NOTHING;

  -- ── Assignments ───────────────────────────────────────────────────────────
  INSERT INTO assignments (id, course_id, teacher_id, title, description, due_date, total_points, is_published) VALUES
    (a_biz, c_biz,    teacher_uid, 'Professional Email Draft',
     'Write a professional email to a client explaining a project delay. Approximately 200-300 words demonstrating the principles covered in Module 2.',
     now()+interval'14 days', 100, true),
    (a_fr,  c_french, teacher_uid, 'French Conversation Practice',
     'Record a 2-minute spoken French conversation on any topic and upload the audio file. Focus on pronunciation and natural flow.',
     now()+interval'7 days', 100, true),
    (a_sp,  c_spanish, teacher_uid, 'Spanish Vocabulary Essay',
     'Write a 300-word essay in Spanish using at least 20 vocabulary words from Module 2.',
     now()+interval'3 days', 80, true)
  ON CONFLICT (id) DO NOTHING;

  -- ── Enrollments ───────────────────────────────────────────────────────────
  INSERT INTO enrollments (student_id, course_id, progress_percent, enrolled_at) VALUES
    (student_uid, c_biz,     35,  now()-interval'30 days'),
    (student_uid, c_data,    67,  now()-interval'20 days'),
    (student_uid, c_french,  75,  now()-interval'15 days'),
    (student_uid, c_spanish, 100, now()-interval'35 days')
  ON CONFLICT (student_id, course_id) DO UPDATE SET progress_percent=EXCLUDED.progress_percent;

  -- ── Lesson progress ───────────────────────────────────────────────────────
  INSERT INTO lesson_progress (student_id, lesson_id, course_id, is_completed, watch_percentage, completed_at) VALUES
    (student_uid, l1,  c_biz,    true, 100, now()-interval'29 days'),
    (student_uid, l2,  c_biz,    true, 100, now()-interval'28 days'),
    (student_uid, lf1, c_french, true, 100, now()-interval'14 days'),
    (student_uid, lf2, c_french, true, 100, now()-interval'13 days'),
    (student_uid, lf3, c_french, true, 100, now()-interval'12 days')
  ON CONFLICT DO NOTHING;

  -- ── Assignment submission ─────────────────────────────────────────────────
  INSERT INTO assignment_submissions (assignment_id, student_id, content, submitted_at)
  VALUES (a_fr, student_uid,
    'Bonjour! Je m''appelle Marie. Je suis étudiante à Sydney. J''aime les langues étrangères.',
    now()-interval'1 day')
  ON CONFLICT (assignment_id, student_id) DO NOTHING;

  -- ── Certificate ───────────────────────────────────────────────────────────
  INSERT INTO certificates (id, student_id, course_id, verification_code, issued_at, revoked)
  VALUES (cert1, student_uid, c_spanish,
    'MAXIMUS-2026-' || UPPER(SUBSTRING(cert1::text FROM 1 FOR 8)),
    now()-interval'5 days', false)
  ON CONFLICT (id) DO NOTHING;

  -- ── Live sessions ─────────────────────────────────────────────────────────
  INSERT INTO live_sessions (course_id, teacher_id, title, description, meeting_url, scheduled_at, duration_minutes, status) VALUES
    (c_french,  teacher_uid, 'French Pronunciation Workshop',
     'Live practice of French phonetics with native speaker exercises.',
     'https://meet.google.com/abc-demo-001', now()+interval'2 days', 60, 'scheduled'),
    (c_spanish, teacher_uid, 'Spanish Grammar Q&A',
     'Open Q&A on subjunctive and conditional tenses.',
     'https://zoom.us/j/demo002', now()+interval'5 days', 45, 'scheduled'),
    (c_biz,     teacher_uid, 'Business Communication: Presentations',
     'Practical techniques for professional presentations.',
     'https://teams.microsoft.com/l/demo003', now()+interval'10 days', 90, 'scheduled')
  ON CONFLICT DO NOTHING;

  -- ── Announcements ─────────────────────────────────────────────────────────
  INSERT INTO announcements (title, content, author_id, is_active) VALUES
    ('Welcome to Maximus Academy!',
     'We are thrilled to have you as part of the Maximus Academy community. Explore our growing library of courses and start your learning journey today. Use code WELCOME20 for 20% off your first course!',
     admin_uid, true),
    ('New Courses Available — 2026',
     'Three new courses just added: Advanced Business Writing, Japanese for Beginners, and Data Analysis with Excel. Use code WELCOME20 for 20% off!',
     admin_uid, true)
  ON CONFLICT DO NOTHING;

  -- ── Promo codes ───────────────────────────────────────────────────────────
  INSERT INTO promo_codes (code, discount_type, discount_value, max_uses, used_count, valid_from, valid_until, is_active) VALUES
    ('WELCOME20','percentage',20,100, 3, now(), now()+interval'90 days',  true),
    ('LAUNCH50', 'percentage',50, 50, 0, now(), now()+interval'30 days',  true),
    ('STUDENT10','percentage',10,200,12, now(), now()+interval'180 days', true),
    ('EARLYBIRD','percentage',30, 20,20, now(), now()-interval'1 day',    false)
  ON CONFLICT (code) DO UPDATE SET
    discount_value=EXCLUDED.discount_value, max_uses=EXCLUDED.max_uses,
    valid_until=EXCLUDED.valid_until, is_active=EXCLUDED.is_active;

  -- ── Activity logs (details column is jsonb) ───────────────────────────────
  INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details) VALUES
    (admin_uid,   'create',   'course',       c_biz,       '{"note":"Created course: Business Communication Mastery"}'::jsonb),
    (admin_uid,   'create',   'user',         teacher_uid, '{"note":"Created teacher account: teacher@maximus.edu.au"}'::jsonb),
    (teacher_uid, 'create',   'assignment',   a_biz,       '{"note":"Created assignment: Professional Email Draft"}'::jsonb),
    (teacher_uid, 'create',   'quiz',         q_biz,       '{"note":"Created quiz: Module 1 Knowledge Check"}'::jsonb),
    (student_uid, 'enroll',   'course',       c_biz,       '{"note":"Enrolled in: Business Communication Mastery"}'::jsonb),
    (student_uid, 'enroll',   'course',       c_french,    '{"note":"Enrolled in: French Language Course"}'::jsonb),
    (student_uid, 'complete', 'course',       c_spanish,   '{"note":"Completed: Spanish Language Course"}'::jsonb),
    (teacher_uid, 'create',   'quiz',         q_fr,        '{"note":"Created quiz: French Basics Quiz"}'::jsonb),
    (admin_uid,   'create',   'announcement', gen_random_uuid(), '{"note":"Sent: Welcome to Maximus Academy!"}'::jsonb)
  ON CONFLICT DO NOTHING;

  -- ── Historical payments for revenue chart ─────────────────────────────────
  FOR i IN 1..18 LOOP
    INSERT INTO payments (user_id, course_id, amount, currency, status, created_at)
    VALUES (
      student_uid,
      CASE WHEN i%3=0 THEN c_biz WHEN i%3=1 THEN c_french ELSE c_ielts END,
      (ARRAY[197.00,297.00,397.00,247.00,347.00])[((i-1)%5)+1],
      'aud','completed',
      now()-(i*interval'40 hours')
    );
  END LOOP;

END $$;

-- Refresh total_students counts
UPDATE courses
SET total_students = (
  SELECT COUNT(*) FROM enrollments WHERE enrollments.course_id = courses.id
);
