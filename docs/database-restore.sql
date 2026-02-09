-- ============================================================
-- CONSOLIDATED DATABASE RESTORE SCRIPT FOR REMIX
-- ============================================================
-- 
-- HOW TO USE AFTER REMIXING:
-- 1. Open your remixed project in Lovable
-- 2. Go to Cloud View → Database → Run SQL
-- 3. Copy and paste this ENTIRE script
-- 4. Click "Run" to execute
-- 5. Your database will be fully configured!
--
-- This script creates everything needed:
-- ✓ All database tables
-- ✓ Enums and types
-- ✓ Security functions
-- ✓ Triggers for automation
-- ✓ Row Level Security policies
-- ✓ Storage buckets
-- ✓ Realtime subscriptions
-- ✓ Default data
--
-- Order: Enums → Tables → Data → RLS → Functions → Triggers → Storage → Realtime
-- ============================================================

-- ============================================================
-- PART 1: ENUMS
-- ============================================================

DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'user');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.admin_role AS ENUM ('super_admin', 'payments_admin', 'signal_provider_admin');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- PART 2: CORE TABLES
-- ============================================================

-- Profiles table
CREATE TABLE IF NOT EXISTS public.profiles (
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

-- User roles table
CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL DEFAULT 'user',
  UNIQUE (user_id, role)
);

-- Subscriptions table
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'inactive' CHECK (status IN ('active', 'inactive', 'expired', 'pending')),
  starts_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Payments table
CREATE TABLE IF NOT EXISTS public.payments (
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

-- Signals table
CREATE TABLE IF NOT EXISTS public.signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pair TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('Forex', 'Metals', 'Crypto', 'Indices', 'Commodities')),
  direction TEXT NOT NULL CHECK (direction IN ('BUY', 'SELL')),
  entry_price DECIMAL(20,8),
  stop_loss DECIMAL(20,8),
  take_profit DECIMAL(20,8),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed', 'tp_hit', 'sl_hit', 'upcoming', 'cancelled', 'breakeven')),
  signal_type TEXT NOT NULL DEFAULT 'signal',
  upcoming_status TEXT,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- User trades table
CREATE TABLE IF NOT EXISTS public.user_trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  signal_id UUID REFERENCES public.signals(id) ON DELETE CASCADE NOT NULL,
  risk_percent DECIMAL(4,2) NOT NULL,
  risk_amount DECIMAL(15,2) NOT NULL,
  pnl DECIMAL(15,2),
  result TEXT CHECK (result IN ('win', 'loss', 'pending', 'breakeven')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  UNIQUE (user_id, signal_id)
);

-- Favorites table
CREATE TABLE IF NOT EXISTS public.favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  pair TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, pair)
);

-- Global settings table
CREATE TABLE IF NOT EXISTS public.global_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  global_risk_percent DECIMAL(4,2) NOT NULL DEFAULT 2.00,
  subscription_price DECIMAL(15,2) NOT NULL DEFAULT 50.00,
  wallet_address TEXT NOT NULL DEFAULT 'TNYhMKhLQWz6d5oX7Kqj7sdUo8vNcRYuPE',
  brand_name TEXT NOT NULL DEFAULT 'TradingSignal',
  logo_url TEXT,
  logo_url_dark TEXT,
  support_email TEXT DEFAULT 'support@tradingsignal.com',
  support_phone TEXT,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  social_facebook TEXT,
  social_twitter TEXT,
  social_instagram TEXT,
  social_telegram TEXT,
  social_discord TEXT,
  copyright_name TEXT DEFAULT 'TradingSignal',
  disclaimer_text TEXT DEFAULT 'Trading involves substantial risk and is not suitable for every investor. Past performance is not indicative of future results.',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Discounts table
CREATE TABLE IF NOT EXISTS public.discounts (
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

-- Legal pages table
CREATE TABLE IF NOT EXISTS public.legal_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Admin roles table
CREATE TABLE IF NOT EXISTS public.admin_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  admin_role admin_role NOT NULL DEFAULT 'payments_admin',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Admin audit logs table
CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  performed_by UUID NOT NULL,
  target_user_id UUID NOT NULL,
  action TEXT NOT NULL,
  old_value JSONB,
  new_value JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Password reset tokens table
CREATE TABLE IF NOT EXISTS public.password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  code TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- PART 3: DEFAULT DATA
-- ============================================================

INSERT INTO public.global_settings (global_risk_percent, subscription_price, wallet_address, brand_name)
SELECT 2.00, 50.00, 'TNYhMKhLQWz6d5oX7Kqj7sdUo8vNcRYuPE', 'TradingSignal'
WHERE NOT EXISTS (SELECT 1 FROM public.global_settings LIMIT 1);

INSERT INTO public.legal_pages (slug, title, content)
SELECT 'privacy-policy', 'Privacy Policy', 'This Privacy Policy describes how we collect, use, and protect your personal information.'
WHERE NOT EXISTS (SELECT 1 FROM public.legal_pages WHERE slug = 'privacy-policy');

INSERT INTO public.legal_pages (slug, title, content)
SELECT 'terms-of-service', 'Terms of Service', 'By using our trading signal service, you agree to these Terms of Service.'
WHERE NOT EXISTS (SELECT 1 FROM public.legal_pages WHERE slug = 'terms-of-service');

INSERT INTO public.legal_pages (slug, title, content)
SELECT 'user-agreement', 'User Agreement', 'This User Agreement governs your use of our trading signal platform.'
WHERE NOT EXISTS (SELECT 1 FROM public.legal_pages WHERE slug = 'user-agreement');

-- ============================================================
-- PART 4: ENABLE RLS ON ALL TABLES
-- ============================================================

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
ALTER TABLE public.admin_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.password_reset_tokens ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- PART 5: SECURITY DEFINER FUNCTIONS
-- ============================================================

-- Check user role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Check active subscription
CREATE OR REPLACE FUNCTION public.has_active_subscription(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.subscriptions
    WHERE user_id = _user_id 
    AND status = 'active'
    AND (expires_at IS NULL OR expires_at > now())
  )
$$;

-- Check admin role
CREATE OR REPLACE FUNCTION public.has_admin_role(_user_id UUID, _admin_role admin_role)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_roles
    WHERE user_id = _user_id 
    AND admin_role = _admin_role
    AND status = 'active'
  )
$$;

-- Check if super admin
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_roles
    WHERE user_id = _user_id 
    AND admin_role = 'super_admin'
    AND status = 'active'
  )
$$;

-- Check if any admin
CREATE OR REPLACE FUNCTION public.is_any_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_roles
    WHERE user_id = _user_id 
    AND status = 'active'
  )
$$;

-- Count super admins
CREATE OR REPLACE FUNCTION public.count_super_admins()
RETURNS INTEGER
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COUNT(*)::integer FROM public.admin_roles
  WHERE admin_role = 'super_admin' AND status = 'active'
$$;

-- Cleanup expired reset tokens
CREATE OR REPLACE FUNCTION public.cleanup_expired_reset_tokens()
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  DELETE FROM public.password_reset_tokens 
  WHERE expires_at < now() OR used = true;
END;
$$;

-- ============================================================
-- PART 6: TRIGGER FUNCTIONS
-- ============================================================

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Handle new user signup
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

-- Create trades for signal
CREATE OR REPLACE FUNCTION public.create_trades_for_signal()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
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
$$;

-- Close trades for signal
CREATE OR REPLACE FUNCTION public.close_trades_for_signal()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
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
$$;

-- ============================================================
-- PART 7: TRIGGERS
-- ============================================================

-- Drop existing triggers first to avoid conflicts
DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
DROP TRIGGER IF EXISTS update_subscriptions_updated_at ON public.subscriptions;
DROP TRIGGER IF EXISTS update_signals_updated_at ON public.signals;
DROP TRIGGER IF EXISTS update_global_settings_updated_at ON public.global_settings;
DROP TRIGGER IF EXISTS update_legal_pages_updated_at ON public.legal_pages;
DROP TRIGGER IF EXISTS update_admin_roles_updated_at ON public.admin_roles;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS create_trades_on_signal_insert ON public.signals;
DROP TRIGGER IF EXISTS create_trades_on_signal_convert ON public.signals;
DROP TRIGGER IF EXISTS on_signal_closed ON public.signals;

-- Updated_at triggers
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

CREATE TRIGGER update_admin_roles_updated_at BEFORE UPDATE ON public.admin_roles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- New user signup trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Signal trade triggers
CREATE TRIGGER create_trades_on_signal_insert
  AFTER INSERT ON public.signals
  FOR EACH ROW EXECUTE FUNCTION public.create_trades_for_signal();

CREATE TRIGGER create_trades_on_signal_convert
  AFTER UPDATE OF signal_type, status ON public.signals
  FOR EACH ROW
  WHEN (NEW.signal_type = 'signal' AND NEW.status = 'active' AND (OLD.signal_type IS DISTINCT FROM 'signal'))
  EXECUTE FUNCTION public.create_trades_for_signal();

CREATE TRIGGER on_signal_closed
  AFTER UPDATE ON public.signals
  FOR EACH ROW EXECUTE FUNCTION public.close_trades_for_signal();

-- ============================================================
-- PART 8: RLS POLICIES
-- ============================================================

-- Drop existing policies first to avoid conflicts
DO $$ 
DECLARE
  r RECORD;
BEGIN
  FOR r IN (SELECT policyname, tablename FROM pg_policies WHERE schemaname = 'public') LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- Profiles policies
CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update all profiles" ON public.profiles FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete profiles" ON public.profiles FOR DELETE USING (public.has_role(auth.uid(), 'admin'));

-- User roles policies
CREATE POLICY "Users can view their own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can manage all roles" ON public.user_roles FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Subscriptions policies
CREATE POLICY "Users can view their own subscription" ON public.subscriptions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can manage all subscriptions" ON public.subscriptions FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Payments policies
CREATE POLICY "Users can view their own payments" ON public.payments FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own payments" ON public.payments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can manage all payments" ON public.payments FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Signals policies
CREATE POLICY "Active subscribers can view signals" ON public.signals FOR SELECT USING (public.has_role(auth.uid(), 'admin') OR public.has_active_subscription(auth.uid()));
CREATE POLICY "Admins can manage signals" ON public.signals FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- User trades policies
CREATE POLICY "Users can view their own trades" ON public.user_trades FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own trades" ON public.user_trades FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all trades" ON public.user_trades FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

-- Favorites policies
CREATE POLICY "Users can manage their own favorites" ON public.favorites FOR ALL USING (auth.uid() = user_id);

-- Global settings policies
CREATE POLICY "Anyone can view global settings" ON public.global_settings FOR SELECT TO public USING (true);
CREATE POLICY "Admins can update global settings" ON public.global_settings FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));

-- Discounts policies
CREATE POLICY "Authenticated users can view active discounts" ON public.discounts FOR SELECT TO authenticated USING (is_active = true);
CREATE POLICY "Admins can manage discounts" ON public.discounts FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Legal pages policies
CREATE POLICY "Anyone can view legal pages" ON public.legal_pages FOR SELECT USING (true);
CREATE POLICY "Admins can manage legal pages" ON public.legal_pages FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Admin roles policies
CREATE POLICY "Super admins can view all admin roles" ON public.admin_roles FOR SELECT USING (is_super_admin(auth.uid()));
CREATE POLICY "Super admins can insert admin roles" ON public.admin_roles FOR INSERT WITH CHECK (is_super_admin(auth.uid()));
CREATE POLICY "Super admins can update admin roles" ON public.admin_roles FOR UPDATE USING (is_super_admin(auth.uid()));
CREATE POLICY "Super admins can delete admin roles" ON public.admin_roles FOR DELETE USING (is_super_admin(auth.uid()));
CREATE POLICY "Admins can view own role" ON public.admin_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can update their own last_login" ON public.admin_roles FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Admin audit logs policies
CREATE POLICY "Super admins can view audit logs" ON public.admin_audit_logs FOR SELECT USING (is_super_admin(auth.uid()));
CREATE POLICY "Super admins can insert audit logs" ON public.admin_audit_logs FOR INSERT WITH CHECK (is_super_admin(auth.uid()));

-- Password reset tokens policies (edge functions use service role)
CREATE POLICY "Service role can manage reset tokens" ON public.password_reset_tokens FOR ALL USING (true);

-- ============================================================
-- PART 9: STORAGE BUCKET
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('brand-assets', 'brand-assets', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml', 'image/gif'])
ON CONFLICT (id) DO NOTHING;

-- Drop existing storage policies first
DROP POLICY IF EXISTS "Anyone can view brand assets" ON storage.objects;
DROP POLICY IF EXISTS "Super admins can upload brand assets" ON storage.objects;
DROP POLICY IF EXISTS "Super admins can update brand assets" ON storage.objects;
DROP POLICY IF EXISTS "Super admins can delete brand assets" ON storage.objects;

CREATE POLICY "Anyone can view brand assets" ON storage.objects FOR SELECT USING (bucket_id = 'brand-assets');
CREATE POLICY "Super admins can upload brand assets" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'brand-assets' AND is_super_admin(auth.uid()));
CREATE POLICY "Super admins can update brand assets" ON storage.objects FOR UPDATE USING (bucket_id = 'brand-assets' AND is_super_admin(auth.uid()));
CREATE POLICY "Super admins can delete brand assets" ON storage.objects FOR DELETE USING (bucket_id = 'brand-assets' AND is_super_admin(auth.uid()));

-- ============================================================
-- PART 10: REALTIME & REPLICA IDENTITY
-- ============================================================

ALTER TABLE public.signals REPLICA IDENTITY FULL;

-- Add tables to realtime publication (ignore errors if already added)
DO $$ 
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.signals;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ 
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.user_trades;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ 
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ 
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.subscriptions;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ 
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.payments;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ 
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.global_settings;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ 
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.user_roles;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- DONE! Your database is now fully restored.
-- ============================================================
-- 
-- NEXT STEPS:
-- 1. Sign up as the first user in your app
-- 2. To make yourself a super admin, run this SQL (replace YOUR_USER_ID):
--    
--    -- First, get your user_id from profiles table:
--    SELECT user_id, email FROM public.profiles;
--    
--    -- Then add admin role:
--    UPDATE public.user_roles SET role = 'admin' WHERE user_id = 'YOUR_USER_ID';
--    INSERT INTO public.admin_roles (user_id, admin_role, status) 
--    VALUES ('YOUR_USER_ID', 'super_admin', 'active');
--
-- ============================================================
