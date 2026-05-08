import { useState, useEffect } from 'react';
import { Search, DollarSign, RefreshCw, CheckCircle2, X, Clock, TrendingUp } from 'lucide-react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { adminNavItems } from './adminNav';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../contexts/ToastContext';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import Badge from '../../components/ui/Badge';
import type { Payment } from '../../types';

interface PayoutRequest {
  id: string;
  amount_cents: number;
  currency: string;
  payout_method: string;
  bank_name: string | null;
  account_name: string | null;
  account_number: string | null;
  bsb: string | null;
  paypal_email: string | null;
  status: string;
  notes: string | null;
  requested_at: string;
  processed_at: string | null;
  teacher: { full_name: string; email: string } | null;
}

const fmt = (cents: number) => `A$${(cents / 100).toFixed(2)}`;

export default function AdminPayments() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [payouts, setPayouts] = useState<PayoutRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [payoutsLoading, setPayoutsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [payoutStatusFilter, setPayoutStatusFilter] = useState('requested');
  const [refundTarget, setRefundTarget] = useState<Payment | null>(null);
  const [refunding, setRefunding] = useState(false);
  const [tab, setTab] = useState<'payments' | 'payouts'>('payments');
  const [processingPayout, setProcessingPayout] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchPayments = async () => {
    let query = supabase.from('payments').select('*, student:profiles(full_name, email), course:courses(title)').order('created_at', { ascending: false });
    if (statusFilter !== 'all') query = query.eq('status', statusFilter);
    const { data } = await query;
    if (data) setPayments(data as Payment[]);
    setLoading(false);
  };

  const fetchPayouts = async () => {
    setPayoutsLoading(true);
    let query = supabase.from('teacher_payouts')
      .select('*, teacher:profiles(full_name, email)')
      .order('requested_at', { ascending: false });
    if (payoutStatusFilter !== 'all') query = query.eq('status', payoutStatusFilter);
    const { data } = await query;
    if (data) setPayouts(data as PayoutRequest[]);
    setPayoutsLoading(false);
  };

  useEffect(() => { fetchPayments(); }, [statusFilter]);
  useEffect(() => { fetchPayouts(); }, [payoutStatusFilter]);

  const handleRefund = async () => {
    if (!refundTarget) return;
    setRefunding(true);
    const { error } = await supabase.from('payments').update({ status: 'refunded' }).eq('id', refundTarget.id);
    if (!error) { toast.success('Refund processed successfully'); fetchPayments(); }
    else toast.error('Failed to process refund');
    setRefundTarget(null);
    setRefunding(false);
  };

  const handleUpdatePayout = async (id: string, status: 'processing' | 'completed' | 'rejected') => {
    setProcessingPayout(id);
    const { error } = await supabase.from('teacher_payouts').update({ status, processed_at: new Date().toISOString() }).eq('id', id);
    if (!error) {
      toast.success(`Payout marked as ${status}`);
      fetchPayouts();
    } else {
      toast.error('Failed to update payout');
    }
    setProcessingPayout(null);
  };

  const statusColors: Record<string, 'success' | 'warning' | 'error' | 'default'> = { completed: 'success', pending: 'warning', refunded: 'info' as 'default', failed: 'error' };

  const totalRevenue = payments.filter(p => p.status === 'completed').reduce((sum, p) => sum + p.amount, 0);
  const pendingPayoutTotal = payouts.filter(p => p.status === 'requested').reduce((sum, p) => sum + p.amount_cents, 0);

  const filtered = payments.filter(p => {
    const student = p.student as { full_name?: string; email?: string } | undefined;
    const course = p.course as { title?: string } | undefined;
    const q = search.toLowerCase();
    return !search || student?.full_name?.toLowerCase().includes(q) || student?.email?.toLowerCase().includes(q) || course?.title?.toLowerCase().includes(q);
  });

  const payoutStatusBadge = (s: string) => {
    const map: Record<string, 'success' | 'warning' | 'error' | 'default'> = { completed: 'success', requested: 'warning', processing: 'default', rejected: 'error' };
    return map[s] ?? 'default';
  };

  return (
    <DashboardLayout navItems={adminNavItems} title="Payments & Payouts" subtitle="Manage transactions and teacher payouts">
      <div className="space-y-5">

        {/* Summary stats */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          {[
            { label: 'Total Revenue', value: `A$${totalRevenue.toLocaleString('en-AU', { minimumFractionDigits: 2 })}`, color: 'text-emerald-600', icon: DollarSign },
            { label: 'Total Transactions', value: payments.length.toString(), color: 'text-gray-900 dark:text-white', icon: TrendingUp },
            { label: 'Refunds Issued', value: payments.filter(p => p.status === 'refunded').length.toString(), color: 'text-red-500', icon: RefreshCw },
            { label: 'Pending Payouts', value: fmt(pendingPayoutTotal), color: 'text-amber-600', icon: Clock },
          ].map(stat => (
            <div key={stat.label} className="card p-5">
              <div className="flex items-center gap-2 mb-2">
                <stat.icon className="w-4 h-4 text-gray-400" />
                <p className="text-sm text-gray-500 dark:text-gray-400">{stat.label}</p>
              </div>
              <p className={`text-2xl font-bold font-playfair ${stat.color}`}>{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-gray-100 dark:bg-navy-800 rounded-xl w-fit">
          {(['payments', 'payouts'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all capitalize ${tab === t ? 'bg-white dark:bg-navy-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}>
              {t}
              {t === 'payouts' && payouts.filter(p => p.status === 'requested').length > 0 && (
                <span className="ml-2 bg-amber-500 text-white text-xs px-1.5 py-0.5 rounded-full">{payouts.filter(p => p.status === 'requested').length}</span>
              )}
            </button>
          ))}
        </div>

        {/* Payments tab */}
        {tab === 'payments' && (
          <>
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
                    <tr className="bg-gray-50 dark:bg-navy-900/50 border-b border-gray-100 dark:border-navy-700">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Student</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase hidden md:table-cell">Course</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Amount</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase hidden sm:table-cell">Status</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase hidden lg:table-cell">Date</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-navy-700">
                    {loading ? Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i}>{[1,2,3,4,5,6].map(j => <td key={j} className="px-4 py-3"><div className="h-4 bg-gray-200 dark:bg-navy-700 rounded animate-pulse" /></td>)}</tr>
                    )) : filtered.map(payment => {
                      const student = payment.student as { full_name?: string; email?: string } | undefined;
                      const course = payment.course as { title?: string } | undefined;
                      return (
                        <tr key={payment.id} className="hover:bg-gray-50 dark:hover:bg-navy-700/30 transition-colors">
                          <td className="px-4 py-3">
                            <p className="font-medium text-gray-900 dark:text-white text-sm">{student?.full_name || '—'}</p>
                            <p className="text-xs text-gray-400">{student?.email}</p>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300 hidden md:table-cell">{course?.title || '—'}</td>
                          <td className="px-4 py-3">
                            <p className="font-semibold text-gray-900 dark:text-white text-sm">A${payment.amount.toFixed(2)}</p>
                            {payment.discount_percent > 0 && <p className="text-xs text-emerald-500">{payment.discount_percent}% off ({payment.promo_code})</p>}
                          </td>
                          <td className="px-4 py-3 hidden sm:table-cell">
                            <Badge variant={statusColors[payment.status] || 'default'}>{payment.status}</Badge>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 hidden lg:table-cell">{new Date(payment.created_at).toLocaleDateString('en-AU')}</td>
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
                    <DollarSign className="w-8 h-8 text-gray-300 dark:text-navy-600 mx-auto mb-2" />
                    <p className="text-gray-500 dark:text-gray-400 text-sm">No payments found</p>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* Payouts tab */}
        {tab === 'payouts' && (
          <>
            <div className="flex gap-3">
              <select value={payoutStatusFilter} onChange={e => setPayoutStatusFilter(e.target.value)} className="input-field py-2 text-sm w-44">
                <option value="all">All Payouts</option>
                <option value="requested">Requested</option>
                <option value="processing">Processing</option>
                <option value="completed">Completed</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>

            <div className="card overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 dark:border-navy-700 bg-amber-50 dark:bg-amber-900/10 flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
                  {payouts.filter(p => p.status === 'requested').length} payout request(s) awaiting action · {fmt(pendingPayoutTotal)} total
                </p>
              </div>
              {payoutsLoading ? (
                <div className="p-6 space-y-3">{[1,2,3].map(i => <div key={i} className="h-16 bg-gray-100 dark:bg-navy-700 rounded-xl animate-pulse" />)}</div>
              ) : payouts.length === 0 ? (
                <div className="py-12 text-center">
                  <CheckCircle2 className="w-8 h-8 text-gray-200 dark:text-navy-600 mx-auto mb-2" />
                  <p className="text-gray-400 text-sm">No payout requests</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-navy-700">
                  {payouts.map(payout => (
                    <div key={payout.id} className="px-5 py-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-semibold text-gray-900 dark:text-white">{payout.teacher?.full_name ?? '—'}</p>
                            <span className="text-xs text-gray-400">{payout.teacher?.email}</span>
                          </div>
                          <div className="flex flex-wrap items-center gap-3 text-sm">
                            <span className="font-bold text-emerald-600 dark:text-emerald-400 text-base">{fmt(payout.amount_cents)}</span>
                            <span className="text-gray-400">·</span>
                            <span className="text-gray-500 dark:text-gray-400 capitalize">{payout.payout_method === 'bank' ? 'Bank Transfer' : 'PayPal'}</span>
                            <span className="text-gray-400">·</span>
                            <span className="text-gray-400 text-xs">{new Date(payout.requested_at).toLocaleDateString('en-AU')}</span>
                            <Badge variant={payoutStatusBadge(payout.status)}>{payout.status}</Badge>
                          </div>
                          {payout.payout_method === 'bank' && payout.bank_name && (
                            <div className="mt-2 text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-navy-900/40 rounded-lg px-3 py-2 inline-block">
                              {payout.bank_name} · BSB: {payout.bsb} · Acc: {payout.account_number} · {payout.account_name}
                            </div>
                          )}
                          {payout.payout_method === 'paypal' && payout.paypal_email && (
                            <div className="mt-2 text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-navy-900/40 rounded-lg px-3 py-2 inline-block">
                              PayPal: {payout.paypal_email}
                            </div>
                          )}
                        </div>
                        {payout.status === 'requested' && (
                          <div className="flex gap-2 shrink-0">
                            <button
                              onClick={() => handleUpdatePayout(payout.id, 'processing')}
                              disabled={!!processingPayout}
                              className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 hover:bg-sky-200 dark:hover:bg-sky-900/50 rounded-lg transition-colors disabled:opacity-50"
                            >
                              <Clock className="w-3.5 h-3.5" /> Processing
                            </button>
                            <button
                              onClick={() => handleUpdatePayout(payout.id, 'completed')}
                              disabled={!!processingPayout}
                              className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-200 dark:hover:bg-emerald-900/50 rounded-lg transition-colors disabled:opacity-50"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" /> Paid
                            </button>
                            <button
                              onClick={() => handleUpdatePayout(payout.id, 'rejected')}
                              disabled={!!processingPayout}
                              className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors disabled:opacity-50"
                            >
                              <X className="w-3.5 h-3.5" /> Reject
                            </button>
                          </div>
                        )}
                        {payout.status === 'processing' && (
                          <button
                            onClick={() => handleUpdatePayout(payout.id, 'completed')}
                            disabled={!!processingPayout}
                            className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-200 rounded-lg transition-colors disabled:opacity-50 shrink-0"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" /> Mark Paid
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <ConfirmDialog isOpen={!!refundTarget} title="Process Refund" message={`Issue a refund of A$${refundTarget?.amount.toFixed(2)} to the student?`} variant="warning" onConfirm={handleRefund} onCancel={() => setRefundTarget(null)} confirmText={refunding ? 'Processing...' : 'Issue Refund'} />
    </DashboardLayout>
  );
}
