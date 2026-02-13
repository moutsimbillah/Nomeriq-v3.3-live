import { useProviderAwareTrades } from "@/hooks/useProviderAwareTrades";
import { useProviderAwareSignals } from "@/hooks/useProviderAwareSignals";
import { useAdminRole } from "@/hooks/useAdminRole";
import { useAuth } from "@/contexts/AuthContext";
import { useBrand } from "@/contexts/BrandContext";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Target, BarChart3 } from "lucide-react";
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
  const { trades, isLoading } = useProviderAwareTrades({ realtime: true, limit: 1000, adminGlobalView });
  const { signals } = useProviderAwareSignals({ realtime: true, limit: 1000, adminGlobalView });
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
      existing.totalTrades > 0
        ? (existing.wins / existing.totalTrades) * 100
        : 0;

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
      existing.totalTrades > 0
        ? (existing.wins / existing.totalTrades) * 100
        : 0;

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

  // Calculate starting balance for drawdown calculations using actual balance
  const effectiveStartBalance = providerScopedMode ? (profile?.account_balance || 1000) : accountBalance;

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
        {categoryStats.length === 0 ? (
          <p className="text-sm text-muted-foreground">No trade history yet</p>
        ) : (
          <div className="space-y-3">
            {categoryStats.map((cat) => (
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

          </div>
        )}
      </div>
    </div>
  );
};
