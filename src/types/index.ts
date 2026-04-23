export type UserRole = 'admin' | 'teacher' | 'student';

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  avatar_url: string;
  role: UserRole;
  is_active: boolean;
  bio: string;
  phone: string;
  notification_email: boolean;
  notification_deadlines: boolean;
  notification_grades: boolean;
  created_at: string;
  updated_at: string;
}

export interface Course {
  id: string;
  title: string;
  description: string;
  short_description: string;
  thumbnail_url: string;
  price: number;
  currency: string;
  category: string;
  level: 'beginner' | 'intermediate' | 'advanced';
  teacher_id: string | null;
  is_published: boolean;
  is_archived: boolean;
  is_free: boolean;
  duration_hours: number;
  total_lessons: number;
  total_students: number;
  rating: number;
  language: string;
  what_you_learn: string[];
  requirements: string[];
  stripe_payment_link: string | null;
  created_at: string;
  updated_at: string;
  teacher?: Profile;
}

export interface Section {
  id: string;
  course_id: string;
  title: string;
  order_index: number;
  created_at: string;
  lessons?: Lesson[];
}

export interface Lesson {
  id: string;
  section_id: string;
  title: string;
  type: 'video' | 'pdf' | 'article' | 'link';
  content: string;
  url: string;
  duration_minutes: number;
  order_index: number;
  is_required: boolean;
  is_preview: boolean;
  created_at: string;
}

export interface Enrollment {
  id: string;
  student_id: string;
  course_id: string;
  enrolled_at: string;
  completed_at: string | null;
  progress_percent: number;
  student?: Profile;
  course?: Course;
}

export interface LessonProgress {
  id: string;
  student_id: string;
  lesson_id: string;
  completed_at: string;
}

export interface Quiz {
  id: string;
  course_id: string;
  title: string;
  description: string;
  time_limit_minutes: number | null;
  pass_mark: number;
  max_attempts: number;
  is_required: boolean;
  created_at: string;
  questions?: QuizQuestion[];
}

export interface QuizQuestion {
  id: string;
  quiz_id: string;
  question: string;
  type: 'mcq' | 'true_false' | 'short_answer';
  options: string[];
  correct_answer: string;
  points: number;
  order_index: number;
}

export interface QuizAttempt {
  id: string;
  quiz_id: string;
  student_id: string;
  score: number;
  total_points: number;
  passed: boolean;
  answers: Record<string, string>;
  submitted_at: string;
}

export interface Assignment {
  id: string;
  course_id: string;
  title: string;
  description: string;
  due_date: string | null;
  max_marks: number;
  is_required: boolean;
  created_at: string;
}

export interface AssignmentSubmission {
  id: string;
  assignment_id: string;
  student_id: string;
  content: string;
  file_url: string;
  grade: number | null;
  feedback: string;
  submitted_at: string;
  graded_at: string | null;
  student?: Profile;
  assignment?: Assignment;
}

export interface Certificate {
  id: string;
  student_id: string;
  course_id: string;
  certificate_id: string;
  issued_at: string;
  revoked: boolean;
  revoked_at: string | null;
  student?: Profile;
  course?: Course;
}

export interface Payment {
  id: string;
  student_id: string;
  course_id: string;
  amount: number;
  currency: string;
  stripe_payment_id: string;
  promo_code: string;
  discount_percent: number;
  status: 'pending' | 'completed' | 'refunded' | 'failed';
  created_at: string;
  student?: Profile;
  course?: Course;
}

export interface PromoCode {
  id: string;
  code: string;
  discount_percent: number;
  expires_at: string | null;
  is_active: boolean;
  usage_limit: number | null;
  usage_count: number;
  created_by: string;
  created_at: string;
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  created_by: string;
  is_active: boolean;
  created_at: string;
  creator?: Profile;
}

export interface ActivityLog {
  id: string;
  user_id: string;
  action: string;
  resource_type: string;
  resource_id: string;
  details: string;
  created_at: string;
  user?: Profile;
}

export interface Discussion {
  id: string;
  course_id: string;
  author_id: string;
  parent_id: string | null;
  title: string;
  content: string;
  is_pinned: boolean;
  created_at: string;
  author?: Profile;
}

export interface LiveSession {
  id: string;
  course_id: string;
  teacher_id: string;
  title: string;
  description: string;
  meeting_link: string;
  scheduled_at: string;
  duration_minutes: number;
  created_at: string;
  course?: Course;
}

export interface Toast {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  duration?: number;
}
