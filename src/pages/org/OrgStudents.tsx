import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  GraduationCap, Plus, Trash2, Search, Mail, X,
  ToggleLeft, ToggleRight, BookOpen, Download
} from 'lucide-react';
import { toast } from 'sonner';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { orgNavItems } from './orgNav';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import type { OrgStudent } from '../../types';

interface StudentWithProfile extends OrgStudent {
  profile: {
    id: string;
    full_name: string;
    email: string;
    avatar_url: string | null;
    is_active: boolean;
    created_at: string;
  };
  enrollment_count?: number;
}

function AddStudentModal({ orgId, onClose }: { orgId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const { profile: adminProfile } = useAuth();
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    const { data: found } = await supabase
      .from('profiles')
      .select('id, role, full_name')
      .eq('email', email.trim().toLowerCase())
      .maybeSingle();

    if (!found) {
      toast.error('No account found with that email. Ask the student to register first.');
      setSaving(false);
      return;
    }

    if (found.role === 'admin' || found.role === 'org_admin') {
      toast.error('Cannot add admin accounts as students.');
      setSaving(false);
      return;
    }

    const { error } = await supabase.from('org_students').insert({
      org_id: orgId,
      user_id: found.id,
      enrolled_by: adminProfile?.id ?? null,
    });

    if (error) {
      toast.error(error.message.includes('unique') ? 'This student is already in your organisation.' : error.message);
    } else {
      toast.success(`${found.full_name || email} added as a student`);
      qc.invalidateQueries({ queryKey: ['org-students', orgId] });
      onClose();
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-800">Add Student</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={add} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Student Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="input-field"
              placeholder="student@email.com"
              autoFocus
            />
            <p className="text-xs text-slate-400 mt-1.5">
              The student must already have a registered account. They will see your organisation's courses.
            </p>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary flex-1">
              {saving ? 'Adding...' : 'Add Student'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function OrgStudents() {
  const { orgMembership } = useAuth();
  const orgId = (orgMembership?.organization as { id?: string })?.id ?? orgMembership?.org_id;
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('all');

  const { data: students = [], isLoading } = useQuery({
    queryKey: ['org-students', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase
        .from('org_students')
        .select('*, profile:profiles(id, full_name, email, avatar_url, is_active, created_at)')
        .eq('org_id', orgId!)
        .order('enrolled_at', { ascending: false });
      return (data ?? []) as StudentWithProfile[];
    },
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from('org_students').update({ is_active }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['org-students', orgId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const removeStudent = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('org_students').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Student removed'); qc.invalidateQueries({ queryKey: ['org-students', orgId] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = students.filter(s => {
    if (filter === 'active' && !s.is_active) return false;
    if (filter === 'inactive' && s.is_active) return false;
    const q = search.toLowerCase();
    if (q && !s.profile.full_name?.toLowerCase().includes(q) && !s.profile.email.toLowerCase().includes(q)) return false;
    return true;
  });

  const activeCount = students.filter(s => s.is_active).length;

  const exportCSV = () => {
    const rows = [['Name', 'Email', 'Status', 'Enrolled At']];
    students.forEach(s => rows.push([
      s.profile.full_name ?? '',
      s.profile.email,
      s.is_active ? 'Active' : 'Inactive',
      new Date(s.enrolled_at).toLocaleDateString(),
    ]));
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'students.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <DashboardLayout navItems={orgNavItems} title="Students" subtitle="Manage students in your organisation">
      {showAdd && orgId && <AddStudentModal orgId={orgId} onClose={() => setShowAdd(false)} />}

      <div className="space-y-5">
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div className="card p-4 flex items-center gap-3">
            <div className="w-10 h-10 bg-sky-100 rounded-xl flex items-center justify-center">
              <GraduationCap className="w-5 h-5 text-sky-600" />
            </div>
            <div>
              <p className="text-xl font-bold text-slate-800">{students.length}</p>
              <p className="text-xs text-slate-500">Total Students</p>
            </div>
          </div>
          <div className="card p-4 flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
              <ToggleRight className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-xl font-bold text-slate-800">{activeCount}</p>
              <p className="text-xs text-slate-500">Active</p>
            </div>
          </div>
          <div className="card p-4 flex items-center gap-3">
            <div className="w-10 h-10 bg-rose-100 rounded-xl flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-rose-600" />
            </div>
            <div>
              <p className="text-xl font-bold text-slate-800">{students.length - activeCount}</p>
              <p className="text-xs text-slate-500">Inactive</p>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by name or email..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="input-field pl-9"
            />
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-xl border border-slate-200 overflow-hidden">
              {(['all', 'active', 'inactive'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-2 text-xs font-semibold transition-colors capitalize ${filter === f ? 'bg-slate-800 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
                >
                  {f}
                </button>
              ))}
            </div>
            <button onClick={exportCSV} className="btn-secondary flex items-center gap-2 shrink-0">
              <Download className="w-4 h-4" /> Export
            </button>
            <button onClick={() => setShowAdd(true)} className="btn-primary flex items-center gap-2 shrink-0">
              <Plus className="w-4 h-4" /> Add Student
            </button>
          </div>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="card h-16 animate-pulse" />)}</div>
        ) : filtered.length === 0 ? (
          <div className="card p-12 text-center">
            <GraduationCap className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">No students yet</p>
            <p className="text-sm text-slate-400 mt-1 mb-4">
              Add students to your organisation so they can access your courses.
            </p>
            <button onClick={() => setShowAdd(true)} className="btn-primary inline-flex items-center gap-2">
              <Plus className="w-4 h-4" /> Add First Student
            </button>
          </div>
        ) : (
          <div className="card overflow-hidden">
            {/* Header */}
            <div className="hidden sm:grid grid-cols-[1fr_1fr_120px_100px_80px] gap-4 px-4 py-3 bg-slate-50 border-b border-slate-100 text-xs font-semibold text-slate-500 uppercase tracking-wide">
              <span>Student</span>
              <span>Email</span>
              <span>Enrolled</span>
              <span>Status</span>
              <span className="text-right">Actions</span>
            </div>
            <div className="divide-y divide-slate-100">
              {filtered.map(s => (
                <div key={s.id} className="flex sm:grid sm:grid-cols-[1fr_1fr_120px_100px_80px] gap-4 items-center px-4 py-3 hover:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-sky-100 to-teal-100 flex items-center justify-center text-sky-700 font-bold text-sm shrink-0">
                      {s.profile.full_name?.[0]?.toUpperCase() ?? s.profile.email[0].toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">{s.profile.full_name || '—'}</p>
                      <p className="text-xs text-slate-400 sm:hidden truncate flex items-center gap-1">
                        <Mail className="w-3 h-3" />{s.profile.email}
                      </p>
                    </div>
                  </div>
                  <p className="text-sm text-slate-500 hidden sm:block truncate">{s.profile.email}</p>
                  <p className="text-xs text-slate-400 hidden sm:block">{new Date(s.enrolled_at).toLocaleDateString()}</p>
                  <div className="hidden sm:flex items-center">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${s.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {s.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 justify-end ml-auto sm:ml-0">
                    <button
                      onClick={() => toggleActive.mutate({ id: s.id, is_active: !s.is_active })}
                      className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors text-slate-400"
                      title={s.is_active ? 'Deactivate' : 'Activate'}
                    >
                      {s.is_active ? <ToggleRight className="w-4 h-4 text-emerald-500" /> : <ToggleLeft className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => { if (confirm(`Remove ${s.profile.full_name || s.profile.email} from your organisation?`)) removeStudent.mutate(s.id); }}
                      className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
                      title="Remove student"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
