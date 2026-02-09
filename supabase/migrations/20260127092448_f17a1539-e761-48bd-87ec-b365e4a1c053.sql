-- Add 'breakeven' as a valid signal status
-- First, drop the existing check constraint
ALTER TABLE public.signals DROP CONSTRAINT IF EXISTS signals_status_check;

-- Add the new check constraint with 'breakeven' included
ALTER TABLE public.signals ADD CONSTRAINT signals_status_check 
  CHECK (status IN ('active', 'closed', 'tp_hit', 'sl_hit', 'upcoming', 'cancelled', 'breakeven'));