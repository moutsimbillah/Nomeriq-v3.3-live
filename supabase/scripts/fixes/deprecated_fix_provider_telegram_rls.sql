-- DEPRECATED
-- This was a manual "quick fix" for Telegram settings RLS.
-- It is now handled by the real migration:
--   supabase/migrations/20260209170000_fix_telegram_rls_for_providers.sql
--
-- Keep this script only as a reference for manual troubleshooting.

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

