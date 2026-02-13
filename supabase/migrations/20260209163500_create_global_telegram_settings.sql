-- Create table for global Telegram settings (one row for the entire platform)
CREATE TABLE IF NOT EXISTS public.global_telegram_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bot_token TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.global_telegram_settings ENABLE ROW LEVEL SECURITY;

-- Only super admins can view global settings
DROP POLICY IF EXISTS "Super admins can view global telegram settings" ON public.global_telegram_settings;
CREATE POLICY "Super admins can view global telegram settings"
ON public.global_telegram_settings
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.admin_roles
    WHERE admin_roles.user_id = auth.uid()
    AND admin_roles.admin_role = 'super_admin'
  )
);

-- Only super admins can insert global settings
DROP POLICY IF EXISTS "Super admins can insert global telegram settings" ON public.global_telegram_settings;
CREATE POLICY "Super admins can insert global telegram settings"
ON public.global_telegram_settings
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.admin_roles
    WHERE admin_roles.user_id = auth.uid()
    AND admin_roles.admin_role = 'super_admin'
  )
);

-- Only super admins can update global settings
DROP POLICY IF EXISTS "Super admins can update global telegram settings" ON public.global_telegram_settings;
CREATE POLICY "Super admins can update global telegram settings"
ON public.global_telegram_settings
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.admin_roles
    WHERE admin_roles.user_id = auth.uid()
    AND admin_roles.admin_role = 'super_admin'
  )
);

-- Only super admins can delete global settings
DROP POLICY IF EXISTS "Super admins can delete global telegram settings" ON public.global_telegram_settings;
CREATE POLICY "Super admins can delete global telegram settings"
ON public.global_telegram_settings
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.admin_roles
    WHERE admin_roles.user_id = auth.uid()
    AND admin_roles.admin_role = 'super_admin'
  )
);

-- Add trigger for updated_at
DROP TRIGGER IF EXISTS update_global_telegram_settings_updated_at ON public.global_telegram_settings;
CREATE TRIGGER update_global_telegram_settings_updated_at
BEFORE UPDATE ON public.global_telegram_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add comment
COMMENT ON TABLE public.global_telegram_settings IS 'Global Telegram settings for the entire platform. All signals from all providers/admins will be sent to this Telegram channel.';
