import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { format, startOfWeek, endOfWeek, subWeeks, isWithinInterval, parseISO } from 'date-fns';

interface Signal {
  id: string;
  pair: string;
  direction: string;
  category: string;
  entry_price: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  status: string;
  signal_type: string;
  created_at: string;
  closed_at: string | null;
}

interface SignalStats {
  totalSignals: number;
  activeSignals: number;
  wins: number;
  losses: number;
  breakeven: number;
  winRate: number;
  avgRR: number;
}

export const useSignalStats = () => {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchSignals = async () => {
      try {
        const { data, error } = await supabase
          .from('signals')
          .select('*')
          .eq('signal_type', 'signal')
          .order('created_at', { ascending: false });

        if (error) throw error;
        setSignals(data || []);
      } catch (err) {
        console.error('Error fetching signals:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSignals();

    // Subscribe to real-time updates
    const channel = supabase
      .channel(`signal_stats_${Math.random().toString(36).substring(7)}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'signals',
      }, () => {
        fetchSignals();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const stats = useMemo((): SignalStats => {
    const closedSignals = signals.filter(
      s => s.status === 'tp_hit' || s.status === 'sl_hit' || s.status === 'breakeven'
    );
    const wins = signals.filter(s => s.status === 'tp_hit').length;
    const losses = signals.filter(s => s.status === 'sl_hit').length;
    const breakeven = signals.filter(s => s.status === 'breakeven').length;
    const winRate = closedSignals.length > 0 ? (wins / closedSignals.length) * 100 : 0;

    // Calculate average R:R
    let totalRR = 0;
    let rrCount = 0;
    signals.forEach(signal => {
      const entry = signal.entry_price || 0;
      const sl = signal.stop_loss || 0;
      const tp = signal.take_profit || 0;
      let rr = 0;
      if (signal.direction === 'BUY' && entry - sl !== 0) {
        rr = Math.abs((tp - entry) / (entry - sl));
      } else if (signal.direction === 'SELL' && sl - entry !== 0) {
        rr = Math.abs((entry - tp) / (sl - entry));
      }
      if (rr > 0) {
        totalRR += rr;
        rrCount++;
      }
    });

    return {
      totalSignals: signals.length,
      activeSignals: signals.filter(s => s.status === 'active').length,
      wins,
      losses,
      breakeven,
      winRate,
      avgRR: rrCount > 0 ? totalRR / rrCount : 0,
    };
  }, [signals]);

  return { signals, stats, isLoading };
};

// Hook for weekly analytics based on signals
export const useSignalWeeklyAnalytics = () => {
  const { signals, isLoading } = useSignalStats();

  const getFilteredSignals = (from: Date, to: Date) => {
    return signals.filter(signal => {
      if (signal.status !== 'tp_hit' && signal.status !== 'sl_hit' && signal.status !== 'breakeven') {
        return false;
      }
      const signalDate = signal.closed_at ? parseISO(signal.closed_at) : parseISO(signal.created_at);
      return isWithinInterval(signalDate, { start: from, end: to });
    });
  };

  const calculateMetrics = (filteredSignals: Signal[]) => {
    if (filteredSignals.length === 0) {
      return {
        signalsTaken: 0,
        wins: 0,
        losses: 0,
        breakeven: 0,
        winRate: 0,
        avgRR: 0,
      };
    }

    const wins = filteredSignals.filter(s => s.status === 'tp_hit').length;
    const losses = filteredSignals.filter(s => s.status === 'sl_hit').length;
    const breakeven = filteredSignals.filter(s => s.status === 'breakeven').length;
    const winRate = (wins / filteredSignals.length) * 100;

    // Calculate average R:R
    let totalRR = 0;
    let rrCount = 0;
    filteredSignals.forEach(signal => {
      const entry = signal.entry_price || 0;
      const sl = signal.stop_loss || 0;
      const tp = signal.take_profit || 0;
      let rr = 0;
      if (signal.direction === 'BUY' && entry - sl !== 0) {
        rr = Math.abs((tp - entry) / (entry - sl));
      } else if (signal.direction === 'SELL' && sl - entry !== 0) {
        rr = Math.abs((entry - tp) / (sl - entry));
      }
      if (rr > 0) {
        totalRR += rr;
        rrCount++;
      }
    });

    return {
      signalsTaken: filteredSignals.length,
      wins,
      losses,
      breakeven,
      winRate,
      avgRR: rrCount > 0 ? totalRR / rrCount : 0,
    };
  };

  return { signals, getFilteredSignals, calculateMetrics, isLoading };
};
