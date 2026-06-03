import { Link } from 'react-router-dom';
import { Target, Heart, Globe, Star, CheckCircle, ArrowRight, Users, BookOpen, Award } from 'lucide-react';
import PublicHeader from '../../components/layout/PublicHeader';
import PublicFooter from '../../components/layout/PublicFooter';

const PILLARS = [
  {
    icon: Globe,
    title: 'Globally Focused Education',
    desc: 'Our programs are designed with international standards in mind, preparing learners for global exams, careers, and opportunities beyond borders.',
    color: 'text-sky-600', bg: 'bg-sky-50', border: 'border-sky-100',
  },
  {
    icon: Target,
    title: 'Practical & Result-Driven Learning',
    desc: 'We focus on real skills, clear concepts, and structured preparation — not just theory. Every course is built to deliver measurable progress and confidence.',
    color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100',
  },
  {
    icon: Star,
    title: 'Expert-Led Guidance',
    desc: 'Our instructors bring experience, clarity, and personalised support, ensuring learners stay motivated, focused, and well-prepared throughout their journey.',
    color: 'text-amber-500', bg: 'bg-amber-50', border: 'border-amber-100',
  },
  {
    icon: Heart,
    title: 'Flexible Online Learning',
    desc: 'Learn anytime, anywhere. Our online-first approach allows students and professionals to balance education with work and life commitments.',
    color: 'text-rose-500', bg: 'bg-rose-50', border: 'border-rose-100',
  },
];

const GOALS = [
  'Make quality education accessible to every motivated learner',
  'Prepare students to succeed in international exams and careers',
  'Foster a supportive, inclusive, and inspiring learning environment',
  'Bridge the gap between education and real-world application',
  'Continuously innovate our teaching methodologies',
  'Empower learners with confidence and practical skills',
];

const MILESTONES = [
  { value: '1,000+', label: 'Students Trained' },
  { value: '9', label: 'Courses Offered' },
  { value: '4.8/5', label: 'Average Rating' },
  { value: '95%', label: 'Success Rate' },
];

export default function OurMission() {
  return (
    <div className="min-h-screen bg-white">
      <PublicHeader />

      {/* Hero */}
      <section className="relative pt-28 pb-20 bg-slate-900 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(14,165,233,0.15),transparent_60%)]" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-sky-500/5 rounded-full blur-3xl" />
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex items-center gap-2 bg-sky-500/20 border border-sky-500/30 rounded-full px-4 py-1.5 mb-6">
            <Target className="w-4 h-4 text-sky-400" />
            <span className="text-sky-300 text-sm font-semibold">Our Mission & Values</span>
          </div>
          <h1 className="font-playfair text-5xl sm:text-6xl font-bold text-white mb-6 leading-tight">
            Learn. Grow. Succeed.
          </h1>
          <p className="text-xl text-slate-300 leading-relaxed max-w-3xl mx-auto">
            Guiding aspirants with care, clarity, and commitment — at Maximus Academy, our mission is to empower every learner with the knowledge, skills, and confidence they need to succeed on a global stage.
          </p>
        </div>
      </section>

      {/* Mission */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <p className="text-sky-600 font-semibold text-sm uppercase tracking-wider mb-3">Why We Exist</p>
              <h2 className="font-playfair text-4xl font-bold text-slate-900 mb-6">Our Mission</h2>
              <div className="space-y-5 text-slate-600 leading-relaxed">
                <p>
                  At Maximus Academy, we combine quality education, expert guidance, and global relevance to help learners achieve real outcomes.
                </p>
                <p>
                  Whether you are preparing for an international exam, learning a new language, or building professional skills, our mission is to guide you with expert instruction, personalised feedback, and unwavering support.
                </p>
                <p>
                  Shaping global futures through thoughtfully designed education, expert-led learning experiences, and accessible pathways to academic and professional success worldwide.
                </p>
              </div>
              <div className="mt-8 flex gap-4 flex-wrap">
                <Link to="/courses" className="px-6 py-3 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl transition-colors flex items-center gap-2">
                  Our Courses <ArrowRight className="w-4 h-4" />
                </Link>
                <Link to="/about" className="px-6 py-3 border-2 border-slate-200 text-slate-700 font-bold rounded-xl hover:border-sky-400 hover:text-sky-600 transition-colors">
                  About Us
                </Link>
              </div>
            </div>
            <div className="relative">
              <img
                src="https://images.pexels.com/photos/3184291/pexels-photo-3184291.jpeg"
                alt="Students at Maximus Academy"
                className="rounded-2xl w-full h-96 object-cover shadow-2xl"
              />
              <div className="absolute -bottom-6 -left-6 bg-sky-600 rounded-2xl p-5 shadow-xl">
                <p className="font-playfair text-3xl font-bold text-white">95%</p>
                <p className="text-sky-100 font-medium text-sm mt-1">Student Success Rate</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-16 bg-slate-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
            {MILESTONES.map((m, i) => (
              <div key={i} className="text-center">
                <p className="font-playfair text-4xl font-bold text-white mb-2">{m.value}</p>
                <p className="text-slate-400 font-medium">{m.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why Choose Us */}
      <section className="py-20 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <p className="text-sky-600 font-semibold text-sm uppercase tracking-wider mb-2">Why Choose Us</p>
            <h2 className="font-playfair text-4xl font-bold text-slate-900 mb-4">Our Core Pillars</h2>
            <p className="text-slate-500 max-w-2xl mx-auto">
              At Maximus Academy, we combine quality education, expert guidance, and global relevance to help learners achieve real outcomes.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {PILLARS.map((v, i) => (
              <div key={i} className={`p-6 rounded-2xl ${v.bg} border ${v.border} hover:shadow-lg transition-all duration-300 hover:-translate-y-1`}>
                <div className="w-12 h-12 rounded-xl bg-white flex items-center justify-center mb-4 shadow-sm">
                  <v.icon className={`w-6 h-6 ${v.color}`} />
                </div>
                <h3 className="font-bold text-slate-900 text-lg mb-2">{v.title}</h3>
                <p className="text-sm text-slate-600 leading-relaxed">{v.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Goals */}
      <section className="py-20 bg-slate-900 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-sky-500/5 rounded-full blur-3xl" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <p className="text-sky-400 font-semibold text-sm uppercase tracking-wider mb-3">What We Aim For</p>
              <h2 className="font-playfair text-4xl font-bold text-white mb-6">Our Goals</h2>
              <div className="space-y-4">
                {GOALS.map((goal, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-sky-400 shrink-0 mt-0.5" />
                    <p className="text-slate-300">{goal}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              {[
                { icon: Users, label: 'Community', value: '1,000+' },
                { icon: BookOpen, label: 'Courses', value: '9' },
                { icon: Award, label: 'Certificates', value: '500+' },
              ].map((stat, i) => (
                <div key={i} className="bg-white/5 border border-white/10 rounded-2xl p-6 text-center hover:bg-white/10 transition-colors">
                  <stat.icon className="w-8 h-8 text-sky-400 mx-auto mb-3" />
                  <p className="font-playfair text-3xl font-bold text-white mb-1">{stat.value}</p>
                  <p className="text-slate-400 text-sm">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 bg-sky-600">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="font-playfair text-3xl font-bold text-white mb-4">Be Part of Our Mission</h2>
          <p className="text-sky-100 mb-8 text-lg">
            Join the growing community of learners who are achieving their goals with Maximus Academy.
          </p>
          <div className="flex flex-wrap gap-4 justify-center">
            <Link to="/register" className="px-8 py-3.5 bg-white text-sky-700 font-bold rounded-xl hover:bg-sky-50 transition-colors">
              Enrol Today
            </Link>
            <Link to="/contact" className="px-8 py-3.5 border-2 border-white/50 text-white font-bold rounded-xl hover:border-white hover:bg-white/10 transition-colors">
              Get in Touch
            </Link>
          </div>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
