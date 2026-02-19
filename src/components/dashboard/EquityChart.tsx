import { AreaChart, Area, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer } from "recharts";
import { useAuth } from "@/contexts/AuthContext";
import { useProviderAwareTrades } from "@/hooks/useProviderAwareTrades";
import { useProviderAwareSignals } from "@/hooks/useProviderAwareSignals";
import { useAdminRole } from "@/hooks/useAdminRole";
import { useBrand } from "@/contexts/BrandContext";
import { useMemo, useState, useEffect, useRef } from "react";
import { format, parseISO, subMonths, subWeeks, subYears } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { TrendingUp, TrendingDown, Wallet, Target, ArrowUpRight, ArrowDownRight, Shield, AlertTriangle, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { calculateSignalRr } from "@/lib/trade-math";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type Period = "1W" | "1M" | "3M" | "1Y" | "ALL";

// Calculate R:R for a signal
const calculateRR = (signal: any): number => {
  return calculateSignalRr({ signal });
};

const hasSameDayCollisions = (dates: Date[]) => {
  const seen = new Set<string>();
  for (const d of dates) {
    const key = format(d, "yyyy-MM-dd");
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
};

interface EquityChartProps {
  adminGlobalView?: boolean;
  adminGlobalStartingBalance?: number;
  adminGlobalCurrentBalance?: number;
}

export const EquityChart = ({
  adminGlobalView = false,
  adminGlobalStartingBalance,
  adminGlobalCurrentBalance,
}: EquityChartProps) => {
  const { profile, user } = useAuth();
  const { trades } = useProviderAwareTrades({ fetchAll: true, realtime: true, adminGlobalView });
  const { signals } = useProviderAwareSignals({ realtime: true, fetchAll: true, adminGlobalView });
  const { isProvider, isLoading: roleLoading } = useAdminRole();
  const { settings } = useBrand();
  const [period, setPeriod] = useState<Period>("1Y");
  const [currentBalance, setCurrentBalance] = useState<number>(0);
  const providerScopedMode = isProvider && !adminGlobalView;

  const getValidStartingBalance = (candidate: number | null | undefined) =>
    typeof candidate === "number" && Number.isFinite(candidate) && candidate > 0
      ? candidate
      : null;
  const getValidBalance = (candidate: number | null | undefined) =>
    typeof candidate === "number" && Number.isFinite(candidate)
      ? candidate
      : null;

  // Regular users use live profile balance; providers use a fixed starting balance simulation
  const globalRiskPercent = settings?.global_risk_percent || 2;

  // Fetch profile balance for regular user mode only.
  useEffect(() => {
    if (adminGlobalView) return;
    if (profile?.account_balance !== undefined) {
      setCurrentBalance(profile.account_balance || 0);
    }
  }, [profile?.account_balance, adminGlobalView]);

  // Use unique channel name for balance updates
  const balanceChannelRef = useRef(`equity_balance_${Math.random().toString(36).substring(7)}`);

  // Subscribe to profile updates for real-time balance changes
  useEffect(() => {
    if (!user || adminGlobalView || (providerScopedMode && !roleLoading)) return;
    const channel = supabase
      .channel(balanceChannelRef.current)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          if (
            payload.new &&
            typeof payload.new === 'object' &&
            'account_balance' in payload.new
          ) {
            setCurrentBalance((payload.new as { account_balance: number }).account_balance || 0);
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, providerScopedMode, roleLoading, adminGlobalView]);

  // Provider mode: use actual profile balance + fixed starting balance baseline.
  // Regular users: actual trade history
  const { startingBalance, totalPnL, effectiveCurrentBalance } = useMemo(() => {
    if (providerScopedMode && !roleLoading) {
      // Providers should see their real profile equity metrics.
      const fixedStarting =
        getValidStartingBalance(profile?.starting_balance) ??
        getValidStartingBalance(profile?.account_balance) ??
        1000;
      const liveProfileBalance =
        getValidBalance(currentBalance) ??
        getValidBalance(profile?.account_balance) ??
        fixedStarting;
      const pnl = liveProfileBalance - fixedStarting;

      return {
        startingBalance: fixedStarting,
        totalPnL: Number.isFinite(pnl) ? pnl : 0,
        effectiveCurrentBalance: Number.isFinite(liveProfileBalance) ? liveProfileBalance : fixedStarting,
      };
    }

    // Admin global mode: derive equity from all closed trade P&L.
    if (adminGlobalView) {
      const closedTrades = trades.filter((t) => t.result === "win" || t.result === "loss" || t.result === "breakeven");
      const tradePnL = closedTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
      const fixedStarting =
        getValidBalance(adminGlobalStartingBalance) ??
        0;
      const aggregatedCurrent =
        getValidBalance(adminGlobalCurrentBalance) ??
        (fixedStarting + tradePnL);
      const pnl = aggregatedCurrent - fixedStarting;

      return {
        startingBalance: fixedStarting,
        totalPnL: Number.isFinite(pnl) ? pnl : 0,
        effectiveCurrentBalance: Number.isFinite(aggregatedCurrent) ? aggregatedCurrent : fixedStarting,
      };
    }

    // Regular user mode: Use actual profile balance and trade history
    const tradePnL = trades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const persistedStarting = getValidStartingBalance(profile?.starting_balance);
    const derivedStarting = currentBalance - tradePnL;
    const safeDerivedStarting =
      Number.isFinite(derivedStarting) && derivedStarting > 0
        ? derivedStarting
        : getValidStartingBalance(currentBalance) ?? 1000;
    const calcStartingBalance = persistedStarting ?? safeDerivedStarting;

    return {
      startingBalance: calcStartingBalance,
      totalPnL: tradePnL,
      effectiveCurrentBalance: currentBalance,
    };
  }, [
    providerScopedMode,
    roleLoading,
    signals,
    trades,
    currentBalance,
    settings?.global_risk_percent,
    profile?.account_balance,
    profile?.starting_balance,
    adminGlobalView,
    adminGlobalStartingBalance,
    adminGlobalCurrentBalance,
  ]);

  const chartData = useMemo(() => {
    const now = new Date();
    let startDate: Date;
    switch (period) {
      case "1W":
        startDate = subWeeks(now, 1);
        break;
      case "1M":
        startDate = subMonths(now, 1);
        break;
      case "3M":
        startDate = subMonths(now, 3);
        break;
      case "1Y":
        startDate = subYears(now, 1);
        break;
      case "ALL":
      default:
        startDate = new Date(0);
        break;
    }

    if (providerScopedMode && !roleLoading) {
      return [
        { date: "Start", value: Math.round(startingBalance * 100) / 100 },
        { date: "Now", value: Math.round(effectiveCurrentBalance * 100) / 100 },
      ];
    } else {
      // Regular user mode: Build chart from trades
      const filteredTrades = trades
        .filter(t => new Date(t.created_at) >= startDate)
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

      if (filteredTrades.length === 0) {
        return [
          { date: "Start", value: startingBalance > 0 ? startingBalance : effectiveCurrentBalance },
          { date: "Now", value: effectiveCurrentBalance }
        ];
      }

      // Calculate P&L from filtered trades to get the correct starting point
      const filteredPnL = filteredTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
      const periodStartBalance = effectiveCurrentBalance - filteredPnL;

      const showTimeOnAxis = hasSameDayCollisions(
        filteredTrades.map((t) => new Date(t.created_at))
      );
      const axisFormat = showTimeOnAxis ? "MMM dd HH:mm" : "MMM dd";

      // Build cumulative balance from trades
      let balance = periodStartBalance;
      const data = [{ date: format(startDate, axisFormat), value: balance }];
      
      filteredTrades.forEach(trade => {
        balance += trade.pnl || 0;
        data.push({
          date: format(new Date(trade.created_at), axisFormat),
          value: Math.round(balance * 100) / 100
        });
      });
      
      return data;
    }
  }, [trades, signals, period, startingBalance, effectiveCurrentBalance, providerScopedMode, roleLoading, globalRiskPercent, profile?.account_balance]);

  const growth = startingBalance > 0 ? ((effectiveCurrentBalance - startingBalance) / startingBalance) * 100 : 0;
  const pnlAmount = effectiveCurrentBalance - startingBalance;
  const hasNoActivity = providerScopedMode ? false : trades.length === 0;
  const isPositive = growth >= 0;
  const growthSubtitle = adminGlobalView
    ? "Track global user balance growth over time"
    : "Track your account growth over time";
  const startingBalanceLabel = adminGlobalView
    ? "Global Starting Balance"
    : "Starting Balance";
  const currentBalanceLabel = adminGlobalView
    ? "Global Current Balance"
    : "Current Balance";
  const growthLabel = adminGlobalView
    ? "Global Total Growth"
    : "Total Growth";
  const startingBalanceTooltip = adminGlobalView
    ? "Sum of user starting balances used as the global baseline."
    : "Balance at the beginning of this equity calculation period.";
  const currentBalanceTooltip = adminGlobalView
    ? "Current global balance derived from aggregated user balances."
    : "Latest account balance including closed and currently reflected PnL.";
  const growthTooltip = adminGlobalView
    ? "Percentage return from Global Starting Balance to Global Current Balance."
    : "Percentage return from Starting Balance to Current Balance.";

  // Calculate Account Health Meter
  const accountHealth = useMemo(() => {
    if (providerScopedMode && !roleLoading) {
      // Provider mode: Calculate health from signals using actual balance
      const providerBalance =
        startingBalance > 0
          ? startingBalance
          : getValidStartingBalance(profile?.starting_balance) ??
            getValidStartingBalance(profile?.account_balance) ??
            1000;
      const RISK_PERCENT = globalRiskPercent / 100;
      
      const closedSignals = signals
        .filter(s => ['tp_hit', 'sl_hit', 'breakeven'].includes(s.status) && s.closed_at)
        .sort((a, b) => parseISO(a.closed_at!).getTime() - parseISO(b.closed_at!).getTime());
      
      let peak = startingBalance > 0 ? startingBalance : providerBalance;
      let runningBalance = startingBalance > 0 ? startingBalance : providerBalance;
      let currentDrawdown = 0;
      let maxDrawdown = 0;
      
      closedSignals.forEach(signal => {
        const riskAmount = runningBalance * RISK_PERCENT;
        const rr = calculateRR(signal);
        
        if (signal.status === 'tp_hit') {
          runningBalance += riskAmount * rr;
        } else if (signal.status === 'sl_hit') {
          runningBalance -= riskAmount;
        }
        
        if (runningBalance > peak) peak = runningBalance;
        currentDrawdown = peak > 0 ? ((peak - runningBalance) / peak) * 100 : 0;
        if (currentDrawdown > maxDrawdown) maxDrawdown = currentDrawdown;
      });
      
      // Calculate consecutive losses from signals
      let consecutiveLosses = 0;
      for (let i = closedSignals.length - 1; i >= 0; i--) {
        if (closedSignals[i].status === 'sl_hit') {
          consecutiveLosses++;
        } else {
          break;
        }
      }
      
      // Risk exposure from pending signals
      const pendingSignals = signals.filter(s => s.status === 'active');
      const riskExposurePercent = pendingSignals.length * globalRiskPercent;
      
      // Equity slope from last 5 signals
      const recentSignals = closedSignals.slice(-5);
      let equitySlope = 0;
      if (recentSignals.length >= 2) {
        const wins = recentSignals.filter(s => s.status === 'tp_hit').length;
        const losses = recentSignals.filter(s => s.status === 'sl_hit').length;
        equitySlope = wins >= losses ? 1 : -1;
      }
      
      // Calculate health score
      let healthScore = 100;
      healthScore -= Math.min(currentDrawdown * 2, 40);
      healthScore -= Math.min(consecutiveLosses * 10, 30);
      healthScore -= Math.min(riskExposurePercent * 2, 20);
      healthScore += equitySlope * 10;
      healthScore = Math.max(0, Math.min(100, healthScore));
      
      let status: 'safe' | 'warning' | 'critical' = 'safe';
      if (healthScore < 40) status = 'critical';
      else if (healthScore < 70) status = 'warning';
      
      return {
        score: healthScore,
        status,
        currentDrawdown,
        maxDrawdown,
        consecutiveLosses,
        riskExposurePercent,
        equitySlope,
      };
    } else {
      // Regular user mode
      const closedTrades = trades.filter(t => t.result === 'win' || t.result === 'loss' || t.result === 'breakeven');
      
      // Calculate current drawdown
      let peak = startingBalance > 0 ? startingBalance : effectiveCurrentBalance;
      let maxDrawdown = 0;
      let runningBalance = startingBalance > 0 ? startingBalance : effectiveCurrentBalance;
      
      const sortedTrades = [...closedTrades].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      
      sortedTrades.forEach(trade => {
        runningBalance += trade.pnl || 0;
        if (runningBalance > peak) peak = runningBalance;
        const drawdown = peak > 0 ? ((peak - runningBalance) / peak) * 100 : 0;
        if (drawdown > maxDrawdown) maxDrawdown = drawdown;
      });
      
      const rawCurrentDrawdown = peak > 0 ? ((peak - effectiveCurrentBalance) / peak) * 100 : 0;
      const currentDrawdown = Math.max(0, rawCurrentDrawdown);
      
      // Calculate consecutive losses
      let consecutiveLosses = 0;
      for (let i = sortedTrades.length - 1; i >= 0; i--) {
        if (sortedTrades[i].result === 'loss') {
          consecutiveLosses++;
        } else {
          break;
        }
      }
      
      // Calculate risk exposure (pending trades as % of balance)
      const pendingTrades = trades.filter(t => t.result === 'pending');
      const totalRiskExposure = pendingTrades.reduce((sum, t) => sum + (t.risk_amount || 0), 0);
      const riskExposurePercent = effectiveCurrentBalance > 0 ? (totalRiskExposure / effectiveCurrentBalance) * 100 : 0;
      
      // Calculate equity slope (last 5 trades trend)
      const recentTrades = sortedTrades.slice(-5);
      let equitySlope = 0;
      if (recentTrades.length >= 2) {
        const recentPnL = recentTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
        equitySlope = recentPnL >= 0 ? 1 : -1;
      }
      
      // Calculate health score (0-100)
      let healthScore = 100;
      
      // Drawdown impact (up to -40 points)
      healthScore -= Math.min(currentDrawdown * 2, 40);
      
      // Consecutive losses impact (up to -30 points)
      healthScore -= Math.min(consecutiveLosses * 10, 30);
      
      // Risk exposure impact (up to -20 points)
      healthScore -= Math.min(riskExposurePercent * 2, 20);
      
      // Equity slope bonus/penalty (up to ±10 points)
      healthScore += equitySlope * 10;
      
      healthScore = Math.max(0, Math.min(100, healthScore));
      
      let status: 'safe' | 'warning' | 'critical' = 'safe';
      if (healthScore < 40) status = 'critical';
      else if (healthScore < 70) status = 'warning';
      
      return {
        score: healthScore,
        status,
        currentDrawdown,
        maxDrawdown,
        consecutiveLosses,
        riskExposurePercent,
        equitySlope,
      };
    }
  }, [trades, signals, effectiveCurrentBalance, startingBalance, providerScopedMode, roleLoading, globalRiskPercent, profile?.account_balance]);

  return (
    <TooltipProvider>
    <div className="glass-card p-6 shadow-none h-full flex flex-col">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className={cn(
            "p-2.5 rounded-xl",
            isPositive ? "bg-success/10" : "bg-destructive/10"
          )}>
            {isPositive ? (
              <TrendingUp className="w-5 h-5 text-success" />
            ) : (
              <TrendingDown className="w-5 h-5 text-destructive" />
            )}
          </div>
          <div>
            <h3 className="font-semibold text-lg">Equity Curve</h3>
            <p className="text-sm text-muted-foreground">{growthSubtitle}</p>
          </div>
        </div>
        
        {/* Period Selector */}
        <div className="flex items-center gap-1 p-1 rounded-lg bg-secondary/50">
          {(["1W", "1M", "3M", "1Y", "ALL"] as Period[]).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200",
                period === p
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              )}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {/* Starting Balance */}
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="p-4 rounded-xl bg-secondary/30 border border-border/50">
              <div className="flex items-center gap-2 mb-2">
                <Wallet className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{startingBalanceLabel}</span>
              </div>
              <p className="text-2xl font-bold font-mono">
                ${(startingBalance > 0 ? startingBalance : effectiveCurrentBalance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
          </TooltipTrigger>
          <TooltipContent>{startingBalanceTooltip}</TooltipContent>
        </Tooltip>

        {/* Current Balance */}
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={cn(
              "p-4 rounded-xl border",
              isPositive 
                ? "bg-success/5 border-success/20" 
                : "bg-destructive/5 border-destructive/20"
            )}>
              <div className="flex items-center gap-2 mb-2">
                <Target className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{currentBalanceLabel}</span>
              </div>
              <div className="flex items-baseline gap-2">
                <p className={cn(
                  "text-2xl font-bold font-mono",
                  isPositive ? "text-success" : "text-destructive"
                )}>
                  ${effectiveCurrentBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
                <span className={cn(
                  "text-xs font-medium flex items-center gap-0.5",
                  isPositive ? "text-success" : "text-destructive"
                )}>
                  {isPositive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                  {isPositive ? "+" : ""}{pnlAmount.toFixed(2)}
                </span>
              </div>
            </div>
          </TooltipTrigger>
          <TooltipContent>{currentBalanceTooltip}</TooltipContent>
        </Tooltip>

        {/* Total Growth */}
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={cn(
              "p-4 rounded-xl border",
              isPositive 
                ? "bg-success/5 border-success/20" 
                : "bg-destructive/5 border-destructive/20"
            )}>
              <div className="flex items-center gap-2 mb-2">
                {isPositive ? (
                  <TrendingUp className="w-4 h-4 text-success" />
                ) : (
                  <TrendingDown className="w-4 h-4 text-destructive" />
                )}
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{growthLabel}</span>
              </div>
              <div className="flex items-baseline gap-2">
                <p className={cn(
                  "text-2xl font-bold font-mono",
                  isPositive ? "text-success" : "text-destructive"
                )}>
                  {isPositive ? "+" : ""}{growth.toFixed(2)}%
                </p>
                <span className={cn(
                  "text-xs font-medium px-1.5 py-0.5 rounded-full",
                  isPositive 
                    ? "bg-success/20 text-success" 
                    : "bg-destructive/20 text-destructive"
                )}>
                  {isPositive ? "Profit" : "Loss"}
                </span>
              </div>
            </div>
          </TooltipTrigger>
          <TooltipContent>{growthTooltip}</TooltipContent>
        </Tooltip>
      </div>

      {/* Chart */}
      <div className="flex-1 min-h-[360px] lg:min-h-[430px] p-4 rounded-xl bg-secondary/20">
        {hasNoActivity ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <div className="text-center">
              <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-secondary/50 flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-muted-foreground/50" />
              </div>
              <p className="text-base font-medium">No trading activity yet</p>
              <p className="text-sm mt-1 text-muted-foreground/70">Your equity curve will appear once you have trades</p>
            </div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop 
                    offset="0%" 
                    stopColor={isPositive ? "hsl(var(--success))" : "hsl(var(--destructive))"} 
                    stopOpacity={0.25} 
                  />
                  <stop 
                    offset="100%" 
                    stopColor={isPositive ? "hsl(var(--success))" : "hsl(var(--destructive))"} 
                    stopOpacity={0} 
                  />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="date"
                axisLine={false}
                tickLine={false}
                dy={10}
                interval="preserveStartEnd"
                minTickGap={36}
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                tickFormatter={(value) => {
                  const text = String(value ?? "");
                  // Compact format for dense intra-day labels: "09 14:52" instead of "Feb 09 14:52".
                  const match = text.match(/^([A-Za-z]{3}\s+\d{2})\s+(\d{2}:\d{2})$/);
                  if (match) {
                    const [, day, time] = match;
                    const dayNum = day.split(/\s+/)[1] || day;
                    return `${dayNum} ${time}`;
                  }
                  return text;
                }}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                dx={-5}
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                tickFormatter={value => `$${(value / 1000).toFixed(1)}k`}
                width={50}
              />
              <RechartsTooltip
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    const value = payload[0].value as number;
                    return (
                      <div className="bg-popover border border-border rounded-lg p-3 shadow-lg">
                        <p className="text-xs text-muted-foreground mb-1">{label}</p>
                        <p className={cn(
                          "text-lg font-bold font-mono",
                          isPositive ? "text-success" : "text-destructive"
                        )}>
                          ${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke={isPositive ? "hsl(var(--success))" : "hsl(var(--destructive))"}
                strokeWidth={2.5}
                fill="url(#equityGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Account Health Meter */}
      <div className="mt-6 xl:mt-auto p-4 rounded-xl bg-secondary/30 border border-border/50">
        <div className="flex items-center gap-2 mb-4">
          {accountHealth.status === 'safe' && <Shield className="w-5 h-5 text-success" />}
          {accountHealth.status === 'warning' && <AlertTriangle className="w-5 h-5 text-warning" />}
          {accountHealth.status === 'critical' && <AlertCircle className="w-5 h-5 text-destructive" />}
          <h4 className="font-semibold">Account Health Meter</h4>
          <div className={cn(
            "ml-auto px-2.5 py-1 rounded-full text-xs font-semibold uppercase tracking-wide",
            accountHealth.status === 'safe' && "bg-success/20 text-success",
            accountHealth.status === 'warning' && "bg-warning/20 text-warning",
            accountHealth.status === 'critical' && "bg-destructive/20 text-destructive"
          )}>
            {accountHealth.status}
          </div>
        </div>

        {/* Health Score Gauge */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">Health Score</span>
            <span className={cn(
              "text-lg font-bold font-mono",
              accountHealth.status === 'safe' && "text-success",
              accountHealth.status === 'warning' && "text-warning",
              accountHealth.status === 'critical' && "text-destructive"
            )}>
              {accountHealth.score.toFixed(0)}%
            </span>
          </div>
          <div className="relative">
            <div className="h-3 w-full rounded-full bg-secondary overflow-hidden">
              <div 
                className="h-full rounded-full transition-all duration-500"
                style={{ 
                  width: `${accountHealth.score}%`,
                  background: `linear-gradient(90deg, hsl(0, 70%, 45%) 0%, hsl(45, 90%, 50%) 50%, hsl(120, 60%, 45%) 100%)`,
                  backgroundSize: '100% 100%',
                  backgroundPosition: `${100 - accountHealth.score}% 0`
                }}
              />
            </div>
            {/* Gauge markers */}
            <div className="absolute top-0 left-[40%] w-px h-3 bg-border/50" />
            <div className="absolute top-0 left-[70%] w-px h-3 bg-border/50" />
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[10px] text-muted-foreground">Critical</span>
            <span className="text-[10px] text-muted-foreground">Warning</span>
            <span className="text-[10px] text-muted-foreground">Safe</span>
          </div>
        </div>

        {/* Health Factors */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="p-3 rounded-lg bg-secondary/50">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Current Drawdown</p>
                <p className={cn(
                  "text-sm font-bold font-mono",
                  accountHealth.currentDrawdown > 15 ? "text-destructive" : 
                  accountHealth.currentDrawdown > 5 ? "text-warning" : "text-success"
                )}>
                  {accountHealth.currentDrawdown.toFixed(1)}%
                </p>
              </div>
            </TooltipTrigger>
            <TooltipContent>How far current equity is below its latest peak.</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <div className="p-3 rounded-lg bg-secondary/50">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Max Drawdown</p>
                <p className={cn(
                  "text-sm font-bold font-mono",
                  accountHealth.maxDrawdown > 15 ? "text-destructive" :
                  accountHealth.maxDrawdown > 5 ? "text-warning" : "text-success"
                )}>
                  {accountHealth.maxDrawdown.toFixed(1)}%
                </p>
              </div>
            </TooltipTrigger>
            <TooltipContent>Largest peak-to-trough drop recorded in the selected history.</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <div className="p-3 rounded-lg bg-secondary/50">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Consecutive Losses</p>
                <p className={cn(
                  "text-sm font-bold font-mono",
                  accountHealth.consecutiveLosses >= 3 ? "text-destructive" : 
                  accountHealth.consecutiveLosses >= 2 ? "text-warning" : "text-success"
                )}>
                  {accountHealth.consecutiveLosses}
                </p>
              </div>
            </TooltipTrigger>
            <TooltipContent>Number of losses in a row from most recent closed trades.</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <div className="p-3 rounded-lg bg-secondary/50">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Risk Exposure</p>
                <p className={cn(
                  "text-sm font-bold font-mono",
                  accountHealth.riskExposurePercent > 10 ? "text-destructive" : 
                  accountHealth.riskExposurePercent > 5 ? "text-warning" : "text-success"
                )}>
                  {accountHealth.riskExposurePercent.toFixed(1)}%
                </p>
              </div>
            </TooltipTrigger>
            <TooltipContent>Open risk currently deployed relative to account equity.</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <div className="p-3 rounded-lg bg-secondary/50">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Equity Slope</p>
                <p className={cn(
                  "text-sm font-bold font-mono flex items-center gap-1",
                  accountHealth.equitySlope >= 0 ? "text-success" : "text-destructive"
                )}>
                  {accountHealth.equitySlope >= 0 ? (
                    <><ArrowUpRight className="w-3 h-3" /> Positive</>
                  ) : (
                    <><ArrowDownRight className="w-3 h-3" /> Negative</>
                  )}
                </p>
              </div>
            </TooltipTrigger>
            <TooltipContent>Short-term direction of recent equity movement.</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </div>
    </TooltipProvider>
  );
};

