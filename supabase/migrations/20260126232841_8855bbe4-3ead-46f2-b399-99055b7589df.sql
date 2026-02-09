-- Ensure trades are created for subscribers when a signal is inserted OR when an upcoming trade is converted into a signal.

-- 1) Trigger on INSERT (idempotent)
DROP TRIGGER IF EXISTS create_trades_on_signal_insert ON public.signals;
CREATE TRIGGER create_trades_on_signal_insert
AFTER INSERT ON public.signals
FOR EACH ROW
EXECUTE FUNCTION public.create_trades_for_signal();

-- 2) Trigger on UPDATE when signal_type becomes 'signal' and status is active (conversion flow)
DROP TRIGGER IF EXISTS create_trades_on_signal_convert ON public.signals;
CREATE TRIGGER create_trades_on_signal_convert
AFTER UPDATE OF signal_type, status ON public.signals
FOR EACH ROW
WHEN (
  NEW.signal_type = 'signal'
  AND NEW.status = 'active'
  AND (OLD.signal_type IS DISTINCT FROM 'signal')
)
EXECUTE FUNCTION public.create_trades_for_signal();
