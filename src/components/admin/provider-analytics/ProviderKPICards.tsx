import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Target, Activity, Users, Award, BarChart3, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { ProviderStats } from "@/hooks/useProviderTradeStats";

interface ProviderKPICardsProps {
  stats: ProviderStats;
  isLoading: boolean;
}

export const ProviderKPICards = ({ stats, isLoading }: ProviderKPICardsProps) => {
  const cards = [
    {
      title: "Total Signals",
      value: stats.totalSignals,
      icon: BarChart3,
      color: "text-primary",
      bgColor: "bg-primary/10",
      suffix: "",
    },
    {
      title: "Active Signals",
      value: stats.activeSignals,
      icon: Activity,
      color: "text-warning",
      bgColor: "bg-warning/10",
      suffix: "",
    },
    {
      title: "Win Rate",
      value: stats.winRate.toFixed(1),
      icon: Target,
      color: stats.winRate >= 50 ? "text-success" : "text-destructive",
      bgColor: stats.winRate >= 50 ? "bg-success/10" : "bg-destructive/10",
      suffix: "%",
    },
    {
      title: "Avg R:R",
      value: stats.avgRR.toFixed(2),
      icon: TrendingUp,
      color: "text-primary",
      bgColor: "bg-primary/10",
      suffix: "",
    },
    {
      title: "Wins / Losses",
      value: `${stats.totalWins} / ${stats.totalLosses}`,
      icon: stats.totalWins >= stats.totalLosses ? TrendingUp : TrendingDown,
      color: stats.totalWins >= stats.totalLosses ? "text-success" : "text-destructive",
      bgColor: stats.totalWins >= stats.totalLosses ? "bg-success/10" : "bg-destructive/10",
      suffix: "",
    },
    {
      title: "Total P&L",
      value: stats.totalPlatformPnL >= 0 
        ? `+$${stats.totalPlatformPnL.toFixed(2)}` 
        : `-$${Math.abs(stats.totalPlatformPnL).toFixed(2)}`,
      icon: stats.totalPlatformPnL >= 0 ? TrendingUp : TrendingDown,
      color: stats.totalPlatformPnL >= 0 ? "text-success" : "text-destructive",
      bgColor: stats.totalPlatformPnL >= 0 ? "bg-success/10" : "bg-destructive/10",
      suffix: "",
      noFormat: true,
    },
    {
      title: "Subscribers",
      value: stats.subscriberCount,
      icon: Users,
      color: "text-primary",
      bgColor: "bg-primary/10",
      suffix: "",
    },
    {
      title: "Quality Score",
      value: stats.qualityScore.toFixed(0),
      icon: Award,
      color: stats.qualityScore >= 70 ? "text-success" : stats.qualityScore >= 40 ? "text-warning" : "text-destructive",
      bgColor: stats.qualityScore >= 70 ? "bg-success/10" : stats.qualityScore >= 40 ? "bg-warning/10" : "bg-destructive/10",
      suffix: "/100",
    },
  ];

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Card key={i} className="glass-card shadow-none">
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {cards.map((card, index) => (
        <Card key={index} className="glass-card shadow-none hover:border-primary/30 transition-colors">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              {card.title}
            </CardTitle>
            <div className={cn("p-2 rounded-lg", card.bgColor)}>
              <card.icon className={cn("h-4 w-4", card.color)} />
            </div>
          </CardHeader>
          <CardContent>
            <div className={cn("text-2xl font-bold", card.color)}>
              {card.noFormat ? card.value : `${card.value}${card.suffix}`}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};
