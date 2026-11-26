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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    // Verify caller is admin or co_admin
    const { data: { user: caller } } = await supabaseUser.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: callerProfile } = await supabaseAdmin
      .from("profiles").select("role").eq("id", caller.id).single();

    if (!callerProfile || !["admin", "co_admin"].includes(callerProfile.role)) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { student_id, course_id, platform_name, platform_url } = await req.json();

    if (!student_id || !course_id) {
      return new Response(JSON.stringify({ error: "Missing student_id or course_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch student and course details
    const [studentRes, courseRes] = await Promise.all([
      supabaseAdmin.from("profiles").select("full_name, email").eq("id", student_id).single(),
      supabaseAdmin.from("courses").select("title, description").eq("id", course_id).single(),
    ]);

    const student = studentRes.data;
    const course = courseRes.data;

    if (!student || !course) {
      return new Response(JSON.stringify({ error: "Student or course not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const appName = platform_name || "Maximus Academy";
    const appUrl = platform_url || "https://maximusacademy.com.au";

    // NOTE: this function does not deliver an email itself. It previously generated a
    // password-recovery link and wrote it to the function logs, which let anyone with
    // log access take over the student's account. No recovery link is generated now.
    console.log(`Enrollment recorded for user ${student_id} in "${course.title}" (${appName}, ${appUrl})`);

    return new Response(JSON.stringify({
      success: true,
      student_email: student.email,
      course_title: course.title,
      reset_link_generated: false,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
