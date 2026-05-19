import { useState, useEffect } from 'react';
import { Video, Clock, CheckCircle2, XCircle, CalendarDays, MessageSquare, Plus, X, ExternalLink } from 'lucide-react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { studentNavItems } from './studentNav';
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
  course: { title: string; thumbnail_url: string | null } | null;
  teacher: { full_name: string } | null;
}

interface Course {
  id: string;
  title: string;
  teacher_id: string;
}

const STATUS_CONFIG = {
  pending:   { label: 'Pending Review', color: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',   icon: Clock        },
  approved:  { label: 'Confirmed',      color: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300', icon: CheckCircle2 },
  rejected:  { label: 'Not Available',  color: 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400',           icon: XCircle      },
  cancelled: { label: 'Cancelled',      color: 'bg-gray-100 dark:bg-navy-700 text-gray-500 dark:text-gray-400',          icon: XCircle      },
};

export default function StudentF2FRequests() {
  const { profile } = useAuth();
  const [requests, setRequests]           = useState<F2FRequest[]>([]);
  const [enrolledCourses, setEnrolledCourses] = useState<Course[]>([]);
  const [loading, setLoading]             = useState(true);
  const [showForm, setShowForm]           = useState(false);
  const [submitting, setSubmitting]       = useState(false);
  const [form, setForm]                   = useState({ course_id: '', message: '', preferred_times: '' });

  const fetchRequests = async () => {
    if (!profile) return;
    const { data } = await supabase
      .from('f2f_requests')
      .select('*, course:courses(title, thumbnail_url), teacher:profiles!f2f_requests_teacher_id_fkey(full_name)')
      .eq('student_id', profile.id)
      .order('created_at', { ascending: false });
    if (data) setRequests(data as F2FRequest[]);
  };

  useEffect(() => {
    if (!profile) return;
    const load = async () => {
      await fetchRequests();

      // Merge both enrollment tables to get all enrolled courses with teacher_id
      const [ceRes, eRes] = await Promise.all([
        supabase.from('course_enrollments').select('course_id').eq('user_id', profile.id),
        supabase.from('enrollments').select('course_id').eq('student_id', profile.id),
      ]);

      const allCourseIds = [
        ...new Set([
          ...(ceRes.data || []).map(r => r.course_id),
          ...(eRes.data  || []).map(r => r.course_id),
        ]),
      ];

      if (allCourseIds.length > 0) {
        const { data: coursesData } = await supabase
          .from('courses')
          .select('id, title, teacher_id')
          .in('id', allCourseIds)
          .not('teacher_id', 'is', null); // only courses that have a teacher

        if (coursesData && coursesData.length > 0) {
          const courses = coursesData as Course[];
          setEnrolledCourses(courses);
          setForm(f => ({ ...f, course_id: courses[0].id }));
        }
      }

      setLoading(false);
    };
    load();
  }, [profile]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !form.course_id || !form.message.trim()) return;
    const course = enrolledCourses.find(c => c.id === form.course_id);
    if (!course) { toast.error('Selected course not found.'); return; }
    if (!course.teacher_id) { toast.error('This course has no teacher assigned yet.'); return; }

    setSubmitting(true);
    const { error } = await supabase.from('f2f_requests').insert({
      student_id:      profile.id,
      teacher_id:      course.teacher_id,
      course_id:       form.course_id,
      message:         form.message.trim(),
      preferred_times: form.preferred_times.trim() || null,
    });
    if (error) {
      toast.error('Failed to submit request. Please try again.');
    } else {
      toast.success('Request sent! Your teacher will be notified.');
      setShowForm(false);
      setForm(f => ({ ...f, message: '', preferred_times: '' }));
      await fetchRequests();
    }
    setSubmitting(false);
  };

  const handleCancel = async (id: string) => {
    const { error } = await supabase
      .from('f2f_requests')
      .update({ status: 'cancelled' })
      .eq('id', id);
    if (!error) {
      toast.success('Request cancelled.');
      await fetchRequests();
    }
  };

  const approvedRequests = requests.filter(r => r.status === 'approved');

  return (
    <DashboardLayout navItems={studentNavItems} title="Face-to-Face Sessions" subtitle="Request live sessions with your teachers">
      <div className="space-y-6">

        {/* Confirmed session banner — shown at the top whenever there's an approved session */}
        {approvedRequests.length > 0 && (
          <div className="rounded-2xl overflow-hidden border border-emerald-300 dark:border-emerald-700 shadow-sm">
            <div className="flex items-center gap-3 px-5 py-3 bg-emerald-600">
              <Video className="w-5 h-5 text-white shrink-0" />
              <p className="text-sm font-bold text-white flex-1">
                {approvedRequests.length === 1
                  ? 'You have a confirmed session!'
                  : `${approvedRequests.length} confirmed sessions`}
              </p>
            </div>
            {approvedRequests.map(req => (
              <div key={req.id} className="px-5 py-4 bg-emerald-50 dark:bg-emerald-900/20 flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-emerald-900 dark:text-emerald-200">{req.course?.title}</p>
                  <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-0.5">
                    with {req.teacher?.full_name}
                    {req.scheduled_at && (
                      <> · {new Date(req.scheduled_at).toLocaleString('en-AU', { dateStyle: 'full', timeStyle: 'short' })} ({req.duration_minutes} min)</>
                    )}
                  </p>
                  {req.teacher_notes && (
                    <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1 italic">"{req.teacher_notes}"</p>
                  )}
                </div>
                {req.meeting_link && (
                  <a
                    href={req.meeting_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl transition-colors shadow-sm shrink-0"
                  >
                    <ExternalLink className="w-4 h-4" /> Join Session
                  </a>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Header action */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {requests.length === 0 ? 'No requests yet' : `${requests.length} request${requests.length !== 1 ? 's' : ''}`}
          </p>
          <button
            onClick={() => setShowForm(true)}
            disabled={enrolledCourses.length === 0}
            className="btn-primary text-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-4 h-4" /> Request Session
          </button>
        </div>

        {/* New request form */}
        {showForm && (
          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Video className="w-5 h-5 text-sky-500" /> New Face-to-Face Request
              </h3>
              <button onClick={() => setShowForm(false)} className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Course</label>
                <select
                  value={form.course_id}
                  onChange={e => setForm(f => ({ ...f, course_id: e.target.value }))}
                  className="input-field"
                  required
                >
                  {enrolledCourses.map(c => (
                    <option key={c.id} value={c.id}>{c.title}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">What would you like help with?</label>
                <textarea
                  value={form.message}
                  onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                  className="input-field resize-none"
                  rows={3}
                  placeholder="Describe what topics or questions you'd like to cover in the session..."
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Preferred times <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={form.preferred_times}
                  onChange={e => setForm(f => ({ ...f, preferred_times: e.target.value }))}
                  className="input-field"
                  placeholder="e.g. Weekday evenings after 6pm AEST, or Saturday mornings"
                />
              </div>
              <div className="flex gap-3 justify-end">
                <button type="button" onClick={() => setShowForm(false)} className="btn-ghost text-sm">Cancel</button>
                <button type="submit" disabled={submitting} className="btn-primary text-sm disabled:opacity-60">
                  {submitting ? 'Sending...' : 'Send Request'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Requests list */}
        {loading ? (
          <div className="space-y-4">
            {[1, 2].map(i => <div key={i} className="card h-28 animate-pulse" />)}
          </div>
        ) : requests.length === 0 ? (
          <div className="card py-16 text-center">
            <Video className="w-12 h-12 text-gray-200 dark:text-navy-600 mx-auto mb-3" />
            <p className="font-semibold text-gray-900 dark:text-white mb-1">No requests yet</p>
            <p className="text-sm text-gray-400 dark:text-gray-500 mb-6">Request a face-to-face session with a teacher for any enrolled course.</p>
            {enrolledCourses.length === 0 && (
              <p className="text-xs text-amber-600 dark:text-amber-400">Enrol in a course first to request a session.</p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {requests.map(req => {
              const cfg = STATUS_CONFIG[req.status];
              const StatusIcon = cfg.icon;
              return (
                <div key={req.id} className={`card p-5 ${req.status === 'approved' ? 'ring-2 ring-emerald-300 dark:ring-emerald-700' : ''}`}>
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 dark:text-white truncate">{req.course?.title ?? '—'}</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                        Teacher: {req.teacher?.full_name ?? '—'} · {new Date(req.created_at).toLocaleDateString('en-AU')}
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

                  {req.status === 'approved' && (
                    <div className="mt-3 p-4 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 space-y-3">
                      <p className="text-sm font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4" /> Session Confirmed
                      </p>
                      {req.scheduled_at && (
                        <p className="text-sm text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
                          <CalendarDays className="w-4 h-4 shrink-0" />
                          {new Date(req.scheduled_at).toLocaleString('en-AU', { dateStyle: 'full', timeStyle: 'short' })}
                          {' '}· {req.duration_minutes} min
                        </p>
                      )}
                      {req.teacher_notes && (
                        <p className="text-xs text-emerald-600 dark:text-emerald-400 italic">"{req.teacher_notes}"</p>
                      )}
                      {req.meeting_link && (
                        <a
                          href={req.meeting_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl transition-colors shadow-sm"
                        >
                          <ExternalLink className="w-4 h-4" /> Join Session
                        </a>
                      )}
                    </div>
                  )}

                  {req.status === 'rejected' && req.teacher_notes && (
                    <div className="mt-3 p-3 rounded-lg bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800">
                      <p className="text-xs text-red-600 dark:text-red-400">{req.teacher_notes}</p>
                    </div>
                  )}

                  {req.status === 'pending' && (
                    <div className="mt-3 flex justify-end">
                      <button
                        onClick={() => handleCancel(req.id)}
                        className="text-xs text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                      >
                        Cancel request
                      </button>
                    </div>
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
