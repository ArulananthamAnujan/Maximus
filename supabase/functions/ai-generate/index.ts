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
Each section must have: 2-5 lessons (mix of article and document types), exactly 1 quiz with 3-5 questions, and 1-2 activities.
For quiz mcq questions: include exactly 4 options as strings. correct_answer must exactly match one of the options strings.
For true_false questions: options must be ["True", "False"] and correct_answer must be "True" or "False".`,
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
Lessons per Section: ${input.lessons_per_section}`;

    default:
      return JSON.stringify(input);
  }
}

function getTemperature(task: string): number {
  const creative = ['course_outline', 'lesson_content', 'flashcards', 'activity_ideas', 'full_curriculum'];
  return creative.includes(task) ? 0.7 : 0.3;
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
      model: 'claude-sonnet-4-5',
      max_tokens: 4096,
      temperature: getTemperature(task),
      system: systemPrompt + strictAddition,
      messages: [{ role: 'user', content: userPrompt }],
    }),
    signal: AbortSignal.timeout(30000),
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

    return new Response(JSON.stringify({ error: 'An unexpected error occurred. Please try again.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
