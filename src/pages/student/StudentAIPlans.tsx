import { useState, useEffect } from 'react';
import { Sparkles, Check, Zap, Star, Crown, Brain, BookOpen, HelpCircle, MessageSquare, ChevronRight } from 'lucide-react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { studentNavItems } from './studentNav';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'sonner';

interface StudentAIPlan {
  id: string;
  name: string;
  description: string;
  token_amount: number;
  price_cents: number;
  currency: string;
  is_popular: boolean;
  features: string[];
}

interface StudentCredits {
  token_balance: number;
  total_purchased: number;
  total_used: number;
  last_purchase_at: string | null;
}

const TASK_COSTS = [
  { task: 'Lesson Summary', tokens: 3, icon: BookOpen, description: 'AI-generated summary of any lesson' },
  { task: 'Flashcards', tokens: 4, icon: Brain, description: 'Generate study flashcards from lesson content' },
  { task: 'Activity Ideas', tokens: 4, icon: Zap, description: 'Personalized practice activity suggestions' },
  { task: 'Quiz Assistance', tokens: 6, icon: HelpCircle, description: 'AI-powered quiz hints and explanations' },
];

const PLAN_ICONS = [Sparkles, Star, Crown];

export default function StudentAIPlans() {
  const { profile } = useAuth();
  const [plans, setPlans] = useState<StudentAIPlan[]>([]);
  const [credits, setCredits] = useState<StudentCredits | null>(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    const load = async () => {
      const [plansRes, creditsRes] = await Promise.all([
        supabase.from('student_ai_plans').select('*').order('sort_order'),
        supabase.from('student_ai_credits').select('*').eq('user_id', profile.id).maybeSingle(),
      ]);
      if (plansRes.data) setPlans(plansRes.data.map(p => ({ ...p, features: Array.isArray(p.features) ? p.features : JSON.parse(p.features as unknown as string) })));
      if (creditsRes.data) setCredits(creditsRes.data);
      setLoading(false);
    };
    load();
  }, [profile]);

  const handlePurchase = async (plan: StudentAIPlan) => {
    if (!profile) return;
    setPurchasing(plan.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-create-checkout`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ type: 'ai_plan', plan_id: plan.id }),
        }
      );
      const data = await res.json();
      if (data.url) {
        window.open(data.url, '_blank', 'noopener,noreferrer');
      } else if (data.error === 'Stripe not configured') {
        toast.error('Payment is not yet configured. Please contact support.');
      } else {
        toast.error(data.error || 'Failed to start checkout. Please try again.');
      }
    } catch {
      toast.error('Failed to connect to payment service.');
    } finally {
      setPurchasing(null);
    }
  };

  // Handle return from Stripe (success/cancelled)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const payment = params.get('payment');
    const sessionId = params.get('session_id');
    window.history.replaceState({}, '', window.location.pathname);

    if (payment === 'cancelled') {
      toast.info('Payment cancelled.');
      return;
    }
    if (payment !== 'success' || !sessionId) return;

    (async () => {
      try {
        const { data: { session: authSession } } = await supabase.auth.getSession();
        const token = authSession?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY;
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-verify-session`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ session_id: sessionId }),
          }
        );
        const data = await res.json();
        if (data.enrolled) {
          toast.success(`Payment successful! ${data.tokens_added ?? ''} tokens added to your account.`);
          const { data: updated } = await supabase.from('student_ai_credits').select('*').eq('user_id', profile?.id ?? '').maybeSingle();
          if (updated) setCredits(updated);
        } else {
          toast.error(data.error || 'Could not verify payment. Please contact support.');
        }
      } catch {
        toast.error('Could not verify payment. Please contact support.');
      }
    })();
  }, [profile?.id]);

  const balancePercent = credits && credits.total_purchased > 0
    ? Math.round((credits.token_balance / credits.total_purchased) * 100)
    : 0;

  return (
    <DashboardLayout navItems={studentNavItems} title="AI Learning Assistant" subtitle="Supercharge your studies with AI-powered tools">
      <div className="space-y-8">

        {/* Current balance card */}
        <div className="rounded-2xl bg-gradient-to-br from-navy-900 to-navy-800 p-6 text-white relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(212,175,55,0.15),transparent_60%)]" />
          <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-gold-500/20 border border-gold-500/30 flex items-center justify-center">
                <Sparkles className="w-7 h-7 text-gold-400" />
              </div>
              <div>
                <p className="text-white/60 text-sm font-medium">Your AI Token Balance</p>
                <p className="text-4xl font-bold text-white">
                  {loading ? '—' : (credits?.token_balance ?? 0)}
                  <span className="text-lg font-normal text-white/50 ml-2">tokens</span>
                </p>
              </div>
            </div>
            {credits && credits.total_purchased > 0 && (
              <div className="sm:text-right">
                <p className="text-white/50 text-xs mb-1">{credits.total_used} used of {credits.total_purchased} purchased</p>
                <div className="w-full sm:w-40 h-2 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gold-400 rounded-full transition-all duration-500"
                    style={{ width: `${balancePercent}%` }}
                  />
                </div>
                <p className="text-white/50 text-xs mt-1">{balancePercent}% remaining</p>
              </div>
            )}
          </div>
          {!loading && !credits && (
            <p className="relative mt-3 text-white/50 text-sm">Purchase a plan below to start using AI features in your lessons.</p>
          )}
        </div>

        {/* What AI can do */}
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">What AI can do for you</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {TASK_COSTS.map(({ task, tokens, icon: Icon, description }) => (
              <div key={task} className="card p-5 flex flex-col gap-3">
                <div className="w-10 h-10 rounded-xl bg-sky-50 dark:bg-sky-900/20 flex items-center justify-center">
                  <Icon className="w-5 h-5 text-sky-600 dark:text-sky-400" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900 dark:text-white text-sm">{task}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">{description}</p>
                </div>
                <div className="mt-auto flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-gold-500" />
                  <span className="text-xs font-bold text-gold-600 dark:text-gold-400">{tokens} tokens</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Plans */}
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-1">Choose a token pack</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Tokens never expire. Use them at your own pace across all your courses.</p>

          {loading ? (
            <div className="grid sm:grid-cols-3 gap-6">
              {[1,2,3].map(i => (
                <div key={i} className="card animate-pulse h-80" />
              ))}
            </div>
          ) : (
            <div className="grid sm:grid-cols-3 gap-6">
              {plans.map((plan, idx) => {
                const PlanIcon = PLAN_ICONS[idx] ?? Sparkles;
                const priceAud = (plan.price_cents / 100).toFixed(2);
                const perToken = (plan.price_cents / plan.token_amount / 100).toFixed(3);
                return (
                  <div
                    key={plan.id}
                    className={`card relative flex flex-col ${plan.is_popular ? 'ring-2 ring-gold-500 shadow-xl' : ''}`}
                  >
                    {plan.is_popular && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                        <span className="bg-gold-500 text-white text-xs font-bold px-3 py-1 rounded-full shadow-sm whitespace-nowrap">
                          Most Popular
                        </span>
                      </div>
                    )}

                    <div className="p-6 flex-1">
                      <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-4 ${
                        idx === 0 ? 'bg-sky-50 dark:bg-sky-900/20' :
                        idx === 1 ? 'bg-gold-50 dark:bg-gold-900/20' :
                        'bg-emerald-50 dark:bg-emerald-900/20'
                      }`}>
                        <PlanIcon className={`w-5 h-5 ${
                          idx === 0 ? 'text-sky-600 dark:text-sky-400' :
                          idx === 1 ? 'text-gold-600 dark:text-gold-400' :
                          'text-emerald-600 dark:text-emerald-400'
                        }`} />
                      </div>

                      <h3 className="text-lg font-bold text-gray-900 dark:text-white">{plan.name}</h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 mb-4 leading-relaxed">{plan.description}</p>

                      <div className="mb-5">
                        <div className="flex items-end gap-1">
                          <span className="text-3xl font-bold text-gray-900 dark:text-white">A${priceAud}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xl font-bold text-gold-600 dark:text-gold-400">{plan.token_amount}</span>
                          <span className="text-sm text-gray-500 dark:text-gray-400">tokens</span>
                          <span className="text-xs text-gray-400 dark:text-gray-500">· A${perToken}/token</span>
                        </div>
                      </div>

                      <ul className="space-y-2.5 mb-6">
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
                        onClick={() => handlePurchase(plan)}
                        disabled={!!purchasing}
                        className={`w-full py-2.5 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed ${
                          plan.is_popular
                            ? 'bg-gold-500 hover:bg-gold-600 text-white shadow-md hover:shadow-lg'
                            : 'bg-gray-900 dark:bg-white hover:bg-gray-800 dark:hover:bg-gray-100 text-white dark:text-gray-900'
                        }`}
                      >
                        {purchasing === plan.id ? (
                          <>
                            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                            Processing...
                          </>
                        ) : (
                          <>
                            Get {plan.token_amount} Tokens
                            <ChevronRight className="w-4 h-4" />
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* FAQ strip */}
        <div className="card p-6">
          <div className="flex items-start gap-4">
            <MessageSquare className="w-5 h-5 text-gray-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-gray-900 dark:text-white text-sm">How do tokens work?</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
                Each AI action in the course player costs a small number of tokens. Tokens are deducted only when you successfully generate content — failed requests are not charged. Tokens never expire, so buy at your own pace and use them across all your enrolled courses.
              </p>
            </div>
          </div>
        </div>

      </div>
    </DashboardLayout>
  );
}
