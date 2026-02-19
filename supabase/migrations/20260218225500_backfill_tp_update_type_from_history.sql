-- Backfill/correct TP update type metadata from event history payload.
-- This is safe and deterministic when payload includes update_id/update_type.

-- 1) If event payload has update_id + update_type, sync row update_type from it.
UPDATE public.signal_take_profit_updates su
SET update_type = ev.payload->>'update_type'
FROM public.signal_event_history ev
WHERE ev.event_type = 'tp_update_published'
  AND ev.payload ? 'update_id'
  AND ev.payload ? 'update_type'
  AND ev.payload->>'update_type' IN ('limit', 'market')
  AND ev.payload->>'update_id' = su.id::text
  AND COALESCE(su.update_type, 'limit') IS DISTINCT FROM ev.payload->>'update_type';

-- 2) If event payload has update_id but missing update_type, patch payload from row.
UPDATE public.signal_event_history ev
SET payload = jsonb_set(
  ev.payload,
  '{update_type}',
  to_jsonb(COALESCE(su.update_type, 'limit')::text),
  true
)
FROM public.signal_take_profit_updates su
WHERE ev.event_type = 'tp_update_published'
  AND ev.payload ? 'update_id'
  AND NOT (ev.payload ? 'update_type')
  AND ev.payload->>'update_id' = su.id::text;

-- 3) Backfill missing update_id/update_type for older tp_update_published events
-- by exact field match on signal_id + tp tuple, only when match is unique.
WITH event_candidates AS (
  SELECT
    ev.id AS event_id,
    su.id AS update_id,
    COALESCE(su.update_type, 'limit') AS update_type,
    ROW_NUMBER() OVER (
      PARTITION BY ev.id
      ORDER BY ABS(EXTRACT(EPOCH FROM (su.created_at - ev.created_at)))
    ) AS rn,
    COUNT(*) OVER (PARTITION BY ev.id) AS candidate_count
  FROM public.signal_event_history ev
  JOIN public.signal_take_profit_updates su
    ON su.signal_id = ev.signal_id
   AND ev.event_type = 'tp_update_published'
   AND ev.payload ? 'tp_label'
   AND ev.payload ? 'tp_price'
   AND ev.payload ? 'close_percent'
   AND su.tp_label = ev.payload->>'tp_label'
   AND su.tp_price = (ev.payload->>'tp_price')::DECIMAL
   AND su.close_percent = (ev.payload->>'close_percent')::DECIMAL
  WHERE NOT (ev.payload ? 'update_id')
),
unique_matches AS (
  SELECT event_id, update_id, update_type
  FROM event_candidates
  WHERE rn = 1
    AND candidate_count = 1
)
UPDATE public.signal_event_history ev
SET payload =
  jsonb_set(
    jsonb_set(ev.payload, '{update_id}', to_jsonb(um.update_id::text), true),
    '{update_type}',
    to_jsonb(um.update_type::text),
    true
  )
FROM unique_matches um
WHERE ev.id = um.event_id;

NOTIFY pgrst, 'reload schema';

