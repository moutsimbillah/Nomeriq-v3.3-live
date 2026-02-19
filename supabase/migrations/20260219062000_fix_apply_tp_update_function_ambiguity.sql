-- Fix manual-mode TP publish failure:
-- "function public.apply_signal_take_profit_update_row(uuid) is not unique"
--
-- Root cause:
-- - 2-arg function exists with default second arg:
--     apply_signal_take_profit_update_row(uuid, decimal default null)
-- - 1-arg wrapper also exists:
--     apply_signal_take_profit_update_row(uuid)
-- This makes one-arg calls ambiguous in Postgres function resolution.

-- Remove the duplicate 1-arg wrapper; one-arg calls continue to work
-- through the defaulted second argument on the 2-arg function.
DROP FUNCTION IF EXISTS public.apply_signal_take_profit_update_row(UUID);

-- Ensure execute permission remains available for app role.
GRANT EXECUTE ON FUNCTION public.apply_signal_take_profit_update_row(UUID, DECIMAL) TO authenticated;

NOTIFY pgrst, 'reload schema';
