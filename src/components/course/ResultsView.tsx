import { useEffect, useMemo, useState } from 'react';
import { Loader2, Download, AlertTriangle, Star, Users, MessageSquare } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatDate } from '../../lib/workspace';
import type { Workspace } from '../../lib/workspace';

interface Props {
  ws: Workspace;
}

interface StudentRow {
  id: string;
  name: string;
  email: string;
  enrolledAt: string | null;
  completed: number;
  lastActive: string | null;
  quizAvg: number | null;
  submitted: number;
  gradeAvg: number | null;
  flags: string[];
}

interface HardQuestion { question: string; quiz: string; wrong: number; answered: number }
interface WeekFeedback { sectionId: string; title: string; average: number; count: number; comments: Array<{ rating: number; comment: string; at: string }> }

const DAY = 86400000;

function percentOf(a: { percentage?: number | null; score?: number | null; total_points?: number | null }): number | null {
  if (typeof a.percentage === 'number') return a.percentage;
  if (typeof a.score === 'number' && a.total_points) return (a.score / a.total_points) * 100;
  return null;
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((n, x) => n + x, 0) / xs.length : null);

export default function ResultsView({ ws }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [hard, setHard] = useState<HardQuestion[]>([]);
  const [feedback, setFeedback] = useState<WeekFeedback[]>([]);

  const courseId = ws.course.id;
  const now = Date.now();
  const releasedLessons = useMemo(() => ws.sections
    .filter(s => !s.release_at || new Date(s.release_at).getTime() <= now)
    .reduce((n, s) => n + s.lessons.length, 0), [ws.sections, now]);
  const publishedAssignments = ws.assignments.filter(a => a.is_published).length;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const [ce, le] = await Promise.all([
          supabase.from('course_enrollments').select('user_id, enrolled_at, payment_status').eq('course_id', courseId),
          supabase.from('enrollments').select('student_id, enrolled_at').eq('course_id', courseId),
        ]);
        const enrolled = new Map<string, string | null>();
        for (const r of ce.data ?? []) if (r.payment_status !== 'pending' && r.payment_status !== 'failed') enrolled.set(r.user_id, r.enrolled_at);
        for (const r of le.data ?? []) if (!enrolled.has(r.student_id)) enrolled.set(r.student_id, r.enrolled_at);
        const ids = [...enrolled.keys()];

        const quizIds = ws.quizzes.map(q => q.id);
        const assignmentIds = ws.assignments.map(a => a.id);
        const [profiles, progress, attempts, questions, subs, fb] = await Promise.all([
          ids.length ? supabase.from('profiles').select('id, full_name, email').in('id', ids) : Promise.resolve({ data: [] as Array<{ id: string; full_name: string | null; email: string | null }> }),
          supabase.from('lesson_progress').select('student_id, user_id, lesson_id, status, is_completed, updated_at').eq('course_id', courseId),
          supabase.from('quiz_attempts').select('student_id, user_id, quiz_id, score, total_points, percentage, answers, submitted_at, created_at').eq('course_id', courseId),
          quizIds.length ? supabase.from('quiz_questions').select('id, quiz_id, question, type, correct_answer').in('quiz_id', quizIds) : Promise.resolve({ data: [] as Array<{ id: string; quiz_id: string; question: string; type: string; correct_answer: string | null }> }),
          assignmentIds.length ? supabase.from('assignment_submissions').select('student_id, assignment_id, grade').in('assignment_id', assignmentIds) : Promise.resolve({ data: [] as Array<{ student_id: string; assignment_id: string; grade: number | null }> }),
          supabase.from('week_feedback').select('section_id, rating, comment, updated_at').eq('course_id', courseId).order('updated_at', { ascending: false }),
        ]);
        if (cancelled) return;

        const name = new Map((profiles.data ?? []).map(p => [p.id, p]));
        const done = new Map<string, Set<string>>();
        const last = new Map<string, string>();
        const bump = (sid: string, at: string | null | undefined) => {
          if (!at) return;
          if (!last.has(sid) || last.get(sid)! < at) last.set(sid, at);
        };
        for (const p of progress.data ?? []) {
          const sid = p.student_id ?? p.user_id;
          if (!sid) continue;
          if (p.status === 'completed' || p.is_completed) {
            if (!done.has(sid)) done.set(sid, new Set());
            done.get(sid)!.add(p.lesson_id);
          }
          bump(sid, p.updated_at);
        }

        // Best score per student per quiz
        const best = new Map<string, Map<string, number>>();
        for (const a of attempts.data ?? []) {
          const sid = a.student_id ?? a.user_id;
          const pct = percentOf(a);
          if (!sid || pct === null) continue;
          if (!best.has(sid)) best.set(sid, new Map());
          const m = best.get(sid)!;
          m.set(a.quiz_id, Math.max(m.get(a.quiz_id) ?? 0, pct));
          bump(sid, a.submitted_at ?? a.created_at);
        }

        const grades = new Map<string, { submitted: number; scores: number[] }>();
        const points = new Map(ws.assignments.map(a => [a.id, a.total_points ?? 100]));
        for (const s of subs.data ?? []) {
          const g = grades.get(s.student_id) ?? { submitted: 0, scores: [] };
          g.submitted += 1;
          if (typeof s.grade === 'number') g.scores.push((s.grade / (points.get(s.assignment_id) || 100)) * 100);
          grades.set(s.student_id, g);
        }

        const rows: StudentRow[] = ids.map(id => {
          const p = name.get(id);
          const completed = done.get(id)?.size ?? 0;
          const quizAvg = avg([...(best.get(id)?.values() ?? [])]);
          const g = grades.get(id);
          const lastActive = last.get(id) ?? null;
          const enrolledAt = enrolled.get(id) ?? null;
          const flags: string[] = [];
          const since = lastActive ?? enrolledAt;
          if (since && now - new Date(since).getTime() > 7 * DAY) flags.push('Inactive for over a week');
          if (quizAvg !== null && quizAvg < 50) flags.push('Quiz average under 50%');
          if (releasedLessons >= 4 && completed < releasedLessons * 0.4 && enrolledAt && now - new Date(enrolledAt).getTime() > 7 * DAY) flags.push('Falling behind');
          return {
            id, name: p?.full_name || p?.email || 'Student', email: p?.email ?? '', enrolledAt,
            completed, lastActive, quizAvg, submitted: g?.submitted ?? 0, gradeAvg: avg(g?.scores ?? []), flags,
          };
        }).sort((a, b) => b.flags.length - a.flags.length || a.name.localeCompare(b.name));
        setStudents(rows);

        // Questions most often answered wrongly (multiple choice and true/false only)
        const quizTitle = new Map(ws.quizzes.map(q => [q.id, q.title]));
        const tally = new Map<string, { wrong: number; answered: number }>();
        const qById = new Map((questions.data ?? []).map(q => [q.id, q]));
        for (const a of attempts.data ?? []) {
          const answers = (a.answers ?? {}) as Record<string, unknown>;
          for (const [qid, given] of Object.entries(answers)) {
            const q = qById.get(qid);
            if (!q || q.type === 'short_answer' || !q.correct_answer || typeof given !== 'string') continue;
            const t = tally.get(qid) ?? { wrong: 0, answered: 0 };
            t.answered += 1;
            if (given.trim().toLowerCase() !== q.correct_answer.trim().toLowerCase()) t.wrong += 1;
            tally.set(qid, t);
          }
        }
        setHard([...tally.entries()]
          .filter(([, t]) => t.answered >= 3 && t.wrong / t.answered >= 0.4)
          .map(([qid, t]) => ({ question: qById.get(qid)!.question, quiz: quizTitle.get(qById.get(qid)!.quiz_id) ?? '', ...t }))
          .sort((a, b) => b.wrong / b.answered - a.wrong / a.answered)
          .slice(0, 8));

        const bySection = new Map<string, WeekFeedback>();
        for (const f of fb.data ?? []) {
          const section = ws.sections.find(s => s.id === f.section_id);
          if (!section) continue;
          const w: WeekFeedback = bySection.get(f.section_id) ?? { sectionId: f.section_id, title: section.title, average: 0, count: 0, comments: [] };
          w.average = (w.average * w.count + f.rating) / (w.count + 1);
          w.count += 1;
          if (f.comment?.trim() && w.comments.length < 5) w.comments.push({ rating: f.rating, comment: f.comment.trim(), at: f.updated_at });
          bySection.set(f.section_id, w);
        }
        setFeedback(ws.sections.map(s => bySection.get(s.id)).filter((w): w is WeekFeedback => !!w));
      } catch {
        if (!cancelled) setError('Could not load the results. Please refresh the page.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // Reload when the course content changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId, ws.quizzes, ws.assignments, ws.sections]);

  const exportCsv = () => {
    const header = ['Name', 'Email', 'Enrolled', 'Lessons completed', 'Lessons open', 'Quiz average %', 'Assignments submitted', 'Assignment average %', 'Last active', 'Needs attention'];
    const cell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [header.map(cell).join(',')].concat(students.map(s => [
      s.name, s.email, s.enrolledAt ? s.enrolledAt.slice(0, 10) : '', s.completed, releasedLessons,
      s.quizAvg === null ? '' : Math.round(s.quizAvg), s.submitted, s.gradeAvg === null ? '' : Math.round(s.gradeAvg),
      s.lastActive ? s.lastActive.slice(0, 10) : '', s.flags.join('; '),
    ].map(cell).join(',')));
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${ws.course.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'course'}-results.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> Loading results…</div>;
  if (error) return <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error}</p>;

  if (students.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl px-6 py-14 text-center">
        <Users className="w-10 h-10 text-slate-300 mx-auto mb-3" />
        <p className="font-semibold text-slate-800">No students yet</p>
        <p className="text-sm text-slate-500 mt-1">Progress, quiz scores and feedback will appear here once students join{ws.course.is_published ? '' : ' (publish the course first)'}.</p>
      </div>
    );
  }

  const progressPct = (s: StudentRow) => (releasedLessons ? Math.min(100, Math.round((s.completed / releasedLessons) * 100)) : 0);
  const atRisk = students.filter(s => s.flags.length).length;
  const quizAvgAll = avg(students.map(s => s.quizAvg).filter((x): x is number => x !== null));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Students', value: students.length },
          { label: 'Average progress', value: `${Math.round(avg(students.map(progressPct)) ?? 0)}%` },
          { label: 'Average quiz score', value: quizAvgAll === null ? 'No attempts' : `${Math.round(quizAvgAll)}%` },
          { label: 'Need attention', value: atRisk },
        ].map(s => (
          <div key={s.label} className="bg-white border border-slate-200 rounded-xl px-4 py-3">
            <p className="text-2xl font-bold text-slate-900">{s.value}</p>
            <p className="text-xs text-slate-500">{s.label}</p>
          </div>
        ))}
      </div>

      <section aria-labelledby="students-heading" className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-100">
          <h2 id="students-heading" className="font-semibold text-slate-900 flex-1">Students</h2>
          <button onClick={exportCsv} className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 border border-slate-300 rounded-lg px-2.5 py-1.5 hover:bg-slate-50">
            <Download className="w-3.5 h-3.5" /> Download CSV
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th scope="col" className="text-left font-semibold px-5 py-2">Student</th>
                <th scope="col" className="text-left font-semibold px-3 py-2 min-w-[140px]">Progress</th>
                <th scope="col" className="text-right font-semibold px-3 py-2">Quizzes</th>
                <th scope="col" className="text-right font-semibold px-3 py-2">Assignments</th>
                <th scope="col" className="text-left font-semibold px-3 py-2">Last active</th>
                <th scope="col" className="text-left font-semibold px-5 py-2">Attention</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {students.map(s => (
                <tr key={s.id} className={s.flags.length ? 'bg-amber-50/40' : undefined}>
                  <td className="px-5 py-2.5">
                    <span className="block font-medium text-slate-800">{s.name}</span>
                    {s.email && s.email !== s.name && <span className="block text-xs text-slate-500">{s.email}</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-sky-500" style={{ width: `${progressPct(s)}%` }} /></div>
                      <span className="text-xs text-slate-600 w-9 text-right">{progressPct(s)}%</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right text-slate-700">{s.quizAvg === null ? <span className="text-slate-400">–</span> : `${Math.round(s.quizAvg)}%`}</td>
                  <td className="px-3 py-2.5 text-right text-slate-700">
                    {publishedAssignments ? `${s.submitted}/${publishedAssignments}` : <span className="text-slate-400">–</span>}
                    {s.gradeAvg !== null && <span className="block text-xs text-slate-500">avg {Math.round(s.gradeAvg)}%</span>}
                  </td>
                  <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{s.lastActive ? formatDate(s.lastActive) : 'Not started'}</td>
                  <td className="px-5 py-2.5">
                    {s.flags.length ? (
                      <span className="flex items-start gap-1.5 text-xs text-amber-800"><AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />{s.flags.join(' · ')}</span>
                    ) : <span className="text-xs text-emerald-700">On track</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2 items-start">
        <section aria-labelledby="hard-heading" className="bg-white border border-slate-200 rounded-xl p-5">
          <h2 id="hard-heading" className="font-semibold text-slate-900">Questions students find hardest</h2>
          <p className="text-xs text-slate-500 mb-3">Quiz questions at least 40% of answers get wrong. Worth re-teaching or rewording.</p>
          {hard.length === 0 ? <p className="text-sm text-slate-500">Nothing stands out yet.</p> : (
            <ul className="space-y-2.5">
              {hard.map((h, i) => (
                <li key={i} className="text-sm">
                  <p className="text-slate-800">{h.question}</p>
                  <p className="text-xs text-slate-500">{h.quiz} · {Math.round((h.wrong / h.answered) * 100)}% wrong ({h.wrong} of {h.answered})</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="fb-heading" className="bg-white border border-slate-200 rounded-xl p-5">
          <h2 id="fb-heading" className="font-semibold text-slate-900">How students rate each week</h2>
          <p className="text-xs text-slate-500 mb-3">Students rate a week when they finish its lessons.</p>
          {feedback.length === 0 ? <p className="text-sm text-slate-500">No ratings yet.</p> : (
            <ul className="space-y-3">
              {feedback.map(w => (
                <li key={w.sectionId}>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="flex-1 min-w-0 truncate text-slate-800">{w.title}</span>
                    <span className="flex items-center gap-1 font-semibold text-slate-800"><Star className="w-3.5 h-3.5 text-amber-500 fill-amber-400" />{w.average.toFixed(1)}</span>
                    <span className="text-xs text-slate-500">({w.count})</span>
                  </div>
                  {w.comments.map((c, i) => (
                    <p key={i} className="flex items-start gap-1.5 text-xs text-slate-600 mt-1 pl-1"><MessageSquare className="w-3 h-3 mt-0.5 shrink-0 text-slate-400" />“{c.comment}”</p>
                  ))}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
