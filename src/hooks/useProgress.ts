import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface LessonProgressRow {
  id: string;
  user_id: string | null;
  student_id: string | null;
  lesson_id: string;
  course_id: string;
  is_completed: boolean;
  watch_percentage: number;
  last_position_seconds: number;
  completed_at: string | null;
  updated_at: string;
}

export interface CourseEnrollmentRow {
  id: string;
  user_id: string;
  course_id: string;
  payment_status: 'not_required' | 'pending' | 'completed' | 'failed' | 'refunded';
  payment_id: string | null;
  progress_percent: number;
  last_accessed_at: string;
  enrolled_at: string;
  completed_at: string | null;
  course?: {
    id: string;
    title: string;
    thumbnail_url: string | null;
    total_lessons: number | null;
    category: string | null;
  };
}

export interface UserQuizAttemptRow {
  id: string;
  user_id: string | null;
  student_id: string | null;
  quiz_id: string;
  course_id: string;
  score: number;
  total_points: number;
  passed: boolean;
  attempt_number: number;
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
        .select('id,user_id,student_id,lesson_id,course_id,is_completed,watch_percentage,last_position_seconds,completed_at,updated_at')
        .eq('user_id', user.id)
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
        .select('id,user_id,student_id,lesson_id,course_id,is_completed,watch_percentage,last_position_seconds,completed_at,updated_at')
        .eq('user_id', user.id)
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
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<CourseEnrollmentRow[]> => {
      if (!user) return [];
      const { data } = await supabase
        .from('course_enrollments')
        .select('id,user_id,course_id,payment_status,payment_id,progress_percent,last_accessed_at,enrolled_at,completed_at,course:courses(id,title,thumbnail_url,total_lessons,category)')
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
  watchPercentage: number;
  isCompleted: boolean;
  completedAt?: string | null;
}

export function useUpdateLessonProgress() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateProgressInput) => {
      if (!user) throw new Error('Not authenticated');
      const row = {
        user_id: user.id,
        lesson_id: input.lessonId,
        course_id: input.courseId,
        last_position_seconds: input.lastPositionSeconds,
        watch_percentage: input.watchPercentage,
        is_completed: input.isCompleted,
        completed_at: input.completedAt ?? (input.isCompleted ? new Date().toISOString() : null),
      };
      const { error } = await supabase
        .from('lesson_progress')
        .upsert(row, { onConflict: 'user_id,lesson_id' });
      if (error) throw error;
      return row;
    },
    onSuccess: (_, input) => {
      qc.invalidateQueries({ queryKey: ['lesson-progress', input.lessonId, user?.id] });
      qc.invalidateQueries({ queryKey: ['course-progress', input.courseId, user?.id] });
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
        .select('is_free,is_paid,price,price_amount')
        .eq('id', courseId)
        .maybeSingle();
      if (courseErr) throw courseErr;
      if (!course) throw new Error('Course not found');

      const isFree = course.is_free || (!course.is_paid && (course.price_amount ?? course.price ?? 0) === 0);
      if (!isFree) throw new Error('This is a paid course. Please complete payment first.');

      const { error } = await supabase.from('course_enrollments').insert({
        user_id: user.id,
        course_id: courseId,
        payment_status: 'not_required',
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
        .select('id,user_id,student_id,quiz_id,course_id,score,total_points,passed,attempt_number,created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (courseId) query = query.eq('course_id', courseId);
      const { data } = await query;
      return (data as UserQuizAttemptRow[]) ?? [];
    },
  });
}
