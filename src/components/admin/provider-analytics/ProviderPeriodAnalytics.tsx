import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Target, Calendar } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ProviderPeriodStats, TimePeriod } from "@/hooks/useProviderTradeStats";

interface ProviderPeriodAnalyticsProps {
  stats: ProviderPeriodStats;
  period: TimePeriod;
  setPeriod: (period: TimePeriod) => void;
  isLoading: boolean;
}

const periodOptions: { value: TimePeriod; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'this_week', label: 'This Week' },
  { value: 'last_week', label: 'Last Week' },
  { value: 'this_month', label: 'This Month' },
  { value: 'last_month', label: 'Last Month' },
];

export const ProviderPeriodAnalytics = ({ 
  stats, 
  period, 
  setPeriod, 
  isLoading 
}: ProviderPeriodAnalyticsProps) => {
  if (isLoading) {
    return (
      <Card className="glass-card shadow-none">
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass-card shadow-none">
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-primary" />
            <CardTitle>Period Performance</CardTitle>
          </div>
          <div className="flex flex-wrap gap-2">
            {periodOptions.map((option) => (
              <Button
                key={option.value}
                variant={period === option.value ? "default" : "outline"}
                size="sm"
                onClick={() => setPeriod(option.value)}
                className={cn(
                  period === option.value && "bg-primary hover:bg-primary/90"
                )}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* Total Trades */}
          <div className="p-4 rounded-xl bg-secondary/30 border border-border/50">
            <p className="text-xs text-muted-foreground mb-1">Trades</p>
            <p className="text-2xl font-bold">{stats.tradesCount}</p>
          </div>

          {/* Win Rate */}
          <div className="p-4 rounded-xl bg-secondary/30 border border-border/50">
            <p className="text-xs text-muted-foreground mb-1">Win Rate</p>
            <p className={cn(
              "text-2xl font-bold",
              stats.winRate >= 50 ? "text-success" : "text-destructive"
            )}>
              {stats.winRate.toFixed(1)}%
            </p>
            <div className="flex gap-2 mt-1 text-xs">
              <span className="text-success">{stats.wins}W</span>
              <span className="text-destructive">{stats.losses}L</span>
              <span className="text-muted-foreground">{stats.breakeven}BE</span>
            </div>
          </div>

          {/* Period P&L */}
          <div className="p-4 rounded-xl bg-secondary/30 border border-border/50">
            <p className="text-xs text-muted-foreground mb-1">Period P&L</p>
            <div className="flex items-center gap-2">
              {stats.periodPnL >= 0 ? (
                <TrendingUp className="w-5 h-5 text-success" />
              ) : (
                <TrendingDown className="w-5 h-5 text-destructive" />
              )}
              <p className={cn(
                "text-2xl font-bold font-mono",
                stats.periodPnL >= 0 ? "text-success" : "text-destructive"
              )}>
                {stats.periodPnL >= 0 ? '+' : ''}{stats.periodPnL.toFixed(2)}
              </p>
            </div>
          </div>

          {/* Avg R:R */}
          <div className="p-4 rounded-xl bg-secondary/30 border border-border/50">
            <p className="text-xs text-muted-foreground mb-1">Avg R:R</p>
            <div className="flex items-center gap-2">
              <Target className="w-5 h-5 text-primary" />
              <p className="text-2xl font-bold">{stats.avgRR.toFixed(2)}</p>
            </div>
          </div>
        </div>

        {/* Best/Worst Day */}
        {stats.tradesCount > 0 && (
          <div className="mt-4 flex flex-wrap gap-4">
            <Badge variant="outline" className="border-success/30 text-success bg-success/10 px-3 py-1">
              <TrendingUp className="w-3 h-3 mr-1" />
              Best Day: +${stats.bestDayPnL.toFixed(2)}
            </Badge>
            <Badge variant="outline" className="border-destructive/30 text-destructive bg-destructive/10 px-3 py-1">
              <TrendingDown className="w-3 h-3 mr-1" />
              Worst Day: ${stats.worstDayPnL.toFixed(2)}
            </Badge>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
