-- Live mode auto-trigger refinements (manual mode untouched):
-- 1) Signal SL/TP auto-close is driven by live price + signal levels (not follower trade presence).
-- 2) If SL equals entry (break-even moved), SL touch resolves as breakeven.
-- 3) Limit TP trigger event is logged on real price touch even when no user trades exist yet.

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
        execution_price := signal_row.stop_loss;
      ELSIF signal_row.take_profit IS NOT NULL AND quote_price >= signal_row.take_profit THEN
        should_close := true;
        next_status := 'tp_hit';
        -- Final remaining position closes on configured base TP price.
        execution_price := signal_row.take_profit;
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
        execution_price := signal_row.stop_loss;
      ELSIF signal_row.take_profit IS NOT NULL AND quote_price <= signal_row.take_profit THEN
        should_close := true;
        next_status := 'tp_hit';
        -- Final remaining position closes on configured base TP price.
        execution_price := signal_row.take_profit;
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
  v_applied_count INTEGER;
  v_has_trigger_event BOOLEAN;
  v_logged_trigger_event BOOLEAN;
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
      should_trigger :=
        CASE
          WHEN signal_row.direction = 'BUY' THEN v_quote_price >= update_row.tp_price
          ELSE v_quote_price <= update_row.tp_price
        END;

      IF NOT should_trigger THEN
        CONTINUE;
      END IF;

      SELECT EXISTS (
        SELECT 1
        FROM public.signal_event_history ev
        WHERE ev.signal_id = signal_row.id
          AND ev.event_type = 'tp_update_triggered'
          AND ev.payload ? 'update_id'
          AND ev.payload->>'update_id' = update_row.id::text
      )
      INTO v_has_trigger_event;

      v_applied_count := public.apply_signal_take_profit_update_row(update_row.id);
      v_logged_trigger_event := false;

      IF NOT v_has_trigger_event THEN
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
        v_logged_trigger_event := true;
      END IF;

      IF v_logged_trigger_event OR COALESCE(v_applied_count, 0) > 0 THEN
        signal_id := signal_row.id;
        signal_update_id := update_row.id;
        triggered := true;
        applied_count := COALESCE(v_applied_count, 0);
        quote_price := v_quote_price;
        quote_quoted_at := v_quote_ts;
        RETURN NEXT;
      END IF;
    END LOOP;
  END LOOP;

  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_live_signal_auto_triggers(UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_live_limit_tp_updates(UUID[]) TO authenticated;

NOTIFY pgrst, 'reload schema';
