import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@14";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

async function safeUpsert(supabase: ReturnType<typeof createClient>, table: string, data: Record<string, unknown>, opts: { onConflict: string }) {
  try {
    await supabase.from(table).upsert(data, opts);
  } catch (e) {
    console.error(`safeUpsert ${table} failed:`, e);
  }
}

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

    if (session.payment_status !== "paid") {
      return new Response(JSON.stringify({ enrolled: false, reason: "Payment not completed" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const metadata = session.metadata || {};
    const amountCents = session.amount_total || 0;
    const stripeSessionId = session.id;
    const stripePaymentId = typeof session.payment_intent === "string" ? session.payment_intent : "";

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
        try {
          await supabase.rpc("add_student_tokens", { p_user_id: user.id, p_tokens: tokens });
        } catch (e) {
          console.error("Token add error:", e);
        }

        await safeUpsert(supabase, "payments", {
          user_id: user.id,
          amount: amountCents / 100,
          currency: "AUD",
          status: "completed",
          stripe_session_id: stripeSessionId,
          stripe_payment_id: stripePaymentId || null,
        }, { onConflict: "stripe_session_id" });
      }

      console.log(`AI plan ${plan_id}: ${tokens} tokens for user ${user.id}`);
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

    // Enroll in course_enrollments (idempotent)
    try {
      const { error: enrollError } = await supabase.from("course_enrollments").upsert({
        user_id: user.id,
        course_id,
        enrollment_type: "paid",
        payment_status: "completed",
        payment_id: stripePaymentId,
        amount_paid: amountCents / 100,
        currency: "AUD",
        enrolled_at: new Date().toISOString(),
      }, { onConflict: "user_id,course_id" });
      if (enrollError) console.error("course_enrollments upsert error:", enrollError);
    } catch (e) {
      console.error("Enrollment exception:", e);
    }

    // Legacy enrollments table
    await safeUpsert(supabase, "enrollments", {
      student_id: user.id,
      course_id,
      progress_percent: 0,
      enrolled_at: new Date().toISOString(),
    }, { onConflict: "student_id,course_id" });

    // Teacher earning
    if (teacher_id && amountCents > 0) {
      try {
        await supabase.rpc("record_teacher_earning", {
          p_teacher_id: teacher_id,
          p_course_id: course_id,
          p_student_id: user.id,
          p_gross_cents: amountCents,
          p_stripe_payment_intent: stripePaymentId,
        });
      } catch (e) {
        console.error("Teacher earning error:", e);
      }
    }

    // Payment record
    await safeUpsert(supabase, "payments", {
      user_id: user.id,
      course_id,
      amount: amountCents / 100,
      currency: "AUD",
      status: "completed",
      stripe_session_id: stripeSessionId,
      stripe_payment_id: stripePaymentId || null,
    }, { onConflict: "stripe_session_id" });

    console.log(`Enrolled user ${user.id} in course ${course_id} via session ${stripeSessionId}`);
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
