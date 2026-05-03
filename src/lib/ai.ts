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

const FUNCTIONS_BASE = import.meta.env.DEV
  ? '/functions/v1'
  : `${import.meta.env.VITE_SUPABASE_URL as string}/functions/v1`;

// Timeout per task in ms (client-side safety net — edge function has its own)
const TASK_TIMEOUT: Record<string, number> = {
  full_curriculum: 130000,
  section_content: 130000,
  section_notes: 100000,
  section_slides: 60000,
  lesson_notes: 60000,
  presentation_slides: 60000,
  lesson_content: 60000,
  generate_exam: 60000,
};
const DEFAULT_TIMEOUT = 60000;

export async function callAI<T>(task: string, input: object): Promise<T> {
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

  let session;
  try {
    const { data } = await supabase.auth.getSession();
    session = data.session;
  } catch {
    // proceed with anon key if session fetch fails
  }
  const token = session?.access_token ?? supabaseAnonKey;

  const timeoutMs = TASK_TIMEOUT[task] ?? DEFAULT_TIMEOUT;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(`${FUNCTIONS_BASE}/ai-generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'apikey': supabaseAnonKey,
      },
      body: JSON.stringify({ task, input }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`AI request timed out after ${Math.round(timeoutMs / 1000)}s. The server is taking too long — please try again.`);
    }
    throw new Error('Could not reach the AI service. Please check your internet connection and try again.');
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    let errMsg = `AI request failed (HTTP ${response.status})`;
    try {
      const rawText = await response.text();
      console.error(`[callAI] ${task} HTTP ${response.status} body:`, rawText.slice(0, 500));
      const errBody = JSON.parse(rawText) as { error?: string };
      if (errBody.error) errMsg = errBody.error;
    } catch { /* ignore parse failure — errMsg stays as HTTP status */ }
    throw new Error(errMsg);
  }

  let data: T;
  try {
    data = await response.json() as T;
  } catch {
    throw new Error('AI returned an unreadable response. Please try again.');
  }

  if (!data || typeof data !== 'object') {
    throw new Error('AI returned an empty or invalid response. Please try again.');
  }
  return data;
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

export interface GenerateExamInput {
  topic: string;
  course_context?: string;
  exam_type: 'reading_comprehension' | 'question_only';
  difficulty: string;
  num_questions: number;
  marks_per_question: number;
  target_audience?: string;
  extra_instructions?: string;
}

export interface GenerateExamQuestion {
  question: string;
  marks: number;
  sample_answer: string;
}

export interface GenerateExamOutput {
  title: string;
  description: string;
  instructions: string;
  passage: string;
  time_limit_minutes: number;
  questions: GenerateExamQuestion[];
}

export const generateExam = (input: GenerateExamInput) =>
  callAI<GenerateExamOutput>('generate_exam', input);

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

// ─── Split section notes + slides (two fast calls instead of one slow one) ───

export interface SectionNotesOutput {
  section_title: string;
  lessons: SectionContentLessonOutput[];
}

export interface SectionSlidesOutput {
  section_title: string;
  slides_title: string;
  slides: PresentationSlide[];
}

export const generateSectionNotes = (input: SectionContentInput) =>
  callAI<SectionNotesOutput>('section_notes', input);

export const generateSectionSlides = (input: SectionContentInput) =>
  callAI<SectionSlidesOutput>('section_slides', input);

export const aiHealthCheck = async (): Promise<AIHealthOutput> => {
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token ?? supabaseAnonKey;

  const response = await fetch(`${FUNCTIONS_BASE}/ai-health`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'apikey': supabaseAnonKey,
    },
  });
  if (!response.ok) throw new Error('Health check failed');
  return response.json() as Promise<AIHealthOutput>;
};
