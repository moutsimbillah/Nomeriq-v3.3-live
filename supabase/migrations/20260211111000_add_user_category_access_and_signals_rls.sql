-- Helper function and RLS for category-based signal access

-- Function: does the given user have access to the given category?
CREATE OR REPLACE FUNCTION public.user_has_category_access(p_user_id uuid, p_category text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.subscriptions s
    JOIN public.subscription_packages p
      ON p.id = s.package_id
    WHERE s.user_id = p_user_id
      AND s.status = 'active'
      AND (
        s.expires_at IS NULL
        OR s.expires_at > now()
      )
      AND (
        p.categories IS NULL
        OR array_length(p.categories, 1) IS NULL
        OR p_category = ANY(p.categories)
      )
  );
$$;

-- Enable RLS on signals if not already enabled
ALTER TABLE public.signals ENABLE ROW LEVEL SECURITY;

-- Drop any existing generic select policy to replace with category-aware one
DROP POLICY IF EXISTS "Authenticated users can view signals" ON public.signals;
DROP POLICY IF EXISTS "Users can view signals" ON public.signals;

-- Authenticated users can view only signals whose category they have access to
CREATE POLICY "Users can view signals by category"
ON public.signals
FOR SELECT
USING (
  public.user_has_category_access(auth.uid(), category)
  OR public.is_any_admin(auth.uid())
  OR public.has_role(auth.uid(), 'admin')
);

NOTIFY pgrst, 'reload schema';

