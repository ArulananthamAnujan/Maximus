import { supabase } from './supabase';
import { loadCoursePlan } from './coursePlan';
import type { CoursePlan } from './coursePlan';
import { stripHtml } from './slides';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface WsLesson {
  id: string;
  section_id: string;
  title: string;
  type: string;
  url: string | null;
  video_url: string | null;
  description: string | null;
  content: string | null;
  duration_minutes: number | null;
  order_index: number;
  is_preview: boolean | null;
  is_required: boolean | null;
}

export interface WsSection {
  id: string;
  title: string;
  order_index: number;
  release_at: string | null;
  lessons: WsLesson[];
}

export interface WsCourse {
  id: string;
  title: string;
  description: string | null;
  short_description: string | null;
  thumbnail_url: string | null;
  is_published: boolean | null;
  start_date: string | null;
  level: string | null;
  teacher_id: string | null;
}

export interface WsQuiz {
  id: string;
  title: string;
  section_id: string | null;
  is_published: boolean | null;
  question_count: number;
}

export interface RubricLevel {
  label: string;
  points: number;
  descriptor: string;
}

export interface RubricCriterion {
  name: string;
  /** Maximum points for this criterion. */
  points: number;
  levels: RubricLevel[];
}

export interface AssignmentResource {
  title: string;
  url?: string;
  note?: string;
}

export type AssignmentKind = 'assignment' | 'capstone' | 'lab';

export interface WsAssignment {
  id: string;
  course_id: string;
  section_id: string | null;
  kind: AssignmentKind;
  title: string;
  description: string | null;
  brief_html: string;
  rubric: RubricCriterion[];
  resources: AssignmentResource[];
  estimated_minutes: number | null;
  due_date: string | null;
  total_points: number | null;
  is_published: boolean | null;
  order_index: number;
}

export interface WsLecture {
  id: string;
  section_id: string;
  lesson_id: string | null;
  status: 'draft' | 'rendering' | 'saving' | 'ready' | 'failed';
  duration_seconds: number | null;
}

export interface Workspace {
  course: WsCourse;
  sections: WsSection[];
  quizzes: WsQuiz[];
  assignments: WsAssignment[];
  lectures: WsLecture[];
  /** Lessons that are AI lecture videos (shown as the week's lecture, not as lessons). */
  lectureLessonIds: Set<string>;
  materials: Map<string, { notes: boolean; slides: boolean }>;
  guides: Set<string>;
  plan: CoursePlan | null;
  enrolled: number;
}

// ─── Loading ────────────────────────────────────────────────────────────────

export async function loadWorkspace(courseId: string): Promise<Workspace> {
  const [courseRes, sectionsRes, quizzesRes, assignmentsRes, lecturesRes, plan, enrolledRes] = await Promise.all([
    supabase.from('courses')
      .select('id, title, description, short_description, thumbnail_url, is_published, start_date, level, teacher_id')
      .eq('id', courseId).maybeSingle(),
    supabase.from('sections')
      .select('id, title, order_index, release_at, lessons(id, section_id, title, type, url, video_url, description, content, duration_minutes, order_index, is_preview, is_required)')
      .eq('course_id', courseId).order('order_index'),
    supabase.from('quizzes').select('id, title, section_id, is_published, quiz_questions(count)').eq('course_id', courseId).order('created_at'),
    supabase.from('assignments').select('*').eq('course_id', courseId).order('order_index').order('created_at'),
    supabase.from('lecture_videos').select('id, section_id, lesson_id, status, duration_seconds').eq('course_id', courseId),
    loadCoursePlan(courseId),
    supabase.from('course_enrollments').select('id', { count: 'exact', head: true }).eq('course_id', courseId),
  ]);
  if (!courseRes.data) throw new Error('Course not found, or you do not have access to it.');

  const sections = ((sectionsRes.data ?? []) as WsSection[]).map(s => ({
    ...s,
    lessons: [...(s.lessons ?? [])].sort((a, b) => a.order_index - b.order_index),
  }));
  const lessonIds = sections.flatMap(s => s.lessons.map(l => l.id));

  const materials = new Map<string, { notes: boolean; slides: boolean }>(lessonIds.map(id => [id, { notes: false, slides: false }]));
  const guides = new Set<string>();
  for (let i = 0; i < lessonIds.length; i += 200) {
    const chunk = lessonIds.slice(i, i + 200);
    const [docs, guideRows] = await Promise.all([
      supabase.from('lesson_documents').select('lesson_id, type').in('lesson_id', chunk),
      supabase.from('lesson_teacher_guides').select('lesson_id').in('lesson_id', chunk),
    ]);
    for (const d of docs.data ?? []) {
      const m = materials.get(d.lesson_id);
      if (m && d.type === 'notes') m.notes = true;
      if (m && d.type === 'slides') m.slides = true;
    }
    for (const g of guideRows.data ?? []) guides.add(g.lesson_id);
  }

  const lectures = (lecturesRes.data ?? []) as WsLecture[];
  const quizzes = ((quizzesRes.data ?? []) as Array<WsQuiz & { quiz_questions?: Array<{ count: number }> }>).map(q => ({
    id: q.id, title: q.title, section_id: q.section_id, is_published: q.is_published,
    question_count: q.quiz_questions?.[0]?.count ?? 0,
  }));
  const assignments = ((assignmentsRes.data ?? []) as WsAssignment[]).map(a => ({
    ...a,
    kind: (a.kind ?? 'assignment') as AssignmentKind,
    rubric: Array.isArray(a.rubric) ? a.rubric : [],
    resources: Array.isArray(a.resources) ? a.resources : [],
  }));

  return {
    course: courseRes.data as WsCourse,
    sections,
    quizzes,
    assignments,
    lectures,
    lectureLessonIds: new Set(lectures.map(l => l.lesson_id).filter((id): id is string => !!id)),
    materials,
    guides,
    plan,
    enrolled: enrolledRes.count ?? 0,
  };
}

// ─── Lesson and week status ────────────────────────────────────────────────

/** Lessons that are read (notes + slides make sense), as opposed to video/file/link lessons. */
export function isReadingLesson(lesson: WsLesson): boolean {
  return ['text', 'article', 'file'].includes(lesson.type) && !lesson.url;
}

export type LessonState = 'ready' | 'no-slides' | 'no-notes' | 'no-media';

export function lessonState(lesson: WsLesson, ws: Workspace): LessonState {
  if (isReadingLesson(lesson)) {
    const m = ws.materials.get(lesson.id) ?? { notes: false, slides: false };
    const ownContent = stripHtml(lesson.content ?? '').length > 400;
    if (!m.notes && !ownContent) return 'no-notes';
    if (!m.slides) return 'no-slides';
    return 'ready';
  }
  return lesson.url || lesson.video_url ? 'ready' : 'no-media';
}

/** Lessons of a week that are not its AI lecture. */
export function weekLessons(section: WsSection, ws: Workspace): WsLesson[] {
  return section.lessons.filter(l => !ws.lectureLessonIds.has(l.id) && l.type !== 'quiz');
}

export function weekLecture(section: WsSection, ws: Workspace) {
  const parts = ws.lectures.filter(l => l.section_id === section.id);
  if (parts.length === 0) return { state: 'none' as const, minutes: 0, parts };
  const minutes = Math.round(parts.reduce((n, p) => n + (p.duration_seconds ?? 0), 0) / 60);
  if (parts.some(p => p.status === 'rendering' || p.status === 'saving')) return { state: 'making' as const, minutes, parts };
  if (parts.every(p => p.status === 'ready')) return { state: 'ready' as const, minutes, parts };
  if (parts.some(p => p.status === 'failed')) return { state: 'failed' as const, minutes, parts };
  return { state: 'draft' as const, minutes, parts };
}

export interface WeekStatus {
  issues: string[];
  empty: boolean;
}

export function weekStatus(section: WsSection, ws: Workspace): WeekStatus {
  const lessons = weekLessons(section, ws);
  if (lessons.length === 0) return { issues: ['Add lessons'], empty: true };
  const issues: string[] = [];
  const noNotes = lessons.filter(l => lessonState(l, ws) === 'no-notes').length;
  const noSlides = lessons.filter(l => lessonState(l, ws) === 'no-slides').length;
  const noMedia = lessons.filter(l => lessonState(l, ws) === 'no-media').length;
  if (noNotes) issues.push(`${noNotes} lesson${noNotes === 1 ? '' : 's'} without notes`);
  if (noSlides) issues.push(`${noSlides} lesson${noSlides === 1 ? '' : 's'} without slides`);
  if (noMedia) issues.push(`${noMedia} lesson${noMedia === 1 ? '' : 's'} missing a video or file`);
  if (!ws.quizzes.some(q => q.section_id === section.id)) issues.push('No quiz');
  return { issues, empty: false };
}

// ─── Course readiness ───────────────────────────────────────────────────────

export type ReadinessKey = 'content' | 'description' | 'notes' | 'slides' | 'quizzes' | 'capstone' | 'thumbnail' | 'schedule' | 'lectures' | 'guides';

export interface ReadinessItem {
  key: ReadinessKey;
  label: string;
  done: number;
  total: number;
  /** required: blocks a confident publish; recommended: counted in the score; optional: shown only */
  level: 'required' | 'recommended' | 'optional';
  hint: string;
  /** Short text for a missing single item, when "No <label>" would be wrong. */
  todo?: string;
}

const WEIGHTS: Partial<Record<ReadinessKey, number>> = {
  content: 15, description: 10, notes: 25, slides: 15, quizzes: 15, capstone: 10, thumbnail: 5, schedule: 5,
};

export function readiness(ws: Workspace): { percent: number; items: ReadinessItem[] } {
  const weeks = ws.sections;
  const lessons = weeks.flatMap(s => weekLessons(s, ws));
  const reading = lessons.filter(isReadingLesson);
  const withNotes = reading.filter(l => lessonState(l, ws) !== 'no-notes').length;
  const withSlides = reading.filter(l => lessonState(l, ws) === 'ready').length;
  const weeksWithQuiz = weeks.filter(s => ws.quizzes.some(q => q.section_id === s.id)).length;
  const weeksWithLecture = weeks.filter(s => weekLecture(s, ws).state === 'ready').length;
  const descLength = stripHtml(ws.course.description ?? '').length;

  const items: ReadinessItem[] = [
    { key: 'content', label: 'Weeks with lessons', done: weeks.filter(s => weekLessons(s, ws).length > 0).length, total: Math.max(weeks.length, 1), level: 'required', hint: 'Every week needs at least one lesson.' },
    { key: 'description', label: 'Course description', done: descLength >= 80 ? 1 : 0, total: 1, level: 'required', hint: descLength ? 'Write a few sentences (at least 80 characters): who the course is for and what they will be able to do.' : 'Tell students who the course is for and what they will be able to do.', todo: descLength ? 'Description too short' : undefined },
    { key: 'notes', label: 'Notes', done: withNotes, total: reading.length, level: 'recommended', hint: 'Complete study notes for every reading lesson.' },
    { key: 'slides', label: 'Slides', done: withSlides, total: reading.length, level: 'recommended', hint: 'A slide deck built from each lesson\'s notes.' },
    { key: 'quizzes', label: 'Weekly quizzes', done: weeksWithQuiz, total: weeks.length, level: 'recommended', hint: 'A short quiz per week to check understanding.' },
    { key: 'capstone', label: 'Capstone project', done: ws.assignments.some(a => a.kind === 'capstone') ? 1 : 0, total: 1, level: 'recommended', hint: 'A final project students can show to employers.' },
    { key: 'thumbnail', label: 'Course image', done: ws.course.thumbnail_url ? 1 : 0, total: 1, level: 'recommended', hint: 'Shown on the course catalogue.' },
    { key: 'schedule', label: 'Schedule', done: ws.course.start_date ? 1 : 0, total: 1, level: 'recommended', hint: 'A start date and when each week opens.' },
    { key: 'lectures', label: 'Weekly lectures', done: weeksWithLecture, total: weeks.length, level: 'optional', hint: 'AI presenter videos, one per week.' },
    { key: 'guides', label: 'Teacher guides', done: lessons.filter(l => ws.guides.has(l.id)).length, total: lessons.length, level: 'optional', hint: 'Session plans for live classes.' },
  ];

  let score = 0;
  let weight = 0;
  for (const it of items) {
    const w = WEIGHTS[it.key];
    if (!w || it.total === 0) continue;
    weight += w;
    score += w * Math.min(1, it.done / it.total);
  }
  return { percent: weight ? Math.round((score / weight) * 100) : 0, items };
}

export function itemComplete(item: ReadinessItem): boolean {
  return item.total > 0 && item.done >= item.total;
}

/** Total study time in minutes across all lessons. */
export function totalMinutes(ws: Workspace): number {
  return ws.sections.flatMap(s => s.lessons).reduce((n, l) => n + (l.duration_minutes ?? 0), 0);
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}
