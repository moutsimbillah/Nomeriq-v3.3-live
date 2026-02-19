-- Live mode only:
-- 1) Limit updates stay pending on insert.
-- 2) They are applied only when live price touches TP.
-- 3) Trigger execution is logged into signal_event_history for deterministic UI status.

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

  -- Live limit updates must remain pending until price touch.
  IF signal_mode = 'live' AND COALESCE(NEW.update_type, 'limit') = 'limit' THEN
    RETURN NEW;
  END IF;

  -- Market-close updates (and non-live legacy behavior) apply immediately.
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

      IF COALESCE(v_applied_count, 0) > 0 THEN
        INSERT INTO public.signal_event_history (
          signal_id,
          event_type,
          actor_user_id,
          payload
        )
        VALUES (
          signal_row.id,
          'tp_update_triggered',
          NULL,
          jsonb_build_object(
            'update_id', update_row.id,
            'update_type', 'limit',
            'tp_price', update_row.tp_price,
            'quote_price', v_quote_price,
            'quote_quoted_at', v_quote_ts,
            'quote_source', quote_symbol
          )
        );
      END IF;

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

NOTIFY pgrst, 'reload schema';
