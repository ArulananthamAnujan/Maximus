import { supabase } from './supabase';
import { suggestMarks } from './ai';
import type { MarkSuggestion } from './ai';
import { stripHtml } from './slides';
import type { RubricCriterion } from './workspace';

export type { MarkSuggestion };

export interface MarkableAssignment {
  id: string;
  course_id: string;
  title: string;
  total_points: number | null;
  rubric: RubricCriterion[];
  brief_html?: string | null;
  description?: string | null;
}

export interface MarkableSubmission {
  id: string;
  content: string | null;
  file_url: string | null;
}

/** Rubric scores from a suggestion, snapped to the nearest level of each criterion. */
export function suggestionToScores(rubric: RubricCriterion[], s: MarkSuggestion): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of rubric) {
    const hit = s.criteria.find(x => x.name.trim().toLowerCase() === c.name.trim().toLowerCase());
    if (!hit) continue;
    const levels = c.levels.length ? c.levels.map(l => l.points) : [c.points, 0];
    out[c.name] = levels.reduce((best, p) => (Math.abs(p - hit.points) < Math.abs(best - hit.points) ? p : best), levels[0]);
  }
  return out;
}

/** The suggested total, after snapping to rubric levels. */
export function suggestedTotal(a: MarkableAssignment, s: MarkSuggestion): number {
  const total = a.total_points ?? 100;
  if (a.rubric.length) return Object.values(suggestionToScores(a.rubric, s)).reduce((n, p) => n + p, 0);
  return Math.max(0, Math.min(total, Math.round(s.total)));
}

/** Asks the AI to mark one submission and keeps the suggestion (staff only) for the teacher to check. */
export async function requestMarkSuggestion(a: MarkableAssignment, sub: MarkableSubmission): Promise<MarkSuggestion> {
  const text = (sub.content ?? '').trim();
  if (!text) throw new Error('There is no written answer to mark.');
  const { data: priv } = await supabase.from('assignment_private')
    .select('solution_html, marking_notes').eq('assignment_id', a.id).maybeSingle();
  const s = await suggestMarks({
    assignment_title: a.title,
    total_points: a.total_points ?? 100,
    brief_text: stripHtml(a.brief_html || a.description || '').slice(0, 8000),
    rubric: a.rubric.map(c => ({ name: c.name, points: c.points, levels: c.levels.map(l => ({ label: l.label, points: l.points, descriptor: l.descriptor })) })),
    model_answer: priv?.solution_html ? stripHtml(priv.solution_html).slice(0, 8000) : undefined,
    marking_notes: priv?.marking_notes || undefined,
    submission_text: text,
    attachment_note: sub.file_url ? 'The student also attached a file or link, which you cannot see.' : undefined,
  });
  const clean: MarkSuggestion = {
    criteria: (s.criteria ?? []).map(c => ({ name: String(c.name), level: c.level, points: Number(c.points) || 0, reason: String(c.reason ?? '') })),
    total: Number(s.total) || 0,
    feedback: String(s.feedback ?? ''),
    confidence: s.confidence === 'high' || s.confidence === 'low' ? s.confidence : 'medium',
    flags: Array.isArray(s.flags) ? s.flags.map(String).slice(0, 6) : [],
  };
  const { data: { user } } = await supabase.auth.getUser();
  await supabase.from('submission_ai_marks').upsert({
    submission_id: sub.id, assignment_id: a.id, course_id: a.course_id, suggestion: clean,
    created_by: user?.id ?? null, created_at: new Date().toISOString(),
  });
  return clean;
}

export async function loadMarkSuggestions(assignmentId: string): Promise<Map<string, MarkSuggestion>> {
  const { data } = await supabase.from('submission_ai_marks').select('submission_id, suggestion').eq('assignment_id', assignmentId);
  return new Map((data ?? []).map(r => [r.submission_id as string, r.suggestion as MarkSuggestion]));
}

export async function loadMarkSuggestion(submissionId: string): Promise<MarkSuggestion | null> {
  const { data } = await supabase.from('submission_ai_marks').select('suggestion').eq('submission_id', submissionId).maybeSingle();
  return (data?.suggestion as MarkSuggestion | undefined) ?? null;
}
