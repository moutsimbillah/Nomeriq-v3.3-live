import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { startOfMonth, endOfMonth, format, parseISO, startOfWeek, getWeek, isSameMonth } from 'date-fns';

interface DayData {
  date: Date;
  trades: number;
  pnl: number;
  isCurrentMonth: boolean;
}

interface WeekData {
  weekNumber: number;
  trades: number;
  pnl: number;
}

interface CalendarStats {
  tradingDays: number;
  totalTrades: number;
  profitableDays: number;
  losingDays: number;
  totalPnL: number;
  avgDailyPnL: number;
  bestDay: { date: string; pnl: number } | null;
  worstDay: { date: string; pnl: number } | null;
}

// Create stable initial values outside component
const initialDayData = new Map<string, DayData>();
const initialWeekData = new Map<number, WeekData>();
const initialStats: CalendarStats = {
  tradingDays: 0,
  totalTrades: 0,
  profitableDays: 0,
  losingDays: 0,
  totalPnL: 0,
  avgDailyPnL: 0,
  bestDay: null,
  worstDay: null,
};

export const useCalendarTrades = (currentMonth: Date) => {
  const { user, isAdmin } = useAuth();
  const [dayData, setDayData] = useState<Map<string, DayData>>(() => new Map());
  const [weekData, setWeekData] = useState<Map<number, WeekData>>(() => new Map());
  const [stats, setStats] = useState<CalendarStats>(initialStats);
  const [isLoading, setIsLoading] = useState(true);
  const [isProvider, setIsProvider] = useState(false);
  const [roleLoading, setRoleLoading] = useState(true);

  // Fetch admin role inline to avoid hook ordering issues
  useEffect(() => {
    const fetchAdminRole = async () => {
      if (!user || !isAdmin) {
        setIsProvider(false);
        setRoleLoading(false);
        return;
      }

      try {
        const { data } = await supabase
          .from('admin_roles')
          .select('admin_role')
          .eq('user_id', user.id)
          .eq('status', 'active')
          .maybeSingle();
        
        const role = data?.admin_role;
        setIsProvider(role === 'signal_provider_admin' || role === 'super_admin');
      } catch (err) {
        console.error('Error fetching admin role:', err);
        setIsProvider(false);
      } finally {
        setRoleLoading(false);
      }
    };

    fetchAdminRole();
  }, [user, isAdmin]);

  const fetchCalendarData = useCallback(async () => {
    if (!user || roleLoading) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      
      const monthStart = startOfMonth(currentMonth);
      const monthEnd = endOfMonth(currentMonth);

      let trades: any[] = [];

      if (isProvider) {
        // For providers: fetch ALL trades from signals they created (from all users)
        const { data, error } = await supabase
          .from('user_trades')
          .select(`
            *,
            signal:signals!inner(created_by)
          `)
          .eq('signal.created_by', user.id)
          .gte('closed_at', monthStart.toISOString())
          .lte('closed_at', monthEnd.toISOString())
          .not('result', 'eq', 'pending');

        if (error) throw error;
        trades = data || [];
      } else {
        // For regular users: fetch only their own trades
        const { data, error } = await supabase
          .from('user_trades')
          .select(`
            *,
            signal:signals(created_by)
          `)
          .eq('user_id', user.id)
          .gte('closed_at', monthStart.toISOString())
          .lte('closed_at', monthEnd.toISOString())
          .not('result', 'eq', 'pending');

        if (error) throw error;
        trades = data || [];
      }
      const dayMap = new Map<string, DayData>();
      const weekMap = new Map<number, WeekData>();

      // Process trades by day
      trades.forEach((trade) => {
        if (!trade.closed_at) return;
        
        const tradeDate = parseISO(trade.closed_at);
        const dateKey = format(tradeDate, 'yyyy-MM-dd');
        const weekNum = getWeek(tradeDate, { weekStartsOn: 0 });

        // Update day data
        const existing = dayMap.get(dateKey) || {
          date: tradeDate,
          trades: 0,
          pnl: 0,
          isCurrentMonth: isSameMonth(tradeDate, currentMonth),
        };
        existing.trades += 1;
        existing.pnl += trade.pnl || 0;
        dayMap.set(dateKey, existing);

        // Update week data
        const existingWeek = weekMap.get(weekNum) || {
          weekNumber: weekNum,
          trades: 0,
          pnl: 0,
        };
        existingWeek.trades += 1;
        existingWeek.pnl += trade.pnl || 0;
        weekMap.set(weekNum, existingWeek);
      });

      setDayData(dayMap);
      setWeekData(weekMap);

      // Calculate stats
      const dayArray = Array.from(dayMap.values());
      const tradingDays = dayArray.length;
      const totalTrades = dayArray.reduce((sum, d) => sum + d.trades, 0);
      const profitableDays = dayArray.filter(d => d.pnl > 0).length;
      const losingDays = dayArray.filter(d => d.pnl < 0).length;
      const totalPnL = dayArray.reduce((sum, d) => sum + d.pnl, 0);
      const avgDailyPnL = tradingDays > 0 ? totalPnL / tradingDays : 0;

      let bestDay: { date: string; pnl: number } | null = null;
      let worstDay: { date: string; pnl: number } | null = null;

      dayArray.forEach((day) => {
        const dateStr = format(day.date, 'yyyy-MM-dd');
        if (!bestDay || day.pnl > bestDay.pnl) {
          bestDay = { date: dateStr, pnl: day.pnl };
        }
        if (!worstDay || day.pnl < worstDay.pnl) {
          worstDay = { date: dateStr, pnl: day.pnl };
        }
      });

      setStats({
        tradingDays,
        totalTrades,
        profitableDays,
        losingDays,
        totalPnL,
        avgDailyPnL,
        bestDay,
        worstDay,
      });
    } catch (err) {
      console.error('Error fetching calendar data:', err);
    } finally {
      setIsLoading(false);
    }
  }, [user, currentMonth, isProvider, roleLoading]);

  useEffect(() => {
    if (!roleLoading) {
      fetchCalendarData();
    }
  }, [fetchCalendarData, roleLoading]);

  // Generate calendar grid days
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const calStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    
    const days: DayData[] = [];
    let current = calStart;
    
    // Generate 6 weeks of days (42 days)
    for (let i = 0; i < 42; i++) {
      const dateKey = format(current, 'yyyy-MM-dd');
      const existingData = dayData.get(dateKey);
      
      days.push({
        date: new Date(current),
        trades: existingData?.trades || 0,
        pnl: existingData?.pnl || 0,
        isCurrentMonth: isSameMonth(current, currentMonth),
      });
      
      current = new Date(current);
      current.setDate(current.getDate() + 1);
    }
    
    return days;
  }, [currentMonth, dayData]);

  // Get profit/loss ratio for gradient bar
  const profitLossRatio = useMemo(() => {
    if (stats.profitableDays + stats.losingDays === 0) return 0.5;
    return stats.profitableDays / (stats.profitableDays + stats.losingDays);
  }, [stats]);

  return {
    calendarDays,
    weekData,
    stats,
    isLoading,
    profitLossRatio,
    refetch: fetchCalendarData,
  };
};
