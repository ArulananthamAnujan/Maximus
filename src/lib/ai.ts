import { supabase } from './supabase';

// ─── Input types ────────────────────────────────────────────────────────────

export interface CourseOutlineInput {
  topic: string;
  target_audience: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  num_modules: number;
  lessons_per_module: number;
  /** Plan agreed with the AI course planner; shapes the style, pacing and content. */
  brief?: CourseBrief;
}

export interface WebSource {
  title: string;
  url: string;
}

export interface CourseBrief {
  /** What employers currently ask for, from the planner's web research. */
  market_findings?: string[];
  title_idea: string;
  topic: string;
  audience: string;
  starting_level: string;
  outcome: string;
  target_roles: string[];
  market: string;
  duration_weeks: number;
  hours_per_week: number;
  approach: string;
  must_include: string[];
  projects: string[];
  assessment: string;
  tone: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  num_modules: number;
  lessons_per_module: number;
  lesson_minutes: number;
}

export interface PlannerMessage {
  role: 'teacher' | 'planner';
  content: string;
}

export interface PlannerReply {
  reply: string;
  suggestions?: string[];
  ready: boolean;
  brief: CourseBrief | null;
  /** The planner's running summary of its web research; send it back on the next turn. */
  research_notes?: string;
  /** Pages the planner actually found, accumulated over the conversation. */
  sources?: WebSource[];
  /** True when this reply involved a web search. */
  searched?: boolean;
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

// The server gives every AI request one overall time budget (135s) and always answers
// within it, with either a result or a clear message. The browser waits slightly longer
// than that, so it never gives up while the server is still working.
const CLIENT_TIMEOUT_MS = 145000;

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

  const timeoutMs = CLIENT_TIMEOUT_MS;
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
      throw new Error('The AI is taking longer than usual. Please try again, or ask for a smaller amount at a time.');
    }
    throw new Error('Could not reach the AI service. Please check your internet connection and try again.');
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    let errMsg = response.status === 504 || response.status === 546
      ? 'The AI took too long to respond. Please try again, or ask for a smaller amount at a time.'
      : 'AI generation failed. Please try again.';
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

// A whole outline in one request is fine for small courses. Bigger ones are too long for
// a single AI answer (it gets cut off or times out), so they are built in two quick steps:
// the course structure first, then the lessons for a few modules at a time, in parallel.
const SINGLE_CALL_MAX_LESSONS = 16;
const MODULES_PER_BATCH = 3;
const MAX_PARALLEL_REQUESTS = 4;

export interface OutlineProgress {
  stage: 'structure' | 'lessons';
  done: number;
  total: number;
}

async function withOneRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch {
    return await fn();
  }
}

/** One turn of the course-planning conversation. Send the whole conversation each time. */
export const plannerChat = (messages: PlannerMessage[], research: { notes: string; sources: WebSource[] }) =>
  callAI<PlannerReply>('course_planner_chat', { messages, research_notes: research.notes, sources: research.sources });

export async function generateCourseOutline(
  input: CourseOutlineInput,
  onProgress?: (p: OutlineProgress) => void,
): Promise<CourseOutlineOutput> {
  const numModules = Math.min(Math.max(Math.round(input.num_modules) || 5, 1), 12);
  const lessonsPerModule = Math.min(Math.max(Math.round(input.lessons_per_module) || 4, 1), 12);
  const safeInput = { ...input, num_modules: numModules, lessons_per_module: lessonsPerModule };

  if (numModules * lessonsPerModule <= SINGLE_CALL_MAX_LESSONS) {
    onProgress?.({ stage: 'structure', done: 0, total: 1 });
    return callAI<CourseOutlineOutput>('course_outline', safeInput);
  }

  onProgress?.({ stage: 'structure', done: 0, total: 1 });
  const skeleton = await withOneRetry(() => callAI<{ title: string; description: string; modules: Array<{ title: string; description: string }> }>(
    'course_skeleton',
    { topic: input.topic, target_audience: input.target_audience, difficulty: input.difficulty, num_modules: numModules, brief: input.brief },
  ));
  const modules = (skeleton.modules || []).slice(0, numModules);
  if (modules.length === 0) throw new Error('AI generation failed. Please try again.');

  // Fewer modules per request when each module has many lessons
  const perBatch = lessonsPerModule > 8 ? 1 : lessonsPerModule > 5 ? 2 : MODULES_PER_BATCH;
  const batches: Array<Array<{ title: string; description: string }>> = [];
  for (let i = 0; i < modules.length; i += perBatch) batches.push(modules.slice(i, i + perBatch));

  let done = 0;
  onProgress?.({ stage: 'lessons', done, total: batches.length });
  const allTitles = modules.map(m => m.title);

  type BatchResult = { modules: Array<{ title: string; lessons: AILessonItem[] }> };
  const results: BatchResult[] = new Array(batches.length);
  const runBatch = async (index: number) => {
    try {
      results[index] = await withOneRetry(() => callAI<BatchResult>('module_lessons', {
        course_title: skeleton.title,
        target_audience: input.target_audience,
        difficulty: input.difficulty,
        all_modules: allTitles,
        modules: batches[index],
        lessons_per_module: lessonsPerModule,
        brief: input.brief,
      }));
    } catch {
      // One part failing twice must not throw away the parts that worked.
      results[index] = { modules: [] };
    }
    done += 1;
    onProgress?.({ stage: 'lessons', done, total: batches.length });
  };

  // At most four requests at a time, so a big course does not trip rate limits.
  let next = 0;
  const worker = async () => {
    while (next < batches.length) {
      const index = next++;
      await runBatch(index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(MAX_PARALLEL_REQUESTS, batches.length) }, worker));

  // Stitch lessons back onto the structure, by title first and by position as a fallback
  const outModules: AIModuleItem[] = [];
  batches.forEach((batch, bi) => {
    const returned = results[bi]?.modules || [];
    batch.forEach((mod, mi) => {
      const match = returned.find(r => r.title?.trim().toLowerCase() === mod.title.trim().toLowerCase()) ?? returned[mi];
      const lessons = (match?.lessons || [])
        .filter(l => l && l.title)
        .slice(0, lessonsPerModule)
        .map(l => ({
          title: String(l.title),
          description: String(l.description ?? ''),
          estimated_duration_minutes: Number(l.estimated_duration_minutes) || input.brief?.lesson_minutes || 60,
        }));
      outModules.push({ title: mod.title, description: mod.description ?? '', lessons });
    });
  });

  if (outModules.every(m => m.lessons.length === 0)) throw new Error('AI generation failed. Please try again.');
  return { title: skeleton.title, description: skeleton.description, modules: outModules };
}

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
