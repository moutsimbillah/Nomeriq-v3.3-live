-- Fix RLS policies to recognize admin_roles table credentials
-- This migration updates RLS policies to allow users with entries in the admin_roles table
-- (checked via is_super_admin() and is_any_admin()) to perform administrative actions.

-- global_settings
DROP POLICY IF EXISTS "Admins can update global settings" ON public.global_settings;
CREATE POLICY "Admins can update global settings" ON public.global_settings
  FOR UPDATE USING (public.has_role(auth.uid(), 'admin') OR public.is_super_admin(auth.uid()));

-- profiles
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles" ON public.profiles
  FOR SELECT USING (public.has_role(auth.uid(), 'admin') OR public.is_any_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;
CREATE POLICY "Admins can update all profiles" ON public.profiles
  FOR UPDATE USING (public.has_role(auth.uid(), 'admin') OR public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can delete profiles" ON public.profiles;
CREATE POLICY "Admins can delete profiles" ON public.profiles
  FOR DELETE USING (public.has_role(auth.uid(), 'admin') OR public.is_super_admin(auth.uid()));

-- subscriptions
DROP POLICY IF EXISTS "Admins can manage all subscriptions" ON public.subscriptions;
CREATE POLICY "Admins can manage all subscriptions" ON public.subscriptions
  FOR ALL USING (public.has_role(auth.uid(), 'admin') OR public.is_any_admin(auth.uid()));

-- payments
DROP POLICY IF EXISTS "Admins can manage all payments" ON public.payments;
CREATE POLICY "Admins can manage all payments" ON public.payments
  FOR ALL USING (public.has_role(auth.uid(), 'admin') OR public.is_any_admin(auth.uid()));

-- signals
DROP POLICY IF EXISTS "Admins can manage signals" ON public.signals;
CREATE POLICY "Admins can manage signals" ON public.signals
  FOR ALL USING (public.has_role(auth.uid(), 'admin') OR public.is_any_admin(auth.uid()));

-- Also need to update the select policy for signals to allow admins to see them
DROP POLICY IF EXISTS "Active subscribers can view signals" ON public.signals;
DROP POLICY IF EXISTS "Active subscribers and admins can view signals" ON public.signals;
CREATE POLICY "Active subscribers and admins can view signals" ON public.signals
  FOR SELECT USING (
    public.has_role(auth.uid(), 'admin') OR 
    public.is_any_admin(auth.uid()) OR
    public.has_active_subscription(auth.uid())
  );

-- user_trades
DROP POLICY IF EXISTS "Admins can view all trades" ON public.user_trades;
CREATE POLICY "Admins can view all trades" ON public.user_trades
  FOR SELECT USING (public.has_role(auth.uid(), 'admin') OR public.is_any_admin(auth.uid()));

-- discounts
DROP POLICY IF EXISTS "Admins can manage discounts" ON public.discounts;
CREATE POLICY "Admins can manage discounts" ON public.discounts
  FOR ALL USING (public.has_role(auth.uid(), 'admin') OR public.is_any_admin(auth.uid()));

-- legal_pages
DROP POLICY IF EXISTS "Admins can manage legal pages" ON public.legal_pages;
CREATE POLICY "Admins can manage legal pages" ON public.legal_pages
  FOR ALL USING (public.has_role(auth.uid(), 'admin') OR public.is_any_admin(auth.uid()));

-- user_roles
DROP POLICY IF EXISTS "Admins can manage all roles" ON public.user_roles;
CREATE POLICY "Admins can manage all roles" ON public.user_roles
  FOR ALL USING (public.has_role(auth.uid(), 'admin') OR public.is_super_admin(auth.uid()));
