-- Block TP updates when a signal has no remaining open user exposure.
-- This is a hard backend guard so invalid updates cannot be inserted
-- from UI, API, or manual SQL if all pending positions are already closed.

CREATE OR REPLACE FUNCTION public.validate_signal_take_profit_update_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  open_exposure_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO open_exposure_count
  FROM public.user_trades ut
  WHERE ut.signal_id = NEW.signal_id
    AND ut.result = 'pending'
    AND COALESCE(ut.remaining_risk_amount, 0) > 0;

  IF open_exposure_count = 0 THEN
    RAISE EXCEPTION 'Cannot add trade update: no remaining open position for this signal.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_signal_take_profit_update_insert ON public.signal_take_profit_updates;
CREATE TRIGGER validate_signal_take_profit_update_insert
BEFORE INSERT ON public.signal_take_profit_updates
FOR EACH ROW
EXECUTE FUNCTION public.validate_signal_take_profit_update_insert();

NOTIFY pgrst, 'reload schema';
