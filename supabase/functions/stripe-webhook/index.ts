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

    const stripe = new Stripe(stripeKey, { apiVersion: "2024-11-20.acacia" });
    const body = await req.text();
    const sig = req.headers.get("stripe-signature");

    let event: Stripe.Event;

    if (webhookSecret && sig) {
      try {
        event = await stripe.webhooks.constructEventAsync(body, sig, webhookSecret);
      } catch (err) {
        console.error("Webhook signature verification failed:", err);
        return new Response(JSON.stringify({ error: "Invalid signature" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      event = JSON.parse(body) as Stripe.Event;
    }

    if (event.type !== "checkout.session.completed") {
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const session = event.data.object as Stripe.Checkout.Session;
    const metadata = session.metadata || {};
    const amountCents = session.amount_total || 0;
    const stripeSessionId = session.id;
    const stripePaymentId = typeof session.payment_intent === "string" ? session.payment_intent : "";

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const purchaseType = metadata.type || "course";

    // --- AI Plan Purchase ---
    if (purchaseType === "ai_plan") {
      const { student_id, plan_id, token_amount } = metadata;
      if (!student_id || !token_amount) {
        console.error("Missing metadata for AI plan purchase");
        return new Response(JSON.stringify({ received: true, warning: "Missing metadata" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const tokens = parseInt(token_amount, 10);

      const { error: tokenError } = await supabase.rpc("add_student_tokens", {
        p_user_id: student_id,
        p_tokens: tokens,
      });
      if (tokenError) console.error("Token add error:", tokenError);

      await supabase.from("payments").upsert({
        user_id: student_id,
        amount: amountCents / 100,
        currency: "AUD",
        status: "completed",
        stripe_session_id: stripeSessionId,
        stripe_payment_id: stripePaymentId || null,
      }, { onConflict: "stripe_session_id" }).catch(() => {});

      console.log(`Added ${tokens} AI tokens to student ${student_id} (plan ${plan_id})`);

      return new Response(
        JSON.stringify({ received: true, type: "ai_plan", tokens_added: tokens }),
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

    // 1. Enroll in course_enrollments
    const { error: enrollError } = await supabase
      .from("course_enrollments")
      .upsert({
        user_id: student_id,
        course_id,
        enrollment_type: "paid",
        payment_status: "completed",
        payment_id: stripePaymentId,
        amount_paid: amountCents / 100,
        currency: "AUD",
        enrolled_at: new Date().toISOString(),
      }, { onConflict: "user_id,course_id" });

    if (enrollError) console.error("Enrollment error:", enrollError);

    // 2. Legacy enrollments table
    await supabase.from("enrollments").upsert({
      student_id,
      course_id,
      progress_percent: 0,
      enrolled_at: new Date().toISOString(),
    }, { onConflict: "student_id,course_id" }).catch(() => {});

    // 3. Teacher earning
    if (teacher_id && amountCents > 0) {
      await supabase.rpc("record_teacher_earning", {
        p_teacher_id: teacher_id,
        p_course_id: course_id,
        p_student_id: student_id,
        p_gross_cents: amountCents,
        p_stripe_payment_intent: stripePaymentId,
      }).catch(() => {});
    }

    // 4. Payment record using correct column names
    await supabase.from("payments").upsert({
      user_id: student_id,
      course_id,
      amount: amountCents / 100,
      currency: "AUD",
      status: "completed",
      stripe_session_id: stripeSessionId,
      stripe_payment_id: stripePaymentId || null,
    }, { onConflict: "stripe_session_id" }).catch(() => {});

    console.log(`Enrolled student ${student_id} in course ${course_id}`);

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
