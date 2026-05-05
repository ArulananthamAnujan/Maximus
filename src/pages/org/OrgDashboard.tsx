import { useQuery } from '@tanstack/react-query';
import { LayoutDashboard, Users, BookOpen, Coins, TrendingUp, AlertTriangle, Sparkles, ArrowRight, GraduationCap, Check } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PLAN_FEATURES } from '../../types';
import type { OrgPlanTier, OrgFeatureFlags } from '../../types';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { orgNavItems } from './orgNav';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

function StatCard({ icon: Icon, label, value, sub, color, href }: {
  icon: typeof LayoutDashboard; label: string; value: string | number;
  sub?: string; color: string; href?: string;
}) {
  const inner = (
    <div className={`card p-5 flex items-start gap-4 ${href ? 'hover:shadow-md transition-shadow cursor-pointer' : ''}`}>
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-2xl font-bold text-slate-800">{value}</p>
        <p className="text-sm text-slate-500 mt-0.5">{label}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
      {href && <ArrowRight className="w-4 h-4 text-slate-300 shrink-0 mt-1" />}
    </div>
  );
  return href ? <Link to={href}>{inner}</Link> : <div>{inner}</div>;
}

export default function OrgDashboard() {
  const { orgMembership } = useAuth();
  const orgId = (orgMembership?.organization as { id?: string })?.id ?? orgMembership?.org_id;

  const { data: org } = useQuery({
    queryKey: ['org-detail', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase.from('organizations').select('*').eq('id', orgId!).maybeSingle();
      return data;
    },
  });

  const { data: memberCount = 0 } = useQuery({
    queryKey: ['org-member-count', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { count } = await supabase.from('org_members').select('*', { count: 'exact', head: true }).eq('org_id', orgId!);
      return count ?? 0;
    },
  });

  const { data: studentCount = 0 } = useQuery({
    queryKey: ['org-student-count', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { count } = await supabase.from('org_students').select('*', { count: 'exact', head: true }).eq('org_id', orgId!).eq('is_active', true);
      return count ?? 0;
    },
  });

  const { data: courseCount = 0 } = useQuery({
    queryKey: ['org-course-count', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { count } = await supabase.from('courses').select('*', { count: 'exact', head: true }).eq('org_id', orgId!);
      return count ?? 0;
    },
  });

  const { data: recentUsage = [] } = useQuery({
    queryKey: ['org-recent-usage', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase
        .from('token_usage_log')
        .select('*, profile:profiles(full_name, email)')
        .eq('org_id', orgId!)
        .order('created_at', { ascending: false })
        .limit(6);
      return data ?? [];
    },
  });

  const { data: usageThisMonth = 0 } = useQuery({
    queryKey: ['org-usage-month', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const start = new Date(); start.setDate(1); start.setHours(0,0,0,0);
      const { data } = await supabase
        .from('token_usage_log')
        .select('tokens_deducted')
        .eq('org_id', orgId!)
        .gte('created_at', start.toISOString());
      return (data ?? []).reduce((s: number, r: { tokens_deducted: number }) => s + r.tokens_deducted, 0);
    },
  });

  const tokenBalance = org?.token_balance ?? 0;
  const lowTokens = tokenBalance < 100;

  return (
    <DashboardLayout navItems={orgNavItems} title="Organisation Dashboard" subtitle={org?.name}>
      <div className="space-y-6">
        {lowTokens && (
          <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-800">Low token balance — {tokenBalance} tokens remaining</p>
              <p className="text-xs text-amber-600 mt-0.5">
                Top up now to keep AI course generation available for your teachers.{' '}
                <Link to="/org/tokens" className="underline font-medium">Buy tokens</Link>
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard icon={Coins}        label="Token Balance"     value={tokenBalance.toLocaleString()}  sub="Available for AI"      color="bg-emerald-100 text-emerald-600" href="/org/tokens" />
          <StatCard icon={TrendingUp}   label="Used This Month"   value={usageThisMonth.toLocaleString()} sub="AI tokens consumed"   color="bg-sky-100 text-sky-600" />
          <StatCard icon={Users}        label="Teachers"          value={memberCount}                    sub="Team members"          color="bg-teal-100 text-teal-600"     href="/org/teachers" />
          <StatCard icon={GraduationCap} label="Students"         value={studentCount}                   sub="Active students"       color="bg-amber-100 text-amber-600"   href="/org/students" />
          <StatCard icon={BookOpen}     label="Courses"           value={courseCount}                    sub="Created by your org"   color="bg-rose-100 text-rose-600"     href="/org/courses" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Plan Info + Features */}
          <div className="card p-6">
            <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-sky-500" /> Your Plan — <span className="capitalize text-sky-600">{org?.plan_tier ?? '—'}</span>
            </h3>
            <div className="space-y-2 mb-4">
              <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
                <span className="text-sm text-slate-500">Token Balance</span>
                <span className={`text-sm font-bold ${lowTokens ? 'text-amber-600' : 'text-emerald-600'}`}>{tokenBalance.toLocaleString()} tokens</span>
              </div>
              <div className="flex items-center justify-between py-1.5">
                <span className="text-sm text-slate-500">Used This Month</span>
                <span className="text-sm font-semibold text-slate-700">{usageThisMonth.toLocaleString()} tokens</span>
              </div>
            </div>
            {org?.plan_tier && (() => {
              const features = PLAN_FEATURES[org.plan_tier as OrgPlanTier];
              const featureEntries: { key: keyof OrgFeatureFlags; label: string }[] = [
                { key: 'ai_course_outline',  label: 'Course Outline AI' },
                { key: 'ai_lesson_content',  label: 'Lesson Content AI' },
                { key: 'ai_quiz_generation', label: 'Quiz Generation' },
                { key: 'ai_flashcards',      label: 'Flashcards AI' },
                { key: 'ai_full_curriculum', label: 'Full Curriculum' },
                { key: 'ai_presentations',   label: 'Presentations' },
                { key: 'ai_exams',           label: 'Exam Generation' },
                { key: 'student_ai_access',  label: 'Student AI Access' },
              ];
              return (
                <div className="grid grid-cols-2 gap-1.5 mb-4">
                  {featureEntries.map(({ key, label }) => (
                    <div key={key} className={`flex items-center gap-1.5 text-xs px-2 py-1.5 rounded-lg ${features[key] ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-50 text-slate-400'}`}>
                      {features[key] ? <Check className="w-3 h-3 shrink-0" /> : <span className="w-3 h-3 rounded-full border border-slate-300 shrink-0 inline-block" />}
                      {label}
                    </div>
                  ))}
                </div>
              );
            })()}
            <Link to="/org/tokens" className="btn-primary w-full text-center block">Upgrade / Buy Tokens</Link>
          </div>

          {/* Recent Usage */}
          <div className="card p-6">
            <h3 className="font-semibold text-slate-800 mb-4">Recent AI Usage</h3>
            {recentUsage.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-sm">No AI usage yet</div>
            ) : (
              <div className="space-y-2">
                {recentUsage.map((log: { id: string; ai_task: string; tokens_deducted: number; created_at: string; profile?: { full_name?: string; email?: string } }) => (
                  <div key={log.id} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-700 truncate">{log.ai_task.replace(/_/g, ' ')}</p>
                      <p className="text-xs text-slate-400">{log.profile?.full_name ?? log.profile?.email ?? 'Unknown'}</p>
                    </div>
                    <span className="text-xs font-semibold text-rose-600 shrink-0 ml-2">−{log.tokens_deducted}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
