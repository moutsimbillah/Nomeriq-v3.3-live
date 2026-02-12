-- Add telegram username to profiles for signup + profile display
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS telegram_username TEXT;

-- Ensure new users get telegram username copied from auth metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (
    user_id,
    email,
    first_name,
    last_name,
    phone,
    country,
    telegram_username
  )
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'last_name',
    NEW.raw_user_meta_data->>'phone',
    NEW.raw_user_meta_data->>'country',
    NEW.raw_user_meta_data->>'telegram_username'
  );

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user');

  INSERT INTO public.subscriptions (user_id, status)
  VALUES (NEW.id, 'inactive');

  RETURN NEW;
END;
$function$;

NOTIFY pgrst, 'reload schema';

