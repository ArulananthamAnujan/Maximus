import { useState, useEffect } from 'react';
import { Users, BookOpen, GraduationCap, DollarSign, Award, TrendingUp, UserCheck, AlertCircle, ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { adminNavItems } from './adminNav';
import { supabase } from '../../lib/supabase';
import { DashboardStatSkeleton } from '../../components/ui/LoadingSkeleton';
import type { ActivityLog } from '../../types';

interface Stats {
  totalUsers: number;
  totalCourses: number;
  totalEnrollments: number;
  totalRevenue: number;
  totalCertificates: number;
  activeStudents: number;
  publishedCourses: number;
}

interface RevenueDay {
  date: string;
  amount: number;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [revenueData, setRevenueData] = useState<RevenueDay[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const [usersRes, coursesRes, enrollmentsRes, paymentsRes, certsRes, logsRes, recentPaymentsRes] = await Promise.all([
        supabase.from('profiles').select('id, role, is_active', { count: 'exact' }),
        supabase.from('courses').select('id, is_published', { count: 'exact' }),
        supabase.from('enrollments').select('id', { count: 'exact' }),
        supabase.from('payments').select('amount, status').eq('status', 'completed'),
        supabase.from('certificates').select('id', { count: 'exact' }).eq('revoked', false),
        supabase.from('activity_logs').select('id, action, entity_type, details, created_at, user:profiles(full_name, email, role)').order('created_at', { ascending: false }).limit(10),
        supabase.from('payments').select('amount, created_at').eq('status', 'completed').gte('created_at', thirtyDaysAgo.toISOString()),
      ]);

      const revenue = paymentsRes.data?.reduce((sum, p) => sum + (p.amount || 0), 0) || 0;
      const publishedCourses = coursesRes.data?.filter(c => c.is_published).length || 0;
      const activeStudents = usersRes.data?.filter(u => u.role === 'student' && u.is_active).length || 0;

      setStats({
        totalUsers: usersRes.count || 0,
        totalCourses: coursesRes.count || 0,
        totalEnrollments: enrollmentsRes.count || 0,
        totalRevenue: revenue,
        totalCertificates: certsRes.count || 0,
        activeStudents,
        publishedCourses,
      });

      if (logsRes.data) setLogs(logsRes.data as ActivityLog[]);

      const dailyRevenue: Record<string, number> = {};
      for (let i = 29; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        dailyRevenue[key] = 0;
      }
      (recentPaymentsRes.data || []).forEach(p => {
        const key = p.created_at.slice(0, 10);
        if (dailyRevenue[key] !== undefined) dailyRevenue[key] += p.amount;
      });
      setRevenueData(Object.entries(dailyRevenue).map(([date, amount]) => ({ date, amount })));

      setLoading(false);
    };
    fetchData();
  }, []);

  const STAT_CARDS = stats ? [
    { title: 'Total Users', value: stats.totalUsers.toLocaleString(), icon: Users, color: 'bg-blue-500', change: '+12%', href: '/admin/users' },
    { title: 'Total Courses', value: stats.totalCourses.toLocaleString(), icon: BookOpen, color: 'bg-amber-500', change: '+5%', href: '/admin/courses' },
    { title: 'Total Enrolments', value: stats.totalEnrollments.toLocaleString(), icon: GraduationCap, color: 'bg-green-500', change: '+18%', href: '/admin/enrollments' },
    { title: 'Total Revenue', value: `A$${stats.totalRevenue.toLocaleString('en-AU', { minimumFractionDigits: 2 })}`, icon: DollarSign, color: 'bg-emerald-600', change: '+23%', href: '/admin/payments' },
    { title: 'Certificates Issued', value: stats.totalCertificates.toLocaleString(), icon: Award, color: 'bg-gold-500', change: '+9%', href: '/admin/certificates' },
    { title: 'Active Students', value: stats.activeStudents.toLocaleString(), icon: UserCheck, color: 'bg-teal-500', change: '+8%', href: '/admin/users' },
  ] : [];

  const maxRevenue = Math.max(...revenueData.map(d => d.amount), 1);

  const actionColors: Record<string, string> = {
    create: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    update: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    delete: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    enroll: 'bg-gold-100 text-gold-700 dark:bg-gold-900/30 dark:text-gold-400',
  };

  return (
    <DashboardLayout navItems={adminNavItems} title="Admin Dashboard" subtitle="Full platform overview and analytics">
      <div className="space-y-6">
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[1,2,3,4,5,6].map(i => <DashboardStatSkeleton key={i} />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {STAT_CARDS.map(stat => (
              <Link key={stat.title} to={stat.href} className="card p-6 hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5 group">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">{stat.title}</p>
                  <div className={`w-11 h-11 ${stat.color} rounded-xl flex items-center justify-center shadow-sm`}>
                    <stat.icon className="w-5 h-5 text-white" />
                  </div>
                </div>
                <p className="text-3xl font-bold text-gray-900 dark:text-white font-playfair">{stat.value}</p>
                <div className="flex items-center justify-between mt-2">
                  <p className="text-sm text-green-600 dark:text-green-400 flex items-center gap-1">
                    <TrendingUp className="w-3.5 h-3.5" /> {stat.change} vs last month
                  </p>
                  <ArrowUpRight className="w-4 h-4 text-gray-300 dark:text-navy-600 group-hover:text-gray-500 dark:group-hover:text-gray-400 transition-colors" />
                </div>
              </Link>
            ))}
          </div>
        )}

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 card">
            <div className="p-5 border-b border-gray-100 dark:border-navy-700 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-gray-900 dark:text-white">Revenue — Last 30 Days</h2>
                <p className="text-xs text-gray-400 mt-0.5">Daily completed payment totals</p>
              </div>
              {stats && (
                <div className="text-right">
                  <p className="text-xl font-bold text-gray-900 dark:text-white font-playfair">
                    A${stats.totalRevenue.toLocaleString('en-AU', { minimumFractionDigits: 2 })}
                  </p>
                  <p className="text-xs text-green-500">Total revenue</p>
                </div>
              )}
            </div>
            <div className="p-5">
              {loading ? (
                <div className="h-48 bg-gray-100 dark:bg-navy-700 rounded-xl animate-pulse" />
              ) : (
                <div className="h-48 flex items-end gap-0.5">
                  {revenueData.map((day, i) => {
                    const height = maxRevenue > 0 ? (day.amount / maxRevenue) * 100 : 0;
                    const isToday = i === revenueData.length - 1;
                    return (
                      <div key={day.date} className="flex-1 flex flex-col items-center justify-end group relative h-full">
                        <div
                          className={`w-full rounded-t transition-all duration-200 ${isToday ? 'bg-gold-500' : 'bg-navy-200 dark:bg-navy-600 group-hover:bg-navy-400 dark:group-hover:bg-navy-400'}`}
                          style={{ height: `${Math.max(height, day.amount > 0 ? 4 : 1)}%` }}
                        />
                        {day.amount > 0 && (
                          <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:block bg-navy-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap z-10">
                            A${day.amount.toFixed(0)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="flex justify-between text-xs text-gray-400 mt-2">
                <span>30 days ago</span>
                <span>Today</span>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="p-5 border-b border-gray-100 dark:border-navy-700">
              <h2 className="font-semibold text-gray-900 dark:text-white">Quick Actions</h2>
            </div>
            <div className="p-4 space-y-2">
              {[
                { label: 'Add New User', href: '/admin/users', color: 'text-blue-600 bg-blue-50 dark:bg-blue-900/20' },
                { label: 'Create Course', href: '/admin/courses', color: 'text-amber-600 bg-amber-50 dark:bg-amber-900/20' },
                { label: 'Enrol Student', href: '/admin/enrollments', color: 'text-green-600 bg-green-50 dark:bg-green-900/20' },
                { label: 'Issue Promo Code', href: '/admin/promo-codes', color: 'text-teal-600 bg-teal-50 dark:bg-teal-900/20' },
                { label: 'Send Announcement', href: '/admin/announcements', color: 'text-gold-600 bg-gold-50 dark:bg-gold-900/20' },
                { label: 'View Activity Log', href: '/admin/activity', color: 'text-gray-600 bg-gray-50 dark:bg-navy-700' },
              ].map(action => (
                <Link key={action.href} to={action.href} className={`flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium ${action.color} hover:opacity-80 transition-opacity`}>
                  {action.label}
                  <ArrowUpRight className="w-4 h-4 opacity-50" />
                </Link>
              ))}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="p-5 border-b border-gray-100 dark:border-navy-700 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900 dark:text-white">Recent Activity</h2>
            <Link to="/admin/activity" className="text-sm text-gold-600 hover:text-gold-700 flex items-center gap-1">
              View all <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          {logs.length === 0 ? (
            <div className="p-8 text-center">
              <AlertCircle className="w-8 h-8 text-gray-400 mx-auto mb-2" />
              <p className="text-gray-500 dark:text-gray-400 text-sm">No activity yet</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50 dark:divide-navy-700">
              {logs.map(log => {
                const user = log.user as { full_name?: string; email?: string; role?: string } | undefined;
                const action = log.action?.toLowerCase() || 'action';
                return (
                  <div key={log.id} className="flex items-start gap-4 p-4 hover:bg-gray-50 dark:hover:bg-navy-700/30 transition-colors">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-navy-600 to-navy-800 flex items-center justify-center shrink-0 text-white text-sm font-bold">
                      {user?.full_name?.[0] || user?.email?.[0]?.toUpperCase() || '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900 dark:text-white">
                        <span className="font-medium">{user?.full_name || 'Unknown'}</span>
                        {' '}
                        <span className="text-gray-500 dark:text-gray-400">
                          {typeof log.details === 'string'
                            ? log.details
                            : log.details && typeof log.details === 'object'
                              ? (log.details as Record<string, unknown>).note as string
                                ?? (log.details as Record<string, unknown>).message as string
                                ?? JSON.stringify(log.details)
                              : ''}
                        </span>
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">{new Date(log.created_at).toLocaleString('en-AU')}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${actionColors[action] || 'bg-gray-100 text-gray-600 dark:bg-navy-700 dark:text-gray-400'}`}>
                        {log.action}
                      </span>
                      <span className="text-xs text-gray-400 hidden sm:block">{(log as Record<string, unknown>).entity_type as string}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
