import { useState, useEffect } from 'react';
import { BookOpen, CreditCard as Edit, Users, Star, Clock } from 'lucide-react';
import { Link } from 'react-router-dom';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { teacherNavItems } from './teacherNav';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import Badge from '../../components/ui/Badge';
import type { Course } from '../../types';

export default function TeacherCourses() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [editCourse, setEditCourse] = useState<Course | null>(null);
  const [saving, setSaving] = useState(false);
  const { profile } = useAuth();
  const { toast } = useToast();

  const fetchCourses = async () => {
    if (!profile) return;
    const { data } = await supabase.from('courses').select('*').eq('teacher_id', profile.id).order('created_at', { ascending: false });
    if (data) setCourses(data as Course[]);
    setLoading(false);
  };

  useEffect(() => { fetchCourses(); }, [profile]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editCourse) return;
    setSaving(true);
    const { error } = await supabase.from('courses').update({
      title: editCourse.title,
      short_description: editCourse.short_description,
      description: editCourse.description,
      thumbnail_url: editCourse.thumbnail_url,
      price: editCourse.price,
    }).eq('id', editCourse.id);
    if (!error) { toast.success('Course updated'); setEditCourse(null); fetchCourses(); }
    else toast.error('Failed to update course');
    setSaving(false);
  };

  return (
    <DashboardLayout navItems={teacherNavItems} title="My Courses" subtitle="View and manage your assigned courses">
      <div className="space-y-5">
        {loading ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[1,2,3].map(i => <div key={i} className="card animate-pulse"><div className="h-40 bg-gray-200 dark:bg-navy-700" /><div className="p-4 space-y-3"><div className="h-5 bg-gray-200 dark:bg-navy-700 rounded w-3/4" /><div className="h-4 bg-gray-200 dark:bg-navy-700 rounded" /></div></div>)}
          </div>
        ) : courses.length === 0 ? (
          <div className="card text-center py-16">
            <BookOpen className="w-10 h-10 text-gray-400 mx-auto mb-3" />
            <h3 className="font-semibold text-gray-900 dark:text-white mb-1">No courses assigned</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">Contact your administrator to get courses assigned to you.</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {courses.map(course => (
              <div key={course.id} className="card hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5">
                <div className="relative h-40 overflow-hidden">
                  <img src={course.thumbnail_url || 'https://images.pexels.com/photos/3184291/pexels-photo-3184291.jpeg'} alt={course.title} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                  <div className="absolute top-3 left-3 flex gap-1.5">
                    <Badge variant={course.is_published ? 'success' : 'warning'}>{course.is_published ? 'Published' : 'Draft'}</Badge>
                  </div>
                </div>
                <div className="p-4">
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-2 line-clamp-2 text-sm">{course.title}</h3>
                  <div className="flex items-center gap-3 text-xs text-gray-400 mb-4">
                    <span className="flex items-center gap-1"><Users className="w-3 h-3" />{course.total_students} students</span>
                    <span className="flex items-center gap-1"><Star className="w-3 h-3 fill-gold-400 text-gold-400" />{course.rating}</span>
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{course.duration_hours}h</span>
                  </div>
                  <div className="flex gap-2">
                    <Link to={`/teacher/builder?courseId=${course.id}`} className="flex-1 text-center px-3 py-1.5 bg-navy-900 dark:bg-navy-700 text-white text-xs font-medium rounded-lg hover:bg-navy-800 transition-colors">
                      Build Course
                    </Link>
                    <button onClick={() => setEditCourse(course)} className="p-1.5 border border-gray-200 dark:border-navy-600 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-navy-700 transition-colors">
                      <Edit className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {editCourse && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setEditCourse(null)} />
          <div className="relative bg-white dark:bg-navy-800 rounded-2xl shadow-2xl w-full max-w-lg p-6 animate-slide-up max-h-[90vh] overflow-y-auto">
            <h3 className="font-playfair text-xl font-bold text-gray-900 dark:text-white mb-5">Edit Course</h3>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Title</label>
                <input type="text" value={editCourse.title} onChange={e => setEditCourse(c => c ? { ...c, title: e.target.value } : null)} className="input-field" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Short Description</label>
                <input type="text" value={editCourse.short_description || ''} onChange={e => setEditCourse(c => c ? { ...c, short_description: e.target.value } : null)} className="input-field" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Full Description</label>
                <textarea value={editCourse.description || ''} onChange={e => setEditCourse(c => c ? { ...c, description: e.target.value } : null)} className="input-field resize-none" rows={4} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Thumbnail URL</label>
                <input type="url" value={editCourse.thumbnail_url || ''} onChange={e => setEditCourse(c => c ? { ...c, thumbnail_url: e.target.value } : null)} className="input-field" placeholder="https://..." />
              </div>
              <div className="flex gap-3 justify-end pt-2">
                <button type="button" onClick={() => setEditCourse(null)} className="px-4 py-2 text-sm border border-gray-200 dark:border-navy-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-navy-700 transition-colors">Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary text-sm py-2 disabled:opacity-60">{saving ? 'Saving...' : 'Save Changes'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
