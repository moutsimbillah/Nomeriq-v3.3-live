-- Enforce directional SL/TP rules for all signal writes (UI/API/SQL).
CREATE OR REPLACE FUNCTION public.validate_signal_price_setup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Active signal must have complete price setup.
  IF NEW.signal_type = 'signal' THEN
    IF NEW.entry_price IS NULL OR NEW.stop_loss IS NULL OR NEW.take_profit IS NULL THEN
      RAISE EXCEPTION 'Active signals require entry, stop loss, and take profit.';
    END IF;
  END IF;

  -- Upcoming can be partial, but SL/TP cannot exist without entry.
  IF (NEW.stop_loss IS NOT NULL OR NEW.take_profit IS NOT NULL) AND NEW.entry_price IS NULL THEN
    RAISE EXCEPTION 'Entry price is required when stop loss or take profit is provided.';
  END IF;

  -- If no entry, nothing else to validate.
  IF NEW.entry_price IS NULL THEN
    RETURN NEW;
  END IF;

  -- Directional stop loss checks.
  IF NEW.stop_loss IS NOT NULL THEN
    IF NEW.direction = 'BUY' AND NEW.stop_loss >= NEW.entry_price THEN
      RAISE EXCEPTION 'For BUY, stop loss must be strictly lower than entry price.';
    ELSIF NEW.direction = 'SELL' AND NEW.stop_loss <= NEW.entry_price THEN
      RAISE EXCEPTION 'For SELL, stop loss must be strictly higher than entry price.';
    END IF;
  END IF;

  -- Directional take profit checks.
  IF NEW.take_profit IS NOT NULL THEN
    IF NEW.direction = 'BUY' AND NEW.take_profit <= NEW.entry_price THEN
      RAISE EXCEPTION 'For BUY, take profit must be strictly higher than entry price.';
    ELSIF NEW.direction = 'SELL' AND NEW.take_profit >= NEW.entry_price THEN
      RAISE EXCEPTION 'For SELL, take profit must be strictly lower than entry price.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_signal_price_setup_on_write ON public.signals;
CREATE TRIGGER validate_signal_price_setup_on_write
BEFORE INSERT OR UPDATE OF signal_type, direction, entry_price, stop_loss, take_profit
ON public.signals
FOR EACH ROW
EXECUTE FUNCTION public.validate_signal_price_setup();

NOTIFY pgrst, 'reload schema';
