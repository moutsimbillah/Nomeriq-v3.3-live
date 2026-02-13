-- Add configurable message options for Telegram integrations
ALTER TABLE public.telegram_integrations
  ADD COLUMN IF NOT EXISTS message_footer TEXT DEFAULT 'Trade responsibly!',
  ADD COLUMN IF NOT EXISTS message_tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS include_tp BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS include_sl BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS include_risk BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN public.telegram_integrations.message_footer IS
'Custom footer appended to Telegram messages for this integration.';

COMMENT ON COLUMN public.telegram_integrations.message_tags IS
'Optional tags/hashtags appended to Telegram messages for this integration.';

COMMENT ON COLUMN public.telegram_integrations.include_tp IS
'Whether to include Take Profit line in messages for this integration.';

COMMENT ON COLUMN public.telegram_integrations.include_sl IS
'Whether to include Stop Loss line in messages for this integration.';

COMMENT ON COLUMN public.telegram_integrations.include_risk IS
'Whether to append a risk reminder line in messages for this integration.';

NOTIFY pgrst, 'reload schema';
