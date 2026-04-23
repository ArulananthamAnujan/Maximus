import { useState, useEffect } from 'react';
import { MessageSquare, Trash2, Pin } from 'lucide-react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { teacherNavItems } from './teacherNav';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import type { Discussion, Course } from '../../types';

export default function TeacherDiscussions() {
  const [discussions, setDiscussions] = useState<Discussion[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseFilter, setCourseFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<Discussion | null>(null);
  const { profile } = useAuth();
  const { toast } = useToast();

  const fetchData = async () => {
    if (!profile) return;
    const { data: coursesData } = await supabase.from('courses').select('id, title').eq('teacher_id', profile.id);
    if (coursesData) {
      setCourses(coursesData as Course[]);
      const courseIds = coursesData.map(c => c.id);
      if (courseIds.length > 0) {
        let query = supabase.from('discussions').select('*, author:profiles(full_name, email), course:courses(title)').in('course_id', courseIds).order('created_at', { ascending: false });
        if (courseFilter !== 'all') query = query.eq('course_id', courseFilter);
        const { data } = await query;
        if (data) setDiscussions(data as Discussion[]);
      }
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [profile, courseFilter]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await supabase.from('discussions').delete().eq('id', deleteTarget.id);
    toast.success('Post deleted');
    setDeleteTarget(null);
    fetchData();
  };

  const handlePin = async (d: Discussion) => {
    await supabase.from('discussions').update({ is_pinned: !d.is_pinned }).eq('id', d.id);
    toast.success(d.is_pinned ? 'Unpinned' : 'Pinned to top');
    fetchData();
  };

  return (
    <DashboardLayout navItems={teacherNavItems} title="Discussions" subtitle="Moderate course discussions and forums">
      <div className="space-y-5">
        <select value={courseFilter} onChange={e => setCourseFilter(e.target.value)} className="input-field py-2 text-sm w-full sm:w-48">
          <option value="all">All Courses</option>
          {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>

        {loading ? (
          <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="card p-5 animate-pulse"><div className="h-5 bg-gray-200 dark:bg-navy-700 rounded w-1/2 mb-2" /><div className="h-4 bg-gray-200 dark:bg-navy-700 rounded w-3/4" /></div>)}</div>
        ) : discussions.length === 0 ? (
          <div className="card text-center py-16">
            <MessageSquare className="w-10 h-10 text-gray-400 mx-auto mb-3" />
            <h3 className="font-semibold text-gray-900 dark:text-white mb-1">No discussions yet</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">When students post questions or discussions, they'll appear here.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {discussions.map(d => {
              const author = d.author as { full_name?: string; email?: string } | undefined;
              const course = d.course as { title?: string } | undefined;
              return (
                <div key={d.id} className={`card p-4 ${d.is_pinned ? 'border-l-4 border-l-gold-500' : ''}`}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1">
                      <div className="w-8 h-8 rounded-full bg-navy-100 dark:bg-navy-700 flex items-center justify-center text-xs font-bold text-navy-700 dark:text-navy-200 shrink-0">
                        {author?.full_name?.[0] || '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-sm font-medium text-gray-900 dark:text-white">{author?.full_name || 'Unknown'}</span>
                          {d.is_pinned && <span className="text-xs bg-gold-100 dark:bg-gold-900/30 text-gold-700 dark:text-gold-400 px-2 py-0.5 rounded-full">Pinned</span>}
                          <span className="text-xs text-gray-400">{course?.title}</span>
                        </div>
                        {d.title && <p className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-1">{d.title}</p>}
                        <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-3">{d.content}</p>
                        <p className="text-xs text-gray-400 mt-2">{new Date(d.created_at).toLocaleString('en-AU')}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => handlePin(d)} className={`p-1.5 rounded-lg transition-colors ${d.is_pinned ? 'text-gold-500' : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-navy-700'}`}>
                        <Pin className="w-4 h-4" />
                      </button>
                      <button onClick={() => setDeleteTarget(d)} className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <ConfirmDialog isOpen={!!deleteTarget} title="Delete Post" message="Delete this discussion post?" onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} confirmText="Delete" />
    </DashboardLayout>
  );
}
