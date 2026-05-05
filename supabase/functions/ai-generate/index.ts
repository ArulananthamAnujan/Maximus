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

const validators: Record<string, (o: unknown) => boolean> = {
  course_outline: validateCourseOutline,
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
- 3-4 lessons per section: mix of article (theoretical/conceptual) and document (applied/analytical) types
- Lesson titles: specific and scholarly (not generic headings like "Introduction to X")
- Lesson description: 1 precise sentence stating the specific theory, concept, or skill covered
- estimated_duration_minutes: 60-90 per lesson
- Quiz: exactly 1 per section with 4-5 questions targeting analysis/application/evaluation; mcq options must be 4 strings; correct_answer must exactly match an option; explanation 1-2 sentences
- Activity: exactly 1 per section; instructions 2-3 sentences; target higher-order thinking
- PROGRESSION: scaffold from foundational → applied → critical/evaluative across sections
- If existing sections provided: build directly on covered material — advance complexity, introduce new frameworks, explicitly connect to prior content`,

    lesson_notes: `You are a university lecturer writing clear, scholarly lesson notes for students. ${jsonRule}
Output shape: {"title": string, "content_html": string, "key_points": string[], "estimated_read_time_minutes": number}
Standards for content_html (target 600-900 words):
- Semantic HTML only: h2, h3, p, ul, ol, li, strong, em, blockquote. No scripts, no inline styles.
- Academic register throughout.
Required sections (keep each concise):
  1. <h2>Introduction</h2> — topic context and relevance (80-100 words)
  2. <h2>Learning Objectives</h2> — 4-5 Bloom's-aligned outcomes as a <ul>
  3. <h2>Core Concepts</h2> — 2-3 subsections (h3), each 120-160 words: definition, key mechanism, brief example
  4. <h2>Critical Perspectives</h2> — 1-2 contrasting viewpoints or limitations (80-100 words)
  5. <h2>Summary</h2> — synthesis + 2 study questions (60-80 words)
key_points: 5-7 precise sentences covering the main concepts
estimated_read_time_minutes: at 200 words/min`,

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

function getUserPrompt(task: string, input: Record<string, unknown>): string {
  switch (task) {
    case 'course_outline':
      return `Design a comprehensive university-level course outline for:
Topic / Subject Area: ${input.topic}
Target Audience: ${input.target_audience}
Academic Level / Difficulty: ${input.difficulty}
Number of Modules: ${input.num_modules}
Lessons per Module: ${input.lessons_per_module}

Ensure the course meets tertiary education standards with clear academic progression, rigorous content, and measurable learning outcomes aligned with the discipline.`;

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

Questions must target higher-order thinking (Bloom's levels 3-6: apply, analyse, evaluate, create). Avoid pure recall questions.`;

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

The curriculum must reflect university-level standards with clear academic progression, scaffolded complexity, and alignment between lessons, assessments, and activities.${input.existing_sections_summary ? `\n\nAlready covered in previous weeks — DO NOT repeat; build directly on these foundations with increased depth and complexity:\n${input.existing_sections_summary}` : ''}`;

    case 'lesson_notes':
      return `Write comprehensive, scholarly university lecture notes for:
Lesson Title: ${input.lesson_title}
Section / Module: ${input.section_title}
Course: ${input.course_title}
Target Audience: ${input.target_audience}
Academic Level: ${input.difficulty}

Notes must be equivalent to a textbook chapter — detailed, theoretically grounded, with worked examples, critical perspectives, and clear academic structure.`;

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
  const creative = ['course_outline', 'lesson_content', 'flashcards', 'activity_ideas', 'full_curriculum', 'lesson_notes', 'presentation_slides', 'section_content', 'section_notes', 'section_slides', 'generate_exam'];
  return creative.includes(task) ? 0.7 : 0.3;
}

function getMaxTokens(task: string): number {
  // full_curriculum is now called in batches of max 4 sections — 10k is sufficient
  if (task === 'full_curriculum') return 10000;
  if (task === 'section_content') return 12000;
  // section_notes: notes only (no slides) — up to 4 lessons × ~1000 words each
  if (task === 'section_notes') return 10000;
  // section_slides: slides only (no notes) — 8 slides
  if (task === 'section_slides') return 4000;
  if (task === 'lesson_notes') return 4000;
  if (task === 'presentation_slides') return 4000;
  if (task === 'lesson_content') return 10000;
  if (task === 'generate_exam') return 8000;
  if (task === 'activity_ideas') return 6000;
  if (['quiz_from_content', 'flashcards', 'summarize_lesson'].includes(task)) return 6000;
  return 4096;
}

// ─── Anthropic call ──────────────────────────────────────────────────────────

async function callAnthropic(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  task: string,
  strict = false
): Promise<{ content: string; inputTokens: number; outputTokens: number }> {
  const strictAddition = strict ? '\n\nCRITICAL: Output ONLY the JSON object. No text before or after. No markdown fences.' : '';

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: getMaxTokens(task),
      temperature: getTemperature(task),
      system: systemPrompt + strictAddition,
      messages: [{ role: 'user', content: userPrompt }],
    }),
    signal: AbortSignal.timeout(
      task === 'full_curriculum' ? 120000
        : task === 'section_content' ? 120000
        : ['section_notes', 'lesson_notes', 'lesson_content'].includes(task) ? 90000
        : task === 'section_slides' ? 45000
        : ['presentation_slides', 'generate_exam'].includes(task) ? 45000
        : 60000
    ),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${body.slice(0, 300)}`);
  }

  const data = await response.json() as {
    content: Array<{ type: string; text: string }>;
    usage: { input_tokens: number; output_tokens: number };
  };

  const text = data.content.find(c => c.type === 'text')?.text || '';
  return {
    content: text,
    inputTokens: data.usage.input_tokens,
    outputTokens: data.usage.output_tokens,
  };
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

    if (!profile || profile.role === 'student') {
      return new Response(JSON.stringify({ error: 'Forbidden: AI features require teacher or admin role' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
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

    const input = sanitizeInput(rawInput);
    const systemPrompt = getSystemPrompt(task);
    const userPrompt = getUserPrompt(task, input);

    let result: { content: string; inputTokens: number; outputTokens: number };
    let parsed: unknown | null;

    result = await callAnthropic(apiKey, systemPrompt, userPrompt, task);
    parsed = parseJSON(result.content);

    if (!parsed) {
      result = await callAnthropic(apiKey, systemPrompt, userPrompt, task, true);
      parsed = parseJSON(result.content);
    }

    // 3rd attempt: stripped-down prompt to guarantee clean JSON
    if (!parsed) {
      const minimalSystem = 'Return ONLY a valid JSON object. No markdown, no explanation, no text outside the JSON.';
      const minimalUser = `${userPrompt}\n\nCRITICAL: Output ONLY the raw JSON object. Nothing else.`;
      result = await callAnthropic(apiKey, minimalSystem, minimalUser, task, true);
      parsed = parseJSON(result.content);
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

    const costUsd = (result.inputTokens / 1_000_000 * 3) + (result.outputTokens / 1_000_000 * 15);
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
      course_outline: 5, lesson_content: 8, quiz_from_content: 6, flashcards: 4,
      summarize_lesson: 3, rewrite_content: 5, translate_content: 7, activity_ideas: 4,
      full_curriculum: 20, lesson_notes: 5, presentation_slides: 10,
      section_content: 8, section_notes: 5, section_slides: 10, generate_exam: 10,
    };
    if (orgId) {
      const tokensToDeduct = TOKEN_COSTS[task] ?? 5;
      await supabaseAdmin.rpc('deduct_org_tokens', {
        p_org_id: orgId,
        p_user_id: userId,
        p_ai_task: task,
        p_tokens: tokensToDeduct,
        p_ai_log_id: logRow?.id ?? null,
      });
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

    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
