import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    // Create admin client with service role
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    // Verify the requesting user is authenticated
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user: requestingUser }, error: authError } = await supabaseAdmin.auth.getUser(token);
    
    if (authError || !requestingUser) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if requesting user has an active admin role in admin_roles table
    const { data: adminData, error: adminError } = await supabaseAdmin
      .from("admin_roles")
      .select("admin_role, status")
      .eq("user_id", requestingUser.id)
      .eq("status", "active")
      .single();

    if (adminError || !adminData) {
      return new Response(JSON.stringify({ error: "Unauthorized - Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Starting subscription expiration check...");

    // Get current time
    const now = new Date().toISOString();

    // Find active subscriptions that have passed their expiration date
    const { data: expiredSubs, error: fetchError } = await supabaseAdmin
      .from("subscriptions")
      .select("id, user_id, expires_at, status")
      .eq("status", "active")
      .lt("expires_at", now);

    if (fetchError) {
      console.error("Error fetching subscriptions:", fetchError);
      throw fetchError;
    }

    console.log(`Found ${expiredSubs?.length || 0} subscriptions to expire`);

    if (expiredSubs && expiredSubs.length > 0) {
      // Update all expired subscriptions to 'expired' status
      const { error: updateError } = await supabaseAdmin
        .from("subscriptions")
        .update({ 
          status: "expired",
          updated_at: now 
        })
        .in("id", expiredSubs.map((s: { id: string }) => s.id));

      if (updateError) {
        console.error("Error updating subscriptions:", updateError);
        throw updateError;
      }

      console.log(`Successfully expired ${expiredSubs.length} subscriptions`);

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: `Expired ${expiredSubs.length} subscriptions`
        }),
        { 
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200 
        }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "No subscriptions to expire" 
      }),
      { 
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200 
      }
    );

  } catch (error: unknown) {
    console.error("Error in expire-subscriptions function:", error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: "An error occurred" 
      }),
      { 
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500 
      }
    );
  }
});
