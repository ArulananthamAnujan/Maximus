import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@14";

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
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      return new Response(JSON.stringify({ error: "Stripe not configured" }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify the calling user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { session_id } = await req.json();
    if (!session_id) {
      return new Response(JSON.stringify({ error: "session_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2024-11-20.acacia" });
    const session = await stripe.checkout.sessions.retrieve(session_id);

    // Only process completed payments
    if (session.payment_status !== "paid") {
      return new Response(JSON.stringify({ enrolled: false, reason: "Payment not completed" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const metadata = session.metadata || {};
    const amountCents = session.amount_total || 0;
    const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : "";

    // Ensure the session belongs to this user
    if (metadata.student_id !== user.id) {
      return new Response(JSON.stringify({ error: "Session does not belong to this user" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const purchaseType = metadata.type || "course";

    if (purchaseType === "ai_plan") {
      const { plan_id, token_amount } = metadata;
      const tokens = parseInt(token_amount || "0", 10);

      if (tokens > 0) {
        await supabase.rpc("add_student_tokens", {
          p_user_id: user.id,
          p_tokens: tokens,
        });

        await supabase.from("payments").upsert({
          student_id: user.id,
          amount: amountCents / 100,
          currency: "AUD",
          status: "completed",
          payment_method: "stripe",
          transaction_id: paymentIntentId || `ai_plan_${session_id}`,
          notes: `AI plan purchase: ${tokens} tokens (plan ${plan_id})`,
        }, { onConflict: "transaction_id" }).catch(() => {});
      }

      return new Response(JSON.stringify({ enrolled: true, type: "ai_plan", tokens_added: tokens }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Course purchase
    const { course_id, teacher_id } = metadata;
    if (!course_id) {
      return new Response(JSON.stringify({ error: "Missing course_id in session metadata" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Enroll student (upsert so re-visiting success URL is idempotent)
    await supabase.from("course_enrollments").upsert({
      user_id: user.id,
      course_id,
      enrollment_type: "paid",
      payment_status: "completed",
      payment_id: paymentIntentId,
      amount_paid: amountCents / 100,
      currency: "AUD",
      enrolled_at: new Date().toISOString(),
    }, { onConflict: "user_id,course_id" });

    await supabase.from("enrollments").upsert({
      student_id: user.id,
      course_id,
      progress_percent: 0,
      enrolled_at: new Date().toISOString(),
    }, { onConflict: "student_id,course_id" });

    // Teacher earning
    if (teacher_id && amountCents > 0) {
      await supabase.rpc("record_teacher_earning", {
        p_teacher_id: teacher_id,
        p_course_id: course_id,
        p_student_id: user.id,
        p_gross_cents: amountCents,
        p_stripe_payment_intent: paymentIntentId,
      }).catch(() => {});
    }

    // Payment record (idempotent)
    await supabase.from("payments").upsert({
      student_id: user.id,
      course_id,
      amount: amountCents / 100,
      currency: "AUD",
      status: "completed",
      payment_method: "stripe",
      transaction_id: paymentIntentId || `course_${session_id}`,
    }, { onConflict: "transaction_id" }).catch(() => {});

    return new Response(JSON.stringify({ enrolled: true, type: "course", course_id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("Verify session error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
