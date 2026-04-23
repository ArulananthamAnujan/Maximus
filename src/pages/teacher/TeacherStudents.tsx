import { useState, useEffect } from 'react';
import { Search, Users, UserMinus } from 'lucide-react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { teacherNavItems } from './teacherNav';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import ProgressBar from '../../components/ui/ProgressBar';
import type { Enrollment, Course } from '../../types';

export default function TeacherStudents() {
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseFilter, setCourseFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [removeTarget, setRemoveTarget] = useState<Enrollment | null>(null);
  const { profile } = useAuth();
  const { toast } = useToast();

  const fetchData = async () => {
    if (!profile) return;
    const { data: coursesData } = await supabase.from('courses').select('id, title').eq('teacher_id', profile.id);
    if (coursesData) {
      setCourses(coursesData as Course[]);
      const courseIds = coursesData.map(c => c.id);
      if (courseIds.length > 0) {
        const { data } = await supabase.from('enrollments').select('*, student:profiles(full_name, email, avatar_url), course:courses(title)').in('course_id', courseIds).order('enrolled_at', { ascending: false });
        if (data) setEnrollments(data as Enrollment[]);
      }
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [profile]);

  const handleRemove = async () => {
    if (!removeTarget) return;
    await supabase.from('enrollments').delete().eq('id', removeTarget.id);
    toast.success('Student removed from course');
    setRemoveTarget(null);
    fetchData();
  };

  const filtered = enrollments.filter(e => {
    const student = e.student as { full_name?: string; email?: string } | undefined;
    const course = e.course as { title?: string } | undefined;
    const q = search.toLowerCase();
    const matchSearch = !search || student?.full_name?.toLowerCase().includes(q) || student?.email?.toLowerCase().includes(q);
    const matchCourse = courseFilter === 'all' || e.course_id === courseFilter;
    return matchSearch && matchCourse;
  });

  return (
    <DashboardLayout navItems={teacherNavItems} title="My Students" subtitle="View students enrolled in your courses">
      <div className="space-y-5">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" placeholder="Search students..." value={search} onChange={e => setSearch(e.target.value)} className="input-field pl-9 py-2 text-sm" />
          </div>
          <select value={courseFilter} onChange={e => setCourseFilter(e.target.value)} className="input-field py-2 text-sm w-full sm:w-48">
            <option value="all">All Courses</option>
            {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
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
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-navy-500 to-navy-800 flex items-center justify-center text-white text-xs font-bold shrink-0">
                            {student?.full_name?.[0] || '?'}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-900 dark:text-white">{student?.full_name || '—'}</p>
                            <p className="text-xs text-gray-400">{student?.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300 hidden md:table-cell">{course?.title || '—'}</td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <div className="flex items-center gap-2 w-32">
                          <ProgressBar value={e.progress_percent} size="sm" />
                          <span className="text-xs text-gray-400 shrink-0">{e.progress_percent}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400 hidden sm:table-cell">{new Date(e.enrolled_at).toLocaleDateString('en-AU')}</td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => setRemoveTarget(e)} className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                          <UserMinus className="w-4 h-4" />
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
                <p className="text-gray-500 dark:text-gray-400 text-sm">No students found</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog isOpen={!!removeTarget} title="Remove Student" message="Remove this student from the course? Their progress will be lost." onConfirm={handleRemove} onCancel={() => setRemoveTarget(null)} confirmText="Remove" />
    </DashboardLayout>
  );
}
