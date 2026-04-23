import { useState, useEffect } from 'react';
import { Plus, Trash2, Bell, ToggleRight, ToggleLeft } from 'lucide-react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { adminNavItems } from './adminNav';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../contexts/ToastContext';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import Badge from '../../components/ui/Badge';
import { useAuth } from '../../contexts/AuthContext';
import type { Announcement } from '../../types';

export default function AdminAnnouncements() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<Announcement | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ title: '', content: '' });
  const [creating, setCreating] = useState(false);
  const { profile } = useAuth();
  const { toast } = useToast();

  const fetchData = async () => {
    const { data } = await supabase.from('announcements').select('*').order('created_at', { ascending: false });
    if (data) setItems(data as Announcement[]);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    const { error } = await supabase.from('announcements').insert({ title: form.title, content: form.content, created_by: profile?.id, is_active: true });
    if (!error) {
      toast.success('Announcement published');
      setShowCreate(false);
      setForm({ title: '', content: '' });
      fetchData();
    } else toast.error('Failed to create announcement');
    setCreating(false);
  };

  const handleToggle = async (item: Announcement) => {
    await supabase.from('announcements').update({ is_active: !item.is_active }).eq('id', item.id);
    toast.success(item.is_active ? 'Announcement hidden' : 'Announcement activated');
    fetchData();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await supabase.from('announcements').delete().eq('id', deleteTarget.id);
    toast.success('Announcement deleted');
    setDeleteTarget(null);
    fetchData();
  };

  return (
    <DashboardLayout navItems={adminNavItems} title="Announcements" subtitle="Send platform-wide announcements to all users">
      <div className="space-y-5">
        <div className="flex justify-end">
          <button onClick={() => setShowCreate(true)} className="btn-primary text-sm py-2 flex items-center gap-2">
            <Plus className="w-4 h-4" /> New Announcement
          </button>
        </div>

        <div className="space-y-4">
          {loading ? Array.from({ length: 3 }).map((_, i) => <div key={i} className="card p-5 animate-pulse"><div className="h-5 bg-gray-200 dark:bg-navy-700 rounded w-1/3 mb-3" /><div className="h-4 bg-gray-200 dark:bg-navy-700 rounded w-full mb-2" /><div className="h-4 bg-gray-200 dark:bg-navy-700 rounded w-3/4" /></div>) :
          items.length === 0 ? (
            <div className="card text-center py-16">
              <Bell className="w-10 h-10 text-gray-400 mx-auto mb-3" />
              <h3 className="font-semibold text-gray-900 dark:text-white mb-1">No announcements yet</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">Create your first announcement to inform all students and teachers.</p>
            </div>
          ) : (
            items.map(item => (
              <div key={item.id} className="card p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-gray-900 dark:text-white">{item.title}</h3>
                      <Badge variant={item.is_active ? 'success' : 'error'}>{item.is_active ? 'Active' : 'Hidden'}</Badge>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{item.content}</p>
                    <p className="text-xs text-gray-400 mt-3">{new Date(item.created_at).toLocaleString('en-AU')}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => handleToggle(item)} className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-navy-700 transition-colors">
                      {item.is_active ? <ToggleRight className="w-5 h-5 text-green-500" /> : <ToggleLeft className="w-5 h-5" />}
                    </button>
                    <button onClick={() => setDeleteTarget(item)} className="p-2 rounded-lg text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowCreate(false)} />
          <div className="relative bg-white dark:bg-navy-800 rounded-2xl shadow-2xl w-full max-w-lg p-6 animate-slide-up">
            <h3 className="font-playfair text-xl font-bold text-gray-900 dark:text-white mb-5">New Announcement</h3>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Title</label>
                <input type="text" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className="input-field" placeholder="Important update for all students" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Message</label>
                <textarea value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))} className="input-field resize-none" rows={5} placeholder="Write your announcement message here..." required />
              </div>
              <div className="flex gap-3 justify-end pt-2">
                <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm border border-gray-200 dark:border-navy-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-navy-700 transition-colors">Cancel</button>
                <button type="submit" disabled={creating} className="btn-primary text-sm py-2 disabled:opacity-60">{creating ? 'Publishing...' : 'Publish'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog isOpen={!!deleteTarget} title="Delete Announcement" message="Delete this announcement? This action cannot be undone." onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} confirmText="Delete" />
    </DashboardLayout>
  );
}
