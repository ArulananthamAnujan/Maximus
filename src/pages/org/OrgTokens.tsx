import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Coins, TrendingDown, ShoppingCart, Clock, CheckCircle, XCircle, Sparkles, ChevronRight } from 'lucide-react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { orgNavItems } from './orgNav';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import type { TokenPackage, TokenPurchase, TokenUsageLog } from '../../types';

const TASK_COSTS: Record<string, number> = {
  course_outline: 5, lesson_content: 8, quiz_from_content: 6, flashcards: 4,
  summarize_lesson: 3, rewrite_content: 5, translate_content: 7, activity_ideas: 4,
  full_curriculum: 20, lesson_notes: 5, presentation_slides: 10,
  section_content: 8, section_notes: 5, section_slides: 10, generate_exam: 10,
};

function PackageCard({ pkg, onSelect }: { pkg: TokenPackage; onSelect: () => void }) {
  const price = (pkg.price_cents / 100).toFixed(2);
  const perToken = (pkg.price_cents / pkg.token_amount / 100).toFixed(4);
  return (
    <div className={`card p-6 relative flex flex-col gap-4 ${pkg.is_popular ? 'ring-2 ring-sky-500' : ''}`}>
      {pkg.is_popular && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="bg-sky-500 text-white text-xs font-bold px-3 py-1 rounded-full">Most Popular</span>
        </div>
      )}
      <div>
        <h3 className="text-lg font-bold text-slate-800">{pkg.name}</h3>
        <p className="text-sm text-slate-500 mt-0.5">{pkg.description}</p>
      </div>
      <div>
        <div className="flex items-baseline gap-1">
          <span className="text-3xl font-bold text-slate-800">${price}</span>
          <span className="text-sm text-slate-400">{pkg.currency.toUpperCase()}</span>
        </div>
        <p className="text-xs text-slate-400 mt-0.5">${perToken} per token</p>
      </div>
      <div className="flex items-center gap-2">
        <Coins className="w-4 h-4 text-emerald-500" />
        <span className="text-sm font-semibold text-slate-700">{pkg.token_amount.toLocaleString()} tokens</span>
      </div>
      <button onClick={onSelect} className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2 ${pkg.is_popular ? 'bg-sky-500 hover:bg-sky-600 text-white' : 'btn-secondary'}`}>
        <ShoppingCart className="w-4 h-4" /> Buy Now <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}

function PurchaseModal({ pkg, orgId, onClose }: { pkg: TokenPackage; orgId: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <h2 className="text-lg font-bold text-slate-800 mb-4">Complete Purchase</h2>
        <div className="bg-slate-50 rounded-xl p-4 mb-6 space-y-2">
          <div className="flex justify-between text-sm"><span className="text-slate-500">Package</span><span className="font-semibold">{pkg.name}</span></div>
          <div className="flex justify-between text-sm"><span className="text-slate-500">Tokens</span><span className="font-semibold">{pkg.token_amount.toLocaleString()}</span></div>
          <div className="flex justify-between text-sm"><span className="text-slate-500">Price</span><span className="font-bold text-slate-800">${(pkg.price_cents / 100).toFixed(2)} {pkg.currency.toUpperCase()}</span></div>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
          <p className="text-sm text-amber-800 font-semibold mb-1">Stripe Checkout Coming Soon</p>
          <p className="text-xs text-amber-600">Stripe integration will be enabled once payment keys are configured. Contact your administrator to manually top up tokens in the meantime.</p>
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1">Close</button>
          <button disabled className="btn-primary flex-1 opacity-50 cursor-not-allowed">Proceed to Checkout</button>
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
      const { data } = await supabase.from('organizations').select('token_balance, plan_tier').eq('id', orgId!).maybeSingle();
      return data;
    },
  });

  const { data: packages = [] } = useQuery({
    queryKey: ['token-packages'],
    queryFn: async () => {
      const { data } = await supabase.from('token_packages').select('*').eq('is_active', true).order('token_amount');
      return (data ?? []) as TokenPackage[];
    },
  });

  const { data: purchases = [] } = useQuery({
    queryKey: ['org-purchases', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase
        .from('token_purchases')
        .select('*, buyer:profiles!purchased_by(full_name, email)')
        .eq('org_id', orgId!)
        .order('created_at', { ascending: false })
        .limit(10);
      return (data ?? []) as (TokenPurchase & { buyer: { full_name: string; email: string } | null })[];
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

  return (
    <DashboardLayout navItems={orgNavItems} title="Token Management" subtitle="Buy and track AI generation tokens">
      {selectedPkg && orgId && <PurchaseModal pkg={selectedPkg} orgId={orgId} onClose={() => setSelectedPkg(null)} />}
      <div className="space-y-8">
        {/* Balance banner */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="card p-5 flex items-center gap-4 sm:col-span-1">
            <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center shrink-0">
              <Coins className="w-6 h-6 text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-800">{(org?.token_balance ?? 0).toLocaleString()}</p>
              <p className="text-sm text-slate-500">Current Balance</p>
            </div>
          </div>
          <div className="card p-5 flex items-center gap-4">
            <div className="w-12 h-12 bg-rose-100 rounded-xl flex items-center justify-center shrink-0">
              <TrendingDown className="w-6 h-6 text-rose-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-800">{totalUsed.toLocaleString()}</p>
              <p className="text-sm text-slate-500">Tokens Used (Recent)</p>
            </div>
          </div>
          <div className="card p-5 flex items-center gap-4">
            <div className="w-12 h-12 bg-sky-100 rounded-xl flex items-center justify-center shrink-0">
              <Sparkles className="w-6 h-6 text-sky-600" />
            </div>
            <div>
              <p className="text-lg font-bold text-slate-800 capitalize">{org?.plan_tier ?? '—'}</p>
              <p className="text-sm text-slate-500">Plan Tier</p>
            </div>
          </div>
        </div>

        {/* Token cost reference */}
        <div className="card p-5">
          <h3 className="font-semibold text-slate-800 mb-3 text-sm">Token Cost Per AI Task</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            {Object.entries(TASK_COSTS).map(([task, cost]) => (
              <div key={task} className="bg-slate-50 rounded-lg px-3 py-2 text-center">
                <p className="text-xs font-semibold text-slate-600">{cost} tokens</p>
                <p className="text-xs text-slate-400 mt-0.5 truncate">{task.replace(/_/g, ' ')}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Packages */}
        <div>
          <h2 className="text-base font-bold text-slate-800 mb-4">Buy Token Packages</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {packages.map(pkg => <PackageCard key={pkg.id} pkg={pkg} onSelect={() => setSelectedPkg(pkg)} />)}
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
                    <p className="text-xs text-slate-400">{p.notes ?? (p.buyer?.full_name ?? p.buyer?.email ?? 'Unknown')}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-slate-800">{p.amount_paid_cents === 0 ? 'Free' : `$${(p.amount_paid_cents / 100).toFixed(2)}`}</p>
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
            <div className="card p-8 text-center text-slate-400 text-sm">No usage yet</div>
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
