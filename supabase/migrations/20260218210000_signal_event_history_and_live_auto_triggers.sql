-- Persist signal lifecycle events and enable automatic live SL/TP trigger handling.

-- 1) Event history table (timeline/audit for signal updates).
CREATE TABLE IF NOT EXISTS public.signal_event_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id UUID NOT NULL REFERENCES public.signals(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  actor_user_id UUID,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_signal_event_history_signal_created
  ON public.signal_event_history(signal_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_signal_event_history_type_created
  ON public.signal_event_history(event_type, created_at DESC);

ALTER TABLE public.signal_event_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view signal events for visible signals" ON public.signal_event_history;
CREATE POLICY "Users can view signal events for visible signals"
ON public.signal_event_history
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.signals s
    WHERE s.id = signal_event_history.signal_id
      AND (
        public.user_has_category_access(auth.uid(), s.category)
        OR public.is_any_admin(auth.uid())
        OR s.created_by = auth.uid()
      )
  )
);

DROP POLICY IF EXISTS "No direct insert into signal events" ON public.signal_event_history;
CREATE POLICY "No direct insert into signal events"
ON public.signal_event_history
FOR INSERT
WITH CHECK (false);

-- 2) Event logging triggers.
CREATE OR REPLACE FUNCTION public.log_signal_tp_update_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.signal_event_history (
    signal_id,
    event_type,
    actor_user_id,
    payload
  )
  VALUES (
    NEW.signal_id,
    'tp_update_published',
    NEW.created_by,
    jsonb_build_object(
      'tp_label', NEW.tp_label,
      'tp_price', NEW.tp_price,
      'close_percent', NEW.close_percent,
      'note', NEW.note
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_signal_tp_update_event ON public.signal_take_profit_updates;
CREATE TRIGGER trg_log_signal_tp_update_event
AFTER INSERT ON public.signal_take_profit_updates
FOR EACH ROW
EXECUTE FUNCTION public.log_signal_tp_update_event();

CREATE OR REPLACE FUNCTION public.log_signal_breakeven_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.signal_type = 'signal'
     AND NEW.status = 'active'
     AND NEW.entry_price IS NOT NULL
     AND NEW.stop_loss IS NOT NULL
     AND OLD.stop_loss IS DISTINCT FROM NEW.stop_loss
     AND ABS(NEW.stop_loss - NEW.entry_price) < 1e-8
     AND (OLD.entry_price IS NULL OR ABS(OLD.stop_loss - OLD.entry_price) >= 1e-8)
  THEN
    INSERT INTO public.signal_event_history (
      signal_id,
      event_type,
      actor_user_id,
      payload
    )
    VALUES (
      NEW.id,
      'sl_breakeven',
      auth.uid(),
      jsonb_build_object(
        'previous_stop_loss', OLD.stop_loss,
        'new_stop_loss', NEW.stop_loss,
        'entry_price', NEW.entry_price
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_signal_breakeven_event ON public.signals;
CREATE TRIGGER trg_log_signal_breakeven_event
AFTER UPDATE OF stop_loss ON public.signals
FOR EACH ROW
EXECUTE FUNCTION public.log_signal_breakeven_event();

CREATE OR REPLACE FUNCTION public.log_signal_closed_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status = 'active' AND NEW.status IN ('tp_hit', 'sl_hit', 'breakeven') THEN
    INSERT INTO public.signal_event_history (
      signal_id,
      event_type,
      actor_user_id,
      payload
    )
    VALUES (
      NEW.id,
      'signal_closed',
      auth.uid(),
      jsonb_build_object(
        'status', NEW.status,
        'close_price', NEW.close_price,
        'close_quoted_at', NEW.close_quoted_at,
        'close_source', NEW.close_source
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_signal_closed_event ON public.signals;
CREATE TRIGGER trg_log_signal_closed_event
AFTER UPDATE OF status ON public.signals
FOR EACH ROW
EXECUTE FUNCTION public.log_signal_closed_event();

-- 3) Auto-close active live signals when cached quote reaches SL/TP.
--    Uses configured base SL/TP:
--      - If no TP updates exist: SL/TP acts as first executable targets.
--      - After partial TP updates: remaining position still auto-closes at base TP/SL.
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
  open_exposure_count INTEGER;
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
    SELECT COUNT(*)
    INTO open_exposure_count
    FROM public.user_trades ut
    WHERE ut.signal_id = signal_row.id
      AND ut.result = 'pending'
      AND COALESCE(ut.remaining_risk_amount, 0) > 0;

    IF open_exposure_count = 0 THEN
      CONTINUE;
    END IF;

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
        next_status := 'sl_hit';
        execution_price := signal_row.stop_loss;
      ELSIF signal_row.take_profit IS NOT NULL AND quote_price >= signal_row.take_profit THEN
        should_close := true;
        next_status := 'tp_hit';
        -- Final target executes on configured TP price.
        execution_price := signal_row.take_profit;
      END IF;
    ELSE
      IF signal_row.stop_loss IS NOT NULL AND quote_price >= signal_row.stop_loss THEN
        should_close := true;
        next_status := 'sl_hit';
        execution_price := signal_row.stop_loss;
      ELSIF signal_row.take_profit IS NOT NULL AND quote_price <= signal_row.take_profit THEN
        should_close := true;
        next_status := 'tp_hit';
        -- Final target executes on configured TP price.
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

GRANT EXECUTE ON FUNCTION public.process_live_signal_auto_triggers(UUID[]) TO authenticated;

NOTIFY pgrst, 'reload schema';
