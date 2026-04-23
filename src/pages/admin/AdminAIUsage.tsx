import { lazy, Suspense, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Sparkles, AlertCircle, CheckCircle2, XCircle, Clock, Zap, TrendingUp, DollarSign, Activity } from 'lucide-react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { adminNavItems } from './adminNav';
import { supabase } from '../../lib/supabase';
import { useAIHealthCheck } from '../../hooks/useAI';

const BarChart = lazy(() => import('recharts').then(m => ({ default: m.BarChart })));
const Bar = lazy(() => import('recharts').then(m => ({ default: m.Bar })));
const XAxis = lazy(() => import('recharts').then(m => ({ default: m.XAxis })));
const YAxis = lazy(() => import('recharts').then(m => ({ default: m.YAxis })));
const Tooltip = lazy(() => import('recharts').then(m => ({ default: m.Tooltip })));
const ResponsiveContainer = lazy(() => import('recharts').then(m => ({ default: m.ResponsiveContainer })));

interface AILog {
  id: string;
  user_id: string;
  ai_task: string;
  input_tokens: number;
  output_tokens: number;
  cost_estimate_usd: number;
  success: boolean;
  error_message: string | null;
  created_at: string;
}

interface AILogWithProfile extends AILog {
  profiles?: { full_name: string; email: string };
}

function StatCard({ icon: Icon, label, value, sub, color }: {
  icon: typeof Sparkles; label: string; value: string | number; sub?: string; color: string;
}) {
  return (
    <div className="card p-5 flex items-start gap-4">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-2xl font-bold text-slate-800">{value}</p>
        <p className="text-sm text-slate-500 mt-0.5">{label}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

export default function AdminAIUsage() {
  const healthCheck = useAIHealthCheck();
  const [healthResult, setHealthResult] = useState<{ key_present: boolean; key_works: boolean; latency_ms: number } | null>(null);
  const [healthChecking, setHealthChecking] = useState(false);

  const runHealthCheck = async () => {
    setHealthChecking(true);
    try {
      const result = await healthCheck.mutateAsync();
      setHealthResult(result);
    } catch {
      setHealthResult({ key_present: false, key_works: false, latency_ms: 0 });
    } finally {
      setHealthChecking(false);
    }
  };

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const { data: allLogs = [], isLoading } = useQuery<AILog[]>({
    queryKey: ['ai_usage_logs'],
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ai_usage_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      return data as AILog[];
    },
  });

  const { data: logsWithProfiles = [] } = useQuery<AILogWithProfile[]>({
    queryKey: ['ai_usage_logs_with_profiles'],
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ai_usage_logs')
        .select('*, profiles(full_name, email)')
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      return data as AILogWithProfile[];
    },
  });

  const todayLogs = allLogs.filter(l => l.created_at >= todayStart);
  const weekLogs = allLogs.filter(l => l.created_at >= weekStart);
  const monthLogs = allLogs.filter(l => l.created_at >= monthStart);

  const totalCost = monthLogs.reduce((s, l) => s + Number(l.cost_estimate_usd), 0);
  const recentErrors = allLogs.filter(l => !l.success).slice(0, 20);

  // Task breakdown
  const taskBreakdown = Object.entries(
    monthLogs.reduce((acc, l) => {
      if (!acc[l.ai_task]) acc[l.ai_task] = { count: 0, tokens: 0, cost: 0 };
      acc[l.ai_task].count++;
      acc[l.ai_task].tokens += l.input_tokens + l.output_tokens;
      acc[l.ai_task].cost += Number(l.cost_estimate_usd);
      return acc;
    }, {} as Record<string, { count: number; tokens: number; cost: number }>)
  ).sort((a, b) => b[1].count - a[1].count);

  // Top users
  const userUsage = Object.entries(
    monthLogs.reduce((acc, l) => {
      if (!acc[l.user_id]) acc[l.user_id] = { count: 0, cost: 0 };
      acc[l.user_id].count++;
      acc[l.user_id].cost += Number(l.cost_estimate_usd);
      return acc;
    }, {} as Record<string, { count: number; cost: number }>)
  )
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 10)
    .map(([userId, stats]) => {
      const profile = logsWithProfiles.find(l => l.user_id === userId)?.profiles;
      return { userId, ...stats, name: profile?.full_name || 'Unknown', email: profile?.email || '' };
    });

  // Chart data (last 7 days)
  const chartData = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now.getTime() - (6 - i) * 24 * 60 * 60 * 1000);
    const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
    const dayEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).toISOString();
    const dayLogs = allLogs.filter(l => l.created_at >= dayStart && l.created_at < dayEnd);
    return {
      date: d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric' }),
      calls: dayLogs.length,
      cost: Number(dayLogs.reduce((s, l) => s + Number(l.cost_estimate_usd), 0).toFixed(4)),
    };
  });

  const formatTask = (task: string) => task.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  return (
    <DashboardLayout navItems={adminNavItems} title="AI Usage" subtitle="Monitor AI feature usage and costs">
      <div className="space-y-6">
        {/* Health check */}
        <div className="card p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 bg-sky-100 rounded-xl flex items-center justify-center">
              <Zap className="w-4.5 h-4.5 text-sky-600" />
            </div>
            <div>
              <h2 className="font-bold text-slate-800">AI Setup Health</h2>
              <p className="text-sm text-slate-500">Verify your Anthropic API key is configured and working</p>
            </div>
            <button
              onClick={runHealthCheck}
              disabled={healthChecking}
              className="ml-auto btn-primary text-sm py-2 px-4 flex items-center gap-2"
            >
              {healthChecking ? (
                <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Checking...</>
              ) : (
                <><Zap className="w-4 h-4" />Run Health Check</>
              )}
            </button>
          </div>

          {healthResult && (
            <div className={`rounded-xl p-4 border ${healthResult.key_works ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
              <div className="flex items-start gap-3">
                {healthResult.key_works ? (
                  <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                )}
                <div className="flex-1">
                  <p className={`font-semibold ${healthResult.key_works ? 'text-green-700' : 'text-red-700'}`}>
                    {healthResult.key_works ? 'AI is fully operational' : 'AI is not working'}
                  </p>
                  <div className="mt-2 grid grid-cols-3 gap-3 text-sm">
                    <div>
                      <span className="text-slate-500">Key present: </span>
                      <span className={healthResult.key_present ? 'text-green-700 font-medium' : 'text-red-600 font-medium'}>
                        {healthResult.key_present ? 'Yes' : 'No'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500">Key works: </span>
                      <span className={healthResult.key_works ? 'text-green-700 font-medium' : 'text-red-600 font-medium'}>
                        {healthResult.key_works ? 'Yes' : 'No'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500">Latency: </span>
                      <span className="text-slate-700 font-medium">{healthResult.latency_ms}ms</span>
                    </div>
                  </div>
                  {!healthResult.key_present && (
                    <div className="mt-3 p-3 bg-white rounded-lg border border-red-200 text-sm text-red-700 space-y-1">
                      <p className="font-semibold">Troubleshooting steps:</p>
                      <ol className="list-decimal list-inside space-y-1 text-red-600">
                        <li>Go to Supabase Dashboard → Edge Functions → Secrets</li>
                        <li>Add a secret named <code className="bg-red-100 px-1 rounded">ANTHROPIC_API_KEY</code></li>
                        <li>Set its value to your Anthropic API key (starts with <code className="bg-red-100 px-1 rounded">sk-ant-</code>)</li>
                        <li>Re-deploy the <code className="bg-red-100 px-1 rounded">ai-generate</code> and <code className="bg-red-100 px-1 rounded">ai-health</code> functions</li>
                      </ol>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={Activity} label="Calls Today" value={todayLogs.length} color="bg-sky-100 text-sky-600" />
          <StatCard icon={TrendingUp} label="Calls This Week" value={weekLogs.length} color="bg-blue-100 text-blue-600" />
          <StatCard icon={Sparkles} label="Calls This Month" value={monthLogs.length} color="bg-slate-100 text-slate-600" />
          <StatCard icon={DollarSign} label="Cost This Month" value={`$${totalCost.toFixed(4)}`} sub="USD (estimated)" color="bg-emerald-100 text-emerald-600" />
        </div>

        {/* Chart */}
        <div className="card p-5">
          <h3 className="font-bold text-slate-800 mb-4">Daily AI Calls (Last 7 Days)</h3>
          <Suspense fallback={<div className="h-48 flex items-center justify-center text-sm text-slate-400">Loading chart...</div>}>
            <div style={{ height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="calls" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Suspense>
        </div>

        {/* Task breakdown + Top users */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Task breakdown */}
          <div className="card">
            <div className="lms-panel-header">
              <h3 className="font-bold text-slate-800">Task Breakdown (This Month)</h3>
            </div>
            <div className="p-4">
              {isLoading ? (
                <div className="text-sm text-slate-400 text-center py-6">Loading...</div>
              ) : taskBreakdown.length === 0 ? (
                <div className="text-sm text-slate-400 text-center py-6">No AI calls yet</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                      <th className="text-left pb-2">Task</th>
                      <th className="text-right pb-2">Calls</th>
                      <th className="text-right pb-2">Avg Tokens</th>
                      <th className="text-right pb-2">Cost</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {taskBreakdown.map(([task, stats]) => (
                      <tr key={task}>
                        <td className="py-2 font-medium text-slate-700">{formatTask(task)}</td>
                        <td className="py-2 text-right text-slate-600">{stats.count}</td>
                        <td className="py-2 text-right text-slate-500">{Math.round(stats.tokens / stats.count).toLocaleString()}</td>
                        <td className="py-2 text-right text-slate-600">${stats.cost.toFixed(4)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Top users */}
          <div className="card">
            <div className="lms-panel-header">
              <h3 className="font-bold text-slate-800">Top Users (This Month)</h3>
            </div>
            <div className="p-4">
              {userUsage.length === 0 ? (
                <div className="text-sm text-slate-400 text-center py-6">No usage yet</div>
              ) : (
                <div className="space-y-2.5">
                  {userUsage.map((u, i) => (
                    <div key={u.userId} className="flex items-center gap-3">
                      <span className="w-5 h-5 flex items-center justify-center text-xs font-bold text-slate-400">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">{u.name}</p>
                        <p className="text-xs text-slate-400 truncate">{u.email}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold text-slate-700">{u.count} calls</p>
                        <p className="text-xs text-slate-400">${u.cost.toFixed(4)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Recent errors */}
        {recentErrors.length > 0 && (
          <div className="card">
            <div className="lms-panel-header">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-500" />
                <h3 className="font-bold text-slate-800">Recent Errors</h3>
                <span className="badge bg-red-100 text-red-700">{recentErrors.length}</span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    <th className="text-left px-5 py-2.5">Time</th>
                    <th className="text-left px-5 py-2.5">Task</th>
                    <th className="text-left px-5 py-2.5">Error</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {recentErrors.map(log => (
                    <tr key={log.id}>
                      <td className="px-5 py-2.5 text-slate-500 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3 h-3 shrink-0" />
                          {new Date(log.created_at).toLocaleString('en-AU', { dateStyle: 'short', timeStyle: 'short' })}
                        </div>
                      </td>
                      <td className="px-5 py-2.5">
                        <span className="badge badge-sky">{formatTask(log.ai_task || 'unknown')}</span>
                      </td>
                      <td className="px-5 py-2.5 text-red-600 text-xs max-w-xs truncate">{log.error_message || 'Unknown error'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
