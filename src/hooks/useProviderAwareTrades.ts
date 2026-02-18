import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { UserTrade, Signal } from '@/types/database';
import { useAuth } from '@/contexts/AuthContext';
import { useAdminRole } from './useAdminRole';
import { useUserSubscriptionCategories } from './useSubscriptionPackages';
import { shouldSuppressQueryErrorLog } from '@/lib/queryStability';
import { calculateWinRatePercent } from '@/lib/kpi-math';

interface TradeWithSignal extends UserTrade {
  signal: Signal;
}

interface UseProviderAwareTradesOptions {
  result?: 'win' | 'loss' | 'pending' | 'breakeven' | Array<'win' | 'loss' | 'pending' | 'breakeven'> | null;
  limit?: number;
  page?: number;
  realtime?: boolean;
  adminGlobalView?: boolean;
  fetchAll?: boolean;
}

/**
 * Hook that fetches trades with provider-aware filtering.
 * If the user is an admin/signal provider, fetches ALL trades from their signals (from all users).
 * Regular users see only their own trades.
 */
export const useProviderAwareTrades = (options: UseProviderAwareTradesOptions = {}) => {
  const { result, limit = 20, page = 1, realtime = true, adminGlobalView = false, fetchAll = false } = options;
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
  const requestSeqRef = useRef(0);

  const fetchTrades = useCallback(async () => {
    if (!userId || roleLoading) {
      return;
    }

    const requestId = ++requestSeqRef.current;

    try {
      // Only show the big loader on the very first load.
      if (!hasLoadedOnceRef.current) setIsLoading(true);

      const buildScopedQuery = () => {
        let q = supabase
        .from('user_trades')
        .select(`
          *,
          signal:signals!inner(*)
        `, { count: 'exact' })
        .order('created_at', { ascending: false });

        if (result) {
          if (Array.isArray(result)) {
            q = q.in('result', result);
          } else {
            q = q.eq('result', result);
          }
        }

        if (adminGlobalView) {
        // Global admin scope.
        } else if (isProvider) {
          q = q.eq('signal.created_by', userId);
        } else {
          q = q.eq('user_id', userId);
          if (allowedCategories.length > 0) {
            q = q.in('signal.category', allowedCategories);
          }
        }

        return q;
      };

      if (fetchAll) {
        const batchSize = 500;
        let offset = 0;
        let expectedTotal = 0;
        const collected: TradeWithSignal[] = [];

        while (offset < expectedTotal || offset === 0) {
          const { data, count, error: fetchError } = await buildScopedQuery().range(offset, offset + batchSize - 1);
          if (fetchError) throw fetchError;
          if (requestId !== requestSeqRef.current) return;
          const rows = (data as TradeWithSignal[]) || [];

          if (offset === 0) {
            expectedTotal = typeof count === 'number' ? count : Number.MAX_SAFE_INTEGER;
            setTotalCount(typeof count === 'number' ? count : rows.length);
          }

          if (rows.length === 0) break;
          collected.push(...rows);
          if (rows.length < batchSize) break;
          offset += batchSize;
        }

        if (requestId !== requestSeqRef.current) return;
        setTrades(collected);
        setError(null);
        hasLoadedOnceRef.current = true;
        return;
      }

      const offset = (page - 1) * limit;
      const { data, count, error: fetchError } = await buildScopedQuery().range(offset, offset + limit - 1);

      if (fetchError) throw fetchError;

      if (requestId !== requestSeqRef.current) return;
      setTrades((data as TradeWithSignal[]) || []);
      setTotalCount(count || 0);
      setError(null);
      hasLoadedOnceRef.current = true;
    } catch (err) {
      if (requestId !== requestSeqRef.current) return;
      setError(err as Error);
      if (!shouldSuppressQueryErrorLog(err)) {
        console.error('Error fetching provider-aware trades:', err);
      }
    } finally {
      if (requestId === requestSeqRef.current) {
        setIsLoading(false);
      }
    }
  }, [userId, result, limit, page, isProvider, roleLoading, adminGlobalView, allowedCategories, fetchAll]);

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
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'signals',
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

  const totalPages = fetchAll ? 1 : Math.ceil(totalCount / limit);

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
  const requestSeqRef = useRef(0);

  const toNumber = (value: unknown): number => {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  };

  const fetchStatsFallback = useCallback(async () => {
    let trades: any[] = [];

    if (adminGlobalView) {
      const { data, error } = await supabase
        .from('user_trades')
        .select(`
          result, 
          pnl
        `);

      if (error) throw error;
      trades = data || [];
    } else if (isProvider) {
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
    const winRate = calculateWinRatePercent(wins, losses);

    return {
      totalTrades: trades.length,
      wins,
      losses,
      breakeven,
      pending,
      winRate,
      totalPnL,
    };
  }, [adminGlobalView, isProvider, userId, allowedCategories]);

  const fetchStats = useCallback(async () => {
    if (!userId || roleLoading) {
      return;
    }

    const requestId = ++requestSeqRef.current;

    try {
      setIsLoading(true);

      const rpcArgs: {
        p_user_id: string | null;
        p_provider_id: string | null;
        p_categories: string[] | null;
      } = {
        p_user_id: null,
        p_provider_id: null,
        p_categories:
          !adminGlobalView && !isProvider && allowedCategories.length > 0
            ? allowedCategories
            : null,
      };

      if (adminGlobalView) {
        // Global admin scope.
      } else if (isProvider) {
        rpcArgs.p_provider_id = userId;
      } else {
        rpcArgs.p_user_id = userId;
      }

      const { data, error } = await (supabase.rpc as any)('get_trade_kpis', rpcArgs);
      if (error) {
        const fallbackStats = await fetchStatsFallback();
        if (requestId !== requestSeqRef.current) return;
        setStats(fallbackStats);
        return;
      }

      const row = Array.isArray(data) ? data[0] : data;
      if (!row) {
        if (requestId !== requestSeqRef.current) return;
        setStats({
          totalTrades: 0,
          wins: 0,
          losses: 0,
          breakeven: 0,
          pending: 0,
          winRate: 0,
          totalPnL: 0,
        });
        return;
      }

      if (requestId !== requestSeqRef.current) return;
      setStats({
        totalTrades: toNumber(row.total_trades),
        wins: toNumber(row.wins),
        losses: toNumber(row.losses),
        breakeven: toNumber(row.breakeven),
        pending: toNumber(row.pending),
        winRate: toNumber(row.win_rate_percent),
        totalPnL: toNumber(row.total_pnl),
      });
    } catch (err) {
      if (!shouldSuppressQueryErrorLog(err)) {
        console.error('Error fetching provider-aware trade stats:', err);
      }
    } finally {
      if (requestId === requestSeqRef.current) {
        setIsLoading(false);
      }
    }
  }, [userId, isProvider, roleLoading, adminGlobalView, allowedCategories, fetchStatsFallback]);

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
