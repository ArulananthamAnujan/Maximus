import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, Plus, Trash2, Search, Mail, UserCheck, UserX, X } from 'lucide-react';
import { toast } from 'sonner';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { orgNavItems } from './orgNav';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import type { OrgMember } from '../../types';

interface MemberWithProfile extends Omit<OrgMember, 'profile'> {
  profile: { id: string; full_name: string; email: string; avatar_url: string | null; is_active: boolean };
}

function InviteModal({ orgId, onClose }: { orgId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    // Find user by email
    const { data: profile } = await supabase.from('profiles').select('id, role').eq('email', email.trim()).maybeSingle();
    if (!profile) { toast.error('No user found with that email. Ask them to register first.'); setSaving(false); return; }
    if (profile.role === 'student') {
      // promote to teacher
      await supabase.from('profiles').update({ role: 'teacher' }).eq('id', profile.id);
    }
    const { error } = await supabase.from('org_members').insert({ org_id: orgId, user_id: profile.id, role: 'teacher' });
    if (error) { toast.error(error.message.includes('unique') ? 'This person is already a member.' : error.message); }
    else { toast.success('Teacher added to organisation'); qc.invalidateQueries({ queryKey: ['org-members'] }); onClose(); }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-800">Add Teacher</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 transition-colors"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={invite} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Teacher Email</label>
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
              className="input-field" placeholder="teacher@company.com" />
            <p className="text-xs text-slate-400 mt-1.5">The user must already have an account. They will be promoted to teacher role.</p>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary flex-1">{saving ? 'Adding...' : 'Add Teacher'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function OrgTeachers() {
  const { orgMembership } = useAuth();
  const orgId = (orgMembership?.organization as { id?: string })?.id ?? orgMembership?.org_id;
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [showInvite, setShowInvite] = useState(false);

  const { data: members = [], isLoading } = useQuery({
    queryKey: ['org-members', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase
        .from('org_members')
        .select('*, profile:profiles(id, full_name, email, avatar_url, is_active)')
        .eq('org_id', orgId!)
        .order('joined_at', { ascending: false });
      return (data ?? []) as MemberWithProfile[];
    },
  });

  const removeMember = useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await supabase.from('org_members').delete().eq('id', memberId);
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Teacher removed'); qc.invalidateQueries({ queryKey: ['org-members'] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = members.filter(m =>
    m.profile.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    m.profile.email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <DashboardLayout navItems={orgNavItems} title="Teachers" subtitle="Manage your organisation's teachers">
      {showInvite && orgId && <InviteModal orgId={orgId} onClose={() => setShowInvite(false)} />}
      <div className="space-y-5">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input type="text" placeholder="Search teachers..." value={search} onChange={e => setSearch(e.target.value)} className="input-field pl-9" />
          </div>
          <button onClick={() => setShowInvite(true)} className="btn-primary flex items-center gap-2 shrink-0">
            <Plus className="w-4 h-4" /> Add Teacher
          </button>
        </div>

        {isLoading ? (
          <div className="space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="card p-4 animate-pulse h-16" />)}</div>
        ) : filtered.length === 0 ? (
          <div className="card p-12 text-center">
            <Users className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">No teachers yet</p>
            <p className="text-sm text-slate-400 mt-1">Add teachers so they can build courses with AI.</p>
          </div>
        ) : (
          <div className="card divide-y divide-slate-100">
            {filtered.map(m => (
              <div key={m.id} className="flex items-center gap-4 p-4">
                <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-bold text-sm shrink-0">
                  {m.profile.full_name?.[0]?.toUpperCase() ?? m.profile.email[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{m.profile.full_name || '—'}</p>
                  <p className="text-xs text-slate-400 flex items-center gap-1 truncate"><Mail className="w-3 h-3" />{m.profile.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${m.role === 'owner' ? 'bg-amber-100 text-amber-700' : 'bg-sky-100 text-sky-700'}`}>
                    {m.role === 'owner' ? <UserCheck className="w-3 h-3" /> : <UserX className="w-3 h-3" />}
                    {m.role}
                  </span>
                  {m.role !== 'owner' && (
                    <button onClick={() => { if (confirm('Remove this teacher?')) removeMember.mutate(m.id); }}
                      className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
