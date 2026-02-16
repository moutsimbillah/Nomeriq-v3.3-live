import { useProviderAwareTrades } from "@/hooks/useProviderAwareTrades";
import { useProviderAwareSignals } from "@/hooks/useProviderAwareSignals";
import { useAdminRole } from "@/hooks/useAdminRole";
import { useAuth } from "@/contexts/AuthContext";
import { useBrand } from "@/contexts/BrandContext";
import { cn } from "@/lib/utils";
import { TrendingUp, Target, BarChart3, Flame, Activity, Clock } from "lucide-react";
import { useMemo } from "react";
import { calculateWinRatePercent } from "@/lib/kpi-math";
import { calculateSignalRr } from "@/lib/trade-math";

interface PairStats {
  pair: string;
  wins: number;
  losses: number;
  totalTrades: number;
  winRate: number;
  totalPnL: number;
}

interface CategoryStats {
  category: string;
  wins: number;
  losses: number;
  breakeven: number;
  totalTrades: number;
  winRate: number;
  totalPnL: number;
}

// Calculate R:R for a signal
const calculateRR = (signal: any): number => {
  return calculateSignalRr({ signal });
};

const COLORS = [
  "#22C55E", // green
  "#3B82F6", // blue
  "#F59E0B", // amber
  "#A855F7", // violet
  "#EF4444", // red
  "#06B6D4", // cyan
  "#EC4899", // pink
  "#84CC16", // lime
];

const DEFAULT_CATEGORY_ORDER = ["Forex", "Metals", "Crypto", "Indices", "Commodities"];

const getCategoryTheme = (category: string) => {
  const key = category.toLowerCase();

  if (key.includes("crypto")) {
    return {
      dot: "bg-emerald-400",
      bar: "from-emerald-400 to-emerald-500",
    };
  }
  if (key.includes("forex")) {
    return {
      dot: "bg-blue-400",
      bar: "from-blue-400 to-blue-500",
    };
  }
  if (key.includes("metals")) {
    return {
      dot: "bg-amber-400",
      bar: "from-amber-400 to-amber-500",
    };
  }
  if (key.includes("indices")) {
    return {
      dot: "bg-indigo-400",
      bar: "from-indigo-400 to-indigo-500",
    };
  }
  if (key.includes("commodities")) {
    return {
      dot: "bg-rose-400",
      bar: "from-rose-400 to-rose-500",
    };
  }

  return {
    dot: "bg-cyan-400",
    bar: "from-cyan-400 to-cyan-500",
  };
};

interface PerformanceAnalyticsProps {
  adminGlobalView?: boolean;
}

export const PerformanceAnalytics = ({ adminGlobalView = false }: PerformanceAnalyticsProps) => {
  const { trades, isLoading } = useProviderAwareTrades({ realtime: true, fetchAll: true, adminGlobalView });
  const { signals } = useProviderAwareSignals({ realtime: true, fetchAll: true, adminGlobalView });
  const { isProvider, isLoading: roleLoading } = useAdminRole();
  const { profile } = useAuth();
  const { settings } = useBrand();
  const globalRiskPercent = settings?.global_risk_percent || 2;
  const accountBalance = profile?.account_balance || 0;
  const providerScopedMode = isProvider && !adminGlobalView;

  // For providers, calculate simulated P&L per signal using actual balance
  const { closedTrades, closedSignalsWithPnL } = useMemo(() => {
    if (providerScopedMode && !roleLoading) {
      // Provider mode: Use signals with simulated P&L based on actual balance
      const providerBalance = profile?.account_balance || 1000;
      const RISK_PERCENT = globalRiskPercent / 100;
      
      const closedSignals = signals
        .filter(s => ['tp_hit', 'sl_hit', 'breakeven'].includes(s.status) && s.closed_at);
      
      let runningBalance = providerBalance;
      const signalsWithPnL = closedSignals.map(signal => {
        const riskAmount = runningBalance * RISK_PERCENT;
        const rr = calculateRR(signal);
        
        let pnl = 0;
        let result = 'breakeven';
        if (signal.status === 'tp_hit') {
          pnl = riskAmount * rr;
          result = 'win';
          runningBalance += pnl;
        } else if (signal.status === 'sl_hit') {
          pnl = -riskAmount;
          result = 'loss';
          runningBalance += pnl;
        }
        
        return {
          ...signal,
          pnl,
          result,
          signal: signal,
        };
      });
      
      return {
        closedTrades: signalsWithPnL,
        closedSignalsWithPnL: signalsWithPnL
      };
    } else {
      // Regular user mode: Use actual trades
      const closed = trades.filter(
        (t) => t.result === "win" || t.result === "loss" || t.result === "breakeven"
      );
      return {
        closedTrades: closed,
        closedSignalsWithPnL: []
      };
    }
  }, [trades, signals, providerScopedMode, roleLoading, globalRiskPercent, profile?.account_balance]);

  // Calculate Best Performing Pairs
  const pairStatsMap = new Map<string, PairStats>();
  closedTrades.forEach((trade: any) => {
    // For providers, the trade object is a signal with added pnl/result
    // For regular users, trade.signal contains the signal data
    const pair = providerScopedMode ? (trade.pair || "Unknown") : (trade.signal?.pair || "Unknown");
    const existing = pairStatsMap.get(pair) || {
      pair,
      wins: 0,
      losses: 0,
      totalTrades: 0,
      winRate: 0,
      totalPnL: 0,
    };

    existing.totalTrades++;
    if (trade.result === "win") existing.wins++;
    if (trade.result === "loss") existing.losses++;
    existing.totalPnL += trade.pnl || 0;
    existing.winRate =
      calculateWinRatePercent(existing.wins, existing.losses);

    pairStatsMap.set(pair, existing);
  });

  const bestPairs = Array.from(pairStatsMap.values())
    .sort((a, b) => {
      const byWinRate = b.winRate - a.winRate;
      if (byWinRate !== 0) return byWinRate;
      const byPnL = b.totalPnL - a.totalPnL;
      if (byPnL !== 0) return byPnL;
      return b.totalTrades - a.totalTrades;
    })
    .slice(0, 5);

  // Calculate Category Performance
  const categoryStatsMap = new Map<string, CategoryStats>();
  closedTrades.forEach((trade: any) => {
    const category = providerScopedMode ? (trade.category || "Unknown") : (trade.signal?.category || "Unknown");
    const existing = categoryStatsMap.get(category) || {
      category,
      wins: 0,
      losses: 0,
      breakeven: 0,
      totalTrades: 0,
      winRate: 0,
      totalPnL: 0,
    };

    existing.totalTrades++;
    if (trade.result === "win") existing.wins++;
    if (trade.result === "loss") existing.losses++;
    if (trade.result === "breakeven") existing.breakeven++;
    existing.totalPnL += trade.pnl || 0;
    existing.winRate =
      calculateWinRatePercent(existing.wins, existing.losses);

    categoryStatsMap.set(category, existing);
  });

  const categoryStats = Array.from(categoryStatsMap.values())
    .sort((a, b) => {
      const byWinRate = b.winRate - a.winRate;
      if (byWinRate !== 0) return byWinRate;
      const byPnL = b.totalPnL - a.totalPnL;
      if (byPnL !== 0) return byPnL;
      return b.totalTrades - a.totalTrades;
    });

  const displayCategoryStats = categoryStats.length
    ? categoryStats
    : DEFAULT_CATEGORY_ORDER.map((category) => ({
        category,
        wins: 0,
        losses: 0,
        breakeven: 0,
        totalTrades: 0,
        winRate: 0,
        totalPnL: 0,
      }));

  const sortedTrades = [...closedTrades].sort(
    (a: any, b: any) =>
      new Date(a.closed_at || a.created_at).getTime() -
      new Date(b.closed_at || b.created_at).getTime()
  );

  // Calculate Expected Value (EV) per Trade
  const totalPnL = closedTrades.reduce((sum, t: any) => sum + (t.pnl || 0), 0);
  const avgPnLPerTrade = closedTrades.length > 0 ? totalPnL / closedTrades.length : 0;

  // Calculate Average R:R
  let totalRR = 0;
  let rrCount = 0;
  closedTrades.forEach((trade: any) => {
    // For providers, trade IS the signal; for regular users, use trade.signal
    const signalData = isProvider ? trade : trade.signal;
    const entry = signalData?.entry_price || 0;
    const sl = signalData?.stop_loss || 0;
    const tp = signalData?.take_profit || 0;
    let rr = 0;
    if (signalData?.direction === "BUY" && entry - sl !== 0) {
      rr = Math.abs((tp - entry) / (entry - sl));
    } else if (signalData?.direction === "SELL" && sl - entry !== 0) {
      rr = Math.abs((entry - tp) / (sl - entry));
    }
    if (rr > 0) {
      totalRR += rr;
      rrCount++;
    }
  });
  const avgRR = rrCount > 0 ? totalRR / rrCount : 0;

  // Quality and streak metrics for Signal Quality & System Health
  const winRatePercent = calculateWinRatePercent(
    closedTrades.filter((t: any) => t.result === "win").length,
    closedTrades.filter((t: any) => t.result === "loss").length
  );
  const rrScore = Math.min(100, avgRR > 0 ? (avgRR / 3) * 100 : 0);
  const pnlValues = closedTrades.map((t: any) => Number(t.pnl || 0));
  const avgPnl = pnlValues.length > 0 ? pnlValues.reduce((a, b) => a + b, 0) / pnlValues.length : 0;
  const variance = pnlValues.length > 0
    ? pnlValues.reduce((sum, val) => sum + Math.pow(val - avgPnl, 2), 0) / pnlValues.length
    : 0;
  const stdDev = Math.sqrt(variance);
  const consistencyIndex = closedTrades.length > 0
    ? Math.max(0, Math.min(100, 100 - (stdDev / (Math.abs(avgPnl) + 1)) * 10))
    : 0;
  const qualityScore = closedTrades.length >= 3
    ? (winRatePercent * 0.4) + (rrScore * 0.3) + (consistencyIndex * 0.3)
    : 0;

  let bestWinStreak = 0;
  let worstLosingStreak = 0;
  let currentWinStreak = 0;
  let currentLossStreak = 0;
  let tempWin = 0;
  let tempLoss = 0;
  const winRuns: number[] = [];
  const lossRuns: number[] = [];

  sortedTrades.forEach((trade: any) => {
    if (trade.result === "win") {
      tempWin += 1;
      if (tempLoss > 0) lossRuns.push(tempLoss);
      tempLoss = 0;
      bestWinStreak = Math.max(bestWinStreak, tempWin);
    } else if (trade.result === "loss") {
      tempLoss += 1;
      if (tempWin > 0) winRuns.push(tempWin);
      tempWin = 0;
      worstLosingStreak = Math.max(worstLosingStreak, tempLoss);
    }
  });
  if (tempWin > 0) winRuns.push(tempWin);
  if (tempLoss > 0) lossRuns.push(tempLoss);

  for (let i = sortedTrades.length - 1; i >= 0; i--) {
    if (sortedTrades[i].result === "win") currentWinStreak++;
    else break;
  }
  for (let i = sortedTrades.length - 1; i >= 0; i--) {
    if (sortedTrades[i].result === "loss") currentLossStreak++;
    else break;
  }

  const avgWinStreak = winRuns.length > 0 ? winRuns.reduce((a, b) => a + b, 0) / winRuns.length : 0;
  const avgLossStreak = lossRuns.length > 0 ? lossRuns.reduce((a, b) => a + b, 0) / lossRuns.length : 0;

  const holdingHours = sortedTrades
    .map((t: any) => {
      const opened = new Date(t.created_at).getTime();
      const closed = new Date(t.closed_at || t.created_at).getTime();
      return Math.max(0, (closed - opened) / (1000 * 60 * 60));
    });
  const avgHoldingHours = holdingHours.length > 0
    ? holdingHours.reduce((a, b) => a + b, 0) / holdingHours.length
    : 0;
  const firstTradeTime = sortedTrades.length > 0
    ? new Date(sortedTrades[0].closed_at || sortedTrades[0].created_at).getTime()
    : 0;
  const lastTradeTime = sortedTrades.length > 0
    ? new Date(sortedTrades[sortedTrades.length - 1].closed_at || sortedTrades[sortedTrades.length - 1].created_at).getTime()
    : 0;
  const elapsedDays = sortedTrades.length > 0
    ? Math.max(1, Math.floor((lastTradeTime - firstTradeTime) / (1000 * 60 * 60 * 24)) + 1)
    : 1;
  const signalFrequencyPerDay = closedTrades.length / elapsedDays;
  const signalFrequencyPerWeek = signalFrequencyPerDay * 7;
  const signalFrequencyPerMonth = signalFrequencyPerDay * 30;

  const qualityBadgeClass = qualityScore >= 70
    ? "bg-success/20 text-success"
    : qualityScore >= 40
      ? "bg-warning/20 text-warning"
      : "bg-destructive/20 text-destructive";

  const qualityBarClass = qualityScore >= 70
    ? "bg-success"
    : qualityScore >= 40
      ? "bg-warning"
      : "bg-destructive";

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="glass-card p-6 animate-pulse">
            <div className="h-6 bg-muted rounded w-1/2 mb-4"></div>
            <div className="space-y-3">
              <div className="h-4 bg-muted rounded w-full"></div>
              <div className="h-4 bg-muted rounded w-3/4"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {/* Best Performing Pairs with Pie Chart */}
      <div className="glass-card p-6 shadow-none">
        <div className="flex items-center gap-2 mb-4">
          <div className="p-2 rounded-lg bg-success/10">
            <TrendingUp className="w-5 h-5 text-success" />
          </div>
          <h3 className="text-lg font-semibold">Best Performing Pairs</h3>
        </div>
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, index) => {
            const pair = bestPairs[index];
            if (!pair) {
              return (
                <div key={`empty-pair-${index}`} className="p-3 rounded-xl bg-secondary/20 border border-border/30">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className="w-3 h-3 rounded-full shrink-0 opacity-40"
                        style={{ backgroundColor: COLORS[index % COLORS.length] }}
                      />
                      <span className="text-sm font-semibold text-muted-foreground">No pair</span>
                    </div>
                    <div className="text-right shrink-0 flex items-center gap-2">
                      <span className="font-mono text-sm text-muted-foreground">0%</span>
                      <span className="font-mono text-sm text-muted-foreground">$0.00</span>
                    </div>
                  </div>
                  <div className="w-full h-2 bg-muted rounded-full overflow-hidden" />
                  <div className="flex items-center justify-between mt-1.5 text-xs text-muted-foreground">
                    <span>0 trades</span>
                    <span className="font-mono">0W / 0L / 0BE</span>
                  </div>
                </div>
              );
            }

            return (
              <div key={pair.pair} className="p-3 rounded-xl bg-secondary/30 border border-border/40">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: COLORS[index % COLORS.length] }}
                    />
                    <span className="text-sm font-semibold truncate">{pair.pair}</span>
                  </div>
                  <div className="text-right shrink-0 flex items-center gap-2">
                    <span className={cn(
                      "font-mono text-sm font-semibold",
                      pair.winRate >= 50 ? "text-success" : "text-destructive"
                    )}>
                      {pair.winRate.toFixed(0)}%
                    </span>
                    <span
                      className={cn(
                        "font-mono text-sm font-semibold",
                        pair.totalPnL >= 0 ? "text-success" : "text-destructive"
                      )}
                    >
                      {pair.totalPnL >= 0 ? "+" : ""}${pair.totalPnL.toFixed(2)}
                    </span>
                  </div>
                </div>

                <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                  <span
                    className="block h-full rounded-full transition-all"
                    style={{
                      width: `${Math.min(100, Math.max(0, pair.winRate))}%`,
                      backgroundColor: COLORS[index % COLORS.length],
                    }}
                  />
                </div>

                <div className="flex items-center justify-between mt-1.5 text-xs text-muted-foreground">
                  <span>{pair.totalTrades} trades</span>
                  <span className="font-mono">{pair.wins}W / {pair.losses}L / {Math.max(0, pair.totalTrades - pair.wins - pair.losses)}BE</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Category Performance */}
      <div className="glass-card p-6 shadow-none">
        <div className="flex items-center gap-2 mb-4">
          <div className="p-2 rounded-lg bg-primary/10">
            <BarChart3 className="w-5 h-5 text-primary" />
          </div>
          <h3 className="text-lg font-semibold">Category Performance</h3>
        </div>
        {closedTrades.length === 0 && (
          <p className="text-xs text-muted-foreground mb-3">No trade history yet. Showing baseline values.</p>
        )}
        <div className="space-y-3">
          {displayCategoryStats.map((cat) => (
            <div key={cat.category} className="p-3 rounded-xl bg-secondary/30 border border-border/40">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className={cn("w-3 h-3 rounded-full", getCategoryTheme(cat.category).dot)} />
                  <span className="text-sm font-semibold">{cat.category}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      "font-mono text-sm font-semibold",
                      cat.winRate >= 50 ? "text-success" : "text-destructive"
                    )}
                  >
                    {cat.winRate.toFixed(0)}%
                  </span>
                  <span
                    className={cn(
                      "font-mono text-xs",
                      cat.totalPnL >= 0 ? "text-success" : "text-destructive"
                    )}
                  >
                    {cat.totalPnL >= 0 ? "+" : ""}${cat.totalPnL.toFixed(0)}
                  </span>
                </div>
              </div>
              {/* Win Rate Gauge */}
              <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className={cn("h-full rounded-full transition-all bg-gradient-to-r", getCategoryTheme(cat.category).bar)}
                  style={{ width: `${cat.winRate}%` }}
                />
              </div>
              <div className="flex items-center justify-between mt-1.5 text-xs text-muted-foreground">
                <span>{cat.totalTrades} trades</span>
                <span>{cat.wins}W / {cat.losses}L / {cat.breakeven}BE</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Signal Quality & System Health */}
      <div className="glass-card p-6 shadow-none md:col-span-2 lg:col-span-2">
        <div className="flex items-center gap-2 mb-6">
          <div className="p-2 rounded-lg bg-warning/10">
            <Flame className="w-5 h-5 text-warning" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">Signal Quality & System Health</h3>
            <p className="text-sm text-muted-foreground">Performance consistency metrics</p>
          </div>
        </div>

        {closedTrades.length === 0 && (
          <p className="text-xs text-muted-foreground mb-4">No trade history yet. Showing baseline values.</p>
        )}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="p-5 rounded-xl bg-secondary/30 border border-border/50">
              <div className="flex items-center justify-between mb-4">
                <span className="font-medium">Signal Quality Score</span>
                <span className={cn("px-2.5 py-1 rounded-full text-xs font-semibold", qualityBadgeClass)}>
                  {qualityScore >= 80 ? "Excellent" : qualityScore >= 60 ? "Good" : qualityScore >= 40 ? "Average" : "Needs Improvement"}
                </span>
              </div>
              <div className="flex items-center gap-4 mb-4">
                <span className="text-4xl font-bold font-mono">{qualityScore.toFixed(0)}</span>
                <div className="flex-1">
                  <div className="h-3 bg-muted rounded-full overflow-hidden">
                    <div className={cn("h-full rounded-full transition-all", qualityBarClass)} style={{ width: `${Math.min(qualityScore, 100)}%` }} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">Based on win rate, R:R quality & consistency</p>
                </div>
              </div>
            <div className="p-3 rounded-lg bg-secondary/50">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Consistency Index</span>
                <span className="font-mono font-semibold">{consistencyIndex.toFixed(0)}%</span>
              </div>
              <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-success" style={{ width: `${Math.max(0, Math.min(100, consistencyIndex))}%` }} />
              </div>
            </div>

            <div className="p-4 rounded-lg bg-secondary/30 border border-border/50 mt-4">
              <div className="flex items-center gap-2 mb-4">
                <Clock className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium">Signal Frequency</span>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Per Day</p>
                  <p className="text-xl font-bold font-mono">{signalFrequencyPerDay.toFixed(1)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Per Week</p>
                  <p className="text-xl font-bold font-mono">{signalFrequencyPerWeek.toFixed(0)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Per Month</p>
                  <p className="text-xl font-bold font-mono">{signalFrequencyPerMonth.toFixed(0)}</p>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-lg bg-primary/5 border border-primary/20 mt-4">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-4 h-4 text-primary" />
                <span className="text-xs text-muted-foreground">Avg Holding Time</span>
              </div>
              <p className="text-2xl font-bold font-mono text-primary">{avgHoldingHours.toFixed(1)}h</p>
              <p className="text-xs text-muted-foreground mt-1">Average trade duration</p>
            </div>
          </div>

            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
                <div className="flex items-center gap-2 mb-3">
                  <Target className="w-4 h-4 text-primary" />
                  <span className="text-xs text-muted-foreground">Expected Value (EV) per Trade</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg bg-secondary/40">
                    <p className="text-xs text-muted-foreground mb-1">Avg EV</p>
                    <p className={cn("text-2xl font-bold font-mono", avgPnLPerTrade >= 0 ? "text-success" : "text-destructive")}>
                      {avgPnLPerTrade >= 0 ? "+" : ""}${avgPnLPerTrade.toFixed(2)}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-secondary/40">
                    <p className="text-xs text-muted-foreground mb-1">Avg R:R</p>
                    <p className="text-2xl font-bold font-mono text-primary">1:{avgRR.toFixed(1)}</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 items-stretch">
                <div className="h-full min-h-[118px] p-4 rounded-lg bg-success/5 border border-success/20 flex flex-col">
                  <div className="flex items-center gap-2 mb-2">
                    <Flame className="w-4 h-4 text-success" />
                    <span className="text-xs text-muted-foreground">Avg Win Streak</span>
                  </div>
                  <p className="text-2xl font-bold font-mono text-success">{avgWinStreak.toFixed(1)}</p>
                  <p className="text-xs text-muted-foreground mt-auto pt-1">Consecutive wins</p>
                </div>
                <div className="h-full min-h-[118px] p-4 rounded-lg bg-destructive/5 border border-destructive/20 flex flex-col">
                  <div className="flex items-center gap-2 mb-2">
                    <Activity className="w-4 h-4 text-destructive" />
                    <span className="text-xs text-muted-foreground">Avg Loss Streak</span>
                  </div>
                  <p className="text-2xl font-bold font-mono text-destructive">{avgLossStreak.toFixed(1)}</p>
                  <p className="text-xs text-muted-foreground mt-auto pt-1">Consecutive losses</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 items-stretch">
                <div className="h-full min-h-[118px] p-4 rounded-lg bg-success/5 border border-success/20 flex flex-col">
                  <div className="flex items-center gap-2 mb-2">
                    <Flame className="w-4 h-4 text-success" />
                    <span className="text-xs text-muted-foreground">Best Winning Streak</span>
                  </div>
                  <p className="text-2xl font-bold font-mono text-success">{bestWinStreak.toFixed(0)}</p>
                  <p className="text-xs text-muted-foreground mt-auto pt-1">Max consecutive wins</p>
                </div>
                <div className="h-full min-h-[118px] p-4 rounded-lg bg-destructive/5 border border-destructive/20 flex flex-col">
                  <div className="flex items-center gap-2 mb-2">
                    <Activity className="w-4 h-4 text-destructive" />
                    <span className="text-xs text-muted-foreground">Worst Losing Streak</span>
                  </div>
                  <p className="text-2xl font-bold font-mono text-destructive">{worstLosingStreak.toFixed(0)}</p>
                  <p className="text-xs text-muted-foreground mt-auto pt-1">Max consecutive losses</p>
                </div>
              </div>

            </div>
          </div>
      </div>
    </div>
  );
};
