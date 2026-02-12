-- Email template settings for admin-configurable verification/reset emails
CREATE TABLE IF NOT EXISTS public.email_template_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_name TEXT NOT NULL DEFAULT 'nomeriq',
  sender_email TEXT NOT NULL DEFAULT 'noreply@nomeriq.com',
  verification_subject TEXT NOT NULL DEFAULT 'Your verification code: {{otp_code}}',
  verification_body TEXT NOT NULL DEFAULT
    'Hi {{user_email}},\n\nUse this verification code to activate your account:\n\n{{otp_code}}\n\nThis code expires in {{code_expiry_minutes}} minutes.\n\nIf you did not request this, ignore this message.\n\n- {{brand_name}}',
  reset_subject TEXT NOT NULL DEFAULT 'Your {{brand_name}} password reset code',
  reset_body TEXT NOT NULL DEFAULT
    'Hi {{user_email}},\n\nUse this code to reset your password:\n\n{{otp_code}}\n\nThis code expires in {{code_expiry_minutes}} minutes.\n\nIf you did not request this, ignore this message.\n\nSupport: {{support_email}}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.email_template_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view email template settings" ON public.email_template_settings;
CREATE POLICY "Authenticated users can view email template settings"
ON public.email_template_settings
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Super admins can manage email template settings" ON public.email_template_settings;
CREATE POLICY "Super admins can manage email template settings"
ON public.email_template_settings
FOR ALL
TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

DROP TRIGGER IF EXISTS update_email_template_settings_updated_at ON public.email_template_settings;
CREATE TRIGGER update_email_template_settings_updated_at
BEFORE UPDATE ON public.email_template_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.email_template_settings (
  sender_name,
  sender_email
)
SELECT 'nomeriq', 'noreply@nomeriq.com'
WHERE NOT EXISTS (SELECT 1 FROM public.email_template_settings);

