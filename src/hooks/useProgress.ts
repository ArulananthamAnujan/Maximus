import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface LessonProgressRow {
  id: string;
  student_id: string;
  user_id: string | null;
  lesson_id: string;
  course_id: string;
  status: 'not_started' | 'in_progress' | 'completed';
  progress_percent: number;
  last_position_seconds: number;
  time_spent_seconds: number;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CourseEnrollmentRow {
  id: string;
  user_id: string;
  course_id: string;
  enrollment_type: 'free' | 'paid' | 'admin_granted';
  payment_status: 'not_required' | 'pending' | 'completed' | 'refunded';
  payment_id: string | null;
  amount_paid: number;
  currency: string | null;
  enrolled_at: string;
  completed_at: string | null;
  progress_percent: number;
  last_accessed_at: string;
  course?: {
    id: string;
    title: string;
    thumbnail_url: string;
    total_lessons: number;
    category: string;
    is_free: boolean;
    price: number;
  };
}

export interface UserQuizAttemptRow {
  id: string;
  student_id: string;
  quiz_id: string;
  course_id: string;
  score: number;
  total_points: number;
  percentage: number;
  passed: boolean;
  answers: Record<string, string>;
  attempt_number: number;
  submitted_at: string;
  created_at: string;
}

// ─── Lesson Progress ──────────────────────────────────────────────────────────

export function useLessonProgress(lessonId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['lesson-progress', lessonId, user?.id],
    enabled: !!lessonId && !!user,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<LessonProgressRow | null> => {
      if (!lessonId || !user) return null;
      const { data } = await supabase
        .from('lesson_progress')
        .select('*')
        .eq('student_id', user.id)
        .eq('lesson_id', lessonId)
        .maybeSingle();
      return data as LessonProgressRow | null;
    },
  });
}

export function useCourseProgress(courseId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['course-progress', courseId, user?.id],
    enabled: !!courseId && !!user,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<LessonProgressRow[]> => {
      if (!courseId || !user) return [];
      const { data } = await supabase
        .from('lesson_progress')
        .select('*')
        .eq('student_id', user.id)
        .eq('course_id', courseId);
      return (data as LessonProgressRow[]) ?? [];
    },
  });
}

// ─── Enrollments ──────────────────────────────────────────────────────────────

export function useMyEnrollments() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['my-enrollments', user?.id],
    enabled: !!user,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<CourseEnrollmentRow[]> => {
      if (!user) return [];
      const { data } = await supabase
        .from('course_enrollments')
        .select('id,user_id,course_id,enrollment_type,payment_status,payment_id,amount_paid,currency,enrolled_at,completed_at,progress_percent,last_accessed_at,course:courses(id,title,thumbnail_url,total_lessons,category,is_free,price)')
        .eq('user_id', user.id)
        .order('last_accessed_at', { ascending: false });
      return (data as CourseEnrollmentRow[]) ?? [];
    },
  });
}

// ─── Mutations ────────────────────────────────────────────────────────────────

interface UpdateProgressInput {
  lessonId: string;
  courseId: string;
  lastPositionSeconds: number;
  timeSpentSeconds: number;
  progressPercent: number;
  status?: 'not_started' | 'in_progress' | 'completed';
  completedAt?: string | null;
}

export function useUpdateLessonProgress() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateProgressInput) => {
      if (!user) throw new Error('Not authenticated');
      const isCompleted = input.status === 'completed' || input.progressPercent >= 90;
      const row = {
        student_id: user.id,
        user_id: user.id,
        lesson_id: input.lessonId,
        course_id: input.courseId,
        last_position_seconds: input.lastPositionSeconds,
        time_spent_seconds: input.timeSpentSeconds,
        progress_percent: input.progressPercent,
        status: input.status ?? (isCompleted ? 'completed' : 'in_progress'),
        is_completed: isCompleted,
        watch_percentage: input.progressPercent,
        completed_at: input.completedAt ?? (isCompleted ? new Date().toISOString() : null),
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase
        .from('lesson_progress')
        .upsert(row, { onConflict: 'student_id,lesson_id' });
      if (error) throw error;
      return row;
    },
    onSuccess: (_, input) => {
      qc.invalidateQueries({ queryKey: ['lesson-progress', input.lessonId, user?.id] });
      qc.invalidateQueries({ queryKey: ['course-progress', input.courseId, user?.id] });
    },
  });
}

interface RecordQuizAttemptInput {
  quizId: string;
  courseId: string;
  score: number;
  maxScore: number;
  passed: boolean;
  answers: Record<string, string>;
  attemptNumber: number;
  startedAt: string;
}

export function useRecordQuizAttempt() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: RecordQuizAttemptInput) => {
      if (!user) throw new Error('Not authenticated');
      const pct = input.maxScore > 0 ? Math.round((input.score / input.maxScore) * 100) : 0;
      const { data, error } = await supabase
        .from('quiz_attempts')
        .insert({
          student_id: user.id,
          quiz_id: input.quizId,
          course_id: input.courseId,
          score: input.score,
          total_points: input.maxScore,
          percentage: pct,
          passed: input.passed,
          answers: input.answers,
          attempt_number: input.attemptNumber,
          submitted_at: new Date().toISOString(),
        })
        .select()
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-enrollments', user?.id] });
    },
  });
}

export function useEnrollInFreeCourse() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (courseId: string) => {
      if (!user) throw new Error('Not authenticated');

      const { data: course, error: courseErr } = await supabase
        .from('courses')
        .select('is_free, is_paid, price, price_amount')
        .eq('id', courseId)
        .maybeSingle();
      if (courseErr) throw courseErr;
      if (!course) throw new Error('Course not found');

      const isFree = course.is_free || (!course.is_paid && (course.price_amount ?? course.price ?? 0) === 0);
      if (!isFree) throw new Error('This is a paid course. Please complete payment first.');

      const { error } = await supabase.from('course_enrollments').insert({
        user_id: user.id,
        course_id: courseId,
        enrollment_type: 'free',
        payment_status: 'not_required',
        amount_paid: 0,
      });
      if (error) throw error;
    },
    onSuccess: (_, courseId) => {
      qc.invalidateQueries({ queryKey: ['my-enrollments', user?.id] });
      qc.invalidateQueries({ queryKey: ['course-access', courseId, user?.id] });
    },
  });
}

// ─── Quiz Attempts ────────────────────────────────────────────────────────────

export function useMyQuizAttempts(courseId?: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['my-quiz-attempts', courseId, user?.id],
    enabled: !!user,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<UserQuizAttemptRow[]> => {
      if (!user) return [];
      let query = supabase
        .from('quiz_attempts')
        .select('id,student_id,quiz_id,course_id,score,total_points,percentage,passed,answers,attempt_number,submitted_at,created_at')
        .eq('student_id', user.id)
        .order('created_at', { ascending: false });
      if (courseId) query = query.eq('course_id', courseId);
      const { data } = await query;
      return (data as UserQuizAttemptRow[]) ?? [];
    },
  });
}
