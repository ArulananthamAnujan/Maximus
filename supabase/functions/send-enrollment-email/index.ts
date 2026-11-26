import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

/**
 * Sends one email through Resend (https://resend.com). Needs two function secrets:
 *   RESEND_API_KEY  – API key from the Resend dashboard
 *   EMAIL_FROM      – verified sender, e.g. "Maximus Academy <no-reply@yourdomain.com>"
 * Returns false (and logs why) when email is not configured or the send fails.
 */
async function sendEmail(to: string, subject: string, html: string, text?: string): Promise<boolean> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("EMAIL_FROM");
  if (!apiKey || !from) {
    console.warn("Email not sent: RESEND_API_KEY / EMAIL_FROM are not configured.");
    return false;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ from, to: [to], subject, html, ...(text ? { text } : {}) }),
    });
    if (!res.ok) {
      console.error(`Email send failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error("Email send error:", err instanceof Error ? err.message : err);
    return false;
  }
}

function escapeHtml(value: string): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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

    const { student_id, course_id, platform_name } = await req.json();

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
    // The link in the email always points at the configured site, never at a URL
    // supplied by the caller.
    const appUrl = Deno.env.get("SITE_URL") || "https://maximusacademy.com.au";

    const html = `<!DOCTYPE html><html lang="en"><body style="margin:0;padding:32px 16px;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="600" align="center" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;">
    <tr><td style="background:#0284c7;padding:28px 36px;"><h1 style="margin:0;color:#ffffff;font-size:22px;">${escapeHtml(appName)}</h1></td></tr>
    <tr><td style="padding:32px 36px;color:#374151;font-size:15px;line-height:1.6;">
      <p style="margin:0 0 12px;font-size:18px;font-weight:700;color:#111827;">Hi ${escapeHtml(student.full_name || "there")},</p>
      <p style="margin:0 0 16px;">You have been enrolled in a new course:</p>
      <p style="margin:0 0 24px;padding:14px 18px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:10px;font-weight:700;color:#0c4a6e;">${escapeHtml(course.title)}</p>
      <p style="margin:0 0 24px;text-align:center;"><a href="${escapeHtml(appUrl)}" style="display:inline-block;background:#0ea5e9;color:#ffffff;font-weight:700;padding:13px 32px;border-radius:10px;text-decoration:none;">Log in to start learning</a></p>
      <p style="margin:0;font-size:13px;color:#6b7280;">Forgotten your password? Use "Forgot password" on the login page. If you have any questions, please contact your administrator.</p>
    </td></tr>
  </table>
</body></html>`;
    const text = `Hi ${student.full_name || "there"},\n\nYou have been enrolled in "${course.title}" on ${appName}.\n\nLog in to start learning: ${appUrl}\n\n— The ${appName} Team`;

    const emailSent = await sendEmail(student.email, `You're enrolled in ${course.title}`, html, text);

    return new Response(JSON.stringify({
      success: true,
      student_email: student.email,
      course_title: course.title,
      email_sent: emailSent,
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
