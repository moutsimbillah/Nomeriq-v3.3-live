import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Signal, UserTrade } from '@/types/database';
import { 
  format, 
  startOfDay, 
  startOfWeek, 
  startOfMonth, 
  endOfDay, 
  endOfWeek, 
  endOfMonth, 
  subWeeks, 
  subMonths,
  parseISO, 
  isWithinInterval,
  eachDayOfInterval,
} from 'date-fns';
import { calculateWinRatePercent } from '@/lib/kpi-math';

// Extended trade type with nested signal
interface TradeWithSignal extends UserTrade {
  signal: Signal;
}

export type TimePeriod = 'today' | 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'custom';

export interface ProviderStats {
  totalSignals: number;
  activeSignals: number;
  upcomingSignals: number;
  completedSignals: number;
  totalWins: number;
  totalLosses: number;
  totalBreakeven: number;
  winRate: number;
  avgRR: number;
  totalPlatformPnL: number;
  avgPnLPerSignal: number;
  subscriberCount: number;
  qualityScore: number;
}

export interface ProviderPeriodStats {
  periodPnL: number;
  tradesCount: number;
  wins: number;
  losses: number;
  breakeven: number;
  winRate: number;
  avgRR: number;
  bestDayPnL: number;
  worstDayPnL: number;
}

export interface PairStats {
  pair: string;
  category: string;
  tradesCount: number;
  wins: number;
  losses: number;
  breakeven: number;
  winRate: number;
  totalPnL: number;
  avgRR: number;
}

interface DateRange {
  from: Date;
  to: Date;
}

export interface EquityCurvePoint {
  date: string;
  balance: number;
  pnl: number;
  cumulativePnL: number;
  label: string;
}

export const useProviderTradeStats = () => {
  const { user } = useAuth();
  const providerId = user?.id;
  
  const [signals, setSignals] = useState<Signal[]>([]);
  const [trades, setTrades] = useState<TradeWithSignal[]>([]);
  const [subscriberCount, setSubscriberCount] = useState(0);
  const [globalRiskPercent, setGlobalRiskPercent] = useState<number>(2);
  const [isLoading, setIsLoading] = useState(true);
  const [period, setPeriod] = useState<TimePeriod>('this_week');
  const [customRange, setCustomRange] = useState<DateRange | null>(null);
  
  const channelRef = useRef(`provider_stats_${Math.random().toString(36).substring(7)}`);

  const fetchData = useCallback(async () => {
    if (!providerId) {
      setIsLoading(false);
      return;
    }

    try {
      // Fetch only signals created by this provider
      const [signalsRes, settingsRes, subscribersRes] = await Promise.all([
        supabase
          .from('signals')
          .select('*')
          .eq('created_by', providerId)
          .order('created_at', { ascending: false }),
        supabase
          .from('global_settings')
          .select('global_risk_percent')
          .limit(1)
          .maybeSingle(),
        // Count subscribers who have trades from this provider's signals
        supabase
          .from('subscriptions')
          .select('user_id', { count: 'exact' })
          .eq('status', 'active')
      ]);

      if (signalsRes.error) throw signalsRes.error;
      
      const providerSignals = (signalsRes.data || []) as Signal[];
      setSignals(providerSignals);
      
      if (settingsRes.data?.global_risk_percent) {
        setGlobalRiskPercent(settingsRes.data.global_risk_percent);
      }

      // Get signal IDs for this provider
      const signalIds = providerSignals.map(s => s.id);
      
      if (signalIds.length > 0) {
        // Fetch trades only for this provider's signals
        const tradesRes = await supabase
          .from('user_trades')
          .select('*, signal:signals(*)')
          .in('signal_id', signalIds)
          .order('created_at', { ascending: false });

        if (tradesRes.error) throw tradesRes.error;
        setTrades((tradesRes.data as TradeWithSignal[]) || []);
        
        // Count unique users who have traded this provider's signals
        const uniqueTraders = new Set((tradesRes.data || []).map(t => t.user_id));
        setSubscriberCount(uniqueTraders.size);
      } else {
        setTrades([]);
        setSubscriberCount(0);
      }
    } catch (err) {
      console.error('Error fetching provider stats:', err);
    } finally {
      setIsLoading(false);
    }
  }, [providerId]);

  useEffect(() => {
    fetchData();

    const channel = supabase
      .channel(channelRef.current)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'signals' }, fetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_trades' }, fetchData)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchData]);

  // Calculate R:R for a signal
  const calculateRR = useCallback((signal: Signal): number => {
    const entry = signal.entry_price || 0;
    const sl = signal.stop_loss || 0;
    const tp = signal.take_profit || 0;
    if (signal.direction === 'BUY' && entry - sl !== 0) {
      return Math.abs((tp - entry) / (entry - sl));
    } else if (signal.direction === 'SELL' && sl - entry !== 0) {
      return Math.abs((entry - tp) / (sl - entry));
    }
    return 1;
  }, []);

  // Get date range for period
  const dateRange = useMemo((): DateRange => {
    const now = new Date();
    switch (period) {
      case 'today':
        return { from: startOfDay(now), to: endOfDay(now) };
      case 'this_week':
        return { from: startOfWeek(now, { weekStartsOn: 1 }), to: endOfWeek(now, { weekStartsOn: 1 }) };
      case 'last_week':
        const lastWeek = subWeeks(now, 1);
        return { from: startOfWeek(lastWeek, { weekStartsOn: 1 }), to: endOfWeek(lastWeek, { weekStartsOn: 1 }) };
      case 'this_month':
        return { from: startOfMonth(now), to: endOfMonth(now) };
      case 'last_month':
        const lastMonth = subMonths(now, 1);
        return { from: startOfMonth(lastMonth), to: endOfMonth(lastMonth) };
      case 'custom':
        return customRange || { from: startOfWeek(now, { weekStartsOn: 1 }), to: endOfWeek(now, { weekStartsOn: 1 }) };
      default:
        return { from: startOfWeek(now, { weekStartsOn: 1 }), to: endOfWeek(now, { weekStartsOn: 1 }) };
    }
  }, [period, customRange]);

  // Filter signals by period
  const getSignalsInPeriod = useCallback((from: Date, to: Date) => {
    return signals.filter(s => {
      if (!['tp_hit', 'sl_hit', 'breakeven'].includes(s.status)) return false;
      const date = parseISO(s.closed_at || s.created_at);
      return isWithinInterval(date, { start: from, end: to });
    });
  }, [signals]);

  // Provider Stats
  const providerStats = useMemo((): ProviderStats => {
    const activeSignals = signals.filter(s => s.status === 'active' && s.signal_type === 'signal');
    const upcomingSignals = signals.filter(s => s.signal_type === 'upcoming');
    const closedSignals = signals.filter(s => ['tp_hit', 'sl_hit', 'breakeven'].includes(s.status));
    const wins = signals.filter(s => s.status === 'tp_hit').length;
    const losses = signals.filter(s => s.status === 'sl_hit').length;
    const breakeven = signals.filter(s => s.status === 'breakeven').length;
    
    const totalPnL = trades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    
    let totalRR = 0;
    let rrCount = 0;
    closedSignals.forEach(s => {
      const rr = calculateRR(s);
      if (rr > 0) { totalRR += rr; rrCount++; }
    });

    const winRate = calculateWinRatePercent(wins, losses);
    const avgRR = rrCount > 0 ? totalRR / rrCount : 0;
    
    // Quality score based on win rate and R:R
    const qualityScore = Math.min(100, winRate * 0.6 + Math.min(avgRR / 2 * 40, 40));

    return {
      totalSignals: signals.filter(s => s.signal_type === 'signal').length,
      activeSignals: activeSignals.length,
      upcomingSignals: upcomingSignals.length,
      completedSignals: closedSignals.length,
      totalWins: wins,
      totalLosses: losses,
      totalBreakeven: breakeven,
      winRate,
      avgRR,
      totalPlatformPnL: totalPnL,
      avgPnLPerSignal: closedSignals.length > 0 ? totalPnL / closedSignals.length : 0,
      subscriberCount,
      qualityScore,
    };
  }, [signals, trades, calculateRR, subscriberCount]);

  // Period Stats
  const periodStats = useMemo((): ProviderPeriodStats => {
    const periodSignals = getSignalsInPeriod(dateRange.from, dateRange.to);
    const wins = periodSignals.filter(s => s.status === 'tp_hit').length;
    const losses = periodSignals.filter(s => s.status === 'sl_hit').length;
    const breakeven = periodSignals.filter(s => s.status === 'breakeven').length;
    
    // Calculate period P&L from trades
    const periodTrades = trades.filter(t => {
      if (!t.closed_at) return false;
      const date = parseISO(t.closed_at);
      return isWithinInterval(date, { start: dateRange.from, end: dateRange.to });
    });
    
    const periodPnL = periodTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    
    // Calculate daily P&L for best/worst day
    const days = eachDayOfInterval({ start: dateRange.from, end: dateRange.to });
    const dailyPnL = days.map(day => {
      const dayTrades = periodTrades.filter(t => {
        const tradeDate = parseISO(t.closed_at!);
        return format(tradeDate, 'yyyy-MM-dd') === format(day, 'yyyy-MM-dd');
      });
      return dayTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    });
    
    // Average R:R for period
    let totalRR = 0;
    let rrCount = 0;
    periodSignals.forEach(s => {
      const rr = calculateRR(s);
      if (rr > 0) { totalRR += rr; rrCount++; }
    });
    
    const winRate = calculateWinRatePercent(wins, losses);
    const avgRR = rrCount > 0 ? totalRR / rrCount : 0;

    return {
      periodPnL,
      tradesCount: periodSignals.length,
      wins,
      losses,
      breakeven,
      winRate,
      avgRR,
      bestDayPnL: Math.max(...dailyPnL, 0),
      worstDayPnL: Math.min(...dailyPnL, 0),
    };
  }, [dateRange, getSignalsInPeriod, trades, calculateRR]);

  // Pair Stats (provider's performance per pair)
  const pairStats = useMemo((): PairStats[] => {
    const pairMap = new Map<string, { category: string; signals: Signal[]; pnl: number }>();
    
    signals.forEach(s => {
      const existing = pairMap.get(s.pair) || { category: s.category, signals: [], pnl: 0 };
      existing.signals.push(s);
      pairMap.set(s.pair, existing);
    });
    
    trades.forEach(t => {
      if (!t.signal) return;
      const existing = pairMap.get(t.signal.pair);
      if (existing) {
        existing.pnl += t.pnl || 0;
      }
    });

    return Array.from(pairMap.entries()).map(([pair, data]) => {
      const closedSignals = data.signals.filter(s => ['tp_hit', 'sl_hit', 'breakeven'].includes(s.status));
      const wins = data.signals.filter(s => s.status === 'tp_hit').length;
      const losses = data.signals.filter(s => s.status === 'sl_hit').length;
      const breakeven = data.signals.filter(s => s.status === 'breakeven').length;
      
      let totalRR = 0;
      let rrCount = 0;
      closedSignals.forEach(s => {
        const rr = calculateRR(s);
        if (rr > 0) { totalRR += rr; rrCount++; }
      });

      return {
        pair,
        category: data.category,
        tradesCount: closedSignals.length,
        wins,
        losses,
        breakeven,
        winRate: calculateWinRatePercent(wins, losses),
        totalPnL: data.pnl,
        avgRR: rrCount > 0 ? totalRR / rrCount : 0,
      };
    }).sort((a, b) => b.totalPnL - a.totalPnL);
  }, [signals, trades, calculateRR]);

  // Equity curve data - aggregated per signal to avoid counting each follower separately
  const equityCurveData = useMemo((): EquityCurvePoint[] => {
    const STARTING_BALANCE = 10000;
    const RISK_PERCENT = globalRiskPercent / 100;
    
    // Get closed signals and calculate simulated P&L per signal
    const closedSignals = signals
      .filter(s => ['tp_hit', 'sl_hit', 'breakeven'].includes(s.status) && s.closed_at)
      .sort((a, b) => parseISO(a.closed_at!).getTime() - parseISO(b.closed_at!).getTime());

    let cumulativePnL = 0;
    let currentBalance = STARTING_BALANCE;
    const points: EquityCurvePoint[] = [
      { date: 'Start', balance: STARTING_BALANCE, pnl: 0, cumulativePnL: 0, label: 'Starting Balance' }
    ];

    closedSignals.forEach((signal, idx) => {
      const riskAmount = currentBalance * RISK_PERCENT;
      const rr = calculateRR(signal);
      
      let pnl = 0;
      if (signal.status === 'tp_hit') {
        pnl = riskAmount * rr; // Win: risk * R:R
      } else if (signal.status === 'sl_hit') {
        pnl = -riskAmount; // Loss: -risk amount
      }
      // breakeven = 0
      
      cumulativePnL += pnl;
      currentBalance = STARTING_BALANCE + cumulativePnL;
      
      points.push({
        date: format(parseISO(signal.closed_at!), 'MMM dd'),
        balance: currentBalance,
        pnl,
        cumulativePnL,
        label: `${signal.pair} (${signal.status === 'tp_hit' ? 'Win' : signal.status === 'sl_hit' ? 'Loss' : 'BE'})`,
      });
    });

    return points;
  }, [signals, globalRiskPercent, calculateRR]);

  return {
    signals,
    trades,
    providerStats,
    periodStats,
    pairStats,
    equityCurveData,
    globalRiskPercent,
    isLoading,
    period,
    setPeriod,
    dateRange,
    customRange,
    setCustomRange,
    refetch: fetchData,
  };
};
