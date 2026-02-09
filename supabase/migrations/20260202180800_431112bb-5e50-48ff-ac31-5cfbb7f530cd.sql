-- Add dark mode logo URL column to global_settings
ALTER TABLE public.global_settings
ADD COLUMN logo_url_dark text;