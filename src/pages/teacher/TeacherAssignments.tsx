import { useCallback, useEffect, useState } from 'react';
import { Plus, FileText, ChevronDown, ChevronUp, Pencil, FlaskConical, Trophy, ClipboardList } from 'lucide-react';
import DashboardLayout from '../../components/layout/DashboardLayout';
import { teacherNavItems } from './teacherNav';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import Badge from '../../components/ui/Badge';
import AssignmentEditorModal from '../../components/course/AssignmentEditorModal';
import GradeSubmissionModal from '../../components/course/GradeSubmissionModal';
import type { GradableSubmission } from '../../components/course/GradeSubmissionModal';
import type { AssignmentKind, WsAssignment } from '../../lib/workspace';
import { formatDate } from '../../lib/workspace';

type Row = WsAssignment & {
  section?: { title: string } | null;
  submissions?: Array<GradableSubmission & { student_id: string }>;
};

const KIND: Record<AssignmentKind, { label: string; icon: typeof FileText }> = {
  lab: { label: 'Lab', icon: FlaskConical },
  assignment: { label: 'Assignment', icon: ClipboardList },
  capstone: { label: 'Capstone', icon: Trophy },
};

export default function TeacherAssignments() {
  const { profile } = useAuth();
  const [courses, setCourses] = useState<Array<{ id: string; title: string }>>([]);
  const [courseId, setCourseId] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ courseId: string; kind: AssignmentKind; assignment?: WsAssignment } | null>(null);
  const [grading, setGrading] = useState<{ assignment: Row; submission: GradableSubmission } | null>(null);

  const fetchData = useCallback(async () => {
    if (!profile) return;
    const { data: coursesData } = await supabase.from('courses').select('id, title').eq('teacher_id', profile.id).order('title');
    const list = coursesData ?? [];
    setCourses(list);
    if (list.length > 0) {
      const { data } = await supabase.from('assignments')
        .select('*, section:sections(title), submissions:assignment_submissions(*, student:profiles(full_name, email))')
        .in('course_id', list.map(c => c.id))
        .order('created_at', { ascending: false });
      setRows(((data ?? []) as Row[]).map(r => ({ ...r, kind: r.kind ?? 'assignment', rubric: Array.isArray(r.rubric) ? r.rubric : [], resources: Array.isArray(r.resources) ? r.resources : [] })));
    }
    setLoading(false);
  }, [profile]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const visible = courseId ? rows.filter(r => r.course_id === courseId) : rows;
  const courseTitle = (id: string) => courses.find(c => c.id === id)?.title ?? '';
  const toMark = visible.reduce((n, r) => n + (r.submissions ?? []).filter(s => s.grade == null).length, 0);

  return (
    <DashboardLayout navItems={teacherNavItems} title="Assignments & marking" subtitle={toMark ? `${toMark} submission${toMark === 1 ? '' : 's'} waiting to be marked` : 'Labs, assignments and capstone projects'}>
      <div className="space-y-5">
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <div>
            <label htmlFor="assign-course" className="block text-xs font-semibold text-slate-500 mb-1.5">Course</label>
            <select id="assign-course" value={courseId} onChange={e => setCourseId(e.target.value)} className="input-field text-sm min-w-[240px]">
              <option value="">All my courses</option>
              {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
          </div>
          <button
            onClick={() => setEditor({ courseId: courseId || courses[0]?.id, kind: 'assignment' })}
            disabled={courses.length === 0}
            title={courseId ? undefined : 'Uses the first course unless you pick one'}
            className="btn-primary text-sm py-2 flex items-center gap-2 disabled:opacity-50"
          >
            <Plus className="w-4 h-4" /> New
          </button>
        </div>

        {loading ? (
          <div className="space-y-4">{[1, 2, 3].map(i => <div key={i} className="card p-5 animate-pulse"><div className="h-5 bg-gray-200 dark:bg-navy-700 rounded w-1/3 mb-2" /></div>)}</div>
        ) : visible.length === 0 ? (
          <div className="card text-center py-16">
            <FileText className="w-10 h-10 text-gray-400 mx-auto mb-3" />
            <h3 className="font-semibold text-gray-900 dark:text-white mb-1">Nothing here yet</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">Add labs, assignments and a capstone from each course's Weeks page, or with "New" above.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {visible.map(a => {
              const subs = a.submissions ?? [];
              const pending = subs.filter(s => s.grade == null).length;
              const K = KIND[a.kind];
              return (
                <div key={a.id} className="card">
                  <div className="flex items-center gap-3 p-4">
                    <K.icon className="w-5 h-5 text-slate-400 shrink-0" />
                    <button onClick={() => setExpanded(expanded === a.id ? null : a.id)} aria-expanded={expanded === a.id} className="flex-1 min-w-0 text-left">
                      <span className="flex items-center gap-2 flex-wrap mb-0.5">
                        <span className="font-semibold text-gray-900 dark:text-white text-sm">{a.title}</span>
                        <Badge variant="info">{K.label}</Badge>
                        {!a.is_published && <Badge variant="warning">Hidden from students</Badge>}
                        {pending > 0 && <Badge variant="warning">{pending} to mark</Badge>}
                      </span>
                      <span className="block text-xs text-gray-500">
                        {courseTitle(a.course_id)}{a.section?.title ? ` · ${a.section.title}` : ''} · {a.due_date ? `due ${formatDate(a.due_date)}` : 'no due date'} · {a.total_points ?? 100} points · {subs.length} submission{subs.length === 1 ? '' : 's'}
                      </span>
                    </button>
                    <button onClick={() => setEditor({ courseId: a.course_id, kind: a.kind, assignment: a })} aria-label={`Edit ${a.title}`} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100"><Pencil className="w-4 h-4" /></button>
                    {expanded === a.id ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
                  </div>
                  {expanded === a.id && (
                    <div className="border-t border-gray-100 dark:border-navy-700 divide-y divide-gray-100 dark:divide-navy-700">
                      {subs.length === 0 && <p className="px-4 py-4 text-sm text-gray-500">No submissions yet.</p>}
                      {subs.map(sub => (
                        <div key={sub.id} className="flex items-center justify-between gap-3 px-4 py-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{sub.student?.full_name || sub.student?.email || 'Student'}</p>
                            <p className="text-xs text-gray-400">Submitted {formatDate(sub.submitted_at)}</p>
                          </div>
                          {sub.grade != null ? (
                            <button onClick={() => setGrading({ assignment: a, submission: sub })} className="text-sm font-bold text-green-600 hover:underline">{sub.grade}/{a.total_points ?? 100}</button>
                          ) : (
                            <button onClick={() => setGrading({ assignment: a, submission: sub })} className="btn-primary text-xs py-1.5 px-3">Mark</button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {editor && editor.courseId && (
        <AssignmentEditorModal
          courseId={editor.courseId}
          kind={editor.kind}
          sectionId={editor.assignment?.section_id ?? null}
          assignment={editor.assignment}
          onClose={() => setEditor(null)}
          onSaved={fetchData}
        />
      )}
      {grading && (
        <GradeSubmissionModal
          assignment={grading.assignment}
          submission={grading.submission}
          onClose={() => setGrading(null)}
          onSaved={fetchData}
        />
      )}
    </DashboardLayout>
  );
}
