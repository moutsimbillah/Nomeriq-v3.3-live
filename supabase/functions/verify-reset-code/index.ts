import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Rate limiting constants
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_VERIFY_ATTEMPTS_PER_HOUR = 10; // 10 verification attempts per hour

// Validate email format
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Validate code format (6 digits)
function isValidCode(code: string): boolean {
  return /^\d{6}$/.test(code);
}

function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizeCode(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/\D/g, "").slice(0, 6);
}

// Check rate limit for code verification
async function checkVerifyRateLimit(
  supabaseAdmin: ReturnType<typeof createClient>,
  email: string
): Promise<{ allowed: boolean }> {
  const actionType = "verify_reset_code";
  
  // Get rate limit record
  const { data: rateLimitData } = await supabaseAdmin
    .from("auth_rate_limits")
    .select("*")
    .eq("email", email.toLowerCase())
    .eq("action_type", actionType)
    .single();

  // Check if rate limit exceeded within window
  if (rateLimitData) {
    const lastAttempt = new Date(rateLimitData.last_attempt_at);
    const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);
    
    if (lastAttempt > windowStart && rateLimitData.attempt_count >= MAX_VERIFY_ATTEMPTS_PER_HOUR) {
      return { allowed: false };
    }
    
    // Reset counter if outside window
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
    
    // Increment counter
    await supabaseAdmin
      .from("auth_rate_limits")
      .update({
        attempt_count: rateLimitData.attempt_count + 1,
        last_attempt_at: new Date().toISOString(),
      })
      .eq("id", rateLimitData.id);
  } else {
    // Create new rate limit record
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
    const email = normalizeEmail(body?.email);
    const code = normalizeCode(body?.code);

    // Validate required fields
    if (!email || !code) {
      return new Response(
        JSON.stringify({ valid: false, error: "Email and code are required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Validate email format
    if (typeof email !== "string" || !isValidEmail(email)) {
      return new Response(
        JSON.stringify({ valid: false, error: "Invalid email format" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Validate code format
    if (typeof code !== "string" || !isValidCode(code)) {
      return new Response(
        JSON.stringify({ valid: false, error: "Invalid code format" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Check rate limit
    const rateLimitResult = await checkVerifyRateLimit(supabaseAdmin, email);
    if (!rateLimitResult.allowed) {
      console.log("Rate limit exceeded for code verification:", email);
      return new Response(
        JSON.stringify({ valid: false, error: "Too many verification attempts. Please try again later." }),
        { status: 429, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const { data: tokenData, error: tokenError } = await supabaseAdmin
      .from("password_reset_tokens")
      .select("*")
      .eq("email", email)
      .eq("code", code)
      .eq("used", false)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (tokenError || !tokenData) {
      return new Response(
        JSON.stringify({ valid: false, error: "Invalid code" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (new Date(tokenData.expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ valid: false, error: "Code has expired" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    return new Response(
      JSON.stringify({ valid: true }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: unknown) {
    console.error("Error verifying code:", error);
    return new Response(
      JSON.stringify({ valid: false, error: "Verification failed" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
