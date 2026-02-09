import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Rate limiting constants
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_TOKEN_VERIFY_ATTEMPTS_PER_HOUR = 10; // 10 token verification attempts per hour

interface VerifyRequest {
  email: string;
  code: string;
}

// Validate email format
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Validate code format (6 digits)
function isValidCode(code: string): boolean {
  return /^\d{6}$/.test(code);
}

// Check rate limit for token verification
async function checkVerifyRateLimit(
  supabaseAdmin: ReturnType<typeof createClient>,
  email: string
): Promise<{ allowed: boolean }> {
  const actionType = "verify_email_token";
  
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
    
    if (lastAttempt > windowStart && rateLimitData.attempt_count >= MAX_TOKEN_VERIFY_ATTEMPTS_PER_HOUR) {
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
    const email = body?.email;
    const code = body?.code;

    // Validate required fields
    if (!email || !code) {
      return new Response(
        JSON.stringify({ success: false, error: "Email and code are required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Validate email format
    if (typeof email !== "string" || !isValidEmail(email)) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid email format" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Validate code format
    if (typeof code !== "string" || !isValidCode(code)) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid code format" }),
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
      console.log("Rate limit exceeded for email token verification:", email);
      return new Response(
        JSON.stringify({ success: false, error: "Too many verification attempts. Please try again later." }),
        { status: 429, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Find the user by email using admin API
    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.listUsers();
    
    if (userError) {
      console.error("Error fetching users:", userError);
      return new Response(
        JSON.stringify({ success: false, error: "Verification failed" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const user = userData.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    
    if (!user) {
      // Don't reveal if user exists
      return new Response(
        JSON.stringify({ success: false, error: "Invalid verification code" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Check the OTP code
    const storedCode = user.user_metadata?.email_otp_code;
    const codeExpiry = user.user_metadata?.email_otp_expires;

    if (!storedCode || storedCode !== code) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid verification code" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (codeExpiry && new Date(codeExpiry) < new Date()) {
      return new Response(
        JSON.stringify({ success: false, error: "Verification code has expired. Please request a new one." }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Code is valid - mark user as verified
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
      user_metadata: {
        ...user.user_metadata,
        email_otp_code: null,
        email_otp_expires: null,
        custom_email_verified: true,
        custom_email_verified_at: new Date().toISOString(),
      },
    });

    if (updateError) {
      console.error("Error updating user verification status:", updateError);
      return new Response(
        JSON.stringify({ success: false, error: "Verification failed. Please try again." }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log("Email verified successfully for:", email);

    return new Response(
      JSON.stringify({ success: true, message: "Email verified successfully" }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: unknown) {
    console.error("Error in verify-email-token function:", error);
    return new Response(
      JSON.stringify({ success: false, error: "An error occurred" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
