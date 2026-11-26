import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@14";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, stripe-signature",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

    if (!stripeKey) {
      return new Response(JSON.stringify({ error: "Stripe not configured" }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!webhookSecret) {
      console.error("STRIPE_WEBHOOK_SECRET not configured");
      return new Response(JSON.stringify({ error: "Webhook secret not configured" }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2024-11-20.acacia" });
    const body = await req.text();
    const sig = req.headers.get("stripe-signature");

    if (!sig) {
      return new Response(JSON.stringify({ error: "Missing stripe-signature header" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(body, sig, webhookSecret);
    } catch (err) {
      console.error("Webhook signature verification failed:", err);
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (event.type !== "checkout.session.completed") {
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const session = event.data.object as Stripe.Checkout.Session;
    // "completed" can fire before funds are captured for delayed payment methods.
    if (session.payment_status !== "paid") {
      return new Response(JSON.stringify({ received: true, pending: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const metadata = session.metadata || {};
    const amountCents = session.amount_total || 0;
    const stripeSessionId = session.id;
    const stripePaymentId = typeof session.payment_intent === "string" ? session.payment_intent : "";

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const purchaseType = metadata.type || "course";

    // Fulfilment is one atomic, idempotent database call (shared with stripe-verify-session).
    // If it fails we return 500 so Stripe retries the webhook.
    // --- AI Plan Purchase ---
    if (purchaseType === "ai_plan") {
      const { student_id, plan_id, token_amount } = metadata;
      const tokens = parseInt(token_amount || "0", 10);
      if (!student_id || !Number.isFinite(tokens) || tokens <= 0) {
        console.error("Missing metadata for AI plan purchase");
        return new Response(JSON.stringify({ received: true, warning: "Missing metadata" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: fulfilledNow, error } = await supabase.rpc("fulfill_stripe_session", {
        p_session_id: stripeSessionId,
        p_user_id: student_id,
        p_kind: "ai_plan",
        p_tokens: tokens,
        p_amount_cents: amountCents,
        p_payment_intent: stripePaymentId || null,
      });
      if (error) throw new Error(`Fulfilment failed: ${error.message}`);

      console.log(`AI plan ${plan_id}: ${tokens} tokens for student ${student_id} (new: ${fulfilledNow})`);
      return new Response(
        JSON.stringify({ received: true, type: "ai_plan", tokens_added: fulfilledNow ? tokens : 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --- Course Purchase ---
    const { student_id, course_id, teacher_id } = metadata;
    if (!student_id || !course_id) {
      console.error("Missing student_id or course_id in Stripe metadata");
      return new Response(JSON.stringify({ received: true, warning: "Missing metadata" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: fulfilledNow, error } = await supabase.rpc("fulfill_stripe_session", {
      p_session_id: stripeSessionId,
      p_user_id: student_id,
      p_kind: "course",
      p_course_id: course_id,
      p_teacher_id: teacher_id || null,
      p_amount_cents: amountCents,
      p_payment_intent: stripePaymentId || null,
    });
    if (error) throw new Error(`Fulfilment failed: ${error.message}`);

    console.log(`Enrolled student ${student_id} in course ${course_id} (new: ${fulfilledNow})`);
    return new Response(
      JSON.stringify({ received: true, type: "course", enrolled: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("Webhook error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
