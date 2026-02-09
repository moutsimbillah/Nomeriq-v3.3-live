import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { AdminRole, AdminStatus, AdminWithProfile, Profile, AdminAuditLog } from '@/types/database';

interface UseAdminRolesOptions {
  search?: string;
  roleFilter?: AdminRole | 'all';
  statusFilter?: AdminStatus | 'all';
}

export const useAdminRoles = (options: UseAdminRolesOptions = {}) => {
  const { search = '', roleFilter = 'all', statusFilter = 'all' } = options;
  const [admins, setAdmins] = useState<AdminWithProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [superAdminCount, setSuperAdminCount] = useState(0);

  const fetchAdmins = useCallback(async () => {
    setIsLoading(true);
    try {
      // Fetch admin roles
      let query = supabase
        .from('admin_roles')
        .select('*')
        .order('created_at', { ascending: false });

      if (roleFilter !== 'all') {
        query = query.eq('admin_role', roleFilter);
      }
      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data: adminRolesData, error: adminError } = await query;

      if (adminError) throw adminError;

      // Get user IDs to fetch profiles
      const userIds = (adminRolesData || []).map(a => a.user_id);

      if (userIds.length === 0) {
        setAdmins([]);
        setSuperAdminCount(0);
        return;
      }

      // Fetch profiles for these admins
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .in('user_id', userIds);

      if (profilesError) throw profilesError;

      const profilesMap = new Map(
        (profilesData || []).map(p => [p.user_id, p])
      );

      let adminsWithProfiles: AdminWithProfile[] = (adminRolesData || []).map(admin => ({
        ...admin,
        admin_role: admin.admin_role as AdminRole,
        status: admin.status as AdminStatus,
        profile: profilesMap.get(admin.user_id) as Profile | undefined,
      }));

      // Apply search filter
      if (search) {
        const searchLower = search.toLowerCase();
        adminsWithProfiles = adminsWithProfiles.filter(admin => {
          const profile = admin.profile;
          if (!profile) return false;
          return (
            profile.email?.toLowerCase().includes(searchLower) ||
            profile.first_name?.toLowerCase().includes(searchLower) ||
            profile.last_name?.toLowerCase().includes(searchLower)
          );
        });
      }

      setAdmins(adminsWithProfiles);
      
      // Count super admins
      const superCount = (adminRolesData || []).filter(
        a => a.admin_role === 'super_admin' && a.status === 'active'
      ).length;
      setSuperAdminCount(superCount);

      setError(null);
    } catch (err) {
      setError(err as Error);
      console.error('Error fetching admin roles:', err);
    } finally {
      setIsLoading(false);
    }
  }, [search, roleFilter, statusFilter]);

  useEffect(() => {
    fetchAdmins();
  }, [fetchAdmins]);

  const addAdmin = async (userId: string, adminRole: AdminRole) => {
    try {
      // First check if user already has an admin role
      const { data: existing } = await supabase
        .from('admin_roles')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle();

      if (existing) {
        throw new Error('User already has an admin role');
      }

      const { error } = await supabase
        .from('admin_roles')
        .insert({ user_id: userId, admin_role: adminRole });

      if (error) throw error;

      // Also ensure user has admin role in user_roles
      const { data: userRoleExists } = await supabase
        .from('user_roles')
        .select('id')
        .eq('user_id', userId)
        .eq('role', 'admin')
        .maybeSingle();

      if (!userRoleExists) {
        // Update user role to admin
        await supabase
          .from('user_roles')
          .update({ role: 'admin' })
          .eq('user_id', userId);
      }

      // Log the action
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('admin_audit_logs').insert({
          performed_by: user.id,
          target_user_id: userId,
          action: 'add_admin',
          new_value: { admin_role: adminRole },
        });
      }

      await fetchAdmins();
      return { error: null };
    } catch (err) {
      return { error: err as Error };
    }
  };

  const updateAdminRole = async (userId: string, newRole: AdminRole, currentRole: AdminRole) => {
    try {
      // If changing from super_admin, check if it's the last one
      if (currentRole === 'super_admin' && newRole !== 'super_admin') {
        if (superAdminCount <= 1) {
          throw new Error('Cannot remove the last Super Admin');
        }
      }

      const { error } = await supabase
        .from('admin_roles')
        .update({ admin_role: newRole })
        .eq('user_id', userId);

      if (error) throw error;

      // Log the action
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('admin_audit_logs').insert({
          performed_by: user.id,
          target_user_id: userId,
          action: 'change_role',
          old_value: { admin_role: currentRole },
          new_value: { admin_role: newRole },
        });
      }

      await fetchAdmins();
      return { error: null };
    } catch (err) {
      return { error: err as Error };
    }
  };

  const updateAdminStatus = async (userId: string, newStatus: AdminStatus, currentRole: AdminRole) => {
    try {
      // Prevent suspending the last super admin
      if (currentRole === 'super_admin' && newStatus === 'suspended') {
        if (superAdminCount <= 1) {
          throw new Error('Cannot suspend the last Super Admin');
        }
      }

      const { error } = await supabase
        .from('admin_roles')
        .update({ status: newStatus })
        .eq('user_id', userId);

      if (error) throw error;

      // Log the action
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('admin_audit_logs').insert({
          performed_by: user.id,
          target_user_id: userId,
          action: newStatus === 'suspended' ? 'suspend_admin' : 'activate_admin',
          new_value: { status: newStatus },
        });
      }

      await fetchAdmins();
      return { error: null };
    } catch (err) {
      return { error: err as Error };
    }
  };

  const removeAdmin = async (userId: string, currentRole: AdminRole) => {
    try {
      // Prevent removing the last super admin
      if (currentRole === 'super_admin') {
        if (superAdminCount <= 1) {
          throw new Error('Cannot remove the last Super Admin');
        }
      }

      const { error } = await supabase
        .from('admin_roles')
        .delete()
        .eq('user_id', userId);

      if (error) throw error;

      // Revert user role to 'user'
      await supabase
        .from('user_roles')
        .update({ role: 'user' })
        .eq('user_id', userId);

      // Log the action
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('admin_audit_logs').insert({
          performed_by: user.id,
          target_user_id: userId,
          action: 'remove_admin',
          old_value: { admin_role: currentRole },
        });
      }

      await fetchAdmins();
      return { error: null };
    } catch (err) {
      return { error: err as Error };
    }
  };

  return {
    admins,
    isLoading,
    error,
    superAdminCount,
    refetch: fetchAdmins,
    addAdmin,
    updateAdminRole,
    updateAdminStatus,
    removeAdmin,
  };
};

export const useAdminAuditLogs = () => {
  const [logs, setLogs] = useState<AdminAuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const { data, error } = await supabase
          .from('admin_audit_logs')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(100);

        if (error) throw error;
        setLogs((data || []) as AdminAuditLog[]);
      } catch (err) {
        console.error('Error fetching audit logs:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchLogs();
  }, []);

  return { logs, isLoading };
};

export const useCurrentAdminRole = (userId: string | undefined) => {
  const [adminRole, setAdminRole] = useState<AdminRole | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setIsLoading(false);
      return;
    }

    const fetchAdminRole = async () => {
      try {
        const { data, error } = await supabase
          .from('admin_roles')
          .select('admin_role, status')
          .eq('user_id', userId)
          .maybeSingle();

        if (error) throw error;
        
        if (data && data.status === 'active') {
          setAdminRole(data.admin_role as AdminRole);
        } else {
          setAdminRole(null);
        }
      } catch (err) {
        console.error('Error fetching admin role:', err);
        setAdminRole(null);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAdminRole();
  }, [userId]);

  return { adminRole, isLoading, isSuperAdmin: adminRole === 'super_admin' };
};
