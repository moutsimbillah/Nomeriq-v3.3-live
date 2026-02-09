-- Add unique constraint to user_trades for ON CONFLICT to work
ALTER TABLE public.user_trades ADD CONSTRAINT user_trades_user_signal_unique UNIQUE (user_id, signal_id);

-- Function to create trades for all subscribed users when a new signal is created
CREATE OR REPLACE FUNCTION public.create_trades_for_signal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_record RECORD;
  risk_pct DECIMAL;
  global_risk DECIMAL;
  risk_amt DECIMAL;
BEGIN
  -- Get global risk percent
  SELECT global_risk_percent INTO global_risk FROM global_settings LIMIT 1;
  
  -- Create trade for each subscribed user with account balance set
  FOR user_record IN 
    SELECT p.user_id, p.account_balance, p.custom_risk_percent
    FROM profiles p
    JOIN subscriptions s ON p.user_id = s.user_id
    WHERE s.status = 'active' 
    AND (s.expires_at IS NULL OR s.expires_at > now())
    AND p.account_balance IS NOT NULL
    AND p.account_balance > 0
  LOOP
    -- Use custom risk if set, otherwise global
    risk_pct := COALESCE(user_record.custom_risk_percent, global_risk);
    risk_amt := (user_record.account_balance * risk_pct) / 100;
    
    INSERT INTO user_trades (user_id, signal_id, risk_percent, risk_amount, result)
    VALUES (user_record.user_id, NEW.id, risk_pct, risk_amt, 'pending')
    ON CONFLICT (user_id, signal_id) DO NOTHING;
  END LOOP;
  
  RETURN NEW;
END;
$$;

-- Function to close trades and update balances when signal closes
CREATE OR REPLACE FUNCTION public.close_trades_for_signal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  trade_record RECORD;
  pnl_amount DECIMAL;
  rr_ratio DECIMAL;
BEGIN
  -- Only process if status changed to tp_hit or sl_hit from active
  IF NEW.status IN ('tp_hit', 'sl_hit') AND OLD.status = 'active' THEN
    
    -- Calculate R:R ratio from signal prices (avoiding division by zero)
    IF NEW.direction = 'BUY' THEN
      IF (NEW.entry_price - NEW.stop_loss) != 0 THEN
        rr_ratio := ABS((NEW.take_profit - NEW.entry_price) / (NEW.entry_price - NEW.stop_loss));
      ELSE
        rr_ratio := 1;
      END IF;
    ELSE
      IF (NEW.stop_loss - NEW.entry_price) != 0 THEN
        rr_ratio := ABS((NEW.entry_price - NEW.take_profit) / (NEW.stop_loss - NEW.entry_price));
      ELSE
        rr_ratio := 1;
      END IF;
    END IF;
    
    FOR trade_record IN 
      SELECT * FROM user_trades WHERE signal_id = NEW.id AND result = 'pending'
    LOOP
      IF NEW.status = 'tp_hit' THEN
        pnl_amount := trade_record.risk_amount * rr_ratio;
        UPDATE user_trades SET result = 'win', pnl = pnl_amount, closed_at = now() WHERE id = trade_record.id;
        UPDATE profiles SET account_balance = account_balance + pnl_amount, updated_at = now() WHERE user_id = trade_record.user_id;
      ELSE -- sl_hit
        pnl_amount := -trade_record.risk_amount;
        UPDATE user_trades SET result = 'loss', pnl = pnl_amount, closed_at = now() WHERE id = trade_record.id;
        UPDATE profiles SET account_balance = account_balance + pnl_amount, updated_at = now() WHERE user_id = trade_record.user_id;
      END IF;
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for new active signals
CREATE TRIGGER on_signal_created
  AFTER INSERT ON signals
  FOR EACH ROW
  WHEN (NEW.status = 'active')
  EXECUTE FUNCTION public.create_trades_for_signal();

-- Create trigger for signal status changes
CREATE TRIGGER on_signal_closed
  AFTER UPDATE ON signals
  FOR EACH ROW
  EXECUTE FUNCTION public.close_trades_for_signal();

-- Enable realtime for user_trades table
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_trades;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;