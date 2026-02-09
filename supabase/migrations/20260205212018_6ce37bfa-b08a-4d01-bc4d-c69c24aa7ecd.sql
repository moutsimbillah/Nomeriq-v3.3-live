-- Fix: Add explicit deny policy to auth_rate_limits table
-- This table should only be accessible via service role from edge functions

-- Create deny policy for auth_rate_limits - blocks all public access
CREATE POLICY "Deny all public access to auth rate limits"
ON public.auth_rate_limits
FOR ALL
TO public, authenticated, anon
USING (false)
WITH CHECK (false);