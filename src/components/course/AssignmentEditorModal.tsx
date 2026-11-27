import { useEffect, useMemo, useState } from 'react';
import { X, Sparkles, Loader2, Plus, Trash2, ChevronDown, ChevronUp, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { draftAssessment } from '../../lib/ai';
import { loadCoursePlan, audienceFromPlan } from '../../lib/coursePlan';
import type { CoursePlan } from '../../lib/coursePlan';
import { stripHtml } from '../../lib/slides';
import { sanitizeHtml } from '../../lib/utils';
import type { AssignmentKind, AssignmentResource, RubricCriterion, WsAssignment } from '../../lib/workspace';
import RichTextEditor from '../ui/RichTextEditor';
import NumberInput from '../ui/NumberInput';
import ConfirmDialog from '../ui/ConfirmDialog';

interface Props {
  courseId: string;
  kind: AssignmentKind;
  /** Week to attach a new item to; null for the whole course (capstone). */
  sectionId?: string | null;
  assignment?: WsAssignment;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}

const KIND_LABEL: Record<AssignmentKind, string> = { lab: 'Lab', assignment: 'Assignment', capstone: 'Capstone project' };
const LEVELS = ['Excellent', 'Good', 'Developing', 'Not yet'];

function blankCriterion(points: number): RubricCriterion {
  return {
    name: '',
    points,
    levels: LEVELS.map((label, i) => ({ label, points: Math.round(points * [1, 0.75, 0.5, 0.2][i]), descriptor: '' })),
  };
}

function toLocalInput(value: string | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface WeekInfo { id: string; title: string; lessons: Array<{ id: string; title: string; content: string | null }> }

export default function AssignmentEditorModal({ courseId, kind: initialKind, sectionId, assignment, onClose, onSaved }: Props) {
  const { profile } = useAuth();
  const [weeks, setWeeks] = useState<WeekInfo[]>([]);
  const [courseTitle, setCourseTitle] = useState('');
  const [plan, setPlan] = useState<CoursePlan | null>(null);
  const [loading, setLoading] = useState(true);

  const [kind, setKind] = useState<AssignmentKind>(assignment?.kind ?? initialKind);
  const [title, setTitle] = useState(assignment?.title ?? '');
  const [weekId, setWeekId] = useState<string>(assignment ? assignment.section_id ?? '' : sectionId ?? '');
  const [dueDate, setDueDate] = useState(toLocalInput(assignment?.due_date));
  const [totalPoints, setTotalPoints] = useState(assignment?.total_points ?? 100);
  const [minutes, setMinutes] = useState(assignment?.estimated_minutes ?? (initialKind === 'lab' ? 60 : initialKind === 'capstone' ? 1200 : 180));
  const [brief, setBrief] = useState(assignment?.brief_html || (assignment?.description ? `<p>${assignment.description}</p>` : ''));
  const [rubric, setRubric] = useState<RubricCriterion[]>(assignment?.rubric ?? []);
  const [resources, setResources] = useState<AssignmentResource[]>(assignment?.resources ?? []);
  const [solution, setSolution] = useState('');
  const [markingNotes, setMarkingNotes] = useState('');
  const [published, setPublished] = useState(assignment?.is_published ?? false);
  const [request, setRequest] = useState('');
  const [openCriterion, setOpenCriterion] = useState<number | null>(null);
  const [editorKey, setEditorKey] = useState(1);
  const [busy, setBusy] = useState<'' | 'draft' | 'save' | 'delete'>('');
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const [courseRes, sectionsRes, savedPlan, privateRes] = await Promise.all([
        supabase.from('courses').select('title').eq('id', courseId).maybeSingle(),
        supabase.from('sections').select('id, title, order_index, lessons(id, title, content)').eq('course_id', courseId).order('order_index'),
        loadCoursePlan(courseId),
        assignment ? supabase.from('assignment_private').select('solution_html, marking_notes').eq('assignment_id', assignment.id).maybeSingle() : Promise.resolve({ data: null }),
      ]);
      if (!active) return;
      setCourseTitle(courseRes.data?.title ?? '');
      setWeeks((sectionsRes.data ?? []) as WeekInfo[]);
      setPlan(savedPlan);
      if (privateRes.data) {
        setSolution(privateRes.data.solution_html ?? '');
        setMarkingNotes(privateRes.data.marking_notes ?? '');
        setEditorKey(k => k + 1);
      }
      setLoading(false);
    })();
    return () => { active = false; };
  }, [courseId, assignment]);

  const rubricTotal = useMemo(() => rubric.reduce((n, c) => n + (Number(c.points) || 0), 0), [rubric]);

  const draft = async () => {
    setBusy('draft');
    setError('');
    try {
      const covered = kind === 'capstone' || !weekId ? weeks : weeks.filter(w => w.id === weekId);
      const lessonIds = covered.flatMap(w => w.lessons.map(l => l.id));
      let notesText = '';
      if (kind !== 'capstone' && lessonIds.length) {
        const { data } = await supabase.from('lesson_documents').select('lesson_id, content_html').eq('type', 'notes').in('lesson_id', lessonIds);
        const byLesson = new Map((data ?? []).map(d => [d.lesson_id, d.content_html]));
        notesText = covered.flatMap(w => w.lessons.map(l => `## ${l.title}\n${stripHtml(byLesson.get(l.id) || l.content || '').slice(0, 3000)}`)).join('\n\n');
      }
      const r = await draftAssessment({
        kind,
        course_title: courseTitle,
        total_points: totalPoints,
        weeks: covered.map(w => `${w.title}${w.lessons.length ? ` (lessons: ${w.lessons.map(l => l.title).join('; ')})` : ''}`),
        notes_text: notesText || undefined,
        request: request.trim() || undefined,
        brief: audienceFromPlan(plan).brief,
      });
      setTitle(r.title);
      setBrief(sanitizeHtml(r.brief_html + (r.deliverables?.length ? `<h3>Deliverables</h3><ul>${r.deliverables.map(d => `<li>${d.replace(/</g, '&lt;')}</li>`).join('')}</ul>` : '')));
      setRubric((r.rubric ?? []).map(c => ({ name: c.name, points: Number(c.points) || 0, levels: (c.levels ?? []).map(l => ({ label: l.label, points: Number(l.points) || 0, descriptor: l.descriptor })) })));
      setResources((r.resources ?? []).map(x => ({ title: x.title, note: x.note })));
      setSolution(sanitizeHtml(r.solution_html || ''));
      setMarkingNotes(r.marking_notes || '');
      if (r.estimated_minutes) setMinutes(Math.round(r.estimated_minutes));
      setEditorKey(k => k + 1);
      setOpenCriterion(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The AI could not draft this.');
    } finally {
      setBusy('');
    }
  };

  const save = async () => {
    if (!title.trim()) { setError('Give it a title.'); return; }
    if (rubric.length && rubricTotal !== totalPoints) { setError(`The rubric adds up to ${rubricTotal} points, but the total is ${totalPoints}. Adjust one of them.`); return; }
    setBusy('save');
    setError('');
    try {
      const row = {
        course_id: courseId,
        teacher_id: assignment ? undefined : profile?.id,
        section_id: kind === 'capstone' ? null : (weekId || null),
        kind,
        title: title.trim(),
        description: stripHtml(brief).slice(0, 400),
        brief_html: sanitizeHtml(brief),
        rubric: rubric.map(c => ({ ...c, name: c.name.trim() || 'Criterion' })),
        resources: resources.filter(r => r.title.trim()),
        estimated_minutes: minutes,
        due_date: dueDate ? new Date(dueDate).toISOString() : null,
        total_points: totalPoints,
        is_published: published,
      };
      let id = assignment?.id;
      if (id) {
        const { error: upErr } = await supabase.from('assignments').update(row).eq('id', id);
        if (upErr) throw new Error('Could not save. Check you have permission to edit this course.');
      } else {
        const { data, error: insErr } = await supabase.from('assignments').insert(row).select('id').single();
        if (insErr || !data) throw new Error('Could not save. Check you have permission to edit this course.');
        id = data.id;
      }
      const { error: privErr } = await supabase.from('assignment_private').upsert({
        assignment_id: id, course_id: courseId, solution_html: sanitizeHtml(solution), marking_notes: markingNotes, updated_at: new Date().toISOString(),
      });
      if (privErr) throw new Error('Saved, but the model answer could not be stored.');
      toast.success(`${KIND_LABEL[kind]} saved`);
      await onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setBusy('');
    }
  };

  const remove = async () => {
    if (!assignment) return;
    setBusy('delete');
    const { error: delErr } = await supabase.from('assignments').delete().eq('id', assignment.id);
    setBusy('');
    if (delErr) { setError('Could not delete it.'); return; }
    toast.success('Deleted');
    await onSaved();
    onClose();
  };

  const updateCriterion = (i: number, patch: Partial<RubricCriterion>) =>
    setRubric(prev => prev.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={busy ? undefined : onClose} />
      <div role="dialog" aria-modal="true" aria-labelledby="assignment-editor-title" className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[94vh] flex flex-col">
        <div className="flex items-center gap-3 px-5 sm:px-6 py-4 border-b border-slate-100">
          <div className="flex-1 min-w-0">
            <h3 id="assignment-editor-title" className="font-bold text-slate-900">{assignment ? `Edit ${KIND_LABEL[kind].toLowerCase()}` : `New ${KIND_LABEL[kind].toLowerCase()}`}</h3>
            <p className="text-xs text-slate-500 truncate">{courseTitle}</p>
          </div>
          <button onClick={onClose} disabled={!!busy} aria-label="Close" className="p-2 rounded-lg text-slate-400 hover:bg-slate-100"><X className="w-4 h-4" /></button>
        </div>

        {loading ? (
          <p className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</p>
        ) : (
          <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5 space-y-5">
            {error && <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">{error}</p>}

            {/* AI draft */}
            <div className="bg-sky-50 border border-sky-200 rounded-xl p-4 space-y-2.5">
              <p className="text-sm font-semibold text-sky-900">Draft it with AI</p>
              <p className="text-xs text-sky-800">
                {kind === 'capstone' ? 'A final project across the whole course, based on the target job in your plan, with a rubric and an outline of an excellent submission.'
                  : kind === 'lab' ? 'Step-by-step practical based on this week\'s notes, with starter material and a full worked solution.'
                    : 'A realistic task applying this week\'s lessons, with a rubric and an outline of a strong answer.'}
              </p>
              <label htmlFor="assess-request" className="sr-only">Anything specific? (optional)</label>
              <input id="assess-request" value={request} onChange={e => setRequest(e.target.value)} placeholder="Anything specific? e.g. use a public housing-prices dataset (optional)" className="input-field text-sm bg-white" />
              <button onClick={draft} disabled={!!busy} className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg bg-sky-600 text-white disabled:opacity-60">
                {busy === 'draft' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} {title ? 'Draft again' : 'Draft with AI'}
              </button>
              {busy === 'draft' && <span className="text-xs text-sky-800 ml-2">About a minute…</span>}
            </div>

            {/* Basics */}
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label htmlFor="assess-title" className="block text-xs font-semibold text-slate-600 mb-1.5">Title</label>
                <input id="assess-title" value={title} onChange={e => setTitle(e.target.value)} className="input-field text-sm" />
              </div>
              {!assignment && (
                <div>
                  <label htmlFor="assess-kind" className="block text-xs font-semibold text-slate-600 mb-1.5">Type</label>
                  <select id="assess-kind" value={kind} onChange={e => setKind(e.target.value as AssignmentKind)} className="input-field text-sm">
                    <option value="lab">Lab (practical)</option>
                    <option value="assignment">Assignment</option>
                    <option value="capstone">Capstone project</option>
                  </select>
                </div>
              )}
              {kind !== 'capstone' && (
                <div>
                  <label htmlFor="assess-week" className="block text-xs font-semibold text-slate-600 mb-1.5">Week</label>
                  <select id="assess-week" value={weekId} onChange={e => setWeekId(e.target.value)} className="input-field text-sm">
                    <option value="">Not linked to a week</option>
                    {weeks.map(w => <option key={w.id} value={w.id}>{w.title}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label htmlFor="assess-due" className="block text-xs font-semibold text-slate-600 mb-1.5">Due</label>
                <input id="assess-due" type="datetime-local" value={dueDate} onChange={e => setDueDate(e.target.value)} className="input-field text-sm" />
              </div>
              <div className="flex gap-3">
                <div>
                  <label htmlFor="assess-points" className="block text-xs font-semibold text-slate-600 mb-1.5">Total points</label>
                  <NumberInput id="assess-points" min={1} max={1000} value={totalPoints} onChange={setTotalPoints} className="input-field text-sm w-24" />
                </div>
                <div>
                  <label htmlFor="assess-mins" className="block text-xs font-semibold text-slate-600 mb-1.5">Expected time (min)</label>
                  <NumberInput id="assess-mins" min={5} max={6000} value={minutes} onChange={setMinutes} className="input-field text-sm w-28" />
                </div>
              </div>
            </div>

            {/* Brief */}
            <div>
              <p className="text-xs font-semibold text-slate-600 mb-1.5">Brief (what students see)</p>
              <RichTextEditor key={`brief-${editorKey}`} value={brief} onChange={setBrief} label="Brief" minHeight={200} />
            </div>

            {/* Rubric */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs font-semibold text-slate-600">Marking rubric (students see it too)</p>
                <span className={`text-xs font-semibold ${rubric.length && rubricTotal !== totalPoints ? 'text-red-600' : 'text-slate-500'}`}>{rubricTotal} / {totalPoints} points</span>
              </div>
              <div className="space-y-2">
                {rubric.map((c, i) => (
                  <div key={i} className="border border-slate-200 rounded-xl">
                    <div className="flex items-center gap-2 px-3 py-2">
                      <label htmlFor={`crit-${i}`} className="sr-only">Criterion name</label>
                      <input id={`crit-${i}`} value={c.name} onChange={e => updateCriterion(i, { name: e.target.value })} placeholder="Criterion, e.g. Model evaluation" className="input-field text-sm py-1.5 flex-1" />
                      <label htmlFor={`crit-pts-${i}`} className="sr-only">Points</label>
                      <NumberInput id={`crit-pts-${i}`} min={0} max={1000} value={c.points} onChange={n => updateCriterion(i, { points: n })} className="input-field text-sm py-1.5 w-20" />
                      <button onClick={() => setOpenCriterion(openCriterion === i ? null : i)} aria-expanded={openCriterion === i} aria-label="Edit levels" className="p-1.5 text-slate-400">{openCriterion === i ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}</button>
                      <button onClick={() => setRubric(prev => prev.filter((_, j) => j !== i))} aria-label="Remove criterion" className="p-1.5 text-slate-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                    </div>
                    {openCriterion === i && (
                      <div className="px-3 pb-3 space-y-2">
                        {c.levels.map((lv, li) => (
                          <div key={li} className="flex gap-2 items-start">
                            <span className="text-xs font-semibold text-slate-600 w-20 pt-2 shrink-0">{lv.label}</span>
                            <label htmlFor={`lv-${i}-${li}`} className="sr-only">{lv.label} descriptor</label>
                            <textarea id={`lv-${i}-${li}`} value={lv.descriptor} rows={2} onChange={e => updateCriterion(i, { levels: c.levels.map((x, k) => k === li ? { ...x, descriptor: e.target.value } : x) })} className="input-field text-xs flex-1 resize-y" />
                            <label htmlFor={`lv-pts-${i}-${li}`} className="sr-only">{lv.label} points</label>
                            <NumberInput id={`lv-pts-${i}-${li}`} min={0} max={1000} value={lv.points} onChange={n => updateCriterion(i, { levels: c.levels.map((x, k) => k === li ? { ...x, points: n } : x) })} className="input-field text-xs w-16" />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <button onClick={() => { setRubric(prev => [...prev, blankCriterion(Math.max(0, totalPoints - rubricTotal) || 20)]); setOpenCriterion(rubric.length); }} className="mt-2 flex items-center gap-1 text-xs font-semibold text-sky-700 hover:underline">
                <Plus className="w-3.5 h-3.5" /> Add criterion
              </button>
            </div>

            {/* Resources */}
            <div>
              <p className="text-xs font-semibold text-slate-600 mb-1.5">Resources (datasets, tools, references)</p>
              <div className="space-y-2">
                {resources.map((r, i) => (
                  <div key={i} className="flex gap-2">
                    <label htmlFor={`res-${i}`} className="sr-only">Resource</label>
                    <input id={`res-${i}`} value={r.title} onChange={e => setResources(prev => prev.map((x, j) => j === i ? { ...x, title: e.target.value } : x))} placeholder="Name" className="input-field text-sm py-1.5 flex-1" />
                    <label htmlFor={`res-url-${i}`} className="sr-only">Link or note</label>
                    <input id={`res-url-${i}`} value={r.url ?? r.note ?? ''} onChange={e => setResources(prev => prev.map((x, j) => j === i ? (/^https?:\/\//.test(e.target.value) ? { title: x.title, url: e.target.value } : { title: x.title, note: e.target.value }) : x))} placeholder="Link or note" className="input-field text-sm py-1.5 flex-1" />
                    <button onClick={() => setResources(prev => prev.filter((_, j) => j !== i))} aria-label="Remove resource" className="p-1.5 text-slate-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                  </div>
                ))}
              </div>
              <button onClick={() => setResources(prev => [...prev, { title: '' }])} className="mt-2 flex items-center gap-1 text-xs font-semibold text-sky-700 hover:underline"><Plus className="w-3.5 h-3.5" /> Add resource</button>
            </div>

            {/* Teacher-only */}
            <div className="border border-slate-200 rounded-xl p-4 space-y-3 bg-slate-50/60">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-700"><Lock className="w-3.5 h-3.5" /> Teachers only</p>
              <div>
                <p className="text-xs font-semibold text-slate-600 mb-1.5">Model answer / worked solution</p>
                <RichTextEditor key={`sol-${editorKey}`} value={solution} onChange={setSolution} label="Model answer" minHeight={140} />
              </div>
              <div>
                <label htmlFor="assess-marking" className="block text-xs font-semibold text-slate-600 mb-1.5">Marking notes</label>
                <textarea id="assess-marking" value={markingNotes} onChange={e => setMarkingNotes(e.target.value)} rows={3} className="input-field text-sm resize-y bg-white" />
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 px-5 sm:px-6 py-4 border-t border-slate-100 flex-wrap">
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={published} onChange={e => setPublished(e.target.checked)} className="accent-sky-600" /> Visible to students</label>
            {assignment && <button onClick={() => setConfirmDelete(true)} disabled={!!busy} className="text-xs font-semibold text-red-600 hover:underline">Delete</button>}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} disabled={!!busy} className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-700">Cancel</button>
            <button onClick={save} disabled={!!busy || loading} className="flex items-center gap-2 px-5 py-2 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-sm font-bold rounded-lg">
              {busy === 'save' && <Loader2 className="w-4 h-4 animate-spin" />} Save
            </button>
          </div>
        </div>
      </div>
      <ConfirmDialog isOpen={confirmDelete} title={`Delete this ${KIND_LABEL[kind].toLowerCase()}?`} message="Its brief, rubric, model answer and any student submissions will be deleted. This cannot be undone."
        confirmText="Delete" variant="danger" onConfirm={() => { setConfirmDelete(false); remove(); }} onCancel={() => setConfirmDelete(false)} />
    </div>
  );
}
