import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function buildNotificationEmail(opts: {
  to_name: string;
  from_name: string;
  subject: string;
  body: string;
  login_url: string;
}): string {
  const { to_name, from_name, subject, body, login_url } = opts;
  const bodyHtml = body.replace(/\n/g, "<br>");

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:40px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);max-width:600px;">
        <tr>
          <td style="background:linear-gradient(135deg,#0ea5e9,#0284c7);padding:32px 40px;">
            <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:800;">Maximus Academy</h1>
            <p style="margin:6px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">You have a new message</p>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 40px;">
            <p style="font-size:20px;font-weight:700;color:#111827;margin:0 0 4px;">Hi ${to_name},</p>
            <p style="font-size:14px;color:#6b7280;margin:0 0 24px;">You have received a message from <strong style="color:#374151;">${from_name}</strong>.</p>

            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:24px;margin-bottom:24px;">
              <p style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#94a3b8;margin:0 0 8px;">Subject</p>
              <p style="font-size:16px;font-weight:700;color:#1e293b;margin:0 0 20px;">${subject}</p>
              <p style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#94a3b8;margin:0 0 8px;">Message</p>
              <p style="font-size:15px;color:#374151;line-height:1.7;margin:0;">${bodyHtml}</p>
            </div>

            <div style="text-align:center;margin:28px 0;">
              <a href="${login_url}" style="display:inline-block;background:#0ea5e9;color:#ffffff;font-size:15px;font-weight:700;padding:14px 36px;border-radius:10px;text-decoration:none;">Log In to Reply</a>
            </div>

            <p style="font-size:13px;color:#9ca3af;margin:0;">If you have any questions, contact your administrator.</p>
          </td>
        </tr>
        <tr>
          <td style="background:#f9fafb;padding:16px 40px;text-align:center;border-top:1px solid #f0f0f0;">
            <p style="margin:0;font-size:12px;color:#9ca3af;">© 2026 Maximus Academy. All rights reserved.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
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
      .from("profiles").select("role, full_name").eq("id", caller.id).single();

    if (!callerProfile || !["admin", "co_admin"].includes(callerProfile.role)) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { to_user_id, subject, body } = await req.json();

    if (!to_user_id || !subject?.trim() || !body?.trim()) {
      return new Response(JSON.stringify({ error: "Missing to_user_id, subject, or body" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch recipient profile
    const { data: recipient } = await supabaseAdmin
      .from("profiles").select("full_name, email").eq("id", to_user_id).maybeSingle();

    if (!recipient) {
      return new Response(JSON.stringify({ error: "Recipient not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Save message to DB
    const { error: insertErr } = await supabaseAdmin.from("admin_messages").insert({
      from_user_id: caller.id,
      to_user_id,
      subject: subject.trim(),
      body: body.trim(),
    });

    if (insertErr) {
      return new Response(JSON.stringify({ error: insertErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Send email notification via Supabase SMTP (recovery link triggers real email delivery)
    const siteUrl = Deno.env.get("SITE_URL") || "https://maximusacademy.com.au";

    let emailSent = false;
    try {
      // Generate a password reset link — this triggers Supabase's SMTP to send a real email
      const { data: linkData } = await supabaseAdmin.auth.admin.generateLink({
        type: "recovery",
        email: recipient.email,
        options: {
          data: {
            notification_subject: subject.trim(),
            notification_body: body.trim(),
            from_name: callerProfile.full_name || "Admin",
          },
        },
      });

      // The recovery link sends Supabase's default email template.
      // Additionally, we attempt to send our custom HTML email via the Supabase email API
      const _resetLink = linkData?.properties?.action_link || siteUrl;

      const htmlBody = buildNotificationEmail({
        to_name: recipient.full_name || recipient.email,
        from_name: callerProfile.full_name || "Admin",
        subject: subject.trim(),
        body: body.trim(),
        login_url: siteUrl,
      });

      // Try Supabase's admin email endpoint (custom SMTP if configured)
      const emailRes = await fetch(
        `${Deno.env.get("SUPABASE_URL")}/auth/v1/admin/users/${to_user_id}/send-email`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
            "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!}`,
          },
          body: JSON.stringify({ email_type: "email_change_new", data: { html: htmlBody } }),
        }
      );

      emailSent = emailRes.ok;
      console.log(`Message sent to ${recipient.email} — subject: "${subject}", email delivery: ${emailSent}`);
    } catch (emailErr) {
      console.error("Email notification error:", emailErr);
    }

    return new Response(JSON.stringify({ success: true, email_sent: emailSent }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
