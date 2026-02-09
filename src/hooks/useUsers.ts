import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Profile, Subscription, Payment } from '@/types/database';

interface UserWithDetails extends Profile {
  subscription?: Subscription;
  latestPayment?: Payment;
  role?: string;
}

interface UseUsersOptions {
  search?: string;
  limit?: number;
  page?: number;
}

export const useUsers = (options: UseUsersOptions = {}) => {
  const { search = '', limit = 20, page = 1 } = options;
  const [users, setUsers] = useState<UserWithDetails[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchUsers = useCallback(async () => {
    setIsLoading(true);
    try {
      // Build the base query for count
      let countQuery = supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true });

      if (search) {
        countQuery = countQuery.or(`email.ilike.%${search}%,username.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%,phone.ilike.%${search}%`);
      }

      const { count } = await countQuery;
      setTotalCount(count || 0);

      // Build the main query
      const offset = (page - 1) * limit;
      
      let query = supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (search) {
        query = query.or(`email.ilike.%${search}%,username.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%,phone.ilike.%${search}%`);
      }

      const { data: profilesData, error: profilesError } = await query;

      if (profilesError) throw profilesError;

      // Fetch subscriptions and roles for these users
      const userIds = (profilesData || []).map(p => p.user_id);
      
      const [subscriptionsResult, rolesResult] = await Promise.all([
        supabase.from('subscriptions').select('*').in('user_id', userIds),
        supabase.from('user_roles').select('*').in('user_id', userIds),
      ]);

      const subscriptionsMap = new Map(
        (subscriptionsResult.data || []).map(s => [s.user_id, s])
      );
      const rolesMap = new Map(
        (rolesResult.data || []).map(r => [r.user_id, r.role])
      );

      const usersWithDetails: UserWithDetails[] = (profilesData || []).map(profile => ({
        ...profile,
        subscription: subscriptionsMap.get(profile.user_id) as Subscription | undefined,
        role: rolesMap.get(profile.user_id),
      }));

      setUsers(usersWithDetails);
      setError(null);
    } catch (err) {
      setError(err as Error);
      console.error('Error fetching users:', err);
    } finally {
      setIsLoading(false);
    }
  }, [search, limit, page]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const totalPages = Math.ceil(totalCount / limit);

  return { users, isLoading, error, refetch: fetchUsers, totalCount, totalPages };
};

export const useUserDetails = (userId: string | undefined) => {
  const [user, setUser] = useState<UserWithDetails | null>(null);
  const [trades, setTrades] = useState<any[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!userId) {
      setIsLoading(false);
      return;
    }

    const fetchUserDetails = async () => {
      try {
        // Fetch profile
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('user_id', userId)
          .maybeSingle();

        if (profileError) throw profileError;

        // Fetch subscription
        const { data: subData } = await supabase
          .from('subscriptions')
          .select('*')
          .eq('user_id', userId)
          .maybeSingle();

        // Fetch role
        const { data: roleData } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', userId)
          .maybeSingle();

        // Fetch trades with signals
        const { data: tradesData } = await supabase
          .from('user_trades')
          .select(`*, signal:signals(*)`)
          .eq('user_id', userId)
          .order('created_at', { ascending: false });

        // Fetch payments
        const { data: paymentsData } = await supabase
          .from('payments')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false });

        setUser({
          ...profileData,
          subscription: subData as Subscription | undefined,
          role: roleData?.role,
        } as UserWithDetails);
        setTrades(tradesData || []);
        setPayments((paymentsData as Payment[]) || []);
        setError(null);
      } catch (err) {
        setError(err as Error);
        console.error('Error fetching user details:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchUserDetails();
  }, [userId]);

  return { user, trades, payments, isLoading, error };
};
