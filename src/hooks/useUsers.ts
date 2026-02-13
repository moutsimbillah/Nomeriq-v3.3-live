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

const isSubscriptionActiveNow = (sub: Subscription): boolean => {
  if (sub.status !== 'active') return false;
  if (!sub.expires_at) return true; // lifetime / no-expiry plans
  return new Date(sub.expires_at) > new Date();
};

const pickPrimarySubscription = (subs: Subscription[]): Subscription | undefined => {
  if (!subs.length) return undefined;

  const active = subs
    .filter(isSubscriptionActiveNow)
    .sort((a, b) => {
      const aExp = a.expires_at ? new Date(a.expires_at).getTime() : Number.MAX_SAFE_INTEGER;
      const bExp = b.expires_at ? new Date(b.expires_at).getTime() : Number.MAX_SAFE_INTEGER;
      return bExp - aExp;
    });
  if (active.length > 0) return active[0];

  const pending = subs
    .filter((s) => s.status === 'pending')
    .sort((a, b) => new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime());
  if (pending.length > 0) return pending[0];

  return [...subs].sort(
    (a, b) =>
      new Date(b.updated_at || b.created_at).getTime() -
      new Date(a.updated_at || a.created_at).getTime()
  )[0];
};

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

      const subscriptionsByUser = new Map<string, Subscription[]>();
      for (const row of (subscriptionsResult.data || [])) {
        const sub = row as Subscription;
        const list = subscriptionsByUser.get(sub.user_id) || [];
        list.push(sub);
        subscriptionsByUser.set(sub.user_id, list);
      }
      const rolesMap = new Map(
        (rolesResult.data || []).map(r => [r.user_id, r.role])
      );

      const usersWithDetails: UserWithDetails[] = (profilesData || []).map(profile => ({
        ...profile,
        subscription: pickPrimarySubscription(subscriptionsByUser.get(profile.user_id) || []),
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
