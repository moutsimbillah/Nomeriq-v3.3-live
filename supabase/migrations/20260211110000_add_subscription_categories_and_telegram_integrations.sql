-- Add categories to subscription packages and introduce telegram_integrations

-- 1) Add categories column to subscription_packages
ALTER TABLE public.subscription_packages
  ADD COLUMN IF NOT EXISTS categories TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Optional: constrain categories to known values (kept in sync with SignalCategory type)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'subscription_packages_categories_valid'
  ) THEN
    ALTER TABLE public.subscription_packages
      ADD CONSTRAINT subscription_packages_categories_valid
      CHECK (
        categories IS NOT NULL
        AND categories <@ ARRAY['Forex','Metals','Crypto','Indices','Commodities']::TEXT[]
      );
  END IF;
END $$;

-- Backfill existing rows with all categories if they are currently empty
UPDATE public.subscription_packages
SET categories = ARRAY['Forex','Metals','Crypto','Indices','Commodities']::TEXT[]
WHERE (categories IS NULL OR array_length(categories, 1) IS NULL);

-- 2) Telegram integrations table for category-based routing
CREATE TABLE IF NOT EXISTS public.telegram_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  bot_token TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  categories TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.telegram_integrations ENABLE ROW LEVEL SECURITY;

-- RLS: only admins can manage telegram_integrations
DROP POLICY IF EXISTS "Admins can select telegram integrations" ON public.telegram_integrations;
DROP POLICY IF EXISTS "Admins can insert telegram integrations" ON public.telegram_integrations;
DROP POLICY IF EXISTS "Admins can update telegram integrations" ON public.telegram_integrations;
DROP POLICY IF EXISTS "Admins can delete telegram integrations" ON public.telegram_integrations;

CREATE POLICY "Admins can select telegram integrations"
ON public.telegram_integrations
FOR SELECT
USING (public.is_any_admin(auth.uid()) OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert telegram integrations"
ON public.telegram_integrations
FOR INSERT
WITH CHECK (public.is_any_admin(auth.uid()) OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update telegram integrations"
ON public.telegram_integrations
FOR UPDATE
USING (public.is_any_admin(auth.uid()) OR public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.is_any_admin(auth.uid()) OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete telegram integrations"
ON public.telegram_integrations
FOR DELETE
USING (public.is_any_admin(auth.uid()) OR public.has_role(auth.uid(), 'admin'));

-- Keep updated_at fresh
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'update_telegram_integrations_updated_at'
  ) THEN
    CREATE TRIGGER update_telegram_integrations_updated_at
    BEFORE UPDATE ON public.telegram_integrations
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';

