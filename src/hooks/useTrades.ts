import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { UserTrade, Signal } from '@/types/database';
import { useAuth } from '@/contexts/AuthContext';
import { useUserSubscriptionCategories } from './useSubscriptionPackages';
import { shouldSuppressQueryErrorLog } from '@/lib/queryStability';

interface TradeWithSignal extends UserTrade {
  signal: Signal;
}

interface UseTradesOptions {
  result?: 'win' | 'loss' | 'pending' | null;
  limit?: number;
  page?: number;
  realtime?: boolean;
}

export const useTrades = (options: UseTradesOptions = {}) => {
  const { result, limit = 20, page = 1, realtime = true } = options;
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

  const fetchTrades = useCallback(async (isRealtimeUpdate = false) => {
    if (!userId) {
      setIsLoading(false);
      return;
    }

    // Only show loading spinner on initial load, not on realtime updates
    if (!isRealtimeUpdate && !hasLoadedOnceRef.current) {
      setIsLoading(true);
    }

    try {
      let countQuery = supabase
        .from('user_trades')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId);

      if (result) {
        countQuery = countQuery.eq('result', result);
      }

      const { count } = await countQuery;
      setTotalCount(count || 0);

      const offset = (page - 1) * limit;
      
      let query = supabase
        .from('user_trades')
        .select(`
          *,
          signal:signals(*)
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (result) {
        query = query.eq('result', result);
      }

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;
      
      const rawTrades = (data as TradeWithSignal[]) || [];
      const filteredTrades =
        allowedCategories.length > 0
          ? rawTrades.filter((t) => allowedCategories.includes(t.signal?.category as any))
          : rawTrades;

      setTrades(filteredTrades);
      setError(null);
      hasLoadedOnceRef.current = true;
    } catch (err) {
      setError(err as Error);
      if (!shouldSuppressQueryErrorLog(err)) {
        console.error('Error fetching trades:', err);
      }
    } finally {
      setIsLoading(false);
    }
  }, [userId, result, limit, page, allowedCategories]);

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

  const totalPages = Math.ceil(totalCount / limit);

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

  const fetchStats = useCallback(async (isRealtimeUpdate = false) => {
    if (!userId) {
      setIsLoading(false);
      return;
    }

    // Only show loading spinner on initial load, not on realtime updates
    if (!isRealtimeUpdate && !hasLoadedOnceRef.current) {
      setIsLoading(true);
    }

    try {
      const { data, error } = await supabase
        .from('user_trades')
        .select('result, pnl')
        .eq('user_id', userId);

      if (error) throw error;

      const trades = data || [];
      const wins = trades.filter(t => t.result === 'win').length;
      const losses = trades.filter(t => t.result === 'loss').length;
      const breakeven = trades.filter(t => t.result === 'breakeven').length;
      const pending = trades.filter(t => t.result === 'pending').length;
      const totalPnL = trades.reduce((sum, t) => sum + (t.pnl || 0), 0);
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
      hasLoadedOnceRef.current = true;
    } catch (err) {
      if (!shouldSuppressQueryErrorLog(err)) {
        console.error('Error fetching trade stats:', err);
      }
    } finally {
      setIsLoading(false);
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
