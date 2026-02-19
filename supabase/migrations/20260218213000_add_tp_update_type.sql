-- Classify TP updates so UI can clearly show Limit vs Market-close updates.

ALTER TABLE public.signal_take_profit_updates
  ADD COLUMN IF NOT EXISTS update_type TEXT;

UPDATE public.signal_take_profit_updates
SET update_type = 'limit'
WHERE update_type IS NULL;

ALTER TABLE public.signal_take_profit_updates
  ALTER COLUMN update_type SET DEFAULT 'limit';

ALTER TABLE public.signal_take_profit_updates
  ALTER COLUMN update_type SET NOT NULL;

ALTER TABLE public.signal_take_profit_updates
  DROP CONSTRAINT IF EXISTS signal_take_profit_updates_update_type_check;

ALTER TABLE public.signal_take_profit_updates
  ADD CONSTRAINT signal_take_profit_updates_update_type_check
  CHECK (update_type IN ('limit', 'market'));

NOTIFY pgrst, 'reload schema';
