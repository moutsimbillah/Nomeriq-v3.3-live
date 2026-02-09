-- Add timezone column to global_settings
ALTER TABLE public.global_settings 
ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'UTC';

-- Update admin_roles RLS to allow users to update their own last_login
CREATE POLICY "Admins can update their own last_login"
ON public.admin_roles FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);