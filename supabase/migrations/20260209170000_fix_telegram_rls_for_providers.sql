-- Fix RLS policy to allow all admin roles (including providers) to read global Telegram settings
-- Only super_admin can still modify settings, but all admins/providers can read them

-- Drop the restrictive SELECT policy
DROP POLICY IF EXISTS "Super admins can view global telegram settings" ON public.global_telegram_settings;
DROP POLICY IF EXISTS "All admins can view global telegram settings" ON public.global_telegram_settings;

-- Create new policy that allows all admin roles to read settings
CREATE POLICY "All admins can view global telegram settings"
ON public.global_telegram_settings
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.admin_roles
    WHERE admin_roles.user_id = auth.uid()
    AND admin_roles.status = 'active'
  )
);

-- Comment explaining the change
COMMENT ON POLICY "All admins can view global telegram settings" ON public.global_telegram_settings 
IS 'Allows all active admin roles (super_admin, payments_admin, signal_provider_admin) to read global Telegram settings so they can send notifications. Only super_admin can modify settings.';
