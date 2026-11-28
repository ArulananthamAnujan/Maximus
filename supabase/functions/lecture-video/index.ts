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
// Each part is its own video lesson of about 5 to 6 minutes
const MAX_PARTS = 4;
// A script that runs a little over is spread over one more video rather than refused
const MAX_PARTS_ALLOWED = 5;
// Words for the whole module's lecture: about 380 per lesson, within these limits
const SCRIPT_WORDS_PER_LESSON = 380;
const SCRIPT_MIN_WORDS = 800;
const SCRIPT_TARGET_MAX_WORDS = 2300;
const SCRIPT_MAX_WORDS = 2600;
// A little slower than normal speech, so new ideas have time to land (HeyGen allows 0.5 to 1.5)
const VOICE_SPEED = Math.min(1.5, Math.max(0.5, Number(Deno.env.get("LECTURE_VOICE_SPEED") ?? "0.9") || 0.9));
const SCRIPT_TOKEN_COST = 5;
const VIDEO_BUCKET = "course-videos";
const STALE_SAVING_MS = 10 * 60 * 1000;
// Marks the lessons this function makes (used to find leftovers from an earlier version)
const LECTURE_LESSON_DESCRIPTION = "Lecture presented by an AI-generated avatar, based on this module's lessons.";

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

  const targetWords = Math.min(SCRIPT_TARGET_MAX_WORDS, Math.max(SCRIPT_MIN_WORDS, lessons.length * SCRIPT_WORDS_PER_LESSON));
  const system = `You write the spoken script for a video lecture delivered by an on-screen presenter.
Write it as plain text in exactly this format, with nothing before or after it (no JSON, no markdown): a line that is exactly === PART, then the words the presenter says in that part; then the next === PART line, and so on.

Rules:
- Teach every key concept of the module, in the order of the lessons provided, as a patient teacher who wants every student to really understand. Use only what the lesson material supports; do not invent facts, figures or sources.
- This is speech, not a document: plain sentences a person would say aloud. No headings, bullet points, markdown, emojis, stage directions, or text in brackets.
- Go slowly. Short sentences, one idea per sentence. Signpost as you go ("First", "Now", "Here is the key point", "Let's look at an example"). Never pack several new terms into one sentence.
- For each concept, in this order:
  1. What it is, in plain words, before any jargon.
  2. Why it matters: a real situation where the student would need it.
  3. How it works, step by step.
  4. A worked example walked through slowly. For code, say what each line does and what it prints or returns, the way you would while typing it in front of the class.
  5. A common mistake or misunderstanding, and how to avoid it.
  6. A one-sentence summary ("So, in one sentence: ...").
- After a hard point, say it again in different words. Now and then ask the students a quick question, give them a moment ("Think about that for a second."), then answer it.
- Open by greeting the students, saying what the module covers and why it is useful. Close with a recap of the main ideas and what to do next (the notes, the activities, then the week's quiz).
- Write numbers, symbols and abbreviations the way they should be spoken.
- Length: about ${targetWords} words in total for this module's ${lessons.length} lesson${lessons.length === 1 ? "" : "s"}, and never more than ${SCRIPT_MAX_WORDS} words. Share the words between the lessons by how much material each has; do not rush any concept, and leave out side details rather than go over.
- Split the script into parts of 3200 to 4200 characters each (one part if the whole script is under 4200 characters), at most 4 parts, splitting between concepts. Each part after the first begins by briefly picking up where the previous one ended. Each part must be under 4200 characters.`;

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

  // The course build waits 145 seconds for this; a second try only fits when the first was quick
  const deadline = Date.now() + 135_000;
  let retryNote = "Important: start each part with a line that is exactly === PART, followed by the words the presenter says.";
  for (let attempt = 1; ; attempt++) {
    let res: Response;
    try {
      res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 8000,
          system,
          messages: [{ role: "user", content: attempt === 1 ? user : `${user}\n\n${retryNote}` }],
        }),
        signal: AbortSignal.timeout(Math.max(30_000, deadline - Date.now())),
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
    const parts = parseScript(text);
    const timeForAnother = attempt < 2 && deadline - Date.now() >= 70_000;
    if (parts.length > 0) {
      try {
        return fitPartsToVideos(parts);
      } catch (err) {
        if (!(err instanceof ScriptTooLong) || !timeForAnother) throw err;
        console.warn(`script too long (attempt ${attempt}): about ${err.words} words`);
        retryNote = `Important: your previous script was about ${err.words} words, which is too long for the videos. Write it again in about ${targetWords} words, and never more than ${SCRIPT_MAX_WORDS}, starting each part with a line that is exactly === PART.`;
        continue;
      }
    }
    console.error(`script unreadable (attempt ${attempt}, ${text.length} chars):`, JSON.stringify(text.slice(0, 500)));
    if (!timeForAnother) {
      throw new UserError("The AI returned an unusable script. Please try again.", 502);
    }
  }
}

// A part starts at a line like "=== PART" (also "=== PART 2 ===", "### Part 2", "**=== PART**")
const PART_LINE = /^[ \t]*(?:\*\*)?[ \t]*(?:={2,}|#{1,6})[ \t]*PART\b.*$/gim;

/** Speech only: drops markdown the presenter would otherwise read out. */
function cleanSpeech(text: string): string {
  return text
    .replace(/^[ \t]*```[\w+-]*[ \t]*$/gm, "")
    .replace(/\*\*|__/g, "")
    .replace(/^[ \t]*#{1,6}[ \t]+/gm, "")
    .replace(/^[ \t]*[-*•][ \t]+/gm, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Reads the script's parts. Plain text with "=== PART" lines; the older JSON answer
 * ({"parts": [...]}) is still read. An answer too short to be a lecture gives no parts.
 */
export function parseScript(text: string): string[] {
  const raw = text.replace(/\r\n?/g, "\n").trim();
  let parts: string[] = [];
  const json = /^(?:```\w*\s*)?\{/.test(raw) ? raw.match(/\{[\s\S]*\}/) : null;
  if (json) {
    // A broken JSON answer is not read as speech (the presenter would say the brackets)
    try {
      const parsed = JSON.parse(json[0]) as { parts?: unknown };
      if (!Array.isArray(parsed.parts)) return [];
      parts = parsed.parts.map((p) => cleanSpeech(String(p ?? ""))).filter(Boolean);
    } catch {
      return [];
    }
  } else {
    const chunks = raw.split(PART_LINE);
    // Text before the first PART line is a remark ("Here is the script"), unless it is clearly speech
    const body = chunks.length > 1 ? [...(chunks[0].trim().length > 300 ? [chunks[0]] : []), ...chunks.slice(1)] : chunks;
    parts = body.map(cleanSpeech).filter(Boolean);
  }
  return parts.join(" ").length >= 400 ? parts : [];
}


/** A script too long for the most videos allowed, even spread evenly. */
class ScriptTooLong extends UserError {
  constructor(public words: number) {
    super(`The script came out too long for the lecture videos (about ${words} words). Please write it again.`, 422);
  }
}

/**
 * Keeps every word of the script while meeting the service's per-video limit: parts that are
 * too long are split at sentences, and if that makes too many videos the script is spread
 * evenly over as few videos as it needs (never silently dropping the end, with its recap).
 */
export function fitPartsToVideos(parts: string[], maxParts = MAX_PARTS_ALLOWED): string[] {
  const split = parts.flatMap((p) => splitAtSentences(p, MAX_PART_CHARS));
  if (split.length <= maxParts) return split;
  const whole = split.join(" ");
  for (let count = Math.ceil(whole.length / MAX_PART_CHARS); count <= maxParts; count++) {
    // Aim for even parts; the greedy split needs a little room for whole sentences
    const target = Math.min(MAX_PART_CHARS, Math.ceil(whole.length / count) + 150);
    const even = splitAtSentences(whole, target);
    if (even.length <= maxParts && even.every((p) => p.length <= MAX_PART_CHARS)) return even;
  }
  throw new ScriptTooLong(whole.split(/\s+/).filter(Boolean).length);
}

// ─── Actions ────────────────────────────────────────────────────────────────

const BASE_FIELDS = "id, section_id, course_id, part_index, part_count, title, script, status, avatar_id, voice_id, lesson_id, storage_path, duration_seconds, error_message, updated_at";
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

// A step starts at a line like "=== STEP" (also "=== STEP 3 ===", "### Step 3", "**=== STEP**").
const STEP_LINE = /^[ \t]*(?:\*\*)?[ \t]*(?:={2,}|#{1,6})[ \t]*STEP\b.*$/gim;
// A part of a step starts at a line like "--- CODE" (also "---CODE:", "--- Output ---").
const SECTION_LINE = /^[ \t]*(?:\*\*)?[ \t]*-{3,}[ \t]*(CODE|OUTPUT|POINTS)\b.*$/i;
const FIELD_LINE = /^[ \t]*(AT|ANCHOR|KIND|TYPE|TITLE|LANGUAGE|LANG)[ \t]*:[ \t]*(.*)$/i;

const unquote = (s: string) => s.trim().replace(/^[`"'“‘]+|[`"'”’]+$/g, "").trim();

/**
 * Reads the board format (see writeBoard) and pins each step to a word in the script.
 * Forgiving about small slips in the format (numbered or bold step lines, fenced code,
 * "KIND: code (python)"); steps that still cannot be read are left out.
 */
export function parseBoard(text: string, script: string): Board | null {
  const scriptWords = words(script);
  if (scriptWords.length === 0) return null;
  const clean = text.replace(/\r\n?/g, "\n").replace(/^[ \t]*```[\w+-]*[ \t]*$/gm, "");
  const chunks = clean.split(STEP_LINE).slice(1);
  const raw: Array<Omit<BoardStep, "at"> & { anchor: string }> = [];
  for (const chunk of chunks) {
    const fields = new Map<string, string>();
    const sections = new Map<string, string[]>();
    let current: string | null = null;
    for (const line of chunk.split("\n")) {
      const sec = SECTION_LINE.exec(line);
      if (sec) { current = sec[1].toUpperCase(); sections.set(current, []); continue; }
      if (current) { sections.get(current)!.push(line); continue; }
      const f = FIELD_LINE.exec(line.replace(/\*\*|__/g, "").replace(/^[ \t]*[-*][ \t]+/, ""));
      if (f) {
        const key = ({ ANCHOR: "AT", TYPE: "KIND", LANG: "LANGUAGE" } as Record<string, string>)[f[1].toUpperCase()] ?? f[1].toUpperCase();
        if (!fields.has(key)) fields.set(key, unquote(f[2]));
      }
    }
    const section = (name: string) => (sections.get(name) ?? []).join("\n").replace(/^\s*\n/, "").replace(/\s+$/, "");
    const code = section("CODE");
    const points = section("POINTS").split("\n")
      .map(l => l.replace(/\*\*/g, "").replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim()).filter(Boolean).slice(0, 6);
    const title = (fields.get("TITLE") ?? "");
    const kindText = (fields.get("KIND") ?? "").toLowerCase();
    let kind: BoardStep["kind"] | null =
      /code|example|calculation|formula/.test(kindText) ? "code"
      : /point|bullet|list|idea/.test(kindText) ? "points"
      : /title|heading|section/.test(kindText) ? "title"
      : code.trim() ? "code" : points.length ? "points" : title ? "title" : null;
    if (kind === "code" && !code.trim()) kind = points.length ? "points" : title ? "title" : null;
    if (kind === "points" && !points.length) kind = code.trim() ? "code" : title ? "title" : null;
    const anchor = fields.get("AT") ?? "";
    if (kind === "code") {
      raw.push({ anchor, kind, title: title.slice(0, 60), language: (fields.get("LANGUAGE") ?? "").toLowerCase().replace(/[^a-z0-9+#-].*$/, "").slice(0, 20) || "text",
        code: code.slice(0, 1500), output: section("OUTPUT").trim().slice(0, 800) || undefined });
    } else if (kind === "points") {
      raw.push({ anchor, kind, title: title.slice(0, 80), points: points.map(x => x.slice(0, 120)) });
    } else if (kind === "title") {
      raw.push({ anchor, kind, title: title.slice(0, 80) });
    }
  }
  // Pin to the script in order; a step whose words are not found goes between its neighbours
  let from = 0;
  const placed: Array<number | null> = raw.map(step => {
    const w = words(step.anchor);
    if (w.length === 0) return null;
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
    steps.push({ ...rest, at: Math.min(scriptWords.length - 1, Math.max(at, last + 1)) } as BoardStep);
  });
  return steps.length >= 1 ? { total_words: scriptWords.length, steps } : null;
}

/** Drops the last, cut-off step of an answer that hit the length limit. */
function dropCutOffStep(text: string): string {
  let last = -1;
  for (const m of text.matchAll(STEP_LINE)) last = m.index ?? last;
  return last > 0 ? text.slice(0, last) : text;
}

const BOARD_SYSTEM = `You design the live board shown next to a video lecture. While the presenter speaks, the board shows the code being typed and what it prints, or the key points when there is no code.
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

/** Designs the board for one part's script, trying a second time if the first answer cannot be read. */
async function writeBoard(courseTitle: string, sectionTitle: string, script: string, notes: string, deadline: number): Promise<Board> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new UserError("AI is not set up yet. An administrator needs to add the ANTHROPIC_API_KEY secret.", 503);
  const user = `Course: ${courseTitle}\nModule: ${sectionTitle}\n\nScript the presenter says:\n${script.slice(0, 6000)}${notes ? `\n\nLesson notes (for exact code and names):\n${notes.slice(0, 8000)}` : ""}`;
  const reminder = "\n\nImportant: your previous answer could not be read. Start every step with a line that is exactly === STEP, then the AT, KIND and TITLE lines, then the --- CODE, --- OUTPUT or --- POINTS parts. Nothing else.";
  for (let attempt = 1; ; attempt++) {
    const timeLeft = deadline - Date.now();
    let res: Response;
    try {
      res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6", max_tokens: 6000, temperature: attempt === 1 ? 0.3 : 0.2, system: BOARD_SYSTEM,
          messages: [{ role: "user", content: attempt === 1 ? user : user + reminder }],
        }),
        signal: AbortSignal.timeout(Math.max(20_000, timeLeft)),
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
    const data = await res.json() as { stop_reason?: string; content: Array<{ type: string; text?: string }> };
    let text = data.content.find(c => c.type === "text")?.text ?? "";
    if (data.stop_reason === "max_tokens") text = dropCutOffStep(text);
    const board = parseBoard(text, script);
    if (board) return board;
    console.error(`board unreadable (attempt ${attempt}, stop ${data.stop_reason}, ${text.length} chars):`, JSON.stringify(text.slice(0, 700)));
    // Try once more if there is time for it within this request
    if (attempt >= 2 || deadline - Date.now() < 45_000) {
      throw new UserError("The AI returned an unusable board. Please try again.", 502);
    }
  }
}

/** Shows the board on the lecture's lesson, once the video has become a lesson. */
async function publishBoard(admin: Admin, row: { lesson_id?: string | null; course_id: string; status?: string }, board: Board | null) {
  if (!board || !row.lesson_id) return;
  const { error } = await admin.from("lesson_boards").upsert({
    lesson_id: row.lesson_id, course_id: row.course_id, board, updated_at: new Date().toISOString(),
  });
  if (error) console.error("board publish failed:", error.code, error.message);
}

/** Designs the board for each part of a module's lecture (only the parts without one when `onlyMissing`). */
async function actionBoard(admin: Admin, userId: string, sectionId: string, onlyMissing = false) {
  const { section, course, orgId } = await loadSectionForStaff(admin, userId, sectionId);
  const withScript = (await listRows(admin, sectionId)).filter((r: { script: string }) => String(r.script ?? "").trim().length > 50);
  if (withScript.length === 0) throw new UserError("Write this module's lecture script first.");
  const rows = onlyMissing
    ? withScript.filter((r: { board?: { steps?: unknown[] } | null }) => !r.board?.steps?.length)
    : withScript;
  if (rows.length === 0) return { parts: await listRows(admin, sectionId) };
  const { data: lessons } = await admin.from("lessons").select("id, content").eq("section_id", sectionId).order("order_index");
  const lectureLessons = new Set(rows.map((r: { lesson_id: string | null }) => r.lesson_id).filter(Boolean));
  const notes = (lessons ?? []).filter((l: { id: string }) => !lectureLessons.has(l.id))
    .map((l: { content: string | null }) => htmlToText(String(l.content ?? ""))).join("\n\n").slice(0, 8000);
  await ensureOrgBalance(admin, orgId, BOARD_TOKEN_COST * rows.length);
  // The parts are designed side by side, within the time the course build waits (145 seconds)
  const deadline = Date.now() + 130_000;
  const results = await Promise.allSettled(rows.map((row: { script: string }) => writeBoard(course.title, section.title, row.script, notes, deadline)));
  // Keep every part that worked, even when another part failed
  for (const [i, result] of results.entries()) {
    if (result.status !== "fulfilled") continue;
    const row = rows[i];
    const board = result.value;
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
  const failed = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
  if (failed) {
    const done = results.length - results.filter(r => r.status === "rejected").length;
    const reason = failed.reason instanceof UserError ? failed.reason.message : "The AI could not design the board. Please try again.";
    throw new UserError(done > 0 ? `${reason} (${done} of ${results.length} parts have a board now.)` : reason,
      failed.reason instanceof UserError ? failed.reason.status : 500);
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
                  ...(VOICE_SPEED !== 1 ? { speed: VOICE_SPEED } : {}),
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

class SaveError extends Error {
  constructor(message: string, public sizeMb = 0) { super(message); }
}

/** Why a finished video could not be copied into course storage, in words a teacher can act on. */
function describeSaveError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  const sizeMb = err instanceof SaveError ? err.sizeMb : 0;
  if (/\(413\)|maximum allowed size|payload too large|entity too large|too large/i.test(message)) {
    return `The presenter service has finished this video, but it${sizeMb ? ` (${sizeMb} MB)` : ""} is larger than your Supabase upload limit, so it cannot be saved yet. In Supabase, go to Storage, Settings, and set "Global file size limit" to 5 GB (it cannot be lower than the course-videos bucket's own 5 GB limit; the free plan allows at most 50 MB). It is then saved automatically, without making the video again.`;
  }
  if (/timeout|timed out|aborted/i.test(message)) {
    return "The presenter service has finished this video, but copying it into your storage took too long. It is tried again automatically.";
  }
  return `The presenter service has finished this video, but saving it failed (${message.slice(0, 160)}). It is tried again automatically.`;
}

async function saveFinishedVideo(admin: Admin, row: Record<string, unknown>, detail: Record<string, unknown>) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const path = `${row.course_id}/lecture-${row.id}.mp4`;

  // Stream straight from the avatar service into private course storage (the service's
  // download link expires, and the file is too large to hold in memory).
  const source = await fetch(String(detail.video_url), { signal: AbortSignal.timeout(110_000) });
  if (!source.ok || !source.body) throw new Error(`download failed (${source.status})`);
  const sizeMb = Math.round((Number(source.headers.get("content-length")) || 0) / 1_048_576);
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
  if (!upload.ok) {
    throw new SaveError(`storage upload failed (${upload.status}): ${(await upload.text()).slice(0, 200)}`, sizeMb);
  }

  const url = `${supabaseUrl}/storage/v1/object/public/${VIDEO_BUCKET}/${path}`;
  const durationSeconds = Math.round(Number(detail.duration) || 0);
  const lessonFields = {
    title: row.title,
    description: LECTURE_LESSON_DESCRIPTION,
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
    const { data: inserted, error } = await admin.from("lessons").insert({
      ...lessonFields,
      section_id: row.section_id,
      course_id: row.course_id,
      order_index: -1000 + Number(row.part_index), // put in its place by arrangeModule below
      is_preview: false,
      // Part of finishing the module, like its other lessons
      is_required: true,
    }).select("id").single();
    if (error) throw new Error(`lesson insert failed: ${error.message}`);
    lessonId = inserted.id;
  }

  // A board made from the script before the video was finished goes onto the new lesson. Without
  // one, a board from the lesson's earlier video (beside it, or recorded into it) no longer fits.
  const { data: withBoard, error: boardError } = await admin.from("lecture_videos").select("board").eq("id", row.id).maybeSingle();
  if (!boardError) {
    const board = (withBoard?.board ?? null) as Board | null;
    if (board?.steps?.length) await publishBoard(admin, { lesson_id: lessonId, course_id: String(row.course_id) }, board);
    else await admin.from("lesson_boards").delete().eq("lesson_id", lessonId);
  }

  await admin.from("lecture_videos").update({
    status: "ready", storage_path: path, lesson_id: lessonId, duration_seconds: durationSeconds, error_message: null,
  }).eq("id", row.id);
  await removeOldLectureLessons(admin, String(row.section_id)).catch((e) => console.error("removing old lecture lessons failed:", e));
  await arrangeModule(admin, String(row.section_id)).catch((e) => console.error("arranging lessons failed:", e));
}

/**
 * Once every part of a rewritten lecture is ready, removes lessons left over from an earlier
 * version that had more parts (they would show an old video next to the new lecture).
 * Only lessons this function made are touched: video lessons with the lecture description.
 */
async function removeOldLectureLessons(admin: Admin, sectionId: string) {
  const { data: rows } = await admin.from("lecture_videos").select("lesson_id, status").eq("section_id", sectionId);
  if (!rows?.length || rows.some((r: { status: string }) => r.status !== "ready")) return;
  const linked = new Set(rows.map((r: { lesson_id: string | null }) => r.lesson_id).filter(Boolean));
  const { data: lessons } = await admin.from("lessons").select("id, type, description").eq("section_id", sectionId);
  const old = (lessons ?? []).filter((l: { id: string; type: string; description: string | null }) =>
    !linked.has(l.id) && l.type === "video" && l.description === LECTURE_LESSON_DESCRIPTION).map((l: { id: string }) => l.id);
  if (old.length === 0) return;
  const { error } = await admin.from("lessons").delete().in("id", old);
  if (error) console.error("old lecture lessons not removed:", error.code, error.message);
}

/**
 * Puts a module's lessons in learning order: the lecture first (its parts in order, however
 * long each took to make), then the module's other lessons in the order the teacher set.
 */
async function arrangeModule(admin: Admin, sectionId: string) {
  const [{ data: lectures }, { data: lessons }] = await Promise.all([
    admin.from("lecture_videos").select("lesson_id, part_index").eq("section_id", sectionId).not("lesson_id", "is", null).order("part_index"),
    admin.from("lessons").select("id, order_index, created_at").eq("section_id", sectionId),
  ]);
  if (!lessons?.length) return;
  type L = { id: string; order_index: number | null; created_at: string | null };
  const byId = new Map((lessons as L[]).map((l) => [l.id, l]));
  const lectureIds: string[] = [...new Set<string>((lectures ?? []).map((r: { lesson_id: string }) => r.lesson_id))].filter((id) => byId.has(id));
  const rest = (lessons as L[]).filter((l) => !lectureIds.includes(l.id)).sort((a, b) =>
    (Number(a.order_index ?? 0) - Number(b.order_index ?? 0))
    || String(a.created_at ?? "").localeCompare(String(b.created_at ?? ""))
    || a.id.localeCompare(b.id));
  const order = [...lectureIds, ...rest.map((l) => l.id)];
  for (const [i, id] of order.entries()) {
    if (byId.get(id)!.order_index === i) continue;
    const { error } = await admin.from("lessons").update({ order_index: i }).eq("id", id);
    if (error) throw new Error(error.message);
  }
}

async function actionSync(admin: Admin, userId: string, sectionId: string, deadline = Date.now() + 120_000, checked = false) {
  if (!checked) await loadSectionForStaff(admin, userId, sectionId);
  const { data: rows } = await admin
    .from("lecture_videos").select("*").eq("section_id", sectionId).in("status", ["rendering", "saving"]);
  // What the presenter service last said about each video still being made, for the teacher to see
  const checks: Record<string, { status: string; progress: number | null }> = {};

  for (const row of rows ?? []) {
    // Copying a finished video can take a while; leave the rest for the next check.
    if (Date.now() > deadline) break;
    if (row.status === "saving" && Date.now() - new Date(row.updated_at).getTime() < STALE_SAVING_MS) continue;
    if (!row.provider_video_id) continue;
    // A video too big for storage is not downloaded again every few seconds
    if (/larger than your Supabase upload limit/.test(String(row.error_message ?? ""))
      && Date.now() - new Date(row.updated_at).getTime() < 5 * 60_000) {
      checks[row.id] = { status: "completed", progress: 100 };
      continue;
    }

    let detail: Record<string, unknown>;
    try {
      detail = (await heygen(`/v3/videos/${row.provider_video_id}`, { method: "GET" }))?.data ?? {};
    } catch {
      continue; // temporary problem: try again on the next check
    }
    const progress = Number(detail.progress ?? detail.percent ?? NaN);
    checks[row.id] = { status: String(detail.status ?? "unknown"), progress: Number.isFinite(progress) ? progress : null };

    if (detail.status === "failed" || detail.status === "error") {
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
      // Back to "rendering" so the next check retries the copy (the render itself is not
      // repeated or charged again), with the reason shown to the teacher.
      await admin.from("lecture_videos").update({ status: "rendering", error_message: describeSaveError(err) }).eq("id", row.id);
    }
  }
  return { parts: await listRows(admin, sectionId), checks };
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
      case "board": return json(await actionBoard(admin, user.id, body.section_id, String(body.only_missing) === "true"));
      default: return json({ error: "Unknown action" }, 400);
    }
  } catch (err) {
    if (err instanceof UserError) return json({ error: err.message }, err.status);
    console.error("lecture-video error:", err instanceof Error ? err.message : err);
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
});
