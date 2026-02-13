-- Phase 1 webhook ordering guardrails:
-- Track the last applied Stripe event timestamp/id on subscriptions
-- so older out-of-order events cannot overwrite newer state.

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS provider_event_created_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS provider_last_event_id TEXT;

CREATE INDEX IF NOT EXISTS subscriptions_provider_event_created_at_idx
  ON public.subscriptions (provider_event_created_at DESC);

NOTIFY pgrst, 'reload schema';
