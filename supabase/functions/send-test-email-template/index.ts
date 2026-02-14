import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type TemplateType = "verification" | "reset";

type EmailTemplatePayload = {
  sender_name: string;
  sender_email: string;
  verification_subject: string;
  verification_body: string;
  reset_subject: string;
  reset_body: string;
};

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

async function sendEmail(
  to: string,
  subject: string,
  html: string,
  fromIdentity: string,
  resendApiKey: string
) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${resendApiKey}`,
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
}

async function resolveResendApiKey(
  adminClient: ReturnType<typeof createClient>
): Promise<string | null> {
  const { data, error } = await adminClient
    .from("email_provider_settings")
    .select("resend_api_key")
    .eq("provider", "resend")
    .maybeSingle();

  if (error) {
    const code = (error as { code?: string }).code;
    if (code !== "42P01" && code !== "PGRST116") {
      console.error("Error loading email provider settings:", error);
    }
  }

  return data?.resend_api_key || Deno.env.get("RESEND_API_KEY") || null;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const bearerToken = authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length).trim()
      : "";
    if (!bearerToken) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const {
      data: { user },
      error: authError,
    } = await adminClient.auth.getUser(bearerToken);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const { data: role } = await adminClient
      .from("admin_roles")
      .select("admin_role, status")
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();

    if (!role || role.admin_role !== "super_admin") {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const resendApiKey = await resolveResendApiKey(adminClient);
    if (!resendApiKey) {
      return new Response(JSON.stringify({ error: "Resend API key is not configured" }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const body = await req.json();
    const toEmail: string = body?.toEmail;
    const templateType: TemplateType = body?.templateType;
    const templates: EmailTemplatePayload = body?.templates;

    if (!toEmail || !templateType || !templates) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const { data: brandSettings } = await adminClient
      .from("global_settings")
      .select("brand_name, support_email")
      .limit(1)
      .maybeSingle();

    const brandName = brandSettings?.brand_name || "nomeriq";
    const supportEmail = brandSettings?.support_email || "support@nomeriq.com";
    const sampleOtpCode = "123456";

    const values = {
      brand_name: brandName,
      user_email: toEmail,
      otp_code: sampleOtpCode,
      code_expiry_minutes: "10",
      support_email: supportEmail,
    };

    const subjectTemplate =
      templateType === "verification"
        ? templates.verification_subject
        : templates.reset_subject;
    const bodyTemplate =
      templateType === "verification"
        ? templates.verification_body
        : templates.reset_body;

    const subject = renderTemplate(subjectTemplate, values);
    const textBody = renderTemplate(bodyTemplate, values);
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
          <div style="color:#334155;font-size:15px;">${toHtmlBody(textBody)}</div>
        </div>
      </body>
      </html>
    `;

    const fromIdentity = `${templates.sender_name} <${templates.sender_email}>`;
    await sendEmail(toEmail, subject, html, fromIdentity, resendApiKey);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error) {
    console.error("Error in send-test-email-template:", error);
    const message =
      error instanceof Error && error.message
        ? error.message
        : "Failed to send test email";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};

serve(handler);

