-- Live close pricing/PnL refinements:
-- 1) For live SL/TP auto-triggers, store close_price as trigger quote price (not static base TP/SL).
-- 2) For live breakeven closes, force remaining-leg PnL to 0 (regardless of tiny quote drift).
-- Manual mode behavior is unchanged.

CREATE OR REPLACE FUNCTION public.process_live_signal_auto_triggers(_signal_ids UUID[] DEFAULT NULL)
RETURNS TABLE (
  signal_id UUID,
  resolved_status TEXT,
  close_price DECIMAL,
  close_quoted_at TIMESTAMPTZ,
  close_source TEXT,
  closed_now BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  signal_row RECORD;
  quote_symbol TEXT;
  quote_price DECIMAL;
  quote_ts TIMESTAMPTZ;
  should_close BOOLEAN;
  next_status TEXT;
  execution_price DECIMAL;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = 'P0001';
  END IF;

  FOR signal_row IN
    SELECT s.*
    FROM public.signals s
    WHERE s.signal_type = 'signal'
      AND s.status = 'active'
      AND s.market_mode = 'live'
      AND (_signal_ids IS NULL OR s.id = ANY(_signal_ids))
      AND (
        public.is_any_admin(auth.uid())
        OR s.created_by = auth.uid()
        OR public.user_has_category_access(auth.uid(), s.category)
      )
    ORDER BY s.created_at ASC
    FOR UPDATE SKIP LOCKED
  LOOP
    quote_symbol := NULL;
    quote_price := NULL;
    quote_ts := NULL;

    IF signal_row.entry_quote_id IS NOT NULL THEN
      SELECT mq.symbol, mq.price, mq.quoted_at
      INTO quote_symbol, quote_price, quote_ts
      FROM public.market_quotes mq
      WHERE mq.id = signal_row.entry_quote_id;
    END IF;

    IF quote_symbol IS NULL THEN
      SELECT mq.symbol, mq.price, mq.quoted_at
      INTO quote_symbol, quote_price, quote_ts
      FROM public.market_symbol_map msm
      JOIN public.market_quotes mq
        ON mq.symbol = msm.twelve_data_symbol
       AND mq.provider = msm.provider
      WHERE msm.symbol = UPPER(signal_row.pair)
        AND msm.category = signal_row.category
        AND msm.is_active = true
      ORDER BY mq.quoted_at DESC
      LIMIT 1;
    END IF;

    IF quote_symbol IS NULL OR quote_price IS NULL OR quote_ts IS NULL THEN
      CONTINUE;
    END IF;

    -- Ignore stale quote snapshots.
    IF quote_ts < now() - INTERVAL '60 seconds' THEN
      CONTINUE;
    END IF;

    should_close := false;
    next_status := NULL;
    execution_price := NULL;

    IF signal_row.direction = 'BUY' THEN
      IF signal_row.stop_loss IS NOT NULL AND quote_price <= signal_row.stop_loss THEN
        should_close := true;
        next_status := CASE
          WHEN signal_row.entry_price IS NOT NULL
               AND ABS(signal_row.stop_loss - signal_row.entry_price) < 1e-8
            THEN 'breakeven'
          ELSE 'sl_hit'
        END;
        execution_price := CASE
          WHEN next_status = 'breakeven' THEN signal_row.entry_price
          ELSE quote_price
        END;
      ELSIF signal_row.take_profit IS NOT NULL AND quote_price >= signal_row.take_profit THEN
        should_close := true;
        next_status := 'tp_hit';
        execution_price := quote_price;
      END IF;
    ELSE
      IF signal_row.stop_loss IS NOT NULL AND quote_price >= signal_row.stop_loss THEN
        should_close := true;
        next_status := CASE
          WHEN signal_row.entry_price IS NOT NULL
               AND ABS(signal_row.stop_loss - signal_row.entry_price) < 1e-8
            THEN 'breakeven'
          ELSE 'sl_hit'
        END;
        execution_price := CASE
          WHEN next_status = 'breakeven' THEN signal_row.entry_price
          ELSE quote_price
        END;
      ELSIF signal_row.take_profit IS NOT NULL AND quote_price <= signal_row.take_profit THEN
        should_close := true;
        next_status := 'tp_hit';
        execution_price := quote_price;
      END IF;
    END IF;

    IF NOT should_close OR next_status IS NULL OR execution_price IS NULL THEN
      CONTINUE;
    END IF;

    UPDATE public.signals s
    SET
      status = next_status,
      closed_at = COALESCE(s.closed_at, now()),
      close_price = execution_price,
      close_quoted_at = quote_ts,
      close_source = quote_symbol,
      updated_at = now()
    WHERE s.id = signal_row.id
      AND s.status = 'active';

    IF FOUND THEN
      signal_id := signal_row.id;
      resolved_status := next_status;
      close_price := execution_price;
      close_quoted_at := quote_ts;
      close_source := quote_symbol;
      closed_now := true;
      RETURN NEXT;
    END IF;
  END LOOP;

  RETURN;
END;
$$;

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
        IF NEW.status = 'breakeven' THEN
          rr_ratio := 0;
          final_pnl := COALESCE(trade_record.pnl, 0);
        ELSE
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
        END IF;
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

GRANT EXECUTE ON FUNCTION public.process_live_signal_auto_triggers(UUID[]) TO authenticated;

NOTIFY pgrst, 'reload schema';
