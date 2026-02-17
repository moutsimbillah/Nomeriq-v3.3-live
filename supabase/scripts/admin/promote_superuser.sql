-- Promote a user to super_admin by email.
-- IMPORTANT: Replace the email below before running.
--
-- How to run:
-- - Supabase Dashboard > SQL Editor > New query
-- - Paste and run

DO $$
DECLARE
  target_user_id UUID;
  target_email TEXT := 'YOUR_EMAIL_HERE@example.com';
BEGIN
  -- Get user ID by email
  SELECT id INTO target_user_id FROM auth.users WHERE email = target_email;

  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'User with email % not found for promotion', target_email;
  END IF;

  -- Ensure underlying app role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (target_user_id, 'admin')
  ON CONFLICT (user_id, role) DO NOTHING;

  -- Ensure they are a super_admin in admin_roles (unique on user_id)
  INSERT INTO public.admin_roles (user_id, admin_role, status)
  VALUES (target_user_id, 'super_admin', 'active')
  ON CONFLICT (user_id)
  DO UPDATE SET
    admin_role = 'super_admin',
    status = 'active';

  RAISE NOTICE 'Promoted % to super_admin successfully', target_email;
END $$;

