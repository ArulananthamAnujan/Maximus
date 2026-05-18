import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Star, Clock, BookOpen, Users, CheckCircle2, ChevronDown, ChevronUp,
  Play, FileText, Link as LinkIcon, ArrowLeft, ShoppingCart, Lock, Unlock,
  CreditCard, X
} from 'lucide-react';
import PublicHeader from '../../components/layout/PublicHeader';
import PublicFooter from '../../components/layout/PublicFooter';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useHasCourseAccess } from '../../hooks/useAccess';
import { useEnrollInFreeCourse } from '../../hooks/useProgress';
import { toast as sonnerToast } from 'sonner';
import type { Course, Section } from '../../types';

export default function CoursePreview() {
  const { id } = useParams<{ id: string }>();
  const [course, setCourse] = useState<Course | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [promoCode, setPromoCode] = useState('');
  const [discount, setDiscount] = useState(0);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const { hasAccess, reason, isLoading: accessLoading } = useHasCourseAccess(id);
  const enrollMutation = useEnrollInFreeCourse();

  useEffect(() => {
    if (!id) return;
    const fetchData = async () => {
      const [courseRes, sectionsRes] = await Promise.all([
        supabase.from('courses').select('*, teacher:profiles(full_name, avatar_url, bio)').eq('id', id).maybeSingle(),
        supabase.from('sections').select('*, lessons(id,title,type,duration_minutes,is_preview,order_index)').eq('course_id', id).order('order_index'),
      ]);
      if (courseRes.data) setCourse(courseRes.data as Course);
      if (sectionsRes.data) {
        const sorted = sectionsRes.data.map(s => ({
          ...s,
          lessons: [...(s.lessons || [])].sort((a, b) => a.order_index - b.order_index),
        }));
        setSections(sorted as Section[]);
        if (sorted.length) setExpandedSections(new Set([sorted[0].id]));
      }
      setLoading(false);
    };
    fetchData();
  }, [id]);

  const applyPromo = async () => {
    if (!promoCode) return;
    const { data } = await supabase.from('promo_codes').select('*').eq('code', promoCode.toUpperCase()).eq('is_active', true).maybeSingle();
    if (data) {
      setDiscount(data.discount_percent);
      sonnerToast.success(`Promo applied! ${data.discount_percent}% off`);
    } else {
      sonnerToast.error('Invalid or expired promo code');
    }
  };

  const handleEnrollFree = async () => {
    if (!user || !profile) { navigate('/login'); return; }
    if (!id) return;
    enrollMutation.mutate(id, {
      onSuccess: () => {
        sonnerToast.success('Enrolled successfully! Start learning now.');
        navigate(`/student/courses/${id}`);
      },
      onError: (err) => {
        sonnerToast.error(err instanceof Error ? err.message : 'Enrollment failed.');
      },
    });
  };

  const [checkoutLoading, setCheckoutLoading] = useState(false);

  const handleBuyNow = async () => {
    if (!user || !profile) { navigate('/login'); return; }
    if (!id) return;
    setCheckoutLoading(true);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-create-checkout`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ type: 'course', course_id: id }),
        }
      );
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else if (data.error === 'Stripe not configured') {
        setShowPaymentModal(true);
      } else {
        sonnerToast.error(data.error || 'Failed to start checkout. Please try again.');
      }
    } catch {
      sonnerToast.error('Failed to connect to payment service.');
    } finally {
      setCheckoutLoading(false);
    }
  };

  const toggleSection = (sectionId: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      return next;
    });
  };

  const price = course?.price_amount ?? course?.price ?? 0;
  const isFree = course?.is_free || (!course?.is_paid && price === 0);
  const finalPrice = price * (1 - discount / 100);

  if (loading) {
    return (
      <div className="min-h-screen bg-white">
        <PublicHeader />
        <div className="pt-20 max-w-7xl mx-auto px-4 py-16">
          <div className="animate-pulse space-y-8">
            <div className="h-12 bg-slate-200 rounded w-3/4" />
            <div className="h-6 bg-slate-200 rounded w-full" />
            <div className="h-64 bg-slate-200 rounded" />
          </div>
        </div>
      </div>
    );
  }

  if (!course) return (
    <div className="min-h-screen bg-white">
      <PublicHeader />
      <div className="pt-20 text-center py-20">
        <h1 className="text-2xl font-bold text-slate-900">Course not found</h1>
        <Link to="/courses" className="mt-4 inline-block text-sky-600">Browse all courses</Link>
      </div>
      <PublicFooter />
    </div>
  );


  const renderEnrollmentCard = () => {
    if (accessLoading) {
      return <div className="h-12 bg-slate-100 rounded-xl animate-pulse" />;
    }

    if (hasAccess) {
      return (
        <div>
          <div className="flex items-center gap-2 text-emerald-600 text-sm font-semibold mb-3 bg-emerald-50 rounded-xl px-4 py-2.5">
            <Unlock className="w-4 h-4 shrink-0" />
            {reason === 'admin' ? 'Admin access' : reason === 'teacher' ? 'Instructor access' : 'You are enrolled'}
          </div>
          <button
            onClick={() => navigate(`/student/courses/${course.id}`)}
            className="w-full px-4 py-3 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl transition-colors text-center"
          >
            Continue Learning
          </button>
        </div>
      );
    }

    if (reason === 'payment_pending') {
      return (
        <div className="text-center py-3 px-4 bg-amber-50 border border-amber-200 rounded-xl">
          <p className="text-amber-700 font-semibold text-sm">Payment processing...</p>
          <p className="text-amber-600 text-xs mt-1">Your payment is being verified. Please check back shortly.</p>
        </div>
      );
    }

    if (isFree) {
      return (
        <div>
          <div className="text-3xl font-bold text-slate-900 font-playfair mb-4">Free</div>
          <button
            onClick={handleEnrollFree}
            disabled={enrollMutation.isPending}
            className="w-full px-4 py-3.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2 mb-3 shadow-lg shadow-emerald-600/20"
          >
            <Unlock className="w-4 h-4" />
            {enrollMutation.isPending ? 'Enrolling...' : 'Enrol for Free'}
          </button>
        </div>
      );
    }

    return (
      <div>
        {/* Price display */}
        <div className="mb-5">
          <div className="flex items-baseline gap-3">
            <span className="text-4xl font-bold text-slate-900 font-playfair tracking-tight">
              A${finalPrice.toFixed(2)}
            </span>
            {discount > 0 && (
              <span className="text-lg text-slate-400 line-through font-normal">A${price.toFixed(2)}</span>
            )}
          </div>
          {discount > 0 && (
            <span className="inline-block mt-1 text-xs font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
              {discount}% off
            </span>
          )}
        </div>

        {/* Buy Now button */}
        <button
          onClick={handleBuyNow}
          disabled={checkoutLoading}
          className="w-full py-4 bg-sky-600 hover:bg-sky-700 active:bg-sky-800 text-white font-bold text-base rounded-xl transition-all duration-150 flex items-center justify-center gap-2.5 shadow-lg shadow-sky-600/30 hover:shadow-sky-600/40 mb-4 disabled:opacity-70 disabled:cursor-not-allowed"
        >
          {checkoutLoading ? (
            <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /><span>Redirecting...</span></>
          ) : (
            <><ShoppingCart className="w-5 h-5 shrink-0" /><span>Enrol Now</span></>
          )}
        </button>

        {/* Promo code */}
        <div className="flex gap-2 mb-3">
          <input
            type="text"
            placeholder="Have a promo code?"
            value={promoCode}
            onChange={e => setPromoCode(e.target.value.toUpperCase())}
            className="input-field flex-1 text-sm py-2"
          />
          <button onClick={applyPromo} className="px-4 py-2 bg-slate-900 text-white text-sm rounded-lg hover:bg-slate-800 transition-colors font-semibold whitespace-nowrap">Apply</button>
        </div>

      </div>
    );
  };

  return (
    <div className="bg-white min-h-screen">
      <PublicHeader />
      <div className="pt-16 lg:pt-20">
        <div className="bg-slate-900 py-12">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <Link to="/courses" className="inline-flex items-center gap-2 text-slate-400 hover:text-white mb-6 transition-colors text-sm">
              <ArrowLeft className="w-4 h-4" /> Back to Courses
            </Link>
            <div className="grid lg:grid-cols-3 gap-8 items-start">
              <div className="lg:col-span-2">
                <span className="inline-block bg-sky-600 text-white text-xs font-bold px-3 py-1 rounded-full mb-4">{course.category}</span>
                <h1 className="font-playfair text-3xl lg:text-4xl font-bold text-white mb-4">{course.title}</h1>
                <p className="text-slate-300 text-lg mb-6">{course.short_description}</p>
                <div className="flex flex-wrap items-center gap-5 text-sm text-slate-300">
                  <div className="flex items-center gap-1">
                    {[1,2,3,4,5].map(i => <Star key={i} className={`w-4 h-4 ${i <= Math.round(course.rating) ? 'fill-amber-400 text-amber-400' : 'text-slate-600'}`} />)}
                    <span className="text-amber-400 font-medium ml-1">{course.rating}</span>
                  </div>
                  <span className="flex items-center gap-1"><Users className="w-4 h-4" />{course.total_students} students</span>
                  <span className="flex items-center gap-1"><Clock className="w-4 h-4" />{course.duration_hours} hours</span>
                  <span className="flex items-center gap-1"><BookOpen className="w-4 h-4" />{course.total_lessons} lessons</span>
                  <span className="capitalize">{course.level}</span>
                </div>
                {course.teacher && (
                  <p className="text-slate-400 text-sm mt-3">Instructor: <span className="text-white font-medium">{(course.teacher as { full_name: string }).full_name}</span></p>
                )}
              </div>

              <div className="bg-white rounded-2xl overflow-hidden shadow-2xl border border-slate-100">
                <div className="relative h-48">
                  <img
                    src={course.thumbnail_url || 'https://images.pexels.com/photos/3184291/pexels-photo-3184291.jpeg'}
                    alt={course.title}
                    width={400}
                    height={192}
                    loading="lazy"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                    <button className="w-14 h-14 bg-white rounded-full flex items-center justify-center hover:scale-110 transition-transform shadow-xl">
                      <Play className="w-6 h-6 text-slate-900 ml-1" />
                    </button>
                  </div>
                  {isFree && (
                    <div className="absolute top-3 left-3 bg-emerald-500 text-white text-xs font-bold px-2 py-1 rounded-lg">FREE</div>
                  )}
                </div>
                <div className="p-5">
                  {renderEnrollmentCard()}
                  {!hasAccess && (
                    <p className="text-xs text-slate-400 text-center mb-4">30-day money-back guarantee</p>
                  )}
                  <div className="space-y-2 text-sm">
                    {[
                      `${course.duration_hours} hours of content`,
                      `${course.total_lessons} lessons`,
                      'Certificate of completion',
                      'Lifetime access',
                      'Mobile & desktop access',
                    ].map(item => (
                      <div key={item} className="flex items-center gap-2 text-slate-600">
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="lg:max-w-2xl">
            {(course.what_you_learn as string[]).length > 0 && (
              <section className="mb-10">
                <h2 className="font-playfair text-2xl font-bold text-slate-900 mb-5">What You'll Learn</h2>
                <div className="grid md:grid-cols-2 gap-3">
                  {(course.what_you_learn as string[]).map((item, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                      <span className="text-slate-700 text-sm">{item}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className="mb-10">
              <h2 className="font-playfair text-2xl font-bold text-slate-900 mb-5">Course Content</h2>
              <p className="text-slate-500 text-sm mb-4">{sections.length} sections • {course.total_lessons} lessons • {course.duration_hours} hours total</p>
              {!hasAccess && (
                <div className="flex items-center gap-2 text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 mb-4">
                  <Lock className="w-4 h-4 text-slate-400 shrink-0" />
                  Lesson content is locked until you enrol. Lessons marked "Preview" can be watched for free.
                </div>
              )}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                {sections.map((section, idx) => (
                  <div key={section.id} className={idx > 0 ? 'border-t border-slate-200' : ''}>
                    <button
                      onClick={() => toggleSection(section.id)}
                      className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-slate-50 transition-colors"
                    >
                      <span className="font-semibold text-slate-900 text-sm">{section.title}</span>
                      <span className="flex items-center gap-3">
                        <span className="text-xs text-slate-400">{section.lessons?.length || 0} lessons</span>
                        {expandedSections.has(section.id) ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                      </span>
                    </button>
                    {expandedSections.has(section.id) && section.lessons && (
                      <div className="bg-slate-50 divide-y divide-slate-100">
                        {section.lessons.map(lesson => (
                          <div key={lesson.id} className="flex items-center gap-3 px-5 py-3">
                            {hasAccess || lesson.is_preview ? (
                              lesson.type === 'video'
                                ? <Play className="w-4 h-4 text-sky-500 shrink-0" />
                                : lesson.type === 'pdf'
                                  ? <FileText className="w-4 h-4 text-red-400 shrink-0" />
                                  : <LinkIcon className="w-4 h-4 text-slate-400 shrink-0" />
                            ) : (
                              <Lock className="w-4 h-4 text-slate-300 shrink-0" />
                            )}
                            <span className={`text-sm flex-1 ${(!hasAccess && !lesson.is_preview) ? 'text-slate-400' : 'text-slate-700'}`}>{lesson.title}</span>
                            {lesson.is_preview && (
                              <span className="text-xs text-sky-600 font-semibold bg-sky-50 border border-sky-100 px-2 py-0.5 rounded-md">Preview</span>
                            )}
                            {lesson.duration_minutes > 0 && (
                              <span className="text-xs text-slate-400">{lesson.duration_minutes}m</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>

            {course.description && (
              <section className="mb-10">
                <h2 className="font-playfair text-2xl font-bold text-slate-900 mb-4">About This Course</h2>
                <p className="text-slate-600 leading-relaxed">{course.description}</p>
              </section>
            )}
          </div>
        </div>
      </div>
      <PublicFooter />

      {showPaymentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 relative">
            <button
              onClick={() => setShowPaymentModal(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="w-12 h-12 bg-sky-100 rounded-2xl flex items-center justify-center mb-4">
              <CreditCard className="w-6 h-6 text-sky-600" />
            </div>
            <h3 className="font-playfair text-xl font-bold text-slate-900 mb-2">Payment Coming Soon</h3>
            <p className="text-slate-500 text-sm mb-4 leading-relaxed">
              Secure online payment for <strong>{course.title}</strong> is being set up. Please contact us to complete your enrolment.
            </p>
            <div className="bg-slate-50 rounded-xl p-4 mb-4 text-sm text-slate-600">
              <p className="font-semibold mb-1">Course Price</p>
              <p className="text-2xl font-bold text-slate-900 font-playfair">A${finalPrice.toFixed(2)}</p>
            </div>
            <Link
              to="/contact"
              onClick={() => setShowPaymentModal(false)}
              className="w-full block text-center btn-primary"
            >
              Contact Us to Enrol
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
