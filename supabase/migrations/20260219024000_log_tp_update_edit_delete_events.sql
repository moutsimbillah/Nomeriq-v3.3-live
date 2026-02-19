-- Log TP update edits/deletes into signal_event_history so notifications and timelines
-- can propagate beyond insert-only TP events.

CREATE OR REPLACE FUNCTION public.log_signal_tp_update_change_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_id UUID;
BEGIN
  actor_id := auth.uid();

  IF TG_OP = 'UPDATE' THEN
    -- Skip noisy no-op updates.
    IF NEW.tp_label IS NOT DISTINCT FROM OLD.tp_label
       AND NEW.tp_price IS NOT DISTINCT FROM OLD.tp_price
       AND NEW.close_percent IS NOT DISTINCT FROM OLD.close_percent
       AND NEW.note IS NOT DISTINCT FROM OLD.note
       AND NEW.update_type IS NOT DISTINCT FROM OLD.update_type
    THEN
      RETURN NEW;
    END IF;

    INSERT INTO public.signal_event_history (
      signal_id,
      event_type,
      actor_user_id,
      payload
    )
    VALUES (
      NEW.signal_id,
      'tp_update_edited',
      COALESCE(actor_id, NEW.created_by),
      jsonb_build_object(
        'update_id', NEW.id,
        'old', jsonb_build_object(
          'tp_label', OLD.tp_label,
          'tp_price', OLD.tp_price,
          'close_percent', OLD.close_percent,
          'note', OLD.note,
          'update_type', COALESCE(OLD.update_type, 'limit')
        ),
        'new', jsonb_build_object(
          'tp_label', NEW.tp_label,
          'tp_price', NEW.tp_price,
          'close_percent', NEW.close_percent,
          'note', NEW.note,
          'update_type', COALESCE(NEW.update_type, 'limit')
        )
      )
    );

    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.signal_event_history (
      signal_id,
      event_type,
      actor_user_id,
      payload
    )
    VALUES (
      OLD.signal_id,
      'tp_update_deleted',
      COALESCE(actor_id, OLD.created_by),
      jsonb_build_object(
        'update_id', OLD.id,
        'tp_label', OLD.tp_label,
        'tp_price', OLD.tp_price,
        'close_percent', OLD.close_percent,
        'note', OLD.note,
        'update_type', COALESCE(OLD.update_type, 'limit')
      )
    );

    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_signal_tp_update_edit_event ON public.signal_take_profit_updates;
CREATE TRIGGER trg_log_signal_tp_update_edit_event
AFTER UPDATE ON public.signal_take_profit_updates
FOR EACH ROW
EXECUTE FUNCTION public.log_signal_tp_update_change_event();

DROP TRIGGER IF EXISTS trg_log_signal_tp_update_delete_event ON public.signal_take_profit_updates;
CREATE TRIGGER trg_log_signal_tp_update_delete_event
AFTER DELETE ON public.signal_take_profit_updates
FOR EACH ROW
EXECUTE FUNCTION public.log_signal_tp_update_change_event();

NOTIFY pgrst, 'reload schema';
