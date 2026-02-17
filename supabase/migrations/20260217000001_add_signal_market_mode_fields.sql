-- Migration: Add market mode fields to signals table
-- Adds execution source tracking for Live Mode signals

-- Add market_mode column to signals table
ALTER TABLE public.signals
  ADD COLUMN IF NOT EXISTS market_mode public.market_mode DEFAULT 'manual';

-- Add execution source tracking fields
ALTER TABLE public.signals
  ADD COLUMN IF NOT EXISTS entry_quote_id UUID REFERENCES public.market_quotes(id),
  ADD COLUMN IF NOT EXISTS entry_quoted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS entry_source TEXT DEFAULT 'manual';

-- Create index for filtering by market mode
CREATE INDEX IF NOT EXISTS idx_signals_market_mode ON public.signals(market_mode);

-- Create index for entry quote lookups
CREATE INDEX IF NOT EXISTS idx_signals_entry_quote_id ON public.signals(entry_quote_id);

-- Update existing signals to have market_mode = 'manual'
UPDATE public.signals SET market_mode = 'manual' WHERE market_mode IS NULL;
