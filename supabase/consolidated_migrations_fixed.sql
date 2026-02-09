-- ============================================
-- Start of 20260126170402_e2b64d7b-708c-45e6-b242-fb18b41f731a.sql
-- ============================================
-- Create app_role enum for user roles
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

-- Create profiles table for user data
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  email TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  phone TEXT,
  username TEXT UNIQUE,
  account_balance DECIMAL(15,2),
  balance_set_at TIMESTAMPTZ,
  custom_risk_percent DECIMAL(4,2),
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create user_roles table for role management
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL DEFAULT 'user',
  UNIQUE (user_id, role)
);

-- Create subscriptions table
CREATE TABLE public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  status TEXT NOT NULL DEFAULT 'inactive' CHECK (status IN ('active', 'inactive', 'expired', 'pending')),
  starts_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create payments table
CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  amount DECIMAL(15,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USDT',
  tx_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rejected')),
  verified_by UUID REFERENCES auth.users(id),
  verified_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create signals table
CREATE TABLE public.signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pair TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('Forex', 'Metals', 'Crypto', 'Indices', 'Commodities')),
  direction TEXT NOT NULL CHECK (direction IN ('BUY', 'SELL')),
  entry_price DECIMAL(20,8) NOT NULL,
  stop_loss DECIMAL(20,8) NOT NULL,
  take_profit DECIMAL(20,8) NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed', 'tp_hit', 'sl_hit', 'upcoming', 'cancelled')),
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create user_trades table to track individual user trades based on signals
CREATE TABLE public.user_trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  signal_id UUID REFERENCES public.signals(id) ON DELETE CASCADE NOT NULL,
  risk_percent DECIMAL(4,2) NOT NULL,
  risk_amount DECIMAL(15,2) NOT NULL,
  pnl DECIMAL(15,2),
  result TEXT CHECK (result IN ('win', 'loss', 'pending')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  UNIQUE (user_id, signal_id)
);

-- Create favorites table
CREATE TABLE public.favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  pair TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, pair)
);

-- Create global_settings table (single row for app settings)
CREATE TABLE public.global_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  global_risk_percent DECIMAL(4,2) NOT NULL DEFAULT 2.00,
  subscription_price DECIMAL(15,2) NOT NULL DEFAULT 50.00,
  wallet_address TEXT NOT NULL DEFAULT 'TNYhMKhLQWz6d5oX7Kqj7sdUo8vNcRYuPE',
  brand_name TEXT NOT NULL DEFAULT 'TradingSignal',
  logo_url TEXT,
  support_email TEXT DEFAULT 'support@tradingsignal.com',
  support_phone TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create discounts table
CREATE TABLE public.discounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('percentage', 'fixed')),
  value DECIMAL(15,2) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  expires_at TIMESTAMPTZ,
  max_uses INTEGER,
  current_uses INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create legal_pages table for Terms, Privacy, etc.
CREATE TABLE public.legal_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Insert default global settings
INSERT INTO public.global_settings (global_risk_percent, subscription_price, wallet_address, brand_name)
VALUES (2.00, 50.00, 'TNYhMKhLQWz6d5oX7Kqj7sdUo8vNcRYuPE', 'TradingSignal');

-- Insert default legal pages
INSERT INTO public.legal_pages (slug, title, content) VALUES
('privacy-policy', 'Privacy Policy', 'This Privacy Policy describes how we collect, use, and protect your personal information when you use our trading signal service. We are committed to protecting your privacy and ensuring the security of your data.'),
('terms-of-service', 'Terms of Service', 'By using our trading signal service, you agree to these Terms of Service. Please read them carefully before using our platform. All trading involves risk, and past performance is not indicative of future results.'),
('user-agreement', 'User Agreement', 'This User Agreement governs your use of our trading signal platform. By creating an account, you acknowledge that you understand the risks involved in trading and agree to use our signals responsibly.');

-- Enable Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.global_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_pages ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check user roles
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

-- Create function to check if user has active subscription
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

-- RLS Policies for profiles
CREATE POLICY "Users can view their own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all profiles" ON public.profiles
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update all profiles" ON public.profiles
  FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete profiles" ON public.profiles
  FOR DELETE USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for user_roles
CREATE POLICY "Users can view their own roles" ON public.user_roles
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all roles" ON public.user_roles
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for subscriptions
CREATE POLICY "Users can view their own subscription" ON public.subscriptions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all subscriptions" ON public.subscriptions
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for payments
CREATE POLICY "Users can view their own payments" ON public.payments
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own payments" ON public.payments
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can manage all payments" ON public.payments
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for signals (only active subscribers or admins can view)
CREATE POLICY "Active subscribers can view signals" ON public.signals
  FOR SELECT USING (
    public.has_role(auth.uid(), 'admin') OR 
    public.has_active_subscription(auth.uid())
  );

CREATE POLICY "Admins can manage signals" ON public.signals
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for user_trades
CREATE POLICY "Users can view their own trades" ON public.user_trades
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own trades" ON public.user_trades
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all trades" ON public.user_trades
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for favorites
CREATE POLICY "Users can manage their own favorites" ON public.favorites
  FOR ALL USING (auth.uid() = user_id);

-- RLS Policies for global_settings (readable by all authenticated, writable by admin)
CREATE POLICY "Authenticated users can view global settings" ON public.global_settings
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can update global settings" ON public.global_settings
  FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for discounts
CREATE POLICY "Authenticated users can view active discounts" ON public.discounts
  FOR SELECT TO authenticated USING (is_active = true);

CREATE POLICY "Admins can manage discounts" ON public.discounts
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for legal_pages (public read, admin write)
CREATE POLICY "Anyone can view legal pages" ON public.legal_pages
  FOR SELECT USING (true);

CREATE POLICY "Admins can manage legal pages" ON public.legal_pages
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Create trigger function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Add triggers for updated_at
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_signals_updated_at BEFORE UPDATE ON public.signals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_global_settings_updated_at BEFORE UPDATE ON public.global_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_legal_pages_updated_at BEFORE UPDATE ON public.legal_pages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to auto-create profile on signup
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

-- Create trigger to run on new user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Enable realtime for signals table
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.signals;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.global_settings;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;
-- ============================================
-- End of 20260126170402_e2b64d7b-708c-45e6-b242-fb18b41f731a.sql
-- ============================================

-- ============================================
-- Start of 20260126181731_4e7434a9-696e-4b01-b41b-8564ece345b5.sql
-- ============================================
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
-- ============================================
-- End of 20260126181731_4e7434a9-696e-4b01-b41b-8564ece345b5.sql
-- ============================================

-- ============================================
-- Start of 20260126210351_3c73728c-542c-442c-a410-09d62a27fe87.sql
-- ============================================
-- Update the create_trades_for_signal function to exclude admins
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
-- ============================================
-- End of 20260126210351_3c73728c-542c-442c-a410-09d62a27fe87.sql
-- ============================================

-- ============================================
-- Start of 20260126211506_5979663e-e1a6-4793-9947-6eef572640a9.sql
-- ============================================
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.signals;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_trades;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.subscriptions;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;
-- ============================================
-- End of 20260126211506_5979663e-e1a6-4793-9947-6eef572640a9.sql
-- ============================================

-- ============================================
-- Start of 20260126230951_7d156938-4987-41a5-8793-a1f1c17513be.sql
-- ============================================
-- Add signal_type column to distinguish between active signals and upcoming trades
ALTER TABLE public.signals 
ADD COLUMN IF NOT EXISTS signal_type text NOT NULL DEFAULT 'signal';

-- Add upcoming_status for upcoming trades (waiting, near_entry, preparing)
ALTER TABLE public.signals 
ADD COLUMN IF NOT EXISTS upcoming_status text;

-- Make entry_price, stop_loss, take_profit nullable for upcoming signals
ALTER TABLE public.signals 
ALTER COLUMN entry_price DROP NOT NULL;

ALTER TABLE public.signals 
ALTER COLUMN stop_loss DROP NOT NULL;

ALTER TABLE public.signals 
ALTER COLUMN take_profit DROP NOT NULL;

-- Update the create_trades_for_signal trigger to only work for 'signal' type
CREATE OR REPLACE FUNCTION public.create_trades_for_signal()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  user_record RECORD;
  risk_pct DECIMAL;
  global_risk DECIMAL;
  risk_amt DECIMAL;
BEGIN
  -- Only create trades for 'signal' type, not 'upcoming'
  IF NEW.signal_type != 'signal' THEN
    RETURN NEW;
  END IF;

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
$function$;

-- Force PostgREST schema cache refresh
NOTIFY pgrst, 'reload schema';
-- ============================================
-- End of 20260126230951_7d156938-4987-41a5-8793-a1f1c17513be.sql
-- ============================================

-- ============================================
-- Start of 20260126232841_8855bbe4-3ead-46f2-b399-99055b7589df.sql
-- ============================================
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

-- ============================================
-- End of 20260126232841_8855bbe4-3ead-46f2-b399-99055b7589df.sql
-- ============================================

-- ============================================
-- Start of 20260127000616_a7c17769-a707-4284-9139-bc5971bbba55.sql
-- ============================================
-- Add explicit policies to deny anonymous access to sensitive tables

-- Profiles table: Deny anonymous (unauthenticated) access
-- This ensures that when auth.uid() is null, no rows are accessible
CREATE POLICY "Deny anonymous access to profiles"
ON public.profiles
FOR SELECT
TO anon
USING (false);

CREATE POLICY "Deny anonymous insert to profiles"
ON public.profiles
FOR INSERT
TO anon
WITH CHECK (false);

CREATE POLICY "Deny anonymous update to profiles"
ON public.profiles
FOR UPDATE
TO anon
USING (false);

CREATE POLICY "Deny anonymous delete to profiles"
ON public.profiles
FOR DELETE
TO anon
USING (false);

-- Payments table: Deny anonymous (unauthenticated) access
CREATE POLICY "Deny anonymous access to payments"
ON public.payments
FOR SELECT
TO anon
USING (false);

CREATE POLICY "Deny anonymous insert to payments"
ON public.payments
FOR INSERT
TO anon
WITH CHECK (false);

CREATE POLICY "Deny anonymous update to payments"
ON public.payments
FOR UPDATE
TO anon
USING (false);

CREATE POLICY "Deny anonymous delete to payments"
ON public.payments
FOR DELETE
TO anon
USING (false);
-- ============================================
-- End of 20260127000616_a7c17769-a707-4284-9139-bc5971bbba55.sql
-- ============================================

-- ============================================
-- Start of 20260127092448_f17a1539-e761-48bd-87ec-b365e4a1c053.sql
-- ============================================
-- Add 'breakeven' as a valid signal status
-- First, drop the existing check constraint
ALTER TABLE public.signals DROP CONSTRAINT IF EXISTS signals_status_check;

-- Add the new check constraint with 'breakeven' included
ALTER TABLE public.signals ADD CONSTRAINT signals_status_check 
  CHECK (status IN ('active', 'closed', 'tp_hit', 'sl_hit', 'upcoming', 'cancelled', 'breakeven'));
-- ============================================
-- End of 20260127092448_f17a1539-e761-48bd-87ec-b365e4a1c053.sql
-- ============================================

-- ============================================
-- Start of 20260127121252_3666965d-5c4f-461c-9e25-6e0e988e8059.sql
-- ============================================
-- Update the close_trades_for_signal trigger to handle breakeven status
CREATE OR REPLACE FUNCTION public.close_trades_for_signal()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  trade_record RECORD;
  pnl_amount DECIMAL;
  rr_ratio DECIMAL;
BEGIN
  -- Only process if status changed to tp_hit, sl_hit, or breakeven from active
  IF NEW.status IN ('tp_hit', 'sl_hit', 'breakeven') AND OLD.status = 'active' THEN
    
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
      ELSIF NEW.status = 'breakeven' THEN
        -- Breakeven trades have 0 P&L - no change to account balance
        pnl_amount := 0;
        UPDATE user_trades SET result = 'breakeven', pnl = pnl_amount, closed_at = now() WHERE id = trade_record.id;
        -- No balance update needed for breakeven
      ELSE -- sl_hit
        pnl_amount := -trade_record.risk_amount;
        UPDATE user_trades SET result = 'loss', pnl = pnl_amount, closed_at = now() WHERE id = trade_record.id;
        UPDATE profiles SET account_balance = account_balance + pnl_amount, updated_at = now() WHERE user_id = trade_record.user_id;
      END IF;
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$function$;
-- ============================================
-- End of 20260127121252_3666965d-5c4f-461c-9e25-6e0e988e8059.sql
-- ============================================

-- ============================================
-- Start of 20260127121614_48cdd9ec-1f30-464e-ac93-48030f264af5.sql
-- ============================================
-- Update the user_trades result check constraint to include 'breakeven'
ALTER TABLE public.user_trades DROP CONSTRAINT IF EXISTS user_trades_result_check;

ALTER TABLE public.user_trades ADD CONSTRAINT user_trades_result_check 
  CHECK (result IN ('win', 'loss', 'pending', 'breakeven'));
-- ============================================
-- End of 20260127121614_48cdd9ec-1f30-464e-ac93-48030f264af5.sql
-- ============================================

-- ============================================
-- Start of 20260128170532_1af4885a-0b71-4381-a432-260c4539a237.sql
-- ============================================
-- Update handle_new_user to save first_name, last_name, and phone from user metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
$function$;
-- ============================================
-- End of 20260128170532_1af4885a-0b71-4381-a432-260c4539a237.sql
-- ============================================

-- ============================================
-- Start of 20260129014341_48d51468-2e51-4c9e-b12f-612eb76a6ace.sql
-- ============================================
-- Create new admin role enum type
CREATE TYPE public.admin_role AS ENUM ('super_admin', 'payments_admin', 'signal_provider_admin');

-- Create admin_roles table for tracking specific admin permissions
CREATE TABLE public.admin_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  admin_role admin_role NOT NULL DEFAULT 'payments_admin',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  last_login timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create audit logs table for tracking admin role changes
CREATE TABLE public.admin_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  performed_by uuid NOT NULL,
  target_user_id uuid NOT NULL,
  action text NOT NULL,
  old_value jsonb,
  new_value jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on admin_roles
ALTER TABLE public.admin_roles ENABLE ROW LEVEL SECURITY;

-- Enable RLS on admin_audit_logs
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check admin role
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

-- Create function to check if user is super admin
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

-- Create function to check if user has any admin role
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

-- Create function to count super admins
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

-- RLS policies for admin_roles - only super admins can manage
CREATE POLICY "Super admins can view all admin roles"
ON public.admin_roles FOR SELECT
USING (is_super_admin(auth.uid()));

CREATE POLICY "Super admins can insert admin roles"
ON public.admin_roles FOR INSERT
WITH CHECK (is_super_admin(auth.uid()));

CREATE POLICY "Super admins can update admin roles"
ON public.admin_roles FOR UPDATE
USING (is_super_admin(auth.uid()));

CREATE POLICY "Super admins can delete admin roles"
ON public.admin_roles FOR DELETE
USING (is_super_admin(auth.uid()));

-- Admins can view their own role
CREATE POLICY "Admins can view own role"
ON public.admin_roles FOR SELECT
USING (auth.uid() = user_id);

-- RLS policies for audit logs - only super admins can view
CREATE POLICY "Super admins can view audit logs"
ON public.admin_audit_logs FOR SELECT
USING (is_super_admin(auth.uid()));

CREATE POLICY "Super admins can insert audit logs"
ON public.admin_audit_logs FOR INSERT
WITH CHECK (is_super_admin(auth.uid()));

-- Add trigger for updated_at on admin_roles
CREATE TRIGGER update_admin_roles_updated_at
BEFORE UPDATE ON public.admin_roles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
-- ============================================
-- End of 20260129014341_48d51468-2e51-4c9e-b12f-612eb76a6ace.sql
-- ============================================

-- ============================================
-- Start of 20260129021724_9e96fcf9-3b7e-457e-aeb7-724d09439e5a.sql
-- ============================================
-- Add timezone column to global_settings
ALTER TABLE public.global_settings 
ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'UTC';

-- Update admin_roles RLS to allow users to update their own last_login
CREATE POLICY "Admins can update their own last_login"
ON public.admin_roles FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
-- ============================================
-- End of 20260129021724_9e96fcf9-3b7e-457e-aeb7-724d09439e5a.sql
-- ============================================

-- ============================================
-- Start of 20260129041838_9bdca66c-e008-4298-989a-0d40fdc4637d.sql
-- ============================================
-- Enable realtime for payments table
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.payments;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;
-- ============================================
-- End of 20260129041838_9bdca66c-e008-4298-989a-0d40fdc4637d.sql
-- ============================================

-- ============================================
-- Start of 20260131011312_049ee5b7-c34c-44e7-962a-aad80ad962cf.sql
-- ============================================
-- Add new branding columns to global_settings
ALTER TABLE public.global_settings 
ADD COLUMN IF NOT EXISTS social_facebook text,
ADD COLUMN IF NOT EXISTS social_twitter text,
ADD COLUMN IF NOT EXISTS social_instagram text,
ADD COLUMN IF NOT EXISTS social_telegram text,
ADD COLUMN IF NOT EXISTS social_discord text,
ADD COLUMN IF NOT EXISTS copyright_name text DEFAULT 'TradingSignal',
ADD COLUMN IF NOT EXISTS disclaimer_text text DEFAULT 'Trading involves substantial risk and is not suitable for every investor. Past performance is not indicative of future results.';
-- ============================================
-- End of 20260131011312_049ee5b7-c34c-44e7-962a-aad80ad962cf.sql
-- ============================================

-- ============================================
-- Start of 20260131022327_adda3aa0-0ca8-45ba-9e35-aedfa8420953.sql
-- ============================================
-- Create storage bucket for brand assets
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('brand-assets', 'brand-assets', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml', 'image/gif'])
ON CONFLICT (id) DO NOTHING;

-- Allow anyone to view brand assets (public bucket)
CREATE POLICY "Anyone can view brand assets"
ON storage.objects FOR SELECT
USING (bucket_id = 'brand-assets');

-- Only super admins can upload/update brand assets  
CREATE POLICY "Super admins can upload brand assets"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'brand-assets' AND is_super_admin(auth.uid()));

CREATE POLICY "Super admins can update brand assets"
ON storage.objects FOR UPDATE
USING (bucket_id = 'brand-assets' AND is_super_admin(auth.uid()));

CREATE POLICY "Super admins can delete brand assets"
ON storage.objects FOR DELETE
USING (bucket_id = 'brand-assets' AND is_super_admin(auth.uid()));
-- ============================================
-- End of 20260131022327_adda3aa0-0ca8-45ba-9e35-aedfa8420953.sql
-- ============================================

-- ============================================
-- Start of 20260131170128_15b41f00-6a89-403d-937e-2e6cfce929d1.sql
-- ============================================
-- Set FULL replica identity on signals table so realtime UPDATE events include all old values
ALTER TABLE public.signals REPLICA IDENTITY FULL;
-- ============================================
-- End of 20260131170128_15b41f00-6a89-403d-937e-2e6cfce929d1.sql
-- ============================================

-- ============================================
-- Start of 20260201205949_8a516829-3211-488e-90b3-9f38b9fb14b9.sql
-- ============================================
-- Drop the existing restrictive SELECT policy
DROP POLICY IF EXISTS "Authenticated users can view global settings" ON public.global_settings;

-- Create a PERMISSIVE policy that allows anyone (including anonymous/unauthenticated users) to read global settings
CREATE POLICY "Anyone can view global settings"
ON public.global_settings
FOR SELECT
TO public
USING (true);
-- ============================================
-- End of 20260201205949_8a516829-3211-488e-90b3-9f38b9fb14b9.sql
-- ============================================

-- ============================================
-- Start of 20260201214913_b9a06abb-c91c-49e1-9117-5d3799dfd151.sql
-- ============================================
-- Create trigger function to create profile on signup
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

-- Create trigger on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
-- ============================================
-- End of 20260201214913_b9a06abb-c91c-49e1-9117-5d3799dfd151.sql
-- ============================================

-- ============================================
-- Start of 20260201215616_91e91d52-8296-4636-9f1e-ca12fbe10c87.sql
-- ============================================
-- Enable realtime for critical tables so UI updates automatically
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.global_settings;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.payments;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.subscriptions;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_roles;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;
-- ============================================
-- End of 20260201215616_91e91d52-8296-4636-9f1e-ca12fbe10c87.sql
-- ============================================

-- ============================================
-- Start of 20260201220412_dc96f587-666a-48e5-b137-f4dac6e15edd.sql
-- ============================================
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
-- ============================================
-- End of 20260201220412_dc96f587-666a-48e5-b137-f4dac6e15edd.sql
-- ============================================

-- ============================================
-- Start of 20260201224230_2f81d79b-950b-4ebb-a953-66d1a826f795.sql
-- ============================================
-- Enable realtime for critical tables so UI updates automatically
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.global_settings;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.payments;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.subscriptions;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_roles;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.signals;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;
-- ============================================
-- End of 20260201224230_2f81d79b-950b-4ebb-a953-66d1a826f795.sql
-- ============================================

-- ============================================
-- Start of 20260201224834_d2812e6c-50a5-4d3c-b1e7-cc45dc2e820e.sql
-- ============================================
-- Create trigger for new user handling
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create trigger for signal status changes (auto-close trades)
CREATE OR REPLACE TRIGGER on_signal_status_change
  AFTER UPDATE ON public.signals
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.close_trades_for_signal();

-- Create trigger for new signals (auto-create trades for subscribers)
CREATE OR REPLACE TRIGGER on_signal_created
  AFTER INSERT ON public.signals
  FOR EACH ROW EXECUTE FUNCTION public.create_trades_for_signal();

-- Create triggers for updated_at columns
CREATE OR REPLACE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE TRIGGER update_signals_updated_at
  BEFORE UPDATE ON public.signals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE TRIGGER update_subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE TRIGGER update_admin_roles_updated_at
  BEFORE UPDATE ON public.admin_roles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE TRIGGER update_global_settings_updated_at
  BEFORE UPDATE ON public.global_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE TRIGGER update_legal_pages_updated_at
  BEFORE UPDATE ON public.legal_pages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default global settings
INSERT INTO public.global_settings (brand_name, wallet_address, global_risk_percent, subscription_price, timezone)
SELECT 'TradingSignal', 'TNYhMKhLQWz6d5oX7Kqj7sdUo8vNcRYuPE', 2.00, 50.00, 'UTC'
WHERE NOT EXISTS (SELECT 1 FROM public.global_settings);

-- Create profile for existing user (moutsimbillah@gmail.com)
INSERT INTO public.profiles (user_id, email)
VALUES ('564440d5-5460-43e7-a86a-aae6ef9e142e', 'moutsimbillah@gmail.com')
ON CONFLICT (user_id) DO NOTHING;

-- Create user role
INSERT INTO public.user_roles (user_id, role)
VALUES ('564440d5-5460-43e7-a86a-aae6ef9e142e', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;

-- Create super_admin role
INSERT INTO public.admin_roles (user_id, admin_role, status)
VALUES ('564440d5-5460-43e7-a86a-aae6ef9e142e', 'super_admin', 'active')
ON CONFLICT (user_id) DO NOTHING;

-- Create subscription (inactive by default)
INSERT INTO public.subscriptions (user_id, status)
SELECT '564440d5-5460-43e7-a86a-aae6ef9e142e', 'inactive'
WHERE NOT EXISTS (
    SELECT 1 FROM public.subscriptions 
    WHERE user_id = '564440d5-5460-43e7-a86a-aae6ef9e142e'
);
-- ============================================
-- End of 20260201224834_d2812e6c-50a5-4d3c-b1e7-cc45dc2e820e.sql
-- ============================================

-- ============================================
-- Start of 20260201225516_7ffb6e1d-e86d-4b30-9321-94989bbee70b.sql
-- ============================================
-- Enable REPLICA IDENTITY FULL on signals table so UPDATE events include old row data
ALTER TABLE public.signals REPLICA IDENTITY FULL;
-- ============================================
-- End of 20260201225516_7ffb6e1d-e86d-4b30-9321-94989bbee70b.sql
-- ============================================

-- ============================================
-- Start of 20260201233633_c1b51881-9896-4130-a57c-0d3d2eb706cd.sql
-- ============================================
-- Enable realtime for critical tables so UI updates automatically
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.global_settings;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.payments;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.subscriptions;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_roles;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.signals;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_roles;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;
-- ============================================
-- End of 20260201233633_c1b51881-9896-4130-a57c-0d3d2eb706cd.sql
-- ============================================

-- ============================================
-- Start of 20260201233958_6b250112-c615-4d81-b289-b346424206fd.sql
-- ============================================
-- 1. Create trigger for new user signup (creates profile, role, subscription)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 2. Create trigger for signals to auto-create trades
DROP TRIGGER IF EXISTS on_signal_created ON public.signals;
CREATE TRIGGER on_signal_created
  AFTER INSERT ON public.signals
  FOR EACH ROW EXECUTE FUNCTION public.create_trades_for_signal();

-- 3. Create trigger to close trades when signal status changes
DROP TRIGGER IF EXISTS on_signal_closed ON public.signals;
CREATE TRIGGER on_signal_closed
  AFTER UPDATE ON public.signals
  FOR EACH ROW EXECUTE FUNCTION public.close_trades_for_signal();

-- 4. Create updated_at triggers for tables that need them
DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_signals_updated_at ON public.signals;
CREATE TRIGGER update_signals_updated_at
  BEFORE UPDATE ON public.signals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_subscriptions_updated_at ON public.subscriptions;
CREATE TRIGGER update_subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_admin_roles_updated_at ON public.admin_roles;
CREATE TRIGGER update_admin_roles_updated_at
  BEFORE UPDATE ON public.admin_roles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_global_settings_updated_at ON public.global_settings;
CREATE TRIGGER update_global_settings_updated_at
  BEFORE UPDATE ON public.global_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_legal_pages_updated_at ON public.legal_pages;
CREATE TRIGGER update_legal_pages_updated_at
  BEFORE UPDATE ON public.legal_pages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. Update global_settings defaults to use "nomeriq"
ALTER TABLE public.global_settings 
  ALTER COLUMN brand_name SET DEFAULT 'nomeriq',
  ALTER COLUMN copyright_name SET DEFAULT 'nomeriq',
  ALTER COLUMN support_email SET DEFAULT 'support@nomeriq.com';

-- 6. Update existing global_settings row to use "nomeriq"
UPDATE public.global_settings SET 
  brand_name = 'nomeriq',
  copyright_name = 'nomeriq',
  support_email = 'support@nomeriq.com',
  updated_at = now();

-- 7. Create profile for admin user (moutsimbillah@gmail.com)
INSERT INTO public.profiles (user_id, email)
VALUES ('5a9d1ed2-55a4-47dc-8da1-cd46fa91ead1', 'moutsimbillah@gmail.com')
ON CONFLICT (user_id) DO NOTHING;

-- 8. Add admin role in user_roles table
INSERT INTO public.user_roles (user_id, role)
VALUES ('5a9d1ed2-55a4-47dc-8da1-cd46fa91ead1', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;

-- 9. Add super_admin role in admin_roles table
INSERT INTO public.admin_roles (user_id, admin_role, status)
VALUES ('5a9d1ed2-55a4-47dc-8da1-cd46fa91ead1', 'super_admin', 'active')
ON CONFLICT (user_id) DO NOTHING;

-- 10. Create subscription for admin user
INSERT INTO public.subscriptions (user_id, status, starts_at, expires_at)
SELECT '5a9d1ed2-55a4-47dc-8da1-cd46fa91ead1', 'active', now(), now() + interval '100 years'
WHERE NOT EXISTS (
    SELECT 1 FROM public.subscriptions 
    WHERE user_id = '5a9d1ed2-55a4-47dc-8da1-cd46fa91ead1'
);
-- ============================================
-- End of 20260201233958_6b250112-c615-4d81-b289-b346424206fd.sql
-- ============================================

-- ============================================
-- Start of 20260202180800_431112bb-5e50-48ff-ac31-5cfbb7f530cd.sql
-- ============================================
-- Add dark mode logo URL column to global_settings
ALTER TABLE public.global_settings
ADD COLUMN logo_url_dark text;
-- ============================================
-- End of 20260202180800_431112bb-5e50-48ff-ac31-5cfbb7f530cd.sql
-- ============================================

-- ============================================
-- Start of 20260203212914_c85b7c79-306c-4050-80ed-ccd22a6907da.sql
-- ============================================
-- Create password reset tokens table for OTP-based reset
CREATE TABLE public.password_reset_tokens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,
  code TEXT NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  used BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for faster lookups
CREATE INDEX idx_password_reset_tokens_email ON public.password_reset_tokens(email);
CREATE INDEX idx_password_reset_tokens_code ON public.password_reset_tokens(code);

-- Enable RLS
ALTER TABLE public.password_reset_tokens ENABLE ROW LEVEL SECURITY;

-- No RLS policies needed - this table is only accessed via service role in edge functions

-- Auto-cleanup old tokens (optional - can be done via cron job)
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
-- ============================================
-- End of 20260203212914_c85b7c79-306c-4050-80ed-ccd22a6907da.sql
-- ============================================

-- ============================================
-- Start of 20260205211114_37414fc0-975c-42f0-a326-1a20755f4121.sql
-- ============================================
-- Fix 1: Add a restrictive SELECT policy to profiles table that requires authentication
-- This ensures anonymous/public users cannot access sensitive user data

-- First, let's add a policy that explicitly denies access to unauthenticated users
-- The existing policies only use RESTRICTIVE, so we need a PERMISSIVE base policy that requires auth
-- We'll drop the existing SELECT policies and recreate them properly

-- Drop existing user self-view policy and recreate with proper base restriction
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;

-- Create a new permissive policy that requires authentication first, then allows users to view their own profile
CREATE POLICY "Users can view their own profile" 
ON public.profiles 
FOR SELECT 
TO authenticated
USING (auth.uid() = user_id);

-- Note: The existing "Admins can view all profiles" policy is already restrictive and uses has_role()
-- We need to ensure it also requires authentication
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;

CREATE POLICY "Admins can view all profiles" 
ON public.profiles 
FOR SELECT 
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Fix 2: Secure the password_reset_tokens table
-- The current "Service role can manage reset tokens" policy uses USING (true) which is too permissive
-- This table should only be accessible via service role from edge functions

-- Drop the existing overly permissive policy
DROP POLICY IF EXISTS "Service role can manage reset tokens" ON public.password_reset_tokens;

-- Since password_reset_tokens are only managed by edge functions using the service role key,
-- and the service role bypasses RLS anyway, we should have NO public-accessible policies.
-- This means the table is effectively locked down to service role only (which bypasses RLS).
-- For extra security, we add a policy that explicitly denies all access to non-service roles.

-- Deny all access to regular users (service role bypasses RLS)
CREATE POLICY "Deny all public access to password reset tokens"
ON public.password_reset_tokens
FOR ALL
TO public, authenticated, anon
USING (false)
WITH CHECK (false);
-- ============================================
-- End of 20260205211114_37414fc0-975c-42f0-a326-1a20755f4121.sql
-- ============================================

-- ============================================
-- Start of 20260205212018_6ce37bfa-b08a-4d01-bc4d-c69c24aa7ecd.sql
-- ============================================
-- Fix: Add explicit deny policy to auth_rate_limits table
-- This table should only be accessible via service role from edge functions

-- Create deny policy for auth_rate_limits - blocks all public access
CREATE POLICY "Deny all public access to auth rate limits"
ON public.auth_rate_limits
FOR ALL
TO public, authenticated, anon
USING (false)
WITH CHECK (false);
-- ============================================
-- End of 20260205212018_6ce37bfa-b08a-4d01-bc4d-c69c24aa7ecd.sql
-- ============================================

-- ============================================
-- Start of 20260206020036_c609e21e-e273-4a9d-b7e3-687b353a8d8b.sql
-- ============================================
-- Add analysis fields to signals table
ALTER TABLE public.signals
ADD COLUMN analysis_video_url TEXT,
ADD COLUMN analysis_notes TEXT,
ADD COLUMN analysis_image_url TEXT;
-- ============================================
-- End of 20260206020036_c609e21e-e273-4a9d-b7e3-687b353a8d8b.sql
-- ============================================

-- ============================================
-- Start of 20260206020141_67d63910-525f-4576-90f5-efabb03fdacf.sql
-- ============================================
-- Create storage bucket for signal analysis images
INSERT INTO storage.buckets (id, name, public)
VALUES ('signal-analysis', 'signal-analysis', true)
ON CONFLICT (id) DO NOTHING;

-- Allow admins to upload analysis images
CREATE POLICY "Admins can upload analysis images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'signal-analysis' 
  AND has_role(auth.uid(), 'admin'::app_role)
);

-- Allow admins to update analysis images
CREATE POLICY "Admins can update analysis images"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'signal-analysis' 
  AND has_role(auth.uid(), 'admin'::app_role)
);

-- Allow admins to delete analysis images
CREATE POLICY "Admins can delete analysis images"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'signal-analysis' 
  AND has_role(auth.uid(), 'admin'::app_role)
);

-- Allow anyone with subscription to view analysis images
CREATE POLICY "Subscribers can view analysis images"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'signal-analysis' 
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_active_subscription(auth.uid()))
);
-- ============================================
-- End of 20260206020141_67d63910-525f-4576-90f5-efabb03fdacf.sql
-- ============================================

-- ============================================
-- Start of 20260206041432_854e09f9-23d3-4d2e-824f-c5f62a839411.sql
-- ============================================
-- Create table for storing provider Telegram settings
CREATE TABLE public.provider_telegram_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  bot_token TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.provider_telegram_settings ENABLE ROW LEVEL SECURITY;

-- Providers can only see their own settings
CREATE POLICY "Providers can view their own telegram settings"
ON public.provider_telegram_settings
FOR SELECT
USING (auth.uid() = user_id);

-- Providers can insert their own settings
CREATE POLICY "Providers can insert their own telegram settings"
ON public.provider_telegram_settings
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Providers can update their own settings
CREATE POLICY "Providers can update their own telegram settings"
ON public.provider_telegram_settings
FOR UPDATE
USING (auth.uid() = user_id);

-- Providers can delete their own settings
CREATE POLICY "Providers can delete their own telegram settings"
ON public.provider_telegram_settings
FOR DELETE
USING (auth.uid() = user_id);

-- Add trigger for updated_at
CREATE TRIGGER update_provider_telegram_settings_updated_at
BEFORE UPDATE ON public.provider_telegram_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
-- ============================================
-- End of 20260206041432_854e09f9-23d3-4d2e-824f-c5f62a839411.sql
-- ============================================

