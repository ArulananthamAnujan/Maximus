import { useState, useEffect } from 'react';
import { Award, Plus } from 'lucide-react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { teacherNavItems } from './teacherNav';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import Badge from '../../components/ui/Badge';
import type { Certificate } from '../../types';

export default function TeacherCertificates() {
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showIssue, setShowIssue] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [issueForm, setIssueForm] = useState({ student_id: '', course_id: '' });
  const [students, setStudents] = useState<{ id: string; full_name: string; email: string }[]>([]);
  const [courses, setCourses] = useState<{ id: string; title: string }[]>([]);
  const { profile } = useAuth();
  const { toast } = useToast();

  const fetchData = async () => {
    if (!profile) return;
    const { data: coursesData } = await supabase.from('courses').select('id, title').eq('teacher_id', profile.id);
    if (coursesData) {
      setCourses(coursesData);
      const courseIds = coursesData.map(c => c.id);
      if (courseIds.length > 0) {
        const { data } = await supabase.from('certificates').select('*, student:profiles(full_name, email), course:courses(title)').in('course_id', courseIds).order('issued_at', { ascending: false });
        if (data) setCertificates(data as Certificate[]);
        const { data: studData } = await supabase.from('enrollments').select('student:profiles(id, full_name, email)').in('course_id', courseIds);
        if (studData) {
          const unique = new Map();
          studData.forEach((e: { student: { id: string; full_name: string; email: string } | unknown }) => {
            const s = e.student as { id: string; full_name: string; email: string };
            if (s && !unique.has(s.id)) unique.set(s.id, s);
          });
          setStudents(Array.from(unique.values()));
        }
      }
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [profile]);

  const handleIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    setIssuing(true);
    const certId = `MAX-${new Date().getFullYear()}-${Math.random().toString().slice(2, 8)}`;
    const { error } = await supabase.from('certificates').insert({ student_id: issueForm.student_id, course_id: issueForm.course_id, certificate_id: certId });
    if (!error) { toast.success('Certificate issued'); setShowIssue(false); fetchData(); }
    else toast.error('Failed to issue certificate — student may already have one');
    setIssuing(false);
  };

  return (
    <DashboardLayout navItems={teacherNavItems} title="Certificates" subtitle="View and manually issue certificates">
      <div className="space-y-5">
        <div className="flex justify-end">
          <button onClick={() => setShowIssue(true)} className="btn-primary text-sm py-2 flex items-center gap-2">
            <Plus className="w-4 h-4" /> Issue Certificate
          </button>
        </div>

        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 dark:bg-navy-700/50 border-b border-gray-100 dark:border-navy-700">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Student</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase hidden md:table-cell">Course</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase hidden sm:table-cell">Certificate ID</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase hidden lg:table-cell">Issued</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-navy-700">
                {loading ? Array.from({ length: 3 }).map((_, i) => <tr key={i}>{[1,2,3,4,5].map(j => <td key={j} className="px-4 py-3"><div className="h-4 bg-gray-200 dark:bg-navy-700 rounded animate-pulse" /></td>)}</tr>) :
                certificates.map(cert => {
                  const student = cert.student as { full_name?: string; email?: string } | undefined;
                  const course = cert.course as { title?: string } | undefined;
                  return (
                    <tr key={cert.id} className="hover:bg-gray-50 dark:hover:bg-navy-700/30 transition-colors">
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">{student?.full_name}</p>
                        <p className="text-xs text-gray-400">{student?.email}</p>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300 hidden md:table-cell">{course?.title}</td>
                      <td className="px-4 py-3 hidden sm:table-cell"><span className="font-mono text-xs text-gray-600 dark:text-gray-400">{cert.certificate_id}</span></td>
                      <td className="px-4 py-3"><Badge variant={cert.revoked ? 'error' : 'success'}>{cert.revoked ? 'Revoked' : 'Valid'}</Badge></td>
                      <td className="px-4 py-3 text-xs text-gray-400 hidden lg:table-cell">{new Date(cert.issued_at).toLocaleDateString('en-AU')}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!loading && certificates.length === 0 && (
              <div className="text-center py-12">
                <Award className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                <p className="text-gray-500 dark:text-gray-400 text-sm">No certificates issued yet</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {showIssue && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowIssue(false)} />
          <div className="relative bg-white dark:bg-navy-800 rounded-2xl shadow-2xl w-full max-w-md p-6 animate-slide-up">
            <h3 className="font-playfair text-xl font-bold text-gray-900 dark:text-white mb-5">Issue Certificate</h3>
            <form onSubmit={handleIssue} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Student</label>
                <select value={issueForm.student_id} onChange={e => setIssueForm(f => ({ ...f, student_id: e.target.value }))} className="input-field" required>
                  <option value="">Select student...</option>
                  {students.map(s => <option key={s.id} value={s.id}>{s.full_name || s.email}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Course</label>
                <select value={issueForm.course_id} onChange={e => setIssueForm(f => ({ ...f, course_id: e.target.value }))} className="input-field" required>
                  <option value="">Select course...</option>
                  {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
              </div>
              <div className="flex gap-3 justify-end pt-2">
                <button type="button" onClick={() => setShowIssue(false)} className="px-4 py-2 text-sm border border-gray-200 dark:border-navy-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-navy-700 transition-colors">Cancel</button>
                <button type="submit" disabled={issuing} className="btn-primary text-sm py-2 disabled:opacity-60">{issuing ? 'Issuing...' : 'Issue Certificate'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
