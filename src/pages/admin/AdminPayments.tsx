import { useState, useEffect } from 'react';
import { Search, DollarSign, RefreshCw } from 'lucide-react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { adminNavItems } from './adminNav';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../contexts/ToastContext';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import Badge from '../../components/ui/Badge';
import type { Payment } from '../../types';

export default function AdminPayments() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [refundTarget, setRefundTarget] = useState<Payment | null>(null);
  const [refunding, setRefunding] = useState(false);
  const { toast } = useToast();

  const fetchPayments = async () => {
    let query = supabase.from('payments').select('*, student:profiles(full_name, email), course:courses(title)').order('created_at', { ascending: false });
    if (statusFilter !== 'all') query = query.eq('status', statusFilter);
    const { data } = await query;
    if (data) setPayments(data as Payment[]);
    setLoading(false);
  };

  useEffect(() => { fetchPayments(); }, [statusFilter]);

  const handleRefund = async () => {
    if (!refundTarget) return;
    setRefunding(true);
    const { error } = await supabase.from('payments').update({ status: 'refunded' }).eq('id', refundTarget.id);
    if (!error) {
      toast.success('Refund processed successfully');
      fetchPayments();
    } else {
      toast.error('Failed to process refund');
    }
    setRefundTarget(null);
    setRefunding(false);
  };

  const statusColors: Record<string, 'success' | 'warning' | 'error' | 'default'> = { completed: 'success', pending: 'warning', refunded: 'info' as 'default', failed: 'error' };

  const totalRevenue = payments.filter(p => p.status === 'completed').reduce((sum, p) => sum + p.amount, 0);
  const filtered = payments.filter(p => {
    const student = p.student as { full_name?: string; email?: string } | undefined;
    const course = p.course as { title?: string } | undefined;
    const q = search.toLowerCase();
    return !search || student?.full_name?.toLowerCase().includes(q) || student?.email?.toLowerCase().includes(q) || course?.title?.toLowerCase().includes(q);
  });

  return (
    <DashboardLayout navItems={adminNavItems} title="Payments" subtitle="View and manage all transactions">
      <div className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { label: 'Total Revenue', value: `A$${totalRevenue.toLocaleString('en-AU', { minimumFractionDigits: 2 })}`, color: 'text-green-600' },
            { label: 'Total Transactions', value: payments.length.toString(), color: 'text-slate-900' },
            { label: 'Refunds Issued', value: payments.filter(p => p.status === 'refunded').length.toString(), color: 'text-red-500' },
          ].map(stat => (
            <div key={stat.label} className="card p-5">
              <p className="text-sm text-gray-500 text-slate-500">{stat.label}</p>
              <p className={`text-2xl font-bold mt-1 font-playfair ${stat.color}`}>{stat.value}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-between">
          <div className="flex gap-3 flex-1 max-w-lg">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input type="text" placeholder="Search payments..." value={search} onChange={e => setSearch(e.target.value)} className="input-field pl-9 py-2 text-sm" />
            </div>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="input-field py-2 text-sm w-36">
              <option value="all">All Status</option>
              <option value="completed">Completed</option>
              <option value="pending">Pending</option>
              <option value="refunded">Refunded</option>
              <option value="failed">Failed</option>
            </select>
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 bg-slate-50 border-b border-gray-100 border-slate-100">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 text-slate-500 uppercase">Student</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 text-slate-500 uppercase hidden md:table-cell">Course</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 text-slate-500 uppercase">Amount</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 text-slate-500 uppercase hidden sm:table-cell">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 text-slate-500 uppercase hidden lg:table-cell">Date</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 text-slate-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-navy-700">
                {loading ? Array.from({ length: 5 }).map((_, i) => <tr key={i}>{[1,2,3,4,5,6].map(j => <td key={j} className="px-4 py-3"><div className="h-4 bg-gray-200 rounded animate-pulse" /></td>)}</tr>) :
                filtered.map(payment => {
                  const student = payment.student as { full_name?: string; email?: string } | undefined;
                  const course = payment.course as { title?: string } | undefined;
                  return (
                    <tr key={payment.id} className="hover:bg-gray-50 hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900 dark:text-white text-sm">{student?.full_name || '—'}</p>
                        <p className="text-xs text-gray-400">{student?.email}</p>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 text-slate-600 hidden md:table-cell">{course?.title || '—'}</td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-gray-900 dark:text-white text-sm">A${payment.amount.toFixed(2)}</p>
                        {payment.discount_percent > 0 && <p className="text-xs text-green-500">{payment.discount_percent}% off ({payment.promo_code})</p>}
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <Badge variant={statusColors[payment.status] || 'default'}>{payment.status}</Badge>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 text-slate-500 hidden lg:table-cell">{new Date(payment.created_at).toLocaleDateString('en-AU')}</td>
                      <td className="px-4 py-3 text-right">
                        {payment.status === 'completed' && (
                          <button onClick={() => setRefundTarget(payment)} className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 font-medium ml-auto">
                            <RefreshCw className="w-3.5 h-3.5" /> Refund
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!loading && filtered.length === 0 && (
              <div className="text-center py-12">
                <DollarSign className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                <p className="text-gray-500 text-slate-500 text-sm">No payments found</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog isOpen={!!refundTarget} title="Process Refund" message={`Issue a refund of A$${refundTarget?.amount.toFixed(2)} to the student?`} variant="warning" onConfirm={handleRefund} onCancel={() => setRefundTarget(null)} confirmText={refunding ? 'Processing...' : 'Issue Refund'} />
    </DashboardLayout>
  );
}
