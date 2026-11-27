import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import {
  X, Pencil, Sparkles, Download, Loader2, Save, Plus, Trash2, ChevronUp, ChevronDown, Wand2, Video, FileText,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase';
import { sanitizeHtml } from '../../lib/utils';
import { improveNotes, generateTeacherGuide } from '../../lib/ai';
import { audienceFromPlan } from '../../lib/coursePlan';
import { generateLessonMaterials } from '../../lib/courseContent';
import type { ContentSection } from '../../lib/courseContent';
import { parseSlidesFromHtml, slidesToHtml, stripHtml, downloadPptx } from '../../lib/slides';
import { weekLessons, isReadingLesson } from '../../lib/workspace';
import type { Workspace, WsLesson, WsSection } from '../../lib/workspace';
import RichTextEditor from '../ui/RichTextEditor';
import ConfirmDialog from '../ui/ConfirmDialog';
import NumberInput from '../ui/NumberInput';
import { UploadZone, VideoPlayer, PDFViewer, VideoHostingTips, LessonActivitiesPanel } from './media';

const FlashcardsManager = lazy(() => import('../ai/FlashcardsManager'));

type PanelTab = 'notes' | 'slides' | 'guide' | 'flashcards' | 'details';

interface Props {
  ws: Workspace;
  lessonId: string;
  onClose: () => void;
  onChanged: () => Promise<void>;
}

function findLesson(ws: Workspace, lessonId: string): { lesson: WsLesson; section: WsSection } | null {
  for (const section of ws.sections) {
    const lesson = section.lessons.find(l => l.id === lessonId);
    if (lesson) return { lesson, section };
  }
  return null;
}

async function saveDoc(lessonId: string, courseId: string, type: 'notes' | 'slides', title: string, html: string, order: number) {
  const { data: existing } = await supabase.from('lesson_documents').select('id').eq('lesson_id', lessonId).eq('type', type).limit(1).maybeSingle();
  const { error } = existing
    ? await supabase.from('lesson_documents').update({ content_html: html, title }).eq('id', existing.id)
    : await supabase.from('lesson_documents').insert({ lesson_id: lessonId, course_id: courseId, type, title, content_html: html, order_index: order });
  if (error) throw new Error('Could not save. Check you have permission to edit this course.');
}

// ─── Notes ──────────────────────────────────────────────────────────────────

function NotesTab({ ws, lesson, section, onChanged }: { ws: Workspace; lesson: WsLesson; section: WsSection; onChanged: () => Promise<void> }) {
  const [html, setHtml] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [editorKey, setEditorKey] = useState(0);
  const [busy, setBusy] = useState<'' | 'save' | 'improve' | 'generate' | 'slides'>('');
  const [instruction, setInstruction] = useState('');
  const [proposal, setProposal] = useState<string | null>(null);
  const [offerSlides, setOfferSlides] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from('lesson_documents').select('content_html').eq('lesson_id', lesson.id).eq('type', 'notes').limit(1).maybeSingle();
    setHtml(data?.content_html ?? (stripHtml(lesson.content ?? '').length > 0 ? lesson.content ?? '' : ''));
  }, [lesson.id, lesson.content]);
  useEffect(() => { load(); }, [load]);

  const persist = async (next: string) => {
    const clean = sanitizeHtml(next);
    await saveDoc(lesson.id, ws.course.id, 'notes', `${lesson.title} — Notes`, clean, 0);
    await supabase.from('lessons').update({ content: clean }).eq('id', lesson.id);
    setHtml(clean);
    await onChanged();
  };

  const save = async () => {
    setBusy('save');
    try {
      await persist(draft);
      setEditing(false);
      setOfferSlides(true);
      toast.success('Notes saved');
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not save.'); }
    finally { setBusy(''); }
  };

  const improve = async () => {
    if (!instruction.trim() || !html) return;
    setBusy('improve');
    try {
      const { brief } = audienceFromPlan(ws.plan);
      const r = await improveNotes({ course_title: ws.course.title, lesson_title: lesson.title, instruction: instruction.trim(), notes_html: html, brief });
      setProposal(sanitizeHtml(r.content_html));
    } catch (e) { toast.error(e instanceof Error ? e.message : 'The AI could not revise the notes.'); }
    finally { setBusy(''); }
  };

  const generate = async (needNotes: boolean) => {
    setBusy(needNotes ? 'generate' : 'slides');
    try {
      const sections: ContentSection[] = ws.sections.map(s => ({
        id: s.id, title: s.title, order_index: s.order_index,
        lessons: weekLessons(s, ws).map(l => ({ id: l.id, title: l.title, type: l.type, description: l.description, content: l.content, order_index: l.order_index })),
      }));
      const cs = sections.find(s => s.id === section.id)!;
      const cl = cs.lessons.find(l => l.id === lesson.id) ?? { id: lesson.id, title: lesson.title, order_index: lesson.order_index };
      await generateLessonMaterials({ section: cs, lesson: cl, needNotes, needSlides: true }, { courseId: ws.course.id, courseTitle: ws.course.title, plan: ws.plan, sections });
      await load();
      await onChanged();
      setOfferSlides(false);
      toast.success(needNotes ? 'Notes and slides written' : 'Slides rebuilt from the notes');
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Generation failed.'); }
    finally { setBusy(''); }
  };

  if (html === null) return <p className="flex items-center gap-2 text-sm text-slate-500 p-5"><Loader2 className="w-4 h-4 animate-spin" /> Loading notes…</p>;

  if (!html && !editing) {
    return (
      <div className="p-6 text-center space-y-3">
        <p className="text-sm text-slate-600">This lesson has no notes yet.</p>
        <div className="flex justify-center gap-2 flex-wrap">
          <button onClick={() => generate(true)} disabled={!!busy} className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg bg-sky-600 text-white disabled:opacity-60">
            {busy === 'generate' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Write notes &amp; slides with AI
          </button>
          <button onClick={() => { setDraft(''); setEditorKey(k => k + 1); setEditing(true); }} className="px-4 py-2 text-sm font-semibold border border-slate-300 rounded-lg">Write them myself</button>
        </div>
        {busy === 'generate' && <p className="text-xs text-slate-500">This takes about a minute.</p>}
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-5 space-y-3">
      {editing ? (
        <>
          <RichTextEditor key={editorKey} value={draft} onChange={setDraft} label="Lesson notes" minHeight={360} />
          <div className="flex gap-2">
            <button onClick={save} disabled={busy === 'save'} className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg bg-sky-600 text-white disabled:opacity-60">
              {busy === 'save' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save notes
            </button>
            <button onClick={() => setEditing(false)} className="px-3 py-2 text-sm text-slate-600">Cancel</button>
          </div>
        </>
      ) : proposal ? (
        <>
          <p className="text-xs font-semibold text-sky-700 bg-sky-50 border border-sky-200 rounded-lg px-3 py-2">AI's revised version. Read it, then keep it or discard it.</p>
          <div className="prose prose-sm max-w-none border border-sky-200 rounded-xl p-4 max-h-[55vh] overflow-y-auto" dangerouslySetInnerHTML={{ __html: proposal }} />
          <div className="flex gap-2">
            <button onClick={async () => { setBusy('save'); try { await persist(proposal); setProposal(null); setInstruction(''); setOfferSlides(true); toast.success('Revised notes saved'); } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not save.'); } finally { setBusy(''); } }}
              className="px-4 py-2 text-sm font-semibold rounded-lg bg-sky-600 text-white">Keep this version</button>
            <button onClick={() => setProposal(null)} className="px-3 py-2 text-sm text-slate-600">Discard</button>
          </div>
        </>
      ) : (
        <>
          {offerSlides && (
            <div className="flex items-center gap-2 text-xs bg-amber-50 border border-amber-200 text-amber-900 rounded-lg px-3 py-2">
              <span className="flex-1">The notes changed. Rebuild the slides so they match?</span>
              <button onClick={() => generate(false)} disabled={!!busy} className="font-semibold underline disabled:opacity-50">
                {busy === 'slides' ? 'Rebuilding…' : 'Rebuild slides'}
              </button>
              <button onClick={() => setOfferSlides(false)} aria-label="Dismiss" className="p-0.5"><X className="w-3.5 h-3.5" /></button>
            </div>
          )}
          <div className="prose prose-sm max-w-none border border-slate-200 rounded-xl p-4 max-h-[50vh] overflow-y-auto [&_pre]:bg-slate-900 [&_pre]:text-slate-100 [&_pre]:p-3 [&_pre]:rounded-lg" dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }} />
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => { setDraft(html); setEditorKey(k => k + 1); setEditing(true); }} className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border border-slate-300 rounded-lg"><Pencil className="w-3.5 h-3.5" /> Edit</button>
            <button onClick={() => generate(true)} disabled={!!busy} className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border border-slate-300 rounded-lg disabled:opacity-50">
              {busy === 'generate' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} Rewrite from scratch
            </button>
          </div>
          <div className="border-t border-slate-100 pt-3">
            <label htmlFor="improve-notes" className="block text-xs font-semibold text-slate-600 mb-1.5">Improve with AI</label>
            <div className="flex gap-2">
              <input id="improve-notes" value={instruction} onChange={e => setInstruction(e.target.value)} placeholder='e.g. "add a second worked example" or "simpler for beginners"' className="input-field text-sm flex-1" />
              <button onClick={improve} disabled={!instruction.trim() || !!busy} className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-sky-600 text-white disabled:opacity-50 shrink-0">
                {busy === 'improve' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />} Improve
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Slides ─────────────────────────────────────────────────────────────────

interface EditableSlide { heading: string; body: string; notes: string; key: number }

function SlidesTab({ ws, lesson, section, onChanged }: { ws: Workspace; lesson: WsLesson; section: WsSection; onChanged: () => Promise<void> }) {
  const [slides, setSlides] = useState<EditableSlide[] | null>(null);
  const [title, setTitle] = useState('');
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<'' | 'save' | 'rebuild' | 'ppt'>('');
  const [open, setOpen] = useState<number | null>(0);
  const [keySeed, setKeySeed] = useState(1);

  const load = useCallback(async () => {
    const { data } = await supabase.from('lesson_documents').select('title, content_html').eq('lesson_id', lesson.id).eq('type', 'slides').limit(1).maybeSingle();
    if (!data) { setSlides([]); setTitle(`${lesson.title} — Slides`); return; }
    setTitle(data.title);
    setSlides(parseSlidesFromHtml(data.content_html).map((s, i) => ({ heading: s.heading, body: s.bodyHtml, notes: s.speakerNotes, key: i + 1 })));
    setKeySeed(k => k + 100);
    setDirty(false);
  }, [lesson.id, lesson.title]);
  useEffect(() => { load(); }, [load]);

  const update = (i: number, patch: Partial<EditableSlide>) => {
    setSlides(prev => prev!.map((s, j) => (j === i ? { ...s, ...patch } : s)));
    setDirty(true);
  };
  const move = (i: number, dir: -1 | 1) => {
    setSlides(prev => {
      const next = [...prev!];
      const j = i + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
    setOpen(i + dir);
    setDirty(true);
  };

  const save = async () => {
    if (!slides) return;
    setBusy('save');
    try {
      const html = slidesToHtml(slides.map((s, i) => ({ slide_number: i + 1, heading: s.heading, content_html: s.body, speaker_notes: s.notes })));
      await saveDoc(lesson.id, ws.course.id, 'slides', title, html, 1);
      setDirty(false);
      await onChanged();
      toast.success('Slides saved');
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not save.'); }
    finally { setBusy(''); }
  };

  const rebuild = async () => {
    setBusy('rebuild');
    try {
      const sections: ContentSection[] = ws.sections.map(s => ({
        id: s.id, title: s.title, order_index: s.order_index,
        lessons: weekLessons(s, ws).map(l => ({ id: l.id, title: l.title, type: l.type, description: l.description, content: l.content, order_index: l.order_index })),
      }));
      const cs = sections.find(s => s.id === section.id)!;
      const cl = cs.lessons.find(l => l.id === lesson.id) ?? { id: lesson.id, title: lesson.title, order_index: lesson.order_index };
      await generateLessonMaterials({ section: cs, lesson: cl, needNotes: !ws.materials.get(lesson.id)?.notes && stripHtml(lesson.content ?? '').length < 400, needSlides: true },
        { courseId: ws.course.id, courseTitle: ws.course.title, plan: ws.plan, sections });
      await load();
      await onChanged();
      toast.success('Slides rebuilt from the notes');
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not rebuild the slides.'); }
    finally { setBusy(''); }
  };

  const ppt = async () => {
    if (!slides?.length) return;
    setBusy('ppt');
    try {
      await downloadPptx(title || lesson.title, [{
        title: title || lesson.title,
        slides: slides.map((s, i) => ({ heading: s.heading, bodyHtml: s.body, speakerNotes: s.notes, slideType: i === 0 ? 'title' : /summary|next/i.test(s.heading) ? 'summary' : 'content' })),
      }]);
    } finally { setBusy(''); }
  };

  if (slides === null) return <p className="flex items-center gap-2 text-sm text-slate-500 p-5"><Loader2 className="w-4 h-4 animate-spin" /> Loading slides…</p>;

  return (
    <div className="p-4 sm:p-5 space-y-3">
      <div className="flex gap-2 flex-wrap items-center">
        <button onClick={rebuild} disabled={!!busy} className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border border-slate-300 rounded-lg disabled:opacity-50">
          {busy === 'rebuild' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} {slides.length ? 'Rebuild from notes' : 'Build slides from the notes'}
        </button>
        <button onClick={ppt} disabled={!slides.length || !!busy} className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border border-slate-300 rounded-lg disabled:opacity-50">
          {busy === 'ppt' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />} Download PPT
        </button>
        {busy === 'rebuild' && <span className="text-xs text-slate-500">About a minute…</span>}
        {dirty && (
          <button onClick={save} disabled={busy === 'save'} className="ml-auto flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-sky-600 text-white disabled:opacity-60">
            {busy === 'save' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save slides
          </button>
        )}
      </div>

      {slides.length === 0 && <p className="text-sm text-slate-500 text-center py-6">No slides yet.</p>}

      <ol className="space-y-2">
        {slides.map((s, i) => (
          <li key={s.key + keySeed} className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 bg-slate-50">
              <span className="text-xs font-semibold text-slate-400 w-5 text-right">{i + 1}</span>
              <button onClick={() => setOpen(open === i ? null : i)} className="flex-1 text-left text-sm font-medium text-slate-800 truncate" aria-expanded={open === i}>{s.heading || 'Untitled slide'}</button>
              <button onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move slide up" className="p-1 text-slate-400 disabled:opacity-30"><ChevronUp className="w-3.5 h-3.5" /></button>
              <button onClick={() => move(i, 1)} disabled={i === slides.length - 1} aria-label="Move slide down" className="p-1 text-slate-400 disabled:opacity-30"><ChevronDown className="w-3.5 h-3.5" /></button>
              <button onClick={() => { setSlides(prev => prev!.filter((_, j) => j !== i)); setDirty(true); }} aria-label="Delete slide" className="p-1 text-slate-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
            {open === i && (
              <div className="p-3 space-y-2.5">
                <div>
                  <label htmlFor={`slide-h-${s.key}`} className="block text-xs font-semibold text-slate-500 mb-1">Heading</label>
                  <input id={`slide-h-${s.key}`} value={s.heading} onChange={e => update(i, { heading: e.target.value })} className="input-field text-sm" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500 mb-1">On the slide</p>
                  <RichTextEditor key={`body-${s.key}-${keySeed}`} value={s.body} onChange={v => update(i, { body: v })} label={`Slide ${i + 1} content`} minHeight={110} compact />
                </div>
                <div>
                  <label htmlFor={`slide-n-${s.key}`} className="block text-xs font-semibold text-slate-500 mb-1">Speaker notes (what the presenter says)</label>
                  <textarea id={`slide-n-${s.key}`} value={s.notes} onChange={e => update(i, { notes: e.target.value })} rows={4} className="input-field text-sm resize-y" />
                </div>
              </div>
            )}
          </li>
        ))}
      </ol>
      <button
        onClick={() => { const key = Date.now(); setSlides(prev => [...(prev ?? []), { heading: 'New slide', body: '<ul><li></li></ul>', notes: '', key }]); setOpen(slides.length); setDirty(true); }}
        className="flex items-center gap-1.5 text-xs font-semibold text-sky-700 hover:underline"
      >
        <Plus className="w-3.5 h-3.5" /> Add slide
      </button>
    </div>
  );
}

// ─── Teacher guide ──────────────────────────────────────────────────────────

function GuideTab({ ws, lesson, section, onChanged }: { ws: Workspace; lesson: WsLesson; section: WsSection; onChanged: () => Promise<void> }) {
  const [html, setHtml] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [editorKey, setEditorKey] = useState(0);
  const [busy, setBusy] = useState<'' | 'save' | 'generate'>('');

  const load = useCallback(async () => {
    const { data } = await supabase.from('lesson_teacher_guides').select('content_html').eq('lesson_id', lesson.id).maybeSingle();
    setHtml(data?.content_html ?? '');
  }, [lesson.id]);
  useEffect(() => { load(); }, [load]);

  const persist = async (next: string) => {
    const clean = sanitizeHtml(next);
    const { error } = await supabase.from('lesson_teacher_guides').upsert({ lesson_id: lesson.id, course_id: ws.course.id, content_html: clean, updated_at: new Date().toISOString() });
    if (error) throw new Error('Could not save the guide.');
    setHtml(clean);
    await onChanged();
  };

  const generate = async () => {
    setBusy('generate');
    try {
      const { data: notes } = await supabase.from('lesson_documents').select('content_html').eq('lesson_id', lesson.id).eq('type', 'notes').limit(1).maybeSingle();
      const notesText = stripHtml(notes?.content_html || lesson.content || '');
      if (notesText.length < 200) throw new Error('Write the lesson notes first; the guide is planned from them.');
      const { brief } = audienceFromPlan(ws.plan);
      const r = await generateTeacherGuide({
        course_title: ws.course.title, section_title: section.title, lesson_title: lesson.title,
        session_minutes: Math.max(30, lesson.duration_minutes || 60), notes_text: notesText, brief,
      });
      await persist(r.content_html);
      toast.success('Teacher guide written');
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not write the guide.'); }
    finally { setBusy(''); }
  };

  if (html === null) return <p className="flex items-center gap-2 text-sm text-slate-500 p-5"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</p>;

  return (
    <div className="p-4 sm:p-5 space-y-3">
      <p className="text-xs text-slate-500">A session plan for teaching this lesson live: timings, activities, questions to ask, common misconceptions. Only teachers can see it.</p>
      {editing ? (
        <>
          <RichTextEditor key={editorKey} value={draft} onChange={setDraft} label="Teacher guide" minHeight={320} />
          <div className="flex gap-2">
            <button onClick={async () => { setBusy('save'); try { await persist(draft); setEditing(false); toast.success('Guide saved'); } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not save.'); } finally { setBusy(''); } }}
              disabled={busy === 'save'} className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg bg-sky-600 text-white disabled:opacity-60">
              <Save className="w-4 h-4" /> Save guide
            </button>
            <button onClick={() => setEditing(false)} className="px-3 py-2 text-sm text-slate-600">Cancel</button>
          </div>
        </>
      ) : html ? (
        <>
          <div className="prose prose-sm max-w-none border border-slate-200 rounded-xl p-4 max-h-[55vh] overflow-y-auto [&_table]:text-xs [&_td]:align-top [&_td]:border [&_td]:border-slate-200 [&_td]:p-1.5 [&_th]:border [&_th]:border-slate-200 [&_th]:p-1.5 [&_th]:bg-slate-50" dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }} />
          <div className="flex gap-2">
            <button onClick={() => { setDraft(html); setEditorKey(k => k + 1); setEditing(true); }} className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border border-slate-300 rounded-lg"><Pencil className="w-3.5 h-3.5" /> Edit</button>
            <button onClick={generate} disabled={!!busy} className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border border-slate-300 rounded-lg disabled:opacity-50">
              {busy === 'generate' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} Rewrite with AI
            </button>
          </div>
        </>
      ) : (
        <div className="text-center py-6 space-y-3">
          <button onClick={generate} disabled={!!busy} className="flex items-center gap-1.5 mx-auto px-4 py-2 text-sm font-semibold rounded-lg bg-sky-600 text-white disabled:opacity-60">
            {busy === 'generate' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Write a teacher guide with AI
          </button>
          <button onClick={() => { setDraft(''); setEditorKey(k => k + 1); setEditing(true); }} className="text-xs font-semibold text-sky-700 hover:underline">or write it yourself</button>
        </div>
      )}
    </div>
  );
}

// ─── Flashcards ─────────────────────────────────────────────────────────────

function FlashcardsTab({ ws, lesson }: { ws: Workspace; lesson: WsLesson }) {
  const [cards, setCards] = useState<Array<{ id: string; front: string; back: string; order_index: number }> | null>(null);
  const [notes, setNotes] = useState('');
  const load = useCallback(async () => {
    const [{ data }, { data: n }] = await Promise.all([
      supabase.from('flashcards').select('id, front, back, order_index').eq('lesson_id', lesson.id).order('order_index'),
      supabase.from('lesson_documents').select('content_html').eq('lesson_id', lesson.id).eq('type', 'notes').limit(1).maybeSingle(),
    ]);
    setCards(data ?? []);
    setNotes(stripHtml(n?.content_html || lesson.content || ''));
  }, [lesson.id, lesson.content]);
  useEffect(() => { load(); }, [load]);
  if (cards === null) return <p className="flex items-center gap-2 text-sm text-slate-500 p-5"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</p>;
  return (
    <div className="p-4 sm:p-5">
      <Suspense fallback={null}>
        <FlashcardsManager key={cards.length} lessonId={lesson.id} courseId={ws.course.id} lessonContent={notes} initialCards={cards} onUpdate={load} />
      </Suspense>
    </div>
  );
}

// ─── Details ────────────────────────────────────────────────────────────────

const TYPES = [
  { value: 'text', label: 'Reading' },
  { value: 'video', label: 'Video' },
  { value: 'pdf', label: 'PDF / document' },
  { value: 'link', label: 'Link' },
];

function DetailsTab({ ws, lesson, onChanged, onDeleted }: { ws: Workspace; lesson: WsLesson; onChanged: () => Promise<void>; onDeleted: () => void }) {
  const [form, setForm] = useState({
    title: lesson.title,
    type: ['article', 'file'].includes(lesson.type) ? 'text' : lesson.type,
    url: lesson.url || lesson.video_url || '',
    description: lesson.description || '',
    duration_minutes: lesson.duration_minutes || 30,
    is_preview: !!lesson.is_preview,
    is_required: lesson.is_required !== false,
  });
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const set = (patch: Partial<typeof form>) => setForm(f => ({ ...f, ...patch }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    const { error } = await supabase.from('lessons').update({
      title: form.title.trim(), type: form.type, lesson_type: form.type,
      url: form.type === 'text' ? '' : form.url.trim(), video_url: form.type === 'video' ? form.url.trim() : '',
      description: form.description.trim(), duration_minutes: form.duration_minutes,
      is_preview: form.is_preview, is_required: form.is_required,
    }).eq('id', lesson.id);
    setSaving(false);
    if (error) { toast.error('Could not save the lesson.'); return; }
    toast.success('Lesson saved');
    await onChanged();
  };

  const remove = async () => {
    const { error } = await supabase.from('lessons').delete().eq('id', lesson.id);
    if (error) { toast.error('Could not delete the lesson.'); return; }
    toast.success('Lesson deleted');
    onDeleted();
    await onChanged();
  };

  return (
    <form onSubmit={save} className="p-4 sm:p-5 space-y-4">
      <div>
        <label htmlFor="lesson-title" className="block text-xs font-semibold text-slate-600 mb-1.5">Title</label>
        <input id="lesson-title" value={form.title} onChange={e => set({ title: e.target.value })} className="input-field text-sm" required />
      </div>
      <div>
        <label htmlFor="lesson-desc" className="block text-xs font-semibold text-slate-600 mb-1.5">What this lesson covers <span className="font-normal text-slate-400">(the AI uses this when writing notes)</span></label>
        <textarea id="lesson-desc" value={form.description} onChange={e => set({ description: e.target.value })} rows={2} className="input-field text-sm resize-y" />
      </div>
      <fieldset>
        <legend className="block text-xs font-semibold text-slate-600 mb-1.5">Type</legend>
        <div className="flex gap-1.5 flex-wrap">
          {TYPES.map(t => (
            <label key={t.value} className={`text-xs font-semibold px-3 py-1.5 rounded-lg border cursor-pointer ${form.type === t.value ? 'bg-sky-600 text-white border-sky-600' : 'border-slate-300 text-slate-600'}`}>
              <input type="radio" name="lesson-type" value={t.value} checked={form.type === t.value} onChange={() => set({ type: t.value })} className="sr-only" />
              {t.label}
            </label>
          ))}
        </div>
      </fieldset>
      {form.type === 'video' && (
        <div className="space-y-2">
          <UploadZone accept="video/mp4,video/webm,video/quicktime,video/x-msvideo,video/mpeg,video/ogg" bucket="course-videos" path={ws.course.id}
            onUploaded={url => set({ url })} label="Upload a video" icon={Video} hint="MP4 recommended" />
          <label htmlFor="lesson-url" className="block text-xs font-semibold text-slate-600">or paste a YouTube / Vimeo / video link</label>
          <input id="lesson-url" type="url" value={form.url} onChange={e => set({ url: e.target.value })} className="input-field text-sm" placeholder="https://" />
          {form.url && <VideoPlayer url={form.url} />}
          <VideoHostingTips />
        </div>
      )}
      {form.type === 'pdf' && (
        <div className="space-y-2">
          <UploadZone accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx" bucket="course-documents" path={ws.course.id}
            onUploaded={url => set({ url })} label="Upload a document" icon={FileText} hint="PDF, Word, PowerPoint or Excel" />
          {form.url && <PDFViewer url={form.url} />}
        </div>
      )}
      {form.type === 'link' && (
        <div>
          <label htmlFor="lesson-link" className="block text-xs font-semibold text-slate-600 mb-1.5">Link</label>
          <input id="lesson-link" type="url" value={form.url} onChange={e => set({ url: e.target.value })} className="input-field text-sm" placeholder="https://" />
        </div>
      )}
      <div className="flex gap-4 flex-wrap items-end">
        <div>
          <label htmlFor="lesson-mins" className="block text-xs font-semibold text-slate-600 mb-1.5">Minutes</label>
          <NumberInput id="lesson-mins" min={1} max={600} step="1" value={form.duration_minutes} onChange={n => set({ duration_minutes: Math.round(n) })} className="input-field text-sm w-24" />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={form.is_required} onChange={e => set({ is_required: e.target.checked })} className="accent-sky-600" /> Required to complete the course</label>
        <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={form.is_preview} onChange={e => set({ is_preview: e.target.checked })} className="accent-sky-600" /> Free preview</label>
      </div>
      <LessonActivitiesPanel lessonId={lesson.id} />
      <div className="flex items-center justify-between pt-2 border-t border-slate-100">
        <button type="submit" disabled={saving} className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg bg-sky-600 text-white disabled:opacity-60">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save lesson
        </button>
        <button type="button" onClick={() => setConfirm(true)} className="flex items-center gap-1.5 text-xs font-semibold text-red-600 hover:underline"><Trash2 className="w-3.5 h-3.5" /> Delete lesson</button>
      </div>
      <ConfirmDialog isOpen={confirm} title="Delete this lesson?" message={`"${lesson.title}" and its notes, slides and flashcards will be deleted. This cannot be undone.`}
        confirmText="Delete lesson" variant="danger" onConfirm={() => { setConfirm(false); remove(); }} onCancel={() => setConfirm(false)} />
    </form>
  );
}

// ─── Panel ──────────────────────────────────────────────────────────────────

export default function LessonPanel({ ws, lessonId, onClose, onChanged }: Props) {
  const found = findLesson(ws, lessonId);
  const reading = found ? isReadingLesson(found.lesson) : true;
  const [tab, setTab] = useState<PanelTab>(reading ? 'notes' : 'details');

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  if (!found) return null;
  const { lesson, section } = found;
  const tabs: { id: PanelTab; label: string }[] = [
    { id: 'notes', label: 'Notes' },
    { id: 'slides', label: 'Slides' },
    { id: 'guide', label: 'Teacher guide' },
    { id: 'flashcards', label: 'Flashcards' },
    { id: 'details', label: 'Details' },
  ];

  return (
    <div className="bg-white lg:border lg:border-slate-200 lg:rounded-xl min-h-full lg:min-h-0" role="region" aria-label={`Lesson: ${lesson.title}`}>
      <div className="flex items-start gap-2 px-4 sm:px-5 pt-4 pb-2">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-slate-400 truncate">{section.title}</p>
          <h2 className="font-semibold text-slate-900 break-words">{lesson.title}</h2>
        </div>
        <button onClick={onClose} aria-label="Close lesson" className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"><X className="w-4 h-4" /></button>
      </div>
      <div className="flex gap-1 px-3 sm:px-4 border-b border-slate-100 overflow-x-auto" role="tablist">
        {tabs.map(t => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
            className={`px-2.5 py-2 text-xs font-semibold whitespace-nowrap border-b-2 -mb-px ${tab === t.id ? 'border-sky-600 text-sky-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
            {t.label}
          </button>
        ))}
      </div>
      <div key={lesson.id}>
        {tab === 'notes' && <NotesTab ws={ws} lesson={lesson} section={section} onChanged={onChanged} />}
        {tab === 'slides' && <SlidesTab ws={ws} lesson={lesson} section={section} onChanged={onChanged} />}
        {tab === 'guide' && <GuideTab ws={ws} lesson={lesson} section={section} onChanged={onChanged} />}
        {tab === 'flashcards' && <FlashcardsTab ws={ws} lesson={lesson} />}
        {tab === 'details' && <DetailsTab key={lesson.id + lesson.title} ws={ws} lesson={lesson} onChanged={onChanged} onDeleted={onClose} />}
      </div>
    </div>
  );
}
