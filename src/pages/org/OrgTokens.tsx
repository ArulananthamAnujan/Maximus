import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Coins, TrendingDown, ShoppingCart, Clock, CheckCircle, XCircle,
  Sparkles, ChevronRight, Check, Crown, Zap, Star
} from 'lucide-react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { orgNavItems } from './orgNav';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import type { TokenPackage, TokenPurchase, TokenUsageLog, OrgPlanTier } from '../../types';
import { PLAN_FEATURES } from '../../types';

const TASK_COSTS: Record<string, number> = {
  course_outline: 5, lesson_content: 8, quiz_from_content: 6, flashcards: 4,
  summarize_lesson: 3, rewrite_content: 5, translate_content: 7, activity_ideas: 4,
  full_curriculum: 20, lesson_notes: 5, presentation_slides: 10,
  section_content: 8, section_notes: 5, section_slides: 10, generate_exam: 10,
};

const FEATURE_LABELS: { key: string; label: string }[] = [
  { key: 'ai_course_outline',   label: 'AI Course Outline' },
  { key: 'ai_lesson_content',   label: 'AI Lesson Content' },
  { key: 'ai_quiz_generation',  label: 'AI Quiz Generation' },
  { key: 'ai_flashcards',       label: 'AI Flashcards' },
  { key: 'ai_full_curriculum',  label: 'Full Curriculum AI' },
  { key: 'ai_presentations',    label: 'AI Presentations' },
  { key: 'ai_exams',            label: 'AI Exam Generation' },
  { key: 'student_ai_access',   label: 'Student AI Access' },
];

const TIER_ICONS: Record<OrgPlanTier, typeof Sparkles> = {
  starter: Zap, professional: Sparkles, growth: Zap, enterprise: Crown,
};

const TIER_COLORS: Record<OrgPlanTier, string> = {
  starter: 'bg-slate-100 text-slate-600 border-slate-200',
  professional: 'bg-sky-50 text-sky-700 border-sky-200',
  growth: 'bg-teal-50 text-teal-700 border-teal-200',
  enterprise: 'bg-amber-50 text-amber-700 border-amber-200',
};

function PackageCard({ pkg, currentTier, onSelect }: { pkg: TokenPackage; currentTier: OrgPlanTier; onSelect: () => void }) {
  const price = (pkg.price_cents / 100).toFixed(2);
  const perToken = (pkg.price_cents / pkg.token_amount / 100).toFixed(4);
  const pkgTier = pkg.plan_tier as OrgPlanTier;
  const TierIcon = TIER_ICONS[pkgTier] ?? Sparkles;
  const tierColor = TIER_COLORS[pkgTier];
  const features = PLAN_FEATURES[pkgTier];
  const isCurrent = pkgTier === currentTier;
  const isUpgrade = ['starter','professional','growth','enterprise'].indexOf(pkgTier) >
    ['starter','professional','growth','enterprise'].indexOf(currentTier);

  return (
    <div className={`card p-6 relative flex flex-col gap-4 transition-all hover:shadow-lg ${isCurrent ? 'ring-2 ring-sky-400' : ''} ${pkg.is_popular ? 'ring-2 ring-sky-500' : ''}`}>
      {pkg.is_popular && !isCurrent && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap">
          <span className="bg-sky-500 text-white text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1">
            <Star className="w-3 h-3 fill-white" /> Most Popular
          </span>
        </div>
      )}
      {isCurrent && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap">
          <span className="bg-emerald-500 text-white text-xs font-bold px-3 py-1 rounded-full">Current Plan</span>
        </div>
      )}
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold border mb-2 ${tierColor}`}>
            <TierIcon className="w-3 h-3" /> {pkg.plan_tier}
          </div>
          <h3 className="text-lg font-bold text-slate-800">{pkg.name}</h3>
          <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{pkg.description}</p>
        </div>
      </div>
      <div>
        <div className="flex items-baseline gap-1">
          <span className="text-3xl font-bold text-slate-800">${price}</span>
          <span className="text-sm text-slate-400">{pkg.currency.toUpperCase()}</span>
        </div>
        <p className="text-xs text-slate-400">${perToken}/token · {pkg.token_amount.toLocaleString()} tokens</p>
      </div>

      {/* Feature list */}
      <div className="space-y-1.5">
        {FEATURE_LABELS.map(({ key, label }) => (
          <div key={key} className={`flex items-center gap-2 text-xs ${features?.[key as keyof typeof features] ? 'text-slate-700' : 'text-slate-300'}`}>
            {features?.[key as keyof typeof features]
              ? <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              : <span className="w-3.5 h-3.5 rounded-full border border-slate-200 shrink-0 inline-block" />}
            {label}
          </div>
        ))}
      </div>

      <button
        onClick={onSelect}
        disabled={isCurrent}
        className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2 mt-auto ${
          isCurrent ? 'bg-emerald-100 text-emerald-700 cursor-default'
          : isUpgrade ? 'bg-sky-500 hover:bg-sky-600 text-white'
          : 'btn-secondary'
        }`}
      >
        {isCurrent ? <><Check className="w-4 h-4" /> Current Plan</>
          : <><ShoppingCart className="w-4 h-4" /> {isUpgrade ? 'Upgrade' : 'Switch Plan'} <ChevronRight className="w-4 h-4" /></>}
      </button>
    </div>
  );
}

function PurchaseModal({ pkg, onClose }: { pkg: TokenPackage; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <h2 className="text-lg font-bold text-slate-800 mb-4">Complete Purchase</h2>
        <div className="bg-slate-50 rounded-xl p-4 mb-5 space-y-2">
          <div className="flex justify-between text-sm"><span className="text-slate-500">Package</span><span className="font-semibold">{pkg.name}</span></div>
          <div className="flex justify-between text-sm"><span className="text-slate-500">Plan Tier</span><span className="font-semibold capitalize">{pkg.plan_tier}</span></div>
          <div className="flex justify-between text-sm"><span className="text-slate-500">Tokens</span><span className="font-semibold">{pkg.token_amount.toLocaleString()}</span></div>
          <div className="flex justify-between text-sm pt-1 border-t border-slate-200"><span className="text-slate-500">Total</span><span className="font-bold text-slate-800 text-base">${(pkg.price_cents / 100).toFixed(2)} {pkg.currency.toUpperCase()}</span></div>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5">
          <p className="text-sm text-amber-800 font-semibold mb-1">Stripe Checkout Coming Soon</p>
          <p className="text-xs text-amber-600">
            Online payments will be available once Stripe is configured by your administrator.
            Contact your administrator to have tokens allocated manually.
          </p>
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1">Close</button>
          <button disabled className="btn-primary flex-1 opacity-40 cursor-not-allowed">Proceed to Checkout</button>
        </div>
      </div>
    </div>
  );
}

export default function OrgTokens() {
  const { orgMembership } = useAuth();
  const orgId = (orgMembership?.organization as { id?: string })?.id ?? orgMembership?.org_id;
  const [selectedPkg, setSelectedPkg] = useState<TokenPackage | null>(null);

  const { data: org } = useQuery({
    queryKey: ['org-detail', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase.from('organizations').select('token_balance, plan_tier, feature_flags').eq('id', orgId!).maybeSingle();
      return data as { token_balance: number; plan_tier: OrgPlanTier; feature_flags: Record<string, boolean> } | null;
    },
  });

  const { data: packages = [] } = useQuery({
    queryKey: ['token-packages'],
    queryFn: async () => {
      const { data } = await supabase.from('token_packages').select('*').eq('is_active', true).order('price_cents');
      return (data ?? []) as TokenPackage[];
    },
  });

  const { data: purchases = [] } = useQuery({
    queryKey: ['org-purchases', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase
        .from('token_purchases')
        .select('*')
        .eq('org_id', orgId!)
        .order('created_at', { ascending: false })
        .limit(10);
      return (data ?? []) as TokenPurchase[];
    },
  });

  const { data: usageLogs = [] } = useQuery({
    queryKey: ['org-usage-logs', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase
        .from('token_usage_log')
        .select('*, profile:profiles(full_name, email)')
        .eq('org_id', orgId!)
        .order('created_at', { ascending: false })
        .limit(20);
      return (data ?? []) as (TokenUsageLog & { profile: { full_name: string; email: string } | null })[];
    },
  });

  const totalUsed = usageLogs.reduce((s, l) => s + l.tokens_deducted, 0);
  const currentTier = (org?.plan_tier ?? 'starter') as OrgPlanTier;
  const currentFeatures = PLAN_FEATURES[currentTier];

  return (
    <DashboardLayout navItems={orgNavItems} title="Tokens & Plans" subtitle="Manage AI token balance and upgrade your plan">
      {selectedPkg && <PurchaseModal pkg={selectedPkg} onClose={() => setSelectedPkg(null)} />}
      <div className="space-y-8">
        {/* Balance + current plan */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="card p-5 flex items-center gap-4 sm:col-span-1">
            <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center shrink-0">
              <Coins className="w-6 h-6 text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-800">{(org?.token_balance ?? 0).toLocaleString()}</p>
              <p className="text-sm text-slate-500">Token Balance</p>
            </div>
          </div>
          <div className="card p-5 flex items-center gap-4">
            <div className="w-12 h-12 bg-rose-100 rounded-xl flex items-center justify-center shrink-0">
              <TrendingDown className="w-6 h-6 text-rose-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-800">{totalUsed.toLocaleString()}</p>
              <p className="text-sm text-slate-500">Tokens Used</p>
            </div>
          </div>
          <div className={`card p-5 flex items-center gap-4 border-2 ${TIER_COLORS[currentTier]}`}>
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${TIER_COLORS[currentTier]}`}>
              <Crown className="w-6 h-6" />
            </div>
            <div>
              <p className="text-lg font-bold capitalize">{currentTier}</p>
              <p className="text-sm opacity-70">Current Plan</p>
            </div>
          </div>
        </div>

        {/* Current plan features */}
        <div className="card p-5">
          <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-sky-500" />
            Your Current Features — <span className="capitalize text-sky-600">{currentTier} Plan</span>
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {FEATURE_LABELS.map(({ key, label }) => (
              <div key={key} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium ${currentFeatures?.[key as keyof typeof currentFeatures] ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-50 text-slate-400'}`}>
                {currentFeatures?.[key as keyof typeof currentFeatures]
                  ? <Check className="w-3.5 h-3.5 shrink-0" />
                  : <span className="w-3.5 h-3.5 rounded-full border border-slate-300 shrink-0 inline-block" />}
                {label}
              </div>
            ))}
          </div>
        </div>

        {/* Token cost reference */}
        <div className="card p-5">
          <h3 className="font-semibold text-slate-800 mb-3 text-sm">Token Cost Per AI Task</h3>
          <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-8 gap-2">
            {Object.entries(TASK_COSTS).map(([task, cost]) => (
              <div key={task} className="bg-slate-50 rounded-lg px-2 py-2 text-center">
                <p className="text-xs font-bold text-slate-700">{cost}</p>
                <p className="text-xs text-slate-400 mt-0.5 leading-tight">{task.replace(/_/g, ' ')}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Packages */}
        <div>
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-base font-bold text-slate-800">Upgrade Your Plan</h2>
            <p className="text-xs text-slate-400">Prices in USD — Stripe checkout coming soon</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
            {packages.map(pkg => (
              <PackageCard key={pkg.id} pkg={pkg} currentTier={currentTier} onSelect={() => setSelectedPkg(pkg)} />
            ))}
          </div>
        </div>

        {/* Purchase History */}
        <div>
          <h2 className="text-base font-bold text-slate-800 mb-4">Purchase History</h2>
          {purchases.length === 0 ? (
            <div className="card p-8 text-center text-slate-400 text-sm">No purchases yet</div>
          ) : (
            <div className="card divide-y divide-slate-100">
              {purchases.map(p => (
                <div key={p.id} className="flex items-center gap-4 px-4 py-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${p.status === 'completed' ? 'bg-emerald-100' : p.status === 'failed' ? 'bg-red-100' : 'bg-amber-100'}`}>
                    {p.status === 'completed' ? <CheckCircle className="w-4 h-4 text-emerald-600" /> : p.status === 'failed' ? <XCircle className="w-4 h-4 text-red-500" /> : <Clock className="w-4 h-4 text-amber-600" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-700">+{p.token_amount.toLocaleString()} tokens</p>
                    <p className="text-xs text-slate-400">{p.notes ?? 'Token purchase'}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-slate-800">{p.amount_paid_cents === 0 ? 'Complimentary' : `$${(p.amount_paid_cents / 100).toFixed(2)}`}</p>
                    <p className="text-xs text-slate-400">{new Date(p.created_at).toLocaleDateString()}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Usage Log */}
        <div>
          <h2 className="text-base font-bold text-slate-800 mb-4">Recent AI Usage</h2>
          {usageLogs.length === 0 ? (
            <div className="card p-8 text-center text-slate-400 text-sm">No AI usage yet</div>
          ) : (
            <div className="card divide-y divide-slate-100">
              {usageLogs.map(l => (
                <div key={l.id} className="flex items-center gap-4 px-4 py-3">
                  <div className="w-8 h-8 bg-sky-50 rounded-full flex items-center justify-center shrink-0">
                    <Sparkles className="w-4 h-4 text-sky-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-700">{l.ai_task.replace(/_/g, ' ')}</p>
                    <p className="text-xs text-slate-400">{l.profile?.full_name ?? l.profile?.email ?? 'Unknown'}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-rose-600">−{l.tokens_deducted}</p>
                    <p className="text-xs text-slate-400">{new Date(l.created_at).toLocaleDateString()}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
