import { useState, useEffect } from 'react';
import {
  DollarSign, TrendingUp, Clock, CheckCircle2, Sparkles, ChevronRight,
  Check, CreditCard, Building2, AlertCircle, Star, Crown, Zap, Info,
} from 'lucide-react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { teacherNavItems } from './teacherNav';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'sonner';

interface EarningsSummary {
  total_gross_cents: number;
  total_earned_cents: number;
  available_cents: number;
  paid_out_cents: number;
  total_sales: number;
  this_month_cents: number;
}

interface EarningsRow {
  id: string;
  gross_amount_cents: number;
  teacher_share_cents: number;
  platform_share_cents: number;
  status: string;
  created_at: string;
  course: { title: string } | null;
}

interface PayoutRow {
  id: string;
  amount_cents: number;
  status: string;
  payout_method: string;
  requested_at: string;
  processed_at: string | null;
}

interface TeacherAIPlan {
  id: string;
  name: string;
  description: string;
  token_amount: number;
  price_cents: number;
  is_popular: boolean;
  features: string[];
}

interface TeacherCredits {
  token_balance: number;
  total_purchased: number;
  total_used: number;
}

type PayoutMethod = 'bank' | 'paypal';

const fmt = (cents: number) => `A$${(cents / 100).toFixed(2)}`;
const PLAN_ICONS = [Zap, Star, Crown];

export default function TeacherEarnings() {
  const { profile } = useAuth();
  const [summary, setSummary] = useState<EarningsSummary | null>(null);
  const [earnings, setEarnings] = useState<EarningsRow[]>([]);
  const [payouts, setPayouts] = useState<PayoutRow[]>([]);
  const [aiPlans, setAiPlans] = useState<TeacherAIPlan[]>([]);
  const [aiCredits, setAiCredits] = useState<TeacherCredits | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'earnings' | 'payouts' | 'ai'>('earnings');
  const [showPayoutForm, setShowPayoutForm] = useState(false);
  const [payoutMethod, setPayoutMethod] = useState<PayoutMethod>('bank');
  const [payoutForm, setPayoutForm] = useState({
    bank_name: '', account_name: '', account_number: '', bsb: '', paypal_email: '',
  });
  const [payoutAmount, setPayoutAmount] = useState('');
  const [submittingPayout, setSubmittingPayout] = useState(false);
  const [purchasingPlan, setPurchasingPlan] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    const load = async () => {
      const [summaryRes, earningsRes, payoutsRes, plansRes, creditsRes] = await Promise.all([
        supabase.rpc('get_teacher_earnings_summary', { p_teacher_id: profile.id }),
        supabase.from('teacher_earnings')
          .select('id, gross_amount_cents, teacher_share_cents, platform_share_cents, status, created_at, course:courses(title)')
          .eq('teacher_id', profile.id)
          .order('created_at', { ascending: false })
          .limit(20),
        supabase.from('teacher_payouts')
          .select('id, amount_cents, status, payout_method, requested_at, processed_at')
          .eq('teacher_id', profile.id)
          .order('requested_at', { ascending: false }),
        supabase.from('teacher_ai_plans').select('*').order('sort_order'),
        supabase.from('teacher_ai_credits').select('*').eq('user_id', profile.id).maybeSingle(),
      ]);

      if (summaryRes.data) setSummary(summaryRes.data as EarningsSummary);
      if (earningsRes.data) setEarnings(earningsRes.data as EarningsRow[]);
      if (payoutsRes.data) setPayouts(payoutsRes.data as PayoutRow[]);
      if (plansRes.data) setAiPlans(plansRes.data.map(p => ({ ...p, features: Array.isArray(p.features) ? p.features : JSON.parse(p.features as unknown as string) })));
      if (creditsRes.data) setAiCredits(creditsRes.data);
      setLoading(false);
    };
    load();
  }, [profile]);

  const handlePayoutRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !summary) return;
    const amountCents = Math.round(parseFloat(payoutAmount) * 100);
    if (isNaN(amountCents) || amountCents < 1000) {
      toast.error('Minimum payout is A$10.00'); return;
    }
    if (amountCents > summary.available_cents) {
      toast.error('Amount exceeds your available balance'); return;
    }
    setSubmittingPayout(true);
    const payload: Record<string, unknown> = {
      teacher_id: profile.id,
      amount_cents: amountCents,
      payout_method: payoutMethod,
    };
    if (payoutMethod === 'bank') {
      Object.assign(payload, { bank_name: payoutForm.bank_name, account_name: payoutForm.account_name, account_number: payoutForm.account_number, bsb: payoutForm.bsb });
    } else {
      Object.assign(payload, { paypal_email: payoutForm.paypal_email });
    }
    const { error } = await supabase.from('teacher_payouts').insert(payload);
    if (error) {
      toast.error('Payout request failed. Please try again.');
    } else {
      toast.success('Payout request submitted! We process payouts within 3–5 business days.');
      setShowPayoutForm(false);
      setPayoutAmount('');
      // Refresh
      const { data } = await supabase.from('teacher_payouts').select('id, amount_cents, status, payout_method, requested_at, processed_at').eq('teacher_id', profile.id).order('requested_at', { ascending: false });
      if (data) setPayouts(data as PayoutRow[]);
    }
    setSubmittingPayout(false);
  };

  const handlePurchaseAI = async (plan: TeacherAIPlan) => {
    if (!profile) return;
    setPurchasingPlan(plan.id);
    const { error } = await supabase.rpc('add_teacher_tokens', { p_user_id: profile.id, p_tokens: plan.token_amount });
    if (error) {
      toast.error('Purchase failed. Please try again.');
    } else {
      toast.success(`${plan.token_amount} AI tokens added to your account!`);
      const { data } = await supabase.from('teacher_ai_credits').select('*').eq('user_id', profile.id).maybeSingle();
      if (data) setAiCredits(data);
    }
    setPurchasingPlan(null);
  };

  const statusBadge = (s: string) => {
    const map: Record<string, string> = {
      available: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
      pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
      paid_out: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400',
      refunded: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
      requested: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
      processing: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400',
      completed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
      rejected: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    };
    return `inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${map[s] ?? 'bg-gray-100 text-gray-600'}`;
  };

  return (
    <DashboardLayout navItems={teacherNavItems} title="Earnings & AI Tools" subtitle="Track your revenue and manage AI credits">
      <div className="space-y-6">

        {/* Revenue split banner */}
        <div className="rounded-xl bg-gradient-to-r from-navy-900 to-navy-800 p-4 flex items-center gap-4 text-white">
          <div className="w-10 h-10 rounded-xl bg-gold-500/20 border border-gold-500/30 flex items-center justify-center shrink-0">
            <Info className="w-5 h-5 text-gold-400" />
          </div>
          <div>
            <p className="font-semibold text-sm">Revenue Split: <span className="text-gold-400">70% You / 30% Platform</span></p>
            <p className="text-white/60 text-xs mt-0.5">Industry-leading split. You earn 70% of every course sale after Stripe payment processing (~2.9% + A$0.30).</p>
          </div>
        </div>

        {/* Summary stats */}
        {loading ? (
          <div className="grid sm:grid-cols-4 gap-4">
            {[1,2,3,4].map(i => <div key={i} className="card h-24 animate-pulse" />)}
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="card p-5">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center">
                  <DollarSign className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                </div>
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Available to Withdraw</span>
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{fmt(summary?.available_cents ?? 0)}</p>
            </div>
            <div className="card p-5">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-9 h-9 rounded-xl bg-sky-50 dark:bg-sky-900/20 flex items-center justify-center">
                  <TrendingUp className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                </div>
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">This Month</span>
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{fmt(summary?.this_month_cents ?? 0)}</p>
            </div>
            <div className="card p-5">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-9 h-9 rounded-xl bg-gold-50 dark:bg-gold-900/20 flex items-center justify-center">
                  <CheckCircle2 className="w-4 h-4 text-gold-600 dark:text-gold-400" />
                </div>
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Total Earned</span>
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{fmt(summary?.total_earned_cents ?? 0)}</p>
            </div>
            <div className="card p-5">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-9 h-9 rounded-xl bg-gray-50 dark:bg-navy-700 flex items-center justify-center">
                  <Clock className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                </div>
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Total Sales</span>
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{summary?.total_sales ?? 0}</p>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-gray-100 dark:bg-navy-800 rounded-xl w-fit">
          {(['earnings', 'payouts', 'ai'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all capitalize ${tab === t ? 'bg-white dark:bg-navy-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}>
              {t === 'ai' ? 'AI Tools' : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {/* Earnings tab */}
        {tab === 'earnings' && (
          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 dark:border-navy-700 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900 dark:text-white">Sales History</h3>
              <span className="text-xs text-gray-400">70% of net goes to you</span>
            </div>
            {earnings.length === 0 ? (
              <div className="py-16 text-center">
                <DollarSign className="w-10 h-10 text-gray-200 dark:text-navy-600 mx-auto mb-3" />
                <p className="text-gray-500 dark:text-gray-400 font-medium">No sales yet</p>
                <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">When students purchase your courses, earnings will appear here.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-navy-900/50">
                    <tr>
                      {['Course', 'Date', 'Sale Price', 'Your Share (70%)', 'Status'].map(h => (
                        <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-navy-700">
                    {earnings.map(e => (
                      <tr key={e.id} className="hover:bg-gray-50 dark:hover:bg-navy-700/30">
                        <td className="px-5 py-3 font-medium text-gray-900 dark:text-white">{e.course?.title ?? '—'}</td>
                        <td className="px-5 py-3 text-gray-500 dark:text-gray-400">{new Date(e.created_at).toLocaleDateString('en-AU')}</td>
                        <td className="px-5 py-3 text-gray-900 dark:text-white">{fmt(e.gross_amount_cents)}</td>
                        <td className="px-5 py-3 font-semibold text-emerald-600 dark:text-emerald-400">{fmt(e.teacher_share_cents)}</td>
                        <td className="px-5 py-3"><span className={statusBadge(e.status)}>{e.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Payouts tab */}
        {tab === 'payouts' && (
          <div className="space-y-4">
            <div className="card p-5 flex items-center justify-between gap-4">
              <div>
                <p className="font-semibold text-gray-900 dark:text-white">Available Balance</p>
                <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">{fmt(summary?.available_cents ?? 0)}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Minimum withdrawal: A$10.00 · Processed in 3–5 business days</p>
              </div>
              <button
                onClick={() => setShowPayoutForm(true)}
                disabled={(summary?.available_cents ?? 0) < 1000}
                className="btn-primary text-sm shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Request Payout
              </button>
            </div>

            {showPayoutForm && (
              <div className="card p-6">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Request Payout</h3>
                <form onSubmit={handlePayoutRequest} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Amount (AUD)</label>
                    <input
                      type="number" step="0.01" min="10" max={(( summary?.available_cents ?? 0) / 100).toString()}
                      value={payoutAmount} onChange={e => setPayoutAmount(e.target.value)}
                      className="input-field" placeholder="0.00" required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Payout Method</label>
                    <div className="grid grid-cols-2 gap-3">
                      {(['bank', 'paypal'] as PayoutMethod[]).map(m => (
                        <button key={m} type="button" onClick={() => setPayoutMethod(m)}
                          className={`flex items-center gap-2 p-3 rounded-xl border-2 transition-all ${payoutMethod === m ? 'border-navy-600 bg-navy-50 dark:bg-navy-600/20' : 'border-gray-200 dark:border-navy-600'}`}>
                          {m === 'bank' ? <Building2 className="w-4 h-4 text-navy-600 dark:text-navy-400" /> : <CreditCard className="w-4 h-4 text-navy-600 dark:text-navy-400" />}
                          <span className="text-sm font-medium capitalize text-gray-700 dark:text-gray-300">{m === 'bank' ? 'Bank Transfer' : 'PayPal'}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  {payoutMethod === 'bank' ? (
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Bank Name</label>
                        <input type="text" value={payoutForm.bank_name} onChange={e => setPayoutForm(p => ({ ...p, bank_name: e.target.value }))} className="input-field" placeholder="e.g. Commonwealth Bank" required />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Account Name</label>
                        <input type="text" value={payoutForm.account_name} onChange={e => setPayoutForm(p => ({ ...p, account_name: e.target.value }))} className="input-field" placeholder="As on bank account" required />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">BSB</label>
                        <input type="text" value={payoutForm.bsb} onChange={e => setPayoutForm(p => ({ ...p, bsb: e.target.value }))} className="input-field" placeholder="000-000" required />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Account Number</label>
                        <input type="text" value={payoutForm.account_number} onChange={e => setPayoutForm(p => ({ ...p, account_number: e.target.value }))} className="input-field" placeholder="Account number" required />
                      </div>
                    </div>
                  ) : (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">PayPal Email</label>
                      <input type="email" value={payoutForm.paypal_email} onChange={e => setPayoutForm(p => ({ ...p, paypal_email: e.target.value }))} className="input-field" placeholder="your@paypal.com" required />
                    </div>
                  )}
                  <div className="flex gap-3 pt-2">
                    <button type="button" onClick={() => setShowPayoutForm(false)} className="btn-outline text-sm">Cancel</button>
                    <button type="submit" disabled={submittingPayout} className="btn-primary text-sm disabled:opacity-60">
                      {submittingPayout ? 'Submitting...' : 'Submit Request'}
                    </button>
                  </div>
                </form>
              </div>
            )}

            <div className="card overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 dark:border-navy-700">
                <h3 className="font-semibold text-gray-900 dark:text-white">Payout History</h3>
              </div>
              {payouts.length === 0 ? (
                <div className="py-12 text-center">
                  <Clock className="w-8 h-8 text-gray-200 dark:text-navy-600 mx-auto mb-2" />
                  <p className="text-gray-400 text-sm">No payout requests yet</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-navy-700">
                  {payouts.map(p => (
                    <div key={p.id} className="px-5 py-4 flex items-center justify-between gap-4">
                      <div>
                        <p className="font-semibold text-gray-900 dark:text-white">{fmt(p.amount_cents)}</p>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{p.payout_method === 'bank' ? 'Bank Transfer' : 'PayPal'} · {new Date(p.requested_at).toLocaleDateString('en-AU')}</p>
                      </div>
                      <span className={statusBadge(p.status)}>{p.status}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="card p-4 flex items-start gap-3 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800">
              <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 dark:text-amber-300">
                Payout requests are reviewed manually and processed within 3–5 business days. Minimum payout is A$10.00. Make sure your payment details are accurate — incorrect details may delay your payout.
              </p>
            </div>
          </div>
        )}

        {/* AI Tools tab */}
        {tab === 'ai' && (
          <div className="space-y-6">
            <div className="rounded-2xl bg-gradient-to-br from-navy-900 to-navy-800 p-6 text-white relative overflow-hidden">
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(212,175,55,0.15),transparent_60%)]" />
              <div className="relative flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-gold-500/20 border border-gold-500/30 flex items-center justify-center">
                  <Sparkles className="w-7 h-7 text-gold-400" />
                </div>
                <div>
                  <p className="text-white/60 text-sm font-medium">Your AI Token Balance</p>
                  <p className="text-4xl font-bold text-white">
                    {aiCredits?.token_balance ?? 0}
                    <span className="text-lg font-normal text-white/50 ml-2">tokens</span>
                  </p>
                  {aiCredits && aiCredits.total_purchased > 0 && (
                    <p className="text-white/40 text-xs mt-1">{aiCredits.total_used} used of {aiCredits.total_purchased} purchased</p>
                  )}
                </div>
              </div>
            </div>

            <div>
              <h3 className="font-bold text-gray-900 dark:text-white mb-1">AI Token Packs for Teachers</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">Use AI to build courses faster — generate outlines, write lessons, create quizzes, exams, and presentations. Tokens never expire.</p>
              <div className="grid sm:grid-cols-3 gap-5">
                {aiPlans.map((plan, idx) => {
                  const PlanIcon = PLAN_ICONS[idx] ?? Sparkles;
                  const iconColors = ['text-sky-500', 'text-gold-500', 'text-emerald-500'];
                  const bgColors = ['bg-sky-50 dark:bg-sky-900/20', 'bg-gold-50 dark:bg-gold-900/20', 'bg-emerald-50 dark:bg-emerald-900/20'];
                  return (
                    <div key={plan.id} className={`card relative flex flex-col ${plan.is_popular ? 'ring-2 ring-gold-500 shadow-xl' : ''}`}>
                      {plan.is_popular && (
                        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                          <span className="bg-gold-500 text-white text-xs font-bold px-3 py-1 rounded-full shadow-sm whitespace-nowrap">Most Popular</span>
                        </div>
                      )}
                      <div className="p-6 flex-1">
                        <div className={`w-11 h-11 rounded-xl ${bgColors[idx]} flex items-center justify-center mb-4`}>
                          <PlanIcon className={`w-5 h-5 ${iconColors[idx]}`} />
                        </div>
                        <h4 className="text-lg font-bold text-gray-900 dark:text-white">{plan.name}</h4>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 mb-4 leading-relaxed">{plan.description}</p>
                        <div className="mb-5">
                          <span className="text-3xl font-bold text-gray-900 dark:text-white">A${(plan.price_cents / 100).toFixed(2)}</span>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xl font-bold text-gold-600 dark:text-gold-400">{plan.token_amount}</span>
                            <span className="text-sm text-gray-400">tokens</span>
                            <span className="text-xs text-gray-400">· A${(plan.price_cents / plan.token_amount / 100).toFixed(3)}/token</span>
                          </div>
                        </div>
                        <ul className="space-y-2 mb-6">
                          {plan.features.map((f, fi) => (
                            <li key={fi} className="flex items-start gap-2">
                              <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                              <span className="text-sm text-gray-600 dark:text-gray-300">{f}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="px-6 pb-6">
                        <button
                          onClick={() => handlePurchaseAI(plan)}
                          disabled={!!purchasingPlan}
                          className={`w-full py-2.5 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-60 ${plan.is_popular ? 'bg-gold-500 hover:bg-gold-600 text-white' : 'bg-gray-900 dark:bg-white hover:bg-gray-800 dark:hover:bg-gray-100 text-white dark:text-gray-900'}`}
                        >
                          {purchasingPlan === plan.id ? <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> : null}
                          Get {plan.token_amount} Tokens <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
