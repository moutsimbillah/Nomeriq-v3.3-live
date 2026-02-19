-- Reclassify legacy TP rows for this live signal to match actual action semantics.
-- Signal: 5af82b1f-de9c-41ae-be9f-34b70e40925c
-- TP1/TP2 should display as Market Close + Executed.
-- TP3 remains Limit Order + Pending.

DO $$
DECLARE
  v_signal_id CONSTANT uuid := '5af82b1f-de9c-41ae-be9f-34b70e40925c';
  v_market_update_ids CONSTANT text[] := ARRAY[
    'f1720554-a22f-4e1d-bc65-215a4a51808a',
    '54c02761-7e65-4f22-91b1-328e70ff4b36'
  ];
BEGIN
  UPDATE public.signal_take_profit_updates su
  SET update_type = 'market'
  WHERE su.signal_id = v_signal_id
    AND su.id::text = ANY(v_market_update_ids)
    AND COALESCE(su.update_type, 'limit') IS DISTINCT FROM 'market';

  UPDATE public.signal_event_history ev
  SET payload = jsonb_set(ev.payload, '{update_type}', to_jsonb('market'::text), true)
  WHERE ev.signal_id = v_signal_id
    AND ev.event_type = 'tp_update_published'
    AND ev.payload ? 'update_id'
    AND ev.payload->>'update_id' = ANY(v_market_update_ids);

  DELETE FROM public.signal_event_history ev
  WHERE ev.signal_id = v_signal_id
    AND ev.event_type = 'tp_update_triggered'
    AND ev.payload ? 'update_id'
    AND ev.payload->>'update_id' = ANY(v_market_update_ids);
END
$$;

NOTIFY pgrst, 'reload schema';
