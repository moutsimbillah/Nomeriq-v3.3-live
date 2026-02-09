-- QUICK FIX: Allow providers to read Telegram settings
-- Copy and paste this into Supabase Dashboard > SQL Editor > New Query > Run

DROP POLICY IF EXISTS "Super admins can view global telegram settings" ON public.global_telegram_settings;

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
