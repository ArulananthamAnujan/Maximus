import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  generateCourseOutline, generateLessonContent, generateQuiz,
  generateFlashcards, summarizeLesson, rewriteContent, translateContent,
  aiHealthCheck,
  type CourseOutlineInput, type CourseOutlineOutput,
  type LessonContentInput, type LessonContentOutput,
  type QuizFromContentInput, type QuizFromContentOutput,
  type FlashcardsInput, type FlashcardsOutput,
  type SummarizeLessonInput, type SummarizeLessonOutput,
  type RewriteContentInput, type RewriteContentOutput,
  type TranslateContentInput, type TranslateContentOutput,
  type AIHealthOutput,
} from '../lib/ai';

const MUTATION_DEFAULTS = {
  retry: 1,
  retryDelay: 2000,
};

export function useGenerateCourseOutline() {
  return useMutation<CourseOutlineOutput, Error, CourseOutlineInput>({
    ...MUTATION_DEFAULTS,
    mutationFn: (input) => {
      toast.loading('Generating course outline...', { id: 'ai-course-outline' });
      return generateCourseOutline(input);
    },
    onSuccess: () => {
      toast.success('Course outline generated!', { id: 'ai-course-outline' });
    },
    onError: (err) => {
      toast.error(err.message || 'Failed to generate outline', { id: 'ai-course-outline' });
    },
  });
}

export function useGenerateLessonContent(lessonId?: string) {
  const qc = useQueryClient();
  return useMutation<LessonContentOutput, Error, LessonContentInput>({
    ...MUTATION_DEFAULTS,
    mutationFn: (input) => {
      toast.loading('Generating lesson content...', { id: 'ai-lesson-content' });
      return generateLessonContent(input);
    },
    onSuccess: () => {
      toast.success('Lesson content generated!', { id: 'ai-lesson-content' });
      if (lessonId) qc.invalidateQueries({ queryKey: ['lesson', lessonId] });
    },
    onError: (err) => {
      toast.error(err.message || 'Failed to generate content', { id: 'ai-lesson-content' });
    },
  });
}

export function useGenerateQuiz(courseId?: string) {
  const qc = useQueryClient();
  return useMutation<QuizFromContentOutput, Error, QuizFromContentInput>({
    ...MUTATION_DEFAULTS,
    mutationFn: (input) => {
      toast.loading('Generating quiz questions...', { id: 'ai-quiz' });
      return generateQuiz(input);
    },
    onSuccess: () => {
      toast.success('Quiz generated!', { id: 'ai-quiz' });
      if (courseId) qc.invalidateQueries({ queryKey: ['quizzes', courseId] });
    },
    onError: (err) => {
      toast.error(err.message || 'Failed to generate quiz', { id: 'ai-quiz' });
    },
  });
}

export function useGenerateFlashcards(lessonId?: string) {
  const qc = useQueryClient();
  return useMutation<FlashcardsOutput, Error, FlashcardsInput>({
    ...MUTATION_DEFAULTS,
    mutationFn: (input) => {
      toast.loading('Generating flashcards...', { id: 'ai-flashcards' });
      return generateFlashcards(input);
    },
    onSuccess: () => {
      toast.success('Flashcards generated!', { id: 'ai-flashcards' });
      if (lessonId) qc.invalidateQueries({ queryKey: ['flashcards', lessonId] });
    },
    onError: (err) => {
      toast.error(err.message || 'Failed to generate flashcards', { id: 'ai-flashcards' });
    },
  });
}

export function useSummarizeLesson(lessonId?: string) {
  const qc = useQueryClient();
  return useMutation<SummarizeLessonOutput, Error, SummarizeLessonInput>({
    ...MUTATION_DEFAULTS,
    mutationFn: (input) => {
      toast.loading('Generating summary...', { id: 'ai-summary' });
      return summarizeLesson(input);
    },
    onSuccess: () => {
      toast.success('Summary generated!', { id: 'ai-summary' });
      if (lessonId) qc.invalidateQueries({ queryKey: ['lesson', lessonId] });
    },
    onError: (err) => {
      toast.error(err.message || 'Failed to generate summary', { id: 'ai-summary' });
    },
  });
}

export function useRewriteContent() {
  return useMutation<RewriteContentOutput, Error, RewriteContentInput>({
    ...MUTATION_DEFAULTS,
    mutationFn: (input) => {
      toast.loading('Rewriting content...', { id: 'ai-rewrite' });
      return rewriteContent(input);
    },
    onSuccess: () => {
      toast.success('Content rewritten!', { id: 'ai-rewrite' });
    },
    onError: (err) => {
      toast.error(err.message || 'Failed to rewrite content', { id: 'ai-rewrite' });
    },
  });
}

export function useTranslateContent() {
  return useMutation<TranslateContentOutput, Error, TranslateContentInput>({
    ...MUTATION_DEFAULTS,
    mutationFn: (input) => {
      toast.loading('Translating content...', { id: 'ai-translate' });
      return translateContent(input);
    },
    onSuccess: () => {
      toast.success('Translation complete!', { id: 'ai-translate' });
    },
    onError: (err) => {
      toast.error(err.message || 'Failed to translate content', { id: 'ai-translate' });
    },
  });
}

export function useAIHealthCheck() {
  return useMutation<AIHealthOutput, Error, void>({
    mutationFn: () => aiHealthCheck(),
  });
}
