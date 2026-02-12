import { ReactNode, useEffect, useMemo, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useAdminRoleContext } from '@/contexts/AdminRoleContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: ReactNode;
  requireSubscription?: boolean;
  requireAdmin?: boolean;
}

export const ProtectedRoute = ({
  children,
  requireSubscription = false,
  requireAdmin = false,
}: ProtectedRouteProps) => {
  const { user, isLoading, hasActiveSubscription, isAdmin } = useAuth();
  const { adminRole } = useAdminRoleContext();
  const isSignalProvider = adminRole === 'signal_provider_admin';
  const location = useLocation();
  const { toast } = useToast();
  const [hasHandledUnverified, setHasHandledUnverified] = useState(false);

  const isEmailVerified = useMemo(() => {
    // Check our custom email verification field in user metadata
    const userMetadata = user?.user_metadata;
    return userMetadata?.custom_email_verified === true;
  }, [user]);

  useEffect(() => {
    if (!user || isLoading) return;
    if (isEmailVerified) return;
    if (hasHandledUnverified) return;

    setHasHandledUnverified(true);
    // Ensure they cannot access protected content with an unverified session.
    supabase.auth.signOut().catch(() => undefined);
    toast({
      title: 'Email Not Verified',
      description: 'Please verify your email before signing in.',
      variant: 'destructive',
    });
  }, [user, isLoading, isEmailVerified, hasHandledUnverified, toast]);

  if (isLoading) {
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

  if (requireAdmin && !isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  if (requireSubscription && !hasActiveSubscription && !isAdmin && !isSignalProvider) {
    return <Navigate to="/subscription" replace />;
  }

  return <>{children}</>;
};
