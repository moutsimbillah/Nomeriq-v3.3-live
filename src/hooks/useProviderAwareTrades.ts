import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { UserTrade, Signal } from '@/types/database';
import { useAuth } from '@/contexts/AuthContext';
import { useAdminRole } from './useAdminRole';

interface TradeWithSignal extends UserTrade {
  signal: Signal;
}

interface UseProviderAwareTradesOptions {
  result?: 'win' | 'loss' | 'pending' | 'breakeven' | null;
  limit?: number;
  page?: number;
  realtime?: boolean;
}

/**
 * Hook that fetches trades with provider-aware filtering.
 * If the user is an admin/signal provider, fetches ALL trades from their signals (from all users).
 * Regular users see only their own trades.
 */
export const useProviderAwareTrades = (options: UseProviderAwareTradesOptions = {}) => {
  const { result, limit = 20, page = 1, realtime = true } = options;
  const [trades, setTrades] = useState<TradeWithSignal[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const { user } = useAuth();
  const { isProvider, isLoading: roleLoading } = useAdminRole();

  const channelNameRef = useRef(
    `provider_aware_trades_${Math.random().toString(36).substring(7)}`
  );

  // Prevent "blinking" loaders on realtime updates
  const hasLoadedOnceRef = useRef(false);

  const fetchTrades = useCallback(async () => {
    if (!user || roleLoading) {
      return;
    }

    try {
      // Only show the big loader on the very first load.
      if (!hasLoadedOnceRef.current) setIsLoading(true);

      let filteredTrades: TradeWithSignal[] = [];

      if (isProvider) {
        // For providers: fetch ALL trades from signals they created (from all users)
        const { data, error: fetchError } = await supabase
          .from('user_trades')
          .select(`
            *,
            signal:signals!inner(*)
          `)
          .eq('signal.created_by', user.id)
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
          .eq('user_id', user.id)
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

      // Apply pagination after filtering
      const totalFiltered = filteredTrades.length;
      setTotalCount(totalFiltered);

      const offset = (page - 1) * limit;
      const paginatedTrades = filteredTrades.slice(offset, offset + limit);

      setTrades(paginatedTrades);
      setError(null);
      hasLoadedOnceRef.current = true;
    } catch (err) {
      setError(err as Error);
      console.error('Error fetching provider-aware trades:', err);
    } finally {
      setIsLoading(false);
    }
  }, [user, result, limit, page, isProvider, roleLoading]);

  useEffect(() => {
    if (!roleLoading) {
      fetchTrades();
    }
  }, [fetchTrades, roleLoading]);

  useEffect(() => {
    if (realtime && user && !roleLoading) {
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
  }, [realtime, user, fetchTrades, roleLoading]);

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
export const useProviderAwareTradeStats = () => {
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
  const { isProvider, isLoading: roleLoading } = useAdminRole();
  
  const channelNameRef = useRef(`provider_aware_stats_${Math.random().toString(36).substring(7)}`);

  const fetchStats = useCallback(async () => {
    if (!user || roleLoading) {
      return;
    }

    try {
      setIsLoading(true);

      let trades: any[] = [];

      if (isProvider) {
        // For providers: fetch ALL trades from signals they created (from all users)
        const { data, error } = await supabase
          .from('user_trades')
          .select(`
            result, 
            pnl,
            signal:signals!inner(created_by)
          `)
          .eq('signal.created_by', user.id);

        if (error) throw error;
        trades = data || [];
      } else {
        // For regular users: fetch only their own trades
        const { data, error } = await supabase
          .from('user_trades')
          .select(`
            result, 
            pnl
          `)
          .eq('user_id', user.id);

        if (error) throw error;
        trades = data || [];
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
      console.error('Error fetching provider-aware trade stats:', err);
    } finally {
      setIsLoading(false);
    }
  }, [user, isProvider, roleLoading]);

  useEffect(() => {
    if (!roleLoading) {
      fetchStats();
    }
  }, [fetchStats, roleLoading]);

  useEffect(() => {
    if (user && !roleLoading) {
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
  }, [user, fetchStats, roleLoading]);

  return { stats, isLoading: isLoading || roleLoading, refetch: fetchStats, isProvider };
};
