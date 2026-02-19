-- Live mode: limit TP updates must be pending until price reaches TP.
-- Market-close TP updates continue to execute immediately.

CREATE OR REPLACE FUNCTION public.apply_signal_take_profit_update_row(_update_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  update_row RECORD;
  trade_record RECORD;
  rr_ratio DECIMAL := 0;
  effective_close_percent DECIMAL;
  reduced_risk DECIMAL;
  realized_amount DECIMAL;
  remaining_after DECIMAL;
  trade_final_pnl DECIMAL;
  pending_count INTEGER := 0;
  should_close_signal BOOLEAN := FALSE;
  resolved_close_status TEXT;
  applied_count INTEGER := 0;
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

  -- Signed R multiple at update price.
  IF update_row.entry_price IS NOT NULL AND update_row.stop_loss IS NOT NULL THEN
    IF update_row.direction = 'BUY' THEN
      IF (update_row.entry_price - update_row.stop_loss) = 0 THEN
        rr_ratio := CASE
          WHEN update_row.tp_price > update_row.entry_price THEN 1
          WHEN update_row.tp_price < update_row.entry_price THEN -1
          ELSE 0
        END;
      ELSE
        rr_ratio := (update_row.tp_price - update_row.entry_price) / (update_row.entry_price - update_row.stop_loss);
      END IF;
    ELSE
      IF (update_row.stop_loss - update_row.entry_price) = 0 THEN
        rr_ratio := CASE
          WHEN update_row.tp_price < update_row.entry_price THEN 1
          WHEN update_row.tp_price > update_row.entry_price THEN -1
          ELSE 0
        END;
      ELSE
        rr_ratio := (update_row.entry_price - update_row.tp_price) / (update_row.stop_loss - update_row.entry_price);
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

    IF COALESCE(trade_record.initial_risk_amount, 0) <= 0
       OR COALESCE(trade_record.remaining_risk_amount, 0) <= 0 THEN
      CONTINUE;
    END IF;

    effective_close_percent := LEAST(GREATEST(update_row.close_percent, 0), 100);
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

CREATE OR REPLACE FUNCTION public.apply_take_profit_update_to_user_trades()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  signal_mode public.market_mode;
BEGIN
  SELECT s.market_mode
  INTO signal_mode
  FROM public.signals s
  WHERE s.id = NEW.signal_id;

  -- Live limit updates are pending orders and must execute only on price touch.
  IF signal_mode = 'live' AND COALESCE(NEW.update_type, 'limit') = 'limit' THEN
    RETURN NEW;
  END IF;

  PERFORM public.apply_signal_take_profit_update_row(NEW.id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.process_live_limit_tp_updates(_signal_ids UUID[] DEFAULT NULL)
RETURNS TABLE (
  signal_id UUID,
  signal_update_id UUID,
  triggered BOOLEAN,
  applied_count INTEGER,
  quote_price DECIMAL,
  quote_quoted_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  signal_row RECORD;
  update_row RECORD;
  quote_symbol TEXT;
  v_quote_price DECIMAL;
  v_quote_ts TIMESTAMPTZ;
  should_trigger BOOLEAN;
  pending_unapplied_count INTEGER;
  v_applied_count INTEGER;
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
    v_quote_price := NULL;
    v_quote_ts := NULL;

    IF signal_row.entry_quote_id IS NOT NULL THEN
      SELECT mq.symbol, mq.price, mq.quoted_at
      INTO quote_symbol, v_quote_price, v_quote_ts
      FROM public.market_quotes mq
      WHERE mq.id = signal_row.entry_quote_id;
    END IF;

    IF quote_symbol IS NULL THEN
      SELECT mq.symbol, mq.price, mq.quoted_at
      INTO quote_symbol, v_quote_price, v_quote_ts
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

    IF quote_symbol IS NULL OR v_quote_price IS NULL OR v_quote_ts IS NULL THEN
      CONTINUE;
    END IF;

    -- Ignore stale quote snapshots.
    IF v_quote_ts < now() - INTERVAL '60 seconds' THEN
      CONTINUE;
    END IF;

    FOR update_row IN
      SELECT su.id, su.tp_price
      FROM public.signal_take_profit_updates su
      WHERE su.signal_id = signal_row.id
        AND COALESCE(su.update_type, 'limit') = 'limit'
      ORDER BY su.created_at ASC
    LOOP
      SELECT COUNT(*)
      INTO pending_unapplied_count
      FROM public.user_trades ut
      WHERE ut.signal_id = signal_row.id
        AND ut.result = 'pending'
        AND COALESCE(ut.remaining_risk_amount, 0) > 0
        AND NOT EXISTS (
          SELECT 1
          FROM public.user_trade_take_profit_updates utpu
          WHERE utpu.user_trade_id = ut.id
            AND utpu.signal_update_id = update_row.id
        );

      IF pending_unapplied_count = 0 THEN
        CONTINUE;
      END IF;

      should_trigger :=
        CASE
          WHEN signal_row.direction = 'BUY' THEN v_quote_price >= update_row.tp_price
          ELSE v_quote_price <= update_row.tp_price
        END;

      IF NOT should_trigger THEN
        CONTINUE;
      END IF;

      v_applied_count := public.apply_signal_take_profit_update_row(update_row.id);

      signal_id := signal_row.id;
      signal_update_id := update_row.id;
      triggered := true;
      applied_count := COALESCE(v_applied_count, 0);
      quote_price := v_quote_price;
      quote_quoted_at := v_quote_ts;
      RETURN NEXT;
    END LOOP;
  END LOOP;

  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_signal_take_profit_update_row(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_live_limit_tp_updates(UUID[]) TO authenticated;

NOTIFY pgrst, 'reload schema';

