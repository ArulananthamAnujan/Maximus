import { Users, Award, Globe, TrendingUp, CheckCircle2, Lightbulb, Laptop, Briefcase, BadgeCheck, Headphones as HeadphonesIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import PublicHeader from '../../components/layout/PublicHeader';
import PublicFooter from '../../components/layout/PublicFooter';

const FACULTY = [
  { name: 'Md Juwel Sheikh', role: 'Language Instructor', initials: 'MJ', color: 'from-sky-500 to-sky-700' },
  { name: 'Khalida Khanam', role: 'Admin Staff', initials: 'KK', color: 'from-emerald-500 to-emerald-700' },
  { name: 'Md. Harun Ar Rashid', role: 'Head of Operations', initials: 'MH', color: 'from-slate-600 to-slate-800' },
  { name: 'Raiyan Bin Zaman', role: 'Trainer', initials: 'RZ', color: 'from-amber-500 to-amber-700' },
  { name: 'Yeasin Arafat', role: 'Language Instructor', initials: 'YA', color: 'from-sky-600 to-sky-800' },
  { name: 'Tasnim Ferdous', role: 'Admin Staff', initials: 'TF', color: 'from-rose-500 to-rose-700' },
  { name: 'Humaira Jannat', role: 'Admin Staff', initials: 'HJ', color: 'from-teal-500 to-teal-700' },
];

const DIFFERENTIATORS = [
  {
    icon: Award,
    title: 'Expert Trainers',
    desc: 'Learn from industry professionals with real hands-on experience.',
    color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100',
  },
  {
    icon: Briefcase,
    title: 'Practical Learning',
    desc: 'Courses designed with real-world applications and workplace relevance.',
    color: 'text-sky-600', bg: 'bg-sky-50', border: 'border-sky-100',
  },
  {
    icon: Laptop,
    title: 'Flexible Access',
    desc: 'Study anytime, anywhere with easy online learning access.',
    color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100',
  },
  {
    icon: TrendingUp,
    title: 'Career-Focused Content',
    desc: 'Training built to improve skills, confidence, and job readiness.',
    color: 'text-rose-600', bg: 'bg-rose-50', border: 'border-rose-100',
  },
  {
    icon: BadgeCheck,
    title: 'Certification Support',
    desc: 'Earn recognized certificates to boost your professional profile.',
    color: 'text-violet-600', bg: 'bg-violet-50', border: 'border-violet-100',
  },
  {
    icon: HeadphonesIcon,
    title: 'Continuous Guidance',
    desc: 'Get ongoing support, mentorship, and answers whenever you need.',
    color: 'text-teal-600', bg: 'bg-teal-50', border: 'border-teal-100',
  },
];

const STATS = [
  { value: '2024', label: 'Established' },
  { value: '1,000+', label: 'Students' },
  { value: '9', label: 'Courses' },
  { value: '95%', label: 'Success Rate' },
];

export default function About() {
  return (
    <div className="bg-white min-h-screen">
      <PublicHeader />
      <div className="pt-20 lg:pt-24">

        {/* Hero */}
        <section className="relative py-24 bg-slate-900 overflow-hidden">
          <div className="absolute inset-0">
            <img
              src="https://images.pexels.com/photos/3184465/pexels-photo-3184465.jpeg"
              alt=""
              className="w-full h-full object-cover opacity-10"
            />
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(14,165,233,0.15),transparent_60%)]" />
          </div>
          <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <p className="text-sky-400 font-semibold text-sm uppercase tracking-wider mb-3">About Maximus Academy</p>
            <h1 className="font-playfair text-5xl sm:text-6xl font-bold text-white mb-6 leading-tight">
              About Us
            </h1>
            <p className="text-slate-300 text-xl leading-relaxed max-w-3xl mx-auto">
              Empowering learners globally through practical education, expert guidance, and flexible online learning.
            </p>
          </div>
        </section>

        {/* Who We Are */}
        <section className="py-20 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid lg:grid-cols-2 gap-16 items-center">
              <div>
                <p className="text-sky-600 font-semibold text-sm uppercase tracking-wider mb-2">Our Story</p>
                <h2 className="font-playfair text-4xl font-bold text-slate-900 mb-6">Who We Are</h2>
                <div className="space-y-4 text-slate-600 leading-relaxed">
                  <p>
                    Maximus Academy was founded on a powerful belief: every motivated learner deserves access to world-class education. Based in Dhaka, Bangladesh, we serve students across the globe with expert-led courses in IELTS, PTE, language learning, and professional development.
                  </p>
                  <p>
                    Our mission is simple: to guide aspirants with care, clarity, and commitment. Whether you are aiming for a Band 8 in IELTS, learning Japanese for travel, or mastering Xero for your career — we are with you every step of the way.
                  </p>
                  <p>
                    Shaping global futures through thoughtfully designed education, expert-led learning experiences, and accessible pathways to academic and professional success worldwide.
                  </p>
                </div>
                <div className="mt-10 grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {STATS.map(({ value, label }) => (
                    <div key={label} className="text-center p-4 bg-sky-50 border border-sky-100 rounded-xl">
                      <p className="text-2xl font-bold text-sky-600 font-playfair">{value}</p>
                      <p className="text-slate-500 text-xs mt-1 font-medium">{label}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="relative">
                <img
                  src="https://images.pexels.com/photos/3184338/pexels-photo-3184338.jpeg"
                  alt="Maximus Academy team"
                  className="rounded-3xl shadow-2xl w-full h-96 object-cover"
                />
                <div className="absolute -bottom-6 -right-6 bg-sky-600 rounded-2xl p-6 shadow-xl">
                  <p className="text-white font-bold text-2xl font-playfair">95%</p>
                  <p className="text-sky-100 text-sm">Student Success Rate</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Personal Mentorship */}
        <section className="py-20 bg-slate-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mx-auto text-center mb-14">
              <p className="text-sky-600 font-semibold text-sm uppercase tracking-wider mb-2">Our Approach</p>
              <h2 className="font-playfair text-4xl font-bold text-slate-900 mb-4">
                Personal Mentorship, Not Just Coaching
              </h2>
              <p className="text-slate-500 text-lg leading-relaxed">
                At Maximus Academy, we go beyond instruction. Every learner receives dedicated attention, structured guidance, and the support needed to reach their personal goals.
              </p>
            </div>

            <div className="bg-sky-600 rounded-3xl p-10 lg:p-16 text-white text-center mb-14">
              <Lightbulb className="w-12 h-12 text-white/70 mx-auto mb-4" />
              <p className="font-playfair text-2xl sm:text-3xl font-medium italic leading-relaxed max-w-3xl mx-auto">
                "Shaping global futures through thoughtfully designed education, expert-led learning experiences, and accessible pathways to academic and professional success worldwide."
              </p>
            </div>

            <div className="text-center mb-10">
              <h3 className="font-playfair text-3xl font-bold text-slate-900 mb-2">What Makes Us Different?</h3>
              <p className="text-slate-500">Here's what sets us apart from the usual crowd:</p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {DIFFERENTIATORS.map((item, i) => (
                <div
                  key={item.title}
                  className={`rounded-2xl p-6 border ${item.border} ${item.bg} hover:shadow-lg transition-all duration-300 hover:-translate-y-1`}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm shrink-0">
                      <item.icon className={`w-5 h-5 ${item.color}`} />
                    </div>
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">0{i + 1}</span>
                  </div>
                  <h3 className="font-bold text-slate-900 text-lg mb-2">{item.title}</h3>
                  <p className="text-sm text-slate-600 leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Our Faculty */}
        <section className="py-20 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <p className="text-sky-600 font-semibold text-sm uppercase tracking-wider mb-2">The People Behind Maximus</p>
              <h2 className="font-playfair text-4xl font-bold text-slate-900 mb-4">Meet Our Team</h2>
              <p className="text-slate-500">Dedicated educators and staff committed to your success</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-4">
              {FACULTY.map((member) => (
                <div
                  key={member.name}
                  className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 text-center hover:shadow-md transition-shadow"
                >
                  <div className={`w-16 h-16 rounded-full bg-gradient-to-br ${member.color} flex items-center justify-center text-lg font-bold text-white mx-auto mb-3`}>
                    {member.initials}
                  </div>
                  <h3 className="font-bold text-slate-900 text-sm mb-1 leading-tight">{member.name}</h3>
                  <p className="text-sky-600 text-xs font-semibold">{member.role}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Accreditations CTA */}
        <section className="py-20 bg-slate-900 relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(14,165,233,0.12),transparent_60%)]" />
          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <div>
                <p className="text-sky-400 font-semibold text-sm uppercase tracking-wider mb-3">Quality Assured</p>
                <h2 className="font-playfair text-4xl font-bold text-white mb-6">Our Commitments</h2>
                <div className="space-y-4">
                  {[
                    'Committed to internationally recognised teaching standards',
                    'IELTS & PTE certified instruction and assessment',
                    'Ongoing professional development for all instructors',
                    'Student feedback integrated into every course improvement',
                    'Transparent, supportive, and inclusive learning environment',
                  ].map(item => (
                    <div key={item} className="flex items-center gap-3">
                      <CheckCircle2 className="w-5 h-5 text-sky-400 shrink-0" />
                      <span className="text-slate-300">{item}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="text-center">
                <Users className="w-20 h-20 text-sky-500/30 mx-auto mb-6" />
                <p className="text-slate-300 text-lg mb-8 leading-relaxed">
                  Ready to start your learning journey? Join hundreds of students already achieving their goals with Maximus Academy.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Link
                    to="/register"
                    className="px-8 py-3.5 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-xl transition-colors shadow-lg shadow-sky-600/30"
                  >
                    Start Learning Today
                  </Link>
                  <Link
                    to="/our-mission"
                    className="px-8 py-3.5 border-2 border-white/30 text-white font-bold rounded-xl hover:border-white/60 hover:bg-white/10 transition-colors"
                  >
                    Our Mission
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

      </div>
      <PublicFooter />
    </div>
  );
}
