import { useState, useEffect } from 'react';
import { Search, Plus, Users, X, Send } from 'lucide-react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { coAdminNavItems } from './coAdminNav';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../contexts/ToastContext';
import ProgressBar from '../../components/ui/ProgressBar';
import type { Profile, Course } from '../../types';

interface EnrollmentRow {
  id: string;
  user_id: string;
  course_id: string;
  enrollment_type: string;
  payment_status: string;
  progress_percent: number;
  enrolled_at: string;
  student?: { full_name: string; email: string };
  course?: { title: string };
}

export default function CoAdminEnrollments() {
  const [enrollments, setEnrollments] = useState<EnrollmentRow[]>([]);
  const [students, setStudents]       = useState<Profile[]>([]);
  const [courses, setCourses]         = useState<Course[]>([]);
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState('');
  const [showAdd, setShowAdd]         = useState(false);
  const [addForm, setAddForm]         = useState({ student_id: '', course_id: '', send_email: true });
  const [adding, setAdding]           = useState(false);
  const { toast } = useToast();

  const fetchData = async () => {
    const [enrollRes, studRes, coursRes] = await Promise.all([
      supabase.from('course_enrollments')
        .select('id,user_id,course_id,enrollment_type,payment_status,progress_percent,enrolled_at,student:profiles(full_name,email),course:courses(title)')
        .order('enrolled_at', { ascending: false })
        .limit(200),
      supabase.from('profiles').select('id, full_name, email').eq('role', 'student').order('full_name'),
      supabase.from('courses').select('id, title').eq('is_published', true).order('title'),
    ]);
    if (enrollRes.data) setEnrollments(enrollRes.data as EnrollmentRow[]);
    if (studRes.data) setStudents(studRes.data as Profile[]);
    if (coursRes.data) setCourses(coursRes.data as Course[]);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdding(true);

    const { error } = await supabase.from('course_enrollments').insert({
      user_id: addForm.student_id,
      course_id: addForm.course_id,
      enrollment_type: 'admin_granted',
      payment_status: 'not_required',
      amount_paid: 0,
    });

    if (error) {
      toast.error('Enrolment failed — student may already be enrolled');
      setAdding(false);
      return;
    }

    toast.success('Student enrolled successfully');

    // Send notification email if requested
    if (addForm.send_email) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const siteRes = await supabase.from('site_settings').select('key, value').in('key', ['platform_name']);
        const siteMap: Record<string, string> = {};
        (siteRes.data || []).forEach(r => { siteMap[r.key] = r.value; });

        const emailRes = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-enrollment-email`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session?.access_token}`,
            },
            body: JSON.stringify({
              student_id: addForm.student_id,
              course_id: addForm.course_id,
              platform_name: siteMap['platform_name'] || 'Maximus Academy',
              platform_url: window.location.origin,
            }),
          }
        );
        const emailResult = await emailRes.json();
        if (emailResult.success) {
          toast.success(`Notification sent to ${emailResult.student_email}`);
        }
      } catch {
        // Email failure is non-critical
      }
    }

    setShowAdd(false);
    setAddForm({ student_id: '', course_id: '', send_email: true });
    fetchData();
    setAdding(false);
  };

  const filtered = enrollments.filter(e => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (e.student?.full_name?.toLowerCase().includes(q) ||
            e.student?.email?.toLowerCase().includes(q) ||
            e.course?.title?.toLowerCase().includes(q));
  });

  const selectedStudent = students.find(s => s.id === addForm.student_id);
  const selectedCourse  = courses.find(c => c.id === addForm.course_id);

  return (
    <DashboardLayout navItems={coAdminNavItems} title="Enrolments" subtitle={`${filtered.length} enrolments`}>
      <div className="space-y-4">
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" placeholder="Search by student or course..." value={search} onChange={e => setSearch(e.target.value)} className="input-field pl-9" />
          </div>
          <button onClick={() => setShowAdd(true)} className="btn-primary flex items-center gap-2 shrink-0">
            <Plus className="w-4 h-4" /> Enrol Student
          </button>
        </div>

        <div className="bg-white dark:bg-navy-800 rounded-2xl border border-gray-100 dark:border-navy-700 shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-8 flex justify-center"><div className="w-8 h-8 border-4 border-sky-500 border-t-transparent rounded-full animate-spin" /></div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-center">
              <Users className="w-10 h-10 text-gray-300 dark:text-navy-600 mb-3" />
              <p className="text-gray-500 dark:text-gray-400">No enrolments found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-navy-700 bg-gray-50 dark:bg-navy-900/40">
                    <th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide px-4 py-3">Student</th>
                    <th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide px-4 py-3">Course</th>
                    <th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide px-4 py-3">Progress</th>
                    <th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide px-4 py-3">Type</th>
                    <th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide px-4 py-3">Enrolled</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-navy-700/50">
                  {filtered.map(e => (
                    <tr key={e.id} className="hover:bg-gray-50 dark:hover:bg-navy-700/30 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900 dark:text-white">{e.student?.full_name || '—'}</p>
                        <p className="text-xs text-gray-400">{e.student?.email}</p>
                      </td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300 max-w-[200px] truncate">{e.course?.title || '—'}</td>
                      <td className="px-4 py-3 w-32">
                        <div className="flex items-center gap-2">
                          <ProgressBar value={e.progress_percent} className="flex-1" />
                          <span className="text-xs font-semibold text-gray-600 dark:text-gray-400 shrink-0">{e.progress_percent}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                          e.enrollment_type === 'admin_granted'
                            ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                            : e.enrollment_type === 'paid'
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                            : 'bg-gray-100 text-gray-600 dark:bg-navy-700 dark:text-gray-400'
                        }`}>
                          {e.enrollment_type === 'admin_granted' ? 'Admin' : e.enrollment_type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400">
                        {new Date(e.enrolled_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
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
          <div className="relative bg-white dark:bg-navy-800 rounded-2xl shadow-2xl w-full max-w-md p-6 animate-slide-up">
            <button onClick={() => setShowAdd(false)} className="absolute top-4 right-4 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-navy-700 transition-colors">
              <X className="w-4 h-4" />
            </button>
            <h3 className="font-bold text-lg text-gray-900 dark:text-white mb-1">Enrol Student</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">Select a student and course to enrol them.</p>

            <form onSubmit={handleAdd} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Student</label>
                <select
                  value={addForm.student_id}
                  onChange={e => setAddForm(f => ({ ...f, student_id: e.target.value }))}
                  className="input-field" required
                >
                  <option value="">Select student...</option>
                  {students.map(s => (
                    <option key={s.id} value={s.id}>{s.full_name} ({s.email})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Course</label>
                <select
                  value={addForm.course_id}
                  onChange={e => setAddForm(f => ({ ...f, course_id: e.target.value }))}
                  className="input-field" required
                >
                  <option value="">Select course...</option>
                  {courses.map(c => (
                    <option key={c.id} value={c.id}>{c.title}</option>
                  ))}
                </select>
              </div>

              {/* Preview card when both are selected */}
              {selectedStudent && selectedCourse && (
                <div className="rounded-xl bg-sky-50 dark:bg-sky-900/20 border border-sky-100 dark:border-sky-800/40 p-4 space-y-1">
                  <p className="text-xs font-semibold text-sky-700 dark:text-sky-400 uppercase tracking-wide">Enrolment Summary</p>
                  <p className="text-sm text-gray-800 dark:text-gray-200">
                    <span className="font-medium">{selectedStudent.full_name}</span>
                    <span className="text-gray-400 mx-1.5">will be enrolled in</span>
                    <span className="font-medium">{selectedCourse.title}</span>
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Notification will be sent to {selectedStudent.email}</p>
                </div>
              )}

              {/* Send email toggle */}
              <label className="flex items-center gap-3 cursor-pointer select-none group">
                <div
                  onClick={() => setAddForm(f => ({ ...f, send_email: !f.send_email }))}
                  className={`relative w-10 h-5 rounded-full transition-colors ${addForm.send_email ? 'bg-sky-500' : 'bg-gray-200 dark:bg-navy-600'}`}
                >
                  <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${addForm.send_email ? 'translate-x-5' : ''}`} />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Send notification email</p>
                  <p className="text-xs text-gray-400">Sends login link and course details to the student</p>
                </div>
              </label>

              <div className="flex gap-3 justify-end pt-2">
                <button type="button" onClick={() => setShowAdd(false)} className="px-4 py-2 text-sm border border-gray-200 dark:border-navy-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-navy-700 transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={adding} className="btn-primary text-sm py-2 disabled:opacity-60 flex items-center gap-2">
                  {adding ? (
                    <><div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Enrolling...</>
                  ) : (
                    <><Send className="w-3.5 h-3.5" /> Enrol & Notify</>
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
