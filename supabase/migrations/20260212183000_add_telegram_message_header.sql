ALTER TABLE public.telegram_integrations
  ADD COLUMN IF NOT EXISTS message_header TEXT;

COMMENT ON COLUMN public.telegram_integrations.message_header IS
'Optional custom header used for signal notifications sent to this integration.';

NOTIFY pgrst, 'reload schema';
