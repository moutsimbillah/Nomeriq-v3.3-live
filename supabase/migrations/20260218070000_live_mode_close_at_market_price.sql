-- Live-mode close snapshot fields and realized PnL close logic.
-- Manual mode behavior remains unchanged.

ALTER TABLE public.signals
  ADD COLUMN IF NOT EXISTS close_price DECIMAL(20,8),
  ADD COLUMN IF NOT EXISTS close_quoted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS close_source TEXT;

CREATE OR REPLACE FUNCTION public.close_trades_for_signal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  trade_record RECORD;
  rr_ratio DECIMAL;
  final_pnl DECIMAL;
  delta_to_apply DECIMAL;
  remaining_risk DECIMAL;
  risk_per_unit DECIMAL;
  is_live_close BOOLEAN;
BEGIN
  IF NEW.status IN ('tp_hit', 'sl_hit', 'breakeven') AND OLD.status = 'active' THEN
    -- Manual-mode baseline R:R (legacy behavior).
    IF NEW.direction = 'BUY' THEN
      IF (NEW.entry_price - NEW.stop_loss) != 0 THEN
        rr_ratio := ABS((NEW.take_profit - NEW.entry_price) / (NEW.entry_price - NEW.stop_loss));
      ELSE
        rr_ratio := 1;
      END IF;
    ELSE
      IF (NEW.stop_loss - NEW.entry_price) != 0 THEN
        rr_ratio := ABS((NEW.entry_price - NEW.take_profit) / (NEW.stop_loss - NEW.entry_price));
      ELSE
        rr_ratio := 1;
      END IF;
    END IF;

    is_live_close := NEW.market_mode = 'live' AND NEW.close_price IS NOT NULL;

    FOR trade_record IN
      SELECT *
      FROM public.user_trades
      WHERE signal_id = NEW.id
        AND result = 'pending'
    LOOP
      remaining_risk := COALESCE(trade_record.remaining_risk_amount, trade_record.risk_amount, 0);

      IF is_live_close
         AND NEW.entry_price IS NOT NULL
         AND NEW.stop_loss IS NOT NULL THEN
        risk_per_unit := CASE
          WHEN NEW.direction = 'BUY' THEN NEW.entry_price - NEW.stop_loss
          ELSE NEW.stop_loss - NEW.entry_price
        END;

        IF risk_per_unit = 0 THEN
          IF NEW.direction = 'BUY' THEN
            rr_ratio := CASE
              WHEN NEW.close_price > NEW.entry_price THEN 1
              WHEN NEW.close_price < NEW.entry_price THEN -1
              ELSE 0
            END;
          ELSE
            rr_ratio := CASE
              WHEN NEW.close_price < NEW.entry_price THEN 1
              WHEN NEW.close_price > NEW.entry_price THEN -1
              ELSE 0
            END;
          END IF;
        ELSE
          rr_ratio := CASE
            WHEN NEW.direction = 'BUY' THEN (NEW.close_price - NEW.entry_price) / risk_per_unit
            ELSE (NEW.entry_price - NEW.close_price) / risk_per_unit
          END;
        END IF;

        final_pnl := COALESCE(trade_record.pnl, 0) + (remaining_risk * rr_ratio);
      ELSE
        IF NEW.status = 'tp_hit' THEN
          final_pnl := COALESCE(trade_record.pnl, 0) + (remaining_risk * rr_ratio);
        ELSIF NEW.status = 'breakeven' THEN
          final_pnl := COALESCE(trade_record.pnl, 0);
        ELSE
          final_pnl := COALESCE(trade_record.pnl, 0) - remaining_risk;
        END IF;
      END IF;

      final_pnl := ROUND(final_pnl, 2);
      delta_to_apply := ROUND(final_pnl - COALESCE(trade_record.pnl, 0), 2);

      UPDATE public.user_trades
      SET
        result = CASE
          WHEN is_live_close THEN
            CASE
              WHEN final_pnl > 0 THEN 'win'
              WHEN final_pnl < 0 THEN 'loss'
              ELSE 'breakeven'
            END
          WHEN NEW.status = 'tp_hit' THEN 'win'
          WHEN NEW.status = 'sl_hit' THEN 'loss'
          ELSE 'breakeven'
        END,
        pnl = final_pnl,
        realized_pnl = final_pnl,
        remaining_risk_amount = 0,
        closed_at = now()
      WHERE id = trade_record.id;

      IF delta_to_apply <> 0 THEN
        UPDATE public.profiles
        SET
          account_balance = account_balance + delta_to_apply,
          updated_at = now()
        WHERE user_id = trade_record.user_id;
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
