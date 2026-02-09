import { useSignalStats } from "@/hooks/useSignalStats";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Target, Flame } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { useMemo } from "react";

interface PairStats {
  pair: string;
  wins: number;
  losses: number;
  totalSignals: number;
  winRate: number;
}

const COLORS = ["hsl(var(--success))", "hsl(var(--primary))", "hsl(var(--warning))", "hsl(var(--accent))", "hsl(var(--secondary))"];

export const AdminSignalPerformance = () => {
  const { signals, isLoading } = useSignalStats();

  // Filter closed signals only
  const closedSignals = useMemo(() => 
    signals.filter(s => s.status === "tp_hit" || s.status === "sl_hit" || s.status === "breakeven"),
    [signals]
  );

  // Calculate Best Performing Pairs
  const pairStatsMap = useMemo(() => {
    const map = new Map<string, PairStats>();
    closedSignals.forEach((signal) => {
      const pair = signal.pair || "Unknown";
      const existing = map.get(pair) || {
        pair,
        wins: 0,
        losses: 0,
        totalSignals: 0,
        winRate: 0,
      };

      existing.totalSignals++;
      if (signal.status === "tp_hit") existing.wins++;
      if (signal.status === "sl_hit") existing.losses++;
      existing.winRate =
        existing.totalSignals > 0
          ? (existing.wins / existing.totalSignals) * 100
          : 0;

      map.set(pair, existing);
    });
    return map;
  }, [closedSignals]);

  const bestPairs = useMemo(() => 
    Array.from(pairStatsMap.values())
      .sort((a, b) => b.winRate - a.winRate)
      .slice(0, 5),
    [pairStatsMap]
  );

  // Prepare pie chart data (win distribution by pair)
  const pieData = useMemo(() => 
    bestPairs
      .filter((p) => p.wins > 0)
      .map((p) => ({
        name: p.pair,
        value: p.wins,
      })),
    [bestPairs]
  );

  const totalWins = pieData.reduce((sum, p) => sum + p.value, 0);

  // Calculate Category Stats
  const categoryStats = useMemo(() => {
    const map = new Map<string, { wins: number; losses: number; total: number }>();
    closedSignals.forEach((signal) => {
      const category = signal.category || "Unknown";
      const existing = map.get(category) || { wins: 0, losses: 0, total: 0 };
      existing.total++;
      if (signal.status === "tp_hit") existing.wins++;
      if (signal.status === "sl_hit") existing.losses++;
      map.set(category, existing);
    });
    return Array.from(map.entries()).map(([category, stats]) => ({
      category,
      ...stats,
      winRate: stats.total > 0 ? (stats.wins / stats.total) * 100 : 0,
    }));
  }, [closedSignals]);

  // Calculate Streak Tracking
  const streaks = useMemo(() => {
    const sortedSignals = [...closedSignals].sort(
      (a, b) =>
        new Date(a.closed_at || a.created_at).getTime() -
        new Date(b.closed_at || b.created_at).getTime()
    );

    let currentWinStreak = 0;
    let bestWinStreak = 0;
    let currentLossStreak = 0;
    let tempWinStreak = 0;
    let tempLossStreak = 0;

    sortedSignals.forEach((signal) => {
      if (signal.status === "tp_hit") {
        tempWinStreak++;
        tempLossStreak = 0;
        if (tempWinStreak > bestWinStreak) bestWinStreak = tempWinStreak;
      } else if (signal.status === "sl_hit") {
        tempLossStreak++;
        tempWinStreak = 0;
      }
    });

    // Current streaks (from the end)
    for (let i = sortedSignals.length - 1; i >= 0; i--) {
      if (sortedSignals[i].status === "tp_hit") {
        currentWinStreak++;
      } else {
        break;
      }
    }
    for (let i = sortedSignals.length - 1; i >= 0; i--) {
      if (sortedSignals[i].status === "sl_hit") {
        currentLossStreak++;
      } else {
        break;
      }
    }

    return { currentWinStreak, bestWinStreak, currentLossStreak };
  }, [closedSignals]);

  // Calculate Signal Quality Score
  const signalQualityScore = useMemo(() => {
    if (closedSignals.length < 3) return 0;

    const winRateScore = Math.min(100, (closedSignals.filter(s => s.status === "tp_hit").length / closedSignals.length) * 100);
    
    // R:R Score
    let totalRR = 0;
    let rrCount = 0;
    closedSignals.forEach((signal) => {
      const entry = signal.entry_price || 0;
      const sl = signal.stop_loss || 0;
      const tp = signal.take_profit || 0;
      let rr = 0;
      if (signal.direction === "BUY" && entry - sl !== 0) {
        rr = Math.abs((tp - entry) / (entry - sl));
      } else if (signal.direction === "SELL" && sl - entry !== 0) {
        rr = Math.abs((entry - tp) / (sl - entry));
      }
      if (rr > 0) {
        totalRR += rr;
        rrCount++;
      }
    });
    const avgRR = rrCount > 0 ? totalRR / rrCount : 0;
    const rrScore = Math.min(100, avgRR > 0 ? (avgRR / 3) * 100 : 0);

    // Consistency Score (lower variance = higher score)
    const outcomes = closedSignals.map(s => s.status === "tp_hit" ? 1 : 0);
    const avgOutcome = outcomes.reduce((a, b) => a + b, 0) / outcomes.length;
    const variance = outcomes.reduce((sum, val) => sum + Math.pow(val - avgOutcome, 2), 0) / outcomes.length;
    const consistencyScore = Math.max(0, Math.min(100, 100 - variance * 100));

    return (winRateScore * 0.4) + (rrScore * 0.3) + (consistencyScore * 0.3);
  }, [closedSignals]);

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
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {[1, 2, 3].map((i) => (
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
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Best Performing Pairs with Pie Chart */}
      <div className="glass-card p-6 shadow-none">
        <div className="flex items-center gap-2 mb-4">
          <div className="p-2 rounded-lg bg-success/10">
            <TrendingUp className="w-5 h-5 text-success" />
          </div>
          <h3 className="text-lg font-semibold">Best Performing Pairs</h3>
        </div>
        {bestPairs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No signal history yet</p>
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
                    >
                      {pieData.map((_, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={COLORS[index % COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          const percent = ((data.value / totalWins) * 100).toFixed(1);
                          return (
                            <div className="bg-popover border border-border rounded-lg p-2 shadow-lg">
                              <p className="font-semibold text-sm">{data.name}</p>
                              <p className="text-success text-sm font-mono">
                                {data.value} wins ({percent}%)
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
                    <span className="font-mono text-sm font-semibold text-success">
                      {pair.winRate.toFixed(0)}%
                    </span>
                    <span className="text-xs text-muted-foreground ml-2">
                      {pair.wins}W/{pair.losses}L
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
            <Target className="w-5 h-5 text-primary" />
          </div>
          <h3 className="text-lg font-semibold">Category Performance</h3>
        </div>
        {categoryStats.length === 0 ? (
          <p className="text-sm text-muted-foreground">No signal history yet</p>
        ) : (
          <div className="space-y-3">
            {categoryStats.map((cat) => (
              <div
                key={cat.category}
                className="p-4 rounded-lg bg-secondary/30"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium capitalize">{cat.category}</span>
                  <span
                    className={cn(
                      "font-mono text-sm font-semibold",
                      cat.winRate >= 50 ? "text-success" : "text-destructive"
                    )}
                  >
                    {cat.winRate.toFixed(0)}%
                  </span>
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span>{cat.total} signals</span>
                  <span className="text-success">{cat.wins}W</span>
                  <span className="text-destructive">{cat.losses}L</span>
                </div>
                <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      cat.winRate >= 50 ? "bg-success" : "bg-destructive"
                    )}
                    style={{ width: `${cat.winRate}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Streaks & Quality Score */}
      <div className="glass-card p-6 shadow-none">
        <div className="flex items-center gap-2 mb-4">
          <div className="p-2 rounded-lg bg-warning/10">
            <Flame className="w-5 h-5 text-warning" />
          </div>
          <h3 className="text-lg font-semibold">Streaks & Quality</h3>
        </div>
        {closedSignals.length === 0 ? (
          <p className="text-sm text-muted-foreground">No signal history yet</p>
        ) : (
          <div className="space-y-4">
            {/* Streak Tracking */}
            <div className="p-4 rounded-lg bg-secondary/30">
              <p className="text-sm font-medium mb-3">Streak Tracking</p>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-xs text-muted-foreground">Current Win</p>
                  <p className="text-lg font-bold text-success">{streaks.currentWinStreak}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Best Win</p>
                  <p className="text-lg font-bold text-success">{streaks.bestWinStreak}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Current Loss</p>
                  <p className="text-lg font-bold text-destructive">{streaks.currentLossStreak}</p>
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
                {closedSignals.length < 3 ? "Min. 3 signals required" : "Based on win rate, R:R & consistency"}
              </p>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-secondary/30 text-center">
                <p className="text-xs text-muted-foreground">Total Closed</p>
                <p className="text-xl font-bold">{closedSignals.length}</p>
              </div>
              <div className="p-3 rounded-lg bg-secondary/30 text-center">
                <p className="text-xs text-muted-foreground">Categories</p>
                <p className="text-xl font-bold">{categoryStats.length}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
