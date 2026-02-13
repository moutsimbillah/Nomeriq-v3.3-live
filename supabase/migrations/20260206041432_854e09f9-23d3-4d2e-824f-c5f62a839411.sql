-- Create table for storing provider Telegram settings
CREATE TABLE IF NOT EXISTS public.provider_telegram_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  bot_token TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.provider_telegram_settings ENABLE ROW LEVEL SECURITY;

-- Providers can only see their own settings
DROP POLICY IF EXISTS "Providers can view their own telegram settings" ON public.provider_telegram_settings;
CREATE POLICY "Providers can view their own telegram settings"
ON public.provider_telegram_settings
FOR SELECT
USING (auth.uid() = user_id);

-- Providers can insert their own settings
DROP POLICY IF EXISTS "Providers can insert their own telegram settings" ON public.provider_telegram_settings;
CREATE POLICY "Providers can insert their own telegram settings"
ON public.provider_telegram_settings
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Providers can update their own settings
DROP POLICY IF EXISTS "Providers can update their own telegram settings" ON public.provider_telegram_settings;
CREATE POLICY "Providers can update their own telegram settings"
ON public.provider_telegram_settings
FOR UPDATE
USING (auth.uid() = user_id);

-- Providers can delete their own settings
DROP POLICY IF EXISTS "Providers can delete their own telegram settings" ON public.provider_telegram_settings;
CREATE POLICY "Providers can delete their own telegram settings"
ON public.provider_telegram_settings
FOR DELETE
USING (auth.uid() = user_id);

-- Add trigger for updated_at
DROP TRIGGER IF EXISTS update_provider_telegram_settings_updated_at ON public.provider_telegram_settings;
CREATE TRIGGER update_provider_telegram_settings_updated_at
BEFORE UPDATE ON public.provider_telegram_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
