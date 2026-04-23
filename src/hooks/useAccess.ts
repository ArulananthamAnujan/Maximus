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

      // Admins always have access — no DB hit needed
      if (profile?.role === 'admin') return { hasAccess: true, reason: 'admin' as AccessReason };

      // Run all checks in parallel: course ownership + both enrollment tables
      const [courseRes, newEnrollRes, legacyEnrollRes] = await Promise.all([
        profile?.role === 'teacher'
          ? supabase.from('courses').select('teacher_id').eq('id', courseId).maybeSingle()
          : Promise.resolve({ data: null }),
        supabase
          .from('course_enrollments')
          .select('payment_status')
          .eq('user_id', user.id)
          .eq('course_id', courseId)
          .maybeSingle(),
        supabase
          .from('enrollments')
          .select('id')
          .eq('student_id', user.id)
          .eq('course_id', courseId)
          .maybeSingle(),
      ]);

      // Teacher owns this course
      if (courseRes.data && (courseRes.data as { teacher_id: string }).teacher_id === user.id) {
        return { hasAccess: true, reason: 'teacher' as AccessReason };
      }

      // New enrollment table result
      if (newEnrollRes.data) {
        const status = newEnrollRes.data.payment_status;
        if (status === 'pending') return { hasAccess: false, reason: 'payment_pending' as AccessReason };
        if (status === 'not_required' || status === 'completed') {
          return { hasAccess: true, reason: 'free_enrolled' as AccessReason };
        }
      }

      // Legacy enrollment table fallback
      if (legacyEnrollRes.data) {
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
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      if (!courseId) return null;
      const { data } = await supabase
        .from('courses')
        .select('is_free,is_paid,price,price_amount,stripe_payment_link,preview_enabled')
        .eq('id', courseId)
        .maybeSingle();
      return data;
    },
  });

  return {
    isFree: data?.is_free ?? true,
    isPaid: data?.is_paid ?? false,
    price: data?.price_amount ?? data?.price ?? 0,
    currency: 'AUD',
    previewEnabled: data?.preview_enabled ?? true,
    stripePaymentLink: data?.stripe_payment_link ?? null,
    isLoading,
  };
}
