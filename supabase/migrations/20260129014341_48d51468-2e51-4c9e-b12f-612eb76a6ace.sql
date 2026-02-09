-- Create new admin role enum type
CREATE TYPE public.admin_role AS ENUM ('super_admin', 'payments_admin', 'signal_provider_admin');

-- Create admin_roles table for tracking specific admin permissions
CREATE TABLE public.admin_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  admin_role admin_role NOT NULL DEFAULT 'payments_admin',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  last_login timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create audit logs table for tracking admin role changes
CREATE TABLE public.admin_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  performed_by uuid NOT NULL,
  target_user_id uuid NOT NULL,
  action text NOT NULL,
  old_value jsonb,
  new_value jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on admin_roles
ALTER TABLE public.admin_roles ENABLE ROW LEVEL SECURITY;

-- Enable RLS on admin_audit_logs
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check admin role
CREATE OR REPLACE FUNCTION public.has_admin_role(_user_id uuid, _admin_role admin_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_roles
    WHERE user_id = _user_id 
    AND admin_role = _admin_role
    AND status = 'active'
  )
$$;

-- Create function to check if user is super admin
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_roles
    WHERE user_id = _user_id 
    AND admin_role = 'super_admin'
    AND status = 'active'
  )
$$;

-- Create function to check if user has any admin role
CREATE OR REPLACE FUNCTION public.is_any_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_roles
    WHERE user_id = _user_id 
    AND status = 'active'
  )
$$;

-- Create function to count super admins
CREATE OR REPLACE FUNCTION public.count_super_admins()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::integer FROM public.admin_roles
  WHERE admin_role = 'super_admin' AND status = 'active'
$$;

-- RLS policies for admin_roles - only super admins can manage
CREATE POLICY "Super admins can view all admin roles"
ON public.admin_roles FOR SELECT
USING (is_super_admin(auth.uid()));

CREATE POLICY "Super admins can insert admin roles"
ON public.admin_roles FOR INSERT
WITH CHECK (is_super_admin(auth.uid()));

CREATE POLICY "Super admins can update admin roles"
ON public.admin_roles FOR UPDATE
USING (is_super_admin(auth.uid()));

CREATE POLICY "Super admins can delete admin roles"
ON public.admin_roles FOR DELETE
USING (is_super_admin(auth.uid()));

-- Admins can view their own role
CREATE POLICY "Admins can view own role"
ON public.admin_roles FOR SELECT
USING (auth.uid() = user_id);

-- RLS policies for audit logs - only super admins can view
CREATE POLICY "Super admins can view audit logs"
ON public.admin_audit_logs FOR SELECT
USING (is_super_admin(auth.uid()));

CREATE POLICY "Super admins can insert audit logs"
ON public.admin_audit_logs FOR INSERT
WITH CHECK (is_super_admin(auth.uid()));

-- Add trigger for updated_at on admin_roles
CREATE TRIGGER update_admin_roles_updated_at
BEFORE UPDATE ON public.admin_roles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();