-- Fix TP update partial-close math:
-- close_percent must apply to CURRENT remaining exposure, not initial risk.
-- This prevents unexpected full closure after repeated partial updates.

CREATE OR REPLACE FUNCTION public.apply_take_profit_update_to_user_trades()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  trade_record RECORD;
  rr_ratio DECIMAL;
  effective_close_percent DECIMAL;
  reduced_risk DECIMAL;
  realized_amount DECIMAL;
  remaining_after DECIMAL;
  any_trade_closed BOOLEAN := FALSE;
  pending_count INTEGER := 0;
BEGIN
  FOR trade_record IN
    SELECT *
    FROM public.user_trades
    WHERE signal_id = NEW.signal_id
      AND result = 'pending'
  LOOP
    -- Idempotency guard
    IF EXISTS (
      SELECT 1
      FROM public.user_trade_take_profit_updates utpu
      WHERE utpu.user_trade_id = trade_record.id
        AND utpu.signal_update_id = NEW.id
    ) THEN
      CONTINUE;
    END IF;

    IF trade_record.initial_risk_amount <= 0 OR trade_record.remaining_risk_amount <= 0 THEN
      CONTINUE;
    END IF;

    effective_close_percent := LEAST(GREATEST(NEW.close_percent, 0), 100);
    IF effective_close_percent <= 0 THEN
      CONTINUE;
    END IF;

    IF trade_record.signal_id IS NULL THEN
      CONTINUE;
    END IF;

    -- R:R against TP update price.
    SELECT
      CASE
        WHEN s.direction = 'BUY' THEN
          CASE
            WHEN (s.entry_price - s.stop_loss) = 0 THEN 1
            ELSE ABS((NEW.tp_price - s.entry_price) / (s.entry_price - s.stop_loss))
          END
        ELSE
          CASE
            WHEN (s.stop_loss - s.entry_price) = 0 THEN 1
            ELSE ABS((s.entry_price - NEW.tp_price) / (s.stop_loss - s.entry_price))
          END
      END
    INTO rr_ratio
    FROM public.signals s
    WHERE s.id = NEW.signal_id;

    rr_ratio := COALESCE(rr_ratio, 1);

    -- IMPORTANT FIX: close % is applied to REMAINING risk (not initial risk).
    reduced_risk := trade_record.remaining_risk_amount * (effective_close_percent / 100);
    reduced_risk := LEAST(reduced_risk, trade_record.remaining_risk_amount);
    realized_amount := reduced_risk * rr_ratio;
    remaining_after := GREATEST(trade_record.remaining_risk_amount - reduced_risk, 0);

    -- Explicit 100% close should fully close this trade immediately.
    IF effective_close_percent >= 100 THEN
      remaining_after := 0;
    END IF;

    UPDATE public.user_trades
    SET
      remaining_risk_amount = remaining_after,
      realized_pnl = COALESCE(realized_pnl, 0) + realized_amount,
      pnl = COALESCE(pnl, 0) + realized_amount,
      last_update_at = now(),
      closed_at = CASE WHEN remaining_after <= 0 THEN now() ELSE closed_at END,
      result = CASE WHEN remaining_after <= 0 THEN 'win' ELSE result END
    WHERE id = trade_record.id;

    IF remaining_after <= 0 THEN
      any_trade_closed := TRUE;
    END IF;

    UPDATE public.profiles
    SET
      account_balance = account_balance + realized_amount,
      updated_at = now()
    WHERE user_id = trade_record.user_id;

    INSERT INTO public.user_trade_take_profit_updates (
      user_trade_id,
      signal_update_id,
      close_percent,
      realized_pnl
    )
    VALUES (
      trade_record.id,
      NEW.id,
      effective_close_percent,
      realized_amount
    )
    ON CONFLICT (user_trade_id, signal_update_id) DO NOTHING;
  END LOOP;

  -- Explicit 100% close should auto-close signal status without manual action.
  IF NEW.close_percent >= 100 THEN
    UPDATE public.signals
    SET
      status = 'tp_hit',
      updated_at = now()
    WHERE id = NEW.signal_id
      AND status = 'active';
  END IF;

  -- If TP updates fully closed all remaining trades for this signal,
  -- auto-mark signal as TP hit so no manual status change is required.
  IF any_trade_closed THEN
    SELECT COUNT(*)
    INTO pending_count
    FROM public.user_trades
    WHERE signal_id = NEW.signal_id
      AND result = 'pending';

    IF pending_count = 0 THEN
      UPDATE public.signals
      SET
        status = 'tp_hit',
        updated_at = now()
      WHERE id = NEW.signal_id
        AND status = 'active';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
