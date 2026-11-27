import { supabase } from './supabase';
import type { CourseBrief, PlannerMessage, WebSource, MaterialSummary } from './ai';

/** The plan agreed with the AI course planner, saved on the course (courses.ai_plan). */
export interface CoursePlan {
  brief: CourseBrief | null;
  research_notes: string;
  sources: WebSource[];
  messages: PlannerMessage[];
  /** The teacher's own material the course is built around, when one was uploaded. */
  material?: (MaterialSummary & { file_name: string }) | null;
  updated_at: string;
}

export async function loadCoursePlan(courseId: string): Promise<CoursePlan | null> {
  const { data } = await supabase.from('courses').select('ai_plan').eq('id', courseId).maybeSingle();
  const plan = data?.ai_plan as CoursePlan | null | undefined;
  return plan && typeof plan === 'object' ? plan : null;
}

/** Saves the plan; keeps the conversation short enough to store comfortably. */
export async function saveCoursePlan(courseId: string, plan: Omit<CoursePlan, 'updated_at'>): Promise<void> {
  if (plan.material === undefined) {
    // Keep material uploaded earlier unless this save replaces it
    const existing = await loadCoursePlan(courseId);
    plan = { ...plan, material: existing?.material ?? null };
  }
  const value: CoursePlan = {
    ...plan,
    messages: plan.messages.slice(-40),
    sources: plan.sources.slice(0, 12),
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from('courses').update({ ai_plan: value }).eq('id', courseId);
  if (error) console.warn('Could not save the course plan:', error.message);
}

/** A short text version of the uploaded material for the planner. */
export function materialForPlanner(material: CoursePlan['material']): string {
  if (!material) return '';
  const weeks = material.suggested_weeks.map((w, i) => `${i + 1}. ${w.title}: ${w.lessons.join('; ')}`).join('\n');
  return `File: ${material.file_name}\n${material.summary}\nTopics: ${material.topics.join(', ')}${weeks ? `\nIts structure:\n${weeks}` : ''}${material.notes_for_planner ? `\nNotes: ${material.notes_for_planner}` : ''}`;
}

/** Learners and level to write for: from the saved plan when there is one. */
export function audienceFromPlan(plan: CoursePlan | null, fallbackLevel = 'intermediate') {
  const b = plan?.brief;
  const material = plan?.material?.summary;
  const brief = b
    ? { ...b, ...(material ? { teacher_material: material } : {}) }
    : material ? ({ teacher_material: material } as CourseBrief) : undefined;
  return {
    target_audience: b ? [b.audience, b.starting_level].filter(Boolean).join(', ') || 'general learners' : 'general learners',
    difficulty: b?.difficulty || fallbackLevel,
    brief,
  };
}
