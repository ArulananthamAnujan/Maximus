import { useState, useEffect } from 'react';
import {
  Search, Plus, Download, Trash2, UserCheck, UserX, Shield,
  GraduationCap, BookOpen, X, Check, ChevronDown,
} from 'lucide-react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { adminNavItems } from './adminNav';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../contexts/ToastContext';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import Badge from '../../components/ui/Badge';
import type { Profile } from '../../types';

interface Course { id: string; title: string; category: string; }

const ROLE_COLORS: Record<string, 'error' | 'info' | 'success'> = {
  admin: 'error', teacher: 'info', student: 'success',
};
const ROLE_ICONS: Record<string, React.ElementType> = {
  admin: Shield, teacher: BookOpen, student: GraduationCap,
};

function generatePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#!';
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

export default function AdminUsers() {
  const [users, setUsers]               = useState<Profile[]>([]);
  const [courses, setCourses]           = useState<Course[]>([]);
  const [loading, setLoading]           = useState(true);
  const [search, setSearch]             = useState('');
  const [roleFilter, setRoleFilter]     = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [deleteTarget, setDeleteTarget] = useState<Profile | null>(null);
  const [editTarget, setEditTarget]     = useState<Profile | null>(null);
  const [editRole, setEditRole]         = useState('');
  const [editName, setEditName]         = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newUser, setNewUser]           = useState({ email: '', full_name: '', role: 'student', password: '' });
  const [selectedCourses, setSelectedCourses] = useState<Set<string>>(new Set());
  const [creating, setCreating]         = useState(false);
  const [coursesOpen, setCoursesOpen]   = useState(false);
  const { toast } = useToast();

  const fetchUsers = async () => {
    let q = supabase.from('profiles').select('*').order('created_at', { ascending: false });
    if (roleFilter !== 'all') q = q.eq('role', roleFilter);
    if (statusFilter === 'active')   q = q.eq('is_active', true);
    if (statusFilter === 'inactive') q = q.eq('is_active', false);
    if (search) q = q.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);
    const { data } = await q;
    if (data) setUsers(data as Profile[]);
    setLoading(false);
  };

  useEffect(() => {
    supabase.from('courses').select('id, title, category').eq('is_published', true).order('title')
      .then(({ data }) => { if (data) setCourses(data as Course[]); });
  }, []);

  useEffect(() => { fetchUsers(); }, [search, roleFilter, statusFilter]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-create-user`,
      { method: 'DELETE', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` }, body: JSON.stringify({ user_id: deleteTarget.id }) }
    );
    const result = await res.json();
    if (!res.ok || result.error) { toast.error(result.error || 'Failed to delete user'); }
    else { toast.success('User deleted'); fetchUsers(); }
    setDeleteTarget(null);
  };

  const handleUpdateUser = async () => {
    if (!editTarget) return;
    const { error } = await supabase.from('profiles').update({ role: editRole, full_name: editName }).eq('id', editTarget.id);
    if (!error) { toast.success('User updated'); fetchUsers(); }
    else { toast.error('Failed to update user'); }
    setEditTarget(null);
  };

  const handleToggleActive = async (user: Profile) => {
    const { error } = await supabase.from('profiles').update({ is_active: !user.is_active }).eq('id', user.id);
    if (!error) { toast.success(`User ${user.is_active ? 'deactivated' : 'activated'}`); fetchUsers(); }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    const { data: { session } } = await supabase.auth.getSession();

    // Use generated password if not provided
    const password = newUser.password.trim() || generatePassword();

    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-create-user`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({
          email: newUser.email.trim(),
          password,
          full_name: newUser.full_name.trim(),
          role: newUser.role,
          course_ids: [...selectedCourses],
          send_welcome_email: true,
          temp_password: password,
        }),
      }
    );
    const result = await res.json();
    if (!res.ok || result.error) {
      toast.error(result.error || 'Failed to create user');
    } else {
      const enrolled = selectedCourses.size;
      toast.success(`User created${enrolled > 0 ? ` and enrolled in ${enrolled} course${enrolled !== 1 ? 's' : ''}` : ''}. Welcome email sent.`);
      setShowCreateModal(false);
      setNewUser({ email: '', full_name: '', role: 'student', password: '' });
      setSelectedCourses(new Set());
      fetchUsers();
    }
    setCreating(false);
  };

  const exportCSV = () => {
    const header = 'Name,Email,Role,Status,Created At\n';
    const rows = users.map(u =>
      `"${u.full_name}","${u.email}","${u.role}","${u.is_active ? 'Active' : 'Inactive'}","${new Date(u.created_at).toLocaleDateString('en-AU')}"`
    ).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'maximus-users.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const totals = {
    admin: users.filter(u => u.role === 'admin').length,
    teacher: users.filter(u => u.role === 'teacher').length,
    student: users.filter(u => u.role === 'student').length,
  };

  const toggleCourse = (id: string) => {
    setSelectedCourses(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  return (
    <DashboardLayout navItems={adminNavItems} title="Users" subtitle="Manage all platform users">
      <div className="space-y-5">

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Admins',   count: totals.admin,   icon: Shield,       color: 'text-red-600 bg-red-50 dark:bg-red-900/20' },
            { label: 'Teachers', count: totals.teacher, icon: BookOpen,     color: 'text-blue-600 bg-blue-50 dark:bg-blue-900/20' },
            { label: 'Students', count: totals.student, icon: GraduationCap, color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20' },
          ].map(s => (
            <div key={s.label} className={`card p-4 flex items-center gap-3 ${s.color}`}>
              <s.icon className="w-5 h-5 shrink-0" />
              <div>
                <p className="text-2xl font-bold">{s.count}</p>
                <p className="text-xs font-medium opacity-75">{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row gap-3 justify-between">
          <div className="flex gap-2 flex-1 max-w-2xl flex-wrap">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input type="text" placeholder="Search by name or email..." value={search} onChange={e => setSearch(e.target.value)} className="input-field pl-9 py-2 text-sm" />
            </div>
            <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} className="input-field py-2 text-sm w-32">
              <option value="all">All Roles</option>
              <option value="admin">Admin</option>
              <option value="co_admin">Co-Admin</option>
              <option value="teacher">Teacher</option>
              <option value="student">Student</option>
            </select>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="input-field py-2 text-sm w-32">
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          <div className="flex gap-2 shrink-0">
            <button onClick={exportCSV} className="flex items-center gap-2 px-4 py-2 text-sm font-medium border border-gray-200 dark:border-navy-600 rounded-lg hover:bg-gray-50 dark:hover:bg-navy-700 transition-colors text-gray-700 dark:text-gray-300">
              <Download className="w-4 h-4" /> Export CSV
            </button>
            <button onClick={() => setShowCreateModal(true)} className="flex items-center gap-2 btn-primary text-sm py-2">
              <Plus className="w-4 h-4" /> Add Student
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 dark:bg-navy-700/50 border-b border-gray-100 dark:border-navy-700">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">User</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider hidden md:table-cell">Role</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider hidden sm:table-cell">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider hidden lg:table-cell">Joined</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-navy-700">
                {loading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i}>{[1,2,3,4,5].map(j => (
                      <td key={j} className="px-4 py-3"><div className="h-4 bg-gray-200 dark:bg-navy-700 rounded animate-pulse" /></td>
                    ))}</tr>
                  ))
                ) : users.length === 0 ? (
                  <tr><td colSpan={5} className="text-center py-12 text-gray-400 text-sm">No users found</td></tr>
                ) : users.map(user => {
                  const RoleIcon = ROLE_ICONS[user.role] || GraduationCap;
                  return (
                    <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-navy-700/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-sky-500 to-blue-700 flex items-center justify-center text-white text-sm font-bold shrink-0">
                            {(user.full_name?.[0] || user.email[0]).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900 dark:text-white text-sm">{user.full_name || '—'}</p>
                            <p className="text-xs text-gray-400">{user.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <div className="flex items-center gap-1.5">
                          <RoleIcon className="w-3.5 h-3.5 text-gray-400" />
                          <Badge variant={ROLE_COLORS[user.role] || 'default'}>{user.role}</Badge>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <Badge variant={user.is_active ? 'success' : 'error'}>{user.is_active ? 'Active' : 'Inactive'}</Badge>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 hidden lg:table-cell">
                        {new Date(user.created_at).toLocaleDateString('en-AU')}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => handleToggleActive(user)}
                            className={`p-1.5 rounded-lg transition-colors ${user.is_active ? 'text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20' : 'text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'}`}
                            title={user.is_active ? 'Deactivate' : 'Activate'}>
                            {user.is_active ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                          </button>
                          <button onClick={() => { setEditTarget(user); setEditRole(user.role); setEditName(user.full_name || ''); }}
                            className="p-1.5 rounded-lg text-sky-500 hover:bg-sky-50 dark:hover:bg-sky-900/20 transition-colors" title="Edit User">
                            <BookOpen className="w-4 h-4" />
                          </button>
                          <button onClick={() => setDeleteTarget(user)}
                            className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors" title="Delete">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!loading && (
            <div className="px-4 py-3 border-t border-gray-100 dark:border-navy-700 text-xs text-gray-400">
              Showing {users.length} user{users.length !== 1 ? 's' : ''}
            </div>
          )}
        </div>
      </div>

      {/* ── Edit modal ─────────────────────────────────────────────────────── */}
      {editTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setEditTarget(null)} />
          <div className="relative bg-white dark:bg-navy-800 rounded-2xl shadow-2xl w-full max-w-md p-6 animate-slide-up">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">Edit User</h3>
              <button onClick={() => setEditTarget(null)} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-navy-700 transition-colors"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Full Name</label>
                <input type="text" value={editName} onChange={e => setEditName(e.target.value)} className="input-field" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Email</label>
                <input type="email" value={editTarget.email} disabled className="input-field opacity-50 cursor-not-allowed" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Role</label>
                <select value={editRole} onChange={e => setEditRole(e.target.value)} className="input-field">
                  <option value="student">Student</option>
                  <option value="teacher">Teacher</option>
                  <option value="co_admin">Co-Admin</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 justify-end mt-5">
              <button onClick={() => setEditTarget(null)} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-navy-600 rounded-xl hover:bg-gray-50 dark:hover:bg-navy-700 transition-colors">Cancel</button>
              <button onClick={handleUpdateUser} className="btn-primary text-sm py-2">Save Changes</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Create student modal ───────────────────────────────────────────── */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowCreateModal(false)} />
          <div className="relative bg-white dark:bg-navy-800 rounded-2xl shadow-2xl w-full max-w-lg p-6 animate-slide-up max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">Add New Student</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Student will receive a welcome email with login details</p>
              </div>
              <button onClick={() => setShowCreateModal(false)} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-navy-700 transition-colors"><X className="w-5 h-5" /></button>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-4">
              {/* Personal details */}
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Full Name <span className="text-red-500">*</span></label>
                  <input type="text" value={newUser.full_name} onChange={e => setNewUser(u => ({ ...u, full_name: e.target.value }))} className="input-field" placeholder="Jane Smith" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Email Address <span className="text-red-500">*</span></label>
                  <input type="email" value={newUser.email} onChange={e => setNewUser(u => ({ ...u, email: e.target.value }))} className="input-field" placeholder="jane@example.com" required />
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    Password
                    <span className="ml-1 text-xs text-gray-400 font-normal">(auto-generated if empty)</span>
                  </label>
                  <input type="text" value={newUser.password} onChange={e => setNewUser(u => ({ ...u, password: e.target.value }))} className="input-field font-mono text-sm" placeholder="Leave blank to auto-generate" minLength={8} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Role</label>
                  <select value={newUser.role} onChange={e => setNewUser(u => ({ ...u, role: e.target.value }))} className="input-field">
                    <option value="student">Student</option>
                    <option value="teacher">Teacher</option>
                    <option value="co_admin">Co-Admin</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
              </div>

              {/* Course enrolment */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Enrol in Courses
                  <span className="ml-1 text-xs text-gray-400 font-normal">(optional)</span>
                </label>

                <button
                  type="button"
                  onClick={() => setCoursesOpen(o => !o)}
                  className="w-full flex items-center justify-between px-3 py-2.5 border border-gray-200 dark:border-navy-600 rounded-xl text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-navy-700 hover:bg-gray-50 dark:hover:bg-navy-600 transition-colors"
                >
                  <span>
                    {selectedCourses.size === 0 ? 'Select courses to enrol...' : `${selectedCourses.size} course${selectedCourses.size !== 1 ? 's' : ''} selected`}
                  </span>
                  <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${coursesOpen ? 'rotate-180' : ''}`} />
                </button>

                {coursesOpen && (
                  <div className="mt-1.5 border border-gray-200 dark:border-navy-600 rounded-xl overflow-hidden shadow-lg bg-white dark:bg-navy-800 max-h-52 overflow-y-auto">
                    {courses.map(c => {
                      const selected = selectedCourses.has(c.id);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => toggleCourse(c.id)}
                          className={`w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors ${
                            selected ? 'bg-sky-50 dark:bg-sky-900/20' : 'hover:bg-gray-50 dark:hover:bg-navy-700'
                          }`}
                        >
                          <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${
                            selected ? 'border-sky-500 bg-sky-500' : 'border-gray-300 dark:border-navy-500'
                          }`}>
                            {selected && <Check className="w-3 h-3 text-white" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-gray-900 dark:text-white truncate">{c.title}</p>
                            {c.category && <p className="text-xs text-gray-400 truncate">{c.category}</p>}
                          </div>
                        </button>
                      );
                    })}
                    {courses.length === 0 && (
                      <p className="text-sm text-gray-400 text-center py-4">No published courses found</p>
                    )}
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
                          <button type="button" onClick={() => toggleCourse(id)} className="ml-0.5 text-sky-500 hover:text-sky-700">
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Welcome email note */}
              <div className="rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 p-3 flex items-start gap-2.5">
                <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center shrink-0 mt-0.5">
                  <Check className="w-3 h-3 text-white" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">Welcome email will be sent automatically</p>
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">
                    The student will receive their login ID (email address) and temporary password to access the platform.
                  </p>
                </div>
              </div>

              <div className="flex gap-3 justify-end pt-2">
                <button type="button" onClick={() => setShowCreateModal(false)} className="px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-navy-600 rounded-xl hover:bg-gray-50 dark:hover:bg-navy-700 transition-colors">
                  Cancel
                </button>
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

      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="Delete User"
        message={`Are you sure you want to delete ${deleteTarget?.full_name || deleteTarget?.email}? This action cannot be undone.`}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        confirmText="Delete User"
      />
    </DashboardLayout>
  );
}
