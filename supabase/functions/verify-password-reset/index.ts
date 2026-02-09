import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Rate limiting constants
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_RESET_ATTEMPTS_PER_HOUR = 5; // 5 password reset attempts per hour

// Validate email format
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Validate code format (6 digits)
function isValidCode(code: string): boolean {
  return /^\d{6}$/.test(code);
}

// Check rate limit for password reset
async function checkResetRateLimit(
  supabaseAdmin: ReturnType<typeof createClient>,
  email: string
): Promise<{ allowed: boolean }> {
  const actionType = "password_reset_verify";
  
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
    
    if (lastAttempt > windowStart && rateLimitData.attempt_count >= MAX_RESET_ATTEMPTS_PER_HOUR) {
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
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const email = body?.email;
    const code = body?.code;
    const newPassword = body?.newPassword;

    // Validate required fields
    if (!email || !code || !newPassword) {
      return new Response(
        JSON.stringify({ error: "Email, code, and new password are required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Validate email format
    if (typeof email !== "string" || !isValidEmail(email)) {
      return new Response(
        JSON.stringify({ error: "Invalid email format" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Validate code format
    if (typeof code !== "string" || !isValidCode(code)) {
      return new Response(
        JSON.stringify({ error: "Invalid code format" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Validate password
    if (typeof newPassword !== "string" || newPassword.length < 8) {
      return new Response(
        JSON.stringify({ error: "Password must be at least 8 characters long" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (newPassword.length > 128) {
      return new Response(
        JSON.stringify({ error: "Password is too long" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Create Supabase admin client
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Check rate limit
    const rateLimitResult = await checkResetRateLimit(supabaseAdmin, email);
    if (!rateLimitResult.allowed) {
      console.log("Rate limit exceeded for password reset verification:", email);
      return new Response(
        JSON.stringify({ error: "Too many password reset attempts. Please try again later." }),
        { status: 429, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Find the token
    const { data: tokenData, error: tokenError } = await supabaseAdmin
      .from("password_reset_tokens")
      .select("*")
      .eq("email", email.toLowerCase())
      .eq("code", code)
      .eq("used", false)
      .single();

    if (tokenError || !tokenData) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired reset code" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Check if token is expired
    if (new Date(tokenData.expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ error: "Reset code has expired. Please request a new one." }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Find user by email
    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.listUsers();
    
    if (userError) {
      console.error("Error finding user:", userError);
      return new Response(
        JSON.stringify({ error: "Password reset failed" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const user = userData?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase());
    
    if (!user) {
      return new Response(
        JSON.stringify({ error: "User not found" }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Update user password
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      user.id,
      { password: newPassword }
    );

    if (updateError) {
      console.error("Error updating password:", updateError);
      return new Response(
        JSON.stringify({ error: "Password reset failed" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Mark token as used
    await supabaseAdmin
      .from("password_reset_tokens")
      .update({ used: true })
      .eq("id", tokenData.id);

    // Clean up all tokens for this email
    await supabaseAdmin
      .from("password_reset_tokens")
      .delete()
      .eq("email", email.toLowerCase());

    console.log("Password reset successful for:", email);

    return new Response(
      JSON.stringify({ success: true, message: "Password reset successfully" }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: unknown) {
    console.error("Error in verify-password-reset function:", error);
    return new Response(
      JSON.stringify({ error: "An error occurred" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
