import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  MoreHorizontal, Plus, Sparkles, Loader2, PlayCircle, FileText, Video, Link as LinkIcon, FlaskConical,
  HelpCircle, ClipboardList, Trophy, CalendarClock, Check,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase';
import {
  weekLessons, weekLecture, weekStatus, lessonState, isReadingLesson, formatDate,
} from '../../lib/workspace';
import type { Workspace, WsSection, WsLesson, AssignmentKind, WsAssignment } from '../../lib/workspace';
import { generateLessonMaterials, loadSlideDecks } from '../../lib/courseContent';
import type { ContentSection } from '../../lib/courseContent';
import { downloadPptx } from '../../lib/slides';
import ConfirmDialog from '../ui/ConfirmDialog';

export interface WeeksViewActions {
  onSelectLesson: (lessonId: string | null) => void;
  onReload: () => Promise<void>;
  onOpenStudio: (sectionIds?: string[]) => void;
  onOpenLecture: (section: { id: string; title: string }) => void;
  onOpenWeekQuiz: (section: { id: string; title: string }) => void;
  onOpenAssignment: (opts: { kind: AssignmentKind; sectionId?: string | null; assignment?: WsAssignment }) => void;
  onOpenQuizzes: () => void;
  /** Build everything that is missing, for every week, in one go. */
  onBuildAll: () => void;
}

interface Props extends WeeksViewActions {
  ws: Workspace;
  selectedLessonId: string | null;
  /** The right-hand column: the AI assistant, or the selected lesson. */
  side: ReactNode;
}

/** "Lab: Clean data", unless the title already says what it is. */
const prefixed = (kind: string, title: string) => (title.toLowerCase().startsWith(kind.toLowerCase()) ? title : `${kind}: ${title}`);

// ─── Small "⋯" menu ─────────────────────────────────────────────────────────

interface MenuItem { label: string; onClick: () => void; danger?: boolean; disabled?: boolean }

function ActionMenu({ items, label }: { items: MenuItem[]; label: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full mt-1 z-20 w-60 bg-white border border-slate-200 rounded-xl shadow-lg py-1">
          {items.map(it => (
            <button
              key={it.label}
              role="menuitem"
              disabled={it.disabled}
              onClick={() => { setOpen(false); it.onClick(); }}
              className={`w-full text-left px-3.5 py-2 text-sm disabled:opacity-40 ${it.danger ? 'text-red-600 hover:bg-red-50' : 'text-slate-700 hover:bg-slate-50'}`}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Rows ───────────────────────────────────────────────────────────────────

const DOT: Record<string, string> = {
  ready: 'bg-emerald-500',
  warn: 'bg-amber-400',
  none: 'bg-slate-300',
  busy: 'bg-sky-400 animate-pulse',
};

function Row({ dot, icon, title, meta, action, selected, onClick }: {
  dot: keyof typeof DOT; icon?: ReactNode; title: string; meta?: ReactNode; action?: ReactNode; selected?: boolean; onClick?: () => void;
}) {
  return (
    <div className={`flex items-center gap-3 px-4 sm:px-5 py-2.5 ${selected ? 'bg-sky-50' : onClick ? 'hover:bg-slate-50' : ''}`}>
      <span className={`w-2 h-2 rounded-full shrink-0 ${DOT[dot]}`} aria-hidden />
      <button
        type="button"
        onClick={onClick}
        disabled={!onClick}
        className={`flex-1 min-w-0 flex items-center gap-2 text-left text-sm ${selected ? 'font-medium text-sky-800' : 'text-slate-800'} disabled:cursor-default`}
      >
        {icon && <span className="text-slate-400 shrink-0">{icon}</span>}
        <span className="truncate">{title}</span>
      </button>
      {meta && <span className="text-xs text-slate-400 shrink-0 hidden sm:inline">{meta}</span>}
      {action}
    </div>
  );
}

function SmallAction({ children, onClick, busy }: { children: ReactNode; onClick: () => void; busy?: boolean }) {
  return (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); onClick(); }}
      disabled={busy}
      className="flex items-center gap-1 text-xs font-semibold text-sky-700 border border-sky-200 bg-white hover:bg-sky-50 rounded-md px-2 py-1 shrink-0 disabled:opacity-60"
    >
      {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />} {children}
    </button>
  );
}

function GroupLabel({ children }: { children: ReactNode }) {
  return <p className="px-4 sm:px-5 pt-3 pb-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wide">{children}</p>;
}

const TYPE_ICON: Record<string, ReactNode> = {
  video: <Video className="w-3.5 h-3.5" />,
  pdf: <FileText className="w-3.5 h-3.5" />,
  link: <LinkIcon className="w-3.5 h-3.5" />,
};

// ─── View ───────────────────────────────────────────────────────────────────

export default function WeeksView(props: Props) {
  const { ws, selectedLessonId, side } = props;
  const [addingWeek, setAddingWeek] = useState(false);
  const [newWeekTitle, setNewWeekTitle] = useState('');
  const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null);
  const [addingLessonTo, setAddingLessonTo] = useState<string | null>(null);
  const [newLesson, setNewLesson] = useState({ title: '', type: 'text' });
  const [generating, setGenerating] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState<WsSection | null>(null);
  const [busy, setBusy] = useState(false);

  const courseId = ws.course.id;
  const totalLessons = ws.sections.reduce((n, s) => n + weekLessons(s, ws).length, 0);
  const minutes = ws.sections.flatMap(s => s.lessons).reduce((n, l) => n + (l.duration_minutes ?? 0), 0);
  const capstones = ws.assignments.filter(a => a.kind === 'capstone');

  const run = async (fn: () => PromiseLike<{ error: unknown } | unknown>, ok?: string, failed = 'That did not work. Please try again.') => {
    setBusy(true);
    try {
      const res = await fn() as { error?: { message?: string } | null };
      if (res && res.error) throw new Error(res.error.message || failed);
      if (ok) toast.success(ok);
      await props.onReload();
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : failed);
    } finally {
      setBusy(false);
    }
  };

  const addWeek = (e: React.FormEvent) => {
    e.preventDefault();
    const title = newWeekTitle.trim() || `Week ${ws.sections.length + 1}`;
    run(() => supabase.from('sections').insert({ course_id: courseId, title, order_index: ws.sections.length }), 'Week added');
    setNewWeekTitle('');
    setAddingWeek(false);
  };

  const renameWeek = (e: React.FormEvent) => {
    e.preventDefault();
    if (!renaming?.title.trim()) return;
    run(() => supabase.from('sections').update({ title: renaming.title.trim() }).eq('id', renaming.id), 'Week renamed');
    setRenaming(null);
  };

  const moveWeek = (index: number, dir: -1 | 1) => {
    const other = ws.sections[index + dir];
    const self = ws.sections[index];
    if (!other) return;
    run(async () => {
      await supabase.from('sections').update({ order_index: other.order_index }).eq('id', self.id);
      return supabase.from('sections').update({ order_index: self.order_index }).eq('id', other.id);
    });
  };

  const deleteWeek = (section: WsSection) =>
    run(() => supabase.from('sections').delete().eq('id', section.id), 'Week deleted', 'Could not delete the week.');

  const addLesson = (e: React.FormEvent, section: WsSection) => {
    e.preventDefault();
    const title = newLesson.title.trim();
    if (!title) return;
    setBusy(true);
    supabase.from('lessons').insert({
      section_id: section.id, course_id: courseId, title, type: newLesson.type, lesson_type: newLesson.type,
      content: '', duration_minutes: 30, is_preview: false, is_required: true,
      // After the last lesson (the count can clash with existing positions after a delete)
      order_index: section.lessons.reduce((max, l) => Math.max(max, (l.order_index ?? 0) + 1), 0),
    }).select('id').single().then(async ({ data, error }) => {
      setBusy(false);
      if (error || !data) { toast.error('Could not add the lesson.'); return; }
      setAddingLessonTo(null);
      setNewLesson({ title: '', type: 'text' });
      await props.onReload();
      props.onSelectLesson(data.id);
    });
  };

  const moveLesson = (section: WsSection, lesson: WsLesson, dir: -1 | 1) => {
    const list = weekLessons(section, ws);
    const i = list.findIndex(l => l.id === lesson.id);
    const other = list[i + dir];
    if (!other) return;
    run(async () => {
      await supabase.from('lessons').update({ order_index: other.order_index }).eq('id', lesson.id);
      return supabase.from('lessons').update({ order_index: lesson.order_index }).eq('id', other.id);
    });
  };

  const asContentSections = (): ContentSection[] => ws.sections.map(s => ({
    id: s.id, title: s.title, order_index: s.order_index,
    lessons: weekLessons(s, ws).map(l => ({ id: l.id, title: l.title, type: l.type, description: l.description, content: l.content, order_index: l.order_index })),
  }));

  /** Writes notes and/or slides for one lesson, right in its row. */
  const generateForLesson = async (section: WsSection, lesson: WsLesson) => {
    const state = lessonState(lesson, ws);
    setGenerating(prev => new Set(prev).add(lesson.id));
    try {
      const sections = asContentSections();
      const contentSection = sections.find(s => s.id === section.id)!;
      const contentLesson = contentSection.lessons.find(l => l.id === lesson.id)!;
      await generateLessonMaterials(
        { section: contentSection, lesson: contentLesson, needNotes: state === 'no-notes', needSlides: true },
        { courseId, courseTitle: ws.course.title, plan: ws.plan, sections },
      );
      toast.success(`Notes and slides ready: ${lesson.title}`);
      await props.onReload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not generate the materials.');
    } finally {
      setGenerating(prev => { const n = new Set(prev); n.delete(lesson.id); return n; });
    }
  };

  const downloadWeek = async (section: WsSection) => {
    const lessons = weekLessons(section, ws).map(l => ({ id: l.id, title: l.title, order_index: l.order_index }));
    const decks = await loadSlideDecks(lessons);
    if (decks.length === 0) { toast.error('This week has no slides yet.'); return; }
    await downloadPptx(`${ws.course.title} - ${section.title}`, decks, { title: section.title, subtitle: ws.course.title });
  };

  const selected = !!selectedLessonId;

  return (
    <div className={`grid gap-5 items-start ${selected ? 'lg:grid-cols-[minmax(0,1fr)_minmax(0,520px)]' : 'lg:grid-cols-[minmax(0,1fr)_320px]'}`}>
      <div className="space-y-4 min-w-0">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm text-slate-500">
            {ws.sections.length} week{ws.sections.length === 1 ? '' : 's'} · {totalLessons} lesson{totalLessons === 1 ? '' : 's'}
            {minutes > 0 && ` · about ${Math.round(minutes / 60)} h of study`}
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            {!addingWeek && (
              <button onClick={() => setAddingWeek(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold border border-slate-300 rounded-lg bg-white hover:bg-slate-50">
                <Plus className="w-4 h-4" /> Add week
              </button>
            )}
            {ws.sections.length > 0 && (
              <button onClick={props.onBuildAll} className="flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-semibold rounded-lg bg-sky-600 hover:bg-sky-700 text-white">
                <Sparkles className="w-4 h-4" /> Build the whole course
              </button>
            )}
          </div>
        </div>

        {addingWeek && (
          <form onSubmit={addWeek} className="flex gap-2 bg-white border border-slate-200 rounded-xl p-3">
            <label htmlFor="new-week" className="sr-only">Week title</label>
            <input id="new-week" autoFocus value={newWeekTitle} onChange={e => setNewWeekTitle(e.target.value)} placeholder={`Week ${ws.sections.length + 1}: topic`} className="input-field text-sm flex-1" />
            <button type="submit" disabled={busy} className="btn-primary text-sm px-4">Add</button>
            <button type="button" onClick={() => setAddingWeek(false)} className="px-3 text-sm text-slate-500">Cancel</button>
          </form>
        )}

        {ws.sections.length === 0 && !addingWeek && (
          <div className="bg-white border border-dashed border-slate-300 rounded-xl p-10 text-center">
            <p className="font-semibold text-slate-800">No weeks yet</p>
            <p className="text-sm text-slate-500 mt-1">Plan them with the AI assistant on the right, or add a week yourself.</p>
          </div>
        )}

        {ws.sections.map((section, index) => {
          const lessons = weekLessons(section, ws);
          const status = weekStatus(section, ws);
          const lecture = weekLecture(section, ws);
          const quizzes = ws.quizzes.filter(q => q.section_id === section.id);
          const labs = ws.assignments.filter(a => a.kind === 'lab' && a.section_id === section.id);
          const tasks = ws.assignments.filter(a => a.kind === 'assignment' && a.section_id === section.id);
          const future = section.release_at && new Date(section.release_at) > new Date();
          const ready = !status.empty && status.issues.length === 0;
          const hasSlides = lessons.some(l => ws.materials.get(l.id)?.slides);

          return (
            <section key={section.id} aria-labelledby={`week-${section.id}`} className={`bg-white border rounded-xl ${ready ? 'border-slate-200' : 'border-amber-300'}`}>
              <div className="flex items-center gap-3 px-4 sm:px-5 py-3.5 border-b border-slate-100">
                <span className="w-6 h-6 rounded-full bg-sky-100 text-sky-700 text-xs font-bold flex items-center justify-center shrink-0">{index + 1}</span>
                {renaming?.id === section.id ? (
                  <form onSubmit={renameWeek} className="flex-1 flex gap-2">
                    <label htmlFor={`rename-${section.id}`} className="sr-only">Week title</label>
                    <input id={`rename-${section.id}`} autoFocus value={renaming.title} onChange={e => setRenaming({ ...renaming, title: e.target.value })} className="input-field text-sm py-1.5 flex-1" />
                    <button type="submit" className="btn-primary text-xs px-3">Save</button>
                    <button type="button" onClick={() => setRenaming(null)} className="text-xs text-slate-500 px-2">Cancel</button>
                  </form>
                ) : (
                  <h2 id={`week-${section.id}`} className="font-semibold text-slate-900 flex-1 min-w-0 break-words">{section.title}</h2>
                )}
                {future && (
                  <span className="hidden sm:flex items-center gap-1 text-xs text-slate-500 shrink-0"><CalendarClock className="w-3.5 h-3.5" /> Opens {formatDate(section.release_at)}</span>
                )}
                <span
                  title={status.issues.join(' · ')}
                  className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${ready ? 'text-emerald-700 bg-emerald-50' : 'text-amber-800 bg-amber-50'}`}
                >
                  {ready ? 'Ready' : status.empty ? 'Empty' : `${status.issues.length} thing${status.issues.length === 1 ? '' : 's'} to finish`}
                </span>
                <ActionMenu
                  label={`Actions for ${section.title}`}
                  items={[
                    { label: 'Rename week', onClick: () => setRenaming({ id: section.id, title: section.title }) },
                    { label: 'Notes & slides for this week…', onClick: () => props.onOpenStudio([section.id]), disabled: lessons.length === 0 },
                    { label: 'AI lecture for this week…', onClick: () => props.onOpenLecture({ id: section.id, title: section.title }), disabled: lessons.length === 0 },
                    { label: 'Download week as PowerPoint', onClick: () => { downloadWeek(section).catch(() => toast.error('Could not create the PowerPoint file.')); }, disabled: !hasSlides },
                    { label: 'Move up', onClick: () => moveWeek(index, -1), disabled: index === 0 },
                    { label: 'Move down', onClick: () => moveWeek(index, 1), disabled: index === ws.sections.length - 1 },
                    { label: 'Delete week…', onClick: () => setConfirmDelete(section), danger: true },
                  ]}
                />
              </div>

              <GroupLabel>Learn</GroupLabel>
              <div className="divide-y divide-slate-100">
                {lessons.map(lesson => {
                  const st = lessonState(lesson, ws);
                  const isBusy = generating.has(lesson.id);
                  const reading = isReadingLesson(lesson);
                  const mins = lesson.duration_minutes ? `${lesson.duration_minutes} min` : '';
                  const meta = st === 'ready'
                    ? [mins, reading ? 'notes & slides' : lesson.type].filter(Boolean).join(' · ')
                    : null;
                  return (
                    <div key={lesson.id} className="group relative">
                      <Row
                        dot={isBusy ? 'busy' : st === 'ready' ? 'ready' : 'warn'}
                        icon={TYPE_ICON[lesson.type]}
                        title={lesson.title}
                        selected={selectedLessonId === lesson.id}
                        onClick={() => props.onSelectLesson(lesson.id)}
                        meta={meta ?? (isBusy ? 'writing notes & slides…' : (
                          <span className="text-amber-700">
                            {st === 'no-notes' && 'no notes yet'}
                            {st === 'no-slides' && 'no slides yet'}
                            {st === 'no-media' && 'add a video or file'}
                          </span>
                        ))}
                        action={
                          <>
                            {(st === 'no-notes' || st === 'no-slides') && !isBusy && (
                              <SmallAction onClick={() => generateForLesson(section, lesson)}>
                                {st === 'no-notes' ? 'Write notes & slides' : 'Build slides'}
                              </SmallAction>
                            )}
                            <span className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                              <ActionMenu
                                label={`Actions for ${lesson.title}`}
                                items={[
                                  { label: 'Open', onClick: () => props.onSelectLesson(lesson.id) },
                                  { label: 'Move up', onClick: () => moveLesson(section, lesson, -1) },
                                  { label: 'Move down', onClick: () => moveLesson(section, lesson, 1) },
                                ]}
                              />
                            </span>
                          </>
                        }
                      />
                    </div>
                  );
                })}

                {/* The week's AI lecture */}
                {lessons.length > 0 && (
                  <Row
                    dot={lecture.state === 'ready' ? 'ready' : lecture.state === 'making' ? 'busy' : lecture.state === 'none' ? 'none' : 'warn'}
                    icon={<PlayCircle className="w-3.5 h-3.5" />}
                    title={`Week ${index + 1} lecture${lecture.state === 'none' ? ' (optional)' : ''}`}
                    onClick={() => props.onOpenLecture({ id: section.id, title: section.title })}
                    meta={lecture.state === 'ready' ? `${lecture.minutes || '?'} min video`
                      : lecture.state === 'making' ? 'video being made…'
                        : lecture.state === 'draft' ? <span className="text-amber-700">script waiting for review</span>
                          : lecture.state === 'failed' ? <span className="text-red-600">needs attention</span> : null}
                    action={lecture.state === 'none'
                      ? <SmallAction onClick={() => props.onOpenLecture({ id: section.id, title: section.title })}>Create lecture</SmallAction>
                      : undefined}
                  />
                )}
              </div>

              {addingLessonTo === section.id ? (
                <form onSubmit={e => addLesson(e, section)} className="flex gap-2 px-4 sm:px-5 py-2.5 flex-wrap">
                  <label htmlFor={`lesson-${section.id}`} className="sr-only">Lesson title</label>
                  <input id={`lesson-${section.id}`} autoFocus value={newLesson.title} onChange={e => setNewLesson(l => ({ ...l, title: e.target.value }))} placeholder="Lesson title" className="input-field text-sm py-1.5 flex-1 min-w-[180px]" />
                  <label htmlFor={`lesson-type-${section.id}`} className="sr-only">Lesson type</label>
                  <select id={`lesson-type-${section.id}`} value={newLesson.type} onChange={e => setNewLesson(l => ({ ...l, type: e.target.value }))} className="input-field text-sm py-1.5 w-36">
                    <option value="text">Reading</option>
                    <option value="video">Video</option>
                    <option value="pdf">PDF / document</option>
                    <option value="link">Link</option>
                  </select>
                  <button type="submit" disabled={busy || !newLesson.title.trim()} className="btn-primary text-xs px-3">Add</button>
                  <button type="button" onClick={() => setAddingLessonTo(null)} className="text-xs text-slate-500 px-2">Cancel</button>
                </form>
              ) : (
                <button onClick={() => { setAddingLessonTo(section.id); setNewLesson({ title: '', type: 'text' }); }} className="flex items-center gap-1.5 px-4 sm:px-5 py-2 text-xs font-semibold text-sky-700 hover:underline">
                  <Plus className="w-3.5 h-3.5" /> Lesson
                </button>
              )}

              <div className="border-t border-slate-100">
                <GroupLabel>Practise &amp; check</GroupLabel>
                <div className="divide-y divide-slate-100">
                  {labs.map(a => (
                    <Row key={a.id} dot={a.brief_html ? 'ready' : 'warn'} icon={<FlaskConical className="w-3.5 h-3.5" />} title={prefixed('Lab', a.title)}
                      meta={a.estimated_minutes ? `${a.estimated_minutes} min` : undefined}
                      onClick={() => props.onOpenAssignment({ kind: 'lab', assignment: a })} />
                  ))}
                  {quizzes.map(q => (
                    <Row key={q.id} dot={q.question_count > 0 ? 'ready' : 'warn'} icon={<HelpCircle className="w-3.5 h-3.5" />} title={prefixed('Quiz', q.title)}
                      meta={`${q.question_count} question${q.question_count === 1 ? '' : 's'}`} onClick={props.onOpenQuizzes} />
                  ))}
                  {tasks.map(a => (
                    <Row key={a.id} dot={a.rubric.length ? 'ready' : 'warn'} icon={<ClipboardList className="w-3.5 h-3.5" />} title={prefixed('Assignment', a.title)}
                      meta={a.due_date ? `due ${formatDate(a.due_date)}` : a.rubric.length ? 'with rubric' : 'no rubric yet'}
                      onClick={() => props.onOpenAssignment({ kind: 'assignment', assignment: a })} />
                  ))}
                </div>
                <div className="flex gap-2 px-4 sm:px-5 py-3 flex-wrap">
                  <button onClick={() => props.onOpenAssignment({ kind: 'lab', sectionId: section.id })} className="text-xs font-semibold border border-dashed border-slate-300 rounded-md px-2.5 py-1.5 text-slate-600 hover:border-sky-400 hover:text-sky-700">+ Lab</button>
                  <button onClick={() => props.onOpenWeekQuiz({ id: section.id, title: section.title })} disabled={lessons.length === 0} className="text-xs font-semibold border border-dashed border-slate-300 rounded-md px-2.5 py-1.5 text-slate-600 hover:border-sky-400 hover:text-sky-700 disabled:opacity-40">+ Quiz</button>
                  <button onClick={() => props.onOpenAssignment({ kind: 'assignment', sectionId: section.id })} className="text-xs font-semibold border border-dashed border-slate-300 rounded-md px-2.5 py-1.5 text-slate-600 hover:border-sky-400 hover:text-sky-700">+ Assignment</button>
                </div>
              </div>
            </section>
          );
        })}

        {/* Capstone: the project students show to employers */}
        {ws.sections.length > 0 && (
          <section aria-labelledby="capstone-heading" className={`bg-white border rounded-xl ${capstones.length ? 'border-slate-200' : 'border-dashed border-slate-300'}`}>
            <div className="flex items-center gap-3 px-4 sm:px-5 py-3.5">
              <Trophy className="w-5 h-5 text-amber-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <h2 id="capstone-heading" className="font-semibold text-slate-900">Capstone project</h2>
                <p className="text-xs text-slate-500">A final project that pulls the course together, and a piece of work students can show employers.</p>
              </div>
              {capstones.length === 0 && (
                <SmallAction onClick={() => props.onOpenAssignment({ kind: 'capstone', sectionId: null })}>Draft capstone</SmallAction>
              )}
            </div>
            {capstones.length > 0 && (
              <div className="divide-y divide-slate-100 border-t border-slate-100">
                {capstones.map(a => (
                  <Row key={a.id} dot={a.rubric.length ? 'ready' : 'warn'} icon={<Check className="w-3.5 h-3.5" />} title={a.title}
                    meta={a.due_date ? `due ${formatDate(a.due_date)}` : `${a.rubric.length} rubric criteria`}
                    onClick={() => props.onOpenAssignment({ kind: 'capstone', assignment: a })} />
                ))}
              </div>
            )}
          </section>
        )}
      </div>

      {/* Right column: AI assistant, or the selected lesson. On small screens the lesson opens full screen. */}
      <aside className={selected ? 'fixed inset-0 z-40 bg-white overflow-y-auto lg:static lg:z-auto lg:bg-transparent lg:overflow-visible lg:sticky lg:top-4' : 'lg:sticky lg:top-4'}>
        {side}
      </aside>

      <ConfirmDialog
        isOpen={!!confirmDelete}
        title="Delete this week?"
        message={`"${confirmDelete?.title ?? ''}" and all of its lessons, notes and slides will be deleted. This cannot be undone.`}
        confirmText="Delete week"
        variant="danger"
        onConfirm={() => { if (confirmDelete) deleteWeek(confirmDelete); setConfirmDelete(null); }}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}
