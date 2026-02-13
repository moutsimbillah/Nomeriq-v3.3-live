import { QualityStats } from "@/hooks/useGlobalTradeStats";
import { Flame, Target, Activity, BarChart3, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  qualityStats: QualityStats;
  avgHoldingHours: number;
  isLoading: boolean;
}

export const SignalQualityHealth = ({ qualityStats, avgHoldingHours, isLoading }: Props) => {
  const safeAvgHoldingHours = Number.isFinite(avgHoldingHours) ? avgHoldingHours : 0;
  if (isLoading) {
    return (
      <div className="glass-card p-6 animate-pulse">
        <div className="h-6 bg-muted rounded w-1/3 mb-4" />
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-24 bg-muted rounded" />
          ))}
        </div>
      </div>
    );
  }

  const getQualityLabel = (score: number) => {
    if (score >= 80) return "Excellent";
    if (score >= 60) return "Good";
    if (score >= 40) return "Average";
    return "Needs Improvement";
  };

  const getQualityColor = (score: number) => {
    if (score >= 70) return "success";
    if (score >= 40) return "warning";
    return "destructive";
  };

  const qualityColor = getQualityColor(qualityStats.qualityScore);

  return (
    <div className="glass-card p-6 shadow-none">
      <div className="flex items-center gap-2 mb-6">
        <div className="p-2 rounded-lg bg-warning/10">
          <Flame className="w-5 h-5 text-warning" />
        </div>
        <div>
          <h3 className="text-lg font-semibold">Signal Quality & System Health</h3>
          <p className="text-sm text-muted-foreground">Performance consistency metrics</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Quality Score */}
        <div className="p-6 rounded-xl bg-secondary/30 border border-border/50">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Target className="w-5 h-5 text-primary" />
              <span className="font-medium">Platform Signal Quality Score</span>
            </div>
            <span className={cn(
              "px-2.5 py-1 rounded-full text-xs font-semibold",
              qualityColor === "success" && "bg-success/20 text-success",
              qualityColor === "warning" && "bg-warning/20 text-warning",
              qualityColor === "destructive" && "bg-destructive/20 text-destructive"
            )}>
              {getQualityLabel(qualityStats.qualityScore)}
            </span>
          </div>

          <div className="flex items-center gap-4 mb-4">
            <span className={cn(
              "text-5xl font-bold font-mono",
              qualityColor === "success" && "text-success",
              qualityColor === "warning" && "text-warning",
              qualityColor === "destructive" && "text-destructive"
            )}>
              {qualityStats.qualityScore.toFixed(0)}
            </span>
            <div className="flex-1">
              <div className="h-4 bg-muted rounded-full overflow-hidden">
                <div 
                  className={cn(
                    "h-full rounded-full transition-all",
                    qualityColor === "success" && "bg-success",
                    qualityColor === "warning" && "bg-warning",
                    qualityColor === "destructive" && "bg-destructive"
                  )}
                  style={{ width: `${Math.min(qualityStats.qualityScore, 100)}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Based on win rate, R:R quality & consistency
              </p>
            </div>
          </div>

          {/* Consistency Index */}
          <div className="p-3 rounded-lg bg-secondary/50">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Consistency Index</span>
              <span className={cn(
                "font-mono font-semibold",
                qualityStats.consistencyIndex >= 70 ? "text-success" : 
                qualityStats.consistencyIndex >= 40 ? "text-warning" : "text-destructive"
              )}>
                {qualityStats.consistencyIndex.toFixed(0)}%
              </span>
            </div>
            <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
              <div 
                className={cn(
                  "h-full rounded-full",
                  qualityStats.consistencyIndex >= 70 ? "bg-success" : 
                  qualityStats.consistencyIndex >= 40 ? "bg-warning" : "bg-destructive"
                )}
                style={{ width: `${qualityStats.consistencyIndex}%` }}
              />
            </div>
          </div>

          {/* Signal Frequency */}
          <div className="p-4 rounded-lg bg-secondary/30 mt-4">
            <div className="flex items-center gap-2 mb-4">
              <Clock className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">Signal Frequency</span>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Per Day</p>
                <p className="text-xl font-bold font-mono">
                  {qualityStats.signalFrequencyPerDay.toFixed(1)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Per Week</p>
                <p className="text-xl font-bold font-mono">
                  {qualityStats.signalFrequencyPerWeek.toFixed(0)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Per Month</p>
                <p className="text-xl font-bold font-mono">
                  {qualityStats.signalFrequencyPerMonth.toFixed(0)}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Streak & Frequency Stats */}
        <div className="space-y-4">
          {/* Streak Stats */}
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 rounded-lg bg-success/5 border border-success/20">
              <div className="flex items-center gap-2 mb-2">
                <Flame className="w-4 h-4 text-success" />
                <span className="text-xs text-muted-foreground">Avg Win Streak</span>
              </div>
              <p className="text-2xl font-bold font-mono text-success">
                {qualityStats.avgWinStreak.toFixed(1)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Consecutive wins</p>
            </div>

            <div className="p-4 rounded-lg bg-destructive/5 border border-destructive/20">
              <div className="flex items-center gap-2 mb-2">
                <Activity className="w-4 h-4 text-destructive" />
                <span className="text-xs text-muted-foreground">Avg Loss Streak</span>
              </div>
              <p className="text-2xl font-bold font-mono text-destructive">
                {qualityStats.avgLossStreak.toFixed(1)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Consecutive losses</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 rounded-lg bg-success/5 border border-success/20">
              <div className="flex items-center gap-2 mb-2">
                <Flame className="w-4 h-4 text-success" />
                <span className="text-xs text-muted-foreground">Best Winning Streak</span>
              </div>
              <p className="text-2xl font-bold font-mono text-success">
                {qualityStats.bestWinStreak.toFixed(0)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Max consecutive wins</p>
            </div>

            <div className="p-4 rounded-lg bg-destructive/5 border border-destructive/20">
              <div className="flex items-center gap-2 mb-2">
                <Activity className="w-4 h-4 text-destructive" />
                <span className="text-xs text-muted-foreground">Worst Losing Streak</span>
              </div>
              <p className="text-2xl font-bold font-mono text-destructive">
                {qualityStats.worstLosingStreak.toFixed(0)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Max consecutive losses</p>
            </div>
          </div>

          <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
            <div className="flex items-center gap-2 mb-2">
              <BarChart3 className="w-4 h-4 text-primary" />
              <span className="text-xs text-muted-foreground">Avg Holding Time</span>
            </div>
            <p className="text-2xl font-bold font-mono text-primary">
              {safeAvgHoldingHours.toFixed(1)}h
            </p>
            <p className="text-xs text-muted-foreground mt-1">Average trade duration</p>
          </div>

        </div>
      </div>
    </div>
  );
};
