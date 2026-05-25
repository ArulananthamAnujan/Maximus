import { useState, useEffect } from 'react';
import { Search, BookOpen, Mail, Plus, X, UserCheck, UserX } from 'lucide-react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { coAdminNavItems } from './coAdminNav';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../contexts/ToastContext';
import type { Profile } from '../../types';

interface AddTeacherForm {
  full_name: string;
  email: string;
  password: string;
}

export default function CoAdminTeachers() {
  const [teachers, setTeachers] = useState<(Profile & { courseCount: number })[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [showAdd, setShowAdd]   = useState(false);
  const [adding, setAdding]     = useState(false);
  const [form, setForm]         = useState<AddTeacherForm>({ full_name: '', email: '', password: '' });
  const { toast } = useToast();

  const fetchTeachers = async () => {
    let q = supabase.from('profiles').select('*').eq('role', 'teacher').order('full_name');
    if (search) q = q.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);
    const { data: profiles } = await q;
    if (!profiles) { setLoading(false); return; }

    const { data: courses } = await supabase.from('courses').select('teacher_id');
    const counts = new Map<string, number>();
    (courses || []).forEach(c => counts.set(c.teacher_id, (counts.get(c.teacher_id) || 0) + 1));

    setTeachers(profiles.map(p => ({ ...p, courseCount: counts.get(p.id) || 0 } as Profile & { courseCount: number })));
    setLoading(false);
  };

  useEffect(() => { fetchTeachers(); }, [search]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdding(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-create-user`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ ...form, role: 'teacher' }),
        }
      );
      const result = await res.json();
      if (!res.ok || result.error) {
        toast.error(result.error || 'Failed to create teacher');
      } else {
        toast.success('Teacher account created');
        setShowAdd(false);
        setForm({ full_name: '', email: '', password: '' });
        fetchTeachers();
      }
    } catch {
      toast.error('Network error — please try again');
    }
    setAdding(false);
  };

  return (
    <DashboardLayout navItems={coAdminNavItems} title="Teachers" subtitle={`${teachers.length} teachers`}>
      <div className="space-y-4">
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" placeholder="Search teachers..." value={search} onChange={e => setSearch(e.target.value)} className="input-field pl-9" />
          </div>
          <button onClick={() => setShowAdd(true)} className="btn-primary flex items-center gap-2 shrink-0">
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
                        <a href={`mailto:${t.email}`} className="p-1.5 rounded-lg text-gray-400 hover:text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-900/20 transition-colors inline-flex" title="Email">
                          <Mail className="w-4 h-4" />
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

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
                <input
                  type="text" required placeholder="John Smith"
                  value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Email</label>
                <input
                  type="email" required placeholder="john@example.com"
                  value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Temporary Password</label>
                <input
                  type="password" required minLength={8} placeholder="Min. 8 characters"
                  value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  className="input-field"
                />
              </div>
              <div className="flex gap-3 justify-end pt-2">
                <button type="button" onClick={() => setShowAdd(false)} className="px-4 py-2 text-sm border border-gray-200 dark:border-navy-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-navy-700 transition-colors">
                  Cancel
                </button>
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
