import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// ─── Validators ──────────────────────────────────────────────────────────────

function validateCourseOutline(obj: unknown): boolean {
  const o = obj as Record<string, unknown>;
  return typeof o.title === 'string' && typeof o.description === 'string' && Array.isArray(o.modules);
}
function validateLessonContent(obj: unknown): boolean {
  const o = obj as Record<string, unknown>;
  return typeof o.content_html === 'string' && Array.isArray(o.key_points);
}
function validateQuizFromContent(obj: unknown): boolean {
  return Array.isArray((obj as Record<string, unknown>).questions);
}
function validateFlashcards(obj: unknown): boolean {
  return Array.isArray((obj as Record<string, unknown>).cards);
}
function validateSummarize(obj: unknown): boolean {
  const o = obj as Record<string, unknown>;
  return typeof o.summary === 'string' && Array.isArray(o.key_takeaways);
}
function validateRewrite(obj: unknown): boolean {
  return typeof (obj as Record<string, unknown>).rewritten_content === 'string';
}
function validateTranslate(obj: unknown): boolean {
  return typeof (obj as Record<string, unknown>).translated_content === 'string';
}
function validateActivityIdeas(obj: unknown): boolean {
  return Array.isArray((obj as Record<string, unknown>).activities);
}
function validateFullCurriculum(obj: unknown): boolean {
  return Array.isArray((obj as Record<string, unknown>).sections);
}
function validateLessonNotes(obj: unknown): boolean {
  const o = obj as Record<string, unknown>;
  return typeof o.content_html === 'string' && typeof o.title === 'string';
}
function validatePresentationSlides(obj: unknown): boolean {
  const o = obj as Record<string, unknown>;
  return typeof o.title === 'string' && Array.isArray(o.slides);
}
function validateSectionContent(obj: unknown): boolean {
  const o = obj as Record<string, unknown>;
  return typeof o.section_title === 'string' && Array.isArray(o.lessons) && Array.isArray(o.slides);
}
function validateSectionNotes(obj: unknown): boolean {
  const o = obj as Record<string, unknown>;
  return typeof o.section_title === 'string' && Array.isArray(o.lessons);
}
function validateSectionSlides(obj: unknown): boolean {
  const o = obj as Record<string, unknown>;
  return typeof o.section_title === 'string' && Array.isArray(o.slides);
}
function validateGenerateExam(obj: unknown): boolean {
  const o = obj as Record<string, unknown>;
  return typeof o.title === 'string' && typeof o.passage === 'string' && Array.isArray(o.questions);
}

function validateCourseSkeleton(obj: unknown): boolean {
  const o = obj as Record<string, unknown>;
  return typeof o.title === 'string' && typeof o.description === 'string' && Array.isArray(o.modules) && o.modules.length > 0;
}
function validateModuleLessons(obj: unknown): boolean {
  const o = obj as Record<string, unknown>;
  return Array.isArray(o.modules) && o.modules.length > 0
    && (o.modules as Array<Record<string, unknown>>).every(m => Array.isArray(m.lessons));
}

function validatePlannerChat(obj: unknown): boolean {
  const o = obj as Record<string, unknown>;
  if (typeof o.reply !== 'string' || !o.reply.trim() || typeof o.ready !== 'boolean') return false;
  return !o.ready || (o.brief !== null && typeof o.brief === 'object');
}

function validateLessonSlides(obj: unknown): boolean {
  const o = obj as Record<string, unknown>;
  return Array.isArray(o.slides) && o.slides.length > 0
    && (o.slides as Array<Record<string, unknown>>).every(sl => typeof sl.heading === 'string' && typeof sl.content_html === 'string');
}

function validateHtmlOnly(obj: unknown): boolean {
  const o = obj as Record<string, unknown>;
  return typeof o.content_html === 'string' && o.content_html.trim().length > 50;
}
function validateAssessmentDraft(obj: unknown): boolean {
  const o = obj as Record<string, unknown>;
  return typeof o.title === 'string' && typeof o.brief_html === 'string' && o.brief_html.length > 50 && Array.isArray(o.rubric);
}
function validateMaterialSummary(obj: unknown): boolean {
  const o = obj as Record<string, unknown>;
  return typeof o.summary === 'string' && Array.isArray(o.topics);
}

const validators: Record<string, (o: unknown) => boolean> = {
  improve_notes: validateHtmlOnly,
  teacher_guide: validateHtmlOnly,
  assessment_draft: validateAssessmentDraft,
  summarize_material: validateMaterialSummary,
  course_planner_chat: validatePlannerChat,
  lesson_slides: validateLessonSlides,
  course_outline: validateCourseOutline,
  course_skeleton: validateCourseSkeleton,
  module_lessons: validateModuleLessons,
  lesson_content: validateLessonContent,
  quiz_from_content: validateQuizFromContent,
  flashcards: validateFlashcards,
  summarize_lesson: validateSummarize,
  rewrite_content: validateRewrite,
  translate_content: validateTranslate,
  activity_ideas: validateActivityIdeas,
  full_curriculum: validateFullCurriculum,
  lesson_notes: validateLessonNotes,
  presentation_slides: validatePresentationSlides,
  section_content: validateSectionContent,
  section_notes: validateSectionNotes,
  section_slides: validateSectionSlides,
  generate_exam: validateGenerateExam,
};

// ─── Sanitize ────────────────────────────────────────────────────────────────

function sanitizeField(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '').slice(0, 100000);
}

function sanitizeValue(v: unknown): unknown {
  if (typeof v === 'string') return sanitizeField(v);
  if (typeof v === 'number' || typeof v === 'boolean') return v;
  if (Array.isArray(v)) return v.map(sanitizeValue);
  if (v !== null && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      out[k] = sanitizeValue(val);
    }
    return out;
  }
  return v;
}

function sanitizeInput(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    out[k] = sanitizeValue(v);
  }
  return out;
}

// ─── System prompts ──────────────────────────────────────────────────────────

function getSystemPrompt(task: string): string {
  const jsonRule = 'Return ONLY valid JSON. No markdown fences, no preamble, no explanation. Output nothing except the JSON object.';

  const prompts: Record<string, string> = {

    course_outline: `You are a senior university curriculum architect with expertise in designing rigorous, research-informed degree-level courses. ${jsonRule}
Output shape: {"title": string, "description": string, "modules": [{"title": string, "description": string, "lessons": [{"title": string, "description": string, "estimated_duration_minutes": number}]}]}
Standards:
- title: A precise, academic course title (e.g. "Advanced Molecular Biology: Gene Expression and Regulation")
- description: 3-4 sentences. State the course rationale, theoretical framework, learning scope, and expected graduate-level outcomes. Use formal academic register.
- Each module title: topic-focused, university-level (e.g. "Module 3: Epigenetic Mechanisms and Chromatin Remodelling")
- Each module description: 2 sentences — what the module covers and its academic significance in the broader discipline
- Each lesson title: specific and descriptive (e.g. "Histone Modification Patterns and Transcriptional Regulation")
- Each lesson description: 1-2 sentences covering the specific concept, theory, or skill addressed
- estimated_duration_minutes: 45-90 minutes per lesson (university lecture/seminar pacing)`,

    course_planner_chat: `You are an experienced curriculum consultant. A teacher is planning a new course with you in a conversation. Your job is to understand who the course is for and what result the learners need, recommend the best way to teach it, and then hand over a clear course brief. ${jsonRule}
Output shape: {"reply": string, "suggestions": string[], "ready": boolean, "research_notes": string, "brief": null | {"market_findings": string[], "title_idea": string, "topic": string, "audience": string, "starting_level": string, "outcome": string, "target_roles": string[], "market": string, "duration_weeks": number, "hours_per_week": number, "approach": string, "must_include": string[], "projects": string[], "assessment": string, "tone": string, "difficulty": "beginner"|"intermediate"|"advanced", "num_modules": number, "lessons_per_module": number, "lesson_minutes": number}}

You can search the web. Use it to ground the plan in evidence, not for small talk:
- As soon as you know the skill or target job AND where the learners will look for work, search for what employers there currently ask for: recent job ads for that role, the tools and skills they list, entry-level requirements, and typical pay or demand. Two or three focused searches are enough.
- Do this once. If "Research already done" is given below, rely on it and do not search again unless the teacher changes the target job or the location.
- Do not search before you know the target and the location; ask for them first.
- Write what you learned into "research_notes": six to ten short factual lines (skills and tools employers ask for most, common entry requirements, anything that should shape the course). Only include what the search results support. If the results were thin or you could not search, say so plainly in research_notes and in your reply, and mark any advice that is your general knowledge as such.
- Tell the teacher briefly what you found and how it changes your recommendation.

Extending an existing course: when "Existing course" is given below, the teacher is adding to or improving a course that already exists. Read its outline and the plan agreed earlier first; do not ask about anything they already answer. Recommend what to add next (new weeks, deeper coverage, projects, job-search preparation) without repeating weeks that exist. In the brief, num_modules is the number of NEW weeks to add (1 to 12), title_idea is the existing course title, and "approach" should say what the new weeks focus on.

Pinning down specifics is your job, not the teacher's. Before you finish you must know, or have openly assumed: the exact skill or job role the course leads to, the country or city where learners will look for work, their starting level, and the time they have. If the teacher answers vaguely ("students", "get a job"), offer two to four concrete options to pick from rather than accepting the vague answer.

How to run the conversation:
- Work out, over the conversation: (1) who the learners are: background, current level, situation; (2) the result they need: a specific job role, freelance work, an exam, a promotion; (3) time available: total weeks and hours per week; (4) the market: country or industry, and what employers there actually ask for; (5) how learners will prove the skill: projects, a portfolio, a capstone, a certificate; (6) limits: tools, budget, language, prerequisites.
- Ask at most two short questions per turn, in plain everyday language. Never repeat a question that has been answered. Where the teacher is unsure, propose a sensible answer yourself and say you are assuming it.
- Be an adviser, not a form. Give your own recommendation. For example, a short course meant to get people hired should be built around real tasks from the job, the tools employers list in job ads, a few portfolio pieces the learner can show, and job-search preparation, with little theory beyond what the tasks need.
- "suggestions": two to four short answers the teacher could tap in reply to your question (a few words each). Use an empty array when ready is true.
- Set "ready" to true once you know enough to design a good course (usually after three to five teacher messages), or as soon as the teacher asks you to go ahead. Do not keep asking for the sake of it.
- When ready is true: "reply" is a short plain summary of the plan: who it is for, what they will be able to do at the end, how long it runs, the teaching approach and why, and the projects. End by saying they can create the curriculum now or ask for changes. Fill in every field of "brief"; make reasonable choices for anything not discussed.
- "brief.market_findings": the four to eight research findings that most shaped the course (skills, tools, requirements employers ask for). Empty array if no research was possible.
- "research_notes": always return it. Repeat the earlier notes unchanged when you did not search this turn; empty string if no research has been done yet.
- When ready is false, "brief" is null.
- If the teacher asks for changes after a brief was given, apply them and return the updated brief with ready true.
- Brief sizing: num_modules 3 to 12 and lessons_per_module 3 to 12, sized to the time available (a short job-skills course is usually 4 to 6 modules of 3 to 5 lessons); lesson_minutes 15 to 90.
- "reply" is plain text: no markdown, no headings, no bullet symbols.`,

    course_skeleton: `You are an expert curriculum designer. Match the style and level to the learners described; when a course brief is given it decides the style. ${jsonRule}
Output shape: {"title": string, "description": string, "modules": [{"title": string, "description": string}]}
Standards:
- title: a precise, academic course title
- description: 3-4 sentences covering rationale, scope and outcomes, in formal academic register
- modules: exactly the requested number, in a logical teaching order with no overlap between modules
- Each module title is topic-focused (e.g. "Module 3: Epigenetic Mechanisms and Chromatin Remodelling"); each module description is 2 sentences
- Do NOT include lessons`,

    module_lessons: `You are an expert curriculum designer writing the lesson plan for some modules of an existing course. Match the style and level to the learners described; when a course brief is given it decides the style. ${jsonRule}
Output shape: {"modules": [{"title": string, "lessons": [{"title": string, "description": string, "estimated_duration_minutes": number}]}]}
Standards:
- Return one entry per module you were asked to plan, in the same order, with "title" copied exactly as given
- Exactly the requested number of lessons per module
- Each lesson title is specific and descriptive; each lesson description is 1-2 sentences
- Lessons must not duplicate topics that belong to the other modules of the course
- estimated_duration_minutes: 45-90, unless a course brief gives a typical lesson length, in which case use that`,

    lesson_content: `You are a university lecturer and academic content author writing scholarly, comprehensive lesson material for tertiary-level students. ${jsonRule}
Output shape: {"content_html": string, "key_points": string[], "estimated_read_time_minutes": number}
Standards for content_html (target 1200-2000 words):
- Use semantic HTML: h2 for major sections, h3 for subsections, p for paragraphs, ul/ol/li for lists, strong for key terms, em for emphasis, code for formulas/code, blockquote for definitions or cited material
- No scripts, no inline styles, no external references
Structure (all sections required):
  1. <h2>Introduction</h2> — establish context, theoretical importance, real-world relevance (150-200 words)
  2. <h2>Learning Objectives</h2> — 4-6 specific, measurable outcomes using Bloom's taxonomy verbs (analyse, evaluate, synthesise, apply, etc.)
  3. <h2>[Core Concept 1]</h2> — detailed explanation with mechanisms, theory, examples (200-300 words each; include at minimum 3 core concept sections)
  4. <h2>Worked Example / Case Study</h2> — a concrete, discipline-specific worked example or real-world application (150-200 words)
  5. <h2>Critical Analysis</h2> — academic debate, limitations, contrasting perspectives or methodological considerations (150-200 words)
  6. <h2>Summary</h2> — consolidate key insights with reference back to learning objectives (100-150 words)
key_points: 6-10 academically precise bullet points, each a complete sentence
estimated_read_time_minutes: realistic estimate at 200 words/min`,

    quiz_from_content: `You are a university assessment designer creating rigorous academic quiz questions that test deep understanding, critical thinking, and application of knowledge. ${jsonRule}
Output shape: {"questions": [{"type": "mcq"|"true_false"|"short_answer", "question": string, "options": string[]|null, "correct_answer": string, "explanation": string, "points": number}]}
Standards:
- mcq: 4 options. Questions should target analysis/evaluation/application (Bloom's levels 4-6), not mere recall. Distractors must be plausible and reflect common misconceptions. correct_answer must exactly match one option string.
- true_false: options must be ["True", "False"]. Statements should test nuanced understanding, not obvious facts.
- short_answer: options must be null. Question should require a 2-4 sentence academic response demonstrating understanding.
- explanation: 2-3 sentences explaining why the answer is correct, referencing the underlying concept or theory. Must be academically rigorous.
- points: 1 for true_false, 2 for mcq, 3-5 for short_answer based on complexity
- Vary cognitive levels across the question set (at least one each of: comprehension, application, analysis)`,

    flashcards: `You are a university academic creating high-quality study flashcards for tertiary-level students. ${jsonRule}
Output shape: {"cards": [{"front": string, "back": string}]}
Standards:
- front: A precisely worded question, term definition request, or conceptual prompt using academic language. Avoid trivial recall; test understanding.
- back: A complete, academically accurate answer (2-5 sentences). For definitions: include the term, its definition, its significance, and an illustrative example. For concepts: explain the mechanism or principle, why it matters, and one application.
- Cover: key terminology, theoretical frameworks, methodological concepts, critical distinctions, and application scenarios
- Cards should progress from foundational concepts to advanced synthesis`,

    summarize_lesson: `You are a university academic writing a scholarly executive summary for tertiary-level students. ${jsonRule}
Output shape: {"summary": string, "key_takeaways": string[]}
Standards:
- summary: 4-6 sentences in formal academic register. Must cover: (1) the central theoretical argument or framework, (2) the key empirical or conceptual content, (3) how concepts interconnect, and (4) the broader academic or professional significance.
- key_takeaways: 6-10 items. Each must be a complete sentence. Cover: core concepts and their definitions, theoretical frameworks, methodological insights, critical perspectives, and implications for practice or further study. Use precise academic language.`,

    rewrite_content: `You are a university-level academic editor and educational content specialist. Rewrite the provided content in the requested style while preserving complete academic accuracy, depth, and all factual information. ${jsonRule}
Output shape: {"rewritten_content": string}
Standards:
- Maintain ALL key concepts, data, and academic arguments from the original
- Adapt register, structure, and vocabulary to match the requested style
- Do not simplify or omit substantive academic content when rewriting for accessibility
- Improve clarity, flow, and academic precision in all cases`,

    translate_content: `You are an expert academic translator specialising in educational and scholarly content. Translate accurately while preserving the complete academic meaning, technical terminology, register, and structural formatting of the original. ${jsonRule}
Output shape: {"translated_content": string}
Standards:
- Preserve all HTML tags and structure exactly
- Translate technical and discipline-specific terms accurately; do not paraphrase concepts
- Maintain the formal academic register of the source text
- Preserve all examples, citations, and specific data points`,

    activity_ideas: `You are a university instructional designer creating evidence-based, higher-order learning activities aligned with constructivist and active learning pedagogies. ${jsonRule}
Output shape: {"activities": [{"title": string, "type": "practice"|"reflection"|"discussion"|"project"|"research", "instructions": string, "estimated_minutes": number}]}
Standards:
- Each activity must target Bloom's taxonomy levels 3-6 (apply, analyse, evaluate, create)
- instructions: 4-6 sentences. Specify: (1) the academic task and its purpose, (2) required inputs/resources, (3) step-by-step process, (4) expected output or deliverable, (5) assessment criteria or success indicators
- practice: disciplinary problem-solving or skill application with real-world data/scenarios
- reflection: structured critical self-assessment using academic frameworks (e.g. Gibbs' model)
- discussion: Socratic seminar or structured academic debate with prescribed positions or frameworks
- project: multi-stage research or design task with defined scope, methodology, and deliverable
- research: systematic literature review, data analysis, or empirical investigation task
- estimated_minutes: 45-180 minutes (university task pacing)`,

    full_curriculum: `You are a senior university curriculum designer with expertise in academic programme development, following QAA, AQF, or equivalent tertiary education standards. ${jsonRule}
Output shape: {
  "sections": [{
    "title": string,
    "lessons": [{"title": string, "type": "article"|"document", "estimated_duration_minutes": number, "description": string}],
    "quiz": {"title": string, "questions": [{"type": "mcq"|"true_false", "question": string, "options": string[], "correct_answer": string, "explanation": string, "points": number}]},
    "activities": [{"title": string, "type": "practice"|"reflection"|"discussion"|"project"|"research", "instructions": string, "estimated_minutes": number}]
  }]
}
Standards:
- Each section title: "Week N: [Topic]" or "Module N: [Topic]" — specific, academically precise
- Exactly the requested number of lessons per section: mix of article (conceptual) and document (applied) types
- Lesson titles: specific and scholarly (not generic headings like "Introduction to X")
- Lesson description: 1 precise sentence stating the specific theory, concept, or skill covered
- estimated_duration_minutes: 60-90 per lesson
- Quiz: exactly 1 per section with 4-5 questions targeting analysis/application/evaluation; mcq options must be 4 strings; correct_answer must exactly match an option; explanation 1-2 sentences
- Activity: exactly 1 per section; instructions 2-3 sentences; target higher-order thinking
- PROGRESSION: scaffold from foundational → applied → critical/evaluative across sections
- If existing sections provided: build directly on covered material — advance complexity, introduce new frameworks, explicitly connect to prior content
- Number the sections from the starting week number given, so they continue the existing course
- When a COURSE BRIEF is given it overrides the academic style, durations and lesson types above: design every week for those learners and that result, around the real tasks, tools and projects in the brief`,

    lesson_notes: `You are an expert teacher writing the complete study notes for one lesson. A learner who reads only these notes must be able to understand and apply everything the lesson promises. ${jsonRule}
Output shape: {"title": string, "content_html": string, "key_points": string[], "estimated_read_time_minutes": number}
content_html (1,200 to 1,800 words):
- Semantic HTML only: h2, h3, p, ul, ol, li, strong, em, blockquote, code, pre, table, thead, tbody, tr, th, td. No scripts, styles or images.
- Teach, do not just describe: explain each idea from first principles, then show it in use.
Structure:
  1. <h2>Why this matters</h2> where this is used in real work, and what the learner will be able to do after the lesson.
  2. <h2>What you will learn</h2> 3 to 5 concrete outcomes as a list.
  3. One <h2> per core concept (2 to 4 concepts). For each: a plain explanation, how it works step by step, and a concrete example. For technical subjects include a short, correct code or command example in <pre><code>; for other subjects a realistic scenario, calculation or case.
  4. <h2>Worked example</h2> one end-to-end example that combines the concepts, shown step by step.
  5. <h2>Common mistakes</h2> 3 to 5 mistakes and how to avoid them.
  6. <h2>Practice</h2> 2 or 3 exercises, each with a short model answer or hints.
  7. <h2>Summary</h2> the key ideas in a few sentences, and how they lead into the next lesson.
Rules:
- Cover exactly what this lesson's title and description promise. Other lessons of the same week are listed: do not teach their content. Build on earlier weeks without re-teaching them.
- Be accurate. Where details depend on versions, tools or local rules, say so instead of inventing specifics.
- key_points: 5 to 8 complete sentences, one per essential idea.
- estimated_read_time_minutes: at 200 words per minute.
- When a COURSE BRIEF is given, write for those learners, at that level, in that tone and approach, instead of an academic style.`,

    improve_notes: `You are an expert teacher revising one lesson's study notes exactly as the teacher asks. ${jsonRule}
Output shape: {"content_html": string}
Rules:
- Apply the teacher's instruction fully. Keep every part of the notes the instruction does not touch, word for word where possible.
- Same allowed HTML: h2, h3, p, ul, ol, li, strong, em, blockquote, code, pre, table, thead, tbody, tr, th, td. No scripts, styles or images.
- Stay accurate. Where a detail depends on versions, tools or local rules, say so instead of inventing specifics.
- When a COURSE BRIEF is given, keep writing for those learners and in that tone.`,

    teacher_guide: `You are an experienced teacher writing the session plan another teacher will use to teach this lesson live. ${jsonRule}
Output shape: {"content_html": string}
content_html (500 to 900 words), allowed HTML: h2, h3, p, ul, ol, li, strong, em, table, thead, tbody, tr, th, td. Sections:
  1. <h2>Before the session</h2> what to prepare (materials, setup, files), and what students should have done.
  2. <h2>Session plan</h2> a table with columns Time | Activity | What the teacher does | What students do. Timings must add up to the session length given.
  3. <h2>Key points to emphasise</h2>
  4. <h2>Questions to ask</h2> 4 to 6 questions, each with what a good answer includes.
  5. <h2>Common misconceptions</h2> and how to address each one.
  6. <h2>Checking understanding</h2> quick checks during and at the end of the session.
  7. <h2>Support and stretch</h2> how to help students who struggle, and extend those who finish early.
  8. <h2>After the session</h2> follow-up work and what comes next.
Rules: base everything on the lesson notes provided; be practical and specific; when a COURSE BRIEF is given, plan for those learners.`,

    assessment_draft: `You are an assessment designer creating an authentic task, its marking rubric and the teacher's model answer. ${jsonRule}
Output shape: {"title": string, "brief_html": string, "deliverables": string[], "estimated_minutes": number, "rubric": [{"name": string, "points": number, "levels": [{"label": string, "points": number, "descriptor": string}]}], "resources": [{"title": string, "note": string}], "solution_html": string, "marking_notes": string}
By kind:
- "lab": a hands-on practical for one week (30 to 120 minutes). brief_html: goal, setup, numbered step-by-step tasks, what the result should look like, an extension task. For technical subjects include starter code in <pre><code>. solution_html: the complete worked solution (with code where relevant). Rubric: 3 criteria.
- "assignment": a task for one week that applies its lessons to a realistic situation (1 to 4 hours). brief_html: scenario, task, deliverables, constraints, how it will be assessed. solution_html: an outline of a strong answer. Rubric: 4 or 5 criteria.
- "capstone": the final project of the whole course, integrating every major skill, the kind of work a graduate would show an employer (10 to 30 hours). brief_html: scenario based on the target job, milestones, deliverables (including a short presentation or write-up), constraints, how it will be assessed. solution_html: what an excellent submission contains, milestone by milestone. Rubric: 5 or 6 criteria including communication of results.
Rules:
- Mirror real work for the target roles in the COURSE BRIEF when one is given; otherwise realistic work for the subject.
- Assess only what the weeks covered teach.
- Rubric: points across criteria add up exactly to the total points given. Each criterion has four levels, labelled Excellent, Good, Developing, Not yet, with points from high to low and descriptors that describe observable evidence.
- resources: kinds of public datasets, tools or references to use. Do not invent URLs; name a source only if you are confident it exists, in "note".
- marking_notes: guidance for the marker (what to look for, common weaknesses, how to give feedback).
- brief_html and solution_html allowed HTML: h2, h3, p, ul, ol, li, strong, em, code, pre, table, thead, tbody, tr, th, td.`,

    summarize_material: `You read a teacher's own teaching material (a syllabus, slides, notes or a textbook chapter) so a course can be built around it. ${jsonRule}
Output shape: {"summary": string, "audience": string, "level": string, "topics": string[], "suggested_weeks": [{"title": string, "lessons": string[]}], "notes_for_planner": string}
Rules:
- summary: 6 to 10 sentences on what the material teaches, in what order, and its style (theory, practical, exam-focused...).
- topics: the 8 to 25 main topics, in the material's order.
- suggested_weeks: a week-by-week outline that follows the material's own structure and order (3 to 12 weeks, 2 to 6 lessons each).
- notes_for_planner: gaps, outdated parts, or anything the course designer should know.
- Use only what the material contains. If it is too short or unreadable, say so in summary and return empty lists.`,

    lesson_slides: `You are an expert teacher turning one lesson's study notes into the slide deck you would teach that lesson from. ${jsonRule}
Output shape: {"slides_title": string, "slides": [{"slide_number": number, "heading": string, "content_html": string, "speaker_notes": string}]}
Rules:
- Cover EVERY concept, step, example, mistake and exercise in the notes, in the same order. Depth comes from more slides and full speaker notes, never from crowding one slide.
- 10 to 14 slides: title | what you will learn | one or more slides per concept (split a big concept over several slides) | the worked example walked through over one or more slides | common mistakes | check your understanding (2 or 3 quick questions) | summary and what comes next.
- content_html is what the audience sees: h3, p, ul, li, strong, code, pre only. At most 6 bullets and about 60 words per slide; a code snippet of at most 12 lines in <pre><code> is allowed.
- speaker_notes: 60 to 110 words of plain text per slide: what the presenter says to teach this slide, including the explanation, the example and one question to ask the class. Someone who has not read the notes must be able to deliver the lesson from these.
- Use only what the notes contain; do not add new facts.
- When a COURSE BRIEF is given, match its learners and tone.`,

    presentation_slides: `You are a university academic creating a scholarly lecture slide deck. ${jsonRule}
Output shape: {"title": string, "slides": [{"slide_number": number, "heading": string, "content_html": string, "speaker_notes": string}]}
Generate exactly 10 slides. Use h3, p, ul, li, strong in content_html. Target 80-120 words per slide.
Slide sequence:
  1. Title — topic, course, week
  2. Learning Objectives — 4-5 outcomes as <ul>
  3. Key Concept 1 — definition, mechanism, example
  4. Key Concept 2 — definition, mechanism, example
  5. Key Concept 3 — definition, mechanism, example
  6. Worked Example — brief real-world scenario with analysis
  7. Critical Analysis — 2 contrasting views or limitations
  8. Practical Applications — 3-4 bullet points
  9. Student Activity — one focused discussion or task prompt
  10. Summary — 5-6 bullet key takeaways
speaker_notes: 2-3 sentences per slide with teaching tips or questions to pose`,

    generate_exam: `You are a senior university examinations officer and academic writing a formal assessment instrument meeting tertiary education quality standards. ${jsonRule}
Output shape: {
  "title": string,
  "description": string,
  "instructions": string,
  "passage": string,
  "time_limit_minutes": number,
  "questions": [{"question": string, "marks": number, "sample_answer": string}]
}
Standards:
- title: Formal assessment title (e.g. "LING3201 Academic English: Semestral Assessment — Reading Comprehension and Critical Analysis")
- description: 2-3 sentences describing the assessment purpose, learning outcomes assessed, and academic level
- instructions: Formal examination instructions covering: time allocation, answer format requirements, referencing expectations, and academic integrity reminder. 4-6 sentences.
- passage (if not question_only): 350-500 words of formal academic prose appropriate to the discipline. Must include: a central argument or thesis, supporting evidence or data, technical vocabulary, and at least one nuanced or contested claim. Suitable for critical analysis questions.
- questions: Vary question types across cognitive levels:
  * Comprehension (identify, locate, define) — lower marks (2-5)
  * Application (explain, illustrate, apply a concept) — medium marks (5-10)
  * Analysis (compare, examine, evaluate, critique) — higher marks (10-20)
  * Synthesis/Essay (argue, justify, recommend, develop) — highest marks (15-25)
- sample_answer: A complete model answer demonstrating graduate-level writing. 4-8 sentences for analytical questions; full paragraph(s) for essay questions. Must reference relevant theory, use discipline-specific terminology, and meet the stated mark allocation.
- time_limit_minutes: Calibrate to 1 minute per mark (standard university exam pacing)`,

    section_content: `You are a university academic producing a complete, scholarly teaching package for one section/week of a university course. In ONE response, generate comprehensive lecture notes for every lesson AND a full lecture slide deck for the section. ${jsonRule}
Output shape: {
  "section_title": string,
  "lessons": [{"lesson_title": string, "notes_html": string, "key_points": string[]}],
  "slides_title": string,
  "slides": [{"slide_number": number, "heading": string, "content_html": string, "speaker_notes": string}]
}
Standards for lesson notes_html (600-1000 words each):
- Semantic HTML: h3 (subsections), p, ul, ol, li, strong, em, blockquote
- Structure per lesson: introduction and context (100w) | theoretical framework (150w) | 2-3 core concept sections with examples (150-200w each) | critical perspectives (100w) | summary with study questions (80w)
- Academic register; cite conceptual sources informally (e.g. "According to schema theory..." or "Research in this field suggests...")
- key_points: 6-8 complete sentences covering the lesson's essential academic content
Standards for slides (10-14 slides total for the section):
- Use h3, p, ul, li, strong in content_html; 120-180 words of substantive content per slide
- Slide sequence: section title | learning objectives | one concept/theory slide per major topic | worked example | critical analysis | student activity | section summary
- speaker_notes: 4-5 sentences per slide — detailed lecturer guidance including pedagogical tips, anticipated student questions, connections to assessments, and links to prior/future content
If prior section context is provided: explicitly build on established concepts, increase theoretical complexity, introduce new frameworks that extend prior learning, and reference connections to earlier content.`,

    section_notes: `You are a university academic writing scholarly lecture notes for every lesson in one course section. ${jsonRule}
Output shape: {
  "section_title": string,
  "lessons": [{"lesson_title": string, "notes_html": string, "key_points": string[]}]
}
Standards for notes_html (300-500 words each):
- Semantic HTML only: h3, p, ul, ol, li, strong, em, blockquote. No scripts or inline styles.
- Structure: brief intro (50w) | 2 core concepts with examples (100-150w each) | summary + 1 study question (50w)
- Academic register throughout
- key_points: 4-5 complete sentences covering the lesson's essential content
Keep each lesson's notes concise and focused — quality over length.`,

    section_slides: `You are a university academic creating a lecture slide deck for one course section. ${jsonRule}
Output shape: {
  "section_title": string,
  "slides_title": string,
  "slides": [{"slide_number": number, "heading": string, "content_html": string, "speaker_notes": string}]
}
Generate exactly 8 slides. Use h3, p, ul, li, strong in content_html; 60-100 words per slide.
Slide sequence: title | learning objectives | concept 1 | concept 2 | concept 3 | worked example | critical analysis | summary.
speaker_notes: 1-2 sentences per slide with teaching tips.`,
  };

  return prompts[task] || jsonRule;
}

/** Turns the brief agreed with the planner into instructions that override the default style. */
function briefBlock(brief: unknown): string {
  if (!brief || typeof brief !== 'object') return '';
  const b = brief as Record<string, unknown>;
  const list = (v: unknown) => (Array.isArray(v) ? v.map(String).filter(Boolean).join('; ') : String(v ?? ''));
  const lines = [
    ['Learners', b.audience], ['Starting level', b.starting_level], ['Result they need', b.outcome],
    ['Target roles', list(b.target_roles)], ['Market', b.market],
    ['Time available', b.duration_weeks ? `${b.duration_weeks} weeks, about ${b.hours_per_week ?? '?'} hours a week` : ''],
    ['Teaching approach', b.approach], ['Must include', list(b.must_include)],
    ['Projects / portfolio pieces', list(b.projects)], ['Assessment', b.assessment], ['Tone', b.tone],
    ['What employers ask for (from current job-market research)', list(b.market_findings)],
    ["Teacher's own material to follow", typeof b.teacher_material === 'string' ? b.teacher_material.slice(0, 3000) : ''],
    ['Typical lesson length (minutes)', b.lesson_minutes],
  ].filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== '');
  if (lines.length === 0) return '';
  return `

COURSE BRIEF (agreed with the teacher). This overrides any default academic style or pacing above:
${lines.map(([k, v]) => `- ${k}: ${v}`).join('\n')}
Design every module and lesson for these learners and this result. Use the tone and lesson length from the brief, name the real tasks, tools and deliverables, and place the projects where they fit. Lesson descriptions should say what the learner will do or be able to do, in plain language.`;
}

function getUserPrompt(task: string, input: Record<string, unknown>): string {
  const brief = briefBlock(input.brief);
  switch (task) {
    case 'course_outline':
      return `Design a comprehensive university-level course outline for:
Topic / Subject Area: ${input.topic}
Target Audience: ${input.target_audience}
Academic Level / Difficulty: ${input.difficulty}
Number of Modules: ${input.num_modules}
Lessons per Module: ${input.lessons_per_module}

${brief ? brief : 'Ensure the course meets tertiary education standards with clear academic progression, rigorous content, and measurable learning outcomes aligned with the discipline.'}`;

    case 'course_planner_chat': {
      const turns = Array.isArray(input.messages) ? (input.messages as Array<{ role?: string; content?: string }>) : [];
      const transcript = turns
        .slice(-30)
        .map(m => `${m.role === 'planner' ? 'You (consultant)' : 'Teacher'}: ${String(m.content ?? '').slice(0, 3000)}`)
        .join('\n\n');
      const notes = String(input.research_notes ?? '').trim().slice(0, 4000);
      const research = notes
        ? `Research already done (from your earlier web searches):\n${notes}\n\n`
        : 'No web research has been done yet.\n\n';
      const outline = String(input.existing_outline ?? '').trim().slice(0, 6000);
      const savedBrief = input.saved_brief && typeof input.saved_brief === 'object'
        ? `\nPlan agreed earlier:\n${JSON.stringify(input.saved_brief).slice(0, 3000)}\n`
        : '';
      const existing = outline
        ? `Existing course: ${String(input.course_title ?? '').slice(0, 200)}\nCurrent outline:\n${outline}\n${savedBrief}\n`
        : '';
      const material = String(input.material_summary ?? '').trim().slice(0, 5000);
      const materialBlock = material
        ? `Teacher's own material (build the course around it, following its content and order unless the teacher says otherwise):\n${material}\n\n`
        : '';
      return `${existing}${materialBlock}${research}Conversation so far:\n\n${transcript}\n\nReply to the teacher's latest message.`;
    }

    case 'course_skeleton':
      return `Design the top-level structure of a university-level course:
Topic / Subject Area: ${input.topic}
Target Audience: ${input.target_audience}
Academic Level / Difficulty: ${input.difficulty}
Number of Modules: ${input.num_modules}

Return the course title, description and the module list only (no lessons).${brief}`;

    case 'module_lessons':
      return `Course: ${input.course_title}
Target Audience: ${input.target_audience}
Academic Level / Difficulty: ${input.difficulty}

Full module list of the course (for context, so lessons do not overlap):
${Array.isArray(input.all_modules) ? (input.all_modules as string[]).map((m, i) => `${i + 1}. ${m}`).join('\n') : ''}

Write the lesson plan for ONLY these modules:
${Array.isArray(input.modules) ? (input.modules as Array<{ title?: string; description?: string }>).map(m => `- ${m.title}: ${m.description ?? ''}`).join('\n') : ''}

Lessons per Module: ${input.lessons_per_module}${brief}`;

    case 'lesson_content':
      return `Write comprehensive university-level lesson content for:
Lesson Title: ${input.lesson_title}
Course Context: ${input.course_context}
Target Audience: ${input.target_audience}
Desired Length: ${input.desired_length}

Content must be scholarly, detailed, and suitable for tertiary-level study. Include theory, evidence, worked examples, and critical perspectives.`;

    case 'quiz_from_content':
      return `Create a rigorous university-level academic quiz from the following lesson content:
Content: ${input.lesson_content}
Number of Questions: ${input.num_questions}
Question Types: ${Array.isArray(input.question_types) ? (input.question_types as string[]).join(', ') : input.question_types}
Difficulty: ${input.difficulty}

Questions must target higher-order thinking (Bloom's levels 3-6: apply, analyse, evaluate, create). Avoid pure recall questions.${brief}`;

    case 'flashcards':
      return `Create university-level study flashcards from this lesson content:
Content: ${input.lesson_content}
Number of Cards: ${input.num_cards}

Cards must cover key terminology, theoretical frameworks, conceptual distinctions, and application scenarios at tertiary level.`;

    case 'summarize_lesson':
      return `Write a scholarly executive summary of the following university lesson content:
${input.lesson_content}

Summary must capture the theoretical framework, core arguments, academic significance, and key insights in formal academic register.`;

    case 'rewrite_content':
      return `Rewrite the following university-level educational content to be ${input.style}, while preserving all academic accuracy, depth, and substantive content:
${input.content}`;

    case 'translate_content':
      return `Translate the following university educational content to ${input.target_language}, preserving all academic terminology, register, formatting, and structural precision:
${input.content}`;

    case 'activity_ideas':
      return `Design ${input.num_activities} rigorous, higher-order university learning activities for:
Lesson / Topic: ${input.lesson_title}
Course Context: ${input.course_context}
Target Audience: ${input.target_audience}

Activities must align with Bloom's taxonomy levels 3-6 and reflect active learning, constructivist, or inquiry-based pedagogies appropriate for tertiary education.`;

    case 'full_curriculum':
      return `Design a complete, academically rigorous university course curriculum for:
Subject / Topic: ${input.topic}
Target Audience: ${input.target_audience}
Academic Level: ${input.difficulty}
Number of Weeks/Sections: ${input.num_sections}
Lessons per Section: ${input.lessons_per_section}

Number the sections starting from Week ${input.start_number ?? 1}.

${brief ? 'Design to the course brief below.' : 'The curriculum must reflect university-level standards with clear academic progression, scaffolded complexity, and alignment between lessons, assessments, and activities.'}${input.existing_sections_summary ? `\n\nAlready covered in previous weeks — DO NOT repeat; build directly on these foundations with increased depth and complexity:\n${input.existing_sections_summary}` : ''}${input.focus ? `\n\nWhat the teacher asked for in these new weeks: ${input.focus}` : ''}${brief}`;

    case 'lesson_notes': {
      const others = Array.isArray(input.other_lessons) ? (input.other_lessons as string[]).filter(Boolean) : [];
      const earlier = Array.isArray(input.previous_weeks) ? (input.previous_weeks as string[]).filter(Boolean) : [];
      return `Write the complete study notes for this lesson.
Course: ${input.course_title}
Week / module: ${input.section_title}
Lesson: ${input.lesson_title}${input.lesson_description ? `\nWhat this lesson covers: ${input.lesson_description}` : ''}
Learners: ${input.target_audience}
Level: ${input.difficulty}${others.length ? `\n\nOther lessons in this week (do not teach their content):\n${others.map(t => `- ${t}`).join('\n')}` : ''}${earlier.length ? `\n\nEarlier weeks (already taught; build on them):\n${earlier.map(t => `- ${t}`).join('\n')}` : ''}${brief}`;
    }

    case 'improve_notes':
      return `Revise these study notes.
Course: ${input.course_title}
Lesson: ${input.lesson_title}
Teacher's instruction: ${String(input.instruction ?? '').slice(0, 1500)}

Current notes (HTML):
${String(input.notes_html ?? '').slice(0, 30000)}${brief}`;

    case 'teacher_guide':
      return `Write the session plan for teaching this lesson live.
Course: ${input.course_title}
Week / module: ${input.section_title}
Lesson: ${input.lesson_title}
Session length: ${input.session_minutes || 60} minutes

Lesson notes:
${String(input.notes_text ?? '').slice(0, 14000)}${brief}`;

    case 'assessment_draft': {
      const weeks = Array.isArray(input.weeks) ? (input.weeks as string[]).filter(Boolean) : [];
      return `Create a ${input.kind} for this course.
Course: ${input.course_title}
Total points: ${input.total_points || 100}
${weeks.length ? `Weeks it covers:\n${weeks.map(w => `- ${w}`).join('\n')}\n` : ''}${input.request ? `Teacher's request: ${String(input.request).slice(0, 1500)}\n` : ''}${input.notes_text ? `\nWhat the lessons teach (excerpts):\n${String(input.notes_text).slice(0, 12000)}\n` : ''}${brief}`;
    }

    case 'summarize_material':
      return input.material_text
        ? `Material file: ${input.file_name || 'uploaded file'}\n\n${String(input.material_text).slice(0, 60000)}`
        : `The material is the attached document (${input.file_name || 'uploaded PDF'}). Read all of it.`;

    case 'lesson_slides':
      return `Create the slide deck for this lesson from its study notes.
Course: ${input.course_title}
Week / module: ${input.section_title}
Lesson: ${input.lesson_title}

Study notes:
${String(input.notes_text ?? '').slice(0, 14000)}${brief}`;

    case 'presentation_slides':
      return `Create a comprehensive university lecture slide deck for:
Section / Module Title: ${input.section_title}
Course: ${input.course_title}
Lessons covered in this section: ${input.lesson_titles}
Target Audience: ${input.target_audience}
Academic Level: ${input.difficulty}

Slides must support a 60-90 minute university lecture with scholarly content, worked examples, critical analysis, and student engagement activities.`;

    case 'section_content': {
      const lessons = Array.isArray(input.lessons)
        ? (input.lessons as Array<{ title: string; description: string }>)
            .map((l, i) => `  ${i + 1}. ${l.title}${l.description ? ` — ${l.description}` : ''}`)
            .join('\n')
        : String(input.lessons);
      return `Generate a complete university teaching package — comprehensive lecture notes for every lesson AND a full slide deck — for this section:
Course: ${input.course_title}
Section / Week: ${input.section_title}
Target Audience: ${input.target_audience}
Academic Level: ${input.difficulty}
Lessons in this section:
${lessons}

Each lesson's notes must be scholarly and detailed (600-1000 words). The slide deck must cover the full section with academic rigour suitable for a university lecture.${input.existing_sections_summary ? `\n\nPrevious sections already covered — build on these with increased theoretical depth and complexity; explicitly connect new content to prior learning:\n${input.existing_sections_summary}` : ''}`;
    }

    case 'section_notes': {
      const lessons = Array.isArray(input.lessons)
        ? (input.lessons as Array<{ title: string; description: string }>)
            .map((l, i) => `  ${i + 1}. ${l.title}${l.description ? ` — ${l.description}` : ''}`)
            .join('\n')
        : String(input.lessons);
      return `Write comprehensive scholarly lecture notes for every lesson in this section:
Course: ${input.course_title}
Section / Week: ${input.section_title}
Target Audience: ${input.target_audience}
Academic Level: ${input.difficulty}
Lessons:
${lessons}
${input.existing_sections_summary ? `\nPrevious sections covered — build on these with increased depth:\n${input.existing_sections_summary}` : ''}`;
    }

    case 'section_slides': {
      const lessons = Array.isArray(input.lessons)
        ? (input.lessons as Array<{ title: string; description: string }>)
            .map((l, i) => `  ${i + 1}. ${l.title}${l.description ? ` — ${l.description}` : ''}`)
            .join('\n')
        : String(input.lessons);
      return `Create a scholarly university lecture slide deck for this section:
Course: ${input.course_title}
Section / Week: ${input.section_title}
Target Audience: ${input.target_audience}
Academic Level: ${input.difficulty}
Lessons covered:
${lessons}
${input.existing_sections_summary ? `\nPrevious sections covered — build on these; reference connections to prior learning:\n${input.existing_sections_summary}` : ''}`;
    }

    case 'generate_exam':
      return `Write a formal university examination for:
Subject / Topic: ${input.topic}
Course context: ${input.course_context || 'University course'}
Exam format: ${input.exam_type || 'reading_comprehension'} (reading_comprehension = include an academic passage; question_only = no passage)
Academic level / difficulty: ${input.difficulty || 'undergraduate'}
Number of questions: ${input.num_questions || 5}
Marks per question: ${input.marks_per_question || 5}
Target student cohort: ${input.target_audience || 'Undergraduate students'}
${input.extra_instructions ? `Additional requirements: ${input.extra_instructions}` : ''}

The examination must meet university assessment standards with questions that vary in cognitive demand (comprehension → analysis → synthesis) and include model answers of graduate calibre.`;

    default:
      return JSON.stringify(input);
  }
}

function getTemperature(task: string): number {
  const creative = ['course_outline', 'course_planner_chat', 'course_skeleton', 'module_lessons', 'lesson_content', 'flashcards', 'activity_ideas', 'full_curriculum', 'lesson_notes', 'presentation_slides', 'section_content', 'section_notes', 'section_slides', 'generate_exam'];
  return creative.includes(task) ? 0.7 : 0.3;
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : fallback;
}

function getMaxTokens(task: string, input: Record<string, unknown> = {}): number {
  // Outline-style tasks grow with the size requested, so a fixed cap either truncates
  // big requests (broken JSON) or wastes time on small ones.
  if (task === 'course_outline') {
    const modules = clampInt(input.num_modules, 1, 12, 5);
    const lessons = clampInt(input.lessons_per_module, 1, 12, 4);
    return Math.min(16000, 800 + modules * 150 + modules * lessons * 160);
  }
  if (task === 'course_planner_chat') return 3500;
  if (task === 'course_skeleton') {
    return Math.min(4000, 600 + clampInt(input.num_modules, 1, 12, 5) * 160);
  }
  if (task === 'module_lessons') {
    const modules = Array.isArray(input.modules) ? input.modules.length : 4;
    return Math.min(8000, 400 + modules * 80 + modules * clampInt(input.lessons_per_module, 1, 12, 4) * 160);
  }
  // full_curriculum is now called in batches of max 4 sections — 10k is sufficient
  if (task === 'full_curriculum') return 10000;
  if (task === 'section_content') return 12000;
  // section_notes: notes only (no slides) — up to 4 lessons × ~1000 words each
  if (task === 'section_notes') return 10000;
  // section_slides: slides only (no notes) — 8 slides
  if (task === 'section_slides') return 4000;
  // Deep notes and the slide deck built from them are long answers
  if (task === 'lesson_notes') return 7000;
  if (task === 'lesson_slides') return 7000;
  if (task === 'improve_notes') return 7000;
  if (task === 'teacher_guide') return 5000;
  if (task === 'assessment_draft') return 7000;
  if (task === 'summarize_material') return 4000;
  if (task === 'presentation_slides') return 4000;
  if (task === 'lesson_content') return 10000;
  if (task === 'generate_exam') return 8000;
  if (task === 'activity_ideas') return 6000;
  if (['quiz_from_content', 'flashcards', 'summarize_lesson'].includes(task)) return 6000;
  return 4096;
}

// ─── Anthropic call ──────────────────────────────────────────────────────────

class AIUpstreamError extends Error {
  status: number;
  constructor(status: number, detail: string) {
    super(`Anthropic API error ${status}: ${detail}`);
    this.status = status;
  }
}

interface WebSource { title: string; url: string }

type AnthropicBlock = {
  type: string;
  text?: string;
  citations?: Array<{ url?: string; title?: string }>;
  content?: unknown;
};

/** Pulls the pages the model actually opened or cited out of a response. */
function collectSources(blocks: AnthropicBlock[]): WebSource[] {
  const found = new Map<string, string>();
  const add = (url: unknown, title: unknown) => {
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url) || found.has(url)) return;
    found.set(url, typeof title === 'string' && title.trim() ? title.trim() : url);
  };
  for (const block of blocks) {
    // Citations attached to the answer are the strongest signal: list them first.
    if (block.type === 'text') for (const c of block.citations ?? []) add(c.url, c.title);
  }
  for (const block of blocks) {
    if (block.type === 'web_search_tool_result' && Array.isArray(block.content)) {
      for (const r of block.content as Array<{ type?: string; url?: string; title?: string }>) {
        if (r?.type === 'web_search_result') add(r.url, r.title);
      }
    }
  }
  return Array.from(found, ([url, title]) => ({ url, title })).slice(0, 8);
}

async function callAnthropic(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  task: string,
  strict = false,
  opts: { maxTokens?: number; timeoutMs?: number; webSearchUses?: number; pdfBase64?: string } = {}
): Promise<{ content: string; inputTokens: number; outputTokens: number; stopReason: string; sources: WebSource[]; searches: number }> {
  const strictAddition = strict ? '\n\nCRITICAL: Output ONLY the JSON object. No text before or after. No markdown fences.' : '';
  const deadline = Date.now() + (opts.timeoutMs ?? 120000);

  // Web search is a tool that Anthropic runs on its side. Newest version first; if the
  // account or model does not accept it, fall back to the basic version, then to none.
  const toolVariants: Array<Array<Record<string, unknown>> | null> = opts.webSearchUses
    ? [
        [{ type: 'web_search_20260209', name: 'web_search', max_uses: opts.webSearchUses }],
        [{ type: 'web_search_20250305', name: 'web_search', max_uses: opts.webSearchUses }],
        null,
      ]
    : [null];

  let lastError: unknown = null;
  for (const tools of toolVariants) {
    // A teacher's PDF is sent as a document the model reads directly (text, tables and images).
    const firstContent: unknown = opts.pdfBase64
      ? [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: opts.pdfBase64 } },
          { type: 'text', text: userPrompt },
        ]
      : userPrompt;
    const messages: Array<{ role: string; content: unknown }> = [{ role: 'user', content: firstContent }];
    const allBlocks: AnthropicBlock[] = [];
    let inputTokens = 0;
    let outputTokens = 0;
    let searches = 0;
    let stopReason = '';

    try {
      // A long search can come back as "pause_turn": send the partial answer straight
      // back (no extra message) and the server carries on. Bounded so it cannot loop.
      for (let round = 0; round < 3; round++) {
        const remaining = deadline - Date.now();
        if (remaining < 3000) {
          const timeout = new Error('time budget used up');
          timeout.name = 'TimeoutError';
          throw timeout;
        }
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-6',
            max_tokens: opts.maxTokens ?? getMaxTokens(task),
            temperature: getTemperature(task),
            system: systemPrompt + strictAddition,
            messages,
            ...(tools ? { tools } : {}),
          }),
          // The caller passes whatever is left of the request's overall time budget.
          signal: AbortSignal.timeout(remaining),
        });

        if (!response.ok) {
          const body = await response.text();
          throw new AIUpstreamError(response.status, body.slice(0, 300));
        }

        const data = await response.json() as {
          content: AnthropicBlock[];
          stop_reason?: string;
          usage: { input_tokens: number; output_tokens: number; server_tool_use?: { web_search_requests?: number } };
        };
        allBlocks.push(...data.content);
        inputTokens += data.usage.input_tokens;
        outputTokens += data.usage.output_tokens;
        searches += data.usage.server_tool_use?.web_search_requests ?? 0;
        stopReason = data.stop_reason ?? '';
        if (stopReason !== 'pause_turn') break;
        messages.push({ role: 'assistant', content: data.content });
      }
    } catch (err) {
      lastError = err;
      // Only a rejected request (400) is worth retrying with a simpler tool setup.
      if (tools && err instanceof AIUpstreamError && err.status === 400) {
        console.warn('web search tool rejected, falling back:', err.message.slice(0, 200));
        continue;
      }
      throw err;
    }

    // The answer is the text after the last tool activity; anything before that is the
    // model talking to itself while it searches.
    let lastNonText = -1;
    allBlocks.forEach((blk, i) => { if (blk.type !== 'text') lastNonText = i; });
    const answer = allBlocks.slice(lastNonText + 1).filter(blk => blk.type === 'text').map(blk => blk.text ?? '').join('');
    const text = answer.trim()
      ? answer
      : allBlocks.filter(blk => blk.type === 'text').map(blk => blk.text ?? '').join('');

    return { content: text, inputTokens, outputTokens, stopReason, sources: collectSources(allBlocks), searches };
  }
  throw lastError ?? new Error('AI request failed');
}

function parseJSON(text: string): unknown | null {
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();

  // Direct parse
  try { return JSON.parse(cleaned); } catch { /* fall through */ }

  // Find the outermost { ... } by scanning for matching braces
  const start = cleaned.indexOf('{');
  if (start !== -1) {
    let depth = 0;
    for (let i = start; i < cleaned.length; i++) {
      if (cleaned[i] === '{') depth++;
      else if (cleaned[i] === '}') {
        depth--;
        if (depth === 0) {
          try { return JSON.parse(cleaned.slice(start, i + 1)); } catch { break; }
        }
      }
    }
  }

  // Last resort: grab everything between first { and last }
  const last = cleaned.lastIndexOf('}');
  if (start !== -1 && last > start) {
    try { return JSON.parse(cleaned.slice(start, last + 1)); } catch { /* */ }
  }

  return null;
}

// How many web searches the course planner may run in one reply.
const PLANNER_MAX_SEARCHES = 3;

// Total time one request may spend talking to the model (platform limit is 150s).
const REQUEST_BUDGET_MS = 135_000;
// Below this, another attempt cannot realistically finish.
const MIN_ATTEMPT_MS = 20_000;

// ─── Student study tools ─────────────────────────────────────────────────────

const STUDENT_TASK_COSTS: Record<string, number> = {
  summarize_lesson: 3,
  flashcards: 4,
  activity_ideas: 4,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function htmlToText(html: string): string {
  return html.replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleStudentTask(req: Request, admin: any, userId: string, apiKey: string): Promise<Response> {
  const body = await req.json().catch(() => ({})) as { task?: string; lesson_id?: string; course_id?: string };
  const task = body.task ?? '';
  const cost = STUDENT_TASK_COSTS[task];
  if (!cost || !body.lesson_id) {
    return jsonResponse({ error: 'This AI feature is not available to students.' }, 403);
  }

  const { data: lesson } = await admin
    .from('lessons')
    .select('id, course_id, title, content, description, ai_summary')
    .eq('id', body.lesson_id)
    .maybeSingle();
  if (!lesson) return jsonResponse({ error: 'Lesson not found' }, 404);

  const { data: hasAccess } = await admin.rpc('has_course_access', { p_course_id: lesson.course_id, p_user_id: userId });
  if (!hasAccess) return jsonResponse({ error: 'You need to be enrolled in this course to use AI tools.' }, 403);

  // Work that already exists is returned without charging again.
  if (task === 'summarize_lesson' && lesson.ai_summary) {
    return jsonResponse({ reused: true, tokens_charged: 0 });
  }
  if (task === 'flashcards') {
    const { count } = await admin.from('flashcards').select('id', { count: 'exact', head: true })
      .eq('lesson_id', lesson.id);
    if ((count ?? 0) > 0) return jsonResponse({ reused: true, tokens_charged: 0 });
  }
  if (task === 'activity_ideas') {
    const { count } = await admin.from('lesson_activities').select('id', { count: 'exact', head: true })
      .eq('lesson_id', lesson.id);
    if ((count ?? 0) > 0) return jsonResponse({ reused: true, tokens_charged: 0 });
  }

  const { data: credits } = await admin.from('student_ai_credits').select('token_balance').eq('user_id', userId).maybeSingle();
  if ((credits?.token_balance ?? 0) < cost) {
    return jsonResponse({ error: `Not enough tokens. This action costs ${cost} tokens.` }, 402);
  }

  // Simple per-student rate limit: 10 generations a minute.
  const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
  const { count: recent } = await admin.from('ai_usage_logs').select('id', { count: 'exact', head: true })
    .eq('user_id', userId).gte('created_at', oneMinuteAgo);
  if ((recent ?? 0) >= 10) return jsonResponse({ error: 'Please wait a moment before generating again.' }, 429);

  const lessonText = htmlToText(String(lesson.content || lesson.description || '')).slice(0, 12000);
  if (task !== 'activity_ideas' && lessonText.length < 80) {
    return jsonResponse({ error: 'This lesson has no written content to work from yet.' }, 400);
  }

  const { data: course } = await admin.from('courses').select('title, level').eq('id', lesson.course_id).maybeSingle();
  const input = sanitizeInput(
    task === 'activity_ideas'
      ? { lesson_title: lesson.title, course_context: course?.title ?? '', target_audience: course?.level ?? 'students', num_activities: 3 }
      : { lesson_content: lessonText, num_cards: 10 }
  );

  const systemPrompt = getSystemPrompt(task);
  const userPrompt = getUserPrompt(task, input);
  // Two attempts at most, each capped so the pair fits inside the platform's request limit.
  let result = await callAnthropic(apiKey, systemPrompt, userPrompt, task, false, { timeoutMs: 70_000 });
  let parsed = parseJSON(result.content) as Record<string, unknown> | null;
  if ((!parsed || !validators[task](parsed)) && result.stopReason !== 'max_tokens') {
    result = await callAnthropic(apiKey, systemPrompt, userPrompt, task, true, { timeoutMs: 55_000 });
    parsed = parseJSON(result.content) as Record<string, unknown> | null;
  }
  const ok = !!parsed && validators[task](parsed);
  await admin.from('ai_usage_logs').insert({
    user_id: userId,
    ai_task: task,
    input_tokens: result.inputTokens,
    output_tokens: result.outputTokens,
    cost_estimate_usd: (result.inputTokens / 1_000_000 * 3) + (result.outputTokens / 1_000_000 * 15),
    success: ok,
    error_message: ok ? null : 'Unusable model response (student task)',
  });
  if (!ok || !parsed) return jsonResponse({ error: 'AI returned an unusable response. You were not charged. Please try again.' }, 502);

  // Save the result where the lesson player reads it from.
  let saveError: { message: string } | null = null;
  if (task === 'summarize_lesson') {
    const takeaways = (parsed.key_takeaways as unknown[]).map((t) => `• ${String(t)}`).join('\n');
    const summary = `${String(parsed.summary)}${takeaways ? `\n\nKey takeaways:\n${takeaways}` : ''}`;
    ({ error: saveError } = await admin.from('lessons')
      .update({ ai_summary: summary, ai_summary_generated_at: new Date().toISOString() }).eq('id', lesson.id));
  } else if (task === 'flashcards') {
    const rows = (parsed.cards as Array<{ front?: unknown; back?: unknown }>)
      .filter((c) => c && c.front && c.back)
      .slice(0, 20)
      .map((c) => ({ user_id: userId, course_id: lesson.course_id, lesson_id: lesson.id, front: String(c.front), back: String(c.back) }));
    if (rows.length === 0) return jsonResponse({ error: 'AI returned no flashcards. You were not charged.' }, 502);
    ({ error: saveError } = await admin.from('flashcards').insert(rows));
  } else {
    const allowedTypes = ['practice', 'reflection', 'discussion', 'project', 'research'];
    const rows = (parsed.activities as Array<Record<string, unknown>>)
      .filter((a) => a && a.title && a.instructions)
      .slice(0, 6)
      .map((a, i) => ({
        lesson_id: lesson.id,
        course_id: lesson.course_id,
        title: String(a.title),
        type: allowedTypes.includes(String(a.type)) ? String(a.type) : 'practice',
        instructions: String(a.instructions),
        estimated_minutes: Math.min(Math.max(Math.round(Number(a.estimated_minutes)) || 15, 1), 600),
        order_index: i,
      }));
    if (rows.length === 0) return jsonResponse({ error: 'AI returned no activities. You were not charged.' }, 502);
    ({ error: saveError } = await admin.from('lesson_activities').insert(rows));
  }
  if (saveError) {
    console.error('student AI save error:', saveError.message);
    return jsonResponse({ error: 'Could not save the result. You were not charged.' }, 500);
  }

  // Charge only after the result is saved.
  const { data: charged, error: chargeError } = await admin.rpc('deduct_student_tokens', {
    p_user_id: userId, p_tokens: cost, p_ai_task: task, p_course_id: lesson.course_id, p_lesson_id: lesson.id,
  });
  if (chargeError) console.error('student token charge failed:', chargeError.message);

  return jsonResponse({ reused: false, tokens_charged: charged ? cost : 0 });
}

// ─── Main handler ────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  let userId: string | null = null;
  const startedAt = Date.now();

  try {
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured. Add it in Supabase Dashboard → Edge Functions → Secrets.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user } } = await supabaseUser.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    userId = user.id;

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle();

    if (!profile) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Students use a separate, narrower path: three study tools on a lesson they have
    // access to, paid for from their own token balance and charged here on the server.
    if (profile.role === 'student') {
      return await handleStudentTask(req, supabaseAdmin, userId, apiKey);
    }

    // ── Org token + feature-flag check (for org_admin and teachers in an org) ─
    let orgId: string | null = null;
    if (profile.role === 'org_admin' || profile.role === 'teacher') {
      const { data: membership } = await supabaseAdmin
        .from('org_members')
        .select('org_id, organizations(token_balance, is_active, plan_tier, feature_flags)')
        .eq('user_id', userId)
        .maybeSingle();

      if (membership) {
        orgId = membership.org_id;
        const org = (membership as { organizations?: { token_balance: number; is_active: boolean; plan_tier: string; feature_flags: Record<string, boolean> } }).organizations;

        if (!org?.is_active) {
          return new Response(JSON.stringify({ error: 'Your organisation is inactive. Contact your administrator.' }), {
            status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Map AI task to feature flag key
        const TASK_FEATURE_MAP: Record<string, string> = {
          course_outline: 'ai_course_outline',
          course_skeleton: 'ai_course_outline',
          course_planner_chat: 'ai_course_outline',
          module_lessons: 'ai_course_outline',
          section_content: 'ai_course_outline',
          lesson_content: 'ai_lesson_content',
          lesson_notes: 'ai_lesson_content',
          section_notes: 'ai_lesson_content',
          summarize_lesson: 'ai_lesson_content',
          rewrite_content: 'ai_lesson_content',
          translate_content: 'ai_lesson_content',
          activity_ideas: 'ai_lesson_content',
          quiz_from_content: 'ai_quiz_generation',
          flashcards: 'ai_flashcards',
          full_curriculum: 'ai_full_curriculum',
          presentation_slides: 'ai_presentations',
          lesson_slides: 'ai_presentations',
          improve_notes: 'ai_lesson_content',
          teacher_guide: 'ai_lesson_content',
          assessment_draft: 'ai_quiz_generation',
          summarize_material: 'ai_course_outline',
          section_slides: 'ai_presentations',
          generate_exam: 'ai_exams',
        };

        const body_peek = await req.clone().json().catch(() => ({ task: '' })) as { task: string };
        const featureKey = TASK_FEATURE_MAP[body_peek.task ?? ''];
        if (featureKey && org?.feature_flags && !org.feature_flags[featureKey]) {
          return new Response(JSON.stringify({
            error: `This AI feature (${featureKey.replace(/_/g, ' ')}) is not available on your current plan (${org.plan_tier}). Upgrade your plan to unlock it.`,
          }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        if ((org?.token_balance ?? 0) < 1) {
          return new Response(JSON.stringify({ error: 'Insufficient tokens. Purchase more tokens to continue using AI generation.' }), {
            status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }
    }

    // ── Rate limit: 100 calls per user per minute ────────────────────────────
    const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
    const { count } = await supabaseAdmin
      .from('ai_usage_logs')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', oneMinuteAgo);

    if ((count ?? 0) >= 100) {
      return new Response(JSON.stringify({ error: 'Rate limit exceeded. Maximum 100 AI calls per minute.' }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Retry-After': '60' },
      });
    }

    const body = await req.json() as { task: string; input: Record<string, unknown> };
    const { task, input: rawInput } = body;

    if (!task || !rawInput || !validators[task]) {
      return new Response(JSON.stringify({ error: `Unknown or unsupported task: ${task}` }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // A PDF must not go through text sanitising (it would be cut short); keep it aside.
    let pdfBase64: string | undefined;
    if (task === 'summarize_material' && typeof rawInput.material_pdf_base64 === 'string') {
      pdfBase64 = rawInput.material_pdf_base64;
      delete rawInput.material_pdf_base64;
      // About 12 MB of PDF; larger files should be split
      if (pdfBase64.length > 16_000_000 || !/^[A-Za-z0-9+/=]+$/.test(pdfBase64.slice(0, 1000))) {
        return new Response(JSON.stringify({ error: 'That PDF is too large or not valid. Please upload a file under 12 MB.' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }
    const input = sanitizeInput(rawInput);
    const systemPrompt = getSystemPrompt(task);
    const userPrompt = getUserPrompt(task, input);

    // One overall time budget for the whole request. The platform cuts a request off at
    // 150s, and the browser waits slightly longer than this budget, so the user always
    // gets a real answer (or a clear message) instead of a client-side timeout.
    const maxTokens = getMaxTokens(task, input);
    let result: Awaited<ReturnType<typeof callAnthropic>> =
      { content: '', inputTokens: 0, outputTokens: 0, stopReason: '', sources: [], searches: 0 };
    // The course planner may look things up online (job ads, skills in demand). Only on
    // the first attempt: a retry is about getting clean JSON back, not about searching again.
    const wantsSearch = task === 'course_planner_chat';
    let sources: WebSource[] = [];
    let searches = 0;
    let parsed: unknown | null = null;
    let truncated = false;
    let lastUpstreamError: unknown = null;

    for (let attempt = 0; attempt < 3 && !parsed; attempt++) {
      const remaining = REQUEST_BUDGET_MS - (Date.now() - startedAt);
      // Not enough time left for a useful attempt: stop rather than overrun.
      if (attempt > 0 && remaining < MIN_ATTEMPT_MS) break;

      const minimal = attempt === 2;
      const sys = minimal
        ? 'Return ONLY a valid JSON object. No markdown, no explanation, no text outside the JSON.'
        : systemPrompt;
      const usr = minimal ? `${userPrompt}\n\nCRITICAL: Output ONLY the raw JSON object. Nothing else.` : userPrompt;

      try {
        result = await callAnthropic(apiKey, sys, usr, task, attempt > 0, {
          maxTokens,
          timeoutMs: Math.max(remaining - 2000, 5000),
          webSearchUses: wantsSearch && attempt === 0 ? PLANNER_MAX_SEARCHES : undefined,
          pdfBase64,
        });
        lastUpstreamError = null;
        if (result.sources.length) sources = result.sources;
        searches += result.searches;
      } catch (err) {
        lastUpstreamError = err;
        // Overloaded / rate limited / server error: brief pause, then retry if time allows.
        if (err instanceof AIUpstreamError && [429, 500, 502, 503, 529].includes(err.status)) {
          await new Promise(r => setTimeout(r, 1500));
          continue;
        }
        break; // timeout or a non-retryable error
      }

      // The answer hit the length limit, so the JSON is cut off. Asking again with the
      // same limit would be cut off again: report it instead of burning time.
      if (result.stopReason === 'max_tokens') { truncated = true; break; }
      parsed = parseJSON(result.content);
    }

    if (!parsed && (truncated || lastUpstreamError)) {
      const timedOut = lastUpstreamError instanceof Error
        && (lastUpstreamError.name === 'TimeoutError' || lastUpstreamError.name === 'AbortError');
      const busy = lastUpstreamError instanceof AIUpstreamError && [429, 500, 502, 503, 529].includes(lastUpstreamError.status);
      const detail = truncated
        ? 'Response exceeded the length limit'
        : (lastUpstreamError instanceof Error ? lastUpstreamError.message : 'unknown error');
      console.error(`ai-generate ${task} failed:`, detail);
      await supabaseAdmin.from('ai_usage_logs').insert({
        user_id: userId,
        ai_task: task,
        input_tokens: result.inputTokens,
        output_tokens: result.outputTokens,
        cost_estimate_usd: (result.inputTokens / 1_000_000 * 3) + (result.outputTokens / 1_000_000 * 15),
        success: false,
        error_message: detail.slice(0, 500),
      });
      const userMessage = truncated
        ? 'That request is too large to generate in one go. Please ask for less at a time (for example fewer lessons or questions) and try again. You were not charged.'
        : timedOut
          ? 'The AI took too long to respond. Nothing was charged. Please try again, or ask for a smaller amount at a time.'
          : busy
            ? 'The AI service is busy right now. Nothing was charged. Please try again in a minute.'
            : 'AI generation failed. Nothing was charged. Please try again.';
      return new Response(JSON.stringify({ error: userMessage }), {
        status: truncated ? 422 : timedOut ? 504 : busy ? 503 : 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!parsed) {
      await supabaseAdmin.from('ai_usage_logs').insert({
        user_id: userId,
        ai_task: task,
        input_tokens: result.inputTokens,
        output_tokens: result.outputTokens,
        cost_estimate_usd: (result.inputTokens / 1_000_000 * 3) + (result.outputTokens / 1_000_000 * 15),
        success: false,
        error_message: 'Failed to parse JSON response from model',
      });
      return new Response(JSON.stringify({ error: 'AI returned an unparseable response. Please try again.' }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!validators[task](parsed)) {
      await supabaseAdmin.from('ai_usage_logs').insert({
        user_id: userId,
        ai_task: task,
        input_tokens: result.inputTokens,
        output_tokens: result.outputTokens,
        cost_estimate_usd: (result.inputTokens / 1_000_000 * 3) + (result.outputTokens / 1_000_000 * 15),
        success: false,
        error_message: 'Response shape validation failed',
      });
      return new Response(JSON.stringify({ error: 'AI response did not match expected format. Please try again.' }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Web searches are billed per search on top of tokens (estimate: about one US cent each).
    const costUsd = (result.inputTokens / 1_000_000 * 3) + (result.outputTokens / 1_000_000 * 15) + searches * 0.01;
    const { data: logRow } = await supabaseAdmin.from('ai_usage_logs').insert({
      user_id: userId,
      ai_task: task,
      input_tokens: result.inputTokens,
      output_tokens: result.outputTokens,
      cost_estimate_usd: costUsd,
      success: true,
    }).select('id').maybeSingle();

    // ── Deduct org tokens if user belongs to an org ───────────────────────────
    const TOKEN_COSTS: Record<string, number> = {
      course_outline: 5, course_planner_chat: 1, course_skeleton: 2, module_lessons: 1, lesson_content: 8, quiz_from_content: 6, flashcards: 4,
      summarize_lesson: 3, rewrite_content: 5, translate_content: 7, activity_ideas: 4,
      full_curriculum: 20, lesson_notes: 5, lesson_slides: 6, improve_notes: 4, teacher_guide: 4, assessment_draft: 6, summarize_material: 8, presentation_slides: 10,
      section_content: 8, section_notes: 5, section_slides: 10, generate_exam: 10,
    };
    if (orgId) {
      // A planner reply that searched the web costs a little more than a plain one.
      const tokensToDeduct = (TOKEN_COSTS[task] ?? 5) + (searches > 0 ? 2 : 0);
      await supabaseAdmin.rpc('deduct_org_tokens', {
        p_org_id: orgId,
        p_user_id: userId,
        p_ai_task: task,
        p_tokens: tokensToDeduct,
        p_ai_log_id: logRow?.id ?? null,
      });
    }

    if (wantsSearch && parsed && typeof parsed === 'object') {
      // Sources come from what the model really opened, never from text it wrote, so a
      // link shown to the teacher is always a page that was actually found. Earlier
      // turns' sources are carried along by the browser.
      const earlier = Array.isArray(input.sources) ? (input.sources as WebSource[]) : [];
      const merged = new Map<string, WebSource>();
      for (const src of [...earlier, ...sources]) {
        if (src && typeof src.url === 'string' && /^https?:\/\//i.test(src.url) && !merged.has(src.url)) {
          merged.set(src.url, { url: src.url, title: String(src.title || src.url).slice(0, 200) });
        }
      }
      (parsed as Record<string, unknown>).sources = Array.from(merged.values()).slice(0, 10);
      (parsed as Record<string, unknown>).searched = searches > 0;
    }

    return new Response(JSON.stringify(parsed), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('ai-generate error:', message);

    if (userId) {
      await supabaseAdmin.from('ai_usage_logs').insert({
        user_id: userId,
        ai_task: 'unknown',
        input_tokens: 0,
        output_tokens: 0,
        cost_estimate_usd: 0,
        success: false,
        error_message: message.slice(0, 500),
      }).catch(() => {});
    }

    // Technical details stay in the logs; users get a plain message.
    return new Response(JSON.stringify({ error: 'AI generation failed. Nothing was charged. Please try again.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
