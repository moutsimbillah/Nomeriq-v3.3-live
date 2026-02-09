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