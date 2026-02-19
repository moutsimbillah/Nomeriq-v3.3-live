-- Ensure trades/signals finalize when remaining exposure is effectively zero.
-- This prevents "active" rows from lingering when TP updates already closed 100%.

CREATE OR REPLACE FUNCTION public.finalize_zero_remaining_trade_row()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  finalized_pnl DECIMAL;
BEGIN
  IF NEW.result = 'pending' AND COALESCE(NEW.remaining_risk_amount, 0) <= 0.01 THEN
    finalized_pnl := ROUND(COALESCE(NEW.realized_pnl, NEW.pnl, 0), 2);

    NEW.remaining_risk_amount := 0;
    NEW.realized_pnl := finalized_pnl;
    NEW.pnl := finalized_pnl;
    NEW.result := CASE
      WHEN finalized_pnl > 0 THEN 'win'
      WHEN finalized_pnl < 0 THEN 'loss'
      ELSE 'breakeven'
    END;
    NEW.closed_at := COALESCE(NEW.closed_at, now());
    NEW.last_update_at := now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_finalize_zero_remaining_trade_row ON public.user_trades;
CREATE TRIGGER trg_finalize_zero_remaining_trade_row
BEFORE INSERT OR UPDATE OF result, remaining_risk_amount, pnl, realized_pnl
ON public.user_trades
FOR EACH ROW
EXECUTE FUNCTION public.finalize_zero_remaining_trade_row();

CREATE OR REPLACE FUNCTION public.close_signal_when_no_open_exposure(_signal_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  open_exposure_count INTEGER := 0;
  signal_total_pnl DECIMAL := 0;
  resolved_status TEXT;
BEGIN
  IF _signal_id IS NULL THEN
    RETURN;
  END IF;

  SELECT COUNT(*)
  INTO open_exposure_count
  FROM public.user_trades ut
  WHERE ut.signal_id = _signal_id
    AND ut.result = 'pending'
    AND COALESCE(ut.remaining_risk_amount, 0) > 0.01;

  IF open_exposure_count > 0 THEN
    RETURN;
  END IF;

  SELECT COALESCE(SUM(COALESCE(ut.realized_pnl, ut.pnl, 0)), 0)
  INTO signal_total_pnl
  FROM public.user_trades ut
  WHERE ut.signal_id = _signal_id;

  resolved_status := CASE
    WHEN signal_total_pnl > 0 THEN 'tp_hit'
    WHEN signal_total_pnl < 0 THEN 'sl_hit'
    ELSE 'breakeven'
  END;

  UPDATE public.signals s
  SET
    status = resolved_status,
    closed_at = COALESCE(s.closed_at, now()),
    updated_at = now()
  WHERE s.id = _signal_id
    AND s.signal_type = 'signal'
    AND s.status = 'active';
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_signal_after_trade_exposure_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.signal_id IS NOT NULL THEN
    PERFORM public.close_signal_when_no_open_exposure(NEW.signal_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_signal_after_trade_exposure_change ON public.user_trades;
CREATE TRIGGER trg_sync_signal_after_trade_exposure_change
AFTER INSERT OR UPDATE OF result, remaining_risk_amount
ON public.user_trades
FOR EACH ROW
EXECUTE FUNCTION public.sync_signal_after_trade_exposure_change();

-- Backfill stuck pending trades that are already effectively closed.
UPDATE public.user_trades ut
SET
  remaining_risk_amount = 0,
  pnl = ROUND(COALESCE(ut.realized_pnl, ut.pnl, 0), 2),
  realized_pnl = ROUND(COALESCE(ut.realized_pnl, ut.pnl, 0), 2),
  result = CASE
    WHEN ROUND(COALESCE(ut.realized_pnl, ut.pnl, 0), 2) > 0 THEN 'win'
    WHEN ROUND(COALESCE(ut.realized_pnl, ut.pnl, 0), 2) < 0 THEN 'loss'
    ELSE 'breakeven'
  END,
  closed_at = COALESCE(ut.closed_at, now()),
  last_update_at = now()
WHERE ut.result = 'pending'
  AND COALESCE(ut.remaining_risk_amount, 0) <= 0.01;

DO $$
DECLARE
  signal_row RECORD;
BEGIN
  FOR signal_row IN
    SELECT s.id
    FROM public.signals s
    WHERE s.signal_type = 'signal'
      AND s.status = 'active'
  LOOP
    PERFORM public.close_signal_when_no_open_exposure(signal_row.id);
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.close_signal_when_no_open_exposure(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
