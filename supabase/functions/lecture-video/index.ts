import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { actingUserId } from "../_shared/internalAuth.ts";

/**
 * AI avatar lecture videos (one per module).
 *
 * Actions (POST { action, ... }):
 *   options      -> presenters and voices to choose from
 *   draft        -> write the spoken script for a module from its lessons
 *   save_script  -> save the teacher's edits to a draft part
 *   render       -> send the approved script to the avatar service
 *   sync         -> check rendering videos; save finished ones as lessons
 *   discard      -> delete parts that are not finished videos
 *
 * Secrets: HEYGEN_API_KEY (avatar videos), ANTHROPIC_API_KEY (script writing).
 * Optional: LECTURE_VIDEO_TOKENS_PER_PART (org tokens charged per video part, default 60).
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const HEYGEN_BASE = "https://api.heygen.com";
// The avatar service accepts at most 5,000 characters of script per video.
const MAX_PART_CHARS = 4800;
const MAX_PARTS = 2;
const SCRIPT_TOKEN_COST = 5;
const VIDEO_BUCKET = "course-videos";
const STALE_SAVING_MS = 10 * 60 * 1000;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

class UserError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/** Split text into pieces of at most `max` characters, breaking at sentence ends. */
function splitAtSentences(text: string, max: number): string[] {
  const clean = text.replace(/\s+\n/g, "\n").trim();
  if (clean.length <= max) return [clean];
  const sentences = clean.match(/[^.!?\n]+[.!?]*\s*/g) ?? [clean];
  const parts: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if (current.length + sentence.length > max && current) {
      parts.push(current.trim());
      current = "";
    }
    // A single sentence longer than the limit is cut hard as a last resort.
    current += sentence.length > max ? sentence.slice(0, max) : sentence;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

// ─── Avatar service (HeyGen v3) ─────────────────────────────────────────────

async function heygen(path: string, init: RequestInit = {}, extraHeaders: Record<string, string> = {}) {
  const apiKey = Deno.env.get("HEYGEN_API_KEY");
  if (!apiKey) {
    throw new UserError("Avatar videos are not set up yet. An administrator needs to add the HEYGEN_API_KEY secret.", 503);
  }
  let res: Response;
  try {
    res = await fetch(`${HEYGEN_BASE}${path}`, {
      ...init,
      headers: { "X-Api-Key": apiKey, "Content-Type": "application/json", ...extraHeaders },
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err) {
    console.error("HeyGen request failed:", err instanceof Error ? err.message : err);
    throw new UserError("The avatar video service did not respond. Please try again in a minute.", 504);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const code = body?.error?.code ?? "";
    console.error(`HeyGen ${path} -> ${res.status} ${code}: ${body?.error?.message ?? ""}`);
    if (res.status === 401 || res.status === 403) {
      throw new UserError("The avatar video service rejected the API key. An administrator needs to check HEYGEN_API_KEY.", 502);
    }
    if (res.status === 402) {
      throw new UserError("The avatar video account is out of credit. An administrator needs to top it up.", 402);
    }
    if (res.status === 429) {
      throw new UserError("The avatar video service is busy. Please try again in a minute.", 503);
    }
    if (code === "content_policy_violation") {
      throw new UserError("The avatar video service declined this script under its content rules. Please edit the script and try again.", 422);
    }
    if (res.status === 400) {
      throw new UserError(`The avatar video service could not use this request: ${String(body?.error?.message ?? "invalid request").slice(0, 200)}`, 400);
    }
    throw new UserError("The avatar video service had a problem. Please try again in a minute.", 502);
  }
  return body;
}

// ─── Access ─────────────────────────────────────────────────────────────────

async function loadSectionForStaff(admin: Admin, userId: string, sectionId: string) {
  if (!sectionId) throw new UserError("section_id is required");
  const { data: section } = await admin
    .from("sections").select("id, title, course_id").eq("id", sectionId).maybeSingle();
  if (!section) throw new UserError("Module not found", 404);

  const [{ data: course }, { data: profile }] = await Promise.all([
    admin.from("courses").select("id, title, level, teacher_id, org_id, ai_plan").eq("id", section.course_id).maybeSingle(),
    admin.from("profiles").select("role").eq("id", userId).maybeSingle(),
  ]);
  if (!course || !profile) throw new UserError("Course not found", 404);

  let allowed = profile.role === "admin" || course.teacher_id === userId;
  let orgId: string | null = null;
  const { data: membership } = await admin
    .from("org_members").select("org_id").eq("user_id", userId).maybeSingle();
  if (membership) {
    orgId = membership.org_id;
    if (profile.role === "org_admin" && course.org_id && course.org_id === membership.org_id) allowed = true;
  }
  if (!allowed) throw new UserError("You do not have permission to manage this course.", 403);
  return { section, course, orgId };
}

/** Fails early, before any AI or video cost is incurred, when the organisation cannot pay. */
async function ensureOrgBalance(admin: Admin, orgId: string | null, tokens: number) {
  if (!orgId || tokens <= 0) return;
  const { data: org } = await admin.from("organizations").select("token_balance, is_active").eq("id", orgId).maybeSingle();
  if (!org?.is_active) throw new UserError("Your organisation is inactive. Contact your administrator.", 403);
  if ((org.token_balance ?? 0) < tokens) {
    throw new UserError(`Not enough tokens. This needs ${tokens} tokens and your organisation has ${org.token_balance ?? 0}.`, 402);
  }
}

async function loadCourseForStaff(admin: Admin, userId: string, courseId: string) {
  if (!courseId) throw new UserError("course_id is required");
  const { data: firstSection } = await admin.from("sections").select("id").eq("course_id", courseId).limit(1).maybeSingle();
  if (!firstSection) return { sectionIds: [] as string[] };
  await loadSectionForStaff(admin, userId, firstSection.id);
  const { data: all } = await admin.from("sections").select("id").eq("course_id", courseId).order("order_index");
  return { sectionIds: (all ?? []).map((r: { id: string }) => r.id) };
}

async function chargeOrgTokens(admin: Admin, orgId: string | null, userId: string, task: string, tokens: number) {
  if (!orgId || tokens <= 0) return;
  const { data: ok, error } = await admin.rpc("deduct_org_tokens", {
    p_org_id: orgId, p_user_id: userId, p_ai_task: task, p_tokens: tokens,
  });
  if (error) {
    console.error("token charge failed:", error.message);
    throw new UserError("Could not check your organisation's token balance. Please try again.", 500);
  }
  if (!ok) throw new UserError(`Not enough tokens. This needs ${tokens} tokens.`, 402);
}

// ─── Script writing ─────────────────────────────────────────────────────────

async function writeScript(
  courseTitle: string,
  level: string,
  sectionTitle: string,
  lessons: Array<{ title: string; text: string }>,
  plan: Record<string, unknown> | null = null,
) {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new UserError("AI is not set up yet. An administrator needs to add the ANTHROPIC_API_KEY secret.", 503);

  const system = `You write the spoken script for a video lecture delivered by an on-screen presenter.
Return ONLY valid JSON: {"parts": [string, ...]}. No markdown fences, no text outside the JSON.

Rules:
- Teach every key concept of the module, in the order of the lessons provided. Use only what the lesson material supports; do not invent facts, figures or sources.
- This is speech, not a document: plain sentences a person would say aloud. No headings, bullet points, markdown, emojis, stage directions, or text in brackets.
- Explain each concept clearly with a short example, then connect it to the next one.
- Open by greeting the students and saying what the module covers. Close with a brief recap and what to do next.
- Write numbers, symbols and abbreviations the way they should be spoken.
- Length: 700 to 1300 words in total, depending on how much material there is.
- Use one part if the script is under 4000 characters. Otherwise use exactly two parts of similar length, splitting between concepts; the second part should begin by briefly picking up where the first ended. Each part must be under 4200 characters.`;

  const material = lessons
    .map((l, i) => `Lesson ${i + 1}: ${l.title}\n${l.text || "(no written content; cover it briefly from the title)"}`)
    .join("\n\n");
  const brief = (plan?.brief ?? null) as Record<string, unknown> | null;
  const planLines = brief
    ? [
        ["Learners", [brief.audience, brief.starting_level].filter(Boolean).join(", ")],
        ["What they are working towards", brief.outcome],
        ["Tone", brief.tone],
        ["Approach", brief.approach],
      ].filter(([, v]) => v && String(v).trim()).map(([k, v]) => `${k}: ${String(v).slice(0, 300)}`).join("\n")
    : "";
  const user = `Course: ${courseTitle}\nLevel: ${level || "general"}\nModule: ${sectionTitle}${planLines ? `\n\nWho this course is for (speak to them directly):\n${planLines}` : ""}\n\nLesson material:\n${material}`;

  let res: Response;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 5000,
        system,
        messages: [{ role: "user", content: user }],
      }),
      signal: AbortSignal.timeout(120_000),
    });
  } catch {
    throw new UserError("The AI took too long to write the script. Please try again.", 504);
  }
  if (!res.ok) {
    console.error("Anthropic error", res.status, (await res.text()).slice(0, 300));
    throw new UserError(
      [429, 500, 502, 503, 529].includes(res.status)
        ? "The AI service is busy right now. Please try again in a minute."
        : "The AI could not write the script. Please try again.",
      503,
    );
  }
  const data = await res.json() as { content: Array<{ type: string; text?: string }>; stop_reason?: string };
  if (data.stop_reason === "max_tokens") {
    throw new UserError("This module has too much material for one lecture script. Try a module with fewer lessons.", 422);
  }
  const text = data.content.find((c) => c.type === "text")?.text ?? "";
  const match = text.match(/\{[\s\S]*\}/);
  let parts: string[] = [];
  try {
    const parsed = JSON.parse(match ? match[0] : text) as { parts?: unknown };
    if (Array.isArray(parsed.parts)) parts = parsed.parts.map((p) => String(p ?? "").trim()).filter(Boolean);
  } catch { /* handled below */ }
  if (parts.length === 0) throw new UserError("The AI returned an unusable script. Please try again.", 502);

  // Enforce the service's per-video limit whatever the model returned.
  const fitted = parts.flatMap((p) => splitAtSentences(p, MAX_PART_CHARS)).slice(0, MAX_PARTS);
  return fitted;
}

// ─── Actions ────────────────────────────────────────────────────────────────

const BASE_FIELDS = "id, section_id, course_id, part_index, part_count, title, script, status, avatar_id, voice_id, lesson_id, duration_seconds, error_message, updated_at";
const ROW_FIELDS = `${BASE_FIELDS}, board`;

const SETUP_MESSAGE = "Lecture videos are not set up in the database yet. An administrator needs to run database update 055 (lecture videos) in Supabase, then try again.";

/** Database errors that mean the lecture_videos table (or a column) is missing. */
function isMissingSchema(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return ["42P01", "42703", "PGRST204", "PGRST205"].includes(String(error.code ?? ""))
    || /does not exist|could not find the (table|column)/i.test(String(error.message ?? ""));
}

/** Lecture rows with their boards; without the boards if database update 059 has not been run yet. */
async function selectRows(admin: Admin, column: "section_id" | "course_id", id: string) {
  let { data, error } = await admin.from("lecture_videos").select(ROW_FIELDS).eq(column, id).order("part_index");
  if (error && /board/i.test(String(error.message ?? ""))) {
    ({ data, error } = await admin.from("lecture_videos").select(BASE_FIELDS).eq(column, id).order("part_index"));
  }
  if (isMissingSchema(error)) throw new UserError(SETUP_MESSAGE, 503);
  if (error) throw new UserError("Could not load the lectures. Please try again.", 500);
  return data ?? [];
}

async function listRows(admin: Admin, sectionId: string) {
  return await selectRows(admin, "section_id", sectionId);
}

// ─── Live board ─────────────────────────────────────────────────────────────
// What appears next to the presenter while a lecture plays: the code being typed and
// what it prints, or the key points. Each step is pinned to the words in the script
// where it should appear; the player turns that into a time in the video.

const BOARD_TOKEN_COST = 3;

export interface BoardStep {
  at: number;
  kind: "code" | "points" | "title";
  title?: string;
  language?: string;
  code?: string;
  output?: string;
  points?: string[];
}
export interface Board { total_words: number; steps: BoardStep[] }

const words = (text: string) => text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);

/** Index of the first occurrence of `needle` in `hay` at or after `from`, or -1. */
function findWords(hay: string[], needle: string[], from: number): number {
  if (needle.length === 0) return -1;
  for (let i = Math.max(0, from); i + needle.length <= hay.length; i++) {
    let ok = true;
    for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) { ok = false; break; }
    if (ok) return i;
  }
  return -1;
}

/** Reads the board format (see writeBoard) and pins each step to a word in the script. */
export function parseBoard(text: string, script: string): Board | null {
  const scriptWords = words(script);
  if (scriptWords.length === 0) return null;
  const chunks = text.replace(/^\s*```\w*\s*/, "").replace(/\s*```\s*$/, "").split(/^\s*===\s*STEP\s*$/m).slice(1);
  const raw: Array<Omit<BoardStep, "at"> & { anchor: string }> = [];
  for (const chunk of chunks) {
    const [head, ...rest] = chunk.split(/^\s*---\s*(?=CODE|OUTPUT|POINTS)/m);
    const field = (name: string) => new RegExp(`^\\s*${name}:\\s*(.+)$`, "mi").exec(head)?.[1]?.trim() ?? "";
    const parts = new Map<string, string>();
    for (const sec of rest) {
      const nl = sec.indexOf("\n");
      parts.set(sec.slice(0, nl < 0 ? undefined : nl).trim().toUpperCase(), nl < 0 ? "" : sec.slice(nl + 1).replace(/\s+$/, ""));
    }
    const kind = field("KIND").toLowerCase();
    const anchor = field("AT");
    if (!anchor) continue;
    if (kind === "code" && parts.get("CODE")?.trim()) {
      raw.push({ anchor, kind: "code", title: field("TITLE").slice(0, 60), language: field("LANGUAGE").toLowerCase().slice(0, 20) || "text",
        code: parts.get("CODE")!.replace(/^\n+/, "").slice(0, 1500), output: (parts.get("OUTPUT") ?? "").trim().slice(0, 800) || undefined });
    } else if (kind === "points") {
      const points = (parts.get("POINTS") ?? "").split("\n").map(l => l.replace(/^\s*[-*•]\s*/, "").trim()).filter(Boolean).slice(0, 6);
      if (points.length) raw.push({ anchor, kind: "points", title: field("TITLE").slice(0, 80), points: points.map(x => x.slice(0, 120)) });
    } else if (kind === "title" && field("TITLE")) {
      raw.push({ anchor, kind: "title", title: field("TITLE").slice(0, 80) });
    }
  }
  // Pin to the script in order; a step whose words are not found goes between its neighbours
  let from = 0;
  const placed: Array<number | null> = raw.map(step => {
    const w = words(step.anchor);
    for (const n of [w.length, 6, 4, 3]) {
      const i = findWords(scriptWords, w.slice(0, Math.min(n, w.length)), from);
      if (i >= 0) { from = i + 1; return i; }
    }
    return null;
  });
  const steps: BoardStep[] = [];
  raw.forEach((step, i) => {
    let at = placed[i];
    if (at === null) {
      const prev = placed.slice(0, i).reverse().find(x => x !== null) ?? 0;
      const next = placed.slice(i + 1).find(x => x !== null) ?? scriptWords.length;
      at = Math.round((prev + next) / 2);
    }
    const last = steps[steps.length - 1]?.at ?? -1;
    const { anchor: _anchor, ...rest } = step;
    steps.push({ ...rest, at: Math.max(at, last + 1) } as BoardStep);
  });
  return steps.length >= 2 ? { total_words: scriptWords.length, steps } : null;
}

async function writeBoard(courseTitle: string, sectionTitle: string, script: string, notes: string): Promise<Board> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new UserError("AI is not set up yet. An administrator needs to add the ANTHROPIC_API_KEY secret.", 503);
  const system = `You design the live board shown next to a video lecture. While the presenter speaks, the board shows the code being typed and what it prints, or the key points when there is no code.
Write the board in exactly this plain-text format, with nothing before or after it (no JSON, no markdown fences):
=== STEP
AT: 6 to 10 consecutive words copied exactly from the script, where this step should appear
KIND: code
TITLE: a short file name or label, e.g. inspect_data.py
LANGUAGE: python
--- CODE
the code, as it would be typed
--- OUTPUT
what running it prints (leave this part out when nothing is printed)
=== STEP
AT: ...
KIND: points
TITLE: a short heading
--- POINTS
- a short point
- another point
Rules:
- 5 to 12 steps, in the order of the script. AT must be copied word for word from the script, at the moment the presenter starts talking about that step.
- Code: real, correct, runnable code for exactly what the presenter explains. The script says code out loud ("pd dot read underscore csv"); write it properly (pd.read_csv). At most 12 lines per step. Build on earlier steps the way a teacher would type in one session.
- Output: realistic and consistent with the code and any data it uses. Keep it short.
- Use the lesson notes for exact names and code when they cover the topic.
- Points: for ideas without code, 2 to 5 points of at most 10 words each.
- KIND title: an optional heading step at a major change of topic (TITLE only).
- For subjects without code, use points, and code steps with LANGUAGE text for formulas, calculations or worked examples.
- Never add facts the script and notes do not support.`;
  const user = `Course: ${courseTitle}\nModule: ${sectionTitle}\n\nScript the presenter says:\n${script.slice(0, 6000)}${notes ? `\n\nLesson notes (for exact code and names):\n${notes.slice(0, 8000)}` : ""}`;
  let res: Response;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 4000, temperature: 0.3, system, messages: [{ role: "user", content: user }] }),
      signal: AbortSignal.timeout(110_000),
    });
  } catch {
    throw new UserError("The AI took too long to design the board. Please try again.", 504);
  }
  if (!res.ok) {
    console.error("Anthropic error", res.status, (await res.text()).slice(0, 300));
    throw new UserError([429, 500, 502, 503, 529].includes(res.status)
      ? "The AI service is busy right now. Please try again in a minute."
      : "The AI could not design the board. Please try again.", 503);
  }
  const data = await res.json() as { content: Array<{ type: string; text?: string }> };
  const board = parseBoard(data.content.find(c => c.type === "text")?.text ?? "", script);
  if (!board) throw new UserError("The AI returned an unusable board. Please try again.", 502);
  return board;
}

/** Shows the board on the lecture's lesson, once the video has become a lesson. */
async function publishBoard(admin: Admin, row: { lesson_id?: string | null; course_id: string; status?: string }, board: Board | null) {
  if (!board || !row.lesson_id) return;
  const { error } = await admin.from("lesson_boards").upsert({
    lesson_id: row.lesson_id, course_id: row.course_id, board, updated_at: new Date().toISOString(),
  });
  if (error) console.error("board publish failed:", error.code, error.message);
}

async function actionBoard(admin: Admin, userId: string, sectionId: string) {
  const { section, course, orgId } = await loadSectionForStaff(admin, userId, sectionId);
  const rows = (await listRows(admin, sectionId)).filter((r: { script: string }) => String(r.script ?? "").trim().length > 50);
  if (rows.length === 0) throw new UserError("Write this module's lecture script first.");
  const { data: lessons } = await admin.from("lessons").select("id, content").eq("section_id", sectionId).order("order_index");
  const lectureLessons = new Set(rows.map((r: { lesson_id: string | null }) => r.lesson_id).filter(Boolean));
  const notes = (lessons ?? []).filter((l: { id: string }) => !lectureLessons.has(l.id))
    .map((l: { content: string | null }) => htmlToText(String(l.content ?? ""))).join("\n\n").slice(0, 8000);
  await ensureOrgBalance(admin, orgId, BOARD_TOKEN_COST * rows.length);
  for (const row of rows) {
    const board = await writeBoard(course.title, section.title, row.script, notes);
    await chargeOrgTokens(admin, orgId, userId, "lecture_board", BOARD_TOKEN_COST);
    const { error } = await admin.from("lecture_videos").update({ board }).eq("id", row.id);
    if (error) {
      console.error("board save failed:", error.code, error.message);
      throw new UserError(isMissingSchema(error)
        ? "Live boards are not set up in the database yet. An administrator needs to run database update 059 (lecture boards)."
        : "Could not save the board. Please try again.", isMissingSchema(error) ? 503 : 500);
    }
    if (row.status === "ready") await publishBoard(admin, row, board);
  }
  return { parts: await listRows(admin, sectionId) };
}

async function actionOptions() {
  const [looks, voices] = await Promise.all([
    heygen("/v3/avatars/looks?ownership=public&limit=50"),
    heygen("/v3/models/audio/voices?type=public&language=en&limit=50"),
  ]);
  return {
    avatars: (looks?.data ?? []).map((a: Record<string, unknown>) => ({
      id: a.id, name: a.name, gender: a.gender ?? null, preview_image_url: a.preview_image_url ?? null,
      default_voice_id: a.default_voice_id ?? null,
    })),
    voices: (voices?.data ?? []).map((v: Record<string, unknown>) => ({
      id: v.voice_id, name: v.name, gender: v.gender ?? null, language: v.language ?? null,
      locale: v.locale ?? null, preview_audio_url: v.preview_audio_url ?? null,
    })),
  };
}

async function actionDraft(admin: Admin, userId: string, sectionId: string) {
  const { section, course, orgId } = await loadSectionForStaff(admin, userId, sectionId);

  const existing = await listRows(admin, sectionId);
  if (existing.some((r: { status: string }) => r.status === "rendering" || r.status === "saving")) {
    throw new UserError("A lecture video for this module is still being made. Please wait for it to finish.", 409);
  }

  const { data: lessons } = await admin
    .from("lessons").select("id, title, content, description, order_index").eq("section_id", sectionId).order("order_index");
  const generatedLessonIds = new Set(existing.map((r: { lesson_id: string | null }) => r.lesson_id).filter(Boolean));
  const source = (lessons ?? []).filter((l: { id: string }) => !generatedLessonIds.has(l.id));
  if (source.length === 0) throw new UserError("Add at least one lesson to this module before creating its lecture.");

  // Share a fixed amount of source text between the lessons so the request stays small.
  const perLesson = Math.max(600, Math.floor(24000 / source.length));
  const material = source.map((l: { title: string; content: string | null; description: string | null }) => ({
    title: l.title,
    text: htmlToText(String(l.content || l.description || "")).slice(0, perLesson),
  }));

  await ensureOrgBalance(admin, orgId, SCRIPT_TOKEN_COST);
  const parts = await writeScript(course.title, course.level ?? "", section.title, material, course.ai_plan ?? null);
  await chargeOrgTokens(admin, orgId, userId, "lecture_script", SCRIPT_TOKEN_COST);

  // Replace earlier drafts / failed attempts; keep the lessons of finished videos until re-rendered.
  const { error: clearError } = await admin.from("lecture_videos").delete().eq("section_id", sectionId);
  if (clearError) {
    console.error("draft clear failed:", clearError.code, clearError.message);
    throw new UserError(`Could not replace the earlier script (database error ${clearError.code ?? "unknown"}). Please try again.`, 500);
  }
  const rows = parts.map((script, i) => ({
    course_id: course.id,
    section_id: sectionId,
    part_index: i,
    part_count: parts.length,
    title: parts.length > 1 ? `AI lecture: ${section.title} (part ${i + 1} of ${parts.length})` : `AI lecture: ${section.title}`,
    script,
    status: "draft",
    lesson_id: existing[i]?.lesson_id ?? null,
    created_by: userId,
  }));
  const { error } = await admin.from("lecture_videos").insert(rows);
  if (error) {
    console.error("draft insert failed:", error.code, error.message);
    if (isMissingSchema(error)) throw new UserError(SETUP_MESSAGE, 503);
    throw new UserError(`Could not save the script (database error ${error.code ?? "unknown"}). Please try again.`, 500);
  }
  return { parts: await listRows(admin, sectionId) };
}

async function actionSaveScript(admin: Admin, userId: string, id: string, script: string) {
  const text = String(script ?? "").trim();
  if (!id) throw new UserError("id is required");
  if (text.length < 50) throw new UserError("The script is too short.");
  if (text.length > MAX_PART_CHARS) {
    throw new UserError(`Each part can be at most ${MAX_PART_CHARS} characters (the avatar service's limit). This one has ${text.length}.`);
  }
  const { data: row } = await admin.from("lecture_videos").select("id, section_id, status").eq("id", id).maybeSingle();
  if (!row) throw new UserError("Script not found", 404);
  await loadSectionForStaff(admin, userId, row.section_id);
  if (row.status !== "draft" && row.status !== "failed") {
    throw new UserError("This script can no longer be edited because its video has been made.", 409);
  }
  await admin.from("lecture_videos").update({ script: text, status: "draft", error_message: null }).eq("id", id);
  return { parts: await listRows(admin, row.section_id) };
}

// ─── Choosing the voice engine ──────────────────────────────────────────────
// HeyGen asks every video to name a voice engine that supports the script's language
// (GET /v3/videos/voice-capabilities). Left out, it picks one itself and the video can be
// rejected or fail later. We read the list, prefer HeyGen's own voice engine for English
// in the voice's natural accent, and fall back to the next engine if one is refused.

interface EngineChoice { engine_type: string; model?: string; locale?: string }
const ENGINE_ORDER = ["heygen_voice", "elevenlabs", "fish", "cartesia", "starfish", "mockingbird"];
const PREFERRED_MODEL: Record<string, string> = {
  heygen_voice: "heygen-voice-1", elevenlabs: "eleven_multilingual_v2", fish: "s2.1-pro", cartesia: "sonic-3.6",
};

async function englishEngineChoices(): Promise<EngineChoice[]> {
  type Row = { language?: string; locale?: string | null; engines?: Array<{ engine?: string; models?: string[] }> };
  let rows: Row[] = [];
  try {
    const caps = await heygen("/v3/videos/voice-capabilities");
    rows = Array.isArray(caps?.data?.capabilities) ? caps.data.capabilities : [];
  } catch (err) {
    console.error("voice-capabilities failed:", err instanceof Error ? err.message : err);
    return [];
  }
  const english = rows.filter(r => /^(en|eng|english)\b/i.test(String(r.language ?? "")));
  // Natural accent first; an engine that needs a regional accent gets US English.
  const original = english.filter(r => r.locale == null);
  const us = english.filter(r => String(r.locale ?? "").toLowerCase() === "en-us");
  const known = new Set(english.flatMap(r => (r.engines ?? []).map(e => String(e.engine))));
  const order = [...ENGINE_ORDER.filter(e => known.has(e)), ...[...known].filter(e => !ENGINE_ORDER.includes(e))];
  const choices: EngineChoice[] = [];
  for (const engine of order) {
    for (const [group, locale] of [[original, undefined], [us, "en-US"]] as Array<[Row[], string | undefined]>) {
      const entry = group.flatMap(r => r.engines ?? []).find(e => e.engine === engine);
      if (!entry) continue;
      const models = Array.isArray(entry.models) ? entry.models : [];
      const model = models.length ? (models.includes(PREFERRED_MODEL[engine]) ? PREFERRED_MODEL[engine] : models[0]) : undefined;
      choices.push({ engine_type: engine, ...(model ? { model } : {}), ...(locale ? { locale } : {}) });
      break;
    }
  }
  return choices;
}

async function actionRender(admin: Admin, userId: string, sectionId: string, avatarId: string, voiceId: string) {
  if (!avatarId || !voiceId) throw new UserError("Choose a presenter and a voice first.");
  const { orgId } = await loadSectionForStaff(admin, userId, sectionId);

  const rows = (await listRows(admin, sectionId)).filter((r: { status: string }) => r.status === "draft" || r.status === "failed");
  if (rows.length === 0) throw new UserError("There is no approved script waiting to be made into a video.");

  const perPart = Math.max(0, parseInt(Deno.env.get("LECTURE_VIDEO_TOKENS_PER_PART") ?? "60", 10) || 0);
  await ensureOrgBalance(admin, orgId, perPart * rows.length);

  // Engines to try, best first; null = let HeyGen choose (only when the list is unavailable)
  const engineChoices = await englishEngineChoices();
  let candidates: Array<EngineChoice | null> = engineChoices.length ? engineChoices : [null];

  for (const row of rows) {
    try {
      let created: Record<string, any> | null = null;
      let lastError: unknown = null;
      for (const choice of candidates) {
        try {
          created = await heygen("/v3/videos", {
            method: "POST",
            body: JSON.stringify({
              type: "avatar",
              avatar_id: avatarId,
              voice_id: voiceId,
              script: row.script,
              title: row.title,
              resolution: "720p",
              aspect_ratio: "16:9",
              callback_id: row.id,
              ...(choice ? {
                voice_settings: {
                  ...(choice.locale ? { locale: choice.locale } : {}),
                  engine_settings: { engine_type: choice.engine_type, ...(choice.model ? { model: choice.model } : {}) },
                },
              } : {}),
            }),
            // A retried request for the same script version and engine must not start (and bill) a second render.
          }, { "Idempotency-Key": `lecture-${row.id}-${new Date(row.updated_at).getTime()}-${choice?.engine_type ?? "auto"}` });
          // Use the engine that worked first for the remaining parts
          if (choice) candidates = [choice, ...candidates.filter(c => c !== choice)];
          break;
        } catch (err) {
          lastError = err;
          // Only a refused request (this voice, engine or language combination) is worth another engine
          if (!(err instanceof UserError) || err.status !== 400) break;
          console.warn(`engine ${choice?.engine_type ?? "auto"} refused:`, err.message);
        }
      }
      if (!created) throw lastError ?? new UserError("Could not start the video.", 502);
      const videoId = created?.data?.video_id;
      if (!videoId) throw new UserError("The avatar video service did not return a video id.", 502);
      await admin.from("lecture_videos").update({
        status: "rendering", provider_video_id: videoId, avatar_id: avatarId, voice_id: voiceId, error_message: null,
      }).eq("id", row.id);
      // Charged only for parts the service accepted.
      await chargeOrgTokens(admin, orgId, userId, "lecture_video", perPart).catch(() => {});
    } catch (err) {
      const message = err instanceof UserError ? err.message : "Could not start the video.";
      await admin.from("lecture_videos").update({ status: "failed", error_message: message }).eq("id", row.id);
    }
  }
  return { parts: await listRows(admin, sectionId) };
}

async function saveFinishedVideo(admin: Admin, row: Record<string, unknown>, detail: Record<string, unknown>) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const path = `${row.course_id}/lecture-${row.id}.mp4`;

  // Stream straight from the avatar service into private course storage (the service's
  // download link expires, and the file is too large to hold in memory).
  const source = await fetch(String(detail.video_url), { signal: AbortSignal.timeout(110_000) });
  if (!source.ok || !source.body) throw new Error(`download failed (${source.status})`);
  // "duplex" is required by Deno for a streamed request body but is missing from the type.
  const uploadInit: RequestInit & { duplex: "half" } = {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      "Content-Type": "video/mp4",
      "x-upsert": "true",
    },
    body: source.body,
    duplex: "half",
  };
  const upload = await fetch(`${supabaseUrl}/storage/v1/object/${VIDEO_BUCKET}/${path}`, uploadInit);
  if (!upload.ok) throw new Error(`storage upload failed (${upload.status}): ${(await upload.text()).slice(0, 200)}`);

  const url = `${supabaseUrl}/storage/v1/object/public/${VIDEO_BUCKET}/${path}`;
  const durationSeconds = Math.round(Number(detail.duration) || 0);
  const lessonFields = {
    title: row.title,
    description: "Lecture presented by an AI-generated avatar, based on this module's lessons.",
    type: "video",
    lesson_type: "video",
    url,
    video_url: url,
    video_storage_path: path,
    duration_minutes: Math.max(1, Math.ceil(durationSeconds / 60)),
  };

  let lessonId = row.lesson_id as string | null;
  if (lessonId) {
    const { data: updated } = await admin.from("lessons").update(lessonFields).eq("id", lessonId).select("id").maybeSingle();
    if (!updated) lessonId = null; // the lesson was deleted in the meantime
  }
  if (!lessonId) {
    // Place the lecture at the top of the module, parts in order.
    const { data: first } = await admin
      .from("lessons").select("order_index").eq("section_id", row.section_id).order("order_index").limit(1).maybeSingle();
    const top = Number(first?.order_index ?? 0);
    const { data: inserted, error } = await admin.from("lessons").insert({
      ...lessonFields,
      section_id: row.section_id,
      course_id: row.course_id,
      order_index: top - (Number(row.part_count) - Number(row.part_index)),
      is_preview: false,
      is_required: false,
    }).select("id").single();
    if (error) throw new Error(`lesson insert failed: ${error.message}`);
    lessonId = inserted.id;
  }

  // A board made from the script before the video was finished goes onto the new lesson
  const { data: withBoard, error: boardError } = await admin.from("lecture_videos").select("board").eq("id", row.id).maybeSingle();
  if (!boardError) await publishBoard(admin, { lesson_id: lessonId, course_id: String(row.course_id) }, (withBoard?.board ?? null) as Board | null);

  await admin.from("lecture_videos").update({
    status: "ready", storage_path: path, lesson_id: lessonId, duration_seconds: durationSeconds, error_message: null,
  }).eq("id", row.id);
}

async function actionSync(admin: Admin, userId: string, sectionId: string, deadline = Date.now() + 120_000, checked = false) {
  if (!checked) await loadSectionForStaff(admin, userId, sectionId);
  const { data: rows } = await admin
    .from("lecture_videos").select("*").eq("section_id", sectionId).in("status", ["rendering", "saving"]);

  for (const row of rows ?? []) {
    // Copying a finished video can take a while; leave the rest for the next check.
    if (Date.now() > deadline) break;
    if (row.status === "saving" && Date.now() - new Date(row.updated_at).getTime() < STALE_SAVING_MS) continue;
    if (!row.provider_video_id) continue;

    let detail: Record<string, unknown>;
    try {
      detail = (await heygen(`/v3/videos/${row.provider_video_id}`, { method: "GET" }))?.data ?? {};
    } catch {
      continue; // temporary problem: try again on the next check
    }

    if (detail.status === "failed") {
      await admin.from("lecture_videos").update({
        status: "failed",
        error_message: `The avatar service could not make this video${detail.failure_message ? `: ${String(detail.failure_message).slice(0, 200)}` : "."}`,
      }).eq("id", row.id);
      continue;
    }
    if (detail.status !== "completed" || !detail.video_url) continue;

    // Claim the row so two browser tabs checking at once do not both copy the file.
    const { data: claimed } = await admin
      .from("lecture_videos").update({ status: "saving" }).eq("id", row.id).eq("status", row.status).eq("updated_at", row.updated_at)
      .select("id").maybeSingle();
    if (!claimed) continue;

    try {
      await saveFinishedVideo(admin, row, detail);
    } catch (err) {
      console.error("saving lecture video failed:", err instanceof Error ? err.message : err);
      // Back to "rendering" so the next check retries the copy; the render itself is not repeated.
      await admin.from("lecture_videos").update({ status: "rendering" }).eq("id", row.id);
    }
  }
  return { parts: await listRows(admin, sectionId) };
}

/** Lecture status for every module of a course; finishes any videos that are ready. */
async function actionCourseStatus(admin: Admin, userId: string, courseId: string) {
  const { sectionIds } = await loadCourseForStaff(admin, userId, courseId);
  if (sectionIds.length === 0) return { parts: [] };
  const { data: active, error: activeError } = await admin
    .from("lecture_videos").select("section_id").eq("course_id", courseId).in("status", ["rendering", "saving"]);
  if (isMissingSchema(activeError)) throw new UserError(SETUP_MESSAGE, 503);
  const deadline = Date.now() + 100_000;
  for (const sectionId of new Set((active ?? []).map((r: { section_id: string }) => r.section_id))) {
    if (Date.now() > deadline) break;
    await actionSync(admin, userId, sectionId as string, deadline, true);
  }
  return { parts: await selectRows(admin, "course_id", courseId) };
}

async function actionDiscard(admin: Admin, userId: string, sectionId: string) {
  await loadSectionForStaff(admin, userId, sectionId);
  await admin.from("lecture_videos").delete().eq("section_id", sectionId).in("status", ["draft", "failed"]);
  return { parts: await listRows(admin, sectionId) };
}

// ─── Handler ────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    // The course-build worker calls with the service role key on a teacher's behalf;
    // the teacher's role and access to the course are still checked below.
    const actingFor = actingUserId(req);
    const user = actingFor ? { id: actingFor } : (await admin.auth.getUser(authHeader.replace("Bearer ", ""))).data.user;
    if (!user) return json({ error: "Unauthorized" }, 401);

    const { data: profile } = await admin.from("profiles").select("role, is_active").eq("id", user.id).maybeSingle();
    if (!profile || profile.is_active === false || !["admin", "teacher", "org_admin"].includes(profile.role)) {
      return json({ error: "Only teachers and administrators can create lecture videos." }, 403);
    }

    const body = await req.json().catch(() => ({})) as Record<string, string>;
    switch (body.action) {
      case "options": return json(await actionOptions());
      case "list": {
        await loadSectionForStaff(admin, user.id, body.section_id);
        return json({ parts: await listRows(admin, body.section_id) });
      }
      case "draft": return json(await actionDraft(admin, user.id, body.section_id));
      case "save_script": return json(await actionSaveScript(admin, user.id, body.id, body.script));
      case "render": return json(await actionRender(admin, user.id, body.section_id, body.avatar_id, body.voice_id));
      case "sync": return json(await actionSync(admin, user.id, body.section_id));
      case "discard": return json(await actionDiscard(admin, user.id, body.section_id));
      case "course_status": return json(await actionCourseStatus(admin, user.id, body.course_id));
      case "board": return json(await actionBoard(admin, user.id, body.section_id));
      default: return json({ error: "Unknown action" }, 400);
    }
  } catch (err) {
    if (err instanceof UserError) return json({ error: err.message }, err.status);
    console.error("lecture-video error:", err instanceof Error ? err.message : err);
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
});
