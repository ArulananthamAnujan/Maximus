import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@14";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const ALLOWED_ORIGINS = [
  Deno.env.get("SITE_URL"),
  "https://maximusacademy.com.au",
  "https://www.maximusacademy.com.au",
].filter(Boolean) as string[];

function getSiteUrl(req: Request): string {
  // Always prefer the configured SITE_URL env var
  const envUrl = Deno.env.get("SITE_URL");
  if (envUrl) return envUrl;

  // Only accept Origin header if it matches our allowlist
  const origin = req.headers.get("origin");
  if (origin && ALLOWED_ORIGINS.includes(origin)) return origin;

  // Safe fallback — never use untrusted headers for redirect URLs
  return "https://maximusacademy.com.au";
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

    const stripe = new Stripe(stripeKey, { apiVersion: "2024-11-20.acacia" });

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

    const body = await req.json();
    const { type, course_id, plan_id, promo_code } = body;
    const siteUrl = getSiteUrl(req);

    if (type === "course") {
      if (!course_id) {
        return new Response(JSON.stringify({ error: "course_id required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: course } = await supabase
        .from("courses")
        .select("id, title, price, price_amount, thumbnail_url, teacher_id, is_free")
        .eq("id", course_id)
        .maybeSingle();

      if (!course) {
        return new Response(JSON.stringify({ error: "Course not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const price = Number(course.price_amount ?? course.price ?? 0);
      if (course.is_free || price === 0) {
        return new Response(JSON.stringify({ error: "This course is free" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Promo codes are validated here, on the server, so the amount charged always
      // matches the discount the student was shown.
      let discountPercent = 0;
      let appliedPromo = "";
      if (typeof promo_code === "string" && promo_code.trim()) {
        const { data: pct } = await supabase.rpc("validate_promo_code", {
          p_code: promo_code,
          p_course_id: course.id,
        });
        if (!pct) {
          return new Response(JSON.stringify({ error: "This promo code is invalid, expired or fully used." }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        discountPercent = Math.min(Math.max(Number(pct), 0), 100);
        appliedPromo = promo_code.trim().toUpperCase();
      }
      const finalCents = Math.round(price * 100 * (1 - discountPercent / 100));

      // Stripe cannot charge less than 50c. A code that makes the course (almost) free
      // enrols the student directly; the claim key stops the same code being reused
      // by the same student for the same course.
      if (finalCents < 50) {
        const { error: freeError } = await supabase.rpc("fulfill_stripe_session", {
          p_session_id: `promo:${appliedPromo}:${user.id}:${course.id}`,
          p_user_id: user.id,
          p_kind: "course",
          p_course_id: course.id,
          p_teacher_id: null,
          p_amount_cents: 0,
          p_payment_intent: null,
          p_promo_code: appliedPromo,
        });
        if (freeError) throw new Error(`Enrolment failed: ${freeError.message}`);
        return new Response(JSON.stringify({ enrolled: true, course_id: course.id }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Only include images if the URL is publicly accessible (not a data URL or blob)
      const images: string[] = [];
      if (
        course.thumbnail_url &&
        (course.thumbnail_url.startsWith("https://") || course.thumbnail_url.startsWith("http://"))
      ) {
        images.push(course.thumbnail_url);
      }

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        mode: "payment",
        customer_email: user.email,
        line_items: [
          {
            price_data: {
              currency: "aud",
              product_data: {
                name: appliedPromo ? `${course.title} (${discountPercent}% off — ${appliedPromo})` : course.title,
                ...(images.length > 0 ? { images } : {}),
              },
              unit_amount: finalCents,
            },
            quantity: 1,
          },
        ],
        metadata: {
          student_id: user.id,
          course_id: course.id,
          teacher_id: course.teacher_id || "",
          type: "course",
          promo_code: appliedPromo,
        },
        success_url: `${siteUrl}/student/courses?payment=success&course_id=${course_id}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${siteUrl}/courses/${course_id}?payment=cancelled`,
      });

      return new Response(JSON.stringify({ url: session.url }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (type === "ai_plan") {
      if (!plan_id) {
        return new Response(JSON.stringify({ error: "plan_id required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: plan } = await supabase
        .from("student_ai_plans")
        .select("id, name, price_cents, token_amount")
        .eq("id", plan_id)
        .maybeSingle();

      if (!plan) {
        return new Response(JSON.stringify({ error: "Plan not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        mode: "payment",
        customer_email: user.email,
        line_items: [
          {
            price_data: {
              currency: "aud",
              product_data: {
                name: `${plan.name} — ${plan.token_amount} AI Tokens`,
              },
              unit_amount: plan.price_cents,
            },
            quantity: 1,
          },
        ],
        metadata: {
          student_id: user.id,
          plan_id: plan.id,
          token_amount: String(plan.token_amount),
          type: "ai_plan",
        },
        success_url: `${siteUrl}/student/ai-plans?payment=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${siteUrl}/student/ai-plans?payment=cancelled`,
      });

      return new Response(JSON.stringify({ url: session.url }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (type === "teacher_ai_plan") {
      if (!plan_id) {
        return new Response(JSON.stringify({ error: "plan_id required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: buyer } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
      if (!buyer || !["teacher", "org_admin", "admin"].includes(buyer.role)) {
        return new Response(JSON.stringify({ error: "Only teachers can buy teacher AI plans" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: plan } = await supabase
        .from("teacher_ai_plans")
        .select("id, name, price_cents, token_amount")
        .eq("id", plan_id)
        .eq("is_active", true)
        .maybeSingle();

      if (!plan) {
        return new Response(JSON.stringify({ error: "Plan not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        mode: "payment",
        customer_email: user.email,
        line_items: [
          {
            price_data: {
              currency: "aud",
              product_data: {
                name: `${plan.name} — ${plan.token_amount} AI Tokens`,
              },
              unit_amount: plan.price_cents,
            },
            quantity: 1,
          },
        ],
        metadata: {
          student_id: user.id,
          plan_id: plan.id,
          token_amount: String(plan.token_amount),
          type: "teacher_ai_plan",
        },
        success_url: `${siteUrl}/teacher/earnings?payment=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${siteUrl}/teacher/earnings?payment=cancelled`,
      });

      return new Response(JSON.stringify({ url: session.url }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid type. Use 'course', 'ai_plan' or 'teacher_ai_plan'" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("Checkout error:", message, err);
    return new Response(
      JSON.stringify({ error: message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
