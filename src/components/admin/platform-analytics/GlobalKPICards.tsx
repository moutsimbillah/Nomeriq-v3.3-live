import { GlobalStats } from "@/hooks/useGlobalTradeStats";
import { 
  Signal, 
  TrendingUp, 
  TrendingDown, 
  Activity, 
  Target, 
  BarChart3, 
  DollarSign,
  Wallet,
  PieChart,
  Zap
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  stats: GlobalStats;
  isLoading: boolean;
}

export const GlobalKPICards = ({ stats, isLoading }: Props) => {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="glass-card p-4 animate-pulse">
            <div className="h-4 bg-muted rounded w-2/3 mb-2" />
            <div className="h-8 bg-muted rounded w-1/2" />
          </div>
        ))}
      </div>
    );
  }

  const cards = [
    {
      title: "Total Signals",
      value: stats.totalSignals.toString(),
      subtitle: `${stats.activeSignals} active`,
      icon: Signal,
      iconColor: "text-primary",
      bgColor: "bg-primary/10",
    },
    {
      title: "Completed Trades",
      value: stats.completedTrades.toString(),
      subtitle: "Platform-wide",
      icon: Activity,
      iconColor: "text-blue-500",
      bgColor: "bg-blue-500/10",
    },
    {
      title: "Total Wins",
      value: stats.totalWins.toString(),
      subtitle: `${stats.globalWinRate.toFixed(0)}% win rate`,
      icon: TrendingUp,
      iconColor: "text-success",
      bgColor: "bg-success/10",
    },
    {
      title: "Total Losses",
      value: stats.totalLosses.toString(),
      subtitle: `${(100 - stats.globalWinRate).toFixed(0)}% loss rate`,
      icon: TrendingDown,
      iconColor: "text-destructive",
      bgColor: "bg-destructive/10",
    },
    {
      title: "Breakeven",
      value: stats.totalBreakeven.toString(),
      subtitle: "No P&L impact",
      icon: Activity,
      iconColor: "text-warning",
      bgColor: "bg-warning/10",
    },
    {
      title: "Win Rate",
      value: `${stats.globalWinRate.toFixed(1)}%`,
      subtitle: stats.globalWinRate >= 50 ? "On track" : "Needs work",
      icon: Target,
      iconColor: stats.globalWinRate >= 50 ? "text-success" : "text-destructive",
      bgColor: stats.globalWinRate >= 50 ? "bg-success/10" : "bg-destructive/10",
    },
    {
      title: "Avg R:R",
      value: `1:${stats.avgRR.toFixed(1)}`,
      subtitle: "Risk to Reward",
      icon: BarChart3,
      iconColor: "text-primary",
      bgColor: "bg-primary/10",
    },
    {
      title: "Total P&L",
      value: `$${stats.totalPlatformPnL.toFixed(2)}`,
      subtitle: "Platform total",
      icon: DollarSign,
      iconColor: stats.totalPlatformPnL >= 0 ? "text-success" : "text-destructive",
      bgColor: stats.totalPlatformPnL >= 0 ? "bg-success/10" : "bg-destructive/10",
    },
    {
      title: "Avg P&L/Trade",
      value: `$${stats.avgPnLPerTrade.toFixed(2)}`,
      subtitle: "Per closed trade",
      icon: PieChart,
      iconColor: stats.avgPnLPerTrade >= 0 ? "text-success" : "text-destructive",
      bgColor: stats.avgPnLPerTrade >= 0 ? "bg-success/10" : "bg-destructive/10",
    },
    {
      title: "Risk Deployed",
      value: `$${stats.totalRiskDeployed.toFixed(0)}`,
      subtitle: "Total capital risked",
      icon: Wallet,
      iconColor: "text-blue-500",
      bgColor: "bg-blue-500/10",
    },
    {
      title: "Avg Risk/Signal",
      value: `$${stats.avgRiskPerSignal.toFixed(2)}`,
      subtitle: "Per signal",
      icon: Zap,
      iconColor: "text-primary",
      bgColor: "bg-primary/10",
    },
    {
      title: "Active Signals",
      value: stats.activeSignals.toString(),
      subtitle: "Currently running",
      icon: Activity,
      iconColor: "text-warning",
      bgColor: "bg-warning/10",
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
      {cards.map((card) => (
        <div
          key={card.title}
          className="glass-card p-4 shadow-none hover:shadow-md transition-shadow"
        >
          <div className="flex items-center gap-2 mb-2">
            <div className={cn("p-1.5 rounded-lg", card.bgColor)}>
              <card.icon className={cn("w-4 h-4", card.iconColor)} />
            </div>
            <span className="text-xs font-medium text-muted-foreground truncate">
              {card.title}
            </span>
          </div>
          <p className="text-xl font-bold font-mono">{card.value}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{card.subtitle}</p>
        </div>
      ))}
    </div>
  );
};
