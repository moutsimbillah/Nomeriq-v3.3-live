import { ReactNode, useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';
import { AdminRole } from '@/types/database';
import { useToast } from '@/hooks/use-toast';

interface AdminProtectedRouteProps {
  children: ReactNode;
  allowedRoles: AdminRole[];
}

export const AdminProtectedRoute = ({
  children,
  allowedRoles,
}: AdminProtectedRouteProps) => {
  const { user, isLoading: authLoading, isAdmin } = useAuth();
  const location = useLocation();
  const [adminRole, setAdminRole] = useState<AdminRole | null>(null);
  const [isCheckingRole, setIsCheckingRole] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const { toast } = useToast();
  const [hasHandledUnverified, setHasHandledUnverified] = useState(false);

  // Check our custom email verification field in user metadata
  const isEmailVerified = user?.user_metadata?.custom_email_verified === true;

  useEffect(() => {
    if (!user || authLoading) return;
    if (isEmailVerified) return;
    if (hasHandledUnverified) return;

    setHasHandledUnverified(true);
    supabase.auth.signOut().catch(() => undefined);
    toast({
      title: 'Email Not Verified',
      description: 'Please verify your email before signing in.',
      variant: 'destructive',
    });
  }, [user, authLoading, isEmailVerified, hasHandledUnverified, toast]);

  useEffect(() => {
    if (!user) {
      setIsCheckingRole(false);
      return;
    }

    const checkAdminRole = async () => {
      try {
        const { data } = await supabase
          .from('admin_roles')
          .select('admin_role, status')
          .eq('user_id', user.id)
          .maybeSingle();

        if (data && data.status === 'active') {
          const role = data.admin_role as AdminRole;
          setAdminRole(role);

          // Server-side RBAC: Check if user's role is in allowed roles
          if (!allowedRoles.includes(role)) {
            setAccessDenied(true);
          }
        } else {
          setAdminRole(null);
          setAccessDenied(true);
        }
      } catch (err) {
        console.error('Error checking admin role:', err);
        setAdminRole(null);
        setAccessDenied(true);
      } finally {
        setIsCheckingRole(false);
      }
    };

    checkAdminRole();
  }, [user, allowedRoles]);

  if (authLoading || isCheckingRole) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!isEmailVerified) {
    return <Navigate to="/login" state={{ from: location, unverified: true }} replace />;
  }

  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  // Server-side RBAC check: Redirect to Access Denied page
  if (accessDenied || !adminRole || !allowedRoles.includes(adminRole)) {
    // Instead of redirecting to another admin page (which could cause loops),
    // redirect to an access denied page or their appropriate landing page
    const getDefaultRoute = (role: AdminRole | null) => {
      switch (role) {
        case 'signal_provider_admin':
          return '/admin/provider-dashboard';
        case 'payments_admin':
          return '/admin/payments';
        case 'super_admin':
          return '/admin';
        default:
          return '/dashboard';
      }
    };

    const defaultRoute = getDefaultRoute(adminRole);

    // If they're trying to access a page they shouldn't, go to access denied
    // unless it's their default route (to prevent infinite loops)
    if (location.pathname !== defaultRoute) {
      return <Navigate to="/access-denied" replace />;
    }

    // Fallback to dashboard if we hit the default route but still denied
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};
