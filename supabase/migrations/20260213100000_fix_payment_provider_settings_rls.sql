-- Ensure Stripe provider row exists and admins can insert/update it via app.
INSERT INTO public.payment_provider_settings (provider)
SELECT 'stripe'
WHERE NOT EXISTS (
  SELECT 1 FROM public.payment_provider_settings WHERE provider = 'stripe'
);

DROP POLICY IF EXISTS "Admins can insert payment provider settings" ON public.payment_provider_settings;
CREATE POLICY "Admins can insert payment provider settings"
ON public.payment_provider_settings
FOR INSERT
WITH CHECK (public.is_any_admin(auth.uid()));

