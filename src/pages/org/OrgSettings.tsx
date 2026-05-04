import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Settings, Save, Building2, Globe, FileText } from 'lucide-react';
import { toast } from 'sonner';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { orgNavItems } from './orgNav';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

export default function OrgSettings() {
  const { orgMembership } = useAuth();
  const orgId = (orgMembership?.organization as { id?: string })?.id ?? orgMembership?.org_id;
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', website: '', description: '', logo_url: '' });

  const { data: org } = useQuery({
    queryKey: ['org-detail', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase.from('organizations').select('*').eq('id', orgId!).maybeSingle();
      return data;
    },
  });

  useEffect(() => {
    if (org) setForm({ name: org.name ?? '', website: org.website ?? '', description: org.description ?? '', logo_url: org.logo_url ?? '' });
  }, [org]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId) return;
    setSaving(true);
    const { error } = await supabase.from('organizations').update({ name: form.name, website: form.website || null, description: form.description || null, logo_url: form.logo_url || null, updated_at: new Date().toISOString() }).eq('id', orgId);
    if (error) toast.error(error.message);
    else { toast.success('Settings saved'); qc.invalidateQueries({ queryKey: ['org-detail'] }); }
    setSaving(false);
  };

  return (
    <DashboardLayout navItems={orgNavItems} title="Organisation Settings" subtitle="Manage your organisation profile">
      <div className="max-w-2xl">
        <form onSubmit={save} className="card p-6 space-y-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center">
              <Settings className="w-5 h-5 text-slate-500" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-800">Organisation Profile</h3>
              <p className="text-xs text-slate-400">Visible to your teachers and admin</p>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5 flex items-center gap-1"><Building2 className="w-3 h-3" /> Organisation Name</label>
            <input type="text" required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="input-field" placeholder="Acme Corp Training" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5 flex items-center gap-1"><Globe className="w-3 h-3" /> Website</label>
            <input type="url" value={form.website} onChange={e => setForm(f => ({ ...f, website: e.target.value }))} className="input-field" placeholder="https://yourcompany.com" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5 flex items-center gap-1"><FileText className="w-3 h-3" /> Description</label>
            <textarea rows={3} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="input-field resize-none" placeholder="Brief description of your organisation..." />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Logo URL</label>
            <input type="url" value={form.logo_url} onChange={e => setForm(f => ({ ...f, logo_url: e.target.value }))} className="input-field" placeholder="https://..." />
            {form.logo_url && <img src={form.logo_url} alt="Logo preview" className="mt-2 h-12 rounded-lg border border-slate-200 object-contain" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />}
          </div>

          <div className="pt-2">
            <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2">
              <Save className="w-4 h-4" />{saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>

        {/* Read-only plan info */}
        <div className="card p-6 mt-4">
          <h3 className="font-semibold text-slate-800 mb-3 text-sm">Plan Information</h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm py-1.5 border-b border-slate-50">
              <span className="text-slate-500">Plan Tier</span>
              <span className="font-semibold capitalize text-slate-700">{org?.plan_tier ?? '—'}</span>
            </div>
            <div className="flex items-center justify-between text-sm py-1.5 border-b border-slate-50">
              <span className="text-slate-500">Token Balance</span>
              <span className="font-bold text-emerald-600">{(org?.token_balance ?? 0).toLocaleString()} tokens</span>
            </div>
            <div className="flex items-center justify-between text-sm py-1.5">
              <span className="text-slate-500">Organisation Slug</span>
              <code className="text-xs bg-slate-100 px-2 py-0.5 rounded">{org?.slug ?? '—'}</code>
            </div>
          </div>
          <p className="text-xs text-slate-400 mt-3">To change your plan or slug, contact your administrator.</p>
        </div>
      </div>
    </DashboardLayout>
  );
}
