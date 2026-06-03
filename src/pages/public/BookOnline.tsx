import { useState } from 'react';
import { Calendar, Clock, Video, Users, CheckCircle, ArrowRight } from 'lucide-react';
import PublicHeader from '../../components/layout/PublicHeader';
import PublicFooter from '../../components/layout/PublicFooter';
import { useAuth } from '../../contexts/AuthContext';

const BOOKING_TYPES = [
  { id: 'consultation', title: 'Career Consultation', duration: '30 min', icon: Video, description: 'Discuss your learning goals with an education advisor', price: 'Free' },
  { id: 'demo', title: 'Platform Demo', duration: '45 min', icon: Users, description: 'Get a personalised tour of our learning platform', price: 'Free' },
  { id: 'coaching', title: 'Career Coaching Session', duration: '60 min', icon: Calendar, description: 'One-on-one session with an industry expert', price: 'A$150' },
];

const TIMES = ['9:00 AM', '10:00 AM', '11:00 AM', '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM'];

export default function BookOnline() {
  const [step, setStep] = useState(1);
  const [selected, setSelected] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [form, setForm] = useState({ name: '', email: '', phone: '', notes: '' });
  const [booked, setBooked] = useState(false);
  const [loading, setLoading] = useState(false);
  const { profile } = useAuth();

  const today = new Date().toISOString().split('T')[0];

  const handleBook = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    await new Promise(r => setTimeout(r, 1500));
    setBooked(true);
    setLoading(false);
  };

  if (booked) {
    return (
      <div className="bg-white min-h-screen">
        <PublicHeader />
        <div className="pt-24 flex items-center justify-center min-h-screen">
          <div className="text-center max-w-md px-4">
            <div className="w-24 h-24 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="w-12 h-12 text-emerald-600" />
            </div>
            <h1 className="font-playfair text-3xl font-bold text-slate-900 mb-3">Booking Confirmed!</h1>
            <p className="text-slate-500 mb-2">{BOOKING_TYPES.find(t => t.id === selected)?.title}</p>
            <p className="text-slate-500 mb-8">{date} at {time}</p>
            <p className="text-sm text-slate-400 mb-8">A confirmation has been sent to {form.email}. We'll send you a calendar invite and meeting link shortly.</p>
            <button onClick={() => { setBooked(false); setStep(1); setSelected(''); setDate(''); setTime(''); }} className="px-6 py-3 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl transition-colors">Book Another Session</button>
          </div>
        </div>
        <PublicFooter />
      </div>
    );
  }

  return (
    <div className="bg-white min-h-screen">
      <PublicHeader />
      <div className="pt-20 lg:pt-24">
        <section className="bg-slate-900 py-16 relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,rgba(14,165,233,0.1),transparent_60%)]" />
          <div className="relative max-w-4xl mx-auto px-4 text-center">
            <p className="text-sky-400 font-semibold text-sm uppercase tracking-wider mb-2">Schedule a Session</p>
            <h1 className="font-playfair text-5xl font-bold text-white mb-4">Book Online</h1>
            <p className="text-slate-300 text-lg">Schedule a session with our education team to plan your learning journey.</p>
          </div>
        </section>

        <section className="py-16 bg-white">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-center gap-4 mb-10">
              {[1, 2, 3].map(s => (
                <div key={s} className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${step >= s ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-400'}`}>{s}</div>
                  <span className={`text-sm hidden sm:block font-medium ${step >= s ? 'text-slate-900' : 'text-slate-400'}`}>{['Session Type', 'Date & Time', 'Your Details'][s - 1]}</span>
                  {s < 3 && <ArrowRight className="w-4 h-4 text-slate-300 ml-2" />}
                </div>
              ))}
            </div>

            {step === 1 && (
              <div className="space-y-4">
                <h2 className="font-playfair text-2xl font-bold text-slate-900 mb-6">Choose Session Type</h2>
                {BOOKING_TYPES.map(type => (
                  <button
                    key={type.id}
                    onClick={() => { setSelected(type.id); setStep(2); }}
                    className={`w-full bg-white rounded-2xl border p-6 text-left hover:shadow-lg transition-all flex items-start gap-5 ${selected === type.id ? 'border-2 border-sky-500' : 'border-slate-100 hover:border-sky-200'}`}
                  >
                    <div className="w-12 h-12 bg-sky-50 rounded-xl flex items-center justify-center shrink-0">
                      <type.icon className="w-6 h-6 text-sky-600" />
                    </div>
                    <div className="flex-1">
                      <div className="flex justify-between items-start">
                        <h3 className="font-bold text-slate-900">{type.title}</h3>
                        <span className="text-sky-600 font-semibold">{type.price}</span>
                      </div>
                      <p className="text-slate-500 text-sm mt-1">{type.description}</p>
                      <div className="flex items-center gap-1 mt-2 text-xs text-slate-400">
                        <Clock className="w-3.5 h-3.5" /> {type.duration}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {step === 2 && (
              <div>
                <h2 className="font-playfair text-2xl font-bold text-slate-900 mb-6">Select Date & Time</h2>
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Preferred Date</label>
                    <input type="date" value={date} onChange={e => setDate(e.target.value)} min={today} className="input-field max-w-xs" required />
                  </div>
                  {date && (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-3">Available Times (AEST)</label>
                      <div className="grid grid-cols-4 gap-2">
                        {TIMES.map(t => (
                          <button key={t} onClick={() => setTime(t)} className={`py-2.5 rounded-lg text-sm font-medium border transition-colors ${time === t ? 'bg-sky-600 text-white border-sky-600' : 'border-slate-200 text-slate-700 hover:border-sky-400 hover:text-sky-600'}`}>
                            {t}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="flex gap-3">
                    <button onClick={() => setStep(1)} className="px-6 py-2.5 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">Back</button>
                    <button onClick={() => setStep(3)} disabled={!date || !time} className="px-6 py-2.5 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-lg transition-colors">Continue</button>
                  </div>
                </div>
              </div>
            )}

            {step === 3 && (
              <div>
                <h2 className="font-playfair text-2xl font-bold text-slate-900 mb-6">Your Details</h2>
                <form onSubmit={handleBook} className="space-y-5">
                  <div className="bg-slate-50 rounded-xl p-4 mb-6">
                    <p className="text-sm text-slate-500">Booking Summary</p>
                    <p className="font-semibold text-slate-900">{BOOKING_TYPES.find(t => t.id === selected)?.title}</p>
                    <p className="text-sm text-slate-500">{date} at {time} AEST</p>
                  </div>
                  <div className="grid md:grid-cols-2 gap-5">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Full Name</label>
                      <input type="text" value={form.name || profile?.full_name || ''} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="input-field" placeholder="Jane Smith" required />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Email Address</label>
                      <input type="email" value={form.email || profile?.email || ''} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="input-field" placeholder="you@example.com" required />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Phone (optional)</label>
                    <input type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className="input-field" placeholder="+61 4xx xxx xxx" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Additional Notes (optional)</label>
                    <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="input-field resize-none" rows={3} placeholder="Any specific topics you'd like to discuss?" />
                  </div>
                  <div className="flex gap-3">
                    <button type="button" onClick={() => setStep(2)} className="px-6 py-2.5 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">Back</button>
                    <button type="submit" disabled={loading} className="px-6 py-2.5 bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white font-bold rounded-lg transition-colors">
                      {loading ? 'Confirming...' : 'Confirm Booking'}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </section>
      </div>
      <PublicFooter />
    </div>
  );
}
