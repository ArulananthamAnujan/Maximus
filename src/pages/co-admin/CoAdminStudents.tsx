import { useState, useEffect } from 'react';
import { Search, GraduationCap, UserCheck, UserX, Mail } from 'lucide-react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { coAdminNavItems } from './coAdminNav';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../contexts/ToastContext';
import type { Profile } from '../../types';

export default function CoAdminStudents() {
  const [students, setStudents] = useState<Profile[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
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

  return (
    <DashboardLayout navItems={coAdminNavItems} title="Students" subtitle={`${students.length} students`}>
      <div className="space-y-4">
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text" placeholder="Search students..."
              value={search} onChange={e => setSearch(e.target.value)}
              className="input-field pl-9"
            />
          </div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="input-field w-full sm:w-36">
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>

        {/* Table */}
        <div className="bg-white dark:bg-navy-800 rounded-2xl border border-gray-100 dark:border-navy-700 shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-8 flex justify-center">
              <div className="w-8 h-8 border-4 border-sky-500 border-t-transparent rounded-full animate-spin" />
            </div>
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
                            <span className="text-xs font-bold text-sky-700 dark:text-sky-400">
                              {s.full_name?.charAt(0)?.toUpperCase() || '?'}
                            </span>
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
                        <div className="flex items-center gap-2 justify-end">
                          <a href={`mailto:${s.email}`}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-900/20 transition-colors" title="Email">
                            <Mail className="w-4 h-4" />
                          </a>
                          <button onClick={() => toggleActive(s)}
                            className={`p-1.5 rounded-lg transition-colors ${
                              s.is_active
                                ? 'text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20'
                                : 'text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'
                            }`} title={s.is_active ? 'Deactivate' : 'Activate'}>
                            {s.is_active ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
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
    </DashboardLayout>
  );
}
