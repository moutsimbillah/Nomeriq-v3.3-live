import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { 
  format, 
  startOfDay, 
  startOfWeek, 
  startOfMonth, 
  endOfDay, 
  endOfWeek, 
  endOfMonth, 
  subDays, 
  subWeeks, 
  subMonths,
  parseISO, 
  isWithinInterval,
  eachDayOfInterval,
  differenceInHours
} from 'date-fns';
import { calculateWinRatePercent } from '@/lib/kpi-math';

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
  created_by: string | null;
}

interface Trade {
  id: string;
  user_id: string;
  signal_id: string;
  risk_percent: number;
  risk_amount: number;
  pnl: number | null;
  result: string | null;
  created_at: string;
  closed_at: string | null;
  signal: Signal;
}

interface Profile {
  user_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
}

export type TimePeriod = 'today' | 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'custom';

export interface GlobalStats {
  totalSignals: number;
  activeSignals: number;
  completedTrades: number;
  totalWins: number;
  totalLosses: number;
  totalBreakeven: number;
  globalWinRate: number;
  avgRR: number;
  totalPlatformPnL: number;
  avgPnLPerTrade: number;
  totalRiskDeployed: number;
  avgRiskPerSignal: number;
}

export interface PeriodStats {
  periodPnL: number;
  periodGrowth: number;
  tradesCount: number;
  wins: number;
  losses: number;
  breakeven: number;
  winRate: number;
  avgRR: number;
  expectedValue: number;
  bestDayPnL: number;
  worstDayPnL: number;
}

export interface ProviderStats {
  userId: string;
  name: string;
  email: string;
  totalSignals: number;
  winRate: number;
  avgRR: number;
  totalPnL: number;
  avgPnLPerSignal: number;
  maxDrawdown: number;
  consistencyScore: number;
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

export interface CategoryStats {
  category: string;
  tradesCount: number;
  wins: number;
  losses: number;
  breakeven: number;
  winRate: number;
  totalPnL: number;
  avgRR: number;
}

export interface RiskStats {
  maxDrawdownPercent: number;
  maxDrawdownUSD: number;
  currentDrawdownPercent: number;
  recoveryProgress: number;
  worstLosingStreak: number;
  largestSingleLoss: number;
  largestSingleWin: number;
}

export interface QualityStats {
  qualityScore: number;
  avgWinStreak: number;
  avgLossStreak: number;
  bestWinStreak: number;
  worstLosingStreak: number;
  consistencyIndex: number;
  signalFrequencyPerDay: number;
  signalFrequencyPerWeek: number;
  signalFrequencyPerMonth: number;
}

export interface TradeDistribution {
  rrDistribution: { range: string; count: number }[];
  holdingTimeDistribution: { range: string; count: number }[];
  winLossDistribution: { type: string; count: number }[];
  avgTradeDuration: number;
  sessionPerformance: { session: string; wins: number; losses: number; pnl: number }[];
}

interface DateRange {
  from: Date;
  to: Date;
}

export const useGlobalTradeStats = () => {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [profiles, setProfiles] = useState<Map<string, Profile>>(new Map());
  const [globalRiskPercent, setGlobalRiskPercent] = useState<number>(2);
  const [isLoading, setIsLoading] = useState(true);
  const [period, setPeriod] = useState<TimePeriod>('this_week');
  const [customRange, setCustomRange] = useState<DateRange | null>(null);
  
  const channelRef = useRef(`global_stats_${Math.random().toString(36).substring(7)}`);
  const requestSeqRef = useRef(0);

  const fetchData = useCallback(async () => {
    const requestId = ++requestSeqRef.current;
    try {
      const [signalsRes, tradesRes, profilesRes, settingsRes] = await Promise.all([
        supabase.from('signals').select('*').eq('signal_type', 'signal').order('created_at', { ascending: false }),
        supabase.from('user_trades').select('*, signal:signals(*)').order('created_at', { ascending: false }),
        supabase.from('profiles').select('user_id, email, first_name, last_name'),
        supabase.from('global_settings').select('global_risk_percent').limit(1).maybeSingle()
      ]);

      if (signalsRes.error) throw signalsRes.error;
      if (tradesRes.error) throw tradesRes.error;
      if (requestId !== requestSeqRef.current) return;
      
      setSignals(signalsRes.data || []);
      setTrades((tradesRes.data as Trade[]) || []);
      
      if (settingsRes.data?.global_risk_percent) {
        setGlobalRiskPercent(settingsRes.data.global_risk_percent);
      }
      
      const profileMap = new Map<string, Profile>();
      (profilesRes.data || []).forEach(p => profileMap.set(p.user_id, p));
      setProfiles(profileMap);
    } catch (err) {
      if (requestId !== requestSeqRef.current) return;
      console.error('Error fetching global stats:', err);
    } finally {
      if (requestId === requestSeqRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

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

  // Global Stats
  const globalStats = useMemo((): GlobalStats => {
    const closedSignals = signals.filter(s => ['tp_hit', 'sl_hit', 'breakeven'].includes(s.status));
    const wins = signals.filter(s => s.status === 'tp_hit').length;
    const losses = signals.filter(s => s.status === 'sl_hit').length;
    const breakeven = signals.filter(s => s.status === 'breakeven').length;
    
    const closedTrades = trades.filter(t => t.result && t.result !== 'pending');
    const tradeWins = closedTrades.filter(t => t.result === 'win').length;
    const tradeLosses = closedTrades.filter(t => t.result === 'loss').length;
    const tradeBreakeven = closedTrades.filter(t => t.result === 'breakeven').length;
    
    const totalPnL = closedTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const totalRisk = trades.reduce((sum, t) => sum + t.risk_amount, 0);
    
    let totalRR = 0;
    let rrCount = 0;
    closedSignals.forEach(s => {
      const rr = calculateRR(s);
      if (rr > 0) { totalRR += rr; rrCount++; }
    });

    return {
      totalSignals: signals.length,
      activeSignals: signals.filter(s => s.status === 'active').length,
      completedTrades: closedTrades.length,
      totalWins: tradeWins,
      totalLosses: tradeLosses,
      totalBreakeven: tradeBreakeven,
      globalWinRate: calculateWinRatePercent(tradeWins, tradeLosses),
      avgRR: rrCount > 0 ? totalRR / rrCount : 0,
      totalPlatformPnL: totalPnL,
      avgPnLPerTrade: closedTrades.length > 0 ? totalPnL / closedTrades.length : 0,
      totalRiskDeployed: totalRisk,
      avgRiskPerSignal: signals.length > 0 ? totalRisk / signals.length : 0,
    };
  }, [signals, trades, calculateRR]);

  // Period Stats
  const periodStats = useMemo((): PeriodStats => {
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
    
    // Expected Value: (Win% * Avg Win) - (Loss% * Avg Loss)
    const avgWin = wins > 0 ? periodTrades.filter(t => t.result === 'win').reduce((s, t) => s + (t.pnl || 0), 0) / wins : 0;
    const avgLoss = losses > 0 ? Math.abs(periodTrades.filter(t => t.result === 'loss').reduce((s, t) => s + (t.pnl || 0), 0)) / losses : 0;
    const expectedValue = (winRate / 100 * avgWin) - ((100 - winRate) / 100 * avgLoss);

    return {
      periodPnL,
      periodGrowth: 0, // Would need starting balance context
      tradesCount: periodSignals.length,
      wins,
      losses,
      breakeven,
      winRate,
      avgRR,
      expectedValue,
      bestDayPnL: Math.max(...dailyPnL, 0),
      worstDayPnL: Math.min(...dailyPnL, 0),
    };
  }, [dateRange, getSignalsInPeriod, trades, calculateRR]);

  // Provider Stats
  const providerStats = useMemo((): ProviderStats[] => {
    const providerMap = new Map<string, { signals: Signal[]; pnl: number }>();
    
    signals.forEach(s => {
      if (!s.created_by) return;
      const existing = providerMap.get(s.created_by) || { signals: [], pnl: 0 };
      existing.signals.push(s);
      providerMap.set(s.created_by, existing);
    });
    
    // Add trade P&L to providers
    trades.forEach(t => {
      const signal = signals.find(s => s.id === t.signal_id);
      if (!signal?.created_by) return;
      const existing = providerMap.get(signal.created_by);
      if (existing) {
        existing.pnl += t.pnl || 0;
      }
    });

    return Array.from(providerMap.entries()).map(([userId, data]) => {
      const profile = profiles.get(userId);
      const closedSignals = data.signals.filter(s => ['tp_hit', 'sl_hit', 'breakeven'].includes(s.status));
      const wins = data.signals.filter(s => s.status === 'tp_hit').length;
      const losses = data.signals.filter(s => s.status === 'sl_hit').length;
      const winRate = calculateWinRatePercent(wins, losses);
      
      let totalRR = 0;
      let rrCount = 0;
      closedSignals.forEach(s => {
        const rr = calculateRR(s);
        if (rr > 0) { totalRR += rr; rrCount++; }
      });
      
      return {
        userId,
        name: profile ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || profile.email : 'Unknown',
        email: profile?.email || 'unknown',
        totalSignals: data.signals.length,
        winRate,
        avgRR: rrCount > 0 ? totalRR / rrCount : 0,
        totalPnL: data.pnl,
        avgPnLPerSignal: data.signals.length > 0 ? data.pnl / data.signals.length : 0,
        maxDrawdown: 0, // Complex calculation
        consistencyScore: winRate * 0.6 + Math.min((rrCount > 0 ? totalRR / rrCount : 0) / 2 * 40, 40),
      };
    }).sort((a, b) => b.totalPnL - a.totalPnL);
  }, [signals, trades, profiles, calculateRR]);

  // Pair Stats
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

  // Category Stats
  const categoryStats = useMemo((): CategoryStats[] => {
    const categoryMap = new Map<string, { signals: Signal[]; pnl: number }>();
    
    signals.forEach(s => {
      const existing = categoryMap.get(s.category) || { signals: [], pnl: 0 };
      existing.signals.push(s);
      categoryMap.set(s.category, existing);
    });
    
    trades.forEach(t => {
      if (!t.signal) return;
      const existing = categoryMap.get(t.signal.category);
      if (existing) {
        existing.pnl += t.pnl || 0;
      }
    });

    return Array.from(categoryMap.entries()).map(([category, data]) => {
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
        category,
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

  // Risk Stats
  const riskStats = useMemo((): RiskStats => {
    const closedTrades = trades.filter(t => t.result && t.result !== 'pending');
    const sortedTrades = [...closedTrades].sort((a, b) => 
      parseISO(a.closed_at || a.created_at).getTime() - parseISO(b.closed_at || b.created_at).getTime()
    );
    
    let peak = 0;
    let runningPnL = 0;
    let maxDrawdownUSD = 0;
    let maxDrawdownPercent = 0;
    let worstLosingStreak = 0;
    let currentLosingStreak = 0;
    let largestLoss = 0;
    let largestWin = 0;
    
    sortedTrades.forEach(t => {
      runningPnL += t.pnl || 0;
      if (runningPnL > peak) peak = runningPnL;
      
      const drawdown = peak - runningPnL;
      if (drawdown > maxDrawdownUSD) maxDrawdownUSD = drawdown;
      
      if (t.result === 'loss') {
        currentLosingStreak++;
        if (currentLosingStreak > worstLosingStreak) worstLosingStreak = currentLosingStreak;
        if (Math.abs(t.pnl || 0) > Math.abs(largestLoss)) largestLoss = t.pnl || 0;
      } else {
        currentLosingStreak = 0;
        if ((t.pnl || 0) > largestWin) largestWin = t.pnl || 0;
      }
    });
    
    const currentDrawdown = peak - runningPnL;
    const recoveryProgress = maxDrawdownUSD > 0 ? Math.max(0, ((maxDrawdownUSD - currentDrawdown) / maxDrawdownUSD) * 100) : 100;

    return {
      maxDrawdownPercent: peak > 0 ? (maxDrawdownUSD / peak) * 100 : 0,
      maxDrawdownUSD,
      currentDrawdownPercent: peak > 0 ? (currentDrawdown / peak) * 100 : 0,
      recoveryProgress,
      worstLosingStreak,
      largestSingleLoss: largestLoss,
      largestSingleWin: largestWin,
    };
  }, [trades]);

  // Quality Stats
  const qualityStats = useMemo((): QualityStats => {
    const closedSignals = signals.filter(s => ['tp_hit', 'sl_hit', 'breakeven'].includes(s.status));
    const sortedSignals = [...closedSignals].sort((a, b) => 
      parseISO(a.closed_at || a.created_at).getTime() - parseISO(b.closed_at || b.created_at).getTime()
    );
    
    // Calculate streaks
    const winStreaks: number[] = [];
    const lossStreaks: number[] = [];
    let currentWinStreak = 0;
    let currentLossStreak = 0;
    
    sortedSignals.forEach(s => {
      if (s.status === 'tp_hit') {
        currentWinStreak++;
        if (currentLossStreak > 0) { lossStreaks.push(currentLossStreak); currentLossStreak = 0; }
      } else if (s.status === 'sl_hit') {
        currentLossStreak++;
        if (currentWinStreak > 0) { winStreaks.push(currentWinStreak); currentWinStreak = 0; }
      }
    });
    if (currentWinStreak > 0) winStreaks.push(currentWinStreak);
    if (currentLossStreak > 0) lossStreaks.push(currentLossStreak);
    
    const avgWinStreak = winStreaks.length > 0 ? winStreaks.reduce((a, b) => a + b, 0) / winStreaks.length : 0;
    const avgLossStreak = lossStreaks.length > 0 ? lossStreaks.reduce((a, b) => a + b, 0) / lossStreaks.length : 0;
    const bestWinStreak = winStreaks.length > 0 ? Math.max(...winStreaks) : 0;
    const worstLosingStreak = lossStreaks.length > 0 ? Math.max(...lossStreaks) : 0;
    
    // Signal frequency
    const now = new Date();
    const lastWeek = subWeeks(now, 1);
    const lastMonth = subMonths(now, 1);
    const signalsThisWeek = signals.filter(s => parseISO(s.created_at) >= lastWeek).length;
    const signalsThisMonth = signals.filter(s => parseISO(s.created_at) >= lastMonth).length;
    
    // Quality score
    const wins = closedSignals.filter(s => s.status === 'tp_hit').length;
    const losses = closedSignals.filter(s => s.status === 'sl_hit').length;
    const winRate = calculateWinRatePercent(wins, losses);
    let totalRR = 0;
    closedSignals.forEach(s => { totalRR += calculateRR(s); });
    const avgRR = closedSignals.length > 0 ? totalRR / closedSignals.length : 0;
    
    const qualityScore = (winRate * 0.4) + Math.min((avgRR / 3) * 100, 100) * 0.3 + Math.min(100 - avgLossStreak * 10, 100) * 0.3;

    return {
      qualityScore: Math.min(100, qualityScore),
      avgWinStreak,
      avgLossStreak,
      bestWinStreak,
      worstLosingStreak,
      consistencyIndex: Math.max(0, 100 - (avgLossStreak * 15)),
      signalFrequencyPerDay: signalsThisWeek / 7,
      signalFrequencyPerWeek: signalsThisWeek,
      signalFrequencyPerMonth: signalsThisMonth,
    };
  }, [signals, calculateRR]);

  // Trade Distribution
  const tradeDistribution = useMemo((): TradeDistribution => {
    const closedTrades = trades.filter(t => t.result && t.result !== 'pending' && t.signal);
    
    // R:R distribution
    const rrRanges = [
      { range: '< 1:1', min: 0, max: 1 },
      { range: '1:1 - 1:2', min: 1, max: 2 },
      { range: '1:2 - 1:3', min: 2, max: 3 },
      { range: '> 1:3', min: 3, max: Infinity },
    ];
    const rrDistribution = rrRanges.map(r => {
      const count = closedTrades.filter(t => {
        const rr = calculateRR(t.signal);
        return rr >= r.min && rr < r.max;
      }).length;
      return { range: r.range, count };
    });
    
    // Holding time distribution
    const holdingTimes = closedTrades.map(t => {
      if (!t.closed_at) return 0;
      return differenceInHours(parseISO(t.closed_at), parseISO(t.created_at));
    }).filter(h => h > 0);
    
    const holdingRanges = [
      { range: '< 1h', min: 0, max: 1 },
      { range: '1-4h', min: 1, max: 4 },
      { range: '4-24h', min: 4, max: 24 },
      { range: '1-3 days', min: 24, max: 72 },
      { range: '> 3 days', min: 72, max: Infinity },
    ];
    const holdingTimeDistribution = holdingRanges.map(r => ({
      range: r.range,
      count: holdingTimes.filter(h => h >= r.min && h < r.max).length,
    }));
    
    const avgDuration = holdingTimes.length > 0 ? holdingTimes.reduce((a, b) => a + b, 0) / holdingTimes.length : 0;
    
    // Win/Loss distribution
    const winLossDistribution = [
      { type: 'Wins', count: closedTrades.filter(t => t.result === 'win').length },
      { type: 'Losses', count: closedTrades.filter(t => t.result === 'loss').length },
      { type: 'Breakeven', count: closedTrades.filter(t => t.result === 'breakeven').length },
    ];
    
    // Session performance (Asia/London/NY based on signal creation hour)
    const sessionPerformance = [
      { session: 'Asia (00:00-08:00)', wins: 0, losses: 0, pnl: 0 },
      { session: 'London (08:00-16:00)', wins: 0, losses: 0, pnl: 0 },
      { session: 'New York (16:00-24:00)', wins: 0, losses: 0, pnl: 0 },
    ];
    
    closedTrades.forEach(t => {
      const hour = parseISO(t.created_at).getUTCHours();
      let sessionIndex = 0;
      if (hour >= 8 && hour < 16) sessionIndex = 1;
      else if (hour >= 16) sessionIndex = 2;
      
      sessionPerformance[sessionIndex].pnl += t.pnl || 0;
      if (t.result === 'win') sessionPerformance[sessionIndex].wins++;
      else if (t.result === 'loss') sessionPerformance[sessionIndex].losses++;
    });

    return {
      rrDistribution,
      holdingTimeDistribution,
      winLossDistribution,
      avgTradeDuration: avgDuration,
      sessionPerformance,
    };
  }, [trades, calculateRR]);

  // Equity Curve Data - Uses real global risk setting
  const equityCurveData = useMemo(() => {
    const STARTING_BALANCE = 10000;
    const RISK_PER_TRADE = globalRiskPercent / 100; // Use global risk from settings
    
    // Get unique signals that are closed, sorted by closed_at
    const closedSignals = signals
      .filter(s => ['tp_hit', 'sl_hit', 'breakeven'].includes(s.status) && s.closed_at)
      .sort((a, b) => parseISO(a.closed_at!).getTime() - parseISO(b.closed_at!).getTime());
    
    if (closedSignals.length === 0) {
      return [{ date: 'Start', value: STARTING_BALANCE }];
    }
    
    let balance = STARTING_BALANCE;
    const data = [{ date: format(parseISO(closedSignals[0].created_at), 'MMM dd'), value: balance }];
    
    closedSignals.forEach(signal => {
      const riskAmount = balance * RISK_PER_TRADE;
      const rr = calculateRR(signal);
      
      if (signal.status === 'tp_hit') {
        balance += riskAmount * rr;
      } else if (signal.status === 'sl_hit') {
        balance -= riskAmount;
      }
      // breakeven = no change
      
      data.push({
        date: format(parseISO(signal.closed_at!), 'MMM dd'),
        value: Math.round(balance * 100) / 100,
      });
    });
    
    return data;
  }, [signals, calculateRR, globalRiskPercent]);

  return {
    signals,
    trades,
    globalStats,
    periodStats,
    providerStats,
    pairStats,
    categoryStats,
    riskStats,
    qualityStats,
    tradeDistribution,
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
