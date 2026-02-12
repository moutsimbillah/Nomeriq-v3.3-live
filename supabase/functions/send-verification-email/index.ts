import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const MAX_VERIFICATION_EMAILS_PER_HOUR = 3;

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderTemplate(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce((result, [key, val]) => {
    const token = new RegExp(`{{\\s*${key}\\s*}}`, "g");
    return result.replace(token, val);
  }, template);
}

function toHtmlBody(text: string): string {
  return escapeHtml(text).replace(/\n/g, "<br>");
}

async function sendEmail(to: string, subject: string, html: string, fromIdentity: string) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: fromIdentity,
      to: [to],
      subject,
      html,
    }),
  });

  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`Failed to send email: ${errorData}`);
  }

  return response.json();
}

async function checkRateLimit(
  supabaseAdmin: ReturnType<typeof createClient>,
  email: string,
  actionType: string
): Promise<{ allowed: boolean }> {
  const { data: rateLimitData } = await supabaseAdmin
    .from("auth_rate_limits")
    .select("*")
    .eq("email", email.toLowerCase())
    .eq("action_type", actionType)
    .single();

  if (rateLimitData) {
    const lastAttempt = new Date(rateLimitData.last_attempt_at);
    const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);

    if (lastAttempt > windowStart && rateLimitData.attempt_count >= MAX_VERIFICATION_EMAILS_PER_HOUR) {
      return { allowed: false };
    }

    if (lastAttempt <= windowStart) {
      await supabaseAdmin
        .from("auth_rate_limits")
        .update({
          attempt_count: 1,
          first_attempt_at: new Date().toISOString(),
          last_attempt_at: new Date().toISOString(),
        })
        .eq("id", rateLimitData.id);
      return { allowed: true };
    }

    await supabaseAdmin
      .from("auth_rate_limits")
      .update({
        attempt_count: rateLimitData.attempt_count + 1,
        last_attempt_at: new Date().toISOString(),
      })
      .eq("id", rateLimitData.id);
  } else {
    await supabaseAdmin
      .from("auth_rate_limits")
      .insert({
        email: email.toLowerCase(),
        action_type: actionType,
        attempt_count: 1,
        first_attempt_at: new Date().toISOString(),
        last_attempt_at: new Date().toISOString(),
      });
  }

  return { allowed: true };
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const email = body?.email;

    if (!email) {
      return new Response(JSON.stringify({ error: "Email is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (typeof email !== "string" || !isValidEmail(email)) {
      return new Response(JSON.stringify({ error: "Invalid email format" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const rateLimitResult = await checkRateLimit(supabaseAdmin, email, "verification_email");
    if (!rateLimitResult.allowed) {
      return new Response(
        JSON.stringify({ error: "Too many verification email requests. Please try again later." }),
        { status: 429, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.listUsers();
    if (userError) {
      console.error("Error fetching users:", userError);
      return new Response(JSON.stringify({ error: "Verification failed" }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const user = userData.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (!user) {
      return new Response(
        JSON.stringify({ success: true, message: "If an account exists, a verification code has been sent" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const otpCode = generateOTP();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
      user_metadata: {
        ...user.user_metadata,
        email_otp_code: otpCode,
        email_otp_expires: otpExpiry,
        custom_email_verified: false,
      },
    });

    if (updateError) {
      console.error("Error updating user metadata:", updateError);
      return new Response(JSON.stringify({ error: "Verification failed" }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const { data: brandSettings } = await supabaseAdmin
      .from("global_settings")
      .select("brand_name, support_email")
      .limit(1)
      .maybeSingle();

    const { data: emailSettings } = await supabaseAdmin
      .from("email_template_settings")
      .select("sender_name, sender_email, verification_subject, verification_body")
      .limit(1)
      .maybeSingle();

    const brandName = brandSettings?.brand_name || "nomeriq";
    const supportEmail = brandSettings?.support_email || "support@nomeriq.com";
    const senderName = emailSettings?.sender_name || brandName;
    const senderEmail = emailSettings?.sender_email || "noreply@nomeriq.com";

    const subjectTemplate = emailSettings?.verification_subject || "Your verification code: {{otp_code}}";
    const bodyTemplate =
      emailSettings?.verification_body ||
      "Hi {{user_email}},\n\nUse this verification code to activate your account:\n\n{{otp_code}}\n\nThis code expires in {{code_expiry_minutes}} minutes.\n\nIf you did not request this, ignore this message.\n\n- {{brand_name}}";

    const templateValues = {
      brand_name: brandName,
      user_email: email,
      otp_code: otpCode,
      code_expiry_minutes: "10",
      support_email: supportEmail,
    };

    const subject = renderTemplate(subjectTemplate, templateValues);
    const bodyText = renderTemplate(bodyTemplate, templateValues);
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); border-radius: 12px; padding: 28px 24px; text-align: center; margin-bottom: 24px;">
          <h1 style="color: #fff; margin: 0; font-size: 24px; font-weight: 600;">${escapeHtml(brandName)}</h1>
        </div>
        <div style="background: #fff; border-radius: 12px; padding: 26px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.08);">
          <div style="color:#334155;font-size:15px;">${toHtmlBody(bodyText)}</div>
        </div>
      </body>
      </html>
    `;

    await sendEmail(email, subject, html, `${senderName} <${senderEmail}>`);

    return new Response(JSON.stringify({ success: true, message: "Verification code sent" }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: unknown) {
    console.error("Error in send-verification-email function:", error);
    return new Response(JSON.stringify({ error: "An error occurred" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};

serve(handler);

