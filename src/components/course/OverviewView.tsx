import { CheckCircle2, AlertTriangle, Circle, Users, Target, Briefcase, Hammer, Globe, FileText } from 'lucide-react';
import { safeUrl } from '../../lib/utils';
import { stripHtml } from '../../lib/slides';
import { itemComplete, totalMinutes, weekLessons } from '../../lib/workspace';
import type { ReadinessItem, Workspace } from '../../lib/workspace';

interface Props {
  ws: Workspace;
  items: ReadinessItem[];
  onFix: (item: ReadinessItem) => void;
  onEditPlan: () => void;
  onEditDescription: () => void;
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl px-4 py-3">
      <p className="text-2xl font-bold text-slate-900">{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}

export default function OverviewView({ ws, items, onFix, onEditPlan, onEditDescription }: Props) {
  const b = ws.plan?.brief;
  const lessons = ws.sections.reduce((n, s) => n + weekLessons(s, ws).length, 0);
  const hours = Math.round(totalMinutes(ws) / 60);
  const description = stripHtml(ws.course.description ?? '');

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] items-start">
      <div className="space-y-5 min-w-0">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="Weeks" value={ws.sections.length} />
          <Stat label="Lessons" value={lessons} />
          <Stat label="Hours of study" value={hours} />
          <Stat label="Students enrolled" value={ws.enrolled} />
        </div>

        <section aria-labelledby="plan-heading" className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2 id="plan-heading" className="font-semibold text-slate-900">Course plan</h2>
            <button onClick={onEditPlan} className="text-xs font-semibold text-sky-700 hover:underline">{b ? 'Change with the planner' : 'Plan with AI'}</button>
          </div>
          {b ? (
            <dl className="grid sm:grid-cols-2 gap-4 text-sm">
              {[
                { icon: Users, label: 'Who it is for', value: [b.audience, b.starting_level].filter(Boolean).join(' · ') },
                { icon: Target, label: 'What they will be able to do', value: b.outcome },
                { icon: Briefcase, label: 'Prepares for', value: (b.target_roles ?? []).join(', ') },
                { icon: Hammer, label: 'Approach', value: b.approach },
              ].filter(r => r.value).map(r => (
                <div key={r.label} className="flex gap-2.5">
                  <r.icon className="w-4 h-4 text-sky-600 mt-0.5 shrink-0" />
                  <div><dt className="text-xs font-semibold text-slate-500">{r.label}</dt><dd className="text-slate-800">{r.value}</dd></div>
                </div>
              ))}
              {(b.projects ?? []).length > 0 && (
                <div className="sm:col-span-2"><dt className="text-xs font-semibold text-slate-500">Projects</dt><dd className="text-slate-800">{b.projects.join('; ')}</dd></div>
              )}
              {(b.market_findings ?? []).length > 0 && (
                <div className="sm:col-span-2 bg-slate-50 rounded-lg p-3">
                  <dt className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 mb-1"><Globe className="w-3.5 h-3.5 text-sky-600" /> What employers are asking for</dt>
                  <dd><ul className="list-disc pl-5 space-y-0.5 text-slate-700">{b.market_findings!.map((f, i) => <li key={i}>{f}</li>)}</ul></dd>
                  {(ws.plan?.sources ?? []).length > 0 && (
                    <dd className="text-xs text-slate-500 mt-1.5">Sources: {ws.plan!.sources.slice(0, 5).map((s, i) => (
                      <span key={s.url}>{i > 0 && ' · '}<a href={safeUrl(s.url) || undefined} target="_blank" rel="noopener noreferrer" className="text-sky-700 hover:underline">{s.title.length > 40 ? `${s.title.slice(0, 40)}…` : s.title}</a></span>
                    ))}</dd>
                  )}
                </div>
              )}
              {ws.plan?.material && (
                <div className="sm:col-span-2 flex gap-2.5"><FileText className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                  <div><dt className="text-xs font-semibold text-slate-500">Built around your material</dt><dd className="text-slate-800">{ws.plan.material.file_name}</dd></div>
                </div>
              )}
            </dl>
          ) : (
            <p className="text-sm text-slate-500">No plan yet. Planning with the AI (who the course is for, the job it leads to, the time available) makes every note, slide, quiz and project fit your learners.</p>
          )}
        </section>

        <section aria-labelledby="desc-heading" className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between gap-3 mb-2">
            <h2 id="desc-heading" className="font-semibold text-slate-900">Description students see</h2>
            <button onClick={onEditDescription} className="text-xs font-semibold text-sky-700 hover:underline">Edit</button>
          </div>
          <p className="text-sm text-slate-700 whitespace-pre-line">{description || <span className="text-slate-400">No description yet.</span>}</p>
        </section>
      </div>

      <aside className="bg-white border border-slate-200 rounded-xl p-5 lg:sticky lg:top-4">
        <h2 className="font-semibold text-slate-900 mb-3">Before you publish</h2>
        <ul className="space-y-2.5">
          {items.filter(i => i.total > 0).map(item => {
            const done = itemComplete(item);
            return (
              <li key={item.key} className="flex items-start gap-2.5 text-sm">
                {done ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                  : item.level === 'optional' ? <Circle className="w-4 h-4 text-slate-300 shrink-0 mt-0.5" />
                    : <AlertTriangle className={`w-4 h-4 shrink-0 mt-0.5 ${item.level === 'required' ? 'text-red-500' : 'text-amber-500'}`} />}
                <span className="flex-1 min-w-0">
                  <span className="text-slate-800">{item.label}</span>
                  {item.total > 1 && <span className="text-slate-500"> {item.done}/{item.total}</span>}
                  {item.level === 'optional' && <span className="text-xs text-slate-400"> · optional</span>}
                </span>
                {!done && <button onClick={() => onFix(item)} className="text-xs font-semibold text-sky-700 hover:underline shrink-0">Fix</button>}
              </li>
            );
          })}
        </ul>
      </aside>
    </div>
  );
}
