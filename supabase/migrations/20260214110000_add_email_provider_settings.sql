-- Secure provider-level email settings (Resend API key)
-- This keeps API keys separate from template content tables.

CREATE TABLE IF NOT EXISTS public.email_provider_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL UNIQUE,
  resend_api_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.email_provider_settings (provider)
SELECT 'resend'
WHERE NOT EXISTS (
  SELECT 1 FROM public.email_provider_settings WHERE provider = 'resend'
);

ALTER TABLE public.email_provider_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admins can view email provider settings" ON public.email_provider_settings;
CREATE POLICY "Super admins can view email provider settings"
ON public.email_provider_settings
FOR SELECT
TO authenticated
USING (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Super admins can manage email provider settings" ON public.email_provider_settings;
CREATE POLICY "Super admins can manage email provider settings"
ON public.email_provider_settings
FOR ALL
TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Service role can manage email provider settings" ON public.email_provider_settings;
CREATE POLICY "Service role can manage email provider settings"
ON public.email_provider_settings
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

DROP TRIGGER IF EXISTS update_email_provider_settings_updated_at ON public.email_provider_settings;
CREATE TRIGGER update_email_provider_settings_updated_at
BEFORE UPDATE ON public.email_provider_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

NOTIFY pgrst, 'reload schema';
