import { useState, useEffect, useMemo, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, Filter, BookOpen, Star, Clock, Users, CheckCircle2, Lock } from 'lucide-react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { studentNavItems } from './studentNav';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useEnrollInFreeCourse, useMyEnrollments } from '../../hooks/useProgress';
import ProgressBar from '../../components/ui/ProgressBar';
import { toast as sonnerToast } from 'sonner';
import type { Course } from '../../types';

const LEVELS = ['All', 'beginner', 'intermediate', 'advanced'];

interface CourseWithEnrollment extends Course {
  enrolled?: boolean;
  progress?: number;
  paymentStatus?: string;
}

export default function StudentCourses() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [courses, setCourses] = useState<CourseWithEnrollment[]>([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [level, setLevel] = useState('All');
  const [tab, setTab] = useState<'browse' | 'enrolled'>('browse');
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<string[]>(['All']);
  const verifiedRef = useRef(false);

  const { data: newEnrollments = [], refetch: refetchEnrollments } = useMyEnrollments();
  const enrollMutation = useEnrollInFreeCourse();

  // Handle Stripe payment success redirect
  useEffect(() => {
    if (verifiedRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const payment = params.get('payment');
    const sessionId = params.get('session_id');
    if (payment !== 'success' || !sessionId) return;
    verifiedRef.current = true;

    (async () => {
      try {
        const { data: { session: authSession } } = await supabase.auth.getSession();
        const token = authSession?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY;
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-verify-session`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ session_id: sessionId }),
          }
        );
        const data = await res.json();
        if (data.enrolled) {
          sonnerToast.success('Payment successful! You now have access to the course.');
          await refetchEnrollments();
          setTab('enrolled');
        } else {
          sonnerToast.error(data.error || 'Could not verify payment. Please contact support.');
        }
      } catch {
        sonnerToast.error('Could not verify payment. Please contact support.');
      }
      // Clean up URL params
      navigate('/student/courses', { replace: true });
    })();
  }, [navigate, refetchEnrollments]);

  useEffect(() => {
    supabase.from('course_categories').select('name').eq('is_active', true).order('sort_order').then(({ data }) => {
      if (data) setCategories(['All', ...data.map(c => c.name)]);
    });
  }, []);

  useEffect(() => {
    if (!profile) return;
    const fetchData = async () => {
      // Check if this student belongs to an org — if so, scope courses to that org
      const { data: orgMembership } = await supabase
        .from('org_students')
        .select('org_id')
        .eq('user_id', profile.id)
        .eq('is_active', true)
        .maybeSingle();

      let coursesQuery = supabase
        .from('courses')
        .select('id,title,short_description,thumbnail_url,price,price_amount,is_free,is_paid,category,level,rating,duration_hours,total_lessons,total_students,stripe_payment_link,org_id,is_published,teacher:profiles(full_name)')
        .eq('is_archived', false)
        .order('created_at', { ascending: false });

      if (orgMembership?.org_id) {
        // Org students: see their org's courses (any publish state) plus all other published courses
        coursesQuery = coursesQuery.or(`org_id.eq.${orgMembership.org_id},is_published.eq.true`);
      } else {
        // Independent students: all published non-archived courses (from any teacher or org)
        coursesQuery = coursesQuery.eq('is_published', true);
      }

      const [coursesRes, legacyEnrollRes] = await Promise.all([
        coursesQuery,
        supabase.from('enrollments').select('course_id, progress_percent').eq('student_id', profile.id),
      ]);

      const legacyMap = new Map((legacyEnrollRes.data || []).map(e => [e.course_id, { progress: e.progress_percent, paymentStatus: 'not_required' }]));
      const newMap = new Map(newEnrollments.map(e => [e.course_id, { progress: e.progress_percent, paymentStatus: e.payment_status }]));

      const enriched = (coursesRes.data || []).map(c => {
        const ne = newMap.get(c.id) ?? legacyMap.get(c.id);
        return {
          ...c,
          enrolled: !!ne,
          progress: ne?.progress ?? 0,
          paymentStatus: ne?.paymentStatus,
        };
      });
      setCourses(enriched as CourseWithEnrollment[]);
      setLoading(false);
    };
    fetchData();
  }, [profile, newEnrollments]);

  const handleEnroll = async (courseId: string, course: CourseWithEnrollment) => {
    if (!profile) return;
    const price = Number(course.price_amount ?? course.price ?? 0);
    const isFree = course.is_free || price === 0;
    // Org students get free access to their org's courses
    const isOrgCourse = !!course.org_id;

    if (!isFree && !isOrgCourse) {
      // Redirect to course preview page which handles Stripe checkout
      window.location.href = `/courses/${courseId}`;
      return;
    }

    enrollMutation.mutate(courseId, {
      onSuccess: () => {
        sonnerToast.success('Successfully enrolled!');
        setCourses(prev => prev.map(c => c.id === courseId ? { ...c, enrolled: true, progress: 0, paymentStatus: 'not_required' } : c));
      },
      onError: (err) => {
        sonnerToast.error(err instanceof Error ? err.message : 'Enrolment failed. Please try again.');
      },
    });
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return courses.filter(c => {
      if (tab === 'enrolled' && !c.enrolled) return false;
      if (category !== 'All' && c.category !== category) return false;
      if (level !== 'All' && c.level !== level) return false;
      if (q && !c.title.toLowerCase().includes(q) && !(c.short_description || '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [courses, search, category, level, tab]);

  const levelColors: Record<string, string> = {
    beginner: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    intermediate: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    advanced: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  };

  return (
    <DashboardLayout navItems={studentNavItems} title="Courses" subtitle="Browse and manage your courses">
      <div className="space-y-6">
        <div className="flex gap-2 p-1 bg-gray-100 dark:bg-navy-800 rounded-xl w-fit">
          {(['browse', 'enrolled'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${tab === t ? 'bg-white dark:bg-navy-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}
            >
              {t === 'browse' ? 'Browse All' : 'My Courses'}
            </button>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search courses..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="input-field pl-10"
            />
          </div>
          <select value={category} onChange={e => setCategory(e.target.value)} className="input-field sm:w-44">
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={level} onChange={e => setLevel(e.target.value)} className="input-field sm:w-36">
            {LEVELS.map(l => <option key={l} value={l}>{l === 'All' ? 'All Levels' : l.charAt(0).toUpperCase() + l.slice(1)}</option>)}
          </select>
        </div>

        {loading ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1,2,3,4,5,6].map(i => (
              <div key={i} className="card animate-pulse">
                <div className="h-44 bg-gray-200 dark:bg-navy-700" />
                <div className="p-5 space-y-3">
                  <div className="h-5 bg-gray-200 dark:bg-navy-700 rounded w-3/4" />
                  <div className="h-4 bg-gray-200 dark:bg-navy-700 rounded w-full" />
                  <div className="h-8 bg-gray-200 dark:bg-navy-700 rounded w-28" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <Filter className="w-10 h-10 text-gray-300 dark:text-navy-600 mx-auto mb-3" />
            <p className="text-gray-500 dark:text-gray-400 font-medium">No courses found</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map(course => {
              const price = course.price_amount ?? course.price ?? 0;
              const isFree = course.is_free || (!course.is_paid && price === 0);
              const isOrgCourse = !!course.org_id;
              const effectivelyFree = isFree || isOrgCourse;
              const isPending = course.paymentStatus === 'pending';
              return (
                <div key={course.id} className="card group hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
                  <div className="relative h-44 overflow-hidden">
                    <img
                      src={course.thumbnail_url || 'https://images.pexels.com/photos/3184291/pexels-photo-3184291.jpeg'}
                      alt={course.title}
                      width={400}
                      height={176}
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                    <div className="absolute top-3 left-3 flex gap-2">
                      <span className={`badge ${levelColors[course.level]}`}>{course.level}</span>
                      {effectivelyFree && <span className="badge bg-emerald-500 text-white">{isOrgCourse && !isFree ? 'Included' : 'Free'}</span>}
                      {!effectivelyFree && <span className="badge bg-sky-600 text-white">Paid</span>}
                    </div>
                    {course.enrolled && (
                      <div className="absolute top-3 right-3">
                        <CheckCircle2 className="w-5 h-5 text-green-400" />
                      </div>
                    )}
                  </div>
                  <div className="p-5">
                    <div className="flex items-center gap-1 mb-2">
                      {[1,2,3,4,5].map(i => (
                        <Star key={i} className={`w-3.5 h-3.5 ${i <= Math.round(course.rating) ? 'fill-gold-400 text-gold-400' : 'text-gray-300'}`} />
                      ))}
                      <span className="text-xs text-gray-400 ml-1">({course.rating})</span>
                    </div>
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-1 line-clamp-2 leading-snug">{course.title}</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-3 line-clamp-2">{course.short_description}</p>
                    <div className="flex items-center gap-3 text-xs text-gray-400 mb-4">
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{course.duration_hours}h</span>
                      <span className="flex items-center gap-1"><BookOpen className="w-3 h-3" />{course.total_lessons} lessons</span>
                      <span className="flex items-center gap-1"><Users className="w-3 h-3" />{course.total_students}</span>
                    </div>
                    {course.enrolled ? (
                      <div>
                        {isPending ? (
                          <div className="text-center py-2 text-sm text-amber-600 bg-amber-50 rounded-lg mb-2 font-medium">
                            Payment processing...
                          </div>
                        ) : (
                          <div className="mb-2">
                            <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                              <span>Progress</span>
                              <span>{course.progress}%</span>
                            </div>
                            <ProgressBar value={course.progress || 0} size="sm" />
                          </div>
                        )}
                        {!isPending && (
                          <Link to={`/student/courses/${course.id}`} className="w-full btn-primary text-sm text-center block">
                            {course.progress === 100 ? 'Review Course' : 'Continue Learning'}
                          </Link>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-lg text-navy-900 dark:text-white">
                          {effectivelyFree ? (isOrgCourse && !isFree ? 'Included' : 'Free') : `A$${price.toFixed(2)}`}
                        </span>
                        <button
                          onClick={() => handleEnroll(course.id, course)}
                          disabled={enrollMutation.isPending}
                          className={`text-sm py-2 px-4 disabled:opacity-60 rounded-lg font-semibold flex items-center gap-1.5 transition-colors ${effectivelyFree ? 'btn-primary' : 'bg-sky-600 hover:bg-sky-700 text-white'}`}
                        >
                          {effectivelyFree ? null : <Lock className="w-3.5 h-3.5" />}
                          {enrollMutation.isPending ? 'Enrolling...' : effectivelyFree ? 'Enrol Free' : 'Buy Now'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
