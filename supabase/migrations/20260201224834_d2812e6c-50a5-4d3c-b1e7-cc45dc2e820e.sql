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