-- Targeted repair for historical live TP update state on:
-- signal_id = 5af82b1f-de9c-41ae-be9f-34b70e40925c
--
-- Why:
-- - TP1/TP2 were applied to trades, but event history missed per-update published/triggered rows.
-- - TP3 (84bdf8a0-f739-42aa-8c7d-a72b941a3f6b) was auto-applied as limit due old behavior
--   and must be reverted so it can remain pending until true trigger.

DO $$
DECLARE
  v_signal_id CONSTANT uuid := '5af82b1f-de9c-41ae-be9f-34b70e40925c';
  v_tp3_id CONSTANT uuid := '84bdf8a0-f739-42aa-8c7d-a72b941a3f6b';
BEGIN
  -- 1) Backfill missing tp_update_published rows with update_id/update_type payload.
  INSERT INTO public.signal_event_history (
    signal_id,
    event_type,
    actor_user_id,
    payload,
    created_at
  )
  SELECT
    su.signal_id,
    'tp_update_published',
    su.created_by,
    jsonb_build_object(
      'update_id', su.id,
      'update_type', COALESCE(su.update_type, 'limit'),
      'tp_label', su.tp_label,
      'tp_price', su.tp_price,
      'close_percent', su.close_percent,
      'note', su.note
    ),
    su.created_at
  FROM public.signal_take_profit_updates su
  WHERE su.signal_id = v_signal_id
    AND NOT EXISTS (
      SELECT 1
      FROM public.signal_event_history ev
      WHERE ev.signal_id = su.signal_id
        AND ev.event_type = 'tp_update_published'
        AND ev.payload->>'update_id' = su.id::text
    );

  -- 2) Backfill missing trigger rows for applied live limit updates, excluding TP3.
  INSERT INTO public.signal_event_history (
    signal_id,
    event_type,
    actor_user_id,
    payload,
    created_at
  )
  SELECT
    su.signal_id,
    'tp_update_triggered',
    NULL,
    jsonb_build_object(
      'update_id', su.id,
      'update_type', 'limit',
      'tp_price', su.tp_price
    ),
    MIN(utpu.created_at)
  FROM public.signal_take_profit_updates su
  JOIN public.signals s
    ON s.id = su.signal_id
  JOIN public.user_trade_take_profit_updates utpu
    ON utpu.signal_update_id = su.id
  WHERE su.signal_id = v_signal_id
    AND su.id <> v_tp3_id
    AND s.market_mode = 'live'
    AND COALESCE(su.update_type, 'limit') = 'limit'
    AND NOT EXISTS (
      SELECT 1
      FROM public.signal_event_history ev
      WHERE ev.signal_id = su.signal_id
        AND ev.event_type = 'tp_update_triggered'
        AND ev.payload->>'update_id' = su.id::text
    )
  GROUP BY su.signal_id, su.id, su.tp_price;

  -- 3) Revert wrongly auto-applied TP3 rows.
  --    Undo profile balance credit and trade-level realized/pnl/remaining updates.
  WITH tp3_rows AS (
    SELECT
      utpu.user_trade_id,
      utpu.close_percent,
      utpu.realized_pnl
    FROM public.user_trade_take_profit_updates utpu
    WHERE utpu.signal_update_id = v_tp3_id
  ),
  profile_deltas AS (
    SELECT
      ut.user_id,
      SUM(tp3.realized_pnl) AS total_realized
    FROM tp3_rows tp3
    JOIN public.user_trades ut
      ON ut.id = tp3.user_trade_id
    GROUP BY ut.user_id
  )
  UPDATE public.profiles p
  SET
    account_balance = COALESCE(p.account_balance, 0) - COALESCE(d.total_realized, 0),
    updated_at = now()
  FROM profile_deltas d
  WHERE p.user_id = d.user_id
    AND COALESCE(d.total_realized, 0) <> 0;

  WITH tp3_rows AS (
    SELECT
      utpu.user_trade_id,
      utpu.close_percent,
      utpu.realized_pnl
    FROM public.user_trade_take_profit_updates utpu
    WHERE utpu.signal_update_id = v_tp3_id
  )
  UPDATE public.user_trades ut
  SET
    remaining_risk_amount = CASE
      WHEN tp3.close_percent >= 100 THEN
        COALESCE(ut.initial_risk_amount, ut.risk_amount, ut.remaining_risk_amount)
      WHEN (1 - (tp3.close_percent / 100.0)) > 0 THEN
        LEAST(
          COALESCE(ut.initial_risk_amount, ut.risk_amount, ut.remaining_risk_amount),
          COALESCE(ut.remaining_risk_amount, 0) / (1 - (tp3.close_percent / 100.0))
        )
      ELSE COALESCE(ut.remaining_risk_amount, 0)
    END,
    realized_pnl = COALESCE(ut.realized_pnl, 0) - COALESCE(tp3.realized_pnl, 0),
    pnl = COALESCE(ut.pnl, 0) - COALESCE(tp3.realized_pnl, 0),
    last_update_at = now()
  FROM tp3_rows tp3
  WHERE ut.id = tp3.user_trade_id;

  DELETE FROM public.user_trade_take_profit_updates
  WHERE signal_update_id = v_tp3_id;

  -- Ensure TP3 remains pending: remove any trigger event for TP3.
  DELETE FROM public.signal_event_history ev
  WHERE ev.signal_id = v_signal_id
    AND ev.event_type = 'tp_update_triggered'
    AND ev.payload->>'update_id' = v_tp3_id::text;
END
$$;

NOTIFY pgrst, 'reload schema';

