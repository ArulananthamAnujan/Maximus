/**
 * Calls between our own edge functions. The course-build worker runs long jobs for a
 * teacher after they have left the page, so it calls the AI and lecture functions with
 * the service role key and says which teacher it is acting for. Only a caller holding
 * the service role key can do this.
 */

const ACT_AS_HEADER = 'x-maximus-act-as';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sameText(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

/** True when the request carries the service role key. */
export function isServiceCall(req: Request): boolean {
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const auth = req.headers.get('Authorization') ?? '';
  return key.length > 0 && sameText(auth, `Bearer ${key}`);
}

/** The teacher a service call acts for, or null when this is not such a call. */
export function actingUserId(req: Request): string | null {
  const actAs = req.headers.get(ACT_AS_HEADER) ?? '';
  if (!actAs || !UUID.test(actAs)) return null;
  return isServiceCall(req) ? actAs : null;
}

/** Headers for calling another of our functions on a teacher's behalf. */
export function actAsHeaders(userId: string): Record<string, string> {
  return {
    Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''}`,
    'Content-Type': 'application/json',
    [ACT_AS_HEADER]: userId,
  };
}
