import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { AdminRole } from '@/types/database';
import { shouldSuppressQueryErrorLog } from '@/lib/queryStability';

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
  const userId = user?.id ?? null;

  const fetchAdminRole = useCallback(async () => {
    if (!userId || !isAdmin) {
      setAdminRole(null);
      setIsLoading(false);
      return;
    }

    try {
      const cacheKey = `admin_role_${userId}`;
      const now = Date.now();
      const existing = (globalThis as any)[cacheKey] as
        | { value: AdminRole | null; expiresAt: number; inflight?: Promise<AdminRole | null> }
        | undefined;

      if (existing && existing.expiresAt > now) {
        setAdminRole(existing.value);
        setIsLoading(false);
        return;
      }

      if (existing?.inflight) {
        const role = await existing.inflight;
        setAdminRole(role);
        setIsLoading(false);
        return;
      }

      const inflight = (async () => {
        const { data, error } = await supabase
          .from('admin_roles')
          .select('admin_role')
          .eq('user_id', userId)
          .eq('status', 'active')
          .maybeSingle();

        if (error) throw error;
        return (data?.admin_role as AdminRole) || null;
      })();

      (globalThis as any)[cacheKey] = {
        value: existing?.value ?? null,
        expiresAt: now + 15_000,
        inflight,
      };

      const role = await inflight;
      (globalThis as any)[cacheKey] = {
        value: role,
        expiresAt: Date.now() + 15_000,
      };

      setAdminRole(role);
    } catch (err) {
      if (!shouldSuppressQueryErrorLog(err)) {
        console.error('Error fetching admin role:', err);
      }
      setAdminRole(null);
    } finally {
      setIsLoading(false);
    }
  }, [userId, isAdmin]);

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
