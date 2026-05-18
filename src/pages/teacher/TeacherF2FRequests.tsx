import { useState, useEffect } from 'react';
import { Video, Clock, CheckCircle2, XCircle, CalendarDays, Link as LinkIcon, MessageSquare, Bell } from 'lucide-react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { teacherNavItems } from './teacherNav';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'sonner';

interface F2FRequest {
  id: string;
  message: string;
  preferred_times: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  meeting_link: string | null;
  scheduled_at: string | null;
  duration_minutes: number;
  teacher_notes: string | null;
  created_at: string;
  course: { title: string } | null;
  student: { full_name: string; email: string } | null;
}

interface ApproveForm {
  meeting_link: string;
  scheduled_at: string;
  duration_minutes: number;
  teacher_notes: string;
}

const STATUS_CONFIG = {
  pending: { label: 'Pending', color: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300', icon: Clock },
  approved: { label: 'Approved', color: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300', icon: CheckCircle2 },
  rejected: { label: 'Declined', color: 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400', icon: XCircle },
  cancelled: { label: 'Cancelled', color: 'bg-gray-100 dark:bg-navy-700 text-gray-500 dark:text-gray-400', icon: XCircle },
};

export default function TeacherF2FRequests() {
  const { profile } = useAuth();
  const [requests, setRequests] = useState<F2FRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');
  const [selectedRequest, setSelectedRequest] = useState<F2FRequest | null>(null);
  const [approveForm, setApproveForm] = useState<ApproveForm>({
    meeting_link: '', scheduled_at: '', duration_minutes: 60, teacher_notes: '',
  });
  const [rejectNote, setRejectNote] = useState('');
  const [actionMode, setActionMode] = useState<'approve' | 'reject' | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const fetchRequests = async () => {
    if (!profile) return;
    let q = supabase
      .from('f2f_requests')
      .select('*, course:courses(title), student:profiles!f2f_requests_student_id_fkey(full_name, email)')
      .eq('teacher_id', profile.id)
      .order('created_at', { ascending: false });
    if (filter === 'pending') q = q.eq('status', 'pending');
    const { data } = await q;
    if (data) setRequests(data as F2FRequest[]);
  };

  useEffect(() => {
    if (!profile) return;
    fetchRequests().then(() => setLoading(false));
  }, [profile, filter]);

  const handleApprove = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRequest) return;
    if (!approveForm.meeting_link.trim() || !approveForm.scheduled_at) {
      toast.error('Please provide a meeting link and scheduled time.'); return;
    }
    setSubmitting(true);
    const { error } = await supabase.from('f2f_requests').update({
      status: 'approved',
      meeting_link: approveForm.meeting_link.trim(),
      scheduled_at: approveForm.scheduled_at,
      duration_minutes: approveForm.duration_minutes,
      teacher_notes: approveForm.teacher_notes.trim() || null,
      updated_at: new Date().toISOString(),
    }).eq('id', selectedRequest.id);
    if (error) {
      toast.error('Failed to approve request.');
    } else {
      toast.success('Session approved! The student has been notified.');
      setSelectedRequest(null);
      setActionMode(null);
      await fetchRequests();
    }
    setSubmitting(false);
  };

  const handleReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRequest) return;
    setSubmitting(true);
    const { error } = await supabase.from('f2f_requests').update({
      status: 'rejected',
      teacher_notes: rejectNote.trim() || null,
      updated_at: new Date().toISOString(),
    }).eq('id', selectedRequest.id);
    if (error) {
      toast.error('Failed to decline request.');
    } else {
      toast.success('Request declined. The student has been notified.');
      setSelectedRequest(null);
      setActionMode(null);
      setRejectNote('');
      await fetchRequests();
    }
    setSubmitting(false);
  };

  const pendingCount = requests.filter(r => r.status === 'pending').length;

  return (
    <DashboardLayout
      navItems={teacherNavItems}
      title="Face-to-Face Requests"
      subtitle="Review and respond to student session requests"
    >
      <div className="space-y-6">

        {/* Pending badge */}
        {pendingCount > 0 && filter !== 'pending' && (
          <div className="card p-4 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 flex items-center gap-3">
            <Bell className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
            <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
              {pendingCount} pending request{pendingCount !== 1 ? 's' : ''} awaiting your response
            </p>
            <button onClick={() => setFilter('pending')} className="ml-auto text-xs font-semibold text-amber-700 dark:text-amber-300 underline">
              View pending
            </button>
          </div>
        )}

        {/* Filter tabs */}
        <div className="flex gap-1 p-1 bg-gray-100 dark:bg-navy-800 rounded-xl w-fit">
          {(['pending', 'all'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all capitalize ${filter === f ? 'bg-white dark:bg-navy-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}>
              {f === 'pending' ? `Pending${pendingCount > 0 ? ` (${pendingCount})` : ''}` : 'All Requests'}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-4">{[1,2,3].map(i => <div key={i} className="card h-28 animate-pulse" />)}</div>
        ) : requests.length === 0 ? (
          <div className="card py-16 text-center">
            <Video className="w-12 h-12 text-gray-200 dark:text-navy-600 mx-auto mb-3" />
            <p className="font-semibold text-gray-900 dark:text-white mb-1">
              {filter === 'pending' ? 'No pending requests' : 'No requests yet'}
            </p>
            <p className="text-sm text-gray-400 dark:text-gray-500">
              {filter === 'pending' ? 'All caught up!' : 'Students can request face-to-face sessions from their course player.'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {requests.map(req => {
              const cfg = STATUS_CONFIG[req.status];
              const StatusIcon = cfg.icon;
              const isSelected = selectedRequest?.id === req.id;
              return (
                <div key={req.id} className="card p-5">
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 dark:text-white">{req.student?.full_name ?? '—'}</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                        {req.student?.email} · {req.course?.title ?? '—'} · {new Date(req.created_at).toLocaleDateString('en-AU')}
                      </p>
                    </div>
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold shrink-0 ${cfg.color}`}>
                      <StatusIcon className="w-3.5 h-3.5" />
                      {cfg.label}
                    </span>
                  </div>

                  <div className="flex items-start gap-2 mb-3">
                    <MessageSquare className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
                    <p className="text-sm text-gray-600 dark:text-gray-300">{req.message}</p>
                  </div>

                  {req.preferred_times && (
                    <div className="flex items-center gap-2 mb-3 text-xs text-gray-500 dark:text-gray-400">
                      <CalendarDays className="w-3.5 h-3.5 text-gray-400" />
                      Preferred: {req.preferred_times}
                    </div>
                  )}

                  {req.status === 'approved' && req.meeting_link && (
                    <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400 mb-3">
                      <LinkIcon className="w-3.5 h-3.5" />
                      <a href={req.meeting_link} target="_blank" rel="noopener noreferrer" className="underline truncate">{req.meeting_link}</a>
                      {req.scheduled_at && <span>· {new Date(req.scheduled_at).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })}</span>}
                    </div>
                  )}

                  {req.status === 'pending' && (
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={() => { setSelectedRequest(req); setActionMode('approve'); }}
                        className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-200 dark:hover:bg-emerald-900/50 rounded-lg transition-colors"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                      </button>
                      <button
                        onClick={() => { setSelectedRequest(req); setActionMode('reject'); }}
                        className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                      >
                        <XCircle className="w-3.5 h-3.5" /> Decline
                      </button>
                    </div>
                  )}

                  {/* Approve form */}
                  {isSelected && actionMode === 'approve' && (
                    <form onSubmit={handleApprove} className="mt-4 pt-4 border-t border-gray-100 dark:border-navy-700 space-y-4">
                      <h4 className="font-semibold text-gray-900 dark:text-white text-sm flex items-center gap-2">
                        <Video className="w-4 h-4 text-emerald-500" /> Approve Session
                      </h4>
                      <div className="grid sm:grid-cols-2 gap-4">
                        <div className="sm:col-span-2">
                          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Meeting Link (Zoom, Teams, Google Meet)</label>
                          <input
                            type="url" value={approveForm.meeting_link}
                            onChange={e => setApproveForm(f => ({ ...f, meeting_link: e.target.value }))}
                            className="input-field text-sm" placeholder="https://zoom.us/j/..." required
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Scheduled Date & Time</label>
                          <input
                            type="datetime-local" value={approveForm.scheduled_at}
                            onChange={e => setApproveForm(f => ({ ...f, scheduled_at: e.target.value }))}
                            className="input-field text-sm" required
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Duration (minutes)</label>
                          <select
                            value={approveForm.duration_minutes}
                            onChange={e => setApproveForm(f => ({ ...f, duration_minutes: parseInt(e.target.value) }))}
                            className="input-field text-sm"
                          >
                            {[30, 45, 60, 90, 120].map(m => <option key={m} value={m}>{m} minutes</option>)}
                          </select>
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Note to student <span className="font-normal text-gray-400">(optional)</span></label>
                          <input
                            type="text" value={approveForm.teacher_notes}
                            onChange={e => setApproveForm(f => ({ ...f, teacher_notes: e.target.value }))}
                            className="input-field text-sm" placeholder="e.g. Please have your notes ready"
                          />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => { setSelectedRequest(null); setActionMode(null); }} className="btn-ghost text-sm">Cancel</button>
                        <button type="submit" disabled={submitting} className="btn-primary text-sm disabled:opacity-60">
                          {submitting ? 'Saving...' : 'Confirm & Notify Student'}
                        </button>
                      </div>
                    </form>
                  )}

                  {/* Reject form */}
                  {isSelected && actionMode === 'reject' && (
                    <form onSubmit={handleReject} className="mt-4 pt-4 border-t border-gray-100 dark:border-navy-700 space-y-3">
                      <h4 className="font-semibold text-gray-900 dark:text-white text-sm flex items-center gap-2">
                        <XCircle className="w-4 h-4 text-red-500" /> Decline Request
                      </h4>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Reason <span className="font-normal text-gray-400">(optional)</span></label>
                        <input
                          type="text" value={rejectNote} onChange={e => setRejectNote(e.target.value)}
                          className="input-field text-sm" placeholder="e.g. Currently unavailable — please try again next week"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => { setSelectedRequest(null); setActionMode(null); }} className="btn-ghost text-sm">Cancel</button>
                        <button type="submit" disabled={submitting} className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-60">
                          {submitting ? 'Saving...' : 'Decline & Notify Student'}
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
