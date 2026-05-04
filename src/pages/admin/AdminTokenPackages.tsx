import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Coins, Plus, CreditCard as Edit2, ToggleLeft, ToggleRight, Star, X, Save } from 'lucide-react';
import { toast } from 'sonner';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { adminNavItems } from './adminNav';
import { supabase } from '../../lib/supabase';
import type { TokenPackage } from '../../types';

const EMPTY: Partial<TokenPackage> = { name: '', description: '', token_amount: 1000, price_cents: 4900, currency: 'usd', is_active: true, is_popular: false };

function PackageModal({ pkg, onClose }: { pkg: Partial<TokenPackage> | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<Partial<TokenPackage>>(pkg ?? EMPTY);
  const [saving, setSaving] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    if (form.id) {
      const { error } = await supabase.from('token_packages').update({ name: form.name, description: form.description, token_amount: form.token_amount, price_cents: form.price_cents, currency: form.currency, is_active: form.is_active, is_popular: form.is_popular }).eq('id', form.id);
      if (error) { toast.error(error.message); setSaving(false); return; }
    } else {
      const { error } = await supabase.from('token_packages').insert({ name: form.name, description: form.description, token_amount: form.token_amount!, price_cents: form.price_cents!, currency: form.currency ?? 'usd', is_active: form.is_active ?? true, is_popular: form.is_popular ?? false });
      if (error) { toast.error(error.message); setSaving(false); return; }
    }
    toast.success('Package saved');
    qc.invalidateQueries({ queryKey: ['admin-token-packages'] });
    onClose();
    setSaving(false);
  };

  const priceUsd = ((form.price_cents ?? 0) / 100).toFixed(2);
  const perToken = form.token_amount ? ((form.price_cents ?? 0) / form.token_amount / 100).toFixed(4) : '0';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-800">{form.id ? 'Edit Package' : 'New Token Package'}</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={save} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Package Name *</label>
            <input required value={form.name ?? ''} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="input-field" placeholder="Growth" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Description</label>
            <textarea rows={2} value={form.description ?? ''} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="input-field resize-none" placeholder="Great for active course creators" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">Tokens</label>
              <input type="number" min="1" required value={form.token_amount ?? ''} onChange={e => setForm(f => ({ ...f, token_amount: parseInt(e.target.value) || 0 }))} className="input-field" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">Price (cents)</label>
              <input type="number" min="1" required value={form.price_cents ?? ''} onChange={e => setForm(f => ({ ...f, price_cents: parseInt(e.target.value) || 0 }))} className="input-field" />
            </div>
          </div>
          <div className="bg-slate-50 rounded-xl px-4 py-3 text-sm flex justify-between">
            <span className="text-slate-500">= ${priceUsd} USD</span>
            <span className="text-slate-500">${perToken} per token</span>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.is_active ?? true} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} className="w-4 h-4 rounded" />
              <span className="text-sm text-slate-600">Active</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.is_popular ?? false} onChange={e => setForm(f => ({ ...f, is_popular: e.target.checked }))} className="w-4 h-4 rounded" />
              <span className="text-sm text-slate-600 flex items-center gap-1"><Star className="w-3 h-3 text-amber-500" /> Popular</span>
            </label>
          </div>
          <div className="flex gap-3 pt-2">
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

  return (
    <DashboardLayout navItems={adminNavItems} title="Token Packages" subtitle="Manage purchasable token bundles">
      {(editing || showCreate) && <PackageModal pkg={editing} onClose={() => { setEditing(null); setShowCreate(false); }} />}
      <div className="space-y-5">
        <div className="flex justify-end">
          <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> New Package
          </button>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => <div key={i} className="card h-40 animate-pulse" />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {packages.map(pkg => (
              <div key={pkg.id} className={`card p-5 relative flex flex-col gap-3 ${!pkg.is_active ? 'opacity-50' : ''} ${pkg.is_popular ? 'ring-2 ring-sky-400' : ''}`}>
                {pkg.is_popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="bg-sky-500 text-white text-xs font-bold px-3 py-0.5 rounded-full flex items-center gap-1"><Star className="w-3 h-3" /> Popular</span>
                  </div>
                )}
                <h3 className="font-bold text-slate-800">{pkg.name}</h3>
                <p className="text-xs text-slate-400 line-clamp-2">{pkg.description}</p>
                <div>
                  <p className="text-2xl font-bold text-slate-800">${(pkg.price_cents / 100).toFixed(2)}</p>
                  <p className="text-xs text-slate-400">{pkg.token_amount.toLocaleString()} tokens · ${(pkg.price_cents / pkg.token_amount / 100).toFixed(4)}/token</p>
                </div>
                <div className="flex items-center gap-2 mt-auto pt-2 border-t border-slate-100">
                  <button onClick={() => setEditing(pkg)} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button onClick={() => toggleActive.mutate({ id: pkg.id, is_active: !pkg.is_active })} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
                    {pkg.is_active ? <ToggleRight className="w-4 h-4 text-emerald-500" /> : <ToggleLeft className="w-4 h-4 text-slate-400" />}
                  </button>
                  <span className={`ml-auto text-xs px-2 py-0.5 rounded-full font-semibold ${pkg.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{pkg.is_active ? 'Active' : 'Hidden'}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="card p-5 bg-slate-50">
          <h3 className="font-semibold text-slate-700 mb-2 text-sm flex items-center gap-2"><Coins className="w-4 h-4 text-amber-500" /> Token Pricing Guide</h3>
          <p className="text-xs text-slate-500 leading-relaxed">
            1 token is approximately 1 AI generation credit. Tasks like <strong>course outlines</strong> cost 5 tokens,
            <strong> full curricula</strong> cost 20 tokens, and <strong>presentation slides</strong> cost 10 tokens.
            When Stripe is configured, organisations will purchase tokens via Stripe Checkout and their balance will be credited automatically.
          </p>
        </div>
      </div>
    </DashboardLayout>
  );
}
