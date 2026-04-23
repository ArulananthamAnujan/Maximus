import { useState, useEffect } from 'react';
import { Plus, Video, Trash2, ExternalLink, Calendar } from 'lucide-react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { teacherNavItems } from './teacherNav';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import type { LiveSession, Course } from '../../types';

export default function TeacherLiveSessions() {
  const [sessions, setSessions] = useState<LiveSession[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<LiveSession | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ course_id: '', title: '', description: '', meeting_link: '', scheduled_at: '', duration_minutes: 60 });
  const [creating, setCreating] = useState(false);
  const { profile } = useAuth();
  const { toast } = useToast();

  const fetchData = async () => {
    if (!profile) return;
    const { data: coursesData } = await supabase.from('courses').select('id, title').eq('teacher_id', profile.id);
    if (coursesData) {
      setCourses(coursesData as Course[]);
      const courseIds = coursesData.map(c => c.id);
      if (courseIds.length > 0) {
        const { data } = await supabase.from('live_sessions').select('*, course:courses(title)').in('course_id', courseIds).order('scheduled_at', { ascending: true });
        if (data) setSessions(data as LiveSession[]);
      }
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [profile]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    const { error } = await supabase.from('live_sessions').insert({ ...form, teacher_id: profile?.id, duration_minutes: form.duration_minutes });
    if (!error) { toast.success('Session scheduled'); setShowCreate(false); fetchData(); }
    else toast.error('Failed to schedule session');
    setCreating(false);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await supabase.from('live_sessions').delete().eq('id', deleteTarget.id);
    toast.success('Session deleted');
    setDeleteTarget(null);
    fetchData();
  };

  const upcoming = sessions.filter(s => new Date(s.scheduled_at) > new Date());
  const past = sessions.filter(s => new Date(s.scheduled_at) <= new Date());

  return (
    <DashboardLayout navItems={teacherNavItems} title="Live Sessions" subtitle="Schedule live sessions for your students">
      <div className="space-y-5">
        <div className="flex justify-end">
          <button onClick={() => setShowCreate(true)} className="btn-primary text-sm py-2 flex items-center gap-2">
            <Plus className="w-4 h-4" /> Schedule Session
          </button>
        </div>

        {loading ? (
          <div className="space-y-3">{[1,2].map(i => <div key={i} className="card p-5 animate-pulse"><div className="h-5 bg-gray-200 dark:bg-navy-700 rounded w-1/3 mb-2" /></div>)}</div>
        ) : sessions.length === 0 ? (
          <div className="card text-center py-16">
            <Video className="w-10 h-10 text-gray-400 mx-auto mb-3" />
            <h3 className="font-semibold text-gray-900 dark:text-white mb-1">No sessions scheduled</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">Schedule a live session to meet with your students.</p>
          </div>
        ) : (
          <>
            {upcoming.length > 0 && (
              <div>
                <h2 className="font-semibold text-gray-900 dark:text-white mb-3">Upcoming Sessions</h2>
                <div className="space-y-3">
                  {upcoming.map(s => <SessionCard key={s.id} session={s} onDelete={setDeleteTarget} />)}
                </div>
              </div>
            )}
            {past.length > 0 && (
              <div>
                <h2 className="font-semibold text-gray-500 dark:text-gray-400 mb-3">Past Sessions</h2>
                <div className="space-y-3 opacity-70">
                  {past.map(s => <SessionCard key={s.id} session={s} onDelete={setDeleteTarget} />)}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowCreate(false)} />
          <div className="relative bg-white dark:bg-navy-800 rounded-2xl shadow-2xl w-full max-w-md p-6 animate-slide-up">
            <h3 className="font-playfair text-xl font-bold text-gray-900 dark:text-white mb-5">Schedule Live Session</h3>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Course</label>
                <select value={form.course_id} onChange={e => setForm(f => ({ ...f, course_id: e.target.value }))} className="input-field" required>
                  <option value="">Select course...</option>
                  {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Session Title</label>
                <input type="text" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className="input-field" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Description (optional)</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="input-field resize-none" rows={2} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Meeting Link (Zoom/Teams/Google Meet)</label>
                <input type="url" value={form.meeting_link} onChange={e => setForm(f => ({ ...f, meeting_link: e.target.value }))} className="input-field" placeholder="https://zoom.us/j/..." required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Date & Time</label>
                  <input type="datetime-local" value={form.scheduled_at} onChange={e => setForm(f => ({ ...f, scheduled_at: e.target.value }))} className="input-field" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Duration (min)</label>
                  <input type="number" min="15" value={form.duration_minutes} onChange={e => setForm(f => ({ ...f, duration_minutes: parseInt(e.target.value) }))} className="input-field" required />
                </div>
              </div>
              <div className="flex gap-3 justify-end pt-2">
                <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm border border-gray-200 dark:border-navy-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-navy-700 transition-colors">Cancel</button>
                <button type="submit" disabled={creating} className="btn-primary text-sm py-2 disabled:opacity-60">{creating ? 'Scheduling...' : 'Schedule'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog isOpen={!!deleteTarget} title="Delete Session" message="Delete this session?" onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} confirmText="Delete" />
    </DashboardLayout>
  );
}

function SessionCard({ session, onDelete }: { session: LiveSession; onDelete: (s: LiveSession) => void }) {
  const isUpcoming = new Date(session.scheduled_at) > new Date();
  const course = session.course as { title?: string } | undefined;
  return (
    <div className="card p-4 flex items-start gap-4">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isUpcoming ? 'bg-blue-100 dark:bg-blue-900/30' : 'bg-gray-100 dark:bg-navy-700'}`}>
        <Video className={`w-5 h-5 ${isUpcoming ? 'text-blue-600' : 'text-gray-400'}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <h3 className="font-semibold text-gray-900 dark:text-white text-sm">{session.title}</h3>
          {isUpcoming && <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-2 py-0.5 rounded-full font-medium">Upcoming</span>}
        </div>
        <p className="text-xs text-gray-400">{course?.title}</p>
        <div className="flex items-center gap-3 mt-2">
          <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
            <Calendar className="w-3.5 h-3.5" />
            {new Date(session.scheduled_at).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })}
          </span>
          <span className="text-xs text-gray-400">{session.duration_minutes} min</span>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {session.meeting_link && (
          <a href={session.meeting_link} target="_blank" rel="noreferrer" className="p-1.5 rounded-lg text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors">
            <ExternalLink className="w-4 h-4" />
          </a>
        )}
        <button onClick={() => onDelete(session)} className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
