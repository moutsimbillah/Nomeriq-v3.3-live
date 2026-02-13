-- Stripe Checkout + webhook support for mixed payment model (manual + stripe)

-- 1) payments table: provider-safe Stripe references
ALTER TABLE public.payments
  ALTER COLUMN tx_hash DROP NOT NULL;

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS provider_payment_id TEXT,
  ADD COLUMN IF NOT EXISTS provider_session_id TEXT,
  ADD COLUMN IF NOT EXISTS provider_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS provider_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB;

ALTER TABLE public.payments
  DROP CONSTRAINT IF EXISTS payments_provider_check;

ALTER TABLE public.payments
  ADD CONSTRAINT payments_provider_check
  CHECK (provider IN ('manual', 'stripe'));

DROP INDEX IF EXISTS payments_provider_session_id_unique;
CREATE UNIQUE INDEX payments_provider_session_id_unique
  ON public.payments (provider_session_id);

DROP INDEX IF EXISTS payments_provider_payment_id_unique;
CREATE UNIQUE INDEX payments_provider_payment_id_unique
  ON public.payments (provider_payment_id);

CREATE INDEX IF NOT EXISTS payments_provider_subscription_id_idx
  ON public.payments (provider_subscription_id);

-- 2) subscriptions table: provider linkage
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS provider_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS provider_customer_id TEXT;

ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_provider_check;

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_provider_check
  CHECK (provider IN ('manual', 'stripe'));

DROP INDEX IF EXISTS subscriptions_provider_subscription_id_unique;
CREATE UNIQUE INDEX subscriptions_provider_subscription_id_unique
  ON public.subscriptions (provider_subscription_id);

-- 3) package -> Stripe price mapping
ALTER TABLE public.subscription_packages
  ADD COLUMN IF NOT EXISTS stripe_price_id TEXT;

CREATE INDEX IF NOT EXISTS subscription_packages_stripe_price_id_idx
  ON public.subscription_packages (stripe_price_id);

-- 4) Webhook idempotency table
CREATE TABLE IF NOT EXISTS public.stripe_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'processed' CHECK (status IN ('processing', 'processed', 'failed')),
  payload JSONB NOT NULL,
  error TEXT,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stripe_events_event_type_idx
  ON public.stripe_events (event_type);

-- Keep this admin/service role table simple; no client-side access needed.
ALTER TABLE public.stripe_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view stripe events" ON public.stripe_events;
CREATE POLICY "Admins can view stripe events" ON public.stripe_events
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Service role can manage stripe events" ON public.stripe_events;
CREATE POLICY "Service role can manage stripe events" ON public.stripe_events
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

NOTIFY pgrst, 'reload schema';
