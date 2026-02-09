import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { AdminRole } from '@/types/database';

interface UseAdminRoleReturn {
  adminRole: AdminRole | null;
  isProvider: boolean;
  isLoading: boolean;
  refetch: () => Promise<void>;
}

/**
 * Hook to fetch the current user's admin role from the database.
 * Used for role-aware dashboard rendering.
 */
export const useAdminRole = (): UseAdminRoleReturn => {
  const { user, isAdmin } = useAuth();
  const [adminRole, setAdminRole] = useState<AdminRole | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchAdminRole = useCallback(async () => {
    if (!user || !isAdmin) {
      setAdminRole(null);
      setIsLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('admin_roles')
        .select('admin_role')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .maybeSingle();

      if (error) throw error;
      
      setAdminRole(data?.admin_role as AdminRole || null);
    } catch (err) {
      console.error('Error fetching admin role:', err);
      setAdminRole(null);
    } finally {
      setIsLoading(false);
    }
  }, [user, isAdmin]);

  useEffect(() => {
    fetchAdminRole();
  }, [fetchAdminRole]);

  // isProvider = signal_provider_admin OR super_admin (super admins see their own data too when viewing user dashboard)
  const isProvider = adminRole === 'signal_provider_admin' || adminRole === 'super_admin';

  return {
    adminRole,
    isProvider,
    isLoading,
    refetch: fetchAdminRole,
  };
};
