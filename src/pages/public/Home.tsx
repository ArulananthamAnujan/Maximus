import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  BookOpen, Users, Star, ChevronRight, Globe, Briefcase,
  FlaskConical, GraduationCap, CheckCircle, ArrowRight, Mail,
  Play, Quote,
} from 'lucide-react';
import PublicHeader from '../../components/layout/PublicHeader';
import PublicFooter from '../../components/layout/PublicFooter';
import { supabase } from '../../lib/supabase';
import type { Course } from '../../types';

type CourseWithTeacher = Omit<Course, 'teacher'> & {
  teacher?: { full_name: string };
};

const CATEGORIES = [
  {
    icon: FlaskConical,
    title: 'Test Preparation',
    desc: 'IELTS, PTE & General Test Prep',
    color: 'bg-sky-50',
    iconColor: 'text-sky-600',
    border: 'border-sky-100',
    accent: 'text-sky-600',
  },
  {
    icon: Globe,
    title: 'Language Learning',
    desc: 'Japanese, French & Spanish',
    color: 'bg-emerald-50',
    iconColor: 'text-emerald-600',
    border: 'border-emerald-100',
    accent: 'text-emerald-600',
  },
  {
    icon: Briefcase,
    title: 'Professional Skills',
    desc: 'Xero Accounting & Career Skills',
    color: 'bg-amber-50',
    iconColor: 'text-amber-600',
    border: 'border-amber-100',
    accent: 'text-amber-600',
  },
  {
    icon: BookOpen,
    title: 'Short Courses',
    desc: 'Workshops & Intensive Programs',
    color: 'bg-rose-50',
    iconColor: 'text-rose-600',
    border: 'border-rose-100',
    accent: 'text-rose-600',
  },
];

const STUDENT_BENEFITS = [
  'Expert-led live and recorded sessions',
  'Personalised feedback and mentoring',
  'Flexible self-paced learning',
  'Industry-recognised certificates',
  'Small class sizes for focused learning',
  'Ongoing student support team',
  'Practice tests and mock exams',
  'Access to a global learner community',
];

const WHY_US = [
  { title: 'Experienced Instructors', desc: 'Our educators bring real-world expertise and a passion for teaching.' },
  { title: 'Proven Results', desc: 'Thousands of students have achieved their target scores and career goals.' },
  { title: 'Flexible Learning', desc: 'Study at your own pace with both online and in-person options.' },
  { title: 'Affordable Pricing', desc: 'Quality education at accessible prices with flexible payment options.' },
  { title: 'Comprehensive Support', desc: 'From enrolment to certification, we are with you every step.' },
  { title: 'Recognised Certificates', desc: 'Our qualifications are acknowledged by employers and institutions.' },
];

const GALLERY = [
  'https://images.pexels.com/photos/1438081/pexels-photo-1438081.jpeg',
  'https://images.pexels.com/photos/1516440/pexels-photo-1516440.jpeg',
  'https://images.pexels.com/photos/3184299/pexels-photo-3184299.jpeg',
  'https://images.pexels.com/photos/3769021/pexels-photo-3769021.jpeg',
  'https://images.pexels.com/photos/4050315/pexels-photo-4050315.jpeg',
  'https://images.pexels.com/photos/6238297/pexels-photo-6238297.jpeg',
];

export default function Home() {
  const [courses, setCourses] = useState<CourseWithTeacher[]>([]);
  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);

  useEffect(() => {
    supabase
      .from('courses')
      .select('*, teacher:profiles(full_name)')
      .eq('is_published', true)
      .eq('is_archived', false)
      .order('total_students', { ascending: false })
      .limit(8)
      .then(({ data }) => {
        if (data) setCourses(data as CourseWithTeacher[]);
      });
  }, []);

  const levelColors: Record<string, string> = {
    beginner: 'bg-green-100 text-green-700',
    intermediate: 'bg-yellow-100 text-yellow-700',
    advanced: 'bg-red-100 text-red-700',
  };

  return (
    <div className="min-h-screen bg-white dark:bg-navy-950">
      <PublicHeader />

      {/* Hero */}
      <section className="relative min-h-screen flex items-center overflow-hidden">
        <div className="absolute inset-0">
          <img
            src="https://images.pexels.com/photos/1438081/pexels-photo-1438081.jpeg"
            alt="University students learning"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-white/90 via-white/75 to-white/30" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-36">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 bg-sky-600/15 border border-sky-600/30 rounded-full px-4 py-1.5 mb-6">
              <span className="w-2 h-2 bg-sky-600 rounded-full animate-pulse" />
              <span className="text-sky-700 text-sm font-semibold">Now Enrolling — Limited Seats Available</span>
            </div>
            <h1 className="font-playfair text-5xl sm:text-6xl lg:text-7xl font-bold text-slate-900 leading-tight mb-4">
              Learn. Upskill.<br />
              <span className="text-sky-600">Achieve.</span>
            </h1>
            <p className="text-xl text-slate-700 font-semibold mb-3">Empowering Learners for Global Success</p>
            <p className="text-lg text-slate-600 leading-relaxed mb-10 max-w-xl">
              Maximus Academy offers expert-led courses in IELTS, PTE, language learning, and professional skills —
              helping you reach your goals with confidence and clarity.
            </p>
            <div className="flex flex-wrap gap-4">
              <Link to="/courses" className="flex items-center gap-2 px-8 py-3.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold transition-all text-base shadow-lg shadow-sky-600/30">
                Explore Courses <ArrowRight className="w-5 h-5" />
              </Link>
              <Link to="/book-online" className="flex items-center gap-2 px-8 py-3.5 rounded-xl border-2 border-slate-800/40 text-slate-800 font-bold hover:border-slate-800/70 hover:bg-slate-800/5 transition-all text-base">
                <Play className="w-5 h-5" /> Book a Session
              </Link>
            </div>

            <div className="flex flex-wrap gap-10 mt-14">
              {[
                { value: '1,000+', label: 'Students Enrolled' },
                { value: '8', label: 'Courses Available' },
                { value: '4.8★', label: 'Average Rating' },
              ].map(stat => (
                <div key={stat.label}>
                  <p className="text-3xl font-bold text-slate-900 font-playfair">{stat.value}</p>
                  <p className="text-slate-500 text-sm mt-0.5 font-medium">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="py-20 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <p className="text-sky-600 font-semibold text-sm uppercase tracking-wider mb-2">What We Offer</p>
            <h2 className="font-playfair text-4xl font-bold text-slate-900 mb-4">Explore Our Learning Areas</h2>
            <p className="text-slate-500 max-w-xl mx-auto">From language proficiency to professional development — find the course that fits your goals.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {CATEGORIES.map(cat => (
              <Link
                key={cat.title}
                to="/courses"
                className={`group p-6 rounded-2xl border ${cat.color} ${cat.border} hover:shadow-lg transition-all duration-300 hover:-translate-y-1`}
              >
                <div className={`w-14 h-14 rounded-xl flex items-center justify-center mb-4 ${cat.iconColor} bg-white shadow-sm`}>
                  <cat.icon className="w-7 h-7" />
                </div>
                <h3 className={`font-bold text-slate-900 text-lg mb-1 group-hover:${cat.accent} transition-colors`}>{cat.title}</h3>
                <p className="text-sm text-slate-500">{cat.desc}</p>
                <div className={`flex items-center gap-1 mt-4 ${cat.accent} text-sm font-semibold`}>
                  View Courses <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Courses */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-end justify-between mb-12">
            <div>
              <p className="text-sky-600 font-semibold text-sm uppercase tracking-wider mb-2">Our Programs</p>
              <h2 className="font-playfair text-4xl font-bold text-slate-900">Featured Courses</h2>
            </div>
            <Link to="/courses" className="hidden sm:flex items-center gap-1 text-sky-600 font-semibold hover:text-sky-700 transition-colors">
              View All <ChevronRight className="w-4 h-4" />
            </Link>
          </div>

          {courses.length === 0 ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {[1,2,3,4,5,6,7,8].map(i => (
                <div key={i} className="rounded-2xl bg-gray-100 dark:bg-navy-800 animate-pulse h-72" />
              ))}
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {courses.map(course => (
                <Link
                  key={course.id}
                  to={`/courses/${course.id}`}
                  className="group rounded-2xl overflow-hidden border border-slate-100 bg-white hover:shadow-xl transition-all duration-300 hover:-translate-y-1"
                >
                  <div className="relative h-44 overflow-hidden">
                    <img
                      src={course.thumbnail_url || 'https://images.pexels.com/photos/3184291/pexels-photo-3184291.jpeg'}
                      alt={course.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                    <div className="absolute top-3 left-3">
                      <span className={`text-xs font-semibold px-2 py-1 rounded-full ${levelColors[course.level] || 'bg-slate-100 text-slate-700'}`}>
                        {course.level}
                      </span>
                    </div>
                    {course.is_free && (
                      <div className="absolute top-3 right-3">
                        <span className="text-xs font-bold px-2 py-1 rounded-full bg-emerald-500 text-white">Free</span>
                      </div>
                    )}
                  </div>
                  <div className="p-4">
                    <div className="flex items-center gap-1 mb-2">
                      {[1,2,3,4,5].map(i => (
                        <Star key={i} className={`w-3 h-3 ${i <= Math.round(course.rating) ? 'fill-amber-400 text-amber-400' : 'text-slate-200'}`} />
                      ))}
                      <span className="text-xs text-slate-400 ml-1">({course.rating})</span>
                    </div>
                    <h3 className="font-semibold text-slate-900 text-sm leading-snug mb-3 line-clamp-2 group-hover:text-sky-600 transition-colors">
                      {course.title}
                    </h3>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1 text-xs text-slate-400">
                        <Users className="w-3 h-3" />
                        <span>{course.total_students} students</span>
                      </div>
                      <span className="font-bold text-slate-900 text-sm">
                        {course.is_free ? 'Free' : `A$${course.price.toFixed(0)}`}
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}

          <div className="text-center mt-10">
            <Link to="/courses" className="btn-primary px-8 py-3">Browse All Courses</Link>
          </div>
        </div>
      </section>

      {/* Why Us */}
      <section className="py-20 relative overflow-hidden bg-slate-900">
        <div className="absolute inset-0">
          <img
            src="https://images.pexels.com/photos/3184465/pexels-photo-3184465.jpeg"
            alt="Students collaborating"
            className="w-full h-full object-cover opacity-15"
          />
          <div className="absolute inset-0 bg-slate-900/85" />
        </div>
        <div className="absolute top-0 right-0 w-96 h-96 bg-sky-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-sky-400/10 rounded-full blur-3xl" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <p className="text-sky-400 font-semibold text-sm uppercase tracking-widest mb-2">Our Difference</p>
            <h2 className="font-playfair text-4xl font-bold text-white mb-4">Why Choose Maximus Academy?</h2>
            <p className="text-slate-400 max-w-xl mx-auto">We believe every learner deserves the best support, resources, and guidance to achieve their full potential.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {WHY_US.map((item, i) => (
              <div key={i} className="p-6 rounded-2xl bg-white/8 border border-white/10 hover:bg-white/12 hover:border-sky-500/40 transition-all duration-300 group">
                <div className="w-11 h-11 bg-sky-500/20 border border-sky-500/30 rounded-xl flex items-center justify-center mb-4 group-hover:bg-sky-500/30 transition-colors">
                  <CheckCircle className="w-5 h-5 text-sky-400" />
                </div>
                <h3 className="font-bold text-white text-lg mb-2">{item.title}</h3>
                <p className="text-sm text-slate-400 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* What Students Get */}
      <section className="py-20 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-14 items-center">
            <div>
              <p className="text-sky-600 font-semibold text-sm uppercase tracking-wider mb-2">Student Experience</p>
              <h2 className="font-playfair text-4xl font-bold text-slate-900 mb-5">What You Get When You Enrol</h2>
              <p className="text-slate-500 mb-8 leading-relaxed">
                At Maximus Academy, every student receives comprehensive support from day one. We are committed to your success inside and outside the classroom.
              </p>
              <div className="grid sm:grid-cols-2 gap-3">
                {STUDENT_BENEFITS.map((benefit, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-sky-500 shrink-0 mt-0.5" />
                    <span className="text-sm text-slate-700">{benefit}</span>
                  </div>
                ))}
              </div>
              <div className="mt-8 flex gap-4">
                <Link to="/register" className="px-6 py-3 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold transition-colors">Enrol Now</Link>
                <Link to="/our-mission" className="px-6 py-3 rounded-xl border-2 border-slate-300 text-slate-700 font-bold hover:border-sky-400 hover:text-sky-600 transition-colors">Our Mission</Link>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-4">
                <img src="https://images.pexels.com/photos/3184291/pexels-photo-3184291.jpeg" alt="Students" className="rounded-2xl w-full h-48 object-cover" />
                <img src="https://images.pexels.com/photos/5427869/pexels-photo-5427869.jpeg" alt="Learning" className="rounded-2xl w-full h-36 object-cover" />
              </div>
              <div className="space-y-4 mt-8">
                <img src="https://images.pexels.com/photos/4144923/pexels-photo-4144923.jpeg" alt="Classroom" className="rounded-2xl w-full h-36 object-cover" />
                <img src="https://images.pexels.com/photos/3184465/pexels-photo-3184465.jpeg" alt="Collaboration" className="rounded-2xl w-full h-48 object-cover" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonial */}
      <section className="py-20 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-sky-600 font-semibold text-sm uppercase tracking-wider mb-8">Student Success Story</p>
          <div className="relative">
            <Quote className="w-12 h-12 text-sky-200 mx-auto mb-6" />
            <blockquote className="font-playfair text-2xl sm:text-3xl text-slate-900 font-medium leading-relaxed mb-8 italic">
              "Maximus Academy completely transformed my IELTS preparation. The structured lessons, personalised feedback, and supportive instructors helped me achieve Band 8 — far beyond what I expected. I cannot recommend this academy enough!"
            </blockquote>
            <div className="flex items-center justify-center gap-4">
              <div className="w-16 h-16 rounded-full overflow-hidden border-4 border-sky-200">
                <img
                  src="https://images.pexels.com/photos/2379004/pexels-photo-2379004.jpeg"
                  alt="Michael Johnson"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="text-left">
                <p className="font-semibold text-slate-900">Michael Johnson</p>
                <p className="text-sm text-slate-500">IELTS Band 8 Graduate</p>
                <div className="flex items-center gap-0.5 mt-1">
                  {[1,2,3,4,5].map(i => (
                    <Star key={i} className="w-4 h-4 fill-amber-400 text-amber-400" />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Gallery */}
      <section className="py-20 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <p className="text-sky-600 font-semibold text-sm uppercase tracking-wider mb-2">Our Campus Life</p>
            <h2 className="font-playfair text-4xl font-bold text-slate-900">Life at Maximus Academy</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {GALLERY.map((src, i) => (
              <div key={i} className={`overflow-hidden rounded-2xl ${i === 0 ? 'md:col-span-2' : ''}`}>
                <img
                  src={src}
                  alt={`Gallery ${i + 1}`}
                  className="w-full h-52 object-cover hover:scale-105 transition-transform duration-500"
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Newsletter */}
      <section className="py-20 bg-sky-700">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="w-16 h-16 bg-white/15 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Mail className="w-8 h-8 text-white" />
          </div>
          <h2 className="font-playfair text-4xl font-bold text-white mb-4">Stay Informed</h2>
          <p className="text-sky-100 mb-8">
            Subscribe to receive updates on new courses, exam tips, scholarship opportunities, and exclusive offers from Maximus Academy.
          </p>
          {subscribed ? (
            <div className="flex items-center justify-center gap-3 text-white font-semibold">
              <CheckCircle className="w-6 h-6" />
              Thank you for subscribing! We will be in touch soon.
            </div>
          ) : (
            <form
              onSubmit={(e) => { e.preventDefault(); if (email) setSubscribed(true); }}
              className="flex flex-col sm:flex-row gap-3 max-w-lg mx-auto"
            >
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="Enter your email address"
                required
                className="flex-1 px-5 py-3.5 rounded-xl bg-white/15 border border-white/30 text-white placeholder:text-sky-200 focus:outline-none focus:border-white focus:bg-white/20 transition-colors"
              />
              <button type="submit" className="px-6 py-3.5 bg-white text-sky-700 font-bold rounded-xl hover:bg-sky-50 transition-colors whitespace-nowrap flex items-center gap-2">
                Subscribe <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          )}
          <p className="text-sky-200 text-xs mt-4">We respect your privacy. Unsubscribe at any time.</p>
        </div>
      </section>

      {/* CTA Banner */}
      <section className="py-16 bg-slate-900 relative overflow-hidden">
        <div className="absolute inset-0">
          <img src="https://images.pexels.com/photos/5935791/pexels-photo-5935791.jpeg" alt="Learning" className="w-full h-full object-cover opacity-10" />
        </div>
        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="font-playfair text-3xl sm:text-4xl font-bold text-white mb-4">
            Ready to Start Your Learning Journey?
          </h2>
          <p className="text-slate-300 mb-8 text-lg">
            Join hundreds of students already achieving their goals with Maximus Academy.
          </p>
          <div className="flex flex-wrap gap-4 justify-center">
            <Link to="/register" className="px-8 py-3.5 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-xl transition-colors flex items-center gap-2">
              <GraduationCap className="w-5 h-5" /> Enrol Now
            </Link>
            <Link to="/contact" className="px-8 py-3.5 border-2 border-white/30 text-white font-bold rounded-xl hover:border-white/60 hover:bg-white/10 transition-colors">
              Contact Us
            </Link>
          </div>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
