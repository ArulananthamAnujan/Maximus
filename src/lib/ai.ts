import { supabase } from './supabase';

// ─── Input types ────────────────────────────────────────────────────────────

export interface CourseOutlineInput {
  topic: string;
  target_audience: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  num_modules: number;
  lessons_per_module: number;
}

export interface LessonContentInput {
  lesson_title: string;
  course_context: string;
  target_audience: string;
  desired_length: 'short' | 'medium' | 'long';
}

export interface QuizFromContentInput {
  lesson_content: string;
  num_questions: number;
  question_types: ('mcq' | 'true_false' | 'short_answer')[];
  difficulty: 'easy' | 'medium' | 'hard';
}

export interface FlashcardsInput {
  lesson_content: string;
  num_cards: number;
}

export interface SummarizeLessonInput {
  lesson_content: string;
}

export interface RewriteContentInput {
  content: string;
  style: 'simpler' | 'more_detailed' | 'more_concise' | 'more_engaging';
}

export interface TranslateContentInput {
  content: string;
  target_language: string;
}

export interface ActivityIdeasInput {
  lesson_title: string;
  course_context: string;
  target_audience: string;
  num_activities: number;
}

export interface FullCurriculumInput {
  topic: string;
  target_audience: string;
  difficulty: string;
  num_sections: number;
  lessons_per_section: number;
  existing_sections_summary?: string;
}

// ─── Output types ───────────────────────────────────────────────────────────

export interface AILessonItem {
  title: string;
  description: string;
  estimated_duration_minutes: number;
}

export interface AIModuleItem {
  title: string;
  description: string;
  lessons: AILessonItem[];
}

export interface CourseOutlineOutput {
  title: string;
  description: string;
  modules: AIModuleItem[];
}

export interface LessonContentOutput {
  content_html: string;
  key_points: string[];
  estimated_read_time_minutes: number;
}

export interface AIQuizQuestion {
  type: 'mcq' | 'true_false' | 'short_answer';
  question: string;
  options?: string[];
  correct_answer: string;
  explanation: string;
  points: number;
}

export interface QuizFromContentOutput {
  questions: AIQuizQuestion[];
}

export interface Flashcard {
  front: string;
  back: string;
}

export interface FlashcardsOutput {
  cards: Flashcard[];
}

export interface SummarizeLessonOutput {
  summary: string;
  key_takeaways: string[];
}

export interface RewriteContentOutput {
  rewritten_content: string;
}

export interface TranslateContentOutput {
  translated_content: string;
}

export interface AIActivity {
  title: string;
  type: 'practice' | 'reflection' | 'discussion' | 'project' | 'research';
  instructions: string;
  estimated_minutes: number;
}

export interface ActivityIdeasOutput {
  activities: AIActivity[];
}

export interface AICurriculumLesson {
  title: string;
  type: 'article' | 'document';
  estimated_duration_minutes: number;
  description: string;
}

export interface AICurriculumQuizQuestion {
  type: 'mcq' | 'true_false';
  question: string;
  options: string[];
  correct_answer: string;
  explanation: string;
  points: number;
}

export interface AICurriculumSection {
  title: string;
  lessons: AICurriculumLesson[];
  quiz: {
    title: string;
    questions: AICurriculumQuizQuestion[];
  };
  activities: AIActivity[];
}

export interface FullCurriculumOutput {
  sections: AICurriculumSection[];
}

export interface AIHealthOutput {
  key_present: boolean;
  key_works: boolean;
  model: string;
  latency_ms: number;
}

// ─── Core wrapper ───────────────────────────────────────────────────────────

const LONG_TASKS = new Set(['lesson_notes', 'presentation_slides', 'section_content', 'full_curriculum', 'lesson_content']);

export async function callAI<T>(task: string, input: object): Promise<T> {
  const { data, error } = await supabase.functions.invoke('ai-generate', {
    body: { task, input },
    // Long-running tasks need more time; supabase-js default is no timeout
  });

  if (error) {
    // Supabase wraps network errors as FunctionsFetchError — surface a cleaner message
    const raw = typeof error === 'object' && 'message' in error
      ? (error as { message: string }).message
      : String(error);
    const msg = raw.includes('Failed to send')
      ? 'Could not reach the AI service. Please check your connection and try again.'
      : raw || 'AI request failed';
    throw new Error(msg);
  }

  if (!data) throw new Error('AI returned an empty response. Please try again.');
  return data as T;
}

// ─── Typed helpers ───────────────────────────────────────────────────────────

export const generateCourseOutline = (input: CourseOutlineInput) =>
  callAI<CourseOutlineOutput>('course_outline', input);

export const generateLessonContent = (input: LessonContentInput) =>
  callAI<LessonContentOutput>('lesson_content', input);

export const generateQuiz = (input: QuizFromContentInput) =>
  callAI<QuizFromContentOutput>('quiz_from_content', input);

export const generateFlashcards = (input: FlashcardsInput) =>
  callAI<FlashcardsOutput>('flashcards', input);

export const summarizeLesson = (input: SummarizeLessonInput) =>
  callAI<SummarizeLessonOutput>('summarize_lesson', input);

export const rewriteContent = (input: RewriteContentInput) =>
  callAI<RewriteContentOutput>('rewrite_content', input);

export const translateContent = (input: TranslateContentInput) =>
  callAI<TranslateContentOutput>('translate_content', input);

export const generateActivityIdeas = (input: ActivityIdeasInput) =>
  callAI<ActivityIdeasOutput>('activity_ideas', input);

export const generateFullCurriculum = (input: FullCurriculumInput) =>
  callAI<FullCurriculumOutput>('full_curriculum', input);

export interface LessonNotesInput {
  lesson_title: string;
  section_title: string;
  course_title: string;
  target_audience: string;
  difficulty: string;
}

export interface LessonNotesOutput {
  title: string;
  content_html: string;
  key_points: string[];
  estimated_read_time_minutes: number;
}

export interface PresentationSlidesInput {
  section_title: string;
  course_title: string;
  lesson_titles: string;
  target_audience: string;
  difficulty: string;
}

export interface PresentationSlide {
  slide_number: number;
  heading: string;
  content_html: string;
  speaker_notes: string;
}

export interface PresentationSlidesOutput {
  title: string;
  slides: PresentationSlide[];
}

export const generateLessonNotes = (input: LessonNotesInput) =>
  callAI<LessonNotesOutput>('lesson_notes', input);

export const generatePresentationSlides = (input: PresentationSlidesInput) =>
  callAI<PresentationSlidesOutput>('presentation_slides', input);

// ─── Batch section content (1 call generates all lesson notes + slides for a section) ──

export interface SectionContentLesson {
  title: string;
  description: string;
}

export interface SectionContentInput {
  section_title: string;
  course_title: string;
  lessons: SectionContentLesson[];
  target_audience: string;
  difficulty: string;
  existing_sections_summary?: string;
}

export interface SectionContentLessonOutput {
  lesson_title: string;
  notes_html: string;
  key_points: string[];
}

export interface SectionContentOutput {
  section_title: string;
  lessons: SectionContentLessonOutput[];
  slides: PresentationSlide[];
  slides_title: string;
}

export const generateSectionContent = (input: SectionContentInput) =>
  callAI<SectionContentOutput>('section_content', input);

export const aiHealthCheck = async (): Promise<AIHealthOutput> => {
  const { data, error } = await supabase.functions.invoke('ai-health', {});
  if (error) throw new Error('Health check failed');
  return data as AIHealthOutput;
};
