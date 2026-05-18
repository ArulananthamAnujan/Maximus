import { useState, useEffect } from 'react';
import { Plus, Trash2, FolderOpen, GripVertical, Check, X, Pencil } from 'lucide-react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { adminNavItems } from './adminNav';
import { supabase } from '../../lib/supabase';
import { toast } from 'sonner';

interface Category {
  id: string;
  name: string;
  slug: string;
  sort_order: number;
  is_active: boolean;
}

export default function AdminCategories() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const fetch = async () => {
    const { data } = await supabase
      .from('course_categories')
      .select('*')
      .order('sort_order')
      .order('name');
    if (data) setCategories(data);
  };

  useEffect(() => { fetch().then(() => setLoading(false)); }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setAdding(true);
    const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const maxOrder = categories.length > 0 ? Math.max(...categories.map(c => c.sort_order)) : 0;
    const { error } = await supabase.from('course_categories').insert({ name, slug, sort_order: maxOrder + 1 });
    if (error) {
      toast.error(error.message.includes('unique') ? 'A category with this name already exists.' : 'Failed to add category.');
    } else {
      toast.success(`"${name}" added.`);
      setNewName('');
      await fetch();
    }
    setAdding(false);
  };

  const handleToggleActive = async (cat: Category) => {
    const { error } = await supabase
      .from('course_categories')
      .update({ is_active: !cat.is_active })
      .eq('id', cat.id);
    if (!error) {
      setCategories(prev => prev.map(c => c.id === cat.id ? { ...c, is_active: !c.is_active } : c));
    }
  };

  const handleDelete = async (cat: Category) => {
    if (!confirm(`Delete "${cat.name}"? This won't affect existing courses.`)) return;
    const { error } = await supabase.from('course_categories').delete().eq('id', cat.id);
    if (error) {
      toast.error('Failed to delete category.');
    } else {
      toast.success(`"${cat.name}" deleted.`);
      setCategories(prev => prev.filter(c => c.id !== cat.id));
    }
  };

  const handleSaveEdit = async (id: string) => {
    const name = editName.trim();
    if (!name) return;
    const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const { error } = await supabase.from('course_categories').update({ name, slug }).eq('id', id);
    if (error) {
      toast.error('Failed to rename category.');
    } else {
      setCategories(prev => prev.map(c => c.id === id ? { ...c, name, slug } : c));
      setEditingId(null);
    }
  };

  return (
    <DashboardLayout navItems={adminNavItems} title="Course Categories" subtitle="Manage categories visible to teachers and students">
      <div className="max-w-2xl space-y-6">

        {/* Add new */}
        <div className="card p-5">
          <h2 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <FolderOpen className="w-5 h-5 text-gold-500" /> Add New Category
          </h2>
          <form onSubmit={handleAdd} className="flex gap-3">
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="e.g. Data Science, Marketing..."
              className="input-field flex-1"
              required
            />
            <button
              type="submit"
              disabled={adding || !newName.trim()}
              className="flex items-center gap-2 btn-primary disabled:opacity-60 whitespace-nowrap"
            >
              <Plus className="w-4 h-4" /> {adding ? 'Adding...' : 'Add Category'}
            </button>
          </form>
        </div>

        {/* List */}
        <div className="card overflow-hidden">
          <div className="p-5 border-b border-gray-100 dark:border-navy-700">
            <h2 className="font-semibold text-gray-900 dark:text-white">
              All Categories <span className="text-sm font-normal text-gray-400 ml-1">({categories.length})</span>
            </h2>
          </div>
          {loading ? (
            <div className="p-5 space-y-3">
              {[1,2,3,4].map(i => <div key={i} className="h-12 bg-gray-100 dark:bg-navy-700 rounded-lg animate-pulse" />)}
            </div>
          ) : categories.length === 0 ? (
            <div className="py-12 text-center text-gray-400 dark:text-gray-500 text-sm">
              No categories yet. Add one above.
            </div>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-navy-700">
              {categories.map(cat => (
                <li key={cat.id} className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 dark:hover:bg-navy-700/40 transition-colors group">
                  <GripVertical className="w-4 h-4 text-gray-300 dark:text-navy-600 shrink-0" />

                  {editingId === cat.id ? (
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <input
                        type="text"
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        className="input-field py-1.5 text-sm flex-1"
                        autoFocus
                        onKeyDown={e => { if (e.key === 'Enter') handleSaveEdit(cat.id); if (e.key === 'Escape') setEditingId(null); }}
                      />
                      <button onClick={() => handleSaveEdit(cat.id)} className="p-1.5 text-emerald-600 hover:text-emerald-700">
                        <Check className="w-4 h-4" />
                      </button>
                      <button onClick={() => setEditingId(null)} className="p-1.5 text-gray-400 hover:text-gray-600">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="flex-1 min-w-0">
                        <span className={`text-sm font-medium ${cat.is_active ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-500 line-through'}`}>
                          {cat.name}
                        </span>
                        <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">{cat.slug}</span>
                      </div>

                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => { setEditingId(cat.id); setEditName(cat.name); }}
                          className="p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-navy-600 transition-colors"
                          title="Rename"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleToggleActive(cat)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
                            cat.is_active
                              ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-200 dark:hover:bg-emerald-900/50'
                              : 'bg-gray-100 dark:bg-navy-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-navy-600'
                          }`}
                        >
                          {cat.is_active ? 'Active' : 'Hidden'}
                        </button>
                        <button
                          onClick={() => handleDelete(cat)}
                          className="p-1.5 text-gray-300 hover:text-red-500 dark:text-gray-600 dark:hover:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="text-xs text-gray-400 dark:text-gray-500">
          Hidden categories remain on existing courses but won't appear as filter options for new courses. Deleting a category won't change existing course assignments.
        </p>
      </div>
    </DashboardLayout>
  );
}
