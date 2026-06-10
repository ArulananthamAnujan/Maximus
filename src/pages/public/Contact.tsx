import { useState, useEffect } from 'react';
import { MapPin, Phone, Mail, Clock, Send, CheckCircle, ChevronDown, ChevronUp } from 'lucide-react';
import PublicHeader from '../../components/layout/PublicHeader';
import PublicFooter from '../../components/layout/PublicFooter';
import { supabase } from '../../lib/supabase';

interface FAQ {
  id: string;
  question: string;
  answer: string;
  sort_order: number;
}

const CONTACT_INFO = [
  {
    icon: MapPin,
    title: 'Our Office',
    lines: ['Building 33, Level 4, Suite 4A', 'Shah Makhdum Avenue, Sector-12', 'Uttara, Dhaka, Bangladesh, 1230'],
  },
  {
    icon: Phone,
    title: 'Phone',
    lines: ['+88 01321-203140'],
    href: 'tel:+8801321203140',
  },
  {
    icon: Mail,
    title: 'Email',
    lines: ['inquiries@maximusacademy.com.au'],
    href: 'mailto:inquiries@maximusacademy.com.au',
  },
  {
    icon: Clock,
    title: 'Office Hours',
    lines: ['Sun–Thu: 9:00am – 6:00pm BST', 'Fri–Sat: 10:00am – 2:00pm BST'],
  },
];

export default function Contact() {
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '' });
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState('');
  const [lastSubmit, setLastSubmit] = useState(0);
  const [faqs, setFaqs] = useState<FAQ[]>([]);
  const [openFaq, setOpenFaq] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from('faqs')
      .select('id, question, answer, sort_order')
      .eq('is_active', true)
      .order('sort_order')
      .then(({ data }) => { if (data) setFaqs(data); });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    // Basic validation
    if (!form.name.trim() || form.name.trim().length < 2) {
      setFormError('Please enter your full name (at least 2 characters).'); return;
    }
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRe.test(form.email.trim())) {
      setFormError('Please enter a valid email address.'); return;
    }
    if (!form.subject) { setFormError('Please select a subject.'); return; }
    if (!form.message.trim() || form.message.trim().length < 10) {
      setFormError('Please enter a message (at least 10 characters).'); return;
    }
    if (form.message.trim().length > 5000) {
      setFormError('Message is too long (max 5000 characters).'); return;
    }

    // Client-side rate limit: 60s between submissions
    const now = Date.now();
    if (now - lastSubmit < 60_000) {
      setFormError('Please wait a moment before sending another message.'); return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.from('contact_messages').insert({
        name: form.name.trim().slice(0, 200),
        email: form.email.trim().slice(0, 200),
        subject: form.subject.slice(0, 200),
        message: form.message.trim().slice(0, 5000),
        status: 'open',
      });
      if (error) throw error;
      setLastSubmit(Date.now());
      setSent(true);
    } catch {
      setFormError('Failed to send your message. Please try again or email us directly.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white min-h-screen">
      <PublicHeader />
      <div className="pt-20 lg:pt-24">

        {/* Hero */}
        <section className="bg-slate-900 py-20 relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(14,165,233,0.1),transparent_60%)]" />
          <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <p className="text-sky-400 font-semibold text-sm uppercase tracking-wider mb-2">We're Here to Help</p>
            <h1 className="font-playfair text-5xl font-bold text-white mb-6">Get in Touch</h1>
            <p className="text-slate-300 text-xl leading-relaxed">
              Have a question? We'd love to hear from you. We'll respond within 24–48 hours.
            </p>
          </div>
        </section>

        {/* Contact Section */}
        <section className="py-20 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid lg:grid-cols-3 gap-10">

              {/* Info Sidebar */}
              <div className="lg:col-span-1 space-y-6">
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
                  <h2 className="font-playfair text-xl font-bold text-slate-900 mb-6">Contact Information</h2>
                  <div className="space-y-6">
                    {CONTACT_INFO.map(item => (
                      <div key={item.title} className="flex items-start gap-4">
                        <div className="w-10 h-10 bg-sky-50 rounded-xl flex items-center justify-center shrink-0">
                          <item.icon className="w-5 h-5 text-sky-600" />
                        </div>
                        <div>
                          <p className="font-semibold text-slate-900 text-sm mb-1">{item.title}</p>
                          {item.href ? (
                            <a href={item.href} className="text-sky-600 hover:text-sky-700 text-sm transition-colors">
                              {item.lines[0]}
                            </a>
                          ) : (
                            item.lines.map((line, i) => (
                              <p key={i} className="text-slate-500 text-sm leading-relaxed">{line}</p>
                            ))
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl overflow-hidden border border-slate-100 shadow-sm">
                  <iframe
                    title="Maximus Academy location"
                    src="https://maps.google.com/maps?q=Uttara+Dhaka+Bangladesh&t=&z=13&ie=UTF8&iwloc=&output=embed"
                    className="w-full h-48 border-0"
                    allowFullScreen
                    loading="lazy"
                  />
                </div>
              </div>

              {/* Contact Form */}
              <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-sm p-8">
                {sent ? (
                  <div className="text-center py-12">
                    <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-6">
                      <CheckCircle className="w-10 h-10 text-emerald-600" />
                    </div>
                    <h2 className="font-playfair text-2xl font-bold text-slate-900 mb-3">Message Sent!</h2>
                    <p className="text-slate-500 mb-6 max-w-md mx-auto">
                      Thank you for reaching out. Our team will get back to you within 24–48 hours at{' '}
                      <span className="font-medium text-slate-700">{form.email}</span>.
                    </p>
                    <button
                      onClick={() => { setSent(false); setForm({ name: '', email: '', subject: '', message: '' }); }}
                      className="px-6 py-3 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl transition-colors"
                    >
                      Send Another Message
                    </button>
                  </div>
                ) : (
                  <>
                    <h2 className="font-playfair text-2xl font-bold text-slate-900 mb-2">Send Us a Message</h2>
                    <p className="text-slate-500 text-sm mb-6">We typically respond within 24–48 hours on business days.</p>
                    <form onSubmit={handleSubmit} className="space-y-5">
                      <div className="grid md:grid-cols-2 gap-5">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1.5">Your Name</label>
                          <input
                            type="text"
                            value={form.name}
                            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                            className="input-field"
                            placeholder="Jane Smith"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1.5">Email Address</label>
                          <input
                            type="email"
                            value={form.email}
                            onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                            className="input-field"
                            placeholder="you@example.com"
                            required
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">Subject</label>
                        <select
                          value={form.subject}
                          onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
                          className="input-field"
                          required
                        >
                          <option value="">Select a subject</option>
                          <option>Course enquiry</option>
                          <option>Technical support</option>
                          <option>Billing & payments</option>
                          <option>Corporate training</option>
                          <option>Refund request</option>
                          <option>General enquiry</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">Message</label>
                        <textarea
                          value={form.message}
                          onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                          className="input-field resize-none"
                          rows={6}
                          placeholder="How can we help you?"
                          required
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={loading}
                        className="px-6 py-3 bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white font-bold rounded-xl transition-colors flex items-center gap-2"
                      >
                        <Send className="w-4 h-4" />
                        {loading ? 'Sending...' : 'Send Message'}
                      </button>
                      {formError && (
                        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">{formError}</p>
                      )}
                    </form>
                  </>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* FAQ Section */}
        {faqs.length > 0 && (
          <section className="py-20 bg-slate-50">
            <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="text-center mb-12">
                <p className="text-sky-600 font-semibold text-sm uppercase tracking-wider mb-2">Common Questions</p>
                <h2 className="font-playfair text-4xl font-bold text-slate-900 mb-4">Frequently Asked Questions</h2>
                <p className="text-slate-500">Everything you need to know about learning at Maximus Academy.</p>
              </div>
              <div className="space-y-3">
                {faqs.map(faq => (
                  <div
                    key={faq.id}
                    className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden"
                  >
                    <button
                      onClick={() => setOpenFaq(openFaq === faq.id ? null : faq.id)}
                      className="w-full flex items-center justify-between gap-4 px-6 py-5 text-left hover:bg-slate-50 transition-colors"
                    >
                      <span className="font-semibold text-slate-900 leading-snug">{faq.question}</span>
                      {openFaq === faq.id
                        ? <ChevronUp className="w-5 h-5 text-sky-600 shrink-0" />
                        : <ChevronDown className="w-5 h-5 text-slate-400 shrink-0" />
                      }
                    </button>
                    {openFaq === faq.id && (
                      <div className="px-6 pb-5 border-t border-slate-100">
                        <p className="text-slate-600 leading-relaxed pt-4">{faq.answer}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <p className="text-center text-slate-500 text-sm mt-8">
                Still have questions?{' '}
                <a href="mailto:inquiries@maximusacademy.com.au" className="text-sky-600 font-semibold hover:text-sky-700 transition-colors">
                  Email us directly
                </a>
              </p>
            </div>
          </section>
        )}

      </div>
      <PublicFooter />
    </div>
  );
}
