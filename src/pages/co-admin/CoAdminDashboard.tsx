import { useState, useEffect } from 'react';
import { Users, GraduationCap, CreditCard, Award, BookOpen } from 'lucide-react';
import { Link } from 'react-router-dom';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { coAdminNavItems } from './coAdminNav';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface Stats {
  students: number;
  teachers: number;
  enrollments: number;
  certificates: number;
  completedPayments: number;
}

export default function CoAdminDashboard() {
  const { profile } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      const [studRes, teachRes, enrollRes, certRes, payRes] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact' }).eq('role', 'student').eq('is_active', true),
        supabase.from('profiles').select('id', { count: 'exact' }).eq('role', 'teacher').eq('is_active', true),
        supabase.from('course_enrollments').select('id', { count: 'exact' }),
        supabase.from('certificates').select('id', { count: 'exact' }).eq('revoked', false),
        supabase.from('payments').select('id', { count: 'exact' }).eq('status', 'completed'),
      ]);

      setStats({
        students: studRes.count ?? 0,
        teachers: teachRes.count ?? 0,
        enrollments: enrollRes.count ?? 0,
        certificates: certRes.count ?? 0,
        completedPayments: payRes.count ?? 0,
      });
      setLoading(false);
    };
    fetchStats();
  }, []);

  const cards = [
    { label: 'Active Students', value: stats?.students, icon: GraduationCap, color: 'text-sky-600', bg: 'bg-sky-50 dark:bg-sky-900/20', href: '/co-admin/students' },
    { label: 'Teachers', value: stats?.teachers, icon: BookOpen, color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-900/20', href: '/co-admin/teachers' },
    { label: 'Total Enrolments', value: stats?.enrollments, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-900/20', href: '/co-admin/enrollments' },
    { label: 'Certificates Issued', value: stats?.certificates, icon: Award, color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-900/20', href: '/co-admin/certificates' },
    { label: 'Completed Payments', value: stats?.completedPayments, icon: CreditCard, color: 'text-teal-600', bg: 'bg-teal-50 dark:bg-teal-900/20', href: '/co-admin/payments' },
  ];

  return (
    <DashboardLayout navItems={coAdminNavItems} title="Overview" subtitle={`Welcome back, ${profile?.full_name || 'Co-Admin'}`}>
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {cards.map(card => (
            <Link key={card.label} to={card.href}
              className="bg-white dark:bg-navy-800 rounded-2xl border border-gray-100 dark:border-navy-700 p-5 shadow-sm hover:shadow-md transition-shadow group">
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${card.bg}`}>
                  <card.icon className={`w-6 h-6 ${card.color}`} />
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">{card.label}</p>
                  {loading ? (
                    <div className="h-7 w-16 bg-gray-100 dark:bg-navy-700 rounded animate-pulse mt-1" />
                  ) : (
                    <p className="text-2xl font-extrabold text-gray-900 dark:text-white">{card.value ?? '—'}</p>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>

        <div className="bg-white dark:bg-navy-800 rounded-2xl border border-gray-100 dark:border-navy-700 p-6 shadow-sm">
          <h2 className="text-base font-bold text-gray-900 dark:text-white mb-1">Quick Actions</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Common tasks for co-admins</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { label: 'View Students', desc: 'Manage student accounts and status', href: '/co-admin/students', color: 'bg-sky-600 hover:bg-sky-700' },
              { label: 'View Teachers', desc: 'See all teachers and their courses', href: '/co-admin/teachers', color: 'bg-emerald-600 hover:bg-emerald-700' },
              { label: 'Manage Enrolments', desc: 'View and manage course enrolments', href: '/co-admin/enrollments', color: 'bg-blue-600 hover:bg-blue-700' },
              { label: 'View Payments', desc: 'Monitor payment history', href: '/co-admin/payments', color: 'bg-teal-600 hover:bg-teal-700' },
            ].map(a => (
              <Link key={a.label} to={a.href}
                className={`flex flex-col gap-1 p-4 rounded-xl text-white ${a.color} transition-colors`}>
                <span className="text-sm font-bold">{a.label}</span>
                <span className="text-xs opacity-80">{a.desc}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
