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

    // All fulfilment happens in one database transaction that first claims the session id,
    // so replaying this request (or the webhook arriving as well) can never credit twice.
    if (purchaseType === "ai_plan") {
      const tokens = parseInt(metadata.token_amount || "0", 10);
      if (!Number.isFinite(tokens) || tokens <= 0) {
        return new Response(JSON.stringify({ error: "Missing token amount in session metadata" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: fulfilledNow, error: fulfilError } = await supabase.rpc("fulfill_stripe_session", {
        p_session_id: stripeSessionId,
        p_user_id: user.id,
        p_kind: "ai_plan",
        p_tokens: tokens,
        p_amount_cents: amountCents,
        p_payment_intent: stripePaymentId || null,
      });
      if (fulfilError) throw new Error(`Fulfilment failed: ${fulfilError.message}`);

      console.log(`AI plan ${metadata.plan_id}: ${tokens} tokens for user ${user.id} (new: ${fulfilledNow})`);
      return new Response(
        JSON.stringify({ enrolled: true, type: "ai_plan", tokens_added: fulfilledNow ? tokens : 0, already_processed: !fulfilledNow }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Course purchase
    const { course_id, teacher_id } = metadata;
    if (!course_id) {
      return new Response(JSON.stringify({ error: "Missing course_id in session metadata" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: fulfilledNow, error: fulfilError } = await supabase.rpc("fulfill_stripe_session", {
      p_session_id: stripeSessionId,
      p_user_id: user.id,
      p_kind: "course",
      p_course_id: course_id,
      p_teacher_id: teacher_id || null,
      p_amount_cents: amountCents,
      p_payment_intent: stripePaymentId || null,
    });
    if (fulfilError) throw new Error(`Fulfilment failed: ${fulfilError.message}`);

    console.log(`Enrolled user ${user.id} in course ${course_id} via session ${stripeSessionId} (new: ${fulfilledNow})`);
    return new Response(JSON.stringify({ enrolled: true, type: "course", course_id, already_processed: !fulfilledNow }), {
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
