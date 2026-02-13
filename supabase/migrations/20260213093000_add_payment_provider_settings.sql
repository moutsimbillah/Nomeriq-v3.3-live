-- Centralized provider settings (admin-managed, service-role readable)
CREATE TABLE IF NOT EXISTS public.payment_provider_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL UNIQUE,
  stripe_secret_key TEXT,
  stripe_webhook_secret TEXT,
  stripe_publishable_key TEXT,
  stripe_webhook_endpoint TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure a Stripe row exists
INSERT INTO public.payment_provider_settings (provider)
SELECT 'stripe'
WHERE NOT EXISTS (
  SELECT 1 FROM public.payment_provider_settings WHERE provider = 'stripe'
);

ALTER TABLE public.payment_provider_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view payment provider settings" ON public.payment_provider_settings;
CREATE POLICY "Admins can view payment provider settings"
ON public.payment_provider_settings
FOR SELECT
USING (public.is_any_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can update payment provider settings" ON public.payment_provider_settings;
CREATE POLICY "Admins can update payment provider settings"
ON public.payment_provider_settings
FOR UPDATE
USING (public.is_any_admin(auth.uid()))
WITH CHECK (public.is_any_admin(auth.uid()));

DROP POLICY IF EXISTS "Service role can manage payment provider settings" ON public.payment_provider_settings;
CREATE POLICY "Service role can manage payment provider settings"
ON public.payment_provider_settings
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

DROP TRIGGER IF EXISTS update_payment_provider_settings_updated_at ON public.payment_provider_settings;
CREATE TRIGGER update_payment_provider_settings_updated_at
BEFORE UPDATE ON public.payment_provider_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
