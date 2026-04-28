import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { submission_id } = await req.json();
    if (!submission_id) {
      return new Response(JSON.stringify({ error: "submission_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch submission
    const { data: submission, error: subErr } = await supabase
      .from("exam_submissions")
      .select("*, exam:exams(*, questions:exam_questions(*))")
      .eq("id", submission_id)
      .maybeSingle();

    if (subErr || !submission) {
      return new Response(JSON.stringify({ error: "Submission not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const exam = submission.exam;
    const questions: Array<{
      id: string;
      question: string;
      marks: number;
      sample_answer: string;
      order_index: number;
    }> = (exam.questions || []).sort(
      (a: { order_index: number }, b: { order_index: number }) =>
        a.order_index - b.order_index
    );

    const answers: Record<string, string> = submission.answers || {};

    // Build grading prompt
    const gradingItems = questions
      .map((q, i) => {
        const studentAnswer = answers[q.id] || "(no answer provided)";
        return `Question ${i + 1} [${q.marks} marks]:
${q.question}

Sample/Model Answer: ${q.sample_answer || "(not provided)"}

Student's Answer: ${studentAnswer}`;
      })
      .join("\n\n---\n\n");

    const systemPrompt = `You are an expert exam marker. Grade each student answer fairly and constructively.

For each question, assess the student's answer against the model answer and award marks fairly.

Return ONLY valid JSON in exactly this shape:
{
  "grades": [
    {
      "question_id": "<uuid>",
      "score": <number 0 to max_marks>,
      "max_score": <max_marks for question>,
      "reasoning": "<1-2 sentence explanation of the score>",
      "suggestion": "<specific improvement tip, or 'Well done!' if full marks>"
    }
  ],
  "overall_feedback": "<2-3 sentence holistic feedback on the submission>"
}

Grading principles:
- Award partial marks generously for partially correct answers
- Check for understanding of key concepts even if wording differs from model answer
- Be encouraging but honest
- Do not penalise for minor spelling/grammar in content-focused subjects
- Award 0 only if the answer is completely wrong or missing`;

    const userPrompt = `Grade this exam submission.

Exam: ${exam.title}
${exam.passage ? `\nPassage/Stimulus:\n${exam.passage}\n` : ""}
Questions and Student Answers:
${gradingItems}

Question IDs for reference:
${questions.map((q, i) => `Question ${i + 1}: ${q.id} (max ${q.marks} marks)`).join("\n")}`;

    // Call Anthropic
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 2048,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      throw new Error(`Anthropic API error: ${errText}`);
    }

    const anthropicData = await anthropicRes.json();
    const rawContent = anthropicData.content?.[0]?.text || "";

    // Parse JSON from response
    const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("AI returned non-JSON response");
    const gradeResult = JSON.parse(jsonMatch[0]);

    // Build ai_scores map
    const aiScores: Record<
      string,
      { score: number; max_score: number; reasoning: string; suggestion: string }
    > = {};
    for (const g of gradeResult.grades || []) {
      aiScores[g.question_id] = {
        score: g.score,
        max_score: g.max_score,
        reasoning: g.reasoning,
        suggestion: g.suggestion,
      };
    }

    // Update submission
    const { error: updateErr } = await supabase
      .from("exam_submissions")
      .update({
        ai_scores: aiScores,
        status: "ai_graded",
        ai_graded_at: new Date().toISOString(),
        // Store overall feedback in teacher_scores as a special key
        teacher_scores: { _overall_feedback: gradeResult.overall_feedback || "" },
      })
      .eq("id", submission_id);

    if (updateErr) throw updateErr;

    return new Response(
      JSON.stringify({ success: true, ai_scores: aiScores, overall_feedback: gradeResult.overall_feedback }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
