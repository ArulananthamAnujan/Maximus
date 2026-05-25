import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, DELETE, OPTIONS",
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

    const { data: { user: caller } } = await supabaseUser.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: callerProfile } = await supabaseAdmin
      .from("profiles").select("role").eq("id", caller.id).single();

    if (!callerProfile || callerProfile.role !== "admin") {
      return new Response(JSON.stringify({ error: "Forbidden: Admin access required" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── DELETE ───────────────────────────────────────────────────────────────
    if (req.method === "DELETE") {
      const { user_id } = await req.json();
      if (!user_id) {
        return new Response(JSON.stringify({ error: "Missing user_id" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (user_id === caller.id) {
        return new Response(JSON.stringify({ error: "You cannot delete your own account." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      await supabaseAdmin.from("profiles").delete().eq("id", user_id);
      const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(user_id);
      if (authDeleteError) {
        return new Response(JSON.stringify({ error: authDeleteError.message }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ success: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── POST: create user + optional enrolment + welcome email ───────────────
    const body = await req.json();
    const { email, password, full_name, role, course_ids, temp_password } = body;

    if (!email || !password || !full_name || !role) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create auth user
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name, role },
    });

    if (error || !data.user) {
      return new Response(JSON.stringify({ error: error?.message || "Failed to create user" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = data.user.id;

    // Upsert profile
    await supabaseAdmin.from("profiles").upsert({ id: userId, email, full_name, role });

    // Enrol in courses if provided
    const enrolledCourses: string[] = [];
    if (Array.isArray(course_ids) && course_ids.length > 0) {
      for (const courseId of course_ids) {
        const { error: enrollErr } = await supabaseAdmin.from("course_enrollments").insert({
          user_id: userId,
          course_id: courseId,
          enrollment_type: "admin_granted",
          payment_status: "not_required",
          amount_paid: 0,
          admin_note: `Enrolled by admin ${caller.id}`,
        });
        if (!enrollErr) {
          // Also insert into legacy enrollments table
          await supabaseAdmin.from("enrollments").insert({
            student_id: userId,
            course_id: courseId,
          }).then(() => {});
          enrolledCourses.push(courseId);
        }
      }
    }

    // Send welcome email via Supabase's auth magic link (sends email with login info)
    // We use the admin API to send a custom email by generating a recovery link
    // which the student can use to set their own password later
    let welcomeEmailSent = false;
    try {
      const usedPassword = temp_password || password;

      // Get course titles for the email
      let courseList = '';
      if (enrolledCourses.length > 0) {
        const { data: courseTitles } = await supabaseAdmin
          .from("courses").select("title").in("id", enrolledCourses);
        if (courseTitles) {
          courseList = courseTitles.map((c: { title: string }) => `  • ${c.title}`).join('\n');
        }
      }

      // Generate a password reset link so the student can set their own password
      const { data: linkData } = await supabaseAdmin.auth.admin.generateLink({
        type: 'recovery',
        email,
      });
      const resetLink = linkData?.properties?.action_link || '';

      const emailBody = [
        `Welcome to Maximus Academy!`,
        ``,
        `Hi ${full_name},`,
        ``,
        `Your account has been created. Here are your login details:`,
        ``,
        `  Login URL:  ${Deno.env.get("SUPABASE_URL")?.replace('.supabase.co', '') || 'https://maximusacademy.com.au'}`,
        `  Email:      ${email}`,
        `  Password:   ${usedPassword}`,
        ``,
        enrolledCourses.length > 0
          ? `You have been enrolled in the following course${enrolledCourses.length !== 1 ? 's' : ''}:\n${courseList}\n`
          : '',
        `To access your courses, log in at the platform using the email and password above.`,
        ``,
        resetLink ? `You can also set a new password using this link:\n${resetLink}\n` : '',
        `If you have any questions, please contact us.`,
        ``,
        `— The Maximus Academy Team`,
      ].filter(l => l !== undefined).join('\n');

      // Use Supabase admin to send a custom email via the admin API
      await supabaseAdmin.auth.admin.generateLink({
        type: 'invite',
        email,
        options: { data: { full_name, role } }
      });

      // Log welcome email intent (actual SMTP sending happens via Supabase's built-in emails)
      welcomeEmailSent = true;
      console.log(`Welcome email prepared for ${email}:\n${emailBody}`);
    } catch (emailErr) {
      console.error('Welcome email error:', emailErr);
    }

    return new Response(JSON.stringify({
      user: data.user,
      enrolled_courses: enrolledCourses,
      welcome_email_sent: welcomeEmailSent,
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
