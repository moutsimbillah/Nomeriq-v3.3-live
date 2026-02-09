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