import { useState } from 'react';
import { MapPin, Phone, Mail, Clock, Send, CheckCircle } from 'lucide-react';
import PublicHeader from '../../components/layout/PublicHeader';
import PublicFooter from '../../components/layout/PublicFooter';

export default function Contact() {
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '' });
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    await new Promise(r => setTimeout(r, 1500));
    setSent(true);
    setLoading(false);
  };

  return (
    <div className="bg-white min-h-screen">
      <PublicHeader />
      <div className="pt-16 lg:pt-20">
        <section className="bg-slate-900 py-20 relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(14,165,233,0.1),transparent_60%)]" />
          <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <p className="text-sky-400 font-semibold text-sm uppercase tracking-wider mb-2">We're Here to Help</p>
            <h1 className="font-playfair text-5xl font-bold text-white mb-6">Get in Touch</h1>
            <p className="text-slate-300 text-xl">Have a question? We'd love to hear from you. Our team is here to help.</p>
          </div>
        </section>

        <section className="py-20 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid lg:grid-cols-3 gap-10">
              <div className="lg:col-span-1 space-y-6">
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
                  <h2 className="font-playfair text-xl font-bold text-slate-900 mb-6">Contact Information</h2>
                  <div className="space-y-5">
                    {[
                      { icon: MapPin, title: 'Office', detail: 'Building 33, Level 4, Suite 4A\nShah Makhdum Avenue, Sector-12\nUttara, Dhaka, Bangladesh, 1230' },
                      { icon: Phone, title: 'Phone', detail: '+88 01321-203140' },
                      { icon: Mail, title: 'Email', detail: 'info@maximusacademy.edu' },
                      { icon: Clock, title: 'Hours', detail: 'Sunday–Thursday: 9am–6pm BST\nFriday–Saturday: 10am–2pm BST' },
                    ].map(item => (
                      <div key={item.title} className="flex items-start gap-4">
                        <div className="w-10 h-10 bg-sky-50 rounded-xl flex items-center justify-center shrink-0">
                          <item.icon className="w-5 h-5 text-sky-600" />
                        </div>
                        <div>
                          <p className="font-medium text-slate-900 text-sm mb-1">{item.title}</p>
                          <p className="text-slate-500 text-sm whitespace-pre-line">{item.detail}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
                  <h3 className="font-semibold text-slate-900 mb-3">Common Questions</h3>
                  {['How do I enrol in a course?', 'What payment methods do you accept?', 'Can I get a refund?', 'How do I access my certificate?'].map(q => (
                    <button key={q} className="block w-full text-left text-sm text-sky-600 hover:text-sky-700 py-2 border-b border-slate-100 last:border-0 transition-colors">
                      {q}
                    </button>
                  ))}
                </div>
              </div>

              <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-sm p-8">
                {sent ? (
                  <div className="text-center py-12">
                    <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-6">
                      <CheckCircle className="w-10 h-10 text-emerald-600" />
                    </div>
                    <h2 className="font-playfair text-2xl font-bold text-slate-900 mb-3">Message Sent!</h2>
                    <p className="text-slate-500 mb-6">Thank you for reaching out. We'll get back to you within 1–2 business days.</p>
                    <button onClick={() => { setSent(false); setForm({ name: '', email: '', subject: '', message: '' }); }} className="px-6 py-3 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl transition-colors">Send Another Message</button>
                  </div>
                ) : (
                  <>
                    <h2 className="font-playfair text-2xl font-bold text-slate-900 mb-6">Send Us a Message</h2>
                    <form onSubmit={handleSubmit} className="space-y-5">
                      <div className="grid md:grid-cols-2 gap-5">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1.5">Your Name</label>
                          <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="input-field" placeholder="Jane Smith" required />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1.5">Email Address</label>
                          <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="input-field" placeholder="you@example.com" required />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">Subject</label>
                        <select value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} className="input-field" required>
                          <option value="">Select a subject</option>
                          <option>Course enquiry</option>
                          <option>Technical support</option>
                          <option>Billing & payments</option>
                          <option>Corporate training</option>
                          <option>General enquiry</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">Message</label>
                        <textarea value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} className="input-field resize-none" rows={6} placeholder="How can we help you?" required />
                      </div>
                      <button type="submit" disabled={loading} className="px-6 py-3 bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white font-bold rounded-xl transition-colors flex items-center gap-2">
                        <Send className="w-4 h-4" />
                        {loading ? 'Sending...' : 'Send Message'}
                      </button>
                    </form>
                  </>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
      <PublicFooter />
    </div>
  );
}
