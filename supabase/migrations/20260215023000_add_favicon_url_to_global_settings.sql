-- Add favicon URL to global branding settings
ALTER TABLE public.global_settings
  ADD COLUMN IF NOT EXISTS favicon_url TEXT;

NOTIFY pgrst, 'reload schema';
