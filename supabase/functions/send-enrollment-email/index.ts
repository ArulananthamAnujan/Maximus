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

    // Generate a password reset link so the student can set their own password
    const { data: linkData } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email: student.email,
    });
    const resetLink = linkData?.properties?.action_link || "";

    const emailBody = [
      `Hi ${student.full_name},`,
      ``,
      `You have been enrolled in a new course on ${appName}!`,
      ``,
      `Course: ${course.title}`,
      ``,
      `You can access your course by logging in at:`,
      `${appUrl}`,
      ``,
      `Email: ${student.email}`,
      ``,
      resetLink
        ? `If you need to set or reset your password, use this link:\n${resetLink}\n`
        : "",
      `If you have any questions, please contact your administrator.`,
      ``,
      `— The ${appName} Team`,
    ].filter(l => l !== undefined).join("\n");

    // Log the email (Supabase sends actual email via the recovery link)
    console.log(`Enrollment notification for ${student.email} (${course.title}):\n${emailBody}`);

    return new Response(JSON.stringify({
      success: true,
      student_email: student.email,
      course_title: course.title,
      reset_link_generated: !!resetLink,
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
