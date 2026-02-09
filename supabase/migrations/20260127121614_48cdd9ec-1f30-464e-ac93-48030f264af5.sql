-- Update the user_trades result check constraint to include 'breakeven'
ALTER TABLE public.user_trades DROP CONSTRAINT IF EXISTS user_trades_result_check;

ALTER TABLE public.user_trades ADD CONSTRAINT user_trades_result_check 
  CHECK (result IN ('win', 'loss', 'pending', 'breakeven'));