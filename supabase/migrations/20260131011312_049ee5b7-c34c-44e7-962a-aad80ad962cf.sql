-- Add new branding columns to global_settings
ALTER TABLE public.global_settings 
ADD COLUMN IF NOT EXISTS social_facebook text,
ADD COLUMN IF NOT EXISTS social_twitter text,
ADD COLUMN IF NOT EXISTS social_instagram text,
ADD COLUMN IF NOT EXISTS social_telegram text,
ADD COLUMN IF NOT EXISTS social_discord text,
ADD COLUMN IF NOT EXISTS copyright_name text DEFAULT 'TradingSignal',
ADD COLUMN IF NOT EXISTS disclaimer_text text DEFAULT 'Trading involves substantial risk and is not suitable for every investor. Past performance is not indicative of future results.';