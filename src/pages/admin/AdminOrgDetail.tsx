import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Building2, Coins, Users, BookOpen, ArrowLeft, Plus, Trash2,
  TrendingDown, CheckCircle, Send, AlertTriangle, GraduationCap, Save, Sparkles
} from 'lucide-react';
import { toast } from 'sonner';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { adminNavItems } from './adminNav';
import { supabase } from '../../lib/supabase';
import type { Organization, OrgMember, TokenPurchase, TokenUsageLog, OrgPlanTier, OrgFeatureFlags } from '../../types';
import { PLAN_FEATURES } from '../../types';

const FEATURE_LABELS: { key: keyof OrgFeatureFlags; label: string; desc: string }[] = [
  { key: 'ai_course_outline',   label: 'AI Course Outline',    desc: 'Generate course structures with AI' },
  { key: 'ai_lesson_content',   label: 'AI Lesson Content',    desc: 'Generate lesson text and notes' },
  { key: 'ai_quiz_generation',  label: 'AI Quiz Generation',   desc: 'Auto-generate quizzes from content' },
  { key: 'ai_flashcards',       label: 'AI Flashcards',        desc: 'Create flashcard sets automatically' },
  { key: 'ai_full_curriculum',  label: 'Full Curriculum AI',   desc: 'Generate complete multi-course curricula' },
  { key: 'ai_presentations',    label: 'AI Presentations',     desc: 'Create presentation slide decks' },
  { key: 'ai_exams',            label: 'AI Exam Generation',   desc: 'Generate formal exams and assessments' },
  { key: 'student_ai_access',   label: 'Student AI Access',    desc: 'Allow students to use AI tools' },
];

interface MemberWithProfile extends OrgMember {
  profile: { id: string; full_name: string; email: string };
}

function GrantTokensPanel({ org, onDone }: { org: Organization; onDone: () => void }) {
  const [amount, setAmount] = useState(500);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const grant = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase.rpc('grant_org_tokens', {
      p_org_id: org.id,
      p_tokens: amount,
      p_notes: notes || null,
    });
    if (error) toast.error(error.message);
    else { toast.success(`${amount} tokens granted to ${org.name}`); onDone(); }
    setSaving(false);
  };

  return (
    <form onSubmit={grant} className="card p-5 border-2 border-emerald-100">
      <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2"><Coins className="w-4 h-4 text-emerald-600" /> Grant Tokens</h3>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Token Amount</label>
          <input type="number" min="1" required value={amount} onChange={e => setAmount(parseInt(e.target.value) || 0)} className="input-field" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Current Balance</label>
          <div className="input-field bg-slate-50 text-emerald-600 font-bold">{org.token_balance.toLocaleString()}</div>
        </div>
      </div>
      <div className="mb-3">
        <label className="block text-xs font-semibold text-slate-500 mb-1">Notes (optional)</label>
        <input type="text" value={notes} onChange={e => setNotes(e.target.value)} className="input-field" placeholder="e.g. Monthly allocation" />
      </div>
      <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2 w-full justify-center">
        <Send className="w-4 h-4" />{saving ? 'Granting...' : `Grant ${amount.toLocaleString()} Tokens`}
      </button>
    </form>
  );
}

export default function AdminOrgDetail() {
  const { orgId } = useParams<{ orgId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [addMemberEmail, setAddMemberEmail] = useState('');
  const [addingMember, setAddingMember] = useState(false);
  const [planTier, setPlanTier] = useState<OrgPlanTier>('starter');
  const [featureFlags, setFeatureFlags] = useState<OrgFeatureFlags>(PLAN_FEATURES.starter);
  const [savingPlan, setSavingPlan] = useState(false);

  const { data: org, isLoading } = useQuery({
    queryKey: ['admin-org', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase.from('organizations').select('*').eq('id', orgId!).maybeSingle();
      return data as Organization | null;
    },
  });

  useEffect(() => {
    if (org) {
      setPlanTier(org.plan_tier ?? 'starter');
      setFeatureFlags(org.feature_flags ?? PLAN_FEATURES.starter);
    }
  }, [org]);

  const applyPlanPreset = (tier: OrgPlanTier) => {
    setPlanTier(tier);
    setFeatureFlags({ ...PLAN_FEATURES[tier] });
  };

  const savePlan = async () => {
    if (!orgId) return;
    setSavingPlan(true);
    const { error } = await supabase.from('organizations').update({
      plan_tier: planTier,
      feature_flags: featureFlags,
      updated_at: new Date().toISOString(),
    }).eq('id', orgId);
    if (error) toast.error(error.message);
    else { toast.success('Plan and features updated'); qc.invalidateQueries({ queryKey: ['admin-org', orgId] }); }
    setSavingPlan(false);
  };

  const { data: members = [] } = useQuery({
    queryKey: ['admin-org-members', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase.from('org_members').select('*, profile:profiles(id, full_name, email)').eq('org_id', orgId!).order('joined_at');
      return (data ?? []) as MemberWithProfile[];
    },
  });

  const { data: studentCount = 0 } = useQuery({
    queryKey: ['admin-org-student-count', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { count } = await supabase.from('org_students').select('*', { count: 'exact', head: true }).eq('org_id', orgId!).eq('is_active', true);
      return count ?? 0;
    },
  });

  const { data: purchases = [] } = useQuery({
    queryKey: ['admin-org-purchases', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase.from('token_purchases').select('*').eq('org_id', orgId!).order('created_at', { ascending: false }).limit(15);
      return (data ?? []) as TokenPurchase[];
    },
  });

  const { data: usageLogs = [] } = useQuery({
    queryKey: ['admin-org-usage', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase.from('token_usage_log').select('*, profile:profiles(full_name, email)').eq('org_id', orgId!).order('created_at', { ascending: false }).limit(20);
      return (data ?? []) as (TokenUsageLog & { profile: { full_name: string; email: string } | null })[];
    },
  });

  const { data: courseCount = 0 } = useQuery({
    queryKey: ['admin-org-courses', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { count } = await supabase.from('courses').select('*', { count: 'exact', head: true }).eq('org_id', orgId!);
      return count ?? 0;
    },
  });

  const removeMember = useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await supabase.from('org_members').delete().eq('id', memberId);
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Member removed'); qc.invalidateQueries({ queryKey: ['admin-org-members', orgId] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const addMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId) return;
    setAddingMember(true);
    const { data: profile } = await supabase.from('profiles').select('id, role').eq('email', addMemberEmail.trim()).maybeSingle();
    if (!profile) { toast.error('User not found'); setAddingMember(false); return; }
    if (profile.role === 'student') await supabase.from('profiles').update({ role: 'teacher' }).eq('id', profile.id);
    const { error } = await supabase.from('org_members').insert({ org_id: orgId, user_id: profile.id, role: 'teacher' });
    if (error) toast.error(error.message.includes('unique') ? 'Already a member' : error.message);
    else { toast.success('Teacher added'); qc.invalidateQueries({ queryKey: ['admin-org-members', orgId] }); setAddMemberEmail(''); }
    setAddingMember(false);
  };

  const totalUsed = usageLogs.reduce((s, l) => s + l.tokens_deducted, 0);

  if (isLoading) return <DashboardLayout navItems={adminNavItems} title="Organisation"><div className="animate-pulse h-32 card" /></DashboardLayout>;
  if (!org) return <DashboardLayout navItems={adminNavItems} title="Organisation"><div className="card p-8 text-center text-slate-400">Organisation not found</div></DashboardLayout>;

  return (
    <DashboardLayout navItems={adminNavItems} title={org.name} subtitle="Organisation detail">
      <div className="space-y-6">
        <button onClick={() => navigate('/admin/organizations')} className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Organisations
        </button>

        {/* Stats row */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="card p-4 flex items-center gap-3">
            <div className="w-9 h-9 bg-emerald-100 rounded-xl flex items-center justify-center"><Coins className="w-4 h-4 text-emerald-600" /></div>
            <div><p className="text-lg font-bold text-emerald-600">{org.token_balance.toLocaleString()}</p><p className="text-xs text-slate-400">Tokens</p></div>
          </div>
          <div className="card p-4 flex items-center gap-3">
            <div className="w-9 h-9 bg-sky-100 rounded-xl flex items-center justify-center"><Users className="w-4 h-4 text-sky-600" /></div>
            <div><p className="text-lg font-bold text-slate-800">{members.length}</p><p className="text-xs text-slate-400">Teachers</p></div>
          </div>
          <div className="card p-4 flex items-center gap-3">
            <div className="w-9 h-9 bg-amber-100 rounded-xl flex items-center justify-center"><GraduationCap className="w-4 h-4 text-amber-600" /></div>
            <div><p className="text-lg font-bold text-slate-800">{studentCount}</p><p className="text-xs text-slate-400">Students</p></div>
          </div>
          <div className="card p-4 flex items-center gap-3">
            <div className="w-9 h-9 bg-violet-100 rounded-xl flex items-center justify-center"><BookOpen className="w-4 h-4 text-violet-600" /></div>
            <div><p className="text-lg font-bold text-slate-800">{courseCount}</p><p className="text-xs text-slate-400">Courses</p></div>
          </div>
          <div className="card p-4 flex items-center gap-3">
            <div className="w-9 h-9 bg-rose-100 rounded-xl flex items-center justify-center"><TrendingDown className="w-4 h-4 text-rose-600" /></div>
            <div><p className="text-lg font-bold text-slate-800">{totalUsed.toLocaleString()}</p><p className="text-xs text-slate-400">Used (Recent)</p></div>
          </div>
        </div>

        {/* Plan + Feature Flags */}
        <div className="card p-5">
          <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-sky-500" /> Plan & AI Feature Access
          </h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Plan Tier</label>
                <div className="flex gap-2 flex-wrap">
                  {(['starter','professional','growth','enterprise'] as OrgPlanTier[]).map(t => (
                    <button
                      key={t}
                      onClick={() => applyPlanPreset(t)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all capitalize ${planTier === t ? 'bg-sky-500 text-white border-sky-500' : 'bg-white text-slate-600 border-slate-200 hover:border-sky-300'}`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-slate-400 mt-1">Selecting a tier auto-fills the feature flags. You can then customise individually.</p>
              </div>
              <button onClick={savePlan} disabled={savingPlan} className="btn-primary flex items-center gap-2">
                <Save className="w-4 h-4" />{savingPlan ? 'Saving...' : 'Save Plan & Features'}
              </button>
            </div>
            <div className="space-y-2">
              {FEATURE_LABELS.map(({ key, label, desc }) => (
                <label key={key} className="flex items-start gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={featureFlags[key] ?? false}
                    onChange={e => setFeatureFlags(f => ({ ...f, [key]: e.target.checked }))}
                    className="w-4 h-4 rounded mt-0.5 shrink-0"
                  />
                  <div>
                    <p className="text-sm font-medium text-slate-700 group-hover:text-slate-900">{label}</p>
                    <p className="text-xs text-slate-400">{desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Low balance warning */}
        {org.token_balance < 100 && (
          <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
            <span className="text-amber-800">Low token balance. Grant more tokens to keep AI generation available.</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Grant tokens */}
          <GrantTokensPanel org={org} onDone={() => { qc.invalidateQueries({ queryKey: ['admin-org', orgId] }); qc.invalidateQueries({ queryKey: ['admin-org-purchases', orgId] }); }} />

          {/* Members */}
          <div className="card p-5">
            <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2"><Users className="w-4 h-4 text-sky-600" /> Members</h3>
            <form onSubmit={addMember} className="flex gap-2 mb-4">
              <input type="email" required value={addMemberEmail} onChange={e => setAddMemberEmail(e.target.value)} className="input-field flex-1 text-sm" placeholder="teacher@email.com" />
              <button type="submit" disabled={addingMember} className="btn-primary shrink-0 flex items-center gap-1 px-3 text-sm">
                <Plus className="w-3.5 h-3.5" />{addingMember ? '...' : 'Add'}
              </button>
            </form>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {members.length === 0 ? <p className="text-sm text-slate-400 text-center py-4">No members</p> : members.map(m => (
                <div key={m.id} className="flex items-center gap-3 py-1.5">
                  <div className="w-7 h-7 bg-slate-200 rounded-full flex items-center justify-center text-xs font-bold text-slate-600 shrink-0">
                    {m.profile.full_name?.[0]?.toUpperCase() ?? '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-700 truncate">{m.profile.full_name || m.profile.email}</p>
                    <p className="text-xs text-slate-400">{m.role}</p>
                  </div>
                  {m.role !== 'owner' && (
                    <button onClick={() => removeMember.mutate(m.id)} className="p-1 hover:bg-red-50 rounded text-slate-400 hover:text-red-500">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Purchase history */}
        <div className="card p-5">
          <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2"><Coins className="w-4 h-4 text-amber-500" /> Token Purchase History</h3>
          {purchases.length === 0 ? <p className="text-sm text-slate-400 text-center py-6">No purchases</p> : (
            <div className="divide-y divide-slate-100">
              {purchases.map(p => (
                <div key={p.id} className="flex items-center gap-3 py-2.5">
                  <CheckCircle className={`w-4 h-4 shrink-0 ${p.status === 'completed' ? 'text-emerald-500' : 'text-slate-300'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-700">+{p.token_amount.toLocaleString()} tokens</p>
                    <p className="text-xs text-slate-400">{p.notes ?? '—'}</p>
                  </div>
                  <div className="text-right text-xs shrink-0">
                    <p className="font-semibold">{p.amount_paid_cents === 0 ? 'Free / Admin' : `$${(p.amount_paid_cents / 100).toFixed(2)}`}</p>
                    <p className="text-slate-400">{new Date(p.created_at).toLocaleDateString()}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Usage log */}
        <div className="card p-5">
          <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2"><TrendingDown className="w-4 h-4 text-rose-500" /> Token Usage Log</h3>
          {usageLogs.length === 0 ? <p className="text-sm text-slate-400 text-center py-6">No usage yet</p> : (
            <div className="divide-y divide-slate-100">
              {usageLogs.map(l => (
                <div key={l.id} className="flex items-center gap-3 py-2.5">
                  <div className="w-7 h-7 bg-rose-50 rounded-full flex items-center justify-center shrink-0">
                    <TrendingDown className="w-3.5 h-3.5 text-rose-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-700">{l.ai_task.replace(/_/g, ' ')}</p>
                    <p className="text-xs text-slate-400">{l.profile?.full_name ?? l.profile?.email ?? '—'}</p>
                  </div>
                  <div className="text-right text-xs shrink-0">
                    <p className="font-bold text-rose-600">−{l.tokens_deducted}</p>
                    <p className="text-slate-400">{new Date(l.created_at).toLocaleDateString()}</p>
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
