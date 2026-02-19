-- Ensure TP update event history captures explicit action metadata.
-- This removes ambiguity between limit updates and market-close updates.

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
      'update_id', NEW.id,
      'update_type', COALESCE(NEW.update_type, 'limit'),
      'tp_label', NEW.tp_label,
      'tp_price', NEW.tp_price,
      'close_percent', NEW.close_percent,
      'note', NEW.note
    )
  );

  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';

