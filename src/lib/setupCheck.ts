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
  /** Database update 059 (live boards for lectures) has been run */
  boardsTable: boolean | null;
  /** The course-build function is deployed and database update 058 has been run */
  backgroundBuilds: boolean | null;
  /** What the deployed build service can do (an older one reports nothing); null when unknown */
  buildFeatures: string[] | null;
}

/** True when the deployed build service is known to be too old for a feature. */
export const buildServiceLacks = (setup: BuildSetup | null, feature: string) =>
  !!setup?.buildFeatures && !setup.buildFeatures.includes(feature);

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

/** Whether a function is deployed, and the features it reports to a ping (none from older versions). */
async function pingFunction(name: string): Promise<{ deployed: boolean | null; features: string[] | null }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { deployed: null, features: null };
  try {
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ action: 'ping' }),
    });
    const data = await res.json().catch(() => ({})) as { features?: unknown };
    if (res.status === 404) return { deployed: false, features: null };
    return { deployed: true, features: Array.isArray(data.features) ? data.features.map(String) : [] };
  } catch {
    return { deployed: null, features: null };
  }
}

export async function checkBuildSetup(): Promise<BuildSetup> {
  const [ai, lectureTable, boardsTable, buildTable, build] = await Promise.all([
    aiServiceInfo().catch(() => null),
    tableExists('lecture_videos'),
    tableExists('lesson_boards'),
    tableExists('course_build_jobs'),
    pingFunction('course-build'),
  ]);
  const backgroundBuilds = buildTable === false || build.deployed === false ? false
    : buildTable === null || build.deployed === null ? null : true;
  return { ai, lectureTable, boardsTable, backgroundBuilds, buildFeatures: build.features };
}
