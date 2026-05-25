import { useState, useEffect } from 'react';
import { Search, CreditCard } from 'lucide-react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { coAdminNavItems } from './coAdminNav';
import { supabase } from '../../lib/supabase';

interface PaymentRow {
  id: string;
  status: string;
  created_at: string;
  stripe_payment_id: string;
  promo_code: string;
  discount_percent: number;
  student?: { full_name: string; email: string };
  course?: { title: string };
}

const STATUS_COLORS: Record<string, string> = {
  completed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  pending:   'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  refunded:  'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  failed:    'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

export default function CoAdminPayments() {
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from('payments')
        .select('id,status,created_at,stripe_payment_id,promo_code,discount_percent,student:profiles(full_name,email),course:courses(title)')
        .order('created_at', { ascending: false });
      if (data) setPayments(data as PaymentRow[]);
      setLoading(false);
    };
    fetch();
  }, []);

  const filtered = payments.filter(p => {
    const matchesStatus = statusFilter === 'all' || p.status === statusFilter;
    if (!matchesStatus) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (p.student?.full_name?.toLowerCase().includes(q) ||
            p.student?.email?.toLowerCase().includes(q) ||
            p.course?.title?.toLowerCase().includes(q));
  });

  return (
    <DashboardLayout navItems={coAdminNavItems} title="Payments" subtitle={`${filtered.length} transactions`}>
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" placeholder="Search by student or course..." value={search} onChange={e => setSearch(e.target.value)} className="input-field pl-9" />
          </div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="input-field w-full sm:w-36">
            <option value="all">All Status</option>
            <option value="completed">Completed</option>
            <option value="pending">Pending</option>
            <option value="refunded">Refunded</option>
            <option value="failed">Failed</option>
          </select>
        </div>

        <div className="bg-white dark:bg-navy-800 rounded-2xl border border-gray-100 dark:border-navy-700 shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-8 flex justify-center"><div className="w-8 h-8 border-4 border-sky-500 border-t-transparent rounded-full animate-spin" /></div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-center">
              <CreditCard className="w-10 h-10 text-gray-300 dark:text-navy-600 mb-3" />
              <p className="text-gray-500 dark:text-gray-400">No payments found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-navy-700 bg-gray-50 dark:bg-navy-900/40">
                    <th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide px-4 py-3">Student</th>
                    <th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide px-4 py-3">Course</th>
                    <th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide px-4 py-3">Status</th>
                    <th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide px-4 py-3">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-navy-700/50">
                  {filtered.map(p => (
                    <tr key={p.id} className="hover:bg-gray-50 dark:hover:bg-navy-700/30 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900 dark:text-white">{p.student?.full_name || '—'}</p>
                        <p className="text-xs text-gray-400">{p.student?.email}</p>
                      </td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300 max-w-[200px] truncate">{p.course?.title || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${STATUS_COLORS[p.status] || 'bg-gray-100 text-gray-600'}`}>
                          {p.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400">
                        {new Date(p.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
