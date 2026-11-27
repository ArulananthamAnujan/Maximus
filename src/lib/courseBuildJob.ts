import { supabase } from './supabase';

export type BuildTaskKind = 'notes' | 'slides' | 'guide' | 'lecture_script' | 'lecture_video' | 'lecture_board' | 'quiz' | 'capstone';
export type BuildTaskStatus = 'queued' | 'running' | 'done' | 'failed' | 'skipped';

export interface BuildJob {
  id: string;
  course_id: string;
  status: 'running' | 'done' | 'stopped';
  error: string | null;
  options: { check_scripts?: boolean; lectures?: boolean } & Record<string, unknown>;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
}

export interface BuildTask {
  kind: BuildTaskKind;
  status: BuildTaskStatus;
  label: string;
  error: string | null;
  finished_at: string | null;
}

export interface BuildOptions {
  materials: boolean;
  guides: boolean;
  lectures: boolean;
  quizzes: boolean;
  capstone: boolean;
  boards: boolean;
  check_scripts: boolean;
  avatar_id?: string;
  voice_id?: string;
}

/** The server build service is not deployed (or cannot be reached). */
export class BuildServiceUnavailable extends Error {}

async function callBuildApi<T>(action: string, payload: Record<string, unknown>): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Please sign in again.');
  let res: Response;
  try {
    res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/course-build`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ action, ...payload }),
    });
  } catch {
    throw new BuildServiceUnavailable('Could not reach the build service.');
  }
  if (res.status === 404) throw new BuildServiceUnavailable('The build service is not set up yet.');
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Could not start the build. Please try again.');
  return data as T;
}

export const startServerBuild = (courseId: string, options: BuildOptions) =>
  callBuildApi<{ job_id: string | null; tasks?: number; already_running?: boolean }>('start', { course_id: courseId, options });
export const stopServerBuild = (jobId: string) => callBuildApi<{ ok: true }>('stop', { job_id: jobId });
export const kickServerBuild = (jobId: string) => callBuildApi<{ ok: true }>('kick', { job_id: jobId });

/** The course's latest build and its tasks (null when it never had one). */
export async function loadLatestBuild(courseId: string): Promise<{ job: BuildJob; tasks: BuildTask[] } | null> {
  const { data: job } = await supabase.from('course_build_jobs')
    .select('id, course_id, status, error, options, created_at, updated_at, finished_at')
    .eq('course_id', courseId).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (!job) return null;
  const { data: tasks } = await supabase.from('course_build_tasks')
    .select('kind, status, label, error, finished_at').eq('job_id', job.id).order('phase').order('seq');
  return { job: job as BuildJob, tasks: (tasks ?? []) as BuildTask[] };
}

export type BuildGroup = 'materials' | 'lectures' | 'boards' | 'quizzes' | 'capstone' | 'guides';
export const GROUP_OF: Record<BuildTaskKind, BuildGroup> = {
  notes: 'materials', slides: 'materials', guide: 'guides', lecture_script: 'lectures', lecture_video: 'lectures', lecture_board: 'boards', quiz: 'quizzes', capstone: 'capstone',
};

export interface GroupProgress { total: number; done: number; failed: number; skipped: number; running: string[] }

export function groupProgress(tasks: BuildTask[]): Partial<Record<BuildGroup, GroupProgress>> {
  const out: Partial<Record<BuildGroup, GroupProgress>> = {};
  for (const t of tasks) {
    const g = (out[GROUP_OF[t.kind]] ??= { total: 0, done: 0, failed: 0, skipped: 0, running: [] });
    g.total += 1;
    if (t.status === 'done') g.done += 1;
    else if (t.status === 'failed') g.failed += 1;
    else if (t.status === 'skipped') g.skipped += 1;
    else if (t.status === 'running' && t.label) g.running.push(t.label);
  }
  return out;
}

export function buildCounts(tasks: BuildTask[]) {
  const done = tasks.filter(t => t.status === 'done').length;
  const failed = tasks.filter(t => t.status === 'failed').length;
  const finished = tasks.filter(t => t.status !== 'queued' && t.status !== 'running').length;
  return { total: tasks.length, done, failed, finished };
}

export const GROUP_LABEL: Record<BuildGroup, string> = {
  materials: 'Notes & slides', lectures: 'Lectures', boards: 'Live boards', quizzes: 'Quizzes', capstone: 'Capstone', guides: 'Teacher guides',
};
export const GROUP_ORDER: BuildGroup[] = ['materials', 'lectures', 'boards', 'quizzes', 'capstone', 'guides'];

/** Rough minutes left, from how fast items have finished so far (null until there is enough to go on). */
export function buildMinutesLeft(job: BuildJob, tasks: BuildTask[]): number | null {
  const { total, finished } = buildCounts(tasks);
  if (finished < 2 || finished >= total) return null;
  const elapsed = Date.now() - new Date(job.created_at).getTime();
  if (elapsed <= 0) return null;
  const perItem = elapsed / finished;
  return Math.max(1, Math.round(((total - finished) * perItem) / 60000));
}

/** Running builds for a set of courses, with how far each has got. */
export async function loadRunningBuilds(courseIds: string[]): Promise<Map<string, { done: number; total: number }>> {
  const out = new Map<string, { done: number; total: number }>();
  if (courseIds.length === 0) return out;
  const { data: jobs } = await supabase.from('course_build_jobs').select('id, course_id').eq('status', 'running').in('course_id', courseIds);
  if (!jobs?.length) return out;
  const { data: tasks } = await supabase.from('course_build_tasks').select('job_id, status').in('job_id', jobs.map(j => j.id));
  for (const j of jobs) {
    const mine = (tasks ?? []).filter(t => t.job_id === j.id);
    out.set(j.course_id, { done: mine.filter(t => t.status !== 'queued' && t.status !== 'running').length, total: mine.length });
  }
  return out;
}
