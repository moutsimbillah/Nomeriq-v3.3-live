import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { UserTrade, Signal } from '@/types/database';
import { useAuth } from '@/contexts/AuthContext';
import { useUserSubscriptionCategories } from './useSubscriptionPackages';
import { shouldSuppressQueryErrorLog } from '@/lib/queryStability';
import { calculateWinRatePercent } from '@/lib/kpi-math';

interface TradeWithSignal extends UserTrade {
  signal: Signal;
}

interface UseTradesOptions {
  result?: 'win' | 'loss' | 'pending' | null;
  limit?: number;
  page?: number;
  realtime?: boolean;
  fetchAll?: boolean;
}

export const useTrades = (options: UseTradesOptions = {}) => {
  const { result, limit = 20, page = 1, realtime = true, fetchAll = false } = options;
  const [trades, setTrades] = useState<TradeWithSignal[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const { allowedCategories } = useUserSubscriptionCategories();
  
  // Use unique channel name to prevent conflicts between multiple hook instances
  const channelNameRef = useRef(`user_trades_${Math.random().toString(36).substring(7)}`);
  
  // Track if we've loaded data at least once to prevent loading flicker on realtime updates
  const hasLoadedOnceRef = useRef(false);
  const requestSeqRef = useRef(0);

  const fetchTrades = useCallback(async (isRealtimeUpdate = false) => {
    if (!userId) {
      setIsLoading(false);
      return;
    }

    // Only show loading spinner on initial load, not on realtime updates
    if (!isRealtimeUpdate && !hasLoadedOnceRef.current) {
      setIsLoading(true);
    }

    const requestId = ++requestSeqRef.current;
    try {
      let countQuery = supabase
        .from('user_trades')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId);

      if (result) {
        countQuery = countQuery.eq('result', result);
      }

      const { count } = await countQuery;
      if (requestId !== requestSeqRef.current) return;
      setTotalCount(count || 0);

      const buildQuery = () => {
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

        return query;
      };

      let rawTrades: TradeWithSignal[] = [];
      if (fetchAll) {
        const batchSize = 500;
        let offset = 0;
        const expectedTotal = typeof count === 'number' ? count : Number.MAX_SAFE_INTEGER;
        while (offset < expectedTotal || offset === 0) {
          const { data, error: fetchError } = await buildQuery().range(offset, offset + batchSize - 1);
          if (fetchError) throw fetchError;
          const rows = (data as TradeWithSignal[]) || [];
          if (rows.length === 0) break;
          rawTrades = [...rawTrades, ...rows];
          if (rows.length < batchSize) break;
          offset += batchSize;
          if (requestId !== requestSeqRef.current) return;
        }
      } else {
        const offset = (page - 1) * limit;
        const { data, error: fetchError } = await buildQuery().range(offset, offset + limit - 1);
        if (fetchError) throw fetchError;
        rawTrades = (data as TradeWithSignal[]) || [];
      }

      const filteredTrades =
        allowedCategories.length > 0
          ? rawTrades.filter((t) => allowedCategories.includes(t.signal?.category as any))
          : rawTrades;

      if (requestId !== requestSeqRef.current) return;
      setTrades(filteredTrades);
      setError(null);
      hasLoadedOnceRef.current = true;
    } catch (err) {
      if (requestId !== requestSeqRef.current) return;
      setError(err as Error);
      if (!shouldSuppressQueryErrorLog(err)) {
        console.error('Error fetching trades:', err);
      }
    } finally {
      if (requestId === requestSeqRef.current) {
        setIsLoading(false);
      }
    }
  }, [userId, result, limit, page, allowedCategories, fetchAll]);

  useEffect(() => {
    fetchTrades(false);

    // Set up realtime subscription for trades with unique channel name
    if (realtime && userId) {
      const channel = supabase
        .channel(channelNameRef.current)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'user_trades',
            filter: `user_id=eq.${userId}`,
          },
          () => {
            fetchTrades(true); // Pass true to indicate realtime update - no loading flicker
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [fetchTrades, realtime, userId]);

  const totalPages = fetchAll ? 1 : Math.ceil(totalCount / limit);

  return { trades, isLoading, error, refetch: fetchTrades, totalCount, totalPages };
};

export const useTradeStats = () => {
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
  
  // Use unique channel name for stats
  const channelNameRef = useRef(`user_trades_stats_${Math.random().toString(36).substring(7)}`);
  
  // Track if we've loaded data at least once to prevent loading flicker on realtime updates
  const hasLoadedOnceRef = useRef(false);
  const requestSeqRef = useRef(0);

  const fetchStats = useCallback(async (isRealtimeUpdate = false) => {
    if (!userId) {
      setIsLoading(false);
      return;
    }

    // Only show loading spinner on initial load, not on realtime updates
    if (!isRealtimeUpdate && !hasLoadedOnceRef.current) {
      setIsLoading(true);
    }

    const requestId = ++requestSeqRef.current;
    try {
      const { data, error } = await supabase
        .from('user_trades')
        .select('result, pnl')
        .eq('user_id', userId);

      if (error) throw error;
      if (requestId !== requestSeqRef.current) return;

      const trades = data || [];
      const wins = trades.filter(t => t.result === 'win').length;
      const losses = trades.filter(t => t.result === 'loss').length;
      const breakeven = trades.filter(t => t.result === 'breakeven').length;
      const pending = trades.filter(t => t.result === 'pending').length;
      const totalPnL = trades.reduce((sum, t) => sum + (t.pnl || 0), 0);
      const winRate = calculateWinRatePercent(wins, losses);

      setStats({
        totalTrades: trades.length,
        wins,
        losses,
        breakeven,
        pending,
        winRate,
        totalPnL,
      });
      hasLoadedOnceRef.current = true;
    } catch (err) {
      if (requestId !== requestSeqRef.current) return;
      if (!shouldSuppressQueryErrorLog(err)) {
        console.error('Error fetching trade stats:', err);
      }
    } finally {
      if (requestId === requestSeqRef.current) {
        setIsLoading(false);
      }
    }
  }, [userId]);

  useEffect(() => {
    fetchStats(false);

    // Set up realtime subscription for stats updates with unique channel
    if (userId) {
      const channel = supabase
        .channel(channelNameRef.current)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'user_trades',
            filter: `user_id=eq.${userId}`,
          },
          () => {
            fetchStats(true); // Pass true to indicate realtime update - no loading flicker
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [fetchStats, userId]);

  return { stats, isLoading, refetch: fetchStats };
};
