import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export type AccessReason =
  | 'admin'
  | 'teacher'
  | 'free_enrolled'
  | 'paid_enrolled'
  | 'not_enrolled'
  | 'payment_pending';

interface AccessResult {
  hasAccess: boolean;
  reason: AccessReason;
  isLoading: boolean;
}

interface PricingResult {
  isFree: boolean;
  isPaid: boolean;
  price: number;
  currency: string;
  previewEnabled: boolean;
  stripePaymentLink: string | null;
  isLoading: boolean;
}

export function useHasCourseAccess(courseId: string | undefined): AccessResult {
  const { user, profile } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['course-access', courseId, user?.id],
    enabled: !!courseId && !!user,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      if (!courseId || !user) return null;

      if (profile?.role === 'admin') return { hasAccess: true, reason: 'admin' as AccessReason };

      // Check if teacher owns this course
      if (profile?.role === 'teacher') {
        const { data: course } = await supabase
          .from('courses')
          .select('teacher_id')
          .eq('id', courseId)
          .maybeSingle();
        if (course?.teacher_id === user.id) return { hasAccess: true, reason: 'teacher' as AccessReason };
      }

      // Check new course_enrollments table first
      const { data: enrollment } = await supabase
        .from('course_enrollments')
        .select('enrollment_type, payment_status')
        .eq('user_id', user.id)
        .eq('course_id', courseId)
        .maybeSingle();

      if (enrollment) {
        if (enrollment.payment_status === 'pending') {
          return { hasAccess: false, reason: 'payment_pending' as AccessReason };
        }
        if (enrollment.payment_status === 'not_required' || enrollment.payment_status === 'completed') {
          const reason: AccessReason = enrollment.enrollment_type === 'free' ? 'free_enrolled' : 'paid_enrolled';
          return { hasAccess: true, reason };
        }
      }

      // Fall back to legacy enrollments table
      const { data: legacyEnrollment } = await supabase
        .from('enrollments')
        .select('id')
        .eq('student_id', user.id)
        .eq('course_id', courseId)
        .maybeSingle();

      if (legacyEnrollment) {
        return { hasAccess: true, reason: 'free_enrolled' as AccessReason };
      }

      return { hasAccess: false, reason: 'not_enrolled' as AccessReason };
    },
  });

  return {
    hasAccess: data?.hasAccess ?? false,
    reason: data?.reason ?? 'not_enrolled',
    isLoading,
  };
}

export function useCoursePricing(courseId: string | undefined): PricingResult {
  const { data, isLoading } = useQuery({
    queryKey: ['course-pricing', courseId],
    enabled: !!courseId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      if (!courseId) return null;
      const { data } = await supabase
        .from('courses')
        .select('is_free, is_paid, price, price_amount, currency, preview_enabled, stripe_payment_link')
        .eq('id', courseId)
        .maybeSingle();
      return data;
    },
  });

  return {
    isFree: data?.is_free ?? true,
    isPaid: data?.is_paid ?? false,
    price: data?.price_amount ?? data?.price ?? 0,
    currency: data?.currency ?? 'AUD',
    previewEnabled: data?.preview_enabled ?? true,
    stripePaymentLink: data?.stripe_payment_link ?? null,
    isLoading,
  };
}
