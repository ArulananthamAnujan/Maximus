import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, Save, X, GripVertical, HelpCircle, Eye, EyeOff } from 'lucide-react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { coAdminNavItems } from './coAdminNav';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'sonner';
import ConfirmDialog from '../../components/ui/ConfirmDialog';

interface FAQ {
  id: string;
  question: string;
  answer: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

const EMPTY: Omit<FAQ, 'id' | 'created_at'> = {
  question: '', answer: '', sort_order: 0, is_active: true,
};

export default function CoAdminFAQs() {
  const { profile } = useAuth();
  const [faqs, setFaqs] = useState<FAQ[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<Omit<FAQ, 'id' | 'created_at'>>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('faqs').select('*').order('sort_order').order('created_at');
    if (data) setFaqs(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const startNew = () => {
    const nextOrder = faqs.length > 0 ? Math.max(...faqs.map(f => f.sort_order)) + 1 : 1;
    setForm({ ...EMPTY, sort_order: nextOrder });
    setEditing('new');
  };

  const startEdit = (faq: FAQ) => {
    setForm({ question: faq.question, answer: faq.answer, sort_order: faq.sort_order, is_active: faq.is_active });
    setEditing(faq.id);
  };

  const cancelEdit = () => { setEditing(null); setForm(EMPTY); };

  const handleSave = async () => {
    if (!form.question.trim() || !form.answer.trim()) { toast.error('Question and answer are required.'); return; }
    setSaving(true);
    try {
      if (editing === 'new') {
        const { error } = await supabase.from('faqs').insert({ ...form, created_by: profile?.id, updated_at: new Date().toISOString() });
        if (error) throw error;
        toast.success('FAQ added.');
      } else {
        const { error } = await supabase.from('faqs').update({ ...form, updated_at: new Date().toISOString() }).eq('id', editing);
        if (error) throw error;
        toast.success('FAQ updated.');
      }
      cancelEdit();
      load();
    } catch { toast.error('Failed to save FAQ.'); }
    finally { setSaving(false); }
  };

  const handleToggleActive = async (faq: FAQ) => {
    await supabase.from('faqs').update({ is_active: !faq.is_active, updated_at: new Date().toISOString() }).eq('id', faq.id);
    load();
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await supabase.from('faqs').delete().eq('id', deleteId);
    toast.success('FAQ deleted.');
    setDeleteId(null);
    load();
  };

  return (
    <DashboardLayout navItems={coAdminNavItems} title="FAQ Manager" subtitle="Manage frequently asked questions shown on the contact page">
      <div className="space-y-5 max-w-4xl">
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-500">
            <span className="font-bold text-slate-900">{faqs.filter(f => f.is_active).length}</span> active FAQs shown publicly
          </p>
          <button onClick={startNew} className="flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-sm font-bold rounded-xl transition-colors">
            <Plus className="w-4 h-4" /> Add FAQ
          </button>
        </div>

        {editing === 'new' && (
          <div className="bg-sky-50 border border-sky-200 rounded-2xl p-6">
            <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
              <HelpCircle className="w-5 h-5 text-sky-600" /> New FAQ
            </h3>
            <FAQForm form={form} setForm={setForm} saving={saving} onSave={handleSave} onCancel={cancelEdit} />
          </div>
        )}

        {loading ? (
          <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-20 bg-slate-100 rounded-2xl animate-pulse" />)}</div>
        ) : faqs.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-2xl border border-slate-100">
            <HelpCircle className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500">No FAQs yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {faqs.map(faq => (
              <div key={faq.id} className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${!faq.is_active ? 'border-slate-100 opacity-60' : 'border-slate-100'}`}>
                {editing === faq.id ? (
                  <div className="p-6"><FAQForm form={form} setForm={setForm} saving={saving} onSave={handleSave} onCancel={cancelEdit} /></div>
                ) : (
                  <div className="p-5">
                    <div className="flex items-start gap-3">
                      <GripVertical className="w-4 h-4 text-slate-300 mt-1 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <p className="font-semibold text-slate-900 leading-snug mb-1">{faq.question}</p>
                            <p className="text-sm text-slate-500 line-clamp-2 leading-relaxed">{faq.answer}</p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${faq.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                              {faq.is_active ? 'Active' : 'Hidden'}
                            </span>
                            <button onClick={() => handleToggleActive(faq)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors">
                              {faq.is_active ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                            </button>
                            <button onClick={() => startEdit(faq)} className="p-1.5 text-slate-400 hover:text-sky-600 rounded-lg hover:bg-sky-50 transition-colors">
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button onClick={() => setDeleteId(faq.id)} className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                        <p className="text-xs text-slate-400 mt-2">Order: {faq.sort_order}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={!!deleteId}
        title="Delete FAQ"
        message="Are you sure you want to permanently delete this FAQ?"
        confirmText="Delete"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
      />
    </DashboardLayout>
  );
}

function FAQForm({ form, setForm, saving, onSave, onCancel }: {
  form: Omit<FAQ, 'id' | 'created_at'>;
  setForm: React.Dispatch<React.SetStateAction<Omit<FAQ, 'id' | 'created_at'>>>;
  saving: boolean; onSave: () => void; onCancel: () => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">Question</label>
        <input type="text" value={form.question} onChange={e => setForm(f => ({ ...f, question: e.target.value }))} className="input-field" placeholder="e.g. How do I enrol in a course?" />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">Answer</label>
        <textarea value={form.answer} onChange={e => setForm(f => ({ ...f, answer: e.target.value }))} className="input-field resize-none" rows={4} placeholder="Provide a clear, helpful answer..." />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Display Order</label>
          <input type="number" value={form.sort_order} onChange={e => setForm(f => ({ ...f, sort_order: parseInt(e.target.value) || 0 }))} className="input-field" min={0} />
        </div>
        <div className="flex items-end pb-0.5">
          <label className="flex items-center gap-3 cursor-pointer">
            <div onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))} className={`relative w-10 h-6 rounded-full transition-colors cursor-pointer ${form.is_active ? 'bg-sky-600' : 'bg-slate-300'}`}>
              <span className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.is_active ? 'translate-x-4' : ''}`} />
            </div>
            <span className="text-sm font-medium text-slate-700">Active (shown publicly)</span>
          </label>
        </div>
      </div>
      <div className="flex gap-3 pt-2">
        <button onClick={onSave} disabled={saving} className="flex items-center gap-2 px-5 py-2.5 bg-sky-600 hover:bg-sky-700 text-white text-sm font-bold rounded-xl transition-colors disabled:opacity-60">
          <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save FAQ'}
        </button>
        <button onClick={onCancel} className="flex items-center gap-2 px-5 py-2.5 border border-slate-200 text-slate-700 text-sm font-bold rounded-xl hover:bg-slate-50 transition-colors">
          <X className="w-4 h-4" /> Cancel
        </button>
      </div>
    </div>
  );
}
