-- Per-signal telegram routing options for update and close events
ALTER TABLE public.signals
ADD COLUMN IF NOT EXISTS send_updates_to_telegram BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS send_closed_trades_to_telegram BOOLEAN NOT NULL DEFAULT false;

