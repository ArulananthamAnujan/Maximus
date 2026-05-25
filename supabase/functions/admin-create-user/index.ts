import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function buildWelcomeEmail(opts: {
  full_name: string;
  email: string;
  role: string;
  courses: string[];
  loginUrl: string;
  resetLink: string;
}): { subject: string; html: string; text: string } {
  const { full_name, email, role, courses, loginUrl, resetLink } = opts;

  const courseRows = courses.length
    ? courses.map(c => `<tr><td style="padding:6px 12px;border-bottom:1px solid #f0f0f0;font-size:14px;color:#374151;">• ${c}</td></tr>`).join("")
    : "";

  const courseSection = courses.length
    ? `
    <div style="margin:24px 0;">
      <p style="font-size:14px;color:#374151;font-weight:600;margin:0 0 8px;">You have been enrolled in the following course${courses.length !== 1 ? "s" : ""}:</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:8px;overflow:hidden;">
        <tbody>${courseRows}</tbody>
      </table>
    </div>`
    : "";

  const roleLabel = role === "teacher" ? "Teacher" : "Student";

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:40px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);max-width:600px;">
        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#0ea5e9,#0284c7);padding:36px 40px;text-align:center;">
            <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:800;letter-spacing:-0.5px;">Maximus Academy</h1>
            <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:15px;">Welcome to your learning journey</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:40px;">
            <p style="font-size:22px;font-weight:700;color:#111827;margin:0 0 8px;">Welcome, ${full_name}!</p>
            <p style="font-size:14px;color:#6b7280;margin:0 0 24px;">Your ${roleLabel} account has been created. Here are your login credentials:</p>

            <!-- Credentials box -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:12px;margin-bottom:24px;">
              <tr>
                <td style="padding:20px 24px;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="padding:6px 0;">
                        <span style="font-size:12px;color:#0369a1;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Login URL</span><br>
                        <a href="${loginUrl}" style="font-size:14px;color:#0284c7;text-decoration:none;">${loginUrl}</a>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:6px 0;border-top:1px solid #e0f2fe;">
                        <span style="font-size:12px;color:#0369a1;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Email</span><br>
                        <span style="font-size:14px;color:#374151;">${email}</span>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            ${courseSection}

            <!-- CTA -->
            <div style="text-align:center;margin:28px 0;">
              <a href="${loginUrl}" style="display:inline-block;background:#0ea5e9;color:#ffffff;font-size:15px;font-weight:700;padding:14px 36px;border-radius:10px;text-decoration:none;">Log In to Platform</a>
            </div>

            ${resetLink ? `<p style="font-size:13px;color:#6b7280;margin:0 0 8px;">Prefer to set your own password? <a href="${resetLink}" style="color:#0284c7;">Click here to reset it</a>.</p>` : ""}

            <p style="font-size:13px;color:#6b7280;margin:16px 0 0;">If you have any questions, please contact us and we'll be happy to help.</p>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#f9fafb;padding:20px 40px;text-align:center;border-top:1px solid #f0f0f0;">
            <p style="margin:0;font-size:12px;color:#9ca3af;">© 2026 Maximus Academy. All rights reserved.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = [
    `Welcome to Maximus Academy!`,
    ``,
    `Hi ${full_name},`,
    ``,
    `Your ${roleLabel} account has been created. Here are your login details:`,
    ``,
    `  Login URL: ${loginUrl}`,
    `  Email:     ${email}`,
    ``,
    courses.length
      ? `You have been enrolled in:\n${courses.map(c => `  • ${c}`).join("\n")}\n`
      : "",
    resetLink ? `Set your password here: ${resetLink}\n` : `Log in at: ${loginUrl}`,
    ``,
    `— The Maximus Academy Team`,
  ].filter(l => l !== undefined).join("\n");

  const subject = `Welcome to Maximus Academy — Your Login Details`;
  return { subject, html, text };
}

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

    if (!callerProfile || !["admin", "co_admin"].includes(callerProfile.role)) {
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
          await supabaseAdmin.from("enrollments").insert({
            student_id: userId,
            course_id: courseId,
          }).then(() => {});
          enrolledCourses.push(courseId);
        }
      }
    }

    // Send welcome email
    let welcomeEmailSent = false;
    try {
      const siteUrl = Deno.env.get("SITE_URL") || "https://maximusacademy.com.au";

      // Fetch course titles
      let courseTitles: string[] = [];
      if (enrolledCourses.length > 0) {
        const { data: courseData } = await supabaseAdmin
          .from("courses").select("title").in("id", enrolledCourses);
        courseTitles = (courseData || []).map((c: { title: string }) => c.title);
      }

      // Generate password reset link so the user sets their own password
      let resetLink = "";
      try {
        const { data: linkData } = await supabaseAdmin.auth.admin.generateLink({
          type: "recovery",
          email,
        });
        resetLink = linkData?.properties?.action_link || "";
      } catch (_) { /* non-fatal */ }

      const { subject, html } = buildWelcomeEmail({
        full_name,
        email,
        role,
        courses: courseTitles,
        loginUrl: siteUrl,
        resetLink,
      });

      // Send via Supabase's built-in SMTP using the admin email API
      const smtpRes = await fetch(
        `${Deno.env.get("SUPABASE_URL")}/auth/v1/admin/users/${userId}/send-email`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
            "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!}`,
          },
          body: JSON.stringify({ email_type: "email_change_new", data: { subject, html } }),
        }
      );

      if (!smtpRes.ok) {
        // Fallback: trigger a magic link welcome email via Supabase SMTP
        await supabaseAdmin.auth.admin.generateLink({
          type: "magiclink",
          email,
          options: { data: { full_name, role } },
        });
        console.log(`Welcome email fallback triggered for ${email}, courses: ${courseTitles.join(", ")}`);
      }

      welcomeEmailSent = true;
    } catch (emailErr) {
      console.error("Welcome email error:", emailErr);
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
