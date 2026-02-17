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

const jsonHeaders = {
  ...corsHeaders,
  "Content-Type": "application/json",
};

const toIsoFromStripeTs = (ts?: number | null): string | null => {
  if (!ts) return null;
  return new Date(ts * 1000).toISOString();
};

type ConfirmRequest = {
  sessionId?: string;
  accessToken?: string;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: corsHeaders,
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: jsonHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Missing required environment configuration");
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const body = (await req.json()) as ConfirmRequest;
    const sessionId = body.sessionId;
    const accessToken = body.accessToken;

    if (!sessionId) {
      return new Response(JSON.stringify({ error: "sessionId is required" }), {
        status: 400,
        headers: jsonHeaders,
      });
    }

    if (!accessToken) {
      return new Response(JSON.stringify({ error: "Missing access token" }), {
        status: 401,
        headers: jsonHeaders,
      });
    }

    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(accessToken);
    if (authError || !authData.user) {
      return new Response(
        JSON.stringify({
          error: "Unauthorized",
          detail: authError?.message ?? "Invalid user session",
        }),
        { status: 401, headers: jsonHeaders },
      );
    }

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
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const metadata = session.metadata || {};
    const metaUserId = metadata.user_id as string | undefined;
    const packageId = (metadata.package_id as string | undefined) ?? null;

    if (!metaUserId || metaUserId !== authData.user.id) {
      return new Response(
        JSON.stringify({
          error: "Session user mismatch",
          detail: "Stripe session does not belong to the current user.",
        }),
        { status: 403, headers: jsonHeaders },
      );
    }

    const userId = authData.user.id;
    const amount = (session.amount_total ?? 0) / 100;
    const currency = (session.currency ?? "USD").toUpperCase();
    const providerSubscriptionId =
      typeof session.subscription === "string" ? session.subscription : null;
    const providerCustomerId =
      typeof session.customer === "string" ? session.customer : null;
    const providerPaymentId =
      typeof session.payment_intent === "string" ? session.payment_intent : null;

    const paidStatus = session.payment_status === "paid" ? "verified" : "pending";

    const upsertPayment = async () => {
      const payload = {
        user_id: userId,
        amount,
        currency,
        tx_hash: null,
        status: paidStatus,
        payment_method: "stripe",
        package_id: packageId,
        provider: "stripe",
        provider_payment_id: providerPaymentId ?? null,
        provider_session_id: session.id,
        provider_subscription_id: providerSubscriptionId ?? null,
        provider_customer_id: providerCustomerId ?? null,
        metadata: {
          ...(session.metadata || {}),
          confirm_source: "confirm-stripe-session",
        },
      };

      const { data, error } = await supabaseAdmin
        .from("payments")
        .upsert(payload, { onConflict: "provider_session_id" })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    };

    const paymentId = await upsertPayment();

    const upsertSubscription = async () => {
      if (paidStatus !== "verified") {
        return;
      }

      let startsAt: string | null = null;
      let expiresAt: string | null = null;
      let providerCustomerForSub: string | null = providerCustomerId;

      if (providerSubscriptionId) {
        const stripeSubscription = await stripe.subscriptions.retrieve(providerSubscriptionId);
        startsAt = toIsoFromStripeTs(stripeSubscription.current_period_start);
        expiresAt = toIsoFromStripeTs(stripeSubscription.current_period_end);
        if (typeof stripeSubscription.customer === "string") {
          providerCustomerForSub = stripeSubscription.customer;
        }
      } else {
        startsAt = new Date().toISOString();
        expiresAt = null;
      }

      const { error } = await supabaseAdmin
        .from("subscriptions")
        .upsert(
          {
            user_id: userId,
            package_id: packageId,
            payment_id: paymentId,
            starts_at: startsAt,
            expires_at: expiresAt,
            status: "active",
            provider: "stripe",
            provider_subscription_id: providerSubscriptionId,
            provider_customer_id: providerCustomerForSub,
            provider_event_created_at: toIsoFromStripeTs(session.created),
            provider_last_event_id: session.id,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" },
        );
      if (error) throw error;
    };

    await upsertSubscription();

    return new Response(
      JSON.stringify({
        ok: true,
        paymentStatus: paidStatus,
      }),
      { status: 200, headers: jsonHeaders },
    );
  } catch (error) {
    console.error("confirm-stripe-session error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Internal error",
      }),
      { status: 500, headers: jsonHeaders },
    );
  }
});

