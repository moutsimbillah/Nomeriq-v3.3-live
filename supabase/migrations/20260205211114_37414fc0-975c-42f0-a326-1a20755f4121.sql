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