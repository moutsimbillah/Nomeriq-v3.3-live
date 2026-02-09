-- From 20260126170402_e2b64d7b-708c-45e6-b242-fb18b41f731a.sql
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- From 20260126170402_e2b64d7b-708c-45e6-b242-fb18b41f731a.sql
CREATE OR REPLACE FUNCTION public.has_active_subscription(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.subscriptions
    WHERE user_id = _user_id 
    AND status = 'active'
    AND (expires_at IS NULL OR expires_at > now())
  )
$$;

-- From 20260126170402_e2b64d7b-708c-45e6-b242-fb18b41f731a.sql
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- From 20260126170402_e2b64d7b-708c-45e6-b242-fb18b41f731a.sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email)
  VALUES (NEW.id, NEW.email);
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user');
  
  INSERT INTO public.subscriptions (user_id, status)
  VALUES (NEW.id, 'inactive');
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- From 20260126170402_e2b64d7b-708c-45e6-b242-fb18b41f731a.sql
DROP TRIGGER IF EXISTS update_subscriptions_updated_at ON public.subscriptions;
CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- From 20260126170402_e2b64d7b-708c-45e6-b242-fb18b41f731a.sql
DROP TRIGGER IF EXISTS update_signals_updated_at ON public.signals;
CREATE TRIGGER update_signals_updated_at BEFORE UPDATE ON public.signals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- From 20260126170402_e2b64d7b-708c-45e6-b242-fb18b41f731a.sql
DROP TRIGGER IF EXISTS update_global_settings_updated_at ON public.global_settings;
CREATE TRIGGER update_global_settings_updated_at BEFORE UPDATE ON public.global_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- From 20260126170402_e2b64d7b-708c-45e6-b242-fb18b41f731a.sql
DROP TRIGGER IF EXISTS update_legal_pages_updated_at ON public.legal_pages;
CREATE TRIGGER update_legal_pages_updated_at BEFORE UPDATE ON public.legal_pages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- From 20260126181731_4e7434a9-696e-4b01-b41b-8564ece345b5.sql
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

-- From 20260126181731_4e7434a9-696e-4b01-b41b-8564ece345b5.sql
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

-- From 20260126210351_3c73728c-542c-442c-a410-09d62a27fe87.sql
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
  -- EXCLUDE admins from receiving trade signals
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

-- From 20260126232841_8855bbe4-3ead-46f2-b399-99055b7589df.sql
DROP TRIGGER IF EXISTS create_trades_on_signal_insert ON public.signals;
CREATE TRIGGER create_trades_on_signal_insert
AFTER INSERT ON public.signals
FOR EACH ROW
EXECUTE FUNCTION public.create_trades_for_signal();

-- From 20260126232841_8855bbe4-3ead-46f2-b399-99055b7589df.sql
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

-- From 20260129014341_48d51468-2e51-4c9e-b12f-612eb76a6ace.sql
CREATE OR REPLACE FUNCTION public.has_admin_role(_user_id uuid, _admin_role admin_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_roles
    WHERE user_id = _user_id 
    AND admin_role = _admin_role
    AND status = 'active'
  )
$$;

-- From 20260129014341_48d51468-2e51-4c9e-b12f-612eb76a6ace.sql
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_roles
    WHERE user_id = _user_id 
    AND admin_role = 'super_admin'
    AND status = 'active'
  )
$$;

-- From 20260129014341_48d51468-2e51-4c9e-b12f-612eb76a6ace.sql
CREATE OR REPLACE FUNCTION public.is_any_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_roles
    WHERE user_id = _user_id 
    AND status = 'active'
  )
$$;

-- From 20260129014341_48d51468-2e51-4c9e-b12f-612eb76a6ace.sql
CREATE OR REPLACE FUNCTION public.count_super_admins()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::integer FROM public.admin_roles
  WHERE admin_role = 'super_admin' AND status = 'active'
$$;

-- From 20260129014341_48d51468-2e51-4c9e-b12f-612eb76a6ace.sql
DROP TRIGGER IF EXISTS update_admin_roles_updated_at ON public.admin_roles;
CREATE TRIGGER update_admin_roles_updated_at
BEFORE UPDATE ON public.admin_roles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- From 20260201214913_b9a06abb-c91c-49e1-9117-5d3799dfd151.sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, first_name, last_name, phone)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'last_name',
    NEW.raw_user_meta_data->>'phone'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- From 20260201220412_dc96f587-666a-48e5-b137-f4dac6e15edd.sql
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

-- From 20260201220412_dc96f587-666a-48e5-b137-f4dac6e15edd.sql
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

-- From 20260201220412_dc96f587-666a-48e5-b137-f4dac6e15edd.sql
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

-- From 20260201220412_dc96f587-666a-48e5-b137-f4dac6e15edd.sql
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- From 20260201220412_dc96f587-666a-48e5-b137-f4dac6e15edd.sql
DROP TRIGGER IF EXISTS create_trades_on_signal ON public.signals;
CREATE TRIGGER create_trades_on_signal
  AFTER INSERT ON public.signals
  FOR EACH ROW
  WHEN (NEW.status = 'active')
  EXECUTE FUNCTION public.create_trades_for_signal();

-- From 20260201233958_6b250112-c615-4d81-b289-b346424206fd.sql
DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- From 20260201233958_6b250112-c615-4d81-b289-b346424206fd.sql
DROP TRIGGER IF EXISTS update_signals_updated_at ON public.signals;
CREATE TRIGGER update_signals_updated_at
  BEFORE UPDATE ON public.signals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- From 20260201233958_6b250112-c615-4d81-b289-b346424206fd.sql
DROP TRIGGER IF EXISTS update_subscriptions_updated_at ON public.subscriptions;
CREATE TRIGGER update_subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- From 20260201233958_6b250112-c615-4d81-b289-b346424206fd.sql
DROP TRIGGER IF EXISTS update_admin_roles_updated_at ON public.admin_roles;
CREATE TRIGGER update_admin_roles_updated_at
  BEFORE UPDATE ON public.admin_roles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- From 20260201233958_6b250112-c615-4d81-b289-b346424206fd.sql
DROP TRIGGER IF EXISTS update_global_settings_updated_at ON public.global_settings;
CREATE TRIGGER update_global_settings_updated_at
  BEFORE UPDATE ON public.global_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- From 20260201233958_6b250112-c615-4d81-b289-b346424206fd.sql
DROP TRIGGER IF EXISTS update_legal_pages_updated_at ON public.legal_pages;
CREATE TRIGGER update_legal_pages_updated_at
  BEFORE UPDATE ON public.legal_pages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- From 20260203212914_c85b7c79-306c-4050-80ed-ccd22a6907da.sql
CREATE OR REPLACE FUNCTION public.cleanup_expired_reset_tokens()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM public.password_reset_tokens 
  WHERE expires_at < now() OR used = true;
END;
$$;

-- From 20260206041432_854e09f9-23d3-4d2e-824f-c5f62a839411.sql
DROP TRIGGER IF EXISTS update_provider_telegram_settings_updated_at ON public.provider_telegram_settings;
CREATE TRIGGER update_provider_telegram_settings_updated_at
BEFORE UPDATE ON public.provider_telegram_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
