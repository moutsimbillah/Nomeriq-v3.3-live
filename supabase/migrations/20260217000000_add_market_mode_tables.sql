-- Migration: Add Market Mode tables and settings
-- Creates tables for market mode settings, symbol map, and quote cache

-- Create market_mode enum
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'market_mode'
  ) THEN
    CREATE TYPE public.market_mode AS ENUM ('manual', 'live');
  END IF;
END
$$;

-- Create market_mode_settings table (single row for app-wide settings)
CREATE TABLE IF NOT EXISTS public.market_mode_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mode public.market_mode NOT NULL DEFAULT 'manual',
  twelve_data_api_key TEXT, -- Encrypted/stored securely
  last_sync_at TIMESTAMPTZ,
  sync_status TEXT CHECK (sync_status IN ('idle', 'syncing', 'success', 'error')),
  sync_error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure expected columns exist (for partially-created schemas)
ALTER TABLE public.market_mode_settings
  ADD COLUMN IF NOT EXISTS mode public.market_mode NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS twelve_data_api_key TEXT,
  ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sync_status TEXT,
  ADD COLUMN IF NOT EXISTS sync_error_message TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Insert default row (manual mode)
INSERT INTO public.market_mode_settings (mode)
SELECT 'manual'
WHERE NOT EXISTS (SELECT 1 FROM public.market_mode_settings);

-- Create market_symbol_map table (catalog of available pairs from Twelve Data)
CREATE TABLE IF NOT EXISTS public.market_symbol_map (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol TEXT NOT NULL UNIQUE, -- Normalized symbol (e.g., BTCUSD, EURUSD)
  twelve_data_symbol TEXT NOT NULL, -- Original Twelve Data symbol format
  category TEXT NOT NULL CHECK (category IN ('Forex', 'Metals', 'Crypto', 'Indices', 'Commodities')),
  provider TEXT NOT NULL DEFAULT 'twelve_data',
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_quote_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.market_symbol_map
  ADD COLUMN IF NOT EXISTS symbol TEXT,
  ADD COLUMN IF NOT EXISTS twelve_data_symbol TEXT,
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'twelve_data',
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_quote_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Create index for fast category lookups
CREATE INDEX IF NOT EXISTS idx_market_symbol_map_category ON public.market_symbol_map(category);
CREATE INDEX IF NOT EXISTS idx_market_symbol_map_active ON public.market_symbol_map(is_active);
CREATE INDEX IF NOT EXISTS idx_market_symbol_map_symbol ON public.market_symbol_map(symbol);

-- Create market_quotes table (cache latest quotes per symbol)
CREATE TABLE IF NOT EXISTS public.market_quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol TEXT NOT NULL,
  price DECIMAL(20,8) NOT NULL,
  provider TEXT NOT NULL DEFAULT 'twelve_data',
  quoted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(symbol, provider)
);

ALTER TABLE public.market_quotes
  ADD COLUMN IF NOT EXISTS symbol TEXT,
  ADD COLUMN IF NOT EXISTS price DECIMAL(20,8),
  ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'twelve_data',
  ADD COLUMN IF NOT EXISTS quoted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Ensure uniqueness for (symbol, provider) even if the original constraint wasn't created
CREATE UNIQUE INDEX IF NOT EXISTS ux_market_quotes_symbol_provider
  ON public.market_quotes(symbol, provider);

-- Create index for fast quote lookups
CREATE INDEX IF NOT EXISTS idx_market_quotes_symbol ON public.market_quotes(symbol);
CREATE INDEX IF NOT EXISTS idx_market_quotes_quoted_at ON public.market_quotes(quoted_at);

-- Enable RLS
ALTER TABLE public.market_mode_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_symbol_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_quotes ENABLE ROW LEVEL SECURITY;

-- RLS Policies for market_mode_settings (super_admin only)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'market_mode_settings'
      AND policyname = 'Super admins can view market mode settings'
  ) THEN
    CREATE POLICY "Super admins can view market mode settings" ON public.market_mode_settings
      FOR SELECT USING (public.is_super_admin(auth.uid()));
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'market_mode_settings'
      AND policyname = 'Super admins can update market mode settings'
  ) THEN
    CREATE POLICY "Super admins can update market mode settings" ON public.market_mode_settings
      FOR UPDATE USING (public.is_super_admin(auth.uid()));
  END IF;
END
$$;

-- RLS Policies for market_symbol_map (readable by authenticated, writable by admin)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'market_symbol_map'
      AND policyname = 'Authenticated users can view market symbols'
  ) THEN
    CREATE POLICY "Authenticated users can view market symbols" ON public.market_symbol_map
      FOR SELECT TO authenticated USING (true);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'market_symbol_map'
      AND policyname = 'Admins can manage market symbols'
  ) THEN
    CREATE POLICY "Admins can manage market symbols" ON public.market_symbol_map
      FOR ALL USING (public.is_super_admin(auth.uid()));
  END IF;
END
$$;

-- RLS Policies for market_quotes (readable by authenticated, writable by admin/service)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'market_quotes'
      AND policyname = 'Authenticated users can view market quotes'
  ) THEN
    CREATE POLICY "Authenticated users can view market quotes" ON public.market_quotes
      FOR SELECT TO authenticated USING (true);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'market_quotes'
      AND policyname = 'Admins can manage market quotes'
  ) THEN
    CREATE POLICY "Admins can manage market quotes" ON public.market_quotes
      FOR ALL USING (public.is_super_admin(auth.uid()) OR public.is_any_admin(auth.uid()));
  END IF;
END
$$;

-- Add trigger for updated_at
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'update_market_mode_settings_updated_at'
  ) THEN
    CREATE TRIGGER update_market_mode_settings_updated_at
      BEFORE UPDATE ON public.market_mode_settings
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'update_market_symbol_map_updated_at'
  ) THEN
    CREATE TRIGGER update_market_symbol_map_updated_at
      BEFORE UPDATE ON public.market_symbol_map
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END
$$;
