import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, CheckCircle, Mic, PenTool, BookOpen, Headphones,
  Sparkles, Target, Gauge, ShieldCheck, Clock, BarChart3,
  GraduationCap, Quote, Star, ChevronDown, Award, Zap, Globe,
} from 'lucide-react';
import PublicHeader from '../../components/layout/PublicHeader';
import PublicFooter from '../../components/layout/PublicFooter';

const PTE_APP_URL = 'https://synapvexpte.netlify.app/dashboard';

const STATS = [
  { value: '90', label: 'Max PTE Score', suffix: '' },
  { value: '2,500+', label: 'Students Trained', suffix: '' },
  { value: '4.9', label: 'Average Rating', suffix: '★' },
  { value: '48h', label: 'Score Turnaround', suffix: '' },
];

const SKILLS = [
  {
    icon: Mic,
    title: 'Speaking',
    desc: 'Read aloud, repeat sentence, describe image, retell lecture and answer short questions — with instant AI pronunciation and fluency scoring.',
    color: 'from-sky-500 to-blue-600',
    tint: 'bg-sky-50',
    ring: 'text-sky-600',
  },
  {
    icon: PenTool,
    title: 'Writing',
    desc: 'Summarise written text and write essays with real-time feedback on grammar, coherence, vocabulary range and word count.',
    color: 'from-emerald-500 to-teal-600',
    tint: 'bg-emerald-50',
    ring: 'text-emerald-600',
  },
  {
    icon: BookOpen,
    title: 'Reading',
    desc: 'Multiple-choice, re-order paragraphs and fill-in-the-blanks — timed, adaptive practice that mirrors the real exam interface.',
    color: 'from-amber-500 to-orange-600',
    tint: 'bg-amber-50',
    ring: 'text-amber-600',
  },
  {
    icon: Headphones,
    title: 'Listening',
    desc: 'Summarise spoken text, highlight correct summary, fill the blanks and write from dictation — trained on authentic accents.',
    color: 'from-fuchsia-500 to-purple-600',
    tint: 'bg-fuchsia-50',
    ring: 'text-fuchsia-600',
  },
];

const FEATURES = [
  { icon: Sparkles, title: 'AI-Scored Mock Tests', desc: 'Full-length, exam-accurate mocks scored instantly by AI against the official Pearson scoring criteria — no waiting.' },
  { icon: Target, title: 'Personalised Study Plans', desc: 'Adaptive plans that target your weakest tasks so every practice session moves your score higher, faster.' },
  { icon: Gauge, title: 'Real Exam Simulation', desc: 'The same timer, layout and question flow as the real PTE Academic test, so exam day feels familiar.' },
  { icon: BarChart3, title: 'Detailed Analytics', desc: 'Track band-by-band progress across all four skills with clear, actionable performance breakdowns.' },
  { icon: ShieldCheck, title: 'Score Improvement Focus', desc: 'Proven strategies and expert templates for every task type to help you hit your target overall score.' },
  { icon: Clock, title: 'Practice Anytime', desc: 'Unlimited access on any device — practise at your own pace, whenever and wherever suits you.' },
];

const STEPS = [
  { num: '01', title: 'Take a Diagnostic Test', desc: 'Start with a free AI-scored diagnostic to see exactly where you stand across all four skills.' },
  { num: '02', title: 'Get Your Study Plan', desc: 'Receive a personalised roadmap targeting the exact task types holding your score back.' },
  { num: '03', title: 'Practise & Improve', desc: 'Work through unlimited task practice and full mocks with instant feedback after every attempt.' },
  { num: '04', title: 'Ace the Real Exam', desc: 'Walk into test day confident, prepared, and ready to achieve your target PTE score.' },
];

const TESTIMONIALS = [
  {
    quote: 'I jumped from 65 to 82 overall in just three weeks. The AI feedback on my speaking was a total game changer — it caught things a person would miss.',
    name: 'Priya Sharma',
    result: 'PTE Overall 82',
    img: 'https://images.pexels.com/photos/3763188/pexels-photo-3763188.jpeg',
  },
  {
    quote: 'The mock tests feel exactly like the real thing. By exam day there were zero surprises. Hit my 79+ in every section on the first try.',
    name: 'Ahmed Hassan',
    result: 'PTE Overall 84',
    img: 'https://images.pexels.com/photos/2379005/pexels-photo-2379005.jpeg',
  },
  {
    quote: 'Instant scoring meant I could practise twice a day and actually see my progress. The analytics kept me focused on what mattered.',
    name: 'Maria Santos',
    result: 'PTE Overall 79',
    img: 'https://images.pexels.com/photos/1181686/pexels-photo-1181686.jpeg',
  },
];

const FAQS = [
  { q: 'What is PTE Academic?', a: 'PTE Academic is a computer-based English language test accepted by thousands of universities worldwide and for visa applications in countries like Australia, New Zealand, Canada and the UK. It assesses Speaking, Writing, Reading and Listening.' },
  { q: 'How is the practice platform scored?', a: 'Every task and full mock test is scored instantly by AI trained on the official Pearson scoring criteria. You get immediate feedback and a band breakdown after each attempt — no waiting for a tutor.' },
  { q: 'How long does it take to improve my score?', a: 'Most students see meaningful improvement within 2–4 weeks of consistent practice. Your personalised study plan focuses on your weakest task types to accelerate results.' },
  { q: 'Can I practise on my phone?', a: 'Yes. The platform works on any device — laptop, tablet or phone — so you can practise anytime, anywhere at your own pace.' },
  { q: 'Do you offer live guidance too?', a: 'Absolutely. Alongside the self-paced platform, our expert trainers offer live sessions, template reviews and one-to-one mentoring. Book a free consultation to get started.' },
];

export default function PTE() {
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  return (
    <div className="min-h-screen bg-white">
      <PublicHeader />

      {/* Hero */}
      <section className="relative flex items-center overflow-hidden pt-[88px]">
        <div className="absolute inset-0">
          <img
            src="https://images.pexels.com/photos/4145153/pexels-photo-4145153.jpeg"
            alt="Student preparing for PTE exam"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-br from-slate-950/95 via-slate-900/90 to-sky-950/85" />
          <div className="absolute top-0 right-0 w-[40rem] h-[40rem] bg-sky-500/20 rounded-full blur-[120px]" />
          <div className="absolute bottom-0 left-0 w-[30rem] h-[30rem] bg-blue-500/15 rounded-full blur-[120px]" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 lg:py-32">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur border border-white/20 rounded-full px-4 py-1.5 mb-6">
              <Sparkles className="w-4 h-4 text-sky-300" />
              <span className="text-sky-100 text-sm font-semibold">AI-Powered PTE Academic Preparation</span>
            </div>
            <h1 className="font-playfair text-4xl sm:text-6xl lg:text-7xl font-bold text-white leading-[1.05] mb-6">
              Score higher on<br />
              <span className="bg-gradient-to-r from-sky-400 via-cyan-300 to-blue-400 bg-clip-text text-transparent">
                PTE Academic
              </span>
            </h1>
            <p className="text-lg sm:text-xl text-slate-300 leading-relaxed mb-9 max-w-2xl">
              Master all four skills with exam-accurate mock tests, instant AI scoring, and personalised study plans —
              everything you need to hit your target score, built right into your Maximus account.
            </p>
            <div className="flex flex-wrap gap-4">
              <a
                href={PTE_APP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-2 px-8 py-4 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-bold transition-all text-base shadow-xl shadow-sky-500/30"
              >
                Start Practising Free
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </a>
              <Link
                to="/book-online"
                className="flex items-center gap-2 px-8 py-4 rounded-xl border-2 border-white/25 text-white font-bold hover:border-white/50 hover:bg-white/10 transition-all text-base backdrop-blur"
              >
                Book a Free Consultation
              </Link>
            </div>

            <div className="flex flex-wrap items-center gap-x-8 gap-y-3 mt-10 text-slate-300 text-sm">
              <span className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-sky-400" /> No credit card required</span>
              <span className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-sky-400" /> Instant AI feedback</span>
              <span className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-sky-400" /> Real exam interface</span>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="bg-slate-900 border-t border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-white/10">
            {STATS.map(stat => (
              <div key={stat.label} className="py-8 px-4 text-center">
                <p className="font-playfair text-3xl sm:text-4xl font-bold text-white">
                  {stat.value}<span className="text-sky-400">{stat.suffix}</span>
                </p>
                <p className="text-slate-400 text-xs sm:text-sm mt-1 font-medium">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Intro */}
      <section className="py-20 lg:py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-14 items-center">
            <div>
              <p className="text-sky-600 font-semibold text-sm uppercase tracking-wider mb-2">Why PTE Academic</p>
              <h2 className="font-playfair text-3xl sm:text-4xl font-bold text-slate-900 mb-5 leading-tight">
                The faster, fairer path to studying and living abroad
              </h2>
              <p className="text-slate-600 leading-relaxed mb-6">
                PTE Academic is a fully computer-based English test trusted by thousands of universities and governments worldwide.
                With fast results, unbiased AI scoring and flexible test dates, it's the smart choice for students, skilled migrants
                and professionals chasing a global future.
              </p>
              <div className="space-y-4">
                {[
                  { icon: Zap, title: 'Results in as little as 48 hours', desc: 'No long waits — get your official scores fast and keep your plans moving.' },
                  { icon: ShieldCheck, title: 'Unbiased computer scoring', desc: 'Every response is marked by AI, giving every test-taker a fair, consistent result.' },
                  { icon: Globe, title: 'Accepted worldwide', desc: 'Recognised for university admission and visas across Australia, the UK, Canada, NZ and more.' },
                ].map(item => (
                  <div key={item.title} className="flex items-start gap-4">
                    <div className="w-11 h-11 rounded-xl bg-sky-50 flex items-center justify-center shrink-0">
                      <item.icon className="w-5 h-5 text-sky-600" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900">{item.title}</h3>
                      <p className="text-sm text-slate-500">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="relative">
              <img
                src="https://images.pexels.com/photos/5940841/pexels-photo-5940841.jpeg"
                alt="Confident student"
                className="rounded-3xl w-full h-[30rem] object-cover shadow-2xl"
              />
              <div className="absolute -bottom-6 -left-6 bg-white rounded-2xl shadow-xl border border-slate-100 p-5 max-w-[15rem]">
                <div className="flex items-center gap-2 mb-1">
                  <Award className="w-5 h-5 text-amber-500" />
                  <span className="font-bold text-slate-900">79+ Achievers</span>
                </div>
                <p className="text-xs text-slate-500">Join thousands who reached their target band with Maximus.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Skills */}
      <section className="py-20 lg:py-24 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <p className="text-sky-600 font-semibold text-sm uppercase tracking-wider mb-2">Full Coverage</p>
            <h2 className="font-playfair text-3xl sm:text-4xl font-bold text-slate-900 mb-4">Master Every Section of the Exam</h2>
            <p className="text-slate-500 max-w-2xl mx-auto">Targeted practice for all 20 PTE task types across the four skills — each with instant, criteria-based AI scoring.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {SKILLS.map(skill => (
              <div key={skill.title} className="group bg-white rounded-2xl border border-slate-100 p-6 hover:shadow-xl transition-all duration-300 hover:-translate-y-1.5">
                <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${skill.color} flex items-center justify-center mb-5 shadow-lg`}>
                  <skill.icon className="w-7 h-7 text-white" />
                </div>
                <h3 className="font-bold text-slate-900 text-xl mb-2">{skill.title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{skill.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 lg:py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <p className="text-sky-600 font-semibold text-sm uppercase tracking-wider mb-2">The Maximus Advantage</p>
            <h2 className="font-playfair text-3xl sm:text-4xl font-bold text-slate-900 mb-4">Everything You Need to Succeed</h2>
            <p className="text-slate-500 max-w-2xl mx-auto">A complete PTE preparation ecosystem, powered by AI and refined by expert trainers.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map(feature => (
              <div key={feature.title} className="group p-7 rounded-2xl border border-slate-100 bg-white hover:border-sky-200 hover:shadow-lg transition-all duration-300">
                <div className="w-12 h-12 rounded-xl bg-sky-50 group-hover:bg-sky-100 flex items-center justify-center mb-5 transition-colors">
                  <feature.icon className="w-6 h-6 text-sky-600" />
                </div>
                <h3 className="font-bold text-slate-900 text-lg mb-2">{feature.title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* AI Highlight Banner */}
      <section className="py-20 lg:py-24 bg-slate-900 relative overflow-hidden">
        <div className="absolute inset-0">
          <img src="https://images.pexels.com/photos/8386440/pexels-photo-8386440.jpeg" alt="AI technology" className="w-full h-full object-cover opacity-10" />
          <div className="absolute inset-0 bg-slate-900/80" />
        </div>
        <div className="absolute top-0 right-0 w-96 h-96 bg-sky-500/15 rounded-full blur-3xl" />
        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex items-center gap-2 bg-sky-500/15 border border-sky-500/30 rounded-full px-4 py-1.5 mb-6">
            <Sparkles className="w-4 h-4 text-sky-400" />
            <span className="text-sky-300 text-sm font-semibold">Instant AI Scoring</span>
          </div>
          <h2 className="font-playfair text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-5 leading-tight">
            Practise. Submit. Know your score in seconds.
          </h2>
          <p className="text-slate-300 text-lg max-w-2xl mx-auto mb-9">
            Our AI scores your Speaking, Writing, Reading and Listening exactly like the real exam — with the detailed
            feedback you need to improve on your very next attempt.
          </p>
          <a
            href={PTE_APP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-bold transition-all shadow-xl shadow-sky-500/30"
          >
            Try a Free Mock Test <ArrowRight className="w-5 h-5" />
          </a>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 lg:py-24 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <p className="text-sky-600 font-semibold text-sm uppercase tracking-wider mb-2">Your Journey</p>
            <h2 className="font-playfair text-3xl sm:text-4xl font-bold text-slate-900 mb-4">How It Works</h2>
            <p className="text-slate-500 max-w-2xl mx-auto">Four simple steps from where you are today to the score you need.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {STEPS.map((step, i) => (
              <div key={step.num} className="relative bg-white rounded-2xl border border-slate-100 p-7 hover:shadow-lg transition-all duration-300">
                <span className="font-playfair text-5xl font-bold text-sky-100">{step.num}</span>
                <h3 className="font-bold text-slate-900 text-lg mt-3 mb-2">{step.title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{step.desc}</p>
                {i < STEPS.length - 1 && (
                  <ArrowRight className="hidden lg:block absolute top-1/2 -right-3 w-6 h-6 text-slate-300" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-20 lg:py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <p className="text-sky-600 font-semibold text-sm uppercase tracking-wider mb-2">Success Stories</p>
            <h2 className="font-playfair text-3xl sm:text-4xl font-bold text-slate-900 mb-4">Real Students. Real Scores.</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {TESTIMONIALS.map(t => (
              <div key={t.name} className="bg-slate-50 rounded-2xl p-7 border border-slate-100 flex flex-col">
                <Quote className="w-9 h-9 text-sky-200 mb-4" />
                <p className="text-slate-700 leading-relaxed mb-6 flex-1">"{t.quote}"</p>
                <div className="flex items-center gap-0.5 mb-4">
                  {[1,2,3,4,5].map(i => <Star key={i} className="w-4 h-4 fill-amber-400 text-amber-400" />)}
                </div>
                <div className="flex items-center gap-3">
                  <img src={t.img} alt={t.name} className="w-12 h-12 rounded-full object-cover border-2 border-sky-100" />
                  <div>
                    <p className="font-bold text-slate-900 text-sm">{t.name}</p>
                    <p className="text-xs text-sky-600 font-semibold">{t.result}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20 lg:py-24 bg-slate-50">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <p className="text-sky-600 font-semibold text-sm uppercase tracking-wider mb-2">Questions</p>
            <h2 className="font-playfair text-3xl sm:text-4xl font-bold text-slate-900">Frequently Asked</h2>
          </div>
          <div className="space-y-3">
            {FAQS.map((faq, i) => (
              <div key={i} className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between gap-4 px-6 py-5 text-left"
                >
                  <span className="font-bold text-slate-900">{faq.q}</span>
                  <ChevronDown className={`w-5 h-5 text-sky-600 shrink-0 transition-transform ${openFaq === i ? 'rotate-180' : ''}`} />
                </button>
                {openFaq === i && (
                  <div className="px-6 pb-5 -mt-1 text-slate-600 leading-relaxed animate-fade-in">
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20 lg:py-24 bg-gradient-to-br from-sky-600 to-blue-700 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-96 h-96 bg-white/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-blue-400/20 rounded-full blur-3xl" />
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <GraduationCap className="w-14 h-14 text-white/90 mx-auto mb-6" />
          <h2 className="font-playfair text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-5 leading-tight">
            Your target PTE score is within reach
          </h2>
          <p className="text-sky-100 text-lg mb-9 max-w-2xl mx-auto">
            Start practising today with AI-scored mock tests, or talk to our expert trainers about a plan built around your goals.
          </p>
          <div className="flex flex-wrap gap-4 justify-center">
            <a
              href={PTE_APP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-8 py-4 rounded-xl bg-white text-sky-700 font-bold hover:bg-sky-50 transition-colors shadow-xl"
            >
              Start Practising Free <ArrowRight className="w-5 h-5" />
            </a>
            <Link
              to="/register"
              className="flex items-center gap-2 px-8 py-4 rounded-xl border-2 border-white/40 text-white font-bold hover:border-white/70 hover:bg-white/10 transition-colors"
            >
              Enrol With Maximus
            </Link>
          </div>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
