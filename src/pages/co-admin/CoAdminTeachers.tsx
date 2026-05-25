import { useState, useEffect, useRef } from 'react';
import { Search, BookOpen, Plus, X, UserCheck, UserX, RefreshCw, ChevronDown, Check, Trash2 } from 'lucide-react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { coAdminNavItems } from './coAdminNav';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../contexts/ToastContext';
import type { Profile } from '../../types';

interface Course { id: string; title: string; }

interface AddTeacherForm {
  full_name: string;
  email: string;
  password: string;
  course_ids: string[];
}

function generatePassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
  let pwd = '';
  for (let i = 0; i < 12; i++) pwd += chars[Math.floor(Math.random() * chars.length)];
  return pwd;
}

export default function CoAdminTeachers() {
  const [teachers, setTeachers] = useState<(Profile & { courseCount: number })[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [showAdd, setShowAdd]   = useState(false);
  const [adding, setAdding]     = useState(false);
  const [courses, setCourses]   = useState<Course[]>([]);
  const [courseDropOpen, setCourseDropOpen] = useState(false);
  const [form, setForm] = useState<AddTeacherForm>({
    full_name: '', email: '', password: generatePassword(), course_ids: [],
  });
  const [confirmDelete, setConfirmDelete] = useState<Profile | null>(null);
  const [deleting, setDeleting]           = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const fetchTeachers = async () => {
    let q = supabase.from('profiles').select('*').eq('role', 'teacher').order('full_name');
    if (search) q = q.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);
    const { data: profiles } = await q;
    if (!profiles) { setLoading(false); return; }

    const { data: coursesData } = await supabase.from('courses').select('teacher_id');
    const counts = new Map<string, number>();
    (coursesData || []).forEach(c => counts.set(c.teacher_id, (counts.get(c.teacher_id) || 0) + 1));

    setTeachers(profiles.map(p => ({ ...p, courseCount: counts.get(p.id) || 0 } as Profile & { courseCount: number })));
    setLoading(false);
  };

  useEffect(() => { fetchTeachers(); }, [search]);

  useEffect(() => {
    supabase.from('courses').select('id,title').eq('is_published', true).order('title').then(({ data }) => {
      setCourses(data || []);
    });
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setCourseDropOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const openAdd = () => {
    setForm({ full_name: '', email: '', password: generatePassword(), course_ids: [] });
    setCourseDropOpen(false);
    setShowAdd(true);
  };

  const toggleCourse = (id: string) => {
    setForm(f => ({
      ...f,
      course_ids: f.course_ids.includes(id) ? f.course_ids.filter(c => c !== id) : [...f.course_ids, id],
    }));
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdding(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-create-user`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
          body: JSON.stringify({
            full_name: form.full_name,
            email: form.email,
            password: form.password,
            temp_password: form.password,
            role: 'teacher',
            course_ids: form.course_ids,
          }),
        }
      );
      const result = await res.json();
      if (!res.ok || result.error) {
        toast.error(result.error || 'Failed to create teacher');
      } else {
        toast.success('Teacher account created and welcome email sent');
        setShowAdd(false);
        fetchTeachers();
      }
    } catch {
      toast.error('Network error — please try again');
    }
    setAdding(false);
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-create-user`,
        {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
          body: JSON.stringify({ user_id: confirmDelete.id }),
        }
      );
      const result = await res.json();
      if (!res.ok || result.error) {
        toast.error(result.error || 'Failed to remove teacher');
      } else {
        toast.success(`${confirmDelete.full_name || 'Teacher'} has been removed`);
        setConfirmDelete(null);
        fetchTeachers();
      }
    } catch {
      toast.error('Network error — please try again');
    }
    setDeleting(false);
  };

  return (
    <DashboardLayout navItems={coAdminNavItems} title="Teachers" subtitle={`${teachers.length} teachers`}>
      <div className="space-y-4">
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" placeholder="Search teachers..." value={search} onChange={e => setSearch(e.target.value)} className="input-field pl-9" />
          </div>
          <button onClick={openAdd} className="btn-primary flex items-center gap-2 shrink-0">
            <Plus className="w-4 h-4" /> Add Teacher
          </button>
        </div>

        <div className="bg-white dark:bg-navy-800 rounded-2xl border border-gray-100 dark:border-navy-700 shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-8 flex justify-center"><div className="w-8 h-8 border-4 border-sky-500 border-t-transparent rounded-full animate-spin" /></div>
          ) : teachers.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-center">
              <BookOpen className="w-10 h-10 text-gray-300 dark:text-navy-600 mb-3" />
              <p className="text-gray-500 dark:text-gray-400">No teachers found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-navy-700 bg-gray-50 dark:bg-navy-900/40">
                    <th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide px-4 py-3">Teacher</th>
                    <th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide px-4 py-3">Email</th>
                    <th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide px-4 py-3">Courses</th>
                    <th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide px-4 py-3">Status</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-navy-700/50">
                  {teachers.map(t => (
                    <tr key={t.id} className="hover:bg-gray-50 dark:hover:bg-navy-700/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
                            <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400">{t.full_name?.charAt(0)?.toUpperCase() || '?'}</span>
                          </div>
                          <span className="font-medium text-gray-900 dark:text-white">{t.full_name || '—'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{t.email}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                          <BookOpen className="w-3 h-3" /> {t.courseCount}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
                          t.is_active
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                            : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                        }`}>
                          {t.is_active ? <UserCheck className="w-3 h-3" /> : <UserX className="w-3 h-3" />}
                          {t.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setConfirmDelete(t)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors inline-flex"
                          title="Remove teacher"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Confirm Delete Modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setConfirmDelete(null)} />
          <div className="relative bg-white dark:bg-navy-800 rounded-2xl shadow-2xl w-full max-w-sm p-6 animate-slide-up">
            <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-6 h-6 text-red-600 dark:text-red-400" />
            </div>
            <h3 className="font-bold text-lg text-gray-900 dark:text-white text-center mb-2">Remove Teacher</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center mb-1">
              Are you sure you want to remove <span className="font-semibold text-gray-800 dark:text-gray-200">{confirmDelete.full_name || confirmDelete.email}</span>?
            </p>
            <p className="text-xs text-red-500 dark:text-red-400 text-center mb-6">
              This will permanently delete their account. They can be re-added later.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-navy-600 rounded-xl hover:bg-gray-50 dark:hover:bg-navy-700 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {deleting ? <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Removing...</> : <><Trash2 className="w-4 h-4" /> Remove</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Teacher Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowAdd(false)} />
          <div className="relative bg-white dark:bg-navy-800 rounded-2xl shadow-2xl w-full max-w-sm p-6 animate-slide-up">
            <button onClick={() => setShowAdd(false)} className="absolute top-4 right-4 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-navy-700 transition-colors">
              <X className="w-4 h-4" />
            </button>
            <h3 className="font-bold text-lg text-gray-900 dark:text-white mb-5">Add New Teacher</h3>
            <form onSubmit={handleAdd} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Full Name</label>
                <input type="text" required placeholder="Jane Smith" value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} className="input-field" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Email</label>
                <input type="email" required placeholder="jane@example.com" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="input-field" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Generated Password</label>
                <div className="flex gap-2">
                  <input type="text" required readOnly value={form.password} className="input-field flex-1 font-mono text-sm bg-gray-50 dark:bg-navy-900/50" />
                  <button type="button" onClick={() => setForm(f => ({ ...f, password: generatePassword() }))} className="p-2.5 rounded-lg border border-gray-200 dark:border-navy-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-navy-700 transition-colors" title="Regenerate password">
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>
                <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">This password will be emailed to the teacher</p>
              </div>

              <div ref={dropRef}>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Assign to Courses <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <button type="button" onClick={() => setCourseDropOpen(o => !o)} className="input-field w-full flex items-center justify-between text-left">
                  <span className="text-gray-500 dark:text-gray-400 text-sm">
                    {form.course_ids.length === 0 ? 'Select courses...' : `${form.course_ids.length} course${form.course_ids.length !== 1 ? 's' : ''} selected`}
                  </span>
                  <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${courseDropOpen ? 'rotate-180' : ''}`} />
                </button>
                {courseDropOpen && (
                  <div className="mt-1 border border-gray-200 dark:border-navy-600 rounded-xl overflow-hidden shadow-lg bg-white dark:bg-navy-800 max-h-48 overflow-y-auto z-10 relative">
                    {courses.length === 0 ? (
                      <p className="px-3 py-2 text-sm text-gray-400">No published courses available</p>
                    ) : courses.map(c => (
                      <button key={c.id} type="button" onClick={() => toggleCourse(c.id)} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-50 dark:hover:bg-navy-700 transition-colors">
                        <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${form.course_ids.includes(c.id) ? 'bg-sky-500 border-sky-500' : 'border-gray-300 dark:border-navy-500'}`}>
                          {form.course_ids.includes(c.id) && <Check className="w-2.5 h-2.5 text-white" />}
                        </div>
                        <span className="text-gray-700 dark:text-gray-300 truncate">{c.title}</span>
                      </button>
                    ))}
                  </div>
                )}
                {form.course_ids.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {courses.filter(c => form.course_ids.includes(c.id)).map(c => (
                      <span key={c.id} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 font-medium">
                        {c.title}
                        <button type="button" onClick={() => toggleCourse(c.id)} className="hover:text-emerald-900 dark:hover:text-emerald-200">
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <p className="text-xs text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-900/20 rounded-lg px-3 py-2">
                A welcome email with login credentials will be sent to the teacher.
              </p>

              <div className="flex gap-3 justify-end pt-2">
                <button type="button" onClick={() => setShowAdd(false)} className="px-4 py-2 text-sm border border-gray-200 dark:border-navy-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-navy-700 transition-colors">Cancel</button>
                <button type="submit" disabled={adding} className="btn-primary text-sm py-2 disabled:opacity-60">
                  {adding ? 'Creating...' : 'Create Teacher'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
