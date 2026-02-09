-- Add unique constraint on subscriptions.user_id if not exists (needed for upsert)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'subscriptions_user_id_key'
    ) THEN
        ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_user_id_key UNIQUE (user_id);
    END IF;
END $$;

-- Create the handle_new_user trigger on auth.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, first_name, last_name, phone)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'last_name',
    NEW.raw_user_meta_data->>'phone'
  );
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user');
  
  INSERT INTO public.subscriptions (user_id, status)
  VALUES (NEW.id, 'inactive');
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Drop existing trigger if exists and recreate
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create triggers for signals if not exists
CREATE OR REPLACE FUNCTION public.create_trades_for_signal()
RETURNS TRIGGER AS $$
DECLARE
  user_record RECORD;
  risk_pct DECIMAL;
  global_risk DECIMAL;
  risk_amt DECIMAL;
BEGIN
  IF NEW.signal_type != 'signal' THEN
    RETURN NEW;
  END IF;

  SELECT global_risk_percent INTO global_risk FROM global_settings LIMIT 1;
  
  FOR user_record IN 
    SELECT p.user_id, p.account_balance, p.custom_risk_percent
    FROM profiles p
    JOIN subscriptions s ON p.user_id = s.user_id
    WHERE s.status = 'active' 
    AND (s.expires_at IS NULL OR s.expires_at > now())
    AND p.account_balance IS NOT NULL
    AND p.account_balance > 0
    AND NOT EXISTS (
      SELECT 1 FROM user_roles ur 
      WHERE ur.user_id = p.user_id 
      AND ur.role = 'admin'
    )
  LOOP
    risk_pct := COALESCE(user_record.custom_risk_percent, global_risk);
    risk_amt := (user_record.account_balance * risk_pct) / 100;
    
    INSERT INTO user_trades (user_id, signal_id, risk_percent, risk_amount, result)
    VALUES (user_record.user_id, NEW.id, risk_pct, risk_amt, 'pending')
    ON CONFLICT (user_id, signal_id) DO NOTHING;
  END LOOP;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS create_trades_on_signal ON public.signals;
CREATE TRIGGER create_trades_on_signal
  AFTER INSERT ON public.signals
  FOR EACH ROW
  WHEN (NEW.status = 'active')
  EXECUTE FUNCTION public.create_trades_for_signal();

-- Create trigger for closing trades when signal status changes
CREATE OR REPLACE FUNCTION public.close_trades_for_signal()
RETURNS TRIGGER AS $$
DECLARE
  trade_record RECORD;
  pnl_amount DECIMAL;
  rr_ratio DECIMAL;
BEGIN
  IF NEW.status IN ('tp_hit', 'sl_hit', 'breakeven') AND OLD.status = 'active' THEN
    
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
      ELSIF NEW.status = 'breakeven' THEN
        pnl_amount := 0;
        UPDATE user_trades SET result = 'breakeven', pnl = pnl_amount, closed_at = now() WHERE id = trade_record.id;
      ELSE
        pnl_amount := -trade_record.risk_amount;
        UPDATE user_trades SET result = 'loss', pnl = pnl_amount, closed_at = now() WHERE id = trade_record.id;
        UPDATE profiles SET account_balance = account_balance + pnl_amount, updated_at = now() WHERE user_id = trade_record.user_id;
      END IF;
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS close_trades_on_signal_update ON public.signals;
CREATE TRIGGER close_trades_on_signal_update
  AFTER UPDATE ON public.signals
  FOR EACH ROW
  EXECUTE FUNCTION public.close_trades_for_signal();

-- Add unique constraint on user_trades for conflict handling
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'user_trades_user_signal_unique'
    ) THEN
        ALTER TABLE public.user_trades ADD CONSTRAINT user_trades_user_signal_unique UNIQUE (user_id, signal_id);
    END IF;
END $$;