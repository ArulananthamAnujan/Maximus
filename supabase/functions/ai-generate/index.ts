import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// ─── Zod-like output validators (inline, no external dep) ───────────────────

function validateCourseOutline(obj: unknown): boolean {
  const o = obj as Record<string, unknown>;
  return typeof o.title === 'string' && typeof o.description === 'string' && Array.isArray(o.modules);
}

function validateLessonContent(obj: unknown): boolean {
  const o = obj as Record<string, unknown>;
  return typeof o.content_html === 'string' && Array.isArray(o.key_points);
}

function validateQuizFromContent(obj: unknown): boolean {
  const o = obj as Record<string, unknown>;
  return Array.isArray(o.questions);
}

function validateFlashcards(obj: unknown): boolean {
  const o = obj as Record<string, unknown>;
  return Array.isArray(o.cards);
}

function validateSummarize(obj: unknown): boolean {
  const o = obj as Record<string, unknown>;
  return typeof o.summary === 'string' && Array.isArray(o.key_takeaways);
}

function validateRewrite(obj: unknown): boolean {
  const o = obj as Record<string, unknown>;
  return typeof o.rewritten_content === 'string';
}

function validateTranslate(obj: unknown): boolean {
  const o = obj as Record<string, unknown>;
  return typeof o.translated_content === 'string';
}

function validateActivityIdeas(obj: unknown): boolean {
  const o = obj as Record<string, unknown>;
  return Array.isArray(o.activities);
}

function validateFullCurriculum(obj: unknown): boolean {
  const o = obj as Record<string, unknown>;
  return Array.isArray(o.sections);
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
  generate_exam: validateGenerateExam,
};

// ─── Sanitize ────────────────────────────────────────────────────────────────

function sanitizeField(value: unknown): string {
  if (typeof value !== 'string') return '';
  // Strip script tags, limit length
  return value.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '').slice(0, 50000);
}

function sanitizeInput(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (typeof v === 'string') {
      out[k] = sanitizeField(v);
    } else if (typeof v === 'number' || typeof v === 'boolean') {
      out[k] = v;
    } else if (Array.isArray(v)) {
      out[k] = v.map(item => typeof item === 'string' ? sanitizeField(item) : item);
    } else {
      out[k] = v;
    }
  }
  return out;
}

// ─── System prompts ──────────────────────────────────────────────────────────

function getSystemPrompt(task: string): string {
  const jsonRule = 'Return ONLY valid JSON. No markdown fences, no preamble, no explanation. Output nothing except the JSON object.';

  const prompts: Record<string, string> = {
    course_outline: `You are an expert curriculum designer. ${jsonRule}
Output shape: {"title": string, "description": string, "modules": [{"title": string, "description": string, "lessons": [{"title": string, "description": string, "estimated_duration_minutes": number}]}]}`,

    lesson_content: `You are an expert educator creating engaging, clear lesson content. ${jsonRule}
Output shape: {"content_html": string, "key_points": string[], "estimated_read_time_minutes": number}
For content_html: use clean semantic HTML only — h2, h3, p, ul, ol, strong, em, code tags. No scripts, no inline styles, no external references.`,

    quiz_from_content: `You are an expert quiz designer. ${jsonRule}
Output shape: {"questions": [{"type": "mcq"|"true_false"|"short_answer", "question": string, "options": string[]|null, "correct_answer": string, "explanation": string, "points": number}]}
For mcq: include 4 options. For true_false: options should be ["True","False"]. For short_answer: options should be null.`,

    flashcards: `You are an expert educator creating concise, effective flashcards. ${jsonRule}
Output shape: {"cards": [{"front": string, "back": string}]}
Front: a clear question or term. Back: a concise, complete answer or definition.`,

    summarize_lesson: `You are an expert at distilling educational content into clear, actionable summaries. ${jsonRule}
Output shape: {"summary": string, "key_takeaways": string[]}
Summary: 2-4 sentences. Key takeaways: 3-7 bullet points as strings.`,

    rewrite_content: `You are an expert content editor. Rewrite the provided content in the requested style. ${jsonRule}
Output shape: {"rewritten_content": string}`,

    translate_content: `You are an expert translator for educational content. Translate accurately while preserving formatting and educational clarity. ${jsonRule}
Output shape: {"translated_content": string}`,

    activity_ideas: `You are an expert instructional designer creating practical learning activities. ${jsonRule}
Output shape: {"activities": [{"title": string, "type": "practice"|"reflection"|"discussion"|"project"|"research", "instructions": string, "estimated_minutes": number}]}
Instructions should be 2-4 sentences, actionable, and clearly describe what the student must do.`,

    full_curriculum: `You are an expert curriculum designer creating a complete, structured course. ${jsonRule}
Output shape: {
  "sections": [{
    "title": string,
    "lessons": [{"title": string, "type": "article"|"document", "estimated_duration_minutes": number, "description": string}],
    "quiz": {"title": string, "questions": [{"type": "mcq"|"true_false", "question": string, "options": string[], "correct_answer": string, "explanation": string, "points": number}]},
    "activities": [{"title": string, "type": "practice"|"reflection"|"discussion"|"project"|"research", "instructions": string, "estimated_minutes": number}]
  }]
}
STRICT RULES to keep response compact:
- Each section: exactly the requested number of lessons, exactly 1 quiz with exactly 3 questions, exactly 1 activity.
- lesson description: 1 short sentence only (max 15 words).
- quiz explanation: 1 sentence only (max 20 words).
- activity instructions: 2 sentences max.
- For mcq questions: include exactly 4 options as strings. correct_answer must exactly match one of the options strings.
- For true_false questions: options must be ["True", "False"] and correct_answer must be "True" or "False".
- If existing sections are provided, build DIRECTLY on top of them — do NOT repeat topics already covered.`,

    lesson_notes: `You are an expert educator writing comprehensive, detailed lesson notes equivalent to 5+ printed pages. ${jsonRule}
Output shape: {"title": string, "content_html": string, "key_points": string[], "estimated_read_time_minutes": number}
For content_html: write 1800-2500 words of rich, detailed educational content using clean semantic HTML — h2, h3, p, ul, ol, li, strong, em, blockquote tags only. No scripts, no inline styles.
Structure: 1) Introduction & Learning Objectives (2-3 paragraphs), 2) Background & Context (1-2 paragraphs + bullet points), 3) Core Concept 1 with detailed explanation, examples, and practical application (3-4 paragraphs), 4) Core Concept 2 with detailed explanation, examples, and a blockquote tip (3-4 paragraphs), 5) Core Concept 3 with detailed explanation and real-world application (3-4 paragraphs), 6) Common Mistakes & Best Practices (bulleted list), 7) Practice Exercises (numbered list with 3-4 exercises), 8) Summary & Key Takeaways (2-3 paragraphs). Be thorough, educational, and include plenty of examples.`,

    presentation_slides: `You are an expert educator creating structured presentation slides for a lesson. ${jsonRule}
Output shape: {"title": string, "slides": [{"slide_number": number, "heading": string, "content_html": string, "speaker_notes": string}]}
Generate 8-12 slides. Each slide content_html should use only: h3, p, ul, li, strong tags. Keep each slide focused and concise (50-120 words of content).
Include: title slide, learning objectives, one slide per key concept, practice/example slide, summary, and next steps slide.`,

    generate_exam: `You are an expert exam writer for language and academic preparation (IELTS, PTE, academic English, etc.). ${jsonRule}
Output shape: {
  "title": string,
  "description": string,
  "instructions": string,
  "passage": string,
  "time_limit_minutes": number,
  "questions": [{"question": string, "marks": number, "sample_answer": string}]
}
Guidelines:
- passage: Write a well-structured reading text of 250-400 words appropriate to the subject and level. Use formal academic style for IELTS/PTE. Leave empty string if exam_type is "question_only".
- questions: Generate the number of questions requested. Each question should test reading comprehension, critical thinking, or language skills.
- sample_answer: Write a concise model answer (2-5 sentences) that would earn full marks. Be specific — this is used by AI to grade students.
- instructions: Clear, concise instructions for students (e.g. "Read the passage and answer all questions in complete sentences.").
- time_limit_minutes: Suggest appropriate time based on number of questions and marks (e.g. 20-45 minutes).
- Vary question types: main idea, detail, inference, vocabulary in context, short essay response.`,

    section_content: `You are an expert educator. In ONE response, generate comprehensive lesson notes for every lesson in the section PLUS presentation slides for the entire section. ${jsonRule}
Output shape: {
  "section_title": string,
  "lessons": [{"lesson_title": string, "notes_html": string, "key_points": string[]}],
  "slides_title": string,
  "slides": [{"slide_number": number, "heading": string, "slide_type": "title"|"objectives"|"concept"|"example"|"activity"|"summary", "content_html": string, "speaker_notes": string}]
}
NOTES REQUIREMENTS (per lesson):
- notes_html: 1000-1500 words of detailed educational content using h2, h3, p, ul, ol, li, strong, em, blockquote tags.
- Structure each lesson: Introduction (1-2 paragraphs) → Background & Context → 2-3 Core Concept sections (each with explanation + example + blockquote tip) → Common Mistakes (bulleted) → Practice Exercise → Summary.
- Be thorough with real examples, practical applications, and actionable advice.
SLIDES REQUIREMENTS (for the whole section):
- Generate 10-12 slides total. Mix of slide types.
- Slide types: "title" (section cover), "objectives" (learning goals), "concept" (key idea with 4-6 bullets), "example" (worked example with steps), "activity" (hands-on task), "summary" (key takeaways).
- content_html per slide: use h3 for sub-headings, ul/li for bullets, p for short paragraphs. 60-100 words per slide.
- speaker_notes: 2-3 sentences of presenter guidance per slide.
If prior section context is given, build on it — do NOT repeat covered material.`,
  };

  return prompts[task] || jsonRule;
}

function getUserPrompt(task: string, input: Record<string, unknown>): string {
  switch (task) {
    case 'course_outline':
      return `Create a detailed course outline for:
Topic: ${input.topic}
Target Audience: ${input.target_audience}
Difficulty: ${input.difficulty}
Number of Modules: ${input.num_modules}
Lessons per Module: ${input.lessons_per_module}`;

    case 'lesson_content':
      return `Create full lesson content for:
Lesson Title: ${input.lesson_title}
Course Context: ${input.course_context}
Target Audience: ${input.target_audience}
Desired Length: ${input.desired_length}`;

    case 'quiz_from_content':
      return `Generate a quiz from this lesson content:
Content: ${input.lesson_content}
Number of Questions: ${input.num_questions}
Question Types: ${Array.isArray(input.question_types) ? (input.question_types as string[]).join(', ') : input.question_types}
Difficulty: ${input.difficulty}`;

    case 'flashcards':
      return `Create flashcards from this lesson content:
Content: ${input.lesson_content}
Number of Cards: ${input.num_cards}`;

    case 'summarize_lesson':
      return `Summarize this lesson content:
${input.lesson_content}`;

    case 'rewrite_content':
      return `Rewrite the following content to be ${input.style}:
${input.content}`;

    case 'translate_content':
      return `Translate the following educational content to ${input.target_language}:
${input.content}`;

    case 'activity_ideas':
      return `Create ${input.num_activities} learning activities for:
Lesson: ${input.lesson_title}
Course Context: ${input.course_context}
Target Audience: ${input.target_audience}`;

    case 'full_curriculum':
      return `Create a complete course curriculum for:
Topic: ${input.topic}
Target Audience: ${input.target_audience}
Difficulty: ${input.difficulty}
Number of Sections: ${input.num_sections}
Lessons per Section: ${input.lessons_per_section}${input.existing_sections_summary ? `\n\nAlready covered in previous weeks (DO NOT repeat these topics — build on them):\n${input.existing_sections_summary}` : ''}`;

    case 'lesson_notes':
      return `Write comprehensive lesson notes for:
Lesson Title: ${input.lesson_title}
Section: ${input.section_title}
Course: ${input.course_title}
Target Audience: ${input.target_audience}
Difficulty: ${input.difficulty}`;

    case 'presentation_slides':
      return `Create presentation slides for:
Section Title: ${input.section_title}
Course: ${input.course_title}
Lessons in this section: ${input.lesson_titles}
Target Audience: ${input.target_audience}
Difficulty: ${input.difficulty}`;

    case 'section_content': {
      const lessons = Array.isArray(input.lessons)
        ? (input.lessons as Array<{ title: string; description: string }>)
            .map((l, i) => `  ${i + 1}. ${l.title}${l.description ? ` — ${l.description}` : ''}`)
            .join('\n')
        : String(input.lessons);
      return `Generate full lesson notes and presentation slides for this section:
Course: ${input.course_title}
Section: ${input.section_title}
Target Audience: ${input.target_audience}
Difficulty: ${input.difficulty}
Lessons in this section:
${lessons}${input.existing_sections_summary ? `\n\nPrevious sections already covered (build on these, do NOT repeat):\n${input.existing_sections_summary}` : ''}`;
    }

    case 'generate_exam':
      return `Generate an exam for:
Subject / Topic: ${input.topic}
Course context: ${input.course_context || 'General'}
Exam type: ${input.exam_type || 'reading_comprehension'} (reading_comprehension = include a passage; question_only = no passage)
Difficulty / Band level: ${input.difficulty || 'intermediate'}
Number of questions: ${input.num_questions || 5}
Marks per question: ${input.marks_per_question || 5}
Target audience: ${input.target_audience || 'Adult learners'}
${input.extra_instructions ? `Additional instructions: ${input.extra_instructions}` : ''}`;

    default:
      return JSON.stringify(input);
  }
}

function getTemperature(task: string): number {
  const creative = ['course_outline', 'lesson_content', 'flashcards', 'activity_ideas', 'full_curriculum', 'lesson_notes', 'presentation_slides', 'section_content', 'generate_exam'];
  return creative.includes(task) ? 0.7 : 0.3;
}

function getMaxTokens(task: string): number {
  if (task === 'section_content') return 16000;
  if (task === 'full_curriculum') return 20000;
  if (['lesson_notes', 'presentation_slides', 'lesson_content'].includes(task)) return 8192;
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
  const strictAddition = strict ? '\n\nCRITICAL: Output ONLY the JSON object. No text before or after. No markdown.' : '';

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
    signal: AbortSignal.timeout(task === 'full_curriculum' ? 180000 : 90000),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${body.slice(0, 200)}`);
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
  // Strip markdown fences if present
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
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
    // ── API key check ────────────────────────────────────────────────────────
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'ANTHROPIC_API_KEY not found in Edge Function secrets. Add it in Supabase Dashboard → Edge Functions → Secrets.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── Auth ─────────────────────────────────────────────────────────────────
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

    // ── Role check ───────────────────────────────────────────────────────────
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

    // ── Rate limit: 15 calls per user per minute ─────────────────────────────
    const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
    const { count } = await supabaseAdmin
      .from('ai_usage_logs')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', oneMinuteAgo);

    if ((count ?? 0) >= 15) {
      return new Response(JSON.stringify({ error: 'Rate limit exceeded. Max 15 AI calls per minute.' }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Retry-After': '60' },
      });
    }

    // ── Parse body ───────────────────────────────────────────────────────────
    const body = await req.json() as { task: string; input: Record<string, unknown> };
    const { task, input: rawInput } = body;

    if (!task || !rawInput || !validators[task]) {
      return new Response(JSON.stringify({ error: `Unknown task: ${task}` }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const input = sanitizeInput(rawInput);
    const systemPrompt = getSystemPrompt(task);
    const userPrompt = getUserPrompt(task, input);

    // ── Call Anthropic ────────────────────────────────────────────────────────
    let result: { content: string; inputTokens: number; outputTokens: number };
    let parsed: unknown | null;

    result = await callAnthropic(apiKey, systemPrompt, userPrompt, task);
    parsed = parseJSON(result.content);

    // Retry once with stricter prompt if parse fails
    if (!parsed) {
      result = await callAnthropic(apiKey, systemPrompt, userPrompt, task, true);
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

      return new Response(JSON.stringify({ error: 'AI returned an invalid response. Please try again.' }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Validate output shape ─────────────────────────────────────────────────
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

    // ── Log success ───────────────────────────────────────────────────────────
    const costUsd = (result.inputTokens / 1_000_000 * 3) + (result.outputTokens / 1_000_000 * 15);
    await supabaseAdmin.from('ai_usage_logs').insert({
      user_id: userId,
      ai_task: task,
      input_tokens: result.inputTokens,
      output_tokens: result.outputTokens,
      cost_estimate_usd: costUsd,
      success: true,
    });

    return new Response(JSON.stringify(parsed), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('ai-generate error:', message);

    // Log failure if we have a user
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
