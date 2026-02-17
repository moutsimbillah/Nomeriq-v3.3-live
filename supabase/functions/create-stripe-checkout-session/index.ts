import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@16.12.0?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

type CheckoutRequest = {
  packageId?: string;
  successUrl?: string;
  cancelUrl?: string;
  accessToken?: string;
};

const appendStripeState = (url: string, state: "success" | "cancel") => {
  const parsed = new URL(url);
  parsed.searchParams.set("stripe", state);
  if (state === "success") {
    parsed.searchParams.set("session_id", "{CHECKOUT_SESSION_ID}");
  }
  // Stripe requires the placeholder to remain raw (not URL-encoded) in success_url.
  return parsed
    .toString()
    .replace(/%7BCHECKOUT_SESSION_ID%7D/gi, "{CHECKOUT_SESSION_ID}");
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Missing required environment configuration");
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const { data: providerConfig, error: providerConfigError } = await supabaseAdmin
      .from("payment_provider_settings")
      .select("stripe_secret_key")
      .eq("provider", "stripe")
      .maybeSingle();
    if (providerConfigError) {
      throw providerConfigError;
    }

    const stripeSecret = providerConfig?.stripe_secret_key || Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeSecret) {
      throw new Error("Stripe is not configured. Missing secret key.");
    }

    const stripe = new Stripe(stripeSecret, { apiVersion: "2024-06-20" });
    const body = (await req.json()) as CheckoutRequest;
    const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
    const headerToken =
      authHeader?.startsWith("Bearer ") ? authHeader.replace("Bearer ", "").trim() : null;
    const token = headerToken || body.accessToken || "";

    if (!token) {
      return new Response(
        JSON.stringify({ error: "Unauthorized", detail: "Missing access token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !authData.user) {
      console.error("Stripe checkout auth failed:", authError?.message);
      return new Response(
        JSON.stringify({ error: "Unauthorized", detail: authError?.message ?? "Invalid user session" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const packageId = body.packageId;

    if (!packageId) {
      return new Response(
        JSON.stringify({ error: "packageId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const defaultBaseUrl = new URL(req.url);
    defaultBaseUrl.pathname = "/subscription";
    defaultBaseUrl.search = "";

    const successUrl = body.successUrl || defaultBaseUrl.toString();
    const cancelUrl = body.cancelUrl || defaultBaseUrl.toString();

    const { data: pkg, error: packageError } = await supabaseAdmin
      .from("subscription_packages")
      .select("id, name, status, duration_type, currency, stripe_price_id")
      .eq("id", packageId)
      .maybeSingle();

    if (packageError || !pkg) {
      return new Response(
        JSON.stringify({ error: "Package not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (pkg.status !== "active") {
      return new Response(
        JSON.stringify({ error: "Selected package is not active" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!pkg.stripe_price_id) {
      return new Response(
        JSON.stringify({ error: "Stripe is not configured for this package" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const isLifetime = pkg.duration_type === "lifetime";
    const stripePrice = await stripe.prices.retrieve(pkg.stripe_price_id);

    // Guardrail: prevent billing-period mismatches (e.g. yearly package pointing to monthly Stripe price).
    if (isLifetime) {
      if (stripePrice.type !== "one_time") {
        return new Response(
          JSON.stringify({
            error:
              "Package duration mismatch: lifetime package must use a one-time Stripe Price.",
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else {
      const recurring = stripePrice.recurring;
      if (!recurring) {
        return new Response(
          JSON.stringify({
            error:
              "Package duration mismatch: recurring package must use a recurring Stripe Price.",
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const interval = recurring.interval;
      const intervalCount = recurring.interval_count ?? 1;
      const isMonthlyPrice = interval === "month" && intervalCount === 1;
      const isYearlyPrice =
        (interval === "year" && intervalCount === 1) ||
        (interval === "month" && intervalCount === 12);

      if (pkg.duration_type === "monthly" && !isMonthlyPrice) {
        return new Response(
          JSON.stringify({
            error:
              "Package duration mismatch: monthly package must use a monthly Stripe Price.",
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (pkg.duration_type === "yearly" && !isYearlyPrice) {
        return new Response(
          JSON.stringify({
            error:
              "Package duration mismatch: yearly package must use a yearly Stripe Price.",
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const metadata = {
      user_id: authData.user.id,
      package_id: pkg.id,
      duration_type: pkg.duration_type,
    };

    const session = await stripe.checkout.sessions.create({
      mode: isLifetime ? "payment" : "subscription",
      success_url: appendStripeState(successUrl, "success"),
      cancel_url: appendStripeState(cancelUrl, "cancel"),
      customer_email: authData.user.email ?? undefined,
      payment_method_types: ["card"],
      line_items: [{ price: pkg.stripe_price_id, quantity: 1 }],
      metadata,
      ...(isLifetime ? {} : { subscription_data: { metadata } }),
    });

    if (!session.url) {
      throw new Error("Stripe did not return a checkout URL");
    }

    return new Response(
      JSON.stringify({ url: session.url, sessionId: session.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("create-stripe-checkout-session error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
