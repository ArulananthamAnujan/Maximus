/**
 * course-build: builds everything a course is missing, on the server, so the teacher can
 * start it and leave.
 *
 * Teacher actions (signed-in teacher, admin or org admin who manages the course):
 *   start { course_id, options }  creates the job and its tasks, then starts working
 *   stop  { job_id }              stops after the tasks already running
 *   kick  { job_id }              nudges a job that has stalled (the page calls this)
 *
 * Internal actions (service role only):
 *   pump { job_id }   hands out the next tasks, up to three at a time
 *   run  { task_id }  runs one task, then pumps the job again
 *
 * Each task is one AI request, run in its own invocation so it fits the time limit.
 * Tasks use the ai-generate and lecture-video functions on the teacher's behalf, so
 * tokens, plan features and permissions are exactly as if the teacher clicked.
 *
 * Optional secrets: RESEND_API_KEY and EMAIL_FROM to email the teacher when it is done;
 * SITE_URL for the link in that email.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { actAsHeaders, isServiceCall } from "../_shared/internalAuth.ts";
import { audienceFromPlan, cleanHtml, slidesToHtml, stripHtml } from "../_shared/courseText.ts";
import type { PresentationSlide } from "../_shared/courseText.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SELF_URL = `${SUPABASE_URL}/functions/v1/course-build`;
const PARALLEL = 3;
// Out of tokens, organisation inactive or feature not on the plan: everything else would fail too.
const STOP_JOB = /not enough tokens|insufficient tokens|organisation is inactive|not available on your current plan/i;
// The video service is not set up or out of credit: stop the remaining lecture tasks only.
const STOP_LECTURES = /not set up|api key|out of credit|avatar|heygen/i;

// deno-lint-ignore no-explicit-any
type Admin = any;
// Provided by the Supabase Edge Runtime: keeps the function alive for background work.
declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };
type Json = Record<string, unknown>;

class UserError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

let adminClient = (): Admin =>
  createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
let userClient = (authHeader: string): Admin =>
  createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } }, auth: { autoRefreshToken: false, persistSession: false },
  });

/** Tests swap in stand-ins for the database clients. */
export function setClientsForTest(admin: () => Admin, user: (authHeader: string) => Admin) {
  adminClient = admin;
  userClient = user;
}

// ─── Calling our other functions on the teacher's behalf ───────────────────

async function callFunction(name: string, userId: string, body: Json, timeoutMs = 145_000): Promise<Json> {
  let res: Response;
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
      method: "POST",
      headers: actAsHeaders(userId),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new Error("The AI took too long to answer. It will be tried again.");
  }
  const data = await res.json().catch(() => ({})) as Json;
  if (!res.ok) throw new Error(String(data.error || `Request failed (${res.status})`));
  return data;
}

const ai = (userId: string, task: string, input: Json) => callFunction("ai-generate", userId, { task, input });
const lecture = (userId: string, action: string, payload: Json) => callFunction("lecture-video", userId, { action, ...payload });

/** Fire-and-confirm call to this function (it answers at once and works in the background). */
async function callSelf(body: Json) {
  const res = await fetch(SELF_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  await res.text().catch(() => "");
  if (!res.ok) throw new Error(`dispatch failed (${res.status})`);
}

// ─── Course data ────────────────────────────────────────────────────────────

interface Lesson { id: string; section_id: string; title: string; type: string; url: string | null; description: string | null; content: string | null; order_index: number }
interface Section { id: string; title: string; order_index: number; lessons: Lesson[] }

async function loadCourse(admin: Admin, courseId: string) {
  const [{ data: course }, { data: sections }, { data: lectures }] = await Promise.all([
    admin.from("courses").select("id, title, ai_plan").eq("id", courseId).maybeSingle(),
    admin.from("sections").select("id, title, order_index, lessons(id, section_id, title, type, url, description, content, order_index)")
      .eq("course_id", courseId).order("order_index"),
    admin.from("lecture_videos").select("section_id, lesson_id, status").eq("course_id", courseId),
  ]);
  if (!course) throw new UserError("Course not found.", 404);
  const lectureLessons = new Set((lectures ?? []).map((l: { lesson_id: string | null }) => l.lesson_id).filter(Boolean));
  const weeks: Section[] = (sections ?? []).map((s: Section) => ({
    ...s,
    lessons: [...(s.lessons ?? [])]
      .filter(l => !lectureLessons.has(l.id) && l.type !== "quiz")
      .sort((a, b) => a.order_index - b.order_index),
  }));
  return { course, weeks, lectures: (lectures ?? []) as Array<{ section_id: string; lesson_id: string | null; status: string }> };
}

const isReading = (l: Lesson) => ["text", "article", "file"].includes(l.type) && !l.url;
const hasOwnNotes = (l: Lesson) => stripHtml(l.content ?? "").length > 400;

function lessonDescription(lesson: Lesson): string {
  if (lesson.description?.trim()) return lesson.description.trim().slice(0, 500);
  if (lesson.content && lesson.content.length < 600) return stripHtml(lesson.content).slice(0, 500);
  return "";
}

async function notesFor(admin: Admin, lesson: Lesson): Promise<string> {
  const { data } = await admin.from("lesson_documents").select("content_html").eq("lesson_id", lesson.id).eq("type", "notes").maybeSingle();
  if (data?.content_html) return data.content_html;
  return hasOwnNotes(lesson) ? lesson.content ?? "" : "";
}

async function weekNotesText(admin: Admin, lessons: Lesson[], perLesson = 6000, limit = 16000): Promise<string> {
  if (lessons.length === 0) return "";
  const { data } = await admin.from("lesson_documents").select("lesson_id, content_html").eq("type", "notes").in("lesson_id", lessons.map(l => l.id));
  const byLesson = new Map<string, string>((data ?? []).map((d: { lesson_id: string; content_html: string }) => [d.lesson_id, d.content_html]));
  return lessons.map(l => `## ${l.title}\n${stripHtml(byLesson.get(l.id) || l.content || l.description || "").slice(0, perLesson)}`).join("\n\n").slice(0, limit);
}

async function replaceDocument(admin: Admin, lessonId: string, courseId: string, type: "notes" | "slides", title: string, html: string, order: number) {
  const { error: delError } = await admin.from("lesson_documents").delete().eq("lesson_id", lessonId).eq("type", type);
  if (delError) throw new Error("Could not replace the existing materials.");
  const { error } = await admin.from("lesson_documents").insert({ lesson_id: lessonId, course_id: courseId, type, title, content_html: html, order_index: order });
  if (error) throw new Error("Could not save the materials.");
}

// ─── Running one task ───────────────────────────────────────────────────────

interface Task { id: string; job_id: string; course_id: string; kind: string; lesson_id: string | null; section_id: string | null; status: string; attempts: number }
interface Job { id: string; course_id: string; created_by: string; status: string; options: Json }

async function runTask(admin: Admin, task: Task, job: Job) {
  const userId = job.created_by;
  const { course, weeks } = await loadCourse(admin, task.course_id);
  const plan = course.ai_plan ?? null;
  const { target_audience, difficulty, brief } = audienceFromPlan(plan);
  const week = weeks.find(w => w.id === task.section_id) ?? weeks.find(w => w.lessons.some(l => l.id === task.lesson_id));
  const lesson = week?.lessons.find(l => l.id === task.lesson_id);

  switch (task.kind) {
    case "notes": {
      if (!week || !lesson) throw new Error("This lesson no longer exists.");
      const idx = weeks.findIndex(w => w.id === week.id);
      const previous = weeks.slice(Math.max(0, idx - 8), Math.max(0, idx))
        .map(w => `${w.title}${w.lessons.length ? ` (lessons: ${w.lessons.map(l => l.title).join("; ")})` : ""}`);
      const notes = await ai(userId, "lesson_notes", {
        lesson_title: lesson.title, section_title: week.title, course_title: course.title,
        target_audience, difficulty, lesson_description: lessonDescription(lesson),
        other_lessons: week.lessons.filter(l => l.id !== lesson.id).map(l => l.title),
        previous_weeks: previous, brief,
      });
      const html = cleanHtml(String(notes.content_html ?? "")).trim();
      if (!html) throw new Error("The AI returned empty notes.");
      await replaceDocument(admin, lesson.id, course.id, "notes", `${lesson.title} — Notes`, html, 0);
      await admin.from("lessons").update({ content: html }).eq("id", lesson.id);
      return;
    }
    case "slides": {
      if (!week || !lesson) throw new Error("This lesson no longer exists.");
      const notes = await notesFor(admin, lesson);
      if (!notes) throw new Error("This lesson has no notes to build slides from.");
      const deck = await ai(userId, "lesson_slides", {
        lesson_title: lesson.title, section_title: week.title, course_title: course.title, notes_text: stripHtml(notes), brief,
      }) as { slides_title?: string; slides?: PresentationSlide[] };
      if (!deck.slides?.length) throw new Error("The AI returned no slides.");
      await replaceDocument(admin, lesson.id, course.id, "slides", deck.slides_title || `${lesson.title} — Slides`, slidesToHtml(deck.slides), 1);
      return;
    }
    case "guide": {
      if (!week || !lesson) throw new Error("This lesson no longer exists.");
      const notes = await notesFor(admin, lesson);
      if (!notes) throw new Error("This lesson has no notes to plan a session from.");
      const guide = await ai(userId, "teacher_guide", {
        course_title: course.title, section_title: week.title, lesson_title: lesson.title,
        session_minutes: 60, notes_text: stripHtml(notes), brief,
      });
      const { error } = await admin.from("lesson_teacher_guides").upsert({
        lesson_id: lesson.id, course_id: course.id, content_html: cleanHtml(String(guide.content_html ?? "")), updated_at: new Date().toISOString(),
      });
      if (error) throw new Error("Could not save the teacher guide.");
      return;
    }
    case "quiz": {
      if (!week) throw new Error("This week no longer exists.");
      const { data: existing } = await admin.from("quizzes").select("id").eq("section_id", week.id).limit(1);
      if (existing?.length) return; // added by the teacher meanwhile
      const text = await weekNotesText(admin, week.lessons);
      if (text.replace(/##.*\n/g, "").trim().length < 300) throw new Error("This week has no lesson notes to write a quiz from.");
      const r = await ai(userId, "quiz_from_content", {
        lesson_content: text, num_questions: 8, question_types: ["mcq", "true_false"], difficulty: "medium", brief,
      }) as { questions?: Array<{ question: string; type: string; options?: string[]; correct_answer: string; explanation?: string; points?: number }> };
      const qs = (r.questions ?? []).filter(q => q.question && q.correct_answer);
      if (qs.length === 0) throw new Error("The AI returned no usable questions.");
      const { data: quiz, error } = await admin.from("quizzes").insert({
        course_id: course.id, section_id: week.id, title: `${week.title}: check your understanding`,
        pass_mark: 70, pass_percentage: 70, max_attempts: 3, is_published: true, is_required: true,
      }).select("id").single();
      if (error || !quiz) throw new Error("Could not create the quiz.");
      const { error: rowsErr } = await admin.from("quiz_questions").insert(qs.map((q, i) => ({
        quiz_id: quiz.id, question: q.question, type: q.type === "true_false" ? "true_false" : "mcq",
        options: q.options?.length ? q.options : ["True", "False"], correct_answer: q.correct_answer,
        explanation: q.explanation || "", points: q.points || 1, order_index: i,
      })));
      if (rowsErr) {
        await admin.from("quizzes").delete().eq("id", quiz.id);
        throw new Error("The quiz questions could not be saved.");
      }
      return;
    }
    case "capstone": {
      const { data: existing } = await admin.from("assignments").select("id").eq("course_id", course.id).eq("kind", "capstone").limit(1);
      if (existing?.length) return;
      const notes = await Promise.all(weeks.map(w => weekNotesText(admin, w.lessons, 1500, 4000)));
      const r = await ai(userId, "assessment_draft", {
        kind: "capstone", course_title: course.title, total_points: 100,
        weeks: weeks.map(w => `${w.title}${w.lessons.length ? ` (lessons: ${w.lessons.map(l => l.title).join("; ")})` : ""}`),
        notes_text: notes.join("\n\n").slice(0, 24000) || undefined, brief,
      }) as {
        title?: string; brief_html?: string; deliverables?: string[]; estimated_minutes?: number;
        rubric?: Array<{ name: string; points: number; levels?: Array<{ label: string; points: number; descriptor: string }> }>;
        resources?: Array<{ title: string; note?: string }>; solution_html?: string; marking_notes?: string;
      };
      const briefHtml = cleanHtml(String(r.brief_html ?? "") + (r.deliverables?.length
        ? `<h3>Deliverables</h3><ul>${r.deliverables.map(d => `<li>${String(d).replace(/</g, "&lt;")}</li>`).join("")}</ul>` : ""));
      let rubric = (r.rubric ?? []).map(c => ({
        name: String(c.name || "Criterion"), points: Number(c.points) || 0,
        levels: (c.levels ?? []).map(l => ({ label: l.label, points: Number(l.points) || 0, descriptor: l.descriptor })),
      }));
      if (rubric.reduce((n, c) => n + c.points, 0) !== 100) rubric = [];
      const { data, error } = await admin.from("assignments").insert({
        course_id: course.id, teacher_id: userId, section_id: null, kind: "capstone",
        title: r.title || `${course.title}: capstone project`, description: stripHtml(briefHtml).slice(0, 400),
        brief_html: briefHtml, rubric, resources: (r.resources ?? []).filter(x => x.title).map(x => ({ title: x.title, note: x.note })),
        estimated_minutes: r.estimated_minutes ? Math.round(r.estimated_minutes) : null, total_points: 100, is_published: false,
      }).select("id").single();
      if (error || !data) throw new Error("Could not save the capstone project.");
      await admin.from("assignment_private").upsert({
        assignment_id: data.id, course_id: course.id, solution_html: cleanHtml(r.solution_html || ""),
        marking_notes: r.marking_notes || "", updated_at: new Date().toISOString(),
      });
      return;
    }
    case "lecture_script":
      if (!task.section_id) throw new Error("This week no longer exists.");
      await lecture(userId, "draft", { section_id: task.section_id });
      return;
    case "lecture_video": {
      if (!task.section_id) throw new Error("This week no longer exists.");
      const { avatar_id, voice_id } = job.options as { avatar_id?: string; voice_id?: string };
      await lecture(userId, "render", { section_id: task.section_id, avatar_id, voice_id });
      return;
    }
    default:
      throw new Error(`Unknown task ${task.kind}`);
  }
}

// ─── Job control ────────────────────────────────────────────────────────────

async function stopJob(admin: Admin, jobId: string, reason: string | null) {
  await admin.from("course_build_tasks").update({ status: "skipped", finished_at: new Date().toISOString() })
    .eq("job_id", jobId).eq("status", "queued");
  await admin.from("course_build_jobs").update({ status: "stopped", error: reason, finished_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", jobId).eq("status", "running");
}

async function notifyDone(admin: Admin, job: Job) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("EMAIL_FROM");
  if (!apiKey || !from) return;
  const [{ data: who }, { data: course }, { data: tasks }] = await Promise.all([
    admin.from("profiles").select("email, full_name, role").eq("id", job.created_by).maybeSingle(),
    admin.from("courses").select("title").eq("id", job.course_id).maybeSingle(),
    admin.from("course_build_tasks").select("status").eq("job_id", job.id),
  ]);
  if (!who?.email) return;
  const done = (tasks ?? []).filter((t: { status: string }) => t.status === "done").length;
  const failed = (tasks ?? []).filter((t: { status: string }) => t.status === "failed").length;
  const base = (Deno.env.get("SITE_URL") || "https://maximusacademy.com.au").replace(/\/$/, "");
  const path = who.role === "admin" ? "/admin/builder" : who.role === "org_admin" ? "/org/builder" : "/teacher/builder";
  const link = `${base}${path}?courseId=${job.course_id}`;
  const title = String(course?.title ?? "Your course").replace(/[<>&]/g, "");
  const html = `<p>Hi ${String(who.full_name ?? "").replace(/[<>&]/g, "") || "there"},</p>
<p><strong>${title}</strong> has finished building: ${done} item${done === 1 ? "" : "s"} done${failed ? `, ${failed} could not be made (you can try those again from the course)` : ""}.</p>
<p>Lecture videos can take a little longer; they are added to each week when ready.</p>
<p><a href="${link}">Open the course</a></p>`;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [who.email], subject: `${title} is built`, html }),
  }).catch(() => {});
}

/** Hands out the next tasks of a job and starts each in its own invocation. */
async function pump(admin: Admin, jobId: string) {
  const { data: job } = await admin.from("course_build_jobs").select("*").eq("id", jobId).maybeSingle();
  if (!job || job.status !== "running") return;
  const { data: claimed, error } = await admin.rpc("claim_build_tasks", { p_job: jobId, p_limit: PARALLEL });
  if (error) { console.error("claim failed", error.message); return; }
  if (!claimed?.length) {
    const { data: finished } = await admin.rpc("finish_build_job", { p_job: jobId });
    if (finished) await notifyDone(admin, job);
    return;
  }
  await Promise.all((claimed as Task[]).map(async t => {
    try {
      await callSelf({ action: "run", task_id: t.id });
    } catch {
      // Put it back; the next pump (or the page's nudge) picks it up.
      await admin.from("course_build_tasks").update({ status: "queued", started_at: null, attempts: Math.max(0, t.attempts - 1) })
        .eq("id", t.id).eq("status", "running");
    }
  }));
}

async function runAndContinue(admin: Admin, taskId: string) {
  const { data: task } = await admin.from("course_build_tasks").select("*").eq("id", taskId).maybeSingle();
  if (!task || task.status !== "running") return;
  const { data: job } = await admin.from("course_build_jobs").select("*").eq("id", task.job_id).maybeSingle();
  if (!job || job.status !== "running") {
    await admin.from("course_build_tasks").update({ status: "skipped", finished_at: new Date().toISOString() }).eq("id", task.id);
    return;
  }
  try {
    await runTask(admin, task, job);
    await admin.from("course_build_tasks").update({ status: "done", error: null, finished_at: new Date().toISOString() }).eq("id", task.id);
  } catch (e) {
    const message = (e instanceof Error ? e.message : "Something went wrong.").slice(0, 500);
    await admin.from("course_build_tasks").update({ status: "failed", error: message, finished_at: new Date().toISOString() }).eq("id", task.id);
    if (STOP_JOB.test(message)) {
      await stopJob(admin, job.id, message);
      return;
    }
    if (task.kind.startsWith("lecture") && STOP_LECTURES.test(message)) {
      await admin.from("course_build_tasks").update({ status: "skipped", error: message, finished_at: new Date().toISOString() })
        .eq("job_id", job.id).eq("status", "queued").in("kind", ["lecture_script", "lecture_video"]);
    }
  }
  await admin.from("course_build_jobs").update({ updated_at: new Date().toISOString() }).eq("id", job.id);
  await pump(admin, job.id);
}

// ─── Planning a build ───────────────────────────────────────────────────────

interface Options {
  materials?: boolean; guides?: boolean; lectures?: boolean; quizzes?: boolean; capstone?: boolean;
  check_scripts?: boolean; avatar_id?: string; voice_id?: string;
}

async function planTasks(admin: Admin, courseId: string, o: Options) {
  const { weeks, lectures } = await loadCourse(admin, courseId);
  const lessonIds = weeks.flatMap(w => w.lessons.map(l => l.id));
  const [{ data: docs }, { data: guides }, { data: quizzes }, { data: capstones }] = await Promise.all([
    lessonIds.length ? admin.from("lesson_documents").select("lesson_id, type").in("lesson_id", lessonIds) : { data: [] },
    lessonIds.length ? admin.from("lesson_teacher_guides").select("lesson_id").in("lesson_id", lessonIds) : { data: [] },
    admin.from("quizzes").select("section_id").eq("course_id", courseId),
    admin.from("assignments").select("id").eq("course_id", courseId).eq("kind", "capstone").limit(1),
  ]);
  const has = (id: string, type: string) => (docs ?? []).some((d: { lesson_id: string; type: string }) => d.lesson_id === id && d.type === type);
  const hasGuide = new Set((guides ?? []).map((g: { lesson_id: string }) => g.lesson_id));
  const weeksWithQuiz = new Set((quizzes ?? []).map((q: { section_id: string | null }) => q.section_id).filter(Boolean));

  type NewTask = { phase: number; seq: number; kind: string; lesson_id?: string; section_id?: string; label: string };
  const tasks: NewTask[] = [];
  let seq = 0;
  const add = (t: Omit<NewTask, "seq">) => tasks.push({ ...t, seq: seq++ });

  // Lecture scripts first within phase 2, so the videos start as early as possible
  if (o.lectures) {
    for (const w of weeks) {
      if (w.lessons.length === 0) continue;
      const parts = lectures.filter(l => l.section_id === w.id);
      const making = parts.some(p => p.status === "rendering" || p.status === "saving");
      const ready = parts.length > 0 && parts.every(p => p.status === "ready");
      if (making || ready) continue;
      if (parts.length === 0) add({ phase: 2, kind: "lecture_script", section_id: w.id, label: w.title });
      if (!o.check_scripts) add({ phase: 3, kind: "lecture_video", section_id: w.id, label: w.title });
    }
  }
  for (const w of weeks) {
    for (const l of w.lessons.filter(isReading)) {
      const notes = has(l.id, "notes") || hasOwnNotes(l);
      if (o.materials && !notes) add({ phase: 1, kind: "notes", lesson_id: l.id, section_id: w.id, label: l.title });
      if (o.materials && (!notes || !has(l.id, "slides"))) add({ phase: 2, kind: "slides", lesson_id: l.id, section_id: w.id, label: l.title });
    }
  }
  if (o.quizzes) {
    for (const w of weeks) {
      if (w.lessons.length > 0 && !weeksWithQuiz.has(w.id)) add({ phase: 2, kind: "quiz", section_id: w.id, label: w.title });
    }
  }
  if (o.guides) {
    for (const w of weeks) for (const l of w.lessons.filter(isReading)) {
      if (!hasGuide.has(l.id)) add({ phase: 2, kind: "guide", lesson_id: l.id, section_id: w.id, label: l.title });
    }
  }
  if (o.capstone && !(capstones ?? []).length && weeks.length) add({ phase: 2, kind: "capstone", label: "Capstone project" });
  return tasks;
}

// ─── Handler ────────────────────────────────────────────────────────────────

export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
  const admin = adminClient();
  try {
    const body = await req.json().catch(() => ({})) as Json;
    const action = String(body.action ?? "");

    // Internal: our own invocations
    if (action === "pump" || action === "run") {
      if (!isServiceCall(req)) return json({ error: "Forbidden" }, 403);
      const work = action === "pump"
        ? pump(admin, String(body.job_id))
        : runAndContinue(admin, String(body.task_id));
      EdgeRuntime.waitUntil(work.catch(e => console.error(`course-build ${action} failed:`, e instanceof Error ? e.message : e)));
      return json({ accepted: true }, 202);
    }

    // Teacher actions
    const authHeader = req.headers.get("Authorization") ?? "";
    const { data: { user } } = await admin.auth.getUser(authHeader.replace(/^Bearer\s+/i, ""));
    if (!user) return json({ error: "Please sign in again." }, 401);
    const { data: profile } = await admin.from("profiles").select("role, is_active").eq("id", user.id).maybeSingle();
    if (!profile || profile.is_active === false || !["teacher", "admin", "org_admin"].includes(profile.role)) {
      return json({ error: "Only teachers and administrators can build courses." }, 403);
    }
    const asUser = userClient(authHeader);
    const canManage = async (courseId: string) => {
      const { data } = await asUser.rpc("can_manage_course", { p_course_id: courseId });
      if (data !== true) throw new UserError("You cannot change this course.", 403);
    };

    if (action === "start") {
      const courseId = String(body.course_id ?? "");
      await canManage(courseId);
      const o = (body.options ?? {}) as Options;
      const options: Options = {
        materials: !!o.materials, guides: !!o.guides, lectures: !!o.lectures, quizzes: !!o.quizzes, capstone: !!o.capstone,
        check_scripts: !!o.check_scripts,
        avatar_id: typeof o.avatar_id === "string" ? o.avatar_id.slice(0, 100) : undefined,
        voice_id: typeof o.voice_id === "string" ? o.voice_id.slice(0, 100) : undefined,
      };
      if (options.lectures && !options.check_scripts && (!options.avatar_id || !options.voice_id)) {
        throw new UserError("Choose a presenter and a voice for the lecture videos.");
      }
      const { data: running } = await admin.from("course_build_jobs").select("id").eq("course_id", courseId).eq("status", "running").maybeSingle();
      if (running) {
        await pump(admin, running.id);
        return json({ job_id: running.id, already_running: true });
      }
      const tasks = await planTasks(admin, courseId, options);
      if (tasks.length === 0) return json({ job_id: null, tasks: 0 });
      const { data: job, error } = await admin.from("course_build_jobs")
        .insert({ course_id: courseId, created_by: user.id, options }).select("*").single();
      if (error || !job) {
        // Two clicks at once: the other one won
        const { data: other } = await admin.from("course_build_jobs").select("id").eq("course_id", courseId).eq("status", "running").maybeSingle();
        if (other) return json({ job_id: other.id, already_running: true });
        throw new Error("Could not start the build.");
      }
      const { error: tErr } = await admin.from("course_build_tasks").insert(tasks.map(t => ({ ...t, job_id: job.id, course_id: courseId })));
      if (tErr) {
        await admin.from("course_build_jobs").delete().eq("id", job.id);
        throw new Error("Could not start the build.");
      }
      await pump(admin, job.id);
      return json({ job_id: job.id, tasks: tasks.length });
    }

    if (action === "stop" || action === "kick") {
      const { data: job } = await admin.from("course_build_jobs").select("*").eq("id", String(body.job_id ?? "")).maybeSingle();
      if (!job) throw new UserError("That build was not found.", 404);
      await canManage(job.course_id);
      if (action === "stop") await stopJob(admin, job.id, null);
      else await pump(admin, job.id);
      return json({ ok: true });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (err) {
    if (err instanceof UserError) return json({ error: err.message }, err.status);
    console.error("course-build error:", err instanceof Error ? err.message : err);
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
}
