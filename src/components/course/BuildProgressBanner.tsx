import { Loader2, CheckCircle2, AlertCircle, X } from 'lucide-react';
import { buildCounts, buildMinutesLeft, groupProgress, GROUP_LABEL, GROUP_ORDER } from '../../lib/courseBuildJob';
import type { BuildJob, BuildTask } from '../../lib/courseBuildJob';

interface Props {
  build: { job: BuildJob; tasks: BuildTask[] };
  onDetails: () => void;
  onStop: () => void;
  onRetry: () => void;
  onDismiss: () => void;
}

/** Where a background build is up to, shown at the top of the course while it runs and after it ends. */
export default function BuildProgressBanner({ build, onDetails, onStop, onRetry, onDismiss }: Props) {
  const { job, tasks } = build;
  const running = job.status === 'running';
  const c = buildCounts(tasks);
  const groups = groupProgress(tasks);
  const left = running ? buildMinutesLeft(job, tasks) : null;
  const now = tasks.filter(t => t.status === 'running').map(t => t.label).filter(Boolean);
  const problems = c.failed > 0 || job.status === 'stopped';
  const tone = running ? 'bg-sky-50 border-sky-200 text-sky-950' : problems ? 'bg-amber-50 border-amber-200 text-amber-950' : 'bg-emerald-50 border-emerald-200 text-emerald-950';

  return (
    <div role="status" aria-live="polite" className={`rounded-xl border px-4 py-3 text-sm space-y-2.5 ${tone}`}>
      <div className="flex items-center gap-3 flex-wrap">
        {running ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : problems ? <AlertCircle className="w-4 h-4 shrink-0" /> : <CheckCircle2 className="w-4 h-4 shrink-0" />}
        <p className="flex-1 min-w-[220px]">
          {running ? (
            <>
              <strong>Building the course: {c.finished} of {c.total} done</strong>
              {left !== null && <span> · about {left} minute{left === 1 ? '' : 's'} left</span>}
              <span className="block text-xs opacity-80">It runs on our servers, so you can keep working, change page or close the browser.</span>
            </>
          ) : (
            <strong>
              {job.status === 'stopped' ? 'The course build was stopped' : 'The course build finished'}: {c.done} of {c.total} made{c.failed ? `, ${c.failed} could not be made` : ''}.
            </strong>
          )}
        </p>
        <button onClick={onDetails} className="text-xs font-semibold underline">Details</button>
        {running && <button onClick={onStop} className="text-xs font-semibold underline">Stop</button>}
        {!running && problems && <button onClick={onRetry} className="text-xs font-semibold underline">Try the missing items again</button>}
        {!running && <button aria-label="Dismiss" onClick={onDismiss} className="p-1 rounded hover:bg-black/5"><X className="w-3.5 h-3.5" /></button>}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {GROUP_ORDER.filter(g => groups[g]).map(g => {
          const p = groups[g]!;
          const finished = p.done + p.failed + p.skipped;
          const state = p.failed ? 'text-red-700' : finished >= p.total ? 'text-emerald-700' : '';
          return (
            <div key={g} className="flex items-center gap-2 text-xs min-w-[150px]">
              <span className="font-medium">{GROUP_LABEL[g]}</span>
              <div className="w-16 h-1.5 bg-black/10 rounded-full overflow-hidden">
                <div className={`h-full ${p.failed ? 'bg-red-500' : 'bg-sky-500'}`} style={{ width: `${p.total ? Math.round((finished / p.total) * 100) : 0}%` }} />
              </div>
              <span className={state}>{p.done}/{p.total}{p.failed ? ` · ${p.failed} failed` : ''}</span>
            </div>
          );
        })}
      </div>

      {running && now.length > 0 && <p className="text-xs opacity-80 truncate">Making now: {now.join(' · ')}</p>}
      {!running && job.error && <p className="text-xs">{job.error}</p>}
    </div>
  );
}
