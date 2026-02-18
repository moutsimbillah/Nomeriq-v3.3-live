-- Live market TP updates must support signed PnL (profit/loss), not absolute-only profit.
-- This keeps notification/history/accounting consistent when market close happens below entry.

CREATE OR REPLACE FUNCTION public.apply_take_profit_update_to_user_trades()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  trade_record RECORD;
  signal_record RECORD;
  rr_ratio DECIMAL := 0;
  effective_close_percent DECIMAL;
  reduced_risk DECIMAL;
  realized_amount DECIMAL;
  remaining_after DECIMAL;
  trade_final_pnl DECIMAL;
  pending_count INTEGER := 0;
  should_close_signal BOOLEAN := FALSE;
  resolved_close_status TEXT;
BEGIN
  SELECT id, direction, entry_price, stop_loss
  INTO signal_record
  FROM public.signals
  WHERE id = NEW.signal_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- Signed R multiple at update price.
  IF signal_record.entry_price IS NOT NULL AND signal_record.stop_loss IS NOT NULL THEN
    IF signal_record.direction = 'BUY' THEN
      IF (signal_record.entry_price - signal_record.stop_loss) = 0 THEN
        rr_ratio := CASE
          WHEN NEW.tp_price > signal_record.entry_price THEN 1
          WHEN NEW.tp_price < signal_record.entry_price THEN -1
          ELSE 0
        END;
      ELSE
        rr_ratio := (NEW.tp_price - signal_record.entry_price) / (signal_record.entry_price - signal_record.stop_loss);
      END IF;
    ELSE
      IF (signal_record.stop_loss - signal_record.entry_price) = 0 THEN
        rr_ratio := CASE
          WHEN NEW.tp_price < signal_record.entry_price THEN 1
          WHEN NEW.tp_price > signal_record.entry_price THEN -1
          ELSE 0
        END;
      ELSE
        rr_ratio := (signal_record.entry_price - NEW.tp_price) / (signal_record.stop_loss - signal_record.entry_price);
      END IF;
    END IF;
  END IF;

  rr_ratio := COALESCE(rr_ratio, 0);

  FOR trade_record IN
    SELECT *
    FROM public.user_trades
    WHERE signal_id = NEW.signal_id
      AND result = 'pending'
  LOOP
    -- Idempotency guard.
    IF EXISTS (
      SELECT 1
      FROM public.user_trade_take_profit_updates utpu
      WHERE utpu.user_trade_id = trade_record.id
        AND utpu.signal_update_id = NEW.id
    ) THEN
      CONTINUE;
    END IF;

    IF COALESCE(trade_record.initial_risk_amount, 0) <= 0
       OR COALESCE(trade_record.remaining_risk_amount, 0) <= 0 THEN
      CONTINUE;
    END IF;

    effective_close_percent := LEAST(GREATEST(NEW.close_percent, 0), 100);
    IF effective_close_percent <= 0 THEN
      CONTINUE;
    END IF;

    -- close_percent is always on remaining exposure.
    reduced_risk := trade_record.remaining_risk_amount * (effective_close_percent / 100);
    reduced_risk := LEAST(reduced_risk, trade_record.remaining_risk_amount);

    realized_amount := ROUND(reduced_risk * rr_ratio, 2);
    remaining_after := GREATEST(trade_record.remaining_risk_amount - reduced_risk, 0);

    IF effective_close_percent >= 100 THEN
      remaining_after := 0;
    END IF;

    trade_final_pnl := ROUND(COALESCE(trade_record.pnl, 0) + realized_amount, 2);

    UPDATE public.user_trades
    SET
      remaining_risk_amount = remaining_after,
      realized_pnl = ROUND(COALESCE(realized_pnl, 0) + realized_amount, 2),
      pnl = trade_final_pnl,
      last_update_at = now(),
      closed_at = CASE WHEN remaining_after <= 0 THEN now() ELSE closed_at END,
      result = CASE
        WHEN remaining_after <= 0 THEN
          CASE
            WHEN trade_final_pnl > 0 THEN 'win'
            WHEN trade_final_pnl < 0 THEN 'loss'
            ELSE 'breakeven'
          END
        ELSE result
      END
    WHERE id = trade_record.id;

    IF realized_amount <> 0 THEN
      UPDATE public.profiles
      SET
        account_balance = account_balance + realized_amount,
        updated_at = now()
      WHERE user_id = trade_record.user_id;
    END IF;

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

  -- Close signal automatically when update explicitly closes 100%
  -- or when all pending exposure is now closed.
  IF NEW.close_percent >= 100 THEN
    should_close_signal := TRUE;
  END IF;

  SELECT COUNT(*)
  INTO pending_count
  FROM public.user_trades
  WHERE signal_id = NEW.signal_id
    AND result = 'pending'
    AND COALESCE(remaining_risk_amount, 0) > 0;

  IF pending_count = 0 THEN
    should_close_signal := TRUE;
  END IF;

  IF should_close_signal THEN
    resolved_close_status := CASE
      WHEN rr_ratio > 0 THEN 'tp_hit'
      WHEN rr_ratio < 0 THEN 'sl_hit'
      ELSE 'breakeven'
    END;

    UPDATE public.signals
    SET
      status = resolved_close_status,
      closed_at = COALESCE(closed_at, now()),
      updated_at = now()
    WHERE id = NEW.signal_id
      AND status = 'active';
  END IF;

  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
