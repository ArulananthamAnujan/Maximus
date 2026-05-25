import { useState, useEffect } from 'react';
import {
  Search, GraduationCap, UserCheck, UserX,
  Plus, X, Check, ChevronDown, RefreshCw, Trash2,
} from 'lucide-react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { coAdminNavItems } from './coAdminNav';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../contexts/ToastContext';
import type { Profile } from '../../types';

interface Course { id: string; title: string; category: string; }

function generatePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#!';
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

export default function CoAdminStudents() {
  const [students, setStudents]         = useState<Profile[]>([]);
  const [courses, setCourses]           = useState<Course[]>([]);
  const [loading, setLoading]           = useState(true);
  const [search, setSearch]             = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showAdd, setShowAdd]           = useState(false);
  const [creating, setCreating]         = useState(false);
  const [coursesOpen, setCoursesOpen]   = useState(false);
  const [selectedCourses, setSelectedCourses] = useState<Set<string>>(new Set());
  const [form, setForm] = useState({ full_name: '', email: '', password: generatePassword() });
  const [confirmDelete, setConfirmDelete] = useState<Profile | null>(null);
  const [deleting, setDeleting]           = useState(false);
  const { toast } = useToast();

  const fetchStudents = async () => {
    let q = supabase.from('profiles').select('*').eq('role', 'student').order('created_at', { ascending: false });
    if (statusFilter === 'active')   q = q.eq('is_active', true);
    if (statusFilter === 'inactive') q = q.eq('is_active', false);
    if (search) q = q.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);
    const { data } = await q;
    if (data) setStudents(data as Profile[]);
    setLoading(false);
  };

  useEffect(() => {
    supabase.from('courses').select('id, title, category').eq('is_published', true).order('title')
      .then(({ data }) => { if (data) setCourses(data as Course[]); });
  }, []);

  useEffect(() => { fetchStudents(); }, [search, statusFilter]);

  const toggleActive = async (student: Profile) => {
    const { error } = await supabase.from('profiles').update({ is_active: !student.is_active }).eq('id', student.id);
    if (!error) {
      toast.success(`Student ${student.is_active ? 'deactivated' : 'activated'}`);
      fetchStudents();
    } else {
      toast.error('Failed to update student status');
    }
  };

  const toggleCourse = (id: string) => {
    setSelectedCourses(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const password = form.password.trim() || generatePassword();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-create-user`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
          body: JSON.stringify({
            email: form.email.trim(),
            password,
            full_name: form.full_name.trim(),
            role: 'student',
            course_ids: [...selectedCourses],
            send_welcome_email: true,
            temp_password: password,
          }),
        }
      );
      const result = await res.json();
      if (!res.ok || result.error) {
        toast.error(result.error || 'Failed to create student');
      } else {
        const enrolled = selectedCourses.size;
        toast.success(
          `Student created${enrolled > 0 ? ` and enrolled in ${enrolled} course${enrolled !== 1 ? 's' : ''}` : ''}. Welcome email sent.`
        );
        setShowAdd(false);
        setForm({ full_name: '', email: '', password: generatePassword() });
        setSelectedCourses(new Set());
        setCoursesOpen(false);
        fetchStudents();
      }
    } catch {
      toast.error('Network error — please try again');
    }
    setCreating(false);
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
        toast.error(result.error || 'Failed to remove student');
      } else {
        toast.success(`${confirmDelete.full_name || 'Student'} has been removed`);
        setConfirmDelete(null);
        fetchStudents();
      }
    } catch {
      toast.error('Network error — please try again');
    }
    setDeleting(false);
  };

  const openAdd = () => {
    setForm({ full_name: '', email: '', password: generatePassword() });
    setSelectedCourses(new Set());
    setCoursesOpen(false);
    setShowAdd(true);
  };

  return (
    <DashboardLayout navItems={coAdminNavItems} title="Students" subtitle={`${students.length} students`}>
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" placeholder="Search students..." value={search} onChange={e => setSearch(e.target.value)} className="input-field pl-9" />
          </div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="input-field w-full sm:w-36">
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <button onClick={openAdd} className="btn-primary flex items-center gap-2 shrink-0">
            <Plus className="w-4 h-4" /> Add Student
          </button>
        </div>

        <div className="bg-white dark:bg-navy-800 rounded-2xl border border-gray-100 dark:border-navy-700 shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-8 flex justify-center"><div className="w-8 h-8 border-4 border-sky-500 border-t-transparent rounded-full animate-spin" /></div>
          ) : students.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-center">
              <GraduationCap className="w-10 h-10 text-gray-300 dark:text-navy-600 mb-3" />
              <p className="text-gray-500 dark:text-gray-400">No students found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-navy-700 bg-gray-50 dark:bg-navy-900/40">
                    <th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide px-4 py-3">Student</th>
                    <th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide px-4 py-3">Email</th>
                    <th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide px-4 py-3">Joined</th>
                    <th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide px-4 py-3">Status</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-navy-700/50">
                  {students.map(s => (
                    <tr key={s.id} className="hover:bg-gray-50 dark:hover:bg-navy-700/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-sky-100 dark:bg-sky-900/30 flex items-center justify-center shrink-0">
                            <span className="text-xs font-bold text-sky-700 dark:text-sky-400">{s.full_name?.charAt(0)?.toUpperCase() || '?'}</span>
                          </div>
                          <span className="font-medium text-gray-900 dark:text-white">{s.full_name || '—'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{s.email}</td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
                        {new Date(s.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
                          s.is_active
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                            : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                        }`}>
                          {s.is_active ? <UserCheck className="w-3 h-3" /> : <UserX className="w-3 h-3" />}
                          {s.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          <button onClick={() => toggleActive(s)}
                            className={`p-1.5 rounded-lg transition-colors ${
                              s.is_active
                                ? 'text-gray-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20'
                                : 'text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'
                            }`} title={s.is_active ? 'Deactivate' : 'Activate'}>
                            {s.is_active ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                          </button>
                          <button
                            onClick={() => setConfirmDelete(s)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                            title="Remove student"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
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
            <h3 className="font-bold text-lg text-gray-900 dark:text-white text-center mb-2">Remove Student</h3>
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

      {/* Add Student Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowAdd(false)} />
          <div className="relative bg-white dark:bg-navy-800 rounded-2xl shadow-2xl w-full max-w-lg p-6 animate-slide-up max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-1">
              <div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">Add New Student</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Student will receive a welcome email with their login details</p>
              </div>
              <button onClick={() => setShowAdd(false)} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-navy-700 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4 mt-5">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Full Name <span className="text-red-500">*</span></label>
                  <input type="text" required placeholder="Jane Smith" value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} className="input-field" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Email Address <span className="text-red-500">*</span></label>
                  <input type="email" required placeholder="jane@example.com" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="input-field" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Password <span className="ml-1 text-xs text-gray-400 font-normal">(auto-generated)</span>
                </label>
                <div className="flex gap-2">
                  <input type="text" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} minLength={8} className="input-field font-mono text-sm flex-1" />
                  <button type="button" onClick={() => setForm(f => ({ ...f, password: generatePassword() }))} className="px-3 py-2 border border-gray-200 dark:border-navy-600 rounded-xl text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-navy-700 transition-colors shrink-0" title="Regenerate">
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Enrol in Courses <span className="ml-1 text-xs text-gray-400 font-normal">(optional)</span></label>
                <button type="button" onClick={() => setCoursesOpen(o => !o)} className="w-full flex items-center justify-between px-3 py-2.5 border border-gray-200 dark:border-navy-600 rounded-xl text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-navy-700 hover:bg-gray-50 dark:hover:bg-navy-600 transition-colors">
                  <span>{selectedCourses.size === 0 ? 'Select courses to enrol...' : `${selectedCourses.size} course${selectedCourses.size !== 1 ? 's' : ''} selected`}</span>
                  <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${coursesOpen ? 'rotate-180' : ''}`} />
                </button>
                {coursesOpen && (
                  <div className="mt-1.5 border border-gray-200 dark:border-navy-600 rounded-xl overflow-hidden shadow-lg bg-white dark:bg-navy-800 max-h-52 overflow-y-auto">
                    {courses.length === 0 ? (
                      <p className="text-sm text-gray-400 text-center py-4">No published courses found</p>
                    ) : courses.map(c => {
                      const selected = selectedCourses.has(c.id);
                      return (
                        <button key={c.id} type="button" onClick={() => toggleCourse(c.id)} className={`w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors ${selected ? 'bg-sky-50 dark:bg-sky-900/20' : 'hover:bg-gray-50 dark:hover:bg-navy-700'}`}>
                          <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${selected ? 'border-sky-500 bg-sky-500' : 'border-gray-300 dark:border-navy-500'}`}>
                            {selected && <Check className="w-3 h-3 text-white" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-gray-900 dark:text-white truncate">{c.title}</p>
                            {c.category && <p className="text-xs text-gray-400 truncate">{c.category}</p>}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
                {selectedCourses.size > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {[...selectedCourses].map(id => {
                      const c = courses.find(c => c.id === id);
                      if (!c) return null;
                      return (
                        <span key={id} className="inline-flex items-center gap-1 px-2 py-0.5 bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 text-xs font-medium rounded-full">
                          {c.title.length > 30 ? c.title.substring(0, 30) + '…' : c.title}
                          <button type="button" onClick={() => toggleCourse(id)} className="ml-0.5 text-sky-500 hover:text-sky-700"><X className="w-3 h-3" /></button>
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 p-3 flex items-start gap-2.5">
                <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center shrink-0 mt-0.5">
                  <Check className="w-3 h-3 text-white" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">Welcome email will be sent automatically</p>
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">The student will receive their email address, password, and enrolled course details.</p>
                </div>
              </div>

              <div className="flex gap-3 justify-end pt-1">
                <button type="button" onClick={() => setShowAdd(false)} className="px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-navy-600 rounded-xl hover:bg-gray-50 dark:hover:bg-navy-700 transition-colors">Cancel</button>
                <button type="submit" disabled={creating} className="btn-primary text-sm py-2.5 px-6 disabled:opacity-60 flex items-center gap-2">
                  {creating ? (
                    <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Creating...</>
                  ) : (
                    <><GraduationCap className="w-4 h-4" /> Create & Enrol</>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
