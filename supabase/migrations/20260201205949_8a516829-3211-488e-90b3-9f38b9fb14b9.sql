-- Drop the existing restrictive SELECT policy
DROP POLICY IF EXISTS "Authenticated users can view global settings" ON public.global_settings;

-- Create a PERMISSIVE policy that allows anyone (including anonymous/unauthenticated users) to read global settings
CREATE POLICY "Anyone can view global settings"
ON public.global_settings
FOR SELECT
TO public
USING (true);