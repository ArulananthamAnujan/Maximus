import { useEffect, useState } from 'react';
import { Save, X, Image, DollarSign, Globe, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase';
import { safeUrl } from '../../lib/utils';
import { UploadZone } from './media';
import NumberInput from '../ui/NumberInput';

interface Props {
  courseId: string;
  onSaved: () => Promise<void> | void;
}

interface Form {
  title: string;
  short_description: string;
  description: string;
  category: string;
  level: string;
  thumbnail_url: string;
  is_free: boolean;
  price: number;
}

const EMPTY: Form = { title: '', short_description: '', description: '', category: '', level: 'beginner', thumbnail_url: '', is_free: true, price: 0 };

export default function CourseSettings({ courseId, onSaved }: Props) {
  const [form, setForm] = useState<Form>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);
  const [newCategory, setNewCategory] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      supabase.from('courses').select('title, short_description, description, category, level, thumbnail_url, is_free, price, price_amount').eq('id', courseId).maybeSingle(),
      supabase.from('course_categories').select('name').eq('is_active', true).order('sort_order'),
    ]).then(([course, cats]) => {
      if (cancelled) return;
      const c = course.data;
      if (c) {
        setForm({
          title: c.title ?? '', short_description: c.short_description ?? '', description: c.description ?? '',
          category: c.category ?? '', level: c.level ?? 'beginner', thumbnail_url: c.thumbnail_url ?? '',
          is_free: c.is_free !== false && !(Number(c.price_amount ?? c.price) > 0), price: Number(c.price_amount ?? c.price ?? 0),
        });
      }
      setCategories((cats.data ?? []).map(r => r.name));
      setLoaded(true);
    });
    return () => { cancelled = true; };
  }, [courseId]);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm(f => ({ ...f, [key]: value }));

  const addCategory = async () => {
    const name = (newCategory ?? '').trim();
    if (!name) return;
    const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const { error } = await supabase.from('course_categories').insert({ name, slug });
    if (error && !categories.includes(name)) { toast.error('Could not add the category.'); return; }
    setCategories(prev => prev.includes(name) ? prev : [...prev, name]);
    set('category', name);
    setNewCategory(null);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) { toast.error('Give the course a title.'); return; }
    if (!form.is_free && !(form.price > 0)) { toast.error('Enter a price, or make the course free.'); return; }
    setSaving(true);
    const price = form.is_free ? 0 : form.price;
    const { error } = await supabase.from('courses').update({
      title: form.title.trim(),
      short_description: form.short_description.trim(),
      description: form.description,
      category: form.category || null,
      level: form.level,
      thumbnail_url: form.thumbnail_url.trim() || null,
      is_free: form.is_free,
      is_paid: !form.is_free,
      price,
      price_amount: price,
    }).eq('id', courseId);
    setSaving(false);
    if (error) { toast.error('Could not save the course details.'); return; }
    toast.success('Course details saved');
    await onSaved();
  };

  if (!loaded) return <div className="flex items-center gap-2 text-sm text-slate-500 py-10 justify-center"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>;

  const thumb = safeUrl(form.thumbnail_url);

  return (
    <form onSubmit={save} className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] items-start">
      <div className="space-y-5 min-w-0">
        <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <h2 className="font-semibold text-slate-900">What students see</h2>
          <div>
            <label htmlFor="cs-title" className="block text-sm font-semibold text-slate-700 mb-1.5">Title</label>
            <input id="cs-title" value={form.title} onChange={e => set('title', e.target.value)} className="input-field text-base font-medium" required />
          </div>
          <div>
            <label htmlFor="cs-short" className="block text-sm font-semibold text-slate-700 mb-1.5">One-line summary</label>
            <input id="cs-short" value={form.short_description} onChange={e => set('short_description', e.target.value)} className="input-field" maxLength={120} placeholder="Shown on course cards" />
            <p className="text-xs text-slate-400 mt-1">{form.short_description.length}/120</p>
          </div>
          <div>
            <label htmlFor="cs-desc" className="block text-sm font-semibold text-slate-700 mb-1.5">Full description</label>
            <textarea id="cs-desc" value={form.description} onChange={e => set('description', e.target.value)} className="input-field resize-y" rows={7} placeholder="What students will learn, what they need before starting, and who the course is for." />
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="cs-cat" className="block text-sm font-semibold text-slate-700 mb-1.5">Category</label>
              {newCategory !== null ? (
                <div className="flex gap-2">
                  <input value={newCategory} onChange={e => setNewCategory(e.target.value)} className="input-field flex-1 text-sm" placeholder="New category name" autoFocus aria-label="New category name" />
                  <button type="button" onClick={addCategory} className="px-3 py-2 bg-sky-600 text-white text-xs font-semibold rounded-lg">Add</button>
                  <button type="button" onClick={() => setNewCategory(null)} aria-label="Cancel" className="px-2 py-2 text-slate-500 rounded-lg hover:bg-slate-100"><X className="w-4 h-4" /></button>
                </div>
              ) : (
                <select id="cs-cat" value={form.category} onChange={e => e.target.value === '__new__' ? setNewCategory('') : set('category', e.target.value)} className="input-field">
                  <option value="">Choose a category</option>
                  {form.category && !categories.includes(form.category) && <option value={form.category}>{form.category}</option>}
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                  <option value="__new__">+ New category…</option>
                </select>
              )}
            </div>
            <div>
              <label htmlFor="cs-level" className="block text-sm font-semibold text-slate-700 mb-1.5">Level</label>
              <select id="cs-level" value={form.level} onChange={e => set('level', e.target.value)} className="input-field">
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </select>
            </div>
          </div>
        </section>
      </div>

      <div className="space-y-5">
        <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <h2 className="font-semibold text-slate-900 flex items-center gap-2"><Image className="w-4 h-4 text-slate-400" /> Cover image</h2>
          {thumb ? (
            <div className="relative rounded-lg overflow-hidden border border-slate-200 aspect-video bg-slate-100">
              <img src={thumb} alt="Course cover" className="w-full h-full object-cover" />
              <button type="button" onClick={() => set('thumbnail_url', '')} aria-label="Remove cover image" className="absolute top-2 right-2 w-7 h-7 bg-black/60 hover:bg-black/80 rounded-lg flex items-center justify-center text-white"><X className="w-3.5 h-3.5" /></button>
            </div>
          ) : (
            <UploadZone accept="image/jpeg,image/png,image/webp,image/gif" bucket="course-thumbnails" path={courseId} onUploaded={url => set('thumbnail_url', url)} label="Upload an image" icon={Image} hint="JPG, PNG or WebP, ideally 1280×720" />
          )}
          <input type="url" value={form.thumbnail_url} onChange={e => set('thumbnail_url', e.target.value)} className="input-field text-xs" placeholder="…or paste an image link" aria-label="Cover image link" />
        </section>

        <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <h2 className="font-semibold text-slate-900">Price</h2>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Price">
            <button type="button" role="radio" aria-checked={form.is_free} onClick={() => setForm(f => ({ ...f, is_free: true }))} className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium ${form.is_free ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-600'}`}>
              <Globe className="w-4 h-4" /> Free
            </button>
            <button type="button" role="radio" aria-checked={!form.is_free} onClick={() => setForm(f => ({ ...f, is_free: false }))} className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium ${!form.is_free ? 'border-sky-500 bg-sky-50 text-sky-700' : 'border-slate-200 text-slate-600'}`}>
              <DollarSign className="w-4 h-4" /> Paid
            </button>
          </div>
          {!form.is_free && (
            <div>
              <label htmlFor="cs-price" className="block text-xs font-semibold text-slate-600 mb-1.5">Price (AUD)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                <NumberInput id="cs-price" min={0} step="0.01" value={form.price || ''} onChange={n => set('price', n)} className="input-field pl-7" placeholder="0.00" />
              </div>
            </div>
          )}
        </section>

        <button type="submit" disabled={saving} className="w-full flex items-center justify-center gap-2 px-5 py-2.5 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-sm font-bold rounded-xl">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save details
        </button>
      </div>
    </form>
  );
}
