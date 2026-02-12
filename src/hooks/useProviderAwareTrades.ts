import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { UserTrade, Signal } from '@/types/database';
import { useAuth } from '@/contexts/AuthContext';
import { useAdminRole } from './useAdminRole';
import { useUserSubscriptionCategories } from './useSubscriptionPackages';
import { shouldSuppressQueryErrorLog } from '@/lib/queryStability';

interface TradeWithSignal extends UserTrade {
  signal: Signal;
}

interface UseProviderAwareTradesOptions {
  result?: 'win' | 'loss' | 'pending' | 'breakeven' | null;
  limit?: number;
  page?: number;
  realtime?: boolean;
  adminGlobalView?: boolean;
}

/**
 * Hook that fetches trades with provider-aware filtering.
 * If the user is an admin/signal provider, fetches ALL trades from their signals (from all users).
 * Regular users see only their own trades.
 */
export const useProviderAwareTrades = (options: UseProviderAwareTradesOptions = {}) => {
  const { result, limit = 20, page = 1, realtime = true, adminGlobalView = false } = options;
  const [trades, setTrades] = useState<TradeWithSignal[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const { isProvider, isLoading: roleLoading } = useAdminRole();
  const { allowedCategories } = useUserSubscriptionCategories();

  const channelNameRef = useRef(
    `provider_aware_trades_${Math.random().toString(36).substring(7)}`
  );

  // Prevent "blinking" loaders on realtime updates
  const hasLoadedOnceRef = useRef(false);

  const fetchTrades = useCallback(async () => {
    if (!userId || roleLoading) {
      return;
    }

    try {
      // Only show the big loader on the very first load.
      if (!hasLoadedOnceRef.current) setIsLoading(true);

      const cacheKey = [
        userId,
        isProvider ? 'provider' : 'user',
        adminGlobalView ? 'admin_global' : 'scoped',
        result ?? 'all',
      ].join(':');
      const now = Date.now();
      const cacheStore = ((globalThis as any).__provider_aware_trades_cache ??=
        {}) as Record<
        string,
        {
          ts: number;
          data: TradeWithSignal[];
          total: number;
          inflight?: Promise<{ data: TradeWithSignal[]; total: number }>;
        }
      >;
      const cached = cacheStore[cacheKey];

      if (cached && now - cached.ts < 1200) {
        const offset = (page - 1) * limit;
        const paginated = cached.data.slice(offset, offset + limit);
        setTrades(paginated);
        setTotalCount(cached.total);
        setError(null);
        hasLoadedOnceRef.current = true;
        return;
      }
      if (cached?.inflight) {
        const fromInflight = await cached.inflight;
        const offset = (page - 1) * limit;
        const paginated = fromInflight.data.slice(offset, offset + limit);
        setTrades(paginated);
        setTotalCount(fromInflight.total);
        setError(null);
        hasLoadedOnceRef.current = true;
        return;
      }

      const inflight = (async () => {
        let filteredTrades: TradeWithSignal[] = [];

        if (adminGlobalView) {
          // For Super Admin global view: fetch ALL trades from ALL users/providers
          let query = supabase
            .from('user_trades')
            .select(`
              *,
              signal:signals(*)
            `)
            .order('created_at', { ascending: false });

          if (result) {
            query = query.eq('result', result);
          }

          const { data, error: fetchError } = await query;
          if (fetchError) throw fetchError;
          filteredTrades = (data as TradeWithSignal[]) || [];
        } else if (isProvider) {
          // For providers: fetch ALL trades from signals they created (from all users)
          const { data, error: fetchError } = await supabase
            .from('user_trades')
            .select(`
              *,
              signal:signals!inner(*)
            `)
            .eq('signal.created_by', userId)
            .order('created_at', { ascending: false });

          if (fetchError) throw fetchError;
          filteredTrades = (data as TradeWithSignal[]) || [];
        } else {
          // For regular users: fetch only their own trades
          let query = supabase
            .from('user_trades')
            .select(`
              *,
              signal:signals(*)
            `)
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

          if (result) {
            query = query.eq('result', result);
          }

          const { data, error: fetchError } = await query;
          if (fetchError) throw fetchError;
          filteredTrades = (data as TradeWithSignal[]) || [];
        }

        // Apply result filter for providers too
        if (result && isProvider) {
          filteredTrades = filteredTrades.filter((t) => t.result === result);
        }
        // Defense-in-depth: keep regular-user trades scoped to subscribed categories.
        if (!isProvider && !adminGlobalView && allowedCategories.length > 0) {
          filteredTrades = filteredTrades.filter((t) =>
            allowedCategories.includes((t.signal?.category as string) || '')
          );
        }

        return {
          data: filteredTrades,
          total: filteredTrades.length,
        };
      })();

      cacheStore[cacheKey] = {
        ts: cached?.ts ?? 0,
        data: cached?.data ?? [],
        total: cached?.total ?? 0,
        inflight,
      };

      const resolved = await inflight;
      cacheStore[cacheKey] = {
        ts: Date.now(),
        data: resolved.data,
        total: resolved.total,
      };

      // Apply pagination after filtering
      setTotalCount(resolved.total);
      const offset = (page - 1) * limit;
      const paginatedTrades = resolved.data.slice(offset, offset + limit);

      setTrades(paginatedTrades);
      setError(null);
      hasLoadedOnceRef.current = true;
    } catch (err) {
      setError(err as Error);
      if (!shouldSuppressQueryErrorLog(err)) {
        console.error('Error fetching provider-aware trades:', err);
      }
    } finally {
      setIsLoading(false);
    }
  }, [userId, result, limit, page, isProvider, roleLoading, adminGlobalView, allowedCategories]);

  useEffect(() => {
    if (!roleLoading) {
      fetchTrades();
    }
  }, [fetchTrades, roleLoading]);

  useEffect(() => {
    if (realtime && userId && !roleLoading) {
      const channel = supabase
        .channel(channelNameRef.current)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'user_trades',
          },
          () => {
            fetchTrades();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [realtime, userId, fetchTrades, roleLoading]);

  const totalPages = Math.ceil(totalCount / limit);

  return {
    trades,
    isLoading: isLoading || roleLoading,
    error,
    refetch: fetchTrades,
    totalCount,
    totalPages,
    isProvider
  };
};

/**
 * Hook that fetches trade stats with provider-aware filtering.
 * For providers: shows stats from ALL trades based on their signals.
 * For regular users: shows stats from their own trades only.
 */
interface UseProviderAwareTradeStatsOptions {
  adminGlobalView?: boolean;
}

export const useProviderAwareTradeStats = (options: UseProviderAwareTradeStatsOptions = {}) => {
  const { adminGlobalView = false } = options;
  const [stats, setStats] = useState({
    totalTrades: 0,
    wins: 0,
    losses: 0,
    breakeven: 0,
    pending: 0,
    winRate: 0,
    totalPnL: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const { isProvider, isLoading: roleLoading } = useAdminRole();
  const { allowedCategories } = useUserSubscriptionCategories();

  const channelNameRef = useRef(`provider_aware_stats_${Math.random().toString(36).substring(7)}`);

  const fetchStats = useCallback(async () => {
    if (!userId || roleLoading) {
      return;
    }

    try {
      setIsLoading(true);

      let trades: any[] = [];

      if (adminGlobalView) {
        // For Super Admin global view: fetch ALL trades from ALL users/providers
        const { data, error } = await supabase
          .from('user_trades')
          .select(`
            result, 
            pnl
          `);

        if (error) throw error;
        trades = data || [];
      } else if (isProvider) {
        // For providers: fetch ALL trades from signals they created (from all users)
        const { data, error } = await supabase
          .from('user_trades')
          .select(`
            result, 
            pnl,
            signal:signals!inner(created_by)
          `)
          .eq('signal.created_by', userId);

        if (error) throw error;
        trades = data || [];
      } else {
        // For regular users: fetch only their own trades
        const { data, error } = await supabase
          .from('user_trades')
          .select(`
            result,
            pnl,
            signal:signals(category)
          `)
          .eq('user_id', userId);

        if (error) throw error;
        trades = (data || []).filter((t: any) =>
          allowedCategories.length > 0
            ? allowedCategories.includes(t.signal?.category || '')
            : true
        );
      }

      const wins = trades.filter(t => t.result === 'win').length;
      const losses = trades.filter(t => t.result === 'loss').length;
      const breakeven = trades.filter(t => t.result === 'breakeven').length;
      const pending = trades.filter(t => t.result === 'pending').length;
      const totalPnL = trades.reduce((sum, t) => sum + ((t as any).pnl || 0), 0);
      const closedTrades = wins + losses;
      const winRate = closedTrades > 0 ? (wins / closedTrades) * 100 : 0;

      setStats({
        totalTrades: trades.length,
        wins,
        losses,
        breakeven,
        pending,
        winRate,
        totalPnL,
      });
    } catch (err) {
      if (!shouldSuppressQueryErrorLog(err)) {
        console.error('Error fetching provider-aware trade stats:', err);
      }
    } finally {
      setIsLoading(false);
    }
  }, [userId, isProvider, roleLoading, adminGlobalView, allowedCategories]);

  useEffect(() => {
    if (!roleLoading) {
      fetchStats();
    }
  }, [fetchStats, roleLoading]);

  useEffect(() => {
    if (userId && !roleLoading) {
      const channel = supabase
        .channel(channelNameRef.current)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'user_trades',
          },
          () => {
            fetchStats();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [userId, fetchStats, roleLoading]);

  return { stats, isLoading: isLoading || roleLoading, refetch: fetchStats, isProvider };
};
