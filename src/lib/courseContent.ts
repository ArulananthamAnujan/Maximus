import { supabase } from './supabase';
import { generateLessonNotes, generateLessonSlides, generateTeacherGuide } from './ai';
import { audienceFromPlan } from './coursePlan';
import type { CoursePlan } from './coursePlan';
import { stripHtml, slidesToHtml, parseSlidesFromHtml } from './slides';
import type { SlideDeck } from './slides';

export interface ContentLesson {
  id: string;
  title: string;
  type?: string | null;
  description?: string | null;
  content?: string | null;
  order_index: number;
}

export interface ContentSection {
  id: string;
  title: string;
  order_index: number;
  lessons: ContentLesson[];
}

export interface LessonMaterials {
  notes: boolean;
  slides: boolean;
  guide?: boolean;
}

/** Loads the course's weeks and lessons, leaving out lessons that are AI lecture videos. */
export async function loadCourseStructure(courseId: string): Promise<ContentSection[]> {
  const [{ data: sections }, { data: lectureRows }] = await Promise.all([
    supabase.from('sections')
      .select('id, title, order_index, lessons(id, title, type, description, content, order_index)')
      .eq('course_id', courseId)
      .order('order_index'),
    supabase.from('lecture_videos').select('lesson_id').eq('course_id', courseId),
  ]);
  const lectureLessonIds = new Set((lectureRows ?? []).map(r => r.lesson_id).filter(Boolean));
  return ((sections ?? []) as ContentSection[]).map(sec => ({
    ...sec,
    lessons: [...(sec.lessons ?? [])]
      .filter(l => !lectureLessonIds.has(l.id) && l.type !== 'quiz')
      .sort((a, b) => a.order_index - b.order_index),
  }));
}

/** Which lessons already have notes and slides. */
export async function loadMaterialStatus(lessonIds: string[]): Promise<Map<string, LessonMaterials>> {
  const status = new Map<string, LessonMaterials>(lessonIds.map(id => [id, { notes: false, slides: false, guide: false }]));
  for (let i = 0; i < lessonIds.length; i += 200) {
    const chunk = lessonIds.slice(i, i + 200);
    const [{ data }, { data: guides }] = await Promise.all([
      supabase.from('lesson_documents').select('lesson_id, type').in('lesson_id', chunk),
      supabase.from('lesson_teacher_guides').select('lesson_id').in('lesson_id', chunk),
    ]);
    for (const g of guides ?? []) { const e = status.get(g.lesson_id); if (e) e.guide = true; }
    for (const row of data ?? []) {
      const entry = status.get(row.lesson_id);
      if (!entry) continue;
      if (row.type === 'notes') entry.notes = true;
      if (row.type === 'slides') entry.slides = true;
    }
  }
  return status;
}

async function replaceDocument(lessonId: string, courseId: string, type: 'notes' | 'slides', title: string, html: string, order: number) {
  const { error: delError } = await supabase.from('lesson_documents').delete().eq('lesson_id', lessonId).eq('type', type);
  if (delError) throw new Error('Could not replace the existing materials. Check you have permission to edit this course.');
  const { error } = await supabase.from('lesson_documents').insert({
    lesson_id: lessonId, course_id: courseId, type, title, content_html: html, order_index: order,
  });
  if (error) throw new Error('Could not save the generated materials. Check you have permission to edit this course.');
}

/** Text a teacher wrote into the lesson themselves; long enough to count as its notes. */
export const hasOwnNotes = (lesson: { content?: string | null }) => stripHtml(lesson.content ?? '').length > 400;

/** The lesson's saved notes, or the teacher's own lesson text when there are none. */
async function existingNotes(lesson: ContentLesson): Promise<string> {
  const { data } = await supabase.from('lesson_documents')
    .select('content_html').eq('lesson_id', lesson.id).eq('type', 'notes').maybeSingle();
  if (data?.content_html) return data.content_html;
  return hasOwnNotes(lesson) ? lesson.content ?? '' : '';
}

export interface LessonJob {
  section: ContentSection;
  lesson: ContentLesson;
  needNotes: boolean;
  needSlides: boolean;
  /** Also write the teacher's session plan for live classes. */
  needGuide?: boolean;
}

export interface CourseContext {
  courseId: string;
  courseTitle: string;
  plan: CoursePlan | null;
  sections: ContentSection[];
}

/** Short text from a lesson's initial content, used as its description when it has no notes yet. */
function lessonDescription(lesson: ContentLesson, hasNotes: boolean): string {
  if (lesson.description?.trim()) return lesson.description.trim().slice(0, 500);
  if (!hasNotes && lesson.content && lesson.content.length < 600) return stripHtml(lesson.content).slice(0, 500);
  return '';
}

/**
 * Generates one lesson's materials: complete study notes first, then a slide deck built
 * from those notes (so the slides cover the same depth). Each part is saved as soon as
 * it is ready, so a stopped run keeps what finished.
 */
export async function generateLessonMaterials(
  job: LessonJob,
  ctx: CourseContext,
  onStage?: (stage: 'notes' | 'slides' | 'guide') => void,
): Promise<void> {
  const { section, lesson } = job;
  const { target_audience, difficulty, brief } = audienceFromPlan(ctx.plan);
  const sectionIndex = ctx.sections.findIndex(s => s.id === section.id);
  const previousWeeks = ctx.sections.slice(Math.max(0, sectionIndex - 8), Math.max(0, sectionIndex))
    .map(s => `${s.title}${s.lessons.length ? ` (lessons: ${s.lessons.map(l => l.title).join('; ')})` : ''}`);

  let notesHtml = '';
  if (job.needNotes) {
    onStage?.('notes');
    const notes = await generateLessonNotes({
      lesson_title: lesson.title,
      section_title: section.title,
      course_title: ctx.courseTitle,
      target_audience,
      difficulty,
      lesson_description: lessonDescription(lesson, false),
      other_lessons: section.lessons.filter(l => l.id !== lesson.id).map(l => l.title),
      previous_weeks: previousWeeks,
      brief,
    });
    notesHtml = notes?.content_html?.trim() ?? '';
    if (!notesHtml) throw new Error('The AI returned empty notes.');
    await replaceDocument(lesson.id, ctx.courseId, 'notes', `${lesson.title} — Notes`, notesHtml, 0);
    // The lesson page shows this text for article lessons
    await supabase.from('lessons').update({ content: notesHtml }).eq('id', lesson.id);
  }

  if (job.needSlides) {
    if (!notesHtml) notesHtml = await existingNotes(lesson);
    if (!notesHtml) throw new Error('This lesson has no notes to build slides from.');
    onStage?.('slides');
    const deck = await generateLessonSlides({
      lesson_title: lesson.title,
      section_title: section.title,
      course_title: ctx.courseTitle,
      notes_text: stripHtml(notesHtml),
      brief,
    });
    if (!deck?.slides?.length) throw new Error('The AI returned no slides.');
    await replaceDocument(lesson.id, ctx.courseId, 'slides', deck.slides_title || `${lesson.title} — Slides`, slidesToHtml(deck.slides), 1);
  }

  if (job.needGuide) {
    if (!notesHtml) notesHtml = await existingNotes(lesson);
    if (!notesHtml) throw new Error('This lesson has no notes to plan a session from.');
    onStage?.('guide');
    const guide = await generateTeacherGuide({
      course_title: ctx.courseTitle,
      section_title: section.title,
      lesson_title: lesson.title,
      session_minutes: 60,
      notes_text: stripHtml(notesHtml),
      brief,
    });
    const { error } = await supabase.from('lesson_teacher_guides').upsert({
      lesson_id: lesson.id, course_id: ctx.courseId, content_html: guide.content_html, updated_at: new Date().toISOString(),
    });
    if (error) throw new Error('Could not save the teacher guide.');
  }
}

/** Runs async work with at most `limit` items in flight; stops starting new items when aborted. */
export async function runWithLimit<T>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<void>,
  signal?: AbortSignal,
): Promise<void> {
  let next = 0;
  const lane = async () => {
    while (next < items.length && !signal?.aborted) {
      const index = next++;
      await worker(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
}

/** Slide decks for the given lessons, in course order, ready for PowerPoint export. */
export async function loadSlideDecks(lessons: ContentLesson[]): Promise<SlideDeck[]> {
  if (lessons.length === 0) return [];
  const { data } = await supabase.from('lesson_documents')
    .select('lesson_id, title, content_html').eq('type', 'slides').in('lesson_id', lessons.map(l => l.id));
  const byLesson = new Map((data ?? []).map(d => [d.lesson_id, d]));
  return lessons
    .map(l => byLesson.get(l.id))
    .filter((d): d is NonNullable<typeof d> => !!d)
    .map(d => ({ title: d.title, slides: parseSlidesFromHtml(d.content_html) }));
}
