import { useState, useEffect, useRef } from 'react';
import { Search, Plus, CreditCard as Edit, Trash2, Eye, Archive, Users, Layers } from 'lucide-react';
import { Link } from 'react-router-dom';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { adminNavItems } from './adminNav';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../contexts/ToastContext';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import Badge from '../../components/ui/Badge';
import type { Course, Profile } from '../../types';

export default function AdminCourses() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [teachers, setTeachers] = useState<Profile[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<string[]>(['Business', 'Technology', 'Finance', 'General']);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Course | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editCourse, setEditCourse] = useState<Partial<Course> | null>(null);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(search), 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search]);

  const fetchData = async () => {
    const [coursesRes, teachersRes] = await Promise.all([
      supabase.from('courses').select('*, teacher:profiles(full_name)').ilike('title', `%${debouncedSearch}%`).order('created_at', { ascending: false }),
      supabase.from('profiles').select('*').eq('role', 'teacher'),
    ]);
    if (coursesRes.data) setCourses(coursesRes.data as Course[]);
    if (teachersRes.data) setTeachers(teachersRes.data as Profile[]);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [debouncedSearch]);

  useEffect(() => {
    supabase.from('course_categories').select('name').eq('is_active', true).order('sort_order').then(({ data }) => {
      if (data && data.length > 0) setCategoryOptions(data.map(c => c.name));
    });
  }, []);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase.from('courses').delete().eq('id', deleteTarget.id);
    if (!error) { toast.success('Course deleted'); fetchData(); }
    else toast.error('Failed to delete course');
    setDeleteTarget(null);
  };

  const handleArchive = async (course: Course) => {
    await supabase.from('courses').update({ is_archived: !course.is_archived }).eq('id', course.id);
    toast.success(course.is_archived ? 'Course unarchived' : 'Course archived');
    fetchData();
  };

  const handleTogglePublish = async (course: Course) => {
    await supabase.from('courses').update({ is_published: !course.is_published }).eq('id', course.id);
    toast.success(course.is_published ? 'Course unpublished' : 'Course published');
    fetchData();
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editCourse) return;
    setSaving(true);
    const coursePayload = editCourse as Partial<Course>;
    const rawPrice = Number(coursePayload.price_amount ?? coursePayload.price ?? 0);
    const price = coursePayload.is_free ? 0 : rawPrice;
    const payload = {
      title: coursePayload.title,
      description: coursePayload.description,
      short_description: coursePayload.short_description,
      price,
      price_amount: price,
      category: coursePayload.category || 'General',
      level: coursePayload.level || 'beginner',
      teacher_id: coursePayload.teacher_id || null,
      is_free: coursePayload.is_free || false,
      is_paid: !coursePayload.is_free && price > 0,
      stripe_payment_link: coursePayload.stripe_payment_link || null,
    };
    if (editCourse.id) {
      const { error } = await supabase.from('courses').update(payload).eq('id', editCourse.id);
      if (!error) { toast.success('Course updated'); setShowModal(false); fetchData(); }
      else toast.error('Failed to update');
    } else {
      const { error } = await supabase.from('courses').insert({ ...payload, is_published: false });
      if (!error) { toast.success('Course created'); setShowModal(false); fetchData(); }
      else toast.error('Failed to create');
    }
    setSaving(false);
  };

  const openCreate = () => { setEditCourse({ title: '', description: '', short_description: '', price: 0, category: 'Business', level: 'beginner', is_free: false }); setShowModal(true); };
  const openEdit = (c: Course) => { setEditCourse(c); setShowModal(true); };

  return (
    <DashboardLayout navItems={adminNavItems} title="Courses" subtitle="Manage all courses on the platform">
      <div className="space-y-5">
        <div className="flex flex-col sm:flex-row gap-3 justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" placeholder="Search courses..." value={search} onChange={e => setSearch(e.target.value)} className="input-field pl-9 py-2 text-sm" />
          </div>
          <button onClick={openCreate} className="btn-primary text-sm py-2 flex items-center gap-2">
            <Plus className="w-4 h-4" /> New Course
          </button>
        </div>

        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 dark:bg-navy-700/50 border-b border-gray-100 dark:border-navy-700">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Course</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase hidden md:table-cell">Teacher</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase hidden sm:table-cell">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase hidden lg:table-cell">Price</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-navy-700">
                {loading ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>{[1,2,3,4,5].map(j => <td key={j} className="px-4 py-3"><div className="h-4 bg-gray-200 dark:bg-navy-700 rounded animate-pulse" /></td>)}</tr>
                )) : courses.map(course => (
                  <tr key={course.id} className="hover:bg-gray-50 dark:hover:bg-navy-700/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <img src={course.thumbnail_url || 'https://images.pexels.com/photos/3184291/pexels-photo-3184291.jpeg'} alt="" loading="lazy" decoding="async" className="w-10 h-10 rounded-lg object-cover shrink-0" />
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white text-sm line-clamp-1">{course.title}</p>
                          <p className="text-xs text-gray-400 capitalize">{course.category} • {course.level}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 hidden md:table-cell">
                      {(course.teacher as { full_name: string } | undefined)?.full_name || '—'}
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <div className="flex gap-1.5">
                        <Badge variant={course.is_published ? 'success' : 'warning'}>{course.is_published ? 'Published' : 'Draft'}</Badge>
                        {course.is_archived && <Badge variant="error">Archived</Badge>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white hidden lg:table-cell">
                      {course.is_free ? 'Free' : `A$${(course.price_amount ?? course.price ?? 0)}`}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Link to={`/admin/builder?courseId=${course.id}`} className="p-1.5 rounded-lg text-teal-500 hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-colors" title="Build curriculum & quizzes">
                          <Layers className="w-4 h-4" />
                        </Link>
                        <button onClick={() => handleTogglePublish(course)} className={`p-1.5 rounded-lg transition-colors ${course.is_published ? 'text-yellow-500 hover:bg-yellow-50 dark:hover:bg-yellow-900/20' : 'text-green-500 hover:bg-green-50 dark:hover:bg-green-900/20'}`} title={course.is_published ? 'Unpublish' : 'Publish'}>
                          <Eye className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleArchive(course)} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-navy-700 transition-colors" title="Archive">
                          <Archive className="w-4 h-4" />
                        </button>
                        <button onClick={() => openEdit(course)} className="p-1.5 rounded-lg text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors">
                          <Edit className="w-4 h-4" />
                        </button>
                        <button onClick={() => setDeleteTarget(course)} className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!loading && courses.length === 0 && (
              <div className="text-center py-12">
                <Users className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                <p className="text-gray-500 dark:text-gray-400 text-sm">No courses found</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {showModal && editCourse && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowModal(false)} />
          <div className="relative bg-white dark:bg-navy-800 rounded-2xl shadow-2xl w-full max-w-lg p-6 animate-slide-up max-h-[90vh] overflow-y-auto">
            <h3 className="font-playfair text-xl font-bold text-gray-900 dark:text-white mb-5">{editCourse.id ? 'Edit Course' : 'Create Course'}</h3>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Title</label>
                <input type="text" value={editCourse.title || ''} onChange={e => setEditCourse(c => ({ ...c!, title: e.target.value }))} className="input-field" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Short Description</label>
                <input type="text" value={editCourse.short_description || ''} onChange={e => setEditCourse(c => ({ ...c!, short_description: e.target.value }))} className="input-field" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Description</label>
                <textarea value={editCourse.description || ''} onChange={e => setEditCourse(c => ({ ...c!, description: e.target.value }))} className="input-field resize-none" rows={3} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Category</label>
                  <select value={editCourse.category || ''} onChange={e => setEditCourse(c => ({ ...c!, category: e.target.value }))} className="input-field">
                    {categoryOptions.map(cat => <option key={cat}>{cat}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Level</label>
                  <select value={editCourse.level || 'beginner'} onChange={e => setEditCourse(c => ({ ...c!, level: e.target.value as 'beginner' | 'intermediate' | 'advanced' }))} className="input-field">
                    <option value="beginner">Beginner</option>
                    <option value="intermediate">Intermediate</option>
                    <option value="advanced">Advanced</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Price (AUD)</label>
                  <input type="number" min="0" step="0.01" value={editCourse.price_amount ?? editCourse.price ?? ''} onChange={e => { const v = e.target.value === '' ? 0 : Number(e.target.value); setEditCourse(c => ({ ...c!, price: v, price_amount: v })); }} className="input-field" placeholder="0.00" disabled={editCourse.is_free} />
                </div>
                <div className="flex items-end pb-1">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={editCourse.is_free || false} onChange={e => setEditCourse(c => ({ ...c!, is_free: e.target.checked, price: e.target.checked ? 0 : (c?.price ?? 0), price_amount: e.target.checked ? 0 : (c?.price_amount ?? c?.price ?? 0) }))} className="w-4 h-4 accent-gold-500" />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Free course</span>
                  </label>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Assign Teacher <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <select value={(editCourse as Partial<Course>).teacher_id || ''} onChange={e => setEditCourse(c => ({ ...c!, teacher_id: e.target.value || null }))} className="input-field">
                  <option value="">— No teacher assigned —</option>
                  {teachers.map(t => <option key={t.id} value={t.id}>{t.full_name || t.email}</option>)}
                </select>
                <p className="text-xs text-gray-400 mt-1">Courses can be published and enrolled without a teacher.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Stripe Payment Link <span className="text-gray-400 font-normal">(for paid courses)</span>
                </label>
                <input
                  type="url"
                  value={(editCourse as Partial<Course>).stripe_payment_link || ''}
                  onChange={e => setEditCourse(c => ({ ...c!, stripe_payment_link: e.target.value }))}
                  className="input-field"
                  placeholder="https://buy.stripe.com/..."
                />
                <p className="text-xs text-gray-400 mt-1">Students will be redirected here to complete payment before accessing the course.</p>
              </div>
              <div className="flex gap-3 justify-end pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-navy-600 rounded-lg hover:bg-gray-50 dark:hover:bg-navy-700 transition-colors">Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary text-sm py-2 disabled:opacity-60">{saving ? 'Saving...' : 'Save Course'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog isOpen={!!deleteTarget} title="Delete Course" message={`Delete "${deleteTarget?.title}"? All sections, lessons, and enrollments will be removed.`} onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} confirmText="Delete" />
    </DashboardLayout>
  );
}
