-- Fix RLS policies for subscription packages/features
-- - Use admin_roles helpers (is_any_admin) instead of user_roles admin
-- - Ensure INSERT uses WITH CHECK (required by Postgres RLS)

-- subscription_packages
DROP POLICY IF EXISTS "Authenticated users can view subscription packages" ON public.subscription_packages;
CREATE POLICY "Authenticated users can view subscription packages"
ON public.subscription_packages
FOR SELECT
USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Admins can manage subscription packages" ON public.subscription_packages;
DROP POLICY IF EXISTS "Admins can insert subscription packages" ON public.subscription_packages;
DROP POLICY IF EXISTS "Admins can update subscription packages" ON public.subscription_packages;
DROP POLICY IF EXISTS "Admins can delete subscription packages" ON public.subscription_packages;

CREATE POLICY "Admins can insert subscription packages"
ON public.subscription_packages
FOR INSERT
WITH CHECK (public.is_any_admin(auth.uid()) OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update subscription packages"
ON public.subscription_packages
FOR UPDATE
USING (public.is_any_admin(auth.uid()) OR public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.is_any_admin(auth.uid()) OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete subscription packages"
ON public.subscription_packages
FOR DELETE
USING (public.is_any_admin(auth.uid()) OR public.has_role(auth.uid(), 'admin'));

-- subscription_package_features
DROP POLICY IF EXISTS "Authenticated users can view subscription package features" ON public.subscription_package_features;
CREATE POLICY "Authenticated users can view subscription package features"
ON public.subscription_package_features
FOR SELECT
USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Admins can manage subscription package features" ON public.subscription_package_features;
DROP POLICY IF EXISTS "Admins can insert subscription package features" ON public.subscription_package_features;
DROP POLICY IF EXISTS "Admins can update subscription package features" ON public.subscription_package_features;
DROP POLICY IF EXISTS "Admins can delete subscription package features" ON public.subscription_package_features;

CREATE POLICY "Admins can insert subscription package features"
ON public.subscription_package_features
FOR INSERT
WITH CHECK (public.is_any_admin(auth.uid()) OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update subscription package features"
ON public.subscription_package_features
FOR UPDATE
USING (public.is_any_admin(auth.uid()) OR public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.is_any_admin(auth.uid()) OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete subscription package features"
ON public.subscription_package_features
FOR DELETE
USING (public.is_any_admin(auth.uid()) OR public.has_role(auth.uid(), 'admin'));

NOTIFY pgrst, 'reload schema';

