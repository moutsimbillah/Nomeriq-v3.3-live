import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@16.12.0?target=deno";

const jsonHeaders = { "Content-Type": "application/json" };

const toIsoFromStripeTs = (ts?: number | null): string | null => {
  if (!ts) return null;
  return new Date(ts * 1000).toISOString();
};

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: jsonHeaders });
  }

  let supabaseAdmin: ReturnType<typeof createClient> | null = null;
  let eventId: string | null = null;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Missing required environment configuration");
    }

    supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const { data: providerConfig, error: providerConfigError } = await supabaseAdmin
      .from("payment_provider_settings")
      .select("stripe_secret_key, stripe_webhook_secret")
      .eq("provider", "stripe")
      .maybeSingle();
    if (providerConfigError) {
      throw providerConfigError;
    }

    const stripeSecret = providerConfig?.stripe_secret_key || Deno.env.get("STRIPE_SECRET_KEY");
    const webhookSecret =
      providerConfig?.stripe_webhook_secret || Deno.env.get("STRIPE_WEBHOOK_SECRET");

    if (!stripeSecret || !webhookSecret) {
      throw new Error("Stripe webhook is not configured. Missing Stripe key(s).");
    }

    const signature = req.headers.get("stripe-signature");
    if (!signature) {
      return new Response(JSON.stringify({ error: "Missing stripe-signature header" }), { status: 400, headers: jsonHeaders });
    }

    const rawBody = await req.text();
    const stripe = new Stripe(stripeSecret, { apiVersion: "2024-06-20" });

    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(rawBody, signature, webhookSecret);
    } catch (err) {
      return new Response(
        JSON.stringify({ error: `Invalid webhook signature: ${err instanceof Error ? err.message : "unknown error"}` }),
        { status: 400, headers: jsonHeaders }
      );
    }

    eventId = event.id;

    const { error: eventInsertError } = await supabaseAdmin
      .from("stripe_events")
      .insert({
        event_id: event.id,
        event_type: event.type,
        status: "processing",
        payload: event as unknown as Record<string, unknown>,
      });

    if (eventInsertError) {
      if ((eventInsertError as { code?: string }).code === "23505") {
        return new Response(JSON.stringify({ received: true, duplicate: true }), { status: 200, headers: jsonHeaders });
      }
      throw eventInsertError;
    }

    const upsertPayment = async (args: {
      userId: string;
      amount: number;
      currency: string;
      packageId: string | null;
      status: "pending" | "verified" | "rejected";
      providerPaymentId?: string | null;
      providerSessionId?: string | null;
      providerSubscriptionId?: string | null;
      providerCustomerId?: string | null;
      eventCreatedAt?: string | null;
      metadata?: Record<string, unknown>;
    }) => {
      const payload = {
        user_id: args.userId,
        amount: args.amount,
        currency: (args.currency || "USD").toUpperCase(),
        tx_hash: null,
        status: args.status,
        payment_method: "stripe",
        package_id: args.packageId,
        provider: "stripe",
        provider_payment_id: args.providerPaymentId ?? null,
        provider_session_id: args.providerSessionId ?? null,
        provider_subscription_id: args.providerSubscriptionId ?? null,
        provider_customer_id: args.providerCustomerId ?? null,
        metadata: args.metadata ?? {},
      };

      // Stripe subscription checkouts can emit both checkout.session.completed and invoice.paid
      // for the same first charge. When invoice.paid arrives, promote the checkout row instead
      // of inserting a second visible payment row.
      if (
        args.providerPaymentId &&
        args.providerSubscriptionId &&
        !args.providerSessionId &&
        args.eventCreatedAt
      ) {
        const incomingEventMs = new Date(args.eventCreatedAt).getTime();
        const placeholderWindowStart = Number.isFinite(incomingEventMs)
          ? new Date(incomingEventMs - 24 * 60 * 60 * 1000).toISOString()
          : null;

        if (placeholderWindowStart) {
          const { data: placeholder, error: placeholderError } = await supabaseAdmin
            .from("payments")
            .select("id, provider_session_id, metadata")
            .eq("provider", "stripe")
            .eq("user_id", args.userId)
            .eq("provider_subscription_id", args.providerSubscriptionId)
            .is("provider_payment_id", null)
            .not("provider_session_id", "is", null)
            .gte("created_at", placeholderWindowStart)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (placeholderError) throw placeholderError;

          if (placeholder?.id) {
            const mergedMetadata = {
              ...((placeholder.metadata as Record<string, unknown> | null) ?? {}),
              ...(args.metadata ?? {}),
            };

            const { data: updatedRow, error: updateError } = await supabaseAdmin
              .from("payments")
              .update({
                ...payload,
                provider_session_id: placeholder.provider_session_id,
                metadata: mergedMetadata,
              })
              .eq("id", placeholder.id)
              .select("id")
              .single();

            if (updateError) {
              // If another row already owns provider_payment_id, return it (idempotent behavior).
              if ((updateError as { code?: string }).code === "23505") {
                const { data: existingByProviderPayment, error: existingByProviderPaymentError } = await supabaseAdmin
                  .from("payments")
                  .select("id")
                  .eq("provider_payment_id", args.providerPaymentId)
                  .maybeSingle();
                if (existingByProviderPaymentError) throw existingByProviderPaymentError;
                if (existingByProviderPayment?.id) return existingByProviderPayment.id as string;
              }
              throw updateError;
            }

            return updatedRow.id as string;
          }
        }
      }

      if (args.providerSessionId) {
        const { data, error } = await supabaseAdmin
          .from("payments")
          .upsert(payload, { onConflict: "provider_session_id" })
          .select("id")
          .single();
        if (error) throw error;
        return data.id as string;
      }

      if (args.providerPaymentId) {
        const { data, error } = await supabaseAdmin
          .from("payments")
          .upsert(payload, { onConflict: "provider_payment_id" })
          .select("id")
          .single();
        if (error) throw error;
        return data.id as string;
      }

      const { data, error } = await supabaseAdmin
        .from("payments")
        .insert(payload)
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    };

    const upsertSubscription = async (args: {
      userId: string;
      packageId: string | null;
      paymentId: string | null;
      startsAt: string | null;
      expiresAt: string | null;
      status: "active" | "inactive" | "expired" | "pending";
      providerSubscriptionId?: string | null;
      providerCustomerId?: string | null;
      eventCreatedAt?: string | null;
      eventId?: string | null;
    }) => {
      if (args.eventCreatedAt) {
        const { data: existing, error: existingError } = await supabaseAdmin
          .from("subscriptions")
          .select("provider_event_created_at, provider_last_event_id")
          .eq("user_id", args.userId)
          .maybeSingle();
        if (existingError) throw existingError;

        const incomingTs = new Date(args.eventCreatedAt).getTime();
        const existingTs = existing?.provider_event_created_at
          ? new Date(existing.provider_event_created_at).getTime()
          : null;

        if (
          Number.isFinite(incomingTs) &&
          existingTs !== null &&
          Number.isFinite(existingTs)
        ) {
          if (existingTs > incomingTs) {
            // Ignore stale event update (older than already applied event).
            return;
          }
          if (
            existingTs === incomingTs &&
            existing?.provider_last_event_id &&
            args.eventId &&
            existing.provider_last_event_id === args.eventId
          ) {
            // Same event already applied.
            return;
          }
        }
      }

      const { error } = await supabaseAdmin
        .from("subscriptions")
        .upsert(
          {
            user_id: args.userId,
            package_id: args.packageId,
            payment_id: args.paymentId,
            starts_at: args.startsAt,
            expires_at: args.expiresAt,
            status: args.status,
            provider: "stripe",
            provider_subscription_id: args.providerSubscriptionId ?? null,
            provider_customer_id: args.providerCustomerId ?? null,
            provider_event_created_at: args.eventCreatedAt ?? null,
            provider_last_event_id: args.eventId ?? null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        );
      if (error) throw error;
    };

    const fetchSubscriptionContext = async (providerSubscriptionId: string) => {
      const stripeSubscription = await stripe.subscriptions.retrieve(providerSubscriptionId);
      const subMeta = stripeSubscription.metadata || {};

      let userId = (subMeta.user_id as string | undefined) ?? null;
      let packageId = (subMeta.package_id as string | undefined) ?? null;

      if (!userId) {
        const { data } = await supabaseAdmin
          .from("subscriptions")
          .select("user_id, package_id")
          .eq("provider_subscription_id", providerSubscriptionId)
          .maybeSingle();
        if (data) {
          userId = data.user_id;
          packageId = data.package_id;
        }
      }

      return { stripeSubscription, userId, packageId };
    };

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const metadata = session.metadata || {};
        const userId = metadata.user_id;
        const packageId = metadata.package_id || null;
        if (!userId) break;

        const amount = ((session.amount_total ?? 0) / 100);
        const providerSubscriptionId =
          typeof session.subscription === "string" ? session.subscription : null;
        const providerCustomerId =
          typeof session.customer === "string" ? session.customer : null;
        const providerPaymentId =
          typeof session.payment_intent === "string" ? session.payment_intent : null;

        const paidStatus = session.payment_status === "paid" ? "verified" : "pending";
        const paymentId = await upsertPayment({
          userId,
          packageId,
          amount,
          currency: session.currency ?? "USD",
          status: paidStatus,
          providerPaymentId,
          providerSessionId: session.id,
          providerSubscriptionId,
          providerCustomerId,
          eventCreatedAt: toIsoFromStripeTs(event.created),
          metadata: { eventType: event.type },
        });

        if (providerSubscriptionId) {
          const { stripeSubscription } = await fetchSubscriptionContext(providerSubscriptionId);
          await upsertSubscription({
            userId,
            packageId,
            paymentId,
            startsAt: toIsoFromStripeTs(stripeSubscription.current_period_start),
            expiresAt: toIsoFromStripeTs(stripeSubscription.current_period_end),
            status: "active",
            providerSubscriptionId,
            providerCustomerId,
            eventCreatedAt: toIsoFromStripeTs(event.created),
            eventId: event.id,
          });
        } else if (paidStatus === "verified") {
          await upsertSubscription({
            userId,
            packageId,
            paymentId,
            startsAt: new Date().toISOString(),
            expiresAt: null,
            status: "active",
            providerSubscriptionId: null,
            providerCustomerId,
            eventCreatedAt: toIsoFromStripeTs(event.created),
            eventId: event.id,
          });
        }
        break;
      }

      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        const providerSubscriptionId =
          typeof invoice.subscription === "string" ? invoice.subscription : null;
        if (!providerSubscriptionId) break;

        const { stripeSubscription, userId, packageId } = await fetchSubscriptionContext(providerSubscriptionId);
        if (!userId) break;

        const paymentId = await upsertPayment({
          userId,
          packageId,
          amount: (invoice.amount_paid ?? 0) / 100,
          currency: invoice.currency ?? "USD",
          status: "verified",
          providerPaymentId:
            typeof invoice.payment_intent === "string" ? invoice.payment_intent : invoice.id,
          providerSessionId: null,
          providerSubscriptionId,
          providerCustomerId:
            typeof invoice.customer === "string" ? invoice.customer : null,
          eventCreatedAt: toIsoFromStripeTs(event.created),
          metadata: { eventType: event.type, invoiceId: invoice.id },
        });

        await upsertSubscription({
          userId,
          packageId,
          paymentId,
          startsAt: toIsoFromStripeTs(stripeSubscription.current_period_start),
          expiresAt: toIsoFromStripeTs(stripeSubscription.current_period_end),
          status: "active",
          providerSubscriptionId,
          providerCustomerId:
            typeof stripeSubscription.customer === "string" ? stripeSubscription.customer : null,
          eventCreatedAt: toIsoFromStripeTs(event.created),
          eventId: event.id,
        });
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const providerSubscriptionId =
          typeof invoice.subscription === "string" ? invoice.subscription : null;
        if (!providerSubscriptionId) break;

        const { stripeSubscription, userId, packageId } = await fetchSubscriptionContext(providerSubscriptionId);
        if (!userId) break;

        await upsertPayment({
          userId,
          packageId,
          amount: (invoice.amount_due ?? 0) / 100,
          currency: invoice.currency ?? "USD",
          status: "rejected",
          providerPaymentId:
            typeof invoice.payment_intent === "string" ? invoice.payment_intent : invoice.id,
          providerSessionId: null,
          providerSubscriptionId,
          providerCustomerId:
            typeof invoice.customer === "string" ? invoice.customer : null,
          eventCreatedAt: toIsoFromStripeTs(event.created),
          metadata: { eventType: event.type, invoiceId: invoice.id },
        });

        const now = new Date();
        const expiresAt = toIsoFromStripeTs(stripeSubscription.current_period_end);
        const keepActive = expiresAt ? new Date(expiresAt) > now : false;

        await upsertSubscription({
          userId,
          packageId,
          paymentId: null,
          startsAt: toIsoFromStripeTs(stripeSubscription.current_period_start),
          expiresAt,
          status: keepActive ? "active" : "inactive",
          providerSubscriptionId,
          providerCustomerId:
            typeof stripeSubscription.customer === "string" ? stripeSubscription.customer : null,
          eventCreatedAt: toIsoFromStripeTs(event.created),
          eventId: event.id,
        });
        break;
      }

      case "customer.subscription.deleted": {
        const stripeSubscription = event.data.object as Stripe.Subscription;
        const providerSubscriptionId = stripeSubscription.id;
        const expiresAt = toIsoFromStripeTs(stripeSubscription.current_period_end);
        const now = new Date();

        const { data: currentSub } = await supabaseAdmin
          .from("subscriptions")
          .select("user_id, package_id")
          .eq("provider_subscription_id", providerSubscriptionId)
          .maybeSingle();

        if (currentSub?.user_id) {
          await upsertSubscription({
            userId: currentSub.user_id,
            packageId: currentSub.package_id,
            paymentId: null,
            startsAt: null,
            expiresAt,
            status: expiresAt && new Date(expiresAt) > now ? "active" : "inactive",
            providerSubscriptionId,
            providerCustomerId:
              typeof stripeSubscription.customer === "string" ? stripeSubscription.customer : null,
            eventCreatedAt: toIsoFromStripeTs(event.created),
            eventId: event.id,
          });
        }
        break;
      }

      default:
        break;
    }

    await supabaseAdmin
      .from("stripe_events")
      .update({
        status: "processed",
        error: null,
        processed_at: new Date().toISOString(),
      })
      .eq("event_id", event.id);

    return new Response(JSON.stringify({ received: true }), { status: 200, headers: jsonHeaders });
  } catch (error) {
    console.error("stripe-webhook error:", error);
    if (supabaseAdmin && eventId) {
      await supabaseAdmin
        .from("stripe_events")
        .update({
          status: "failed",
          error: error instanceof Error ? error.message : "Internal error",
          processed_at: new Date().toISOString(),
        })
        .eq("event_id", eventId);
    }
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal error" }),
      { status: 500, headers: jsonHeaders }
    );
  }
});
