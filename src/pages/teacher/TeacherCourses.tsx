import { useState, useEffect } from 'react';
import {
  BookOpen, Pencil, Users, Star, Clock, Plus, Eye, EyeOff,
  Archive, Layers, Lock, Unlock,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { teacherNavItems } from './teacherNav';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import Badge from '../../components/ui/Badge';
import type { Course } from '../../types';

const CATEGORIES = ['Business', 'Technology', 'Marketing', 'Finance', 'Management', 'Leadership', 'Language', 'IELTS', 'PTE', 'Xero', 'General'];

export default function TeacherCourses() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [editCourse, setEditCourse] = useState<Partial<Course> | null>(null);
  const [saving, setSaving] = useState(false);
  const { user, profile } = useAuth();
  const { toast } = useToast();

  const fetchCourses = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('courses')
      .select('id,title,short_description,description,thumbnail_url,price,price_amount,is_free,is_paid,is_published,is_archived,category,level,rating,duration_hours,total_lessons,total_students,stripe_payment_link,teacher_id,created_at')
      .eq('teacher_id', user.id)
      .order('created_at', { ascending: false });
    if (data) setCourses(data as Course[]);
    setLoading(false);
  };

  useEffect(() => { fetchCourses(); }, [user]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editCourse || !user) return;
    setSaving(true);

    const payload = {
      title: editCourse.title,
      short_description: editCourse.short_description,
      description: editCourse.description,
      thumbnail_url: editCourse.thumbnail_url || null,
      price: editCourse.is_free ? 0 : (editCourse.price || 0),
      is_free: editCourse.is_free || false,
      is_paid: !editCourse.is_free,
      category: editCourse.category || 'General',
      level: editCourse.level || 'beginner',
      stripe_payment_link: editCourse.stripe_payment_link || null,
    };

    if (editCourse.id) {
      const { error } = await supabase.from('courses').update(payload).eq('id', editCourse.id).eq('teacher_id', user.id);
      if (!error) {
        toast.success('Course updated');
        setCourses(prev => prev.map(c => c.id === editCourse.id ? { ...c, ...payload } : c));
        setEditCourse(null);
      } else {
        toast.error('Failed to update course');
      }
    } else {
      const { data, error } = await supabase
        .from('courses')
        .insert({ ...payload, teacher_id: user.id, is_published: false })
        .select('id,title,short_description,description,thumbnail_url,price,price_amount,is_free,is_paid,is_published,is_archived,category,level,rating,duration_hours,total_lessons,total_students,stripe_payment_link,teacher_id,created_at')
        .maybeSingle();
      if (!error && data) {
        toast.success('Course created! Use the Course Builder to add lessons.');
        setCourses(prev => [data as Course, ...prev]);
        setEditCourse(null);
      } else {
        toast.error('Failed to create course');
      }
    }
    setSaving(false);
  };

  const handleTogglePublish = async (course: Course) => {
    const { error } = await supabase
      .from('courses')
      .update({ is_published: !course.is_published })
      .eq('id', course.id)
      .eq('teacher_id', user?.id ?? '');
    if (!error) {
      toast.success(course.is_published ? 'Course unpublished' : 'Course published');
      setCourses(prev => prev.map(c => c.id === course.id ? { ...c, is_published: !course.is_published } : c));
    }
  };

  const handleToggleArchive = async (course: Course) => {
    const { error } = await supabase
      .from('courses')
      .update({ is_archived: !course.is_archived })
      .eq('id', course.id)
      .eq('teacher_id', user?.id ?? '');
    if (!error) {
      toast.success(course.is_archived ? 'Course unarchived' : 'Course archived');
      setCourses(prev => prev.map(c => c.id === course.id ? { ...c, is_archived: !course.is_archived } : c));
    }
  };

  const openCreate = () => setEditCourse({
    title: '', short_description: '', description: '', thumbnail_url: '',
    price: 0, is_free: true, category: 'General', level: 'beginner', stripe_payment_link: '',
  });

  return (
    <DashboardLayout navItems={teacherNavItems} title="My Courses" subtitle="Create and manage your courses">
      <div className="space-y-5">
        <div className="flex justify-end">
          <button onClick={openCreate} className="btn-primary text-sm flex items-center gap-2">
            <Plus className="w-4 h-4" /> Create New Course
          </button>
        </div>

        {loading ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[1,2,3].map(i => (
              <div key={i} className="card animate-pulse">
                <div className="h-40 bg-gray-200 dark:bg-navy-700" />
                <div className="p-4 space-y-3">
                  <div className="h-5 bg-gray-200 dark:bg-navy-700 rounded w-3/4" />
                  <div className="h-4 bg-gray-200 dark:bg-navy-700 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : courses.length === 0 ? (
          <div className="card text-center py-16">
            <BookOpen className="w-10 h-10 text-gray-400 mx-auto mb-3" />
            <h3 className="font-semibold text-gray-900 dark:text-white mb-1">No courses yet</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Create your first course to get started.</p>
            <button onClick={openCreate} className="btn-primary text-sm mx-auto flex items-center gap-2 w-fit">
              <Plus className="w-4 h-4" /> Create Course
            </button>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {courses.map(course => (
              <div key={course.id} className="card hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5 flex flex-col">
                <div className="relative h-40 overflow-hidden rounded-t-xl">
                  <img
                    src={course.thumbnail_url || 'https://images.pexels.com/photos/3184291/pexels-photo-3184291.jpeg'}
                    alt={course.title}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                  <div className="absolute top-3 left-3 flex gap-1.5 flex-wrap">
                    <Badge variant={course.is_published ? 'success' : 'warning'}>
                      {course.is_published ? 'Published' : 'Draft'}
                    </Badge>
                    {course.is_archived && <Badge variant="error">Archived</Badge>}
                    {course.is_free && <Badge variant="info">Free</Badge>}
                  </div>
                </div>
                <div className="p-4 flex flex-col flex-1">
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-1 line-clamp-2 text-sm">{course.title}</h3>
                  <p className="text-xs text-gray-400 capitalize mb-3">{course.category} · {course.level}</p>
                  <div className="flex items-center gap-3 text-xs text-gray-400 mb-4">
                    <span className="flex items-center gap-1"><Users className="w-3 h-3" />{course.total_students ?? 0} students</span>
                    <span className="flex items-center gap-1"><Star className="w-3 h-3 fill-gold-400 text-gold-400" />{course.rating ?? 0}</span>
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{course.duration_hours ?? 0}h</span>
                  </div>
                  <div className="mt-auto flex gap-1.5 flex-wrap">
                    <Link
                      to={`/teacher/builder?courseId=${course.id}`}
                      className="flex-1 text-center px-3 py-1.5 bg-navy-900 dark:bg-navy-700 text-white text-xs font-medium rounded-lg hover:bg-navy-800 transition-colors flex items-center justify-center gap-1"
                    >
                      <Layers className="w-3 h-3" /> Builder
                    </Link>
                    <button
                      onClick={() => handleTogglePublish(course)}
                      className={`p-1.5 border rounded-lg text-xs font-medium transition-colors ${course.is_published ? 'border-yellow-200 text-yellow-600 hover:bg-yellow-50 dark:border-yellow-800 dark:text-yellow-400 dark:hover:bg-yellow-900/20' : 'border-green-200 text-green-600 hover:bg-green-50 dark:border-green-800 dark:text-green-400 dark:hover:bg-green-900/20'}`}
                      title={course.is_published ? 'Unpublish' : 'Publish'}
                    >
                      {course.is_published ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      onClick={() => handleToggleArchive(course)}
                      className="p-1.5 border border-gray-200 dark:border-navy-600 rounded-lg text-gray-500 hover:bg-gray-50 dark:hover:bg-navy-700 transition-colors"
                      title={course.is_archived ? 'Unarchive' : 'Archive'}
                    >
                      {course.is_archived ? <Unlock className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      onClick={() => setEditCourse(course)}
                      className="p-1.5 border border-gray-200 dark:border-navy-600 rounded-lg text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                      title="Edit course details"
                    >
                      <Pencil className="w-3.5 h-3.5" />
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
            <h3 className="font-playfair text-xl font-bold text-gray-900 dark:text-white mb-5">
              {editCourse.id ? 'Edit Course' : 'Create New Course'}
            </h3>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Title *</label>
                <input
                  type="text"
                  value={editCourse.title || ''}
                  onChange={e => setEditCourse(c => ({ ...c!, title: e.target.value }))}
                  className="input-field"
                  required
                  placeholder="e.g. Advanced Business Communication"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Short Description</label>
                <input
                  type="text"
                  value={editCourse.short_description || ''}
                  onChange={e => setEditCourse(c => ({ ...c!, short_description: e.target.value }))}
                  className="input-field"
                  placeholder="One-line summary shown on course cards"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Full Description</label>
                <textarea
                  value={editCourse.description || ''}
                  onChange={e => setEditCourse(c => ({ ...c!, description: e.target.value }))}
                  className="input-field resize-none"
                  rows={3}
                  placeholder="Detailed course overview..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Thumbnail URL</label>
                <input
                  type="url"
                  value={editCourse.thumbnail_url || ''}
                  onChange={e => setEditCourse(c => ({ ...c!, thumbnail_url: e.target.value }))}
                  className="input-field"
                  placeholder="https://..."
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Category</label>
                  <select
                    value={editCourse.category || 'General'}
                    onChange={e => setEditCourse(c => ({ ...c!, category: e.target.value }))}
                    className="input-field"
                  >
                    {CATEGORIES.map(cat => <option key={cat}>{cat}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Level</label>
                  <select
                    value={editCourse.level || 'beginner'}
                    onChange={e => setEditCourse(c => ({ ...c!, level: e.target.value as 'beginner' | 'intermediate' | 'advanced' }))}
                    className="input-field"
                  >
                    <option value="beginner">Beginner</option>
                    <option value="intermediate">Intermediate</option>
                    <option value="advanced">Advanced</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Price (AUD)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={editCourse.price || 0}
                    onChange={e => setEditCourse(c => ({ ...c!, price: Number(e.target.value) }))}
                    disabled={!!editCourse.is_free}
                    className="input-field disabled:opacity-50"
                  />
                </div>
                <div className="flex items-end pb-1">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!editCourse.is_free}
                      onChange={e => setEditCourse(c => ({ ...c!, is_free: e.target.checked, price: e.target.checked ? 0 : c?.price }))}
                      className="w-4 h-4 accent-gold-500"
                    />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Free course</span>
                  </label>
                </div>
              </div>
              {!editCourse.is_free && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    Stripe Payment Link <span className="text-gray-400 font-normal">(optional)</span>
                  </label>
                  <input
                    type="url"
                    value={editCourse.stripe_payment_link || ''}
                    onChange={e => setEditCourse(c => ({ ...c!, stripe_payment_link: e.target.value }))}
                    className="input-field"
                    placeholder="https://buy.stripe.com/..."
                  />
                </div>
              )}
              <div className="flex gap-3 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setEditCourse(null)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-navy-600 rounded-lg hover:bg-gray-50 dark:hover:bg-navy-700 transition-colors"
                >
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="btn-primary text-sm py-2 disabled:opacity-60">
                  {saving ? 'Saving...' : editCourse.id ? 'Save Changes' : 'Create Course'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
