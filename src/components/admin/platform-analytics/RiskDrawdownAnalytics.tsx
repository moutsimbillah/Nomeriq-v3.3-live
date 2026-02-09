import { RiskStats } from "@/hooks/useGlobalTradeStats";
import { Shield, AlertTriangle, TrendingDown, TrendingUp, Activity, Target } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  riskStats: RiskStats;
  isLoading: boolean;
}

export const RiskDrawdownAnalytics = ({ riskStats, isLoading }: Props) => {
  if (isLoading) {
    return (
      <div className="glass-card p-6 animate-pulse">
        <div className="h-6 bg-muted rounded w-1/3 mb-4" />
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-muted rounded" />
          ))}
        </div>
      </div>
    );
  }

  const getDrawdownStatus = () => {
    if (riskStats.currentDrawdownPercent > 20) return { status: "critical", color: "destructive" };
    if (riskStats.currentDrawdownPercent > 10) return { status: "warning", color: "warning" };
    return { status: "safe", color: "success" };
  };

  const drawdownStatus = getDrawdownStatus();

  return (
    <div className="glass-card p-6 shadow-none">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-destructive/10">
            <AlertTriangle className="w-5 h-5 text-destructive" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">Risk & Drawdown Analytics</h3>
            <p className="text-sm text-muted-foreground">Platform-wide risk metrics</p>
          </div>
        </div>
        <div className={cn(
          "px-3 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wide",
          drawdownStatus.color === "success" && "bg-success/20 text-success",
          drawdownStatus.color === "warning" && "bg-warning/20 text-warning",
          drawdownStatus.color === "destructive" && "bg-destructive/20 text-destructive"
        )}>
          {drawdownStatus.status}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {/* Max Drawdown % */}
        <div className="p-4 rounded-lg bg-destructive/5 border border-destructive/20">
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown className="w-4 h-4 text-destructive" />
            <span className="text-xs text-muted-foreground">Max Drawdown %</span>
          </div>
          <p className="text-2xl font-bold font-mono text-destructive">
            {riskStats.maxDrawdownPercent.toFixed(1)}%
          </p>
        </div>

        {/* Max Drawdown USD */}
        <div className="p-4 rounded-lg bg-destructive/5 border border-destructive/20">
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown className="w-4 h-4 text-destructive" />
            <span className="text-xs text-muted-foreground">Max Drawdown $</span>
          </div>
          <p className="text-2xl font-bold font-mono text-destructive">
            ${riskStats.maxDrawdownUSD.toFixed(2)}
          </p>
        </div>

        {/* Current Drawdown */}
        <div className={cn(
          "p-4 rounded-lg border",
          drawdownStatus.color === "success" && "bg-success/5 border-success/20",
          drawdownStatus.color === "warning" && "bg-warning/5 border-warning/20",
          drawdownStatus.color === "destructive" && "bg-destructive/5 border-destructive/20"
        )}>
          <div className="flex items-center gap-2 mb-2">
            <Activity className={cn(
              "w-4 h-4",
              drawdownStatus.color === "success" && "text-success",
              drawdownStatus.color === "warning" && "text-warning",
              drawdownStatus.color === "destructive" && "text-destructive"
            )} />
            <span className="text-xs text-muted-foreground">Current Drawdown</span>
          </div>
          <p className={cn(
            "text-2xl font-bold font-mono",
            drawdownStatus.color === "success" && "text-success",
            drawdownStatus.color === "warning" && "text-warning",
            drawdownStatus.color === "destructive" && "text-destructive"
          )}>
            {riskStats.currentDrawdownPercent.toFixed(1)}%
          </p>
        </div>

        {/* Recovery Progress */}
        <div className="p-4 rounded-lg bg-secondary/30">
          <div className="flex items-center gap-2 mb-2">
            <Shield className="w-4 h-4 text-primary" />
            <span className="text-xs text-muted-foreground">Recovery Progress</span>
          </div>
          <p className="text-2xl font-bold font-mono text-primary">
            {riskStats.recoveryProgress.toFixed(0)}%
          </p>
          <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
            <div 
              className="h-full bg-primary rounded-full transition-all"
              style={{ width: `${riskStats.recoveryProgress}%` }}
            />
          </div>
        </div>
      </div>

      {/* Secondary Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="p-4 rounded-lg bg-secondary/30">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-warning" />
            <span className="text-xs text-muted-foreground">Worst Losing Streak</span>
          </div>
          <p className="text-xl font-bold font-mono">{riskStats.worstLosingStreak}</p>
          <p className="text-xs text-muted-foreground mt-1">Consecutive losses</p>
        </div>

        <div className="p-4 rounded-lg bg-destructive/5 border border-destructive/20">
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown className="w-4 h-4 text-destructive" />
            <span className="text-xs text-muted-foreground">Largest Single Loss</span>
          </div>
          <p className="text-xl font-bold font-mono text-destructive">
            ${Math.abs(riskStats.largestSingleLoss).toFixed(2)}
          </p>
        </div>

        <div className="p-4 rounded-lg bg-success/5 border border-success/20">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-success" />
            <span className="text-xs text-muted-foreground">Largest Single Win</span>
          </div>
          <p className="text-xl font-bold font-mono text-success">
            ${riskStats.largestSingleWin.toFixed(2)}
          </p>
        </div>
      </div>
    </div>
  );
};
