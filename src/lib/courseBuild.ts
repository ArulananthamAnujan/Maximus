import { supabase } from './supabase';
import { generateQuiz, draftAssessment } from './ai';
import { audienceFromPlan } from './coursePlan';
import type { CoursePlan } from './coursePlan';
import { stripHtml } from './slides';
import { sanitizeHtml } from './utils';

interface LessonRef { id: string; title: string; content?: string | null; description?: string | null }
interface WeekRef { id: string; title: string; lessons: LessonRef[] }

/** A week's lesson notes as plain text, for writing quizzes and projects from. */
export async function weekNotesText(lessons: LessonRef[], perLesson = 6000, limit = 16000): Promise<string> {
  if (lessons.length === 0) return '';
  const { data } = await supabase.from('lesson_documents')
    .select('lesson_id, content_html').eq('type', 'notes').in('lesson_id', lessons.map(l => l.id));
  const byLesson = new Map((data ?? []).map(d => [d.lesson_id, d.content_html as string]));
  return lessons
    .map(l => `## ${l.title}\n${stripHtml(byLesson.get(l.id) || l.content || l.description || '').slice(0, perLesson)}`)
    .join('\n\n')
    .slice(0, limit);
}

/** True when the notes text has enough substance to write questions from. */
export const hasEnoughNotes = (text: string) => text.replace(/##.*\n/g, '').trim().length >= 300;

/** Writes a quiz from a week's notes and adds it to that week, ready for students. */
export async function createWeekQuiz(courseId: string, week: WeekRef, plan: CoursePlan | null, numQuestions = 8): Promise<number> {
  const text = await weekNotesText(week.lessons);
  if (!hasEnoughNotes(text)) throw new Error('This week has no lesson notes to write a quiz from yet.');
  const r = await generateQuiz({
    lesson_content: text, num_questions: numQuestions, question_types: ['mcq', 'true_false'],
    difficulty: 'medium', brief: audienceFromPlan(plan).brief,
  });
  const qs = (r.questions ?? []).filter(q => q.question && q.correct_answer);
  if (qs.length === 0) throw new Error('The AI returned no usable questions.');
  const { data: quiz, error } = await supabase.from('quizzes').insert({
    course_id: courseId, section_id: week.id, title: `${week.title}: check your understanding`,
    pass_mark: 70, pass_percentage: 70, max_attempts: 3, is_published: true, is_required: true,
  }).select('id').single();
  if (error || !quiz) throw new Error('Could not create the quiz.');
  const { error: rowsErr } = await supabase.from('quiz_questions').insert(qs.map((q, i) => ({
    quiz_id: quiz.id,
    question: q.question,
    type: q.type === 'true_false' ? 'true_false' : 'mcq',
    options: q.options?.length ? q.options : ['True', 'False'],
    correct_answer: q.correct_answer,
    explanation: q.explanation || '',
    points: q.points || 1,
    order_index: i,
  })));
  if (rowsErr) {
    await supabase.from('quizzes').delete().eq('id', quiz.id);
    throw new Error('The quiz questions could not be saved.');
  }
  return qs.length;
}

/**
 * Drafts the capstone project from the whole course: brief, rubric, model answer and
 * marking notes. It is saved hidden, so the teacher checks it before students see it.
 */
export async function createCapstoneDraft(courseId: string, courseTitle: string, weeks: WeekRef[], plan: CoursePlan | null, teacherId: string | null): Promise<string> {
  const notes = await Promise.all(weeks.map(w => weekNotesText(w.lessons, 1500, 4000)));
  const r = await draftAssessment({
    kind: 'capstone',
    course_title: courseTitle,
    total_points: 100,
    weeks: weeks.map(w => `${w.title}${w.lessons.length ? ` (lessons: ${w.lessons.map(l => l.title).join('; ')})` : ''}`),
    notes_text: notes.join('\n\n').slice(0, 24000) || undefined,
    brief: audienceFromPlan(plan).brief,
  });
  const brief = sanitizeHtml(r.brief_html + (r.deliverables?.length
    ? `<h3>Deliverables</h3><ul>${r.deliverables.map(d => `<li>${d.replace(/</g, '&lt;')}</li>`).join('')}</ul>` : ''));
  let rubric = (r.rubric ?? []).map(c => ({
    name: String(c.name || 'Criterion'), points: Number(c.points) || 0,
    levels: (c.levels ?? []).map(l => ({ label: l.label, points: Number(l.points) || 0, descriptor: l.descriptor })),
  }));
  // The rubric must add up to the total; drop it rather than save one that does not.
  if (rubric.reduce((n, c) => n + c.points, 0) !== 100) rubric = [];
  const { data, error } = await supabase.from('assignments').insert({
    course_id: courseId,
    teacher_id: teacherId,
    section_id: null,
    kind: 'capstone',
    title: r.title || `${courseTitle}: capstone project`,
    description: stripHtml(brief).slice(0, 400),
    brief_html: brief,
    rubric,
    resources: (r.resources ?? []).filter(x => x.title).map(x => ({ title: x.title, note: x.note })),
    estimated_minutes: r.estimated_minutes ? Math.round(r.estimated_minutes) : null,
    total_points: 100,
    is_published: false,
  }).select('id').single();
  if (error || !data) throw new Error('Could not save the capstone project.');
  await supabase.from('assignment_private').upsert({
    assignment_id: data.id, course_id: courseId,
    solution_html: sanitizeHtml(r.solution_html || ''), marking_notes: r.marking_notes || '',
    updated_at: new Date().toISOString(),
  });
  return data.id;
}
