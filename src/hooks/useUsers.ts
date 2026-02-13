import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Profile, Subscription, Payment } from '@/types/database';
import { pickPrimarySubscription } from '@/lib/subscription-selection';

interface UserWithDetails extends Profile {
  subscription?: Subscription;
  subscriptionPackageName?: string | null;
  subscriptionDurationType?: string | null;
  latestPayment?: Payment;
  role?: string;
}

interface UseUsersOptions {
  search?: string;
  limit?: number;
  page?: number;
  realtime?: boolean;
  fetchAll?: boolean;
}

export const useUsers = (options: UseUsersOptions = {}) => {
  const { search = '', limit = 20, page = 1, realtime = true, fetchAll = false } = options;
  const [users, setUsers] = useState<UserWithDetails[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const requestSeqRef = useRef(0);

  const fetchUsers = useCallback(async () => {
    const requestId = ++requestSeqRef.current;
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
      if (requestId !== requestSeqRef.current) return;
      setTotalCount(count || 0);

      let profilesData: Profile[] = [];
      if (fetchAll) {
        const batchSize = 500;
        const expectedTotal = count || 0;
        let offset = 0;

        while (offset < expectedTotal || offset === 0) {
          let batchQuery = supabase
            .from('profiles')
            .select('*')
            .order('created_at', { ascending: false })
            .range(offset, offset + batchSize - 1);

          if (search) {
            batchQuery = batchQuery.or(`email.ilike.%${search}%,username.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%,phone.ilike.%${search}%`);
          }

          const { data: batchRows, error: batchError } = await batchQuery;
          if (batchError) throw batchError;
          if (!batchRows || batchRows.length === 0) break;

          profilesData = [...profilesData, ...(batchRows as Profile[])];
          if (batchRows.length < batchSize) break;
          offset += batchSize;
        }
      } else {
        const offset = (page - 1) * limit;
        let query = supabase
          .from('profiles')
          .select('*')
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (search) {
          query = query.or(`email.ilike.%${search}%,username.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%,phone.ilike.%${search}%`);
        }

        const { data, error: profilesError } = await query;
        if (profilesError) throw profilesError;
        profilesData = (data || []) as Profile[];
      }

      // Fetch subscriptions and roles for these users
      const userIds = profilesData.map(p => p.user_id);
      
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

      const selectedSubscriptions = profilesData
        .map((profile) => pickPrimarySubscription(subscriptionsByUser.get(profile.user_id) || []))
        .filter((sub): sub is Subscription => Boolean(sub));
      const packageIds = Array.from(
        new Set(
          selectedSubscriptions
            .map((sub) => sub.package_id)
            .filter((id): id is string => Boolean(id)),
        ),
      );

      const packageMetaMap = new Map<string, { name: string; duration_type: string | null }>();
      if (packageIds.length > 0) {
        const { data: packagesData } = await supabase
          .from('subscription_packages')
          .select('id, name, duration_type')
          .in('id', packageIds);
        (packagesData || []).forEach((pkg) =>
          packageMetaMap.set(pkg.id, { name: pkg.name, duration_type: pkg.duration_type || null }),
        );
      }

      const rolesMap = new Map(
        (rolesResult.data || []).map(r => [r.user_id, r.role])
      );

      const usersWithDetails: UserWithDetails[] = profilesData.map(profile => {
        const selectedSubscription = pickPrimarySubscription(subscriptionsByUser.get(profile.user_id) || []);
        return {
          ...profile,
          subscription: selectedSubscription,
          subscriptionPackageName: selectedSubscription?.package_id
            ? packageMetaMap.get(selectedSubscription.package_id)?.name || null
            : null,
          subscriptionDurationType: selectedSubscription?.package_id
            ? packageMetaMap.get(selectedSubscription.package_id)?.duration_type || null
            : null,
          role: rolesMap.get(profile.user_id),
        };
      });

      if (requestId !== requestSeqRef.current) return;
      setUsers(usersWithDetails);
      setError(null);
    } catch (err) {
      if (requestId !== requestSeqRef.current) return;
      setError(err as Error);
      console.error('Error fetching users:', err);
    } finally {
      if (requestId === requestSeqRef.current) {
        setIsLoading(false);
      }
    }
  }, [search, limit, page, fetchAll]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    if (!realtime) return;

    const channelName = `users-realtime-${Math.random().toString(36).slice(2)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles' },
        () => {
          fetchUsers();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'subscriptions' },
        () => {
          fetchUsers();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_roles' },
        () => {
          fetchUsers();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchUsers, realtime]);

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

        // Fetch subscriptions and choose primary consistently
        const { data: subRows } = await supabase
          .from('subscriptions')
          .select('*')
          .eq('user_id', userId)
          .order('updated_at', { ascending: false });
        const subData = pickPrimarySubscription((subRows || []) as Subscription[]) ?? null;

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
