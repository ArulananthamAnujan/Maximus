import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, CreditCard as Edit2, ToggleLeft, ToggleRight, Star, X, Save, Check, Sparkles, Zap, Building2, Crown } from 'lucide-react';
import { toast } from 'sonner';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { adminNavItems } from './adminNav';
import { supabase } from '../../lib/supabase';
import type { TokenPackage, OrgPlanTier, OrgFeatureFlags } from '../../types';
import { PLAN_FEATURES as PLAN_FEATURES_MAP } from '../../types';

const TIER_META: Record<OrgPlanTier, { label: string; icon: typeof Sparkles; color: string; ring: string; badge: string }> = {
  starter:      { label: 'Starter',      icon: Zap,       color: 'bg-slate-100 text-slate-600',   ring: 'ring-slate-200',  badge: 'bg-slate-100 text-slate-600' },
  professional: { label: 'Professional', icon: Sparkles,  color: 'bg-sky-100 text-sky-600',        ring: 'ring-sky-400',    badge: 'bg-sky-100 text-sky-700' },
  growth:       { label: 'Growth',       icon: Zap,       color: 'bg-teal-100 text-teal-600',      ring: 'ring-teal-400',   badge: 'bg-teal-100 text-teal-700' },
  enterprise:   { label: 'Enterprise',   icon: Crown,     color: 'bg-amber-100 text-amber-600',    ring: 'ring-amber-400',  badge: 'bg-amber-100 text-amber-700' },
};

const FEATURE_LABELS: { key: keyof OrgFeatureFlags; label: string }[] = [
  { key: 'ai_course_outline',   label: 'AI Course Outline' },
  { key: 'ai_lesson_content',   label: 'AI Lesson Content' },
  { key: 'ai_quiz_generation',  label: 'AI Quiz Generation' },
  { key: 'ai_flashcards',       label: 'AI Flashcards' },
  { key: 'ai_full_curriculum',  label: 'Full Curriculum AI' },
  { key: 'ai_presentations',    label: 'AI Presentations' },
  { key: 'ai_exams',            label: 'AI Exam Generation' },
  { key: 'student_ai_access',   label: 'Student AI Access' },
];

const EMPTY: Partial<TokenPackage> = {
  name: '', description: '', token_amount: 1000, price_cents: 4900,
  currency: 'usd', is_active: true, is_popular: false, plan_tier: 'professional',
};

function PackageModal({ pkg, onClose }: { pkg: Partial<TokenPackage> | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<Partial<TokenPackage>>(pkg ?? EMPTY);
  const [saving, setSaving] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const payload = {
      name: form.name,
      description: form.description,
      token_amount: form.token_amount,
      price_cents: form.price_cents,
      currency: form.currency ?? 'usd',
      is_active: form.is_active ?? true,
      is_popular: form.is_popular ?? false,
      plan_tier: form.plan_tier ?? 'starter',
    };
    const { error } = form.id
      ? await supabase.from('token_packages').update(payload).eq('id', form.id)
      : await supabase.from('token_packages').insert(payload);
    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success('Package saved');
    qc.invalidateQueries({ queryKey: ['admin-token-packages'] });
    onClose();
    setSaving(false);
  };

  const priceUsd = ((form.price_cents ?? 0) / 100).toFixed(2);
  const perToken = form.token_amount ? ((form.price_cents ?? 0) / form.token_amount / 100).toFixed(5) : '0';
  const tier = form.plan_tier as OrgPlanTier ?? 'starter';
  const tierFeatures = PLAN_FEATURES_MAP[tier];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-slate-100 sticky top-0 bg-white z-10">
          <h2 className="text-lg font-bold text-slate-800">{form.id ? 'Edit Package' : 'New Token Package'}</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 transition-colors"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={save} className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-5">
          {/* Left col */}
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">Package Name *</label>
              <input required value={form.name ?? ''} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="input-field" placeholder="Professional" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">Description</label>
              <textarea rows={2} value={form.description ?? ''} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="input-field resize-none" placeholder="For active course creators..." />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Token Amount</label>
                <input type="number" min="1" required value={form.token_amount ?? ''} onChange={e => setForm(f => ({ ...f, token_amount: parseInt(e.target.value) || 0 }))} className="input-field" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Price (cents)</label>
                <input type="number" min="1" required value={form.price_cents ?? ''} onChange={e => setForm(f => ({ ...f, price_cents: parseInt(e.target.value) || 0 }))} className="input-field" />
              </div>
            </div>
            <div className="bg-slate-50 rounded-xl px-4 py-3 text-sm flex justify-between">
              <span className="text-slate-600 font-semibold">${priceUsd} USD</span>
              <span className="text-slate-400">${perToken} / token</span>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">Plan Tier</label>
              <select value={form.plan_tier ?? 'starter'} onChange={e => setForm(f => ({ ...f, plan_tier: e.target.value as OrgPlanTier }))} className="input-field">
                <option value="starter">Starter</option>
                <option value="professional">Professional</option>
                <option value="growth">Growth</option>
                <option value="enterprise">Enterprise</option>
              </select>
              <p className="text-xs text-slate-400 mt-1">Determines which AI features are unlocked</p>
            </div>
            <div className="flex items-center gap-4 pt-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.is_active ?? true} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} className="w-4 h-4 rounded" />
                <span className="text-sm text-slate-600">Active</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.is_popular ?? false} onChange={e => setForm(f => ({ ...f, is_popular: e.target.checked }))} className="w-4 h-4 rounded" />
                <span className="text-sm text-slate-600 flex items-center gap-1"><Star className="w-3 h-3 text-amber-500" /> Popular</span>
              </label>
            </div>
          </div>

          {/* Right col — feature preview */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-2">Features Unlocked at This Tier</label>
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              {FEATURE_LABELS.map(({ key, label }) => (
                <div key={key} className={`flex items-center justify-between px-3 py-2.5 border-b border-slate-100 last:border-0 ${tierFeatures?.[key] ? '' : 'opacity-40'}`}>
                  <span className="text-sm text-slate-700">{label}</span>
                  {tierFeatures?.[key]
                    ? <Check className="w-4 h-4 text-emerald-500" />
                    : <span className="w-4 h-4 rounded-full border-2 border-slate-300 inline-block" />}
                </div>
              ))}
            </div>
          </div>

          <div className="sm:col-span-2 flex gap-3 pt-2 border-t border-slate-100">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary flex-1 flex items-center justify-center gap-2">
              <Save className="w-4 h-4" />{saving ? 'Saving...' : 'Save Package'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function AdminTokenPackages() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Partial<TokenPackage> | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const { data: packages = [], isLoading } = useQuery({
    queryKey: ['admin-token-packages'],
    queryFn: async () => {
      const { data } = await supabase.from('token_packages').select('*').order('token_amount');
      return (data ?? []) as TokenPackage[];
    },
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from('token_packages').update({ is_active }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-token-packages'] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const tiers: OrgPlanTier[] = ['starter', 'professional', 'growth', 'enterprise'];

  return (
    <DashboardLayout navItems={adminNavItems} title="Token Packages" subtitle="Define plans, features and pricing">
      {(editing !== null || showCreate) && (
        <PackageModal pkg={editing} onClose={() => { setEditing(null); setShowCreate(false); }} />
      )}
      <div className="space-y-8">
        <div className="flex justify-end">
          <button onClick={() => { setEditing(null); setShowCreate(true); }} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> New Package
          </button>
        </div>

        {/* Feature matrix */}
        <div className="card overflow-hidden">
          <div className="p-5 border-b border-slate-100">
            <h3 className="font-semibold text-slate-800">Plan Feature Matrix</h3>
            <p className="text-xs text-slate-400 mt-0.5">What each plan tier unlocks for organisations</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 w-48">Feature</th>
                  {tiers.map(t => {
                    const meta = TIER_META[t];
                    const Icon = meta.icon;
                    return (
                      <th key={t} className="px-4 py-3 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${meta.color}`}>
                            <Icon className="w-3.5 h-3.5" />
                          </div>
                          <span className="text-xs font-semibold text-slate-700">{meta.label}</span>
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {FEATURE_LABELS.map(({ key, label }, i) => (
                  <tr key={key} className={i % 2 === 0 ? 'bg-slate-50/50' : ''}>
                    <td className="px-5 py-3 text-slate-700 font-medium">{label}</td>
                    {tiers.map(t => (
                      <td key={t} className="px-4 py-3 text-center">
                        {PLAN_FEATURES_MAP[t][key]
                          ? <Check className="w-4 h-4 text-emerald-500 mx-auto" />
                          : <span className="w-4 h-4 border-2 border-slate-200 rounded-full inline-block" />}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Packages grouped by tier */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => <div key={i} className="card h-56 animate-pulse" />)}
          </div>
        ) : (
          <div className="space-y-6">
            {tiers.map(tier => {
              const tierPkgs = packages.filter(p => p.plan_tier === tier);
              if (tierPkgs.length === 0) return null;
              const meta = TIER_META[tier];
              const Icon = meta.icon;
              return (
                <div key={tier}>
                  <div className="flex items-center gap-2 mb-3">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${meta.color}`}>
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <h3 className="font-semibold text-slate-800">{meta.label} Packages</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${meta.badge}`}>{tier}</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {tierPkgs.map(pkg => (
                      <div key={pkg.id} className={`card p-5 relative flex flex-col gap-3 transition-all ${!pkg.is_active ? 'opacity-50' : ''} ${pkg.is_popular ? `ring-2 ${meta.ring}` : ''}`}>
                        {pkg.is_popular && (
                          <div className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap">
                            <span className="bg-sky-500 text-white text-xs font-bold px-3 py-0.5 rounded-full flex items-center gap-1">
                              <Star className="w-3 h-3 fill-white" /> Most Popular
                            </span>
                          </div>
                        )}
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-bold text-slate-800 leading-tight">{pkg.name}</h3>
                          <span className={`shrink-0 text-xs px-1.5 py-0.5 rounded font-semibold ${meta.badge}`}>{tier}</span>
                        </div>
                        <p className="text-xs text-slate-400 line-clamp-2 flex-1">{pkg.description}</p>
                        <div>
                          <p className="text-2xl font-bold text-slate-800">${(pkg.price_cents / 100).toFixed(2)}</p>
                          <p className="text-xs text-slate-400">{pkg.token_amount.toLocaleString()} tokens</p>
                        </div>
                        <p className="text-xs text-slate-400">${(pkg.price_cents / pkg.token_amount / 100).toFixed(5)}/token</p>
                        <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                          <button
                            onClick={() => { setShowCreate(false); setEditing(pkg); }}
                            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"
                            title="Edit"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => toggleActive.mutate({ id: pkg.id, is_active: !pkg.is_active })}
                            className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors"
                            title={pkg.is_active ? 'Deactivate' : 'Activate'}
                          >
                            {pkg.is_active
                              ? <ToggleRight className="w-4 h-4 text-emerald-500" />
                              : <ToggleLeft className="w-4 h-4 text-slate-400" />}
                          </button>
                          <span className={`ml-auto text-xs px-2 py-0.5 rounded-full font-semibold ${pkg.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                            {pkg.is_active ? 'Active' : 'Hidden'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Profit notes */}
        <div className="card p-5 bg-slate-50 border border-slate-200">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center shrink-0">
              <Building2 className="w-4 h-4 text-amber-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-700 mb-1">Pricing Strategy Guide</p>
              <p className="text-xs text-slate-500 leading-relaxed">
                Tokens are consumed per AI call. Suggested costs: <strong>course_outline</strong> = 5 tokens,
                <strong> full_curriculum</strong> = 20 tokens, <strong>lesson_content</strong> = 8 tokens.
                Set token prices so your cost per token to you (Anthropic API) is at least 10x less than what
                you charge organisations. Stripe Checkout will be wired in once payment keys are configured —
                each package's <code>stripe_price_id</code> field will link to a Stripe price.
              </p>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
