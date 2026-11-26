import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Building2, Plus, Search, Coins, ToggleLeft, ToggleRight, X, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { adminNavItems } from './adminNav';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import type { Organization } from '../../types';

interface OrgWithStats extends Organization {
  member_count?: number;
  course_count?: number;
}

function CreateOrgModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: '', slug: '', website: '', description: '', plan_tier: 'professional', initial_tokens: 500 });
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [ownerPassword, setOwnerPassword] = useState('');
  const [newUserMode, setNewUserMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const { session } = useAuth();

  const resolveOrCreateOwner = async (): Promise<{ id: string } | null> => {
    // First try to find an existing profile
    const { data: existing } = await supabase
      .from('profiles')
      .select('id, role')
      .eq('email', ownerEmail.trim().toLowerCase())
      .maybeSingle();

    if (existing) return existing;

    if (!newUserMode) {
      toast.error(
        'No account found with that email. Toggle "Create new account" to create one on the spot.',
        { duration: 6000 }
      );
      return null;
    }

    // Create a new user via the admin-create-user edge function
    if (!ownerName.trim() || !ownerPassword.trim()) {
      toast.error('Full name and password are required to create a new account.');
      return null;
    }
    if (ownerPassword.length < 8) {
      toast.error('Password must be at least 8 characters.');
      return null;
    }

    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-create-user`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ email: ownerEmail.trim().toLowerCase(), password: ownerPassword, full_name: ownerName.trim(), role: 'org_admin' }),
      }
    );
    const json = await res.json();
    if (!res.ok || json.error) {
      toast.error(json.error ?? 'Failed to create user account.');
      return null;
    }
    return { id: json.user.id };
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const ownerProfile = await resolveOrCreateOwner();
      if (!ownerProfile) { setSaving(false); return; }

      // Create org
      const { data: org, error: orgErr } = await supabase.from('organizations').insert({
        name: form.name, slug: form.slug, website: form.website || null,
        description: form.description || null, plan_tier: form.plan_tier,
        token_balance: form.initial_tokens, created_by: ownerProfile.id,
      }).select().maybeSingle();
      if (orgErr) { toast.error(orgErr.message); setSaving(false); return; }

      // Ensure owner has org_admin role
      await supabase.from('profiles').update({ role: 'org_admin' }).eq('id', ownerProfile.id);

      // Add as owner member
      await supabase.from('org_members').insert({ org_id: org.id, user_id: ownerProfile.id, role: 'owner' });

      // Log initial token grant if > 0
      if (form.initial_tokens > 0) {
        await supabase.from('token_purchases').insert({
          org_id: org.id, token_amount: form.initial_tokens, amount_paid_cents: 0,
          status: 'completed', notes: 'Initial token allocation by admin', purchased_by: ownerProfile.id, completed_at: new Date().toISOString(),
        });
      }

      toast.success('Organisation created successfully');
      qc.invalidateQueries({ queryKey: ['admin-orgs'] });
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create organisation');
    }
    setSaving(false);
  };

  const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-slate-100 sticky top-0 bg-white">
          <h2 className="text-lg font-bold text-slate-800">Create Organisation</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={create} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Organisation Name *</label>
            <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value, slug: slugify(e.target.value) }))} className="input-field" placeholder="Acme Corp Training" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Slug *</label>
            <input required value={form.slug} onChange={e => setForm(f => ({ ...f, slug: slugify(e.target.value) }))} className="input-field font-mono text-sm" placeholder="acme-corp-training" />
          </div>

          {/* Owner section */}
          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-200">
              <p className="text-xs font-semibold text-slate-600">Organisation Admin (Owner)</p>
              <label className="flex items-center gap-2 cursor-pointer">
                <span className="text-xs text-slate-500">Create new account</span>
                <button
                  type="button"
                  onClick={() => setNewUserMode(v => !v)}
                  className={`relative w-9 h-5 rounded-full transition-colors ${newUserMode ? 'bg-sky-500' : 'bg-slate-300'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${newUserMode ? 'translate-x-4' : 'translate-x-0'}`} />
                </button>
              </label>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">
                  Owner Email *
                  {!newUserMode && <span className="font-normal text-slate-400 ml-1">— must already have an account, or toggle to create one</span>}
                </label>
                <input
                  required
                  type="email"
                  value={ownerEmail}
                  onChange={e => setOwnerEmail(e.target.value)}
                  className="input-field"
                  placeholder="owner@company.com"
                />
              </div>
              {newUserMode && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5">Full Name *</label>
                    <input
                      required={newUserMode}
                      type="text"
                      value={ownerName}
                      onChange={e => setOwnerName(e.target.value)}
                      className="input-field"
                      placeholder="Jane Smith"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5">Temporary Password *</label>
                    <input
                      required={newUserMode}
                      type="password"
                      value={ownerPassword}
                      onChange={e => setOwnerPassword(e.target.value)}
                      className="input-field"
                      placeholder="Min. 8 characters"
                    />
                    <p className="text-xs text-slate-400 mt-1">The admin will use this to log in. Ask them to change it after first sign-in.</p>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">Plan Tier</label>
              <select value={form.plan_tier} onChange={e => setForm(f => ({ ...f, plan_tier: e.target.value }))} className="input-field">
                <option value="starter">Starter</option>
                <option value="professional">Professional</option>
                <option value="growth">Growth</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5">Initial Tokens</label>
              <input type="number" min="0" value={form.initial_tokens} onChange={e => setForm(f => ({ ...f, initial_tokens: parseInt(e.target.value) || 0 }))} className="input-field" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Website</label>
            <input type="url" value={form.website} onChange={e => setForm(f => ({ ...f, website: e.target.value }))} className="input-field" placeholder="https://..." />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Description</label>
            <textarea rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="input-field resize-none" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary flex-1">{saving ? 'Creating...' : 'Create Organisation'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function AdminOrganizations() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const { data: orgs = [], isLoading } = useQuery({
    queryKey: ['admin-orgs'],
    queryFn: async () => {
      const { data } = await supabase.from('organizations').select('*').order('created_at', { ascending: false });
      return (data ?? []) as OrgWithStats[];
    },
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from('organizations').update({ is_active }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-orgs'] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = orgs.filter(o => o.name.toLowerCase().includes(search.toLowerCase()) || o.slug.toLowerCase().includes(search.toLowerCase()));

  const tierColor = (tier: string) => tier === 'enterprise' ? 'bg-amber-100 text-amber-700' : tier === 'growth' ? 'bg-sky-100 text-sky-700' : 'bg-slate-100 text-slate-600';

  return (
    <DashboardLayout navItems={adminNavItems} title="Organisations" subtitle="Manage all client organisations">
      {showCreate && <CreateOrgModal onClose={() => setShowCreate(false)} />}
      <div className="space-y-5">
        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="card p-4 flex items-center gap-3">
            <div className="w-10 h-10 bg-sky-100 rounded-xl flex items-center justify-center"><Building2 className="w-5 h-5 text-sky-600" /></div>
            <div><p className="text-xl font-bold text-slate-800">{orgs.length}</p><p className="text-xs text-slate-500">Total Organisations</p></div>
          </div>
          <div className="card p-4 flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center"><ToggleRight className="w-5 h-5 text-emerald-600" /></div>
            <div><p className="text-xl font-bold text-slate-800">{orgs.filter(o => o.is_active).length}</p><p className="text-xs text-slate-500">Active</p></div>
          </div>
          <div className="card p-4 flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center"><Coins className="w-5 h-5 text-amber-600" /></div>
            <div><p className="text-xl font-bold text-slate-800">{orgs.reduce((s, o) => s + (o.token_balance ?? 0), 0).toLocaleString()}</p><p className="text-xs text-slate-500">Total Tokens Held</p></div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input type="text" placeholder="Search organisations..." value={search} onChange={e => setSearch(e.target.value)} className="input-field pl-9" />
          </div>
          <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2 shrink-0">
            <Plus className="w-4 h-4" /> New Organisation
          </button>
        </div>

        {isLoading ? (
          <div className="space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="card p-5 h-20 animate-pulse" />)}</div>
        ) : filtered.length === 0 ? (
          <div className="card p-12 text-center">
            <Building2 className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">No organisations yet</p>
            <p className="text-sm text-slate-400 mt-1">Create your first client organisation to get started.</p>
          </div>
        ) : (
          <div className="card divide-y divide-slate-100">
            {filtered.map(org => (
              <div key={org.id} className="flex items-center gap-4 p-4 hover:bg-slate-50 transition-colors">
                <div className="w-10 h-10 bg-gradient-to-br from-sky-100 to-teal-100 rounded-xl flex items-center justify-center shrink-0">
                  {org.logo_url ? <img src={org.logo_url} className="w-8 h-8 rounded-lg object-cover" alt="" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} /> : <Building2 className="w-5 h-5 text-teal-500" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-slate-800 text-sm">{org.name}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold capitalize ${tierColor(org.plan_tier)}`}>{org.plan_tier}</span>
                    {!org.is_active && <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-600 font-semibold">Inactive</span>}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">/{org.slug}</p>
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  <div className="text-right hidden sm:block">
                    <p className="text-sm font-bold text-emerald-600">{org.token_balance.toLocaleString()}</p>
                    <p className="text-xs text-slate-400">tokens</p>
                  </div>
                  <button onClick={() => toggleActive.mutate({ id: org.id, is_active: !org.is_active })} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors text-slate-400">
                    {org.is_active ? <ToggleRight className="w-5 h-5 text-emerald-500" /> : <ToggleLeft className="w-5 h-5" />}
                  </button>
                  <Link to={`/admin/organizations/${org.id}`} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors text-slate-400 hover:text-slate-600">
                    <ChevronRight className="w-5 h-5" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
