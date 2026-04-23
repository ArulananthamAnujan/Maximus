import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Search, Plus, Download, Pencil, Trash2, UserCheck, UserX,
  Shield, GraduationCap, BookOpen, KeyRound, ExternalLink,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { adminNavItems } from './adminNav';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../contexts/ToastContext';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import Badge from '../../components/ui/Badge';
import type { Profile } from '../../types';

const ROLE_COLORS: Record<string, 'error' | 'info' | 'success'> = {
  admin: 'error', teacher: 'info', student: 'success',
};
const ROLE_ICONS: Record<string, React.ElementType> = {
  admin: Shield, teacher: BookOpen, student: GraduationCap,
};

export default function AdminUsers() {
  const [allUsers, setAllUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [deleteTarget, setDeleteTarget] = useState<Profile | null>(null);
  const [editTarget, setEditTarget] = useState<Profile | null>(null);
  const [editRole, setEditRole] = useState('');
  const [editName, setEditName] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newUser, setNewUser] = useState({ email: '', full_name: '', role: 'student', password: '' });
  const [creating, setCreating] = useState(false);
  const [resetTarget, setResetTarget] = useState<Profile | null>(null);
  const [resetting, setResetting] = useState(false);
  const { toast } = useToast();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(search), 250);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search]);

  const fetchUsers = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('id,email,full_name,role,phone,bio,avatar_url,is_active,created_at,updated_at')
      .order('created_at', { ascending: false });
    if (data) setAllUsers(data as Profile[]);
    setLoading(false);
  };

  useEffect(() => { fetchUsers(); }, []);

  // All filtering done client-side — zero DB calls on filter/search changes
  const users = useMemo(() => {
    let result = allUsers;
    if (roleFilter !== 'all') result = result.filter(u => u.role === roleFilter);
    if (statusFilter === 'active') result = result.filter(u => u.is_active !== false);
    if (statusFilter === 'inactive') result = result.filter(u => u.is_active === false);
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      result = result.filter(u =>
        (u.full_name || '').toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q)
      );
    }
    return result;
  }, [allUsers, roleFilter, statusFilter, debouncedSearch]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase.from('profiles').delete().eq('id', deleteTarget.id);
    if (!error) {
      toast.success('User deleted');
      setAllUsers(prev => prev.filter(u => u.id !== deleteTarget.id));
    } else {
      toast.error('Failed to delete user');
    }
    setDeleteTarget(null);
  };

  const handleUpdateUser = async () => {
    if (!editTarget) return;
    const { error } = await supabase
      .from('profiles')
      .update({ role: editRole, full_name: editName })
      .eq('id', editTarget.id);
    if (!error) {
      toast.success('User updated');
      setAllUsers(prev => prev.map(u => u.id === editTarget.id ? { ...u, role: editRole, full_name: editName } : u));
    } else {
      toast.error('Failed to update user');
    }
    setEditTarget(null);
  };

  const handleToggleActive = async (user: Profile) => {
    const newState = user.is_active === false ? true : false;
    const { error } = await supabase.from('profiles').update({ is_active: newState }).eq('id', user.id);
    if (!error) {
      toast.success(newState ? 'User activated' : 'User deactivated');
      setAllUsers(prev => prev.map(u => u.id === user.id ? { ...u, is_active: newState } : u));
    }
  };

  const handleSendPasswordReset = async () => {
    if (!resetTarget) return;
    setResetting(true);
    const { error } = await supabase.auth.resetPasswordForEmail(resetTarget.email, {
      redirectTo: `${window.location.origin}/forgot-password`,
    });
    if (!error) {
      toast.success(`Password reset email sent to ${resetTarget.email}`);
    } else {
      toast.error('Failed to send reset email');
    }
    setResetting(false);
    setResetTarget(null);
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-create-user`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          email: newUser.email,
          password: newUser.password,
          full_name: newUser.full_name,
          role: newUser.role,
        }),
      }
    );
    const result = await res.json();
    if (!res.ok || result.error) {
      toast.error(result.error || 'Failed to create user');
    } else {
      toast.success('User created successfully');
      setShowCreateModal(false);
      setNewUser({ email: '', full_name: '', role: 'student', password: '' });
      fetchUsers();
    }
    setCreating(false);
  };

  const exportCSV = () => {
    const header = 'Name,Email,Role,Status,Created At\n';
    const rows = users.map(u =>
      `"${u.full_name || ''}","${u.email}","${u.role}","${u.is_active === false ? 'Inactive' : 'Active'}","${new Date(u.created_at).toLocaleDateString('en-AU')}"`
    ).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'maximus-users.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const totalByRole = useMemo(() => ({
    admin: allUsers.filter(u => u.role === 'admin').length,
    teacher: allUsers.filter(u => u.role === 'teacher').length,
    student: allUsers.filter(u => u.role === 'student').length,
  }), [allUsers]);

  return (
    <DashboardLayout navItems={adminNavItems} title="Users" subtitle="Manage all platform users">
      <div className="space-y-5">
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Admins', count: totalByRole.admin, icon: Shield, color: 'text-red-600 bg-red-50 dark:bg-red-900/20' },
            { label: 'Teachers', count: totalByRole.teacher, icon: BookOpen, color: 'text-blue-600 bg-blue-50 dark:bg-blue-900/20' },
            { label: 'Students', count: totalByRole.student, icon: GraduationCap, color: 'text-green-600 bg-green-50 dark:bg-green-900/20' },
          ].map(s => (
            <div key={s.label} className={`card p-4 flex items-center gap-3 ${s.color}`}>
              <s.icon className="w-5 h-5 shrink-0" />
              <div>
                <p className="text-2xl font-bold font-playfair">{s.count}</p>
                <p className="text-xs font-medium opacity-75">{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-between">
          <div className="flex gap-2 flex-1 max-w-2xl flex-wrap">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by name or email..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="input-field pl-9 py-2 text-sm"
              />
            </div>
            <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} className="input-field py-2 text-sm w-32">
              <option value="all">All Roles</option>
              <option value="admin">Admin</option>
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
            <button
              onClick={exportCSV}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium border border-gray-200 dark:border-navy-600 rounded-lg hover:bg-gray-50 dark:hover:bg-navy-700 transition-colors text-gray-700 dark:text-gray-300"
            >
              <Download className="w-4 h-4" /> Export CSV
            </button>
            <button onClick={() => setShowCreateModal(true)} className="flex items-center gap-2 btn-primary text-sm py-2">
              <Plus className="w-4 h-4" /> Add User
            </button>
          </div>
        </div>

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
                    <tr key={i}>
                      {[1,2,3,4,5].map(j => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 bg-gray-200 dark:bg-navy-700 rounded animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-12 text-gray-400 text-sm">No users found</td>
                  </tr>
                ) : users.map(user => {
                  const RoleIcon = ROLE_ICONS[user.role] || GraduationCap;
                  const isActive = user.is_active !== false;
                  return (
                    <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-navy-700/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-navy-500 to-navy-800 flex items-center justify-center text-white text-sm font-bold shrink-0">
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
                        <Badge variant={isActive ? 'success' : 'error'}>{isActive ? 'Active' : 'Inactive'}</Badge>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 hidden lg:table-cell">
                        {new Date(user.created_at).toLocaleDateString('en-AU')}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {/* Grant course access — link to enrollments filtered by user */}
                          <Link
                            to={`/admin/enrollments?userId=${user.id}`}
                            className="p-1.5 rounded-lg text-teal-500 hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-colors"
                            title="Manage enrolments"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </Link>
                          {/* Send password reset email */}
                          <button
                            onClick={() => setResetTarget(user)}
                            className="p-1.5 rounded-lg text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
                            title="Send password reset email"
                          >
                            <KeyRound className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleToggleActive(user)}
                            className={`p-1.5 rounded-lg transition-colors ${isActive ? 'text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20' : 'text-green-500 hover:bg-green-50 dark:hover:bg-green-900/20'}`}
                            title={isActive ? 'Deactivate' : 'Activate'}
                          >
                            {isActive ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                          </button>
                          <button
                            onClick={() => { setEditTarget(user); setEditRole(user.role); setEditName(user.full_name || ''); }}
                            className="p-1.5 rounded-lg text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                            title="Edit User"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setDeleteTarget(user)}
                            className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                            title="Delete"
                          >
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
              Showing {users.length} of {allUsers.length} user{allUsers.length !== 1 ? 's' : ''}
            </div>
          )}
        </div>
      </div>

      {/* Edit User Modal */}
      {editTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setEditTarget(null)} />
          <div className="relative bg-white dark:bg-navy-800 rounded-2xl shadow-2xl w-full max-w-md p-6 animate-slide-up">
            <h3 className="font-playfair text-xl font-bold text-gray-900 dark:text-white mb-5">Edit User</h3>
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
                  <option value="admin">Admin</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 justify-end mt-5">
              <button onClick={() => setEditTarget(null)} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-navy-600 rounded-lg hover:bg-gray-50 dark:hover:bg-navy-700 transition-colors">Cancel</button>
              <button onClick={handleUpdateUser} className="btn-primary text-sm py-2">Save Changes</button>
            </div>
          </div>
        </div>
      )}

      {/* Password Reset Confirmation */}
      {resetTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setResetTarget(null)} />
          <div className="relative bg-white dark:bg-navy-800 rounded-2xl shadow-2xl w-full max-w-md p-6 animate-slide-up">
            <div className="w-12 h-12 bg-amber-100 dark:bg-amber-900/30 rounded-2xl flex items-center justify-center mb-4">
              <KeyRound className="w-6 h-6 text-amber-600 dark:text-amber-400" />
            </div>
            <h3 className="font-playfair text-xl font-bold text-gray-900 dark:text-white mb-2">Send Password Reset</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
              A password reset link will be sent to <strong className="text-gray-900 dark:text-white">{resetTarget.email}</strong>. The user can follow the link to set a new password.
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setResetTarget(null)} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-navy-600 rounded-lg hover:bg-gray-50 dark:hover:bg-navy-700 transition-colors">Cancel</button>
              <button onClick={handleSendPasswordReset} disabled={resetting} className="btn-primary text-sm py-2 disabled:opacity-60">
                {resetting ? 'Sending...' : 'Send Reset Email'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create User Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowCreateModal(false)} />
          <div className="relative bg-white dark:bg-navy-800 rounded-2xl shadow-2xl w-full max-w-md p-6 animate-slide-up">
            <h3 className="font-playfair text-xl font-bold text-gray-900 dark:text-white mb-5">Create New User</h3>
            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Full Name</label>
                <input type="text" value={newUser.full_name} onChange={e => setNewUser(u => ({ ...u, full_name: e.target.value }))} className="input-field" placeholder="Jane Smith" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Email</label>
                <input type="email" value={newUser.email} onChange={e => setNewUser(u => ({ ...u, email: e.target.value }))} className="input-field" placeholder="jane@example.com" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Password</label>
                <input type="password" value={newUser.password} onChange={e => setNewUser(u => ({ ...u, password: e.target.value }))} className="input-field" placeholder="Min. 8 characters" required minLength={8} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Role</label>
                <select value={newUser.role} onChange={e => setNewUser(u => ({ ...u, role: e.target.value }))} className="input-field">
                  <option value="student">Student</option>
                  <option value="teacher">Teacher</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className="flex gap-3 justify-end pt-2">
                <button type="button" onClick={() => setShowCreateModal(false)} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-navy-600 rounded-lg hover:bg-gray-50 dark:hover:bg-navy-700 transition-colors">Cancel</button>
                <button type="submit" disabled={creating} className="btn-primary text-sm py-2 disabled:opacity-60">
                  {creating ? 'Creating...' : 'Create User'}
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
