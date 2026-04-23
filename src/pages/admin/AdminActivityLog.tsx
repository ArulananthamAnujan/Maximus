import { useState, useEffect } from 'react';
import { Activity, Search } from 'lucide-react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { adminNavItems } from './adminNav';
import { supabase } from '../../lib/supabase';
import type { ActivityLog } from '../../types';

const ACTION_COLORS: Record<string, string> = {
  created_course: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  added_lesson: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  enrolled: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  deleted: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  updated: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
};

export default function AdminActivityLog() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 20;

  useEffect(() => {
    const fetchLogs = async () => {
      let query = supabase
        .from('activity_logs')
        .select('*, user:profiles(full_name, email, role)')
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (search) query = query.ilike('action', `%${search}%`);

      const { data } = await query;
      if (data) {
        if (page === 0) setLogs(data as ActivityLog[]);
        else setLogs(prev => [...prev, ...data as ActivityLog[]]);
      }
      setLoading(false);
    };
    fetchLogs();
  }, [search, page]);

  const filtered = logs.filter(log => {
    if (!search) return true;
    const user = log.user as { full_name?: string; email?: string } | undefined;
    const q = search.toLowerCase();
    return log.action.toLowerCase().includes(q) || log.details.toLowerCase().includes(q) || user?.full_name?.toLowerCase().includes(q);
  });

  return (
    <DashboardLayout navItems={adminNavItems} title="Activity Log" subtitle="Complete audit trail of all admin and teacher actions">
      <div className="space-y-5">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" placeholder="Search actions..." value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} className="input-field pl-9 py-2 text-sm" />
        </div>

        <div className="card">
          {loading && page === 0 ? (
            <div className="divide-y divide-gray-50 dark:divide-navy-700">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex items-start gap-4 p-4">
                  <div className="w-8 h-8 bg-gray-200 dark:bg-navy-700 rounded-full animate-pulse" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-gray-200 dark:bg-navy-700 rounded w-3/4 animate-pulse" />
                    <div className="h-3 bg-gray-200 dark:bg-navy-700 rounded w-1/2 animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12">
              <Activity className="w-8 h-8 text-gray-400 mx-auto mb-2" />
              <p className="text-gray-500 dark:text-gray-400 text-sm">No activity logged yet</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50 dark:divide-navy-700">
              {filtered.map(log => {
                const user = log.user as { full_name?: string; email?: string; role?: string } | undefined;
                const actionColor = Object.entries(ACTION_COLORS).find(([key]) => log.action.includes(key))?.[1] || 'bg-gray-100 text-gray-600 dark:bg-navy-700 dark:text-gray-400';
                return (
                  <div key={log.id} className="flex items-start gap-4 p-4 hover:bg-gray-50 dark:hover:bg-navy-700/30 transition-colors">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-navy-600 to-navy-800 flex items-center justify-center text-white text-xs font-bold shrink-0">
                      {user?.full_name?.[0] || '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-sm font-medium text-gray-900 dark:text-white">{user?.full_name || 'Unknown'}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${actionColor}`}>{log.action.replace(/_/g, ' ')}</span>
                        <span className="text-xs text-gray-400 capitalize">{user?.role}</span>
                      </div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">{log.details}</p>
                      <p className="text-xs text-gray-400 mt-1">{new Date(log.created_at).toLocaleString('en-AU')}</p>
                    </div>
                    <span className="text-xs text-gray-400 shrink-0 hidden sm:block">{log.resource_type}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        {filtered.length >= PAGE_SIZE && (
          <div className="text-center">
            <button onClick={() => setPage(p => p + 1)} className="px-6 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white border border-gray-200 dark:border-navy-600 rounded-lg hover:bg-gray-50 dark:hover:bg-navy-700 transition-colors">
              Load More
            </button>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
