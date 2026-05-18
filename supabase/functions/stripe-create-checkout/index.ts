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

    const stripe = new Stripe(stripeKey, { apiVersion: "2024-11-20.acacia" });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify the JWT to get the user
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
    const { type, course_id, plan_id } = body;

    const siteUrl = req.headers.get("origin") || Deno.env.get("SUPABASE_URL")!.replace("supabase.co", "bolt.new");

    if (type === "course") {
      // Course purchase checkout
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

      const price = course.price_amount ?? course.price ?? 0;
      if (course.is_free || price === 0) {
        return new Response(JSON.stringify({ error: "This course is free" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        mode: "payment",
        line_items: [
          {
            price_data: {
              currency: "aud",
              product_data: {
                name: course.title,
                images: course.thumbnail_url ? [course.thumbnail_url] : [],
              },
              unit_amount: Math.round(price * 100),
            },
            quantity: 1,
          },
        ],
        metadata: {
          student_id: user.id,
          course_id: course.id,
          teacher_id: course.teacher_id || "",
          type: "course",
        },
        success_url: `${siteUrl}/student/courses/${course_id}?payment=success`,
        cancel_url: `${siteUrl}/courses/${course_id}?payment=cancelled`,
      });

      return new Response(JSON.stringify({ url: session.url }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (type === "ai_plan") {
      // AI token plan purchase checkout
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
        success_url: `${siteUrl}/student/ai-plans?payment=success`,
        cancel_url: `${siteUrl}/student/ai-plans?payment=cancelled`,
      });

      return new Response(JSON.stringify({ url: session.url }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid type. Use 'course' or 'ai_plan'" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Checkout error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
