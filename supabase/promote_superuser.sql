DO $$
DECLARE
  target_user_id UUID;
BEGIN
  -- Get user ID by email
  SELECT id INTO target_user_id FROM auth.users WHERE email = 'moutsimbillah@gmail.com';

  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'User with email moutsimbillah@gmail.com not found for promotion';
  END IF;

  -- Ensure existing user role (if not present) is correct
  -- We assume they have a 'user' role by default, but let's make sure they have the underlying 'admin' capability in 'user_roles'
  INSERT INTO public.user_roles (user_id, role)
  VALUES (target_user_id, 'admin')
  ON CONFLICT (user_id, role) DO NOTHING;

  -- Ensure they are a super_admin in 'admin_roles'
  -- Conflict target is just 'user_id' because admin_roles has a unique constraint on user_id
  INSERT INTO public.admin_roles (user_id, admin_role, status)
  VALUES (target_user_id, 'super_admin', 'active')
  ON CONFLICT (user_id)
  DO UPDATE SET 
    admin_role = 'super_admin', 
    status = 'active';

  RAISE NOTICE 'Promoted moutsimbillah@gmail.com to super_admin successfully';
END $$;
