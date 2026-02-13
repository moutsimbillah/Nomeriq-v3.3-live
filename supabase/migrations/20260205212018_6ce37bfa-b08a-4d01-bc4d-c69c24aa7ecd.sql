-- Fix: Add explicit deny policy to auth_rate_limits table
-- This table should only be accessible via service role from edge functions

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'auth_rate_limits'
  ) THEN
    DROP POLICY IF EXISTS "Deny all public access to auth rate limits" ON public.auth_rate_limits;

    CREATE POLICY "Deny all public access to auth rate limits"
    ON public.auth_rate_limits
    FOR ALL
    TO public, authenticated, anon
    USING (false)
    WITH CHECK (false);
  END IF;
END $$;
