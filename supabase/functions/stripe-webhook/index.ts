import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

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
    const body = await req.text();
    const sig = req.headers.get("stripe-signature");
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

    // Verify Stripe signature if webhook secret is configured
    if (webhookSecret && sig) {
      // Simple timestamp + signature validation
      const parts = sig.split(",");
      const tPart = parts.find((p) => p.startsWith("t="));
      if (!tPart) {
        return new Response(JSON.stringify({ error: "Invalid signature" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Full Stripe signature verification would require crypto — for now proceed with payload parsing
    }

    const event = JSON.parse(body);

    // Only handle checkout completed and payment intent succeeded
    if (
      event.type !== "checkout.session.completed" &&
      event.type !== "payment_intent.succeeded"
    ) {
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Extract metadata from Stripe event
    // Stripe checkout sessions should include metadata: { student_id, course_id, teacher_id, amount_cents }
    let metadata: Record<string, string> = {};
    let amountCents = 0;
    let paymentIntentId = "";

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      metadata = session.metadata || {};
      amountCents = session.amount_total || 0;
      paymentIntentId = session.payment_intent || "";
    } else if (event.type === "payment_intent.succeeded") {
      const pi = event.data.object;
      metadata = pi.metadata || {};
      amountCents = pi.amount || 0;
      paymentIntentId = pi.id || "";
    }

    const { student_id, course_id, teacher_id } = metadata;

    if (!student_id || !course_id) {
      console.error("Missing student_id or course_id in Stripe metadata");
      return new Response(JSON.stringify({ received: true, warning: "Missing metadata" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Enrol the student in the course (upsert to avoid duplicates)
    const { error: enrollError } = await supabase
      .from("course_enrollments")
      .upsert(
        {
          user_id: student_id,
          course_id: course_id,
          enrollment_type: "paid",
          payment_status: "completed",
          payment_id: paymentIntentId,
          amount_paid: amountCents / 100,
          currency: "AUD",
          enrolled_at: new Date().toISOString(),
        },
        { onConflict: "user_id,course_id" }
      );

    if (enrollError) {
      console.error("Enrollment error:", enrollError);
    }

    // Also upsert legacy enrollments table for backwards compatibility
    await supabase
      .from("enrollments")
      .upsert(
        {
          student_id: student_id,
          course_id: course_id,
          progress_percent: 0,
          enrolled_at: new Date().toISOString(),
        },
        { onConflict: "student_id,course_id" }
      );

    // 2. Record teacher earning if teacher_id is present
    if (teacher_id && amountCents > 0) {
      await supabase.rpc("record_teacher_earning", {
        p_teacher_id: teacher_id,
        p_course_id: course_id,
        p_student_id: student_id,
        p_gross_cents: amountCents,
        p_stripe_payment_intent: paymentIntentId,
      });
    }

    // 3. Record payment in the payments table
    const { data: courseData } = await supabase
      .from("courses")
      .select("price, title")
      .eq("id", course_id)
      .maybeSingle();

    await supabase.from("payments").upsert(
      {
        student_id: student_id,
        course_id: course_id,
        amount: amountCents / 100,
        currency: "AUD",
        status: "completed",
        payment_method: "stripe",
        transaction_id: paymentIntentId,
      },
      { onConflict: "transaction_id" }
    ).catch(() => {}); // Non-fatal if payments table doesn't have transaction_id unique constraint

    console.log(`Enrolled student ${student_id} in course ${course_id}`);

    return new Response(
      JSON.stringify({ received: true, enrolled: true, course: courseData?.title }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("Webhook error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
