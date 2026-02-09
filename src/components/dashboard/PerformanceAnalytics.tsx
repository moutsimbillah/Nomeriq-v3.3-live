import { useProviderAwareTrades } from "@/hooks/useProviderAwareTrades";
import { useProviderAwareSignals } from "@/hooks/useProviderAwareSignals";
import { useAdminRole } from "@/hooks/useAdminRole";
import { useAuth } from "@/contexts/AuthContext";
import { useBrand } from "@/contexts/BrandContext";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Target, Flame, BarChart3 } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { useMemo } from "react";

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
  const entry = signal?.entry_price || 0;
  const sl = signal?.stop_loss || 0;
  const tp = signal?.take_profit || 0;
  
  if (signal?.direction === 'BUY' && entry - sl !== 0) {
    return Math.abs((tp - entry) / (entry - sl));
  } else if (signal?.direction === 'SELL' && sl - entry !== 0) {
    return Math.abs((entry - tp) / (sl - entry));
  }
  return 1;
};

const COLORS = ["hsl(var(--success))", "hsl(var(--primary))", "hsl(var(--warning))", "hsl(var(--accent))", "hsl(var(--secondary))"];

export const PerformanceAnalytics = () => {
  const { trades, isLoading } = useProviderAwareTrades({ realtime: true, limit: 1000 });
  const { signals } = useProviderAwareSignals({ realtime: true, limit: 1000 });
  const { isProvider, isLoading: roleLoading } = useAdminRole();
  const { profile } = useAuth();
  const { settings } = useBrand();
  const globalRiskPercent = settings?.global_risk_percent || 2;
  const accountBalance = profile?.account_balance || 0;

  // For providers, calculate simulated P&L per signal using actual balance
  const { closedTrades, closedSignalsWithPnL } = useMemo(() => {
    if (isProvider && !roleLoading) {
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
  }, [trades, signals, isProvider, roleLoading, globalRiskPercent, profile?.account_balance]);

  // Calculate Best Performing Pairs
  const pairStatsMap = new Map<string, PairStats>();
  closedTrades.forEach((trade: any) => {
    // For providers, the trade object is a signal with added pnl/result
    // For regular users, trade.signal contains the signal data
    const pair = isProvider ? (trade.pair || "Unknown") : (trade.signal?.pair || "Unknown");
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
      existing.totalTrades > 0
        ? (existing.wins / existing.totalTrades) * 100
        : 0;

    pairStatsMap.set(pair, existing);
  });

  const bestPairs = Array.from(pairStatsMap.values())
    .sort((a, b) => b.totalPnL - a.totalPnL)
    .slice(0, 5);

  // Calculate Category Performance
  const categoryStatsMap = new Map<string, CategoryStats>();
  closedTrades.forEach((trade: any) => {
    const category = isProvider ? (trade.category || "Unknown") : (trade.signal?.category || "Unknown");
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
      existing.totalTrades > 0
        ? (existing.wins / existing.totalTrades) * 100
        : 0;

    categoryStatsMap.set(category, existing);
  });

  const categoryStats = Array.from(categoryStatsMap.values())
    .sort((a, b) => b.totalPnL - a.totalPnL);

  // Prepare pie chart data (only positive P&L pairs for distribution)
  const pieData = bestPairs
    .filter((p) => p.totalPnL > 0)
    .map((p) => ({
      name: p.pair,
      value: p.totalPnL,
    }));

  const totalPositivePnL = pieData.reduce((sum, p) => sum + p.value, 0);

  // Calculate starting balance for drawdown calculations using actual balance
  const effectiveStartBalance = isProvider ? (profile?.account_balance || 1000) : accountBalance;

  // Calculate Max Drawdown & Recovery based on account balance
  let runningBalance = effectiveStartBalance - closedTrades.reduce((sum, t: any) => sum + (t.pnl || 0), 0);
  let peak = runningBalance;
  let maxDrawdown = 0;
  let maxDrawdownPercent = 0;
  let currentDrawdown = 0;

  const sortedTrades = [...closedTrades].sort(
    (a: any, b: any) =>
      new Date(a.closed_at || a.created_at).getTime() -
      new Date(b.closed_at || b.created_at).getTime()
  );

  sortedTrades.forEach((trade: any) => {
    runningBalance += trade.pnl || 0;
    if (runningBalance > peak) {
      peak = runningBalance;
      currentDrawdown = 0;
    } else {
      currentDrawdown = peak - runningBalance;
      if (currentDrawdown > maxDrawdown) {
        maxDrawdown = currentDrawdown;
      }
    }
  });

  // Calculate drawdown percentage based on account balance
  maxDrawdownPercent = effectiveStartBalance > 0 ? (maxDrawdown / effectiveStartBalance) * 100 : 0;
  const currentDrawdownPercent = effectiveStartBalance > 0 ? (currentDrawdown / effectiveStartBalance) * 100 : 0;

  // Recovery calculation
  const recoveryFromDrawdown = maxDrawdown > 0 
    ? Math.max(0, Math.min(100, ((maxDrawdown - currentDrawdown) / maxDrawdown) * 100))
    : 100;

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

  // Calculate Streak Tracking
  let currentWinStreak = 0;
  let bestWinStreak = 0;
  let currentLossStreak = 0;
  let tempWinStreak = 0;
  let tempLossStreak = 0;

  sortedTrades.forEach((trade: any) => {
    if (trade.result === "win") {
      tempWinStreak++;
      tempLossStreak = 0;
      if (tempWinStreak > bestWinStreak) bestWinStreak = tempWinStreak;
    } else if (trade.result === "loss") {
      tempLossStreak++;
      tempWinStreak = 0;
    }
  });

  // Current streaks (from the end)
  for (let i = sortedTrades.length - 1; i >= 0; i--) {
    if (sortedTrades[i].result === "win") {
      currentWinStreak++;
    } else {
      break;
    }
  }
  for (let i = sortedTrades.length - 1; i >= 0; i--) {
    if (sortedTrades[i].result === "loss") {
      currentLossStreak++;
    } else {
      break;
    }
  }

  // Calculate Signal Quality Score (0-100)
  // Based on: Win Rate (40%), R:R Quality (30%), Consistency (30%)
  const winRateScore = Math.min(100, (closedTrades.length > 0 
    ? (closedTrades.filter((t: any) => t.result === "win").length / closedTrades.length) * 100 
    : 0));
  
  const rrScore = Math.min(100, avgRR > 0 ? (avgRR / 3) * 100 : 0); // 3:1 R:R = 100%
  
  // Consistency: Lower variance = higher score
  const pnlValues = closedTrades.map((t: any) => t.pnl || 0);
  const avgPnl = pnlValues.length > 0 ? pnlValues.reduce((a, b) => a + b, 0) / pnlValues.length : 0;
  const variance = pnlValues.length > 0 
    ? pnlValues.reduce((sum, val) => sum + Math.pow(val - avgPnl, 2), 0) / pnlValues.length 
    : 0;
  const stdDev = Math.sqrt(variance);
  const consistencyScore = Math.max(0, Math.min(100, 100 - (stdDev / (Math.abs(avgPnl) + 1)) * 10));
  
  const signalQualityScore = closedTrades.length >= 3 
    ? (winRateScore * 0.4) + (rrScore * 0.3) + (consistencyScore * 0.3)
    : 0;
  
  const getScoreColor = (score: number) => {
    if (score >= 70) return "text-success";
    if (score >= 40) return "text-warning";
    return "text-destructive";
  };
  
  const getScoreLabel = (score: number) => {
    if (score >= 80) return "Excellent";
    if (score >= 60) return "Good";
    if (score >= 40) return "Average";
    if (score >= 20) return "Below Avg";
    return "Poor";
  };

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
        {bestPairs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No trade history yet</p>
        ) : (
          <div className="space-y-4">
            {/* Pie Chart */}
            {pieData.length > 0 && (
              <div className="h-[140px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={35}
                      outerRadius={60}
                      paddingAngle={2}
                      dataKey="value"
                      stroke="none"
                    >
                      {pieData.map((_, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={COLORS[index % COLORS.length]}
                          stroke="none"
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          const percent = ((data.value / totalPositivePnL) * 100).toFixed(1);
                          return (
                            <div className="bg-popover border border-border rounded-lg p-2 shadow-lg">
                              <p className="font-semibold text-sm">{data.name}</p>
                              <p className="text-success text-sm font-mono">
                                +${data.value.toFixed(2)} ({percent}%)
                              </p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
            {/* Legend */}
            <div className="space-y-2">
              {bestPairs.map((pair, index) => (
                <div
                  key={pair.pair}
                  className="flex items-center justify-between p-2 rounded-lg bg-secondary/30"
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: COLORS[index % COLORS.length] }}
                    />
                    <span className="text-sm font-medium">{pair.pair}</span>
                  </div>
                  <div className="text-right">
                    <span
                      className={cn(
                        "font-mono text-sm font-semibold",
                        pair.totalPnL >= 0 ? "text-success" : "text-destructive"
                      )}
                    >
                      {pair.totalPnL >= 0 ? "+" : ""}${pair.totalPnL.toFixed(2)}
                    </span>
                    <span className="text-xs text-muted-foreground ml-2">
                      {pair.winRate.toFixed(0)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Category Performance */}
      <div className="glass-card p-6 shadow-none">
        <div className="flex items-center gap-2 mb-4">
          <div className="p-2 rounded-lg bg-primary/10">
            <BarChart3 className="w-5 h-5 text-primary" />
          </div>
          <h3 className="text-lg font-semibold">Category Performance</h3>
        </div>
        {categoryStats.length === 0 ? (
          <p className="text-sm text-muted-foreground">No trade history yet</p>
        ) : (
          <div className="space-y-3">
            {categoryStats.map((cat, index) => (
              <div
                key={cat.category}
                className="p-3 rounded-lg bg-secondary/30"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: COLORS[index % COLORS.length] }}
                    />
                    <span className="text-sm font-medium">{cat.category}</span>
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
                <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      cat.winRate >= 50 ? "bg-success" : "bg-destructive"
                    )}
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
        )}
      </div>

      <div className="glass-card p-6 shadow-none">
        <div className="flex items-center gap-2 mb-4">
          <div className="p-2 rounded-lg bg-destructive/10">
            <TrendingDown className="w-5 h-5 text-destructive" />
          </div>
          <h3 className="text-lg font-semibold">Max Drawdown & Recovery</h3>
        </div>
        {closedTrades.length === 0 ? (
          <p className="text-sm text-muted-foreground">No trade history yet</p>
        ) : (
          <div className="space-y-4">
            <div className="p-4 rounded-lg bg-secondary/30">
              <p className="text-sm text-muted-foreground mb-1">Max Drawdown</p>
              <div className="flex items-baseline gap-2">
                <p className="text-2xl font-bold text-destructive">
                  -{maxDrawdownPercent.toFixed(1)}%
                </p>
                <span className="text-sm text-muted-foreground">
                  (${maxDrawdown.toFixed(2)})
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                of ${effectiveStartBalance.toFixed(0)} account
              </p>
            </div>
            <div className="p-4 rounded-lg bg-secondary/30">
              <p className="text-sm text-muted-foreground mb-1">Current Drawdown</p>
              <div className="flex items-baseline gap-2">
                <p className={cn(
                  "text-xl font-bold",
                  currentDrawdown > 0 ? "text-destructive" : "text-success"
                )}>
                  -{currentDrawdownPercent.toFixed(1)}%
                </p>
                <span className="text-sm text-muted-foreground">
                  (${currentDrawdown.toFixed(2)})
                </span>
              </div>
            </div>
            <div className="p-4 rounded-lg bg-secondary/30">
              <p className="text-sm text-muted-foreground mb-1">Recovery Progress</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-success rounded-full transition-all"
                    style={{ width: `${Math.min(recoveryFromDrawdown, 100)}%` }}
                  />
                </div>
                <span className="text-sm font-mono text-success">
                  {recoveryFromDrawdown.toFixed(0)}%
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Expected Value & Streaks */}
      <div className="glass-card p-6 shadow-none">
        <div className="flex items-center gap-2 mb-4">
          <div className="p-2 rounded-lg bg-primary/10">
            <Target className="w-5 h-5 text-primary" />
          </div>
          <h3 className="text-lg font-semibold">Expected Value (EV) per Trade</h3>
        </div>
        {closedTrades.length === 0 ? (
          <p className="text-sm text-muted-foreground">No trade history yet</p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="p-4 rounded-lg bg-secondary/30">
                <p className="text-sm text-muted-foreground mb-1">Avg EV</p>
                <p
                  className={cn(
                    "text-xl font-bold font-mono",
                    avgPnLPerTrade >= 0 ? "text-success" : "text-destructive"
                  )}
                >
                  {avgPnLPerTrade >= 0 ? "+" : ""}${avgPnLPerTrade.toFixed(2)}
                </p>
              </div>
              <div className="p-4 rounded-lg bg-secondary/30">
                <p className="text-sm text-muted-foreground mb-1">Avg R:R</p>
                <p className="text-xl font-bold font-mono text-primary">
                  1:{avgRR.toFixed(1)}
                </p>
              </div>
            </div>

            <div className="p-4 rounded-lg bg-secondary/30">
              <div className="flex items-center gap-2 mb-3">
                <Flame className="w-4 h-4 text-warning" />
                <p className="text-sm font-medium">Streak Tracking</p>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-xs text-muted-foreground">Current Win</p>
                  <p className="text-lg font-bold text-success">{currentWinStreak}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Best Win</p>
                  <p className="text-lg font-bold text-success">{bestWinStreak}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Current Loss</p>
                  <p className="text-lg font-bold text-destructive">{currentLossStreak}</p>
                </div>
              </div>
            </div>

            {/* Signal Quality Score */}
            <div className="p-4 rounded-lg bg-secondary/30">
              <p className="text-sm text-muted-foreground mb-2">Signal Quality Score</p>
              <div className="flex items-center justify-between mb-2">
                <span className={cn("text-2xl font-bold font-mono", getScoreColor(signalQualityScore))}>
                  {signalQualityScore.toFixed(0)}
                </span>
                <span className={cn("text-sm font-medium px-2 py-1 rounded-full bg-secondary", getScoreColor(signalQualityScore))}>
                  {getScoreLabel(signalQualityScore)}
                </span>
              </div>
              <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    signalQualityScore >= 70 ? "bg-success" : signalQualityScore >= 40 ? "bg-warning" : "bg-destructive"
                  )}
                  style={{ width: `${Math.min(signalQualityScore, 100)}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {closedTrades.length < 3 ? "Min. 3 trades required" : "Based on win rate, R:R & consistency"}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
