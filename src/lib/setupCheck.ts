import { supabase } from './supabase';
import { aiServiceInfo } from './ai';
import type { AIServiceInfo } from './ai';

/**
 * What the server side of this app has been set up with. Parts of the app are deployed
 * separately (database updates, edge functions), so a feature can be ready in the app
 * but not yet on the server. Checked before a big job so it can warn first.
 */
export interface BuildSetup {
  /** null when the check itself failed (unknown) */
  ai: AIServiceInfo | null;
  /** Database update 055 (lecture videos) has been run */
  lectureTable: boolean | null;
  /** The course-build function is deployed and database update 058 has been run */
  backgroundBuilds: boolean | null;
}

// Tasks added after the first AI service: an old server cannot do these.
const NEWER_TASKS = ['teacher_guide', 'assessment_draft', 'improve_notes', 'summarize_material', 'suggest_marks'];

/** True when the server's AI service cannot do this task. */
export function aiCannot(setup: BuildSetup | null, task: string): boolean {
  if (!setup?.ai) return false;
  if (setup.ai.tasks === null) return NEWER_TASKS.includes(task);
  return !setup.ai.tasks.has(task);
}

/** True when the AI service predates streamed notes and slides (long ones can time out). */
export const aiIsOld = (setup: BuildSetup | null) => !!setup?.ai && setup.ai.version === null;

async function tableExists(table: string): Promise<boolean | null> {
  const { error } = await supabase.from(table).select('*', { head: true, count: 'exact' }).limit(1);
  if (!error) return true;
  const missing = ['42P01', 'PGRST205', 'PGRST204'].includes(String(error.code ?? ''))
    || /does not exist|could not find the table/i.test(error.message ?? '');
  return missing ? false : null;
}

async function functionDeployed(name: string): Promise<boolean | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;
  try {
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ action: 'ping' }),
    });
    await res.text().catch(() => '');
    return res.status !== 404;
  } catch {
    return null;
  }
}

export async function checkBuildSetup(): Promise<BuildSetup> {
  const [ai, lectureTable, buildTable, buildFunction] = await Promise.all([
    aiServiceInfo().catch(() => null),
    tableExists('lecture_videos'),
    tableExists('course_build_jobs'),
    functionDeployed('course-build'),
  ]);
  const backgroundBuilds = buildTable === false || buildFunction === false ? false
    : buildTable === null || buildFunction === null ? null : true;
  return { ai, lectureTable, backgroundBuilds };
}
