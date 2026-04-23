import { useState, useEffect } from 'react';
import { Plus, Trash2, Tag, ToggleLeft, ToggleRight } from 'lucide-react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { adminNavItems } from './adminNav';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../contexts/ToastContext';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import Badge from '../../components/ui/Badge';
import { useAuth } from '../../contexts/AuthContext';
import type { PromoCode } from '../../types';

export default function AdminPromoCodes() {
  const [codes, setCodes] = useState<PromoCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<PromoCode | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ code: '', discount_percent: 10, expires_at: '', usage_limit: '' });
  const [creating, setCreating] = useState(false);
  const { profile } = useAuth();
  const { toast } = useToast();

  const fetchData = async () => {
    const { data } = await supabase.from('promo_codes').select('*').order('created_at', { ascending: false });
    if (data) setCodes(data as PromoCode[]);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.code) { toast.error('Code is required'); return; }
    setCreating(true);
    const payload = {
      code: form.code.toUpperCase().replace(/\s/g, ''),
      discount_percent: form.discount_percent,
      expires_at: form.expires_at || null,
      usage_limit: form.usage_limit ? parseInt(form.usage_limit) : null,
      created_by: profile?.id,
    };
    const { error } = await supabase.from('promo_codes').insert(payload);
    if (!error) {
      toast.success('Promo code created');
      setShowCreate(false);
      setForm({ code: '', discount_percent: 10, expires_at: '', usage_limit: '' });
      fetchData();
    } else {
      toast.error('Failed to create — code may already exist');
    }
    setCreating(false);
  };

  const handleToggle = async (code: PromoCode) => {
    await supabase.from('promo_codes').update({ is_active: !code.is_active }).eq('id', code.id);
    toast.success(`Code ${code.is_active ? 'deactivated' : 'activated'}`);
    fetchData();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await supabase.from('promo_codes').delete().eq('id', deleteTarget.id);
    toast.success('Promo code deleted');
    setDeleteTarget(null);
    fetchData();
  };

  return (
    <DashboardLayout navItems={adminNavItems} title="Promo Codes" subtitle="Manage discount codes for courses">
      <div className="space-y-5">
        <div className="flex justify-end">
          <button onClick={() => setShowCreate(true)} className="btn-primary text-sm py-2 flex items-center gap-2">
            <Plus className="w-4 h-4" /> Create Code
          </button>
        </div>

        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 dark:bg-navy-700/50 border-b border-gray-100 dark:border-navy-700">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Code</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Discount</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase hidden md:table-cell">Usage</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase hidden lg:table-cell">Expires</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Status</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-navy-700">
                {loading ? Array.from({ length: 3 }).map((_, i) => <tr key={i}>{[1,2,3,4,5,6].map(j => <td key={j} className="px-4 py-3"><div className="h-4 bg-gray-200 dark:bg-navy-700 rounded animate-pulse" /></td>)}</tr>) :
                codes.map(code => (
                  <tr key={code.id} className="hover:bg-gray-50 dark:hover:bg-navy-700/30 transition-colors">
                    <td className="px-4 py-3">
                      <span className="font-mono font-bold text-gold-600 dark:text-gold-400">{code.code}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-semibold text-gray-900 dark:text-white">{code.discount_percent}% off</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 hidden md:table-cell">
                      {code.usage_count}{code.usage_limit ? ` / ${code.usage_limit}` : ''} uses
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 hidden lg:table-cell">
                      {code.expires_at ? new Date(code.expires_at).toLocaleDateString('en-AU') : 'No expiry'}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={code.is_active ? 'success' : 'error'}>{code.is_active ? 'Active' : 'Inactive'}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => handleToggle(code)} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-navy-700 transition-colors">
                          {code.is_active ? <ToggleRight className="w-4 h-4 text-green-500" /> : <ToggleLeft className="w-4 h-4" />}
                        </button>
                        <button onClick={() => setDeleteTarget(code)} className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!loading && codes.length === 0 && (
              <div className="text-center py-12">
                <Tag className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                <p className="text-gray-500 dark:text-gray-400 text-sm">No promo codes yet</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowCreate(false)} />
          <div className="relative bg-white dark:bg-navy-800 rounded-2xl shadow-2xl w-full max-w-md p-6 animate-slide-up">
            <h3 className="font-playfair text-xl font-bold text-gray-900 dark:text-white mb-5">Create Promo Code</h3>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Code</label>
                <input type="text" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase().replace(/\s/g, '') }))} className="input-field font-mono uppercase" placeholder="SUMMER20" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Discount (%)</label>
                <input type="number" min="1" max="100" value={form.discount_percent} onChange={e => setForm(f => ({ ...f, discount_percent: parseInt(e.target.value) }))} className="input-field" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Expiry Date (optional)</label>
                <input type="date" value={form.expires_at} onChange={e => setForm(f => ({ ...f, expires_at: e.target.value }))} className="input-field" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Usage Limit (optional)</label>
                <input type="number" min="1" value={form.usage_limit} onChange={e => setForm(f => ({ ...f, usage_limit: e.target.value }))} className="input-field" placeholder="Unlimited" />
              </div>
              <div className="flex gap-3 justify-end pt-2">
                <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm border border-gray-200 dark:border-navy-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-navy-700 transition-colors">Cancel</button>
                <button type="submit" disabled={creating} className="btn-primary text-sm py-2 disabled:opacity-60">{creating ? 'Creating...' : 'Create'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog isOpen={!!deleteTarget} title="Delete Promo Code" message={`Delete the code "${deleteTarget?.code}"? This cannot be undone.`} onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} confirmText="Delete" />
    </DashboardLayout>
  );
}
