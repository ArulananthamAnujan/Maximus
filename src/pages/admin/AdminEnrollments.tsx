import { useState, useEffect } from 'react';
import { Search, Plus, Trash2, Users } from 'lucide-react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { adminNavItems } from './adminNav';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../contexts/ToastContext';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import ProgressBar from '../../components/ui/ProgressBar';
import type { Enrollment, Profile, Course } from '../../types';

export default function AdminEnrollments() {
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [students, setStudents] = useState<Profile[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Enrollment | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ student_id: '', course_id: '' });
  const [adding, setAdding] = useState(false);
  const { toast } = useToast();

  const fetchData = async () => {
    const [enrollRes, studRes, coursRes] = await Promise.all([
      supabase.from('enrollments').select('*, student:profiles(full_name, email), course:courses(title)').order('enrolled_at', { ascending: false }),
      supabase.from('profiles').select('*').eq('role', 'student'),
      supabase.from('courses').select('id, title').eq('is_published', true),
    ]);
    if (enrollRes.data) setEnrollments(enrollRes.data as Enrollment[]);
    if (studRes.data) setStudents(studRes.data as Profile[]);
    if (coursRes.data) setCourses(coursRes.data as Course[]);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await supabase.from('enrollments').delete().eq('id', deleteTarget.id);
    toast.success('Enrolment removed');
    setDeleteTarget(null);
    fetchData();
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdding(true);
    const { error } = await supabase.from('enrollments').insert({ student_id: addForm.student_id, course_id: addForm.course_id });
    if (!error) { toast.success('Student enrolled'); setShowAdd(false); setAddForm({ student_id: '', course_id: '' }); fetchData(); }
    else toast.error('Enrolment failed — student may already be enrolled');
    setAdding(false);
  };

  const filtered = enrollments.filter(e => {
    const student = e.student as { full_name?: string; email?: string } | undefined;
    const course = e.course as { title?: string } | undefined;
    const q = search.toLowerCase();
    return !search || student?.full_name?.toLowerCase().includes(q) || student?.email?.toLowerCase().includes(q) || course?.title?.toLowerCase().includes(q);
  });

  return (
    <DashboardLayout navItems={adminNavItems} title="Enrolments" subtitle="Manage all student enrolments">
      <div className="space-y-5">
        <div className="flex flex-col sm:flex-row gap-3 justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" placeholder="Search enrolments..." value={search} onChange={e => setSearch(e.target.value)} className="input-field pl-9 py-2 text-sm" />
          </div>
          <button onClick={() => setShowAdd(true)} className="btn-primary text-sm py-2 flex items-center gap-2">
            <Plus className="w-4 h-4" /> Enrol Student
          </button>
        </div>

        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 dark:bg-navy-700/50 border-b border-gray-100 dark:border-navy-700">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Student</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase hidden md:table-cell">Course</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase hidden lg:table-cell">Progress</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase hidden sm:table-cell">Enrolled</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-navy-700">
                {loading ? Array.from({ length: 5 }).map((_, i) => <tr key={i}>{[1,2,3,4,5].map(j => <td key={j} className="px-4 py-3"><div className="h-4 bg-gray-200 dark:bg-navy-700 rounded animate-pulse" /></td>)}</tr>) :
                filtered.map(e => {
                  const student = e.student as { full_name?: string; email?: string } | undefined;
                  const course = e.course as { title?: string } | undefined;
                  return (
                    <tr key={e.id} className="hover:bg-gray-50 dark:hover:bg-navy-700/30 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900 dark:text-white text-sm">{student?.full_name || '—'}</p>
                        <p className="text-xs text-gray-400">{student?.email}</p>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300 hidden md:table-cell">{course?.title || '—'}</td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <div className="flex items-center gap-2 w-32">
                          <ProgressBar value={e.progress_percent} size="sm" />
                          <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">{e.progress_percent}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 hidden sm:table-cell">{new Date(e.enrolled_at).toLocaleDateString('en-AU')}</td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => setDeleteTarget(e)} className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!loading && filtered.length === 0 && (
              <div className="text-center py-12">
                <Users className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                <p className="text-gray-500 dark:text-gray-400 text-sm">No enrolments found</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowAdd(false)} />
          <div className="relative bg-white dark:bg-navy-800 rounded-2xl shadow-2xl w-full max-w-md p-6 animate-slide-up">
            <h3 className="font-playfair text-xl font-bold text-gray-900 dark:text-white mb-5">Enrol Student</h3>
            <form onSubmit={handleAdd} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Student</label>
                <select value={addForm.student_id} onChange={e => setAddForm(f => ({ ...f, student_id: e.target.value }))} className="input-field" required>
                  <option value="">Select student...</option>
                  {students.map(s => <option key={s.id} value={s.id}>{s.full_name || s.email}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Course</label>
                <select value={addForm.course_id} onChange={e => setAddForm(f => ({ ...f, course_id: e.target.value }))} className="input-field" required>
                  <option value="">Select course...</option>
                  {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
              </div>
              <div className="flex gap-3 justify-end pt-2">
                <button type="button" onClick={() => setShowAdd(false)} className="px-4 py-2 text-sm border border-gray-200 dark:border-navy-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-navy-700 transition-colors">Cancel</button>
                <button type="submit" disabled={adding} className="btn-primary text-sm py-2 disabled:opacity-60">{adding ? 'Enrolling...' : 'Enrol'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog isOpen={!!deleteTarget} title="Remove Enrolment" message="Remove this student from the course? Their progress will be lost." onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} confirmText="Remove" />
    </DashboardLayout>
  );
}
