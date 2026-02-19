-- Ensure TP-partial execution closes trades consistently when remaining exposure reaches zero.
-- Applies to both manual and live modes.
--
-- Fixes:
-- 1) Clamp near-zero remaining_risk_amount to 0 (2-decimal money precision).
-- 2) When remaining becomes 0, close trade immediately and compute result from total realized TP P&L.
-- 3) Backfill already-stuck rows where remaining is effectively 0 but result is still pending.

CREATE OR REPLACE FUNCTION public.apply_signal_take_profit_update_row(
  _update_id UUID,
  _execution_price DECIMAL DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  update_row RECORD;
  trade_record RECORD;
  rr_ratio DECIMAL := 0;
  trade_initial_risk DECIMAL := 0;
  current_remaining_risk DECIMAL := 0;
  effective_close_percent DECIMAL;
  reduced_risk DECIMAL;
  realized_amount DECIMAL;
  remaining_after DECIMAL;
  new_total_realized_pnl DECIMAL;
  trade_final_pnl DECIMAL;
  pending_count INTEGER := 0;
  should_close_signal BOOLEAN := FALSE;
  resolved_close_status TEXT;
  applied_count INTEGER := 0;
  execution_price_for_pnl DECIMAL;
BEGIN
  SELECT
    su.id,
    su.signal_id,
    su.tp_price,
    su.close_percent,
    su.update_type,
    s.direction,
    s.entry_price,
    s.stop_loss
  INTO update_row
  FROM public.signal_take_profit_updates su
  JOIN public.signals s ON s.id = su.signal_id
  WHERE su.id = _update_id;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  execution_price_for_pnl := COALESCE(_execution_price, update_row.tp_price);

  -- Signed R multiple at execution price.
  IF update_row.entry_price IS NOT NULL
     AND update_row.stop_loss IS NOT NULL
     AND execution_price_for_pnl IS NOT NULL THEN
    IF update_row.direction = 'BUY' THEN
      IF (update_row.entry_price - update_row.stop_loss) = 0 THEN
        rr_ratio := CASE
          WHEN execution_price_for_pnl > update_row.entry_price THEN 1
          WHEN execution_price_for_pnl < update_row.entry_price THEN -1
          ELSE 0
        END;
      ELSE
        rr_ratio := (execution_price_for_pnl - update_row.entry_price) / (update_row.entry_price - update_row.stop_loss);
      END IF;
    ELSE
      IF (update_row.stop_loss - update_row.entry_price) = 0 THEN
        rr_ratio := CASE
          WHEN execution_price_for_pnl < update_row.entry_price THEN 1
          WHEN execution_price_for_pnl > update_row.entry_price THEN -1
          ELSE 0
        END;
      ELSE
        rr_ratio := (update_row.entry_price - execution_price_for_pnl) / (update_row.stop_loss - update_row.entry_price);
      END IF;
    END IF;
  END IF;

  rr_ratio := COALESCE(rr_ratio, 0);

  FOR trade_record IN
    SELECT *
    FROM public.user_trades
    WHERE signal_id = update_row.signal_id
      AND result = 'pending'
  LOOP
    -- Idempotency guard.
    IF EXISTS (
      SELECT 1
      FROM public.user_trade_take_profit_updates utpu
      WHERE utpu.user_trade_id = trade_record.id
        AND utpu.signal_update_id = update_row.id
    ) THEN
      CONTINUE;
    END IF;

    trade_initial_risk := COALESCE(trade_record.initial_risk_amount, trade_record.risk_amount, 0);
    current_remaining_risk := COALESCE(trade_record.remaining_risk_amount, 0);
    IF trade_initial_risk <= 0 OR current_remaining_risk <= 0 THEN
      CONTINUE;
    END IF;

    effective_close_percent := LEAST(GREATEST(update_row.close_percent, 0), 100);
    IF effective_close_percent <= 0 THEN
      CONTINUE;
    END IF;

    -- close_percent is applied on original exposure (initial risk),
    -- then capped by currently remaining open exposure.
    reduced_risk := trade_initial_risk * (effective_close_percent / 100);
    reduced_risk := LEAST(reduced_risk, current_remaining_risk);
    reduced_risk := ROUND(reduced_risk, 2);

    IF reduced_risk <= 0 THEN
      CONTINUE;
    END IF;

    realized_amount := ROUND(reduced_risk * rr_ratio, 2);

    -- Keep money fields on 2-decimal precision so close checks and UI stay consistent.
    remaining_after := ROUND(GREATEST(current_remaining_risk - reduced_risk, 0), 2);
    IF effective_close_percent >= 100 OR remaining_after < 0.01 THEN
      remaining_after := 0;
    END IF;

    new_total_realized_pnl := ROUND(COALESCE(trade_record.realized_pnl, trade_record.pnl, 0) + realized_amount, 2);
    trade_final_pnl := new_total_realized_pnl;

    UPDATE public.user_trades
    SET
      remaining_risk_amount = remaining_after,
      realized_pnl = new_total_realized_pnl,
      pnl = trade_final_pnl,
      last_update_at = now(),
      closed_at = CASE WHEN remaining_after <= 0 THEN COALESCE(closed_at, now()) ELSE closed_at END,
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
      update_row.id,
      effective_close_percent,
      realized_amount
    )
    ON CONFLICT (user_trade_id, signal_update_id) DO NOTHING;

    applied_count := applied_count + 1;
  END LOOP;

  -- Close signal automatically when update explicitly closes 100%
  -- or when all pending exposure is now closed.
  IF update_row.close_percent >= 100 THEN
    should_close_signal := TRUE;
  END IF;

  SELECT COUNT(*)
  INTO pending_count
  FROM public.user_trades
  WHERE signal_id = update_row.signal_id
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
    WHERE id = update_row.signal_id
      AND status = 'active';
  END IF;

  RETURN applied_count;
END;
$$;

-- Backfill existing pending trades that are effectively fully closed already.
-- This fixes propagation to history/notifications/active views.
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
  AND COALESCE(ut.remaining_risk_amount, 0) <= 0.009;

GRANT EXECUTE ON FUNCTION public.apply_signal_take_profit_update_row(UUID, DECIMAL) TO authenticated;

NOTIFY pgrst, 'reload schema';
