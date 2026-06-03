import { Users, Award, Globe, TrendingUp, CheckCircle2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import PublicHeader from '../../components/layout/PublicHeader';
import PublicFooter from '../../components/layout/PublicFooter';

const TEAM = [
  { name: 'Sarah Ahmed', role: 'Founder & Director', avatar: 'SA', bio: 'Passionate educator with 15+ years experience helping students achieve their language and professional goals.' },
  { name: 'Michael Thompson', role: 'Head of IELTS & PTE', avatar: 'MT', bio: 'Certified IELTS and PTE examiner with a proven track record of helping students achieve Band 8+.' },
  { name: 'Yuki Tanaka', role: 'Language Programs Lead', avatar: 'YT', bio: 'Native Japanese speaker and polyglot educator, specialising in immersive language acquisition methods.' },
  { name: 'Fatima Rahman', role: 'Student Success Manager', avatar: 'FR', bio: 'Dedicated to ensuring every student receives the support, resources, and encouragement they need.' },
];

const VALUES = [
  { icon: Award, title: 'Excellence', desc: 'We maintain the highest standards in course content, delivery, and student support.', color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100' },
  { icon: Users, title: 'Community', desc: 'Learning is better together. We foster a supportive, inclusive community of motivated learners.', color: 'text-sky-600', bg: 'bg-sky-50', border: 'border-sky-100' },
  { icon: Globe, title: 'Global Reach', desc: 'Quality education should be accessible to every motivated learner, wherever they are in the world.', color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100' },
  { icon: TrendingUp, title: 'Growth', desc: 'We are committed to the continuous growth of our students, instructors, and platform.', color: 'text-rose-600', bg: 'bg-rose-50', border: 'border-rose-100' },
];

const AVATAR_COLORS = ['from-sky-500 to-sky-700', 'from-slate-600 to-slate-800', 'from-emerald-500 to-emerald-700', 'from-amber-500 to-amber-700'];

export default function About() {
  return (
    <div className="bg-white min-h-screen">
      <PublicHeader />
      <div className="pt-20 lg:pt-24">
        <section className="bg-slate-900 py-20 relative overflow-hidden">
          <div className="absolute inset-0">
            <img src="https://images.pexels.com/photos/3184465/pexels-photo-3184465.jpeg" alt="" className="w-full h-full object-cover opacity-10" />
          </div>
          <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h1 className="font-playfair text-5xl font-bold text-white mb-6">About Maximus Academy</h1>
            <p className="text-slate-300 text-xl leading-relaxed">
              Empowering Learners for Global Success — expert-led courses in test preparation, language learning, and professional skills.
            </p>
          </div>
        </section>

        <section className="py-20 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid lg:grid-cols-2 gap-16 items-center">
              <div>
                <p className="text-sky-600 font-semibold text-sm uppercase tracking-wider mb-2">Our Story</p>
                <h2 className="font-playfair text-4xl font-bold text-slate-900 mb-6">Who We Are</h2>
                <div className="space-y-4 text-slate-600 leading-relaxed">
                  <p>Maximus Academy was founded on a powerful belief: every motivated learner deserves access to world-class education. Based in Dhaka, Bangladesh, we serve students across the globe with expert-led courses in IELTS, PTE, language learning, and professional development.</p>
                  <p>Our mission is simple: to guide aspirants with care, clarity, and commitment. Whether you are aiming for a Band 8 in IELTS, learning Japanese for travel, or mastering Xero for your career — we are with you every step of the way.</p>
                  <p>Our experienced instructors combine real-world expertise with a passion for teaching, ensuring that every course delivers practical, measurable results for our students.</p>
                </div>
                <div className="mt-8 grid grid-cols-2 gap-4">
                  {[['2024', 'Launched'], ['1K+', 'Students'], ['8', 'Courses'], ['95%', 'Success Rate']].map(([val, label]) => (
                    <div key={label} className="text-center p-4 bg-sky-50 border border-sky-100 rounded-xl">
                      <p className="text-3xl font-bold text-sky-600 font-playfair">{val}</p>
                      <p className="text-slate-500 text-sm mt-1 font-medium">{label}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="relative">
                <img src="https://images.pexels.com/photos/3184338/pexels-photo-3184338.jpeg" alt="Team" className="rounded-3xl shadow-2xl w-full h-96 object-cover" />
                <div className="absolute -bottom-6 -right-6 bg-sky-600 rounded-2xl p-6 shadow-xl">
                  <p className="text-white font-bold text-2xl font-playfair">95%</p>
                  <p className="text-sky-100 text-sm">Student Success Rate</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="py-20 bg-slate-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <p className="text-sky-600 font-semibold text-sm uppercase tracking-wider mb-2">What We Stand For</p>
              <h2 className="font-playfair text-4xl font-bold text-slate-900 mb-4">Our Values</h2>
              <p className="text-slate-500 text-lg">The principles that guide everything we do</p>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {VALUES.map(value => (
                <div key={value.title} className={`rounded-2xl p-6 border ${value.border} text-center hover:shadow-lg transition-all duration-300 hover:-translate-y-1 ${value.bg}`}>
                  <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm">
                    <value.icon className={`w-7 h-7 ${value.color}`} />
                  </div>
                  <h3 className={`font-bold text-slate-900 mb-2 text-lg`}>{value.title}</h3>
                  <p className="text-sm text-slate-600 leading-relaxed">{value.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-20 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <p className="text-sky-600 font-semibold text-sm uppercase tracking-wider mb-2">The People Behind Maximus</p>
              <h2 className="font-playfair text-4xl font-bold text-slate-900 mb-4">Meet Our Leadership Team</h2>
              <p className="text-slate-500">Experts dedicated to your learning success</p>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {TEAM.map((member, idx) => (
                <div key={member.name} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 text-center hover:shadow-lg transition-shadow">
                  <div className={`w-20 h-20 rounded-full bg-gradient-to-br ${AVATAR_COLORS[idx]} flex items-center justify-center text-2xl font-bold text-white mx-auto mb-4`}>
                    {member.avatar}
                  </div>
                  <h3 className="font-bold text-slate-900 mb-1">{member.name}</h3>
                  <p className="text-sky-600 text-sm font-semibold mb-3">{member.role}</p>
                  <p className="text-sm text-slate-500 leading-relaxed">{member.bio}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-20 bg-slate-900 relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(14,165,233,0.12),transparent_60%)]" />
          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <div>
                <p className="text-sky-400 font-semibold text-sm uppercase tracking-wider mb-3">Quality Assured</p>
                <h2 className="font-playfair text-4xl font-bold text-white mb-6">Accreditations & Partnerships</h2>
                <div className="space-y-4">
                  {['Committed to internationally recognised teaching standards', 'IELTS & PTE certified instruction and assessment', 'Ongoing professional development for all instructors', 'Student feedback integrated into every course improvement'].map(item => (
                    <div key={item} className="flex items-center gap-3">
                      <CheckCircle2 className="w-5 h-5 text-sky-400 shrink-0" />
                      <span className="text-slate-300">{item}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="text-center">
                <p className="text-slate-300 text-lg mb-8 leading-relaxed">Ready to start your learning journey? Join hundreds of students already achieving their goals with Maximus Academy.</p>
                <Link to="/register" className="inline-block px-8 py-3.5 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-xl transition-colors shadow-lg shadow-sky-600/30">Start Learning Today</Link>
              </div>
            </div>
          </div>
        </section>
      </div>
      <PublicFooter />
    </div>
  );
}
