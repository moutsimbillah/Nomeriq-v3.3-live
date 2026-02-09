import { useState } from "react";
import { PeriodStats, TimePeriod } from "@/hooks/useGlobalTradeStats";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Calendar as CalendarIcon, TrendingUp, TrendingDown, Target, BarChart3, DollarSign, Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

interface DateRange {
  from: Date;
  to: Date;
}

interface Props {
  stats: PeriodStats;
  period: TimePeriod;
  setPeriod: (p: TimePeriod) => void;
  dateRange: DateRange;
  customRange: DateRange | null;
  setCustomRange: (r: DateRange | null) => void;
  isLoading: boolean;
}

export const TimePeriodAnalytics = ({
  stats,
  period,
  setPeriod,
  dateRange,
  customRange,
  setCustomRange,
  isLoading,
}: Props) => {
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);

  const periods: { value: TimePeriod; label: string }[] = [
    { value: "today", label: "Today" },
    { value: "this_week", label: "This Week" },
    { value: "last_week", label: "Last Week" },
    { value: "this_month", label: "This Month" },
    { value: "last_month", label: "Last Month" },
  ];

  const handleCustomSelect = (range: { from?: Date; to?: Date } | undefined) => {
    if (range?.from && range?.to) {
      setCustomRange({ from: range.from, to: range.to });
      setPeriod("custom");
    }
  };

  if (isLoading) {
    return (
      <div className="glass-card p-6 animate-pulse">
        <div className="h-6 bg-muted rounded w-1/3 mb-4" />
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-20 bg-muted rounded" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card p-6 shadow-none">
      {/* Header with Period Selection */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-primary/10">
            <CalendarIcon className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">Time-Based Performance</h3>
            <p className="text-sm text-muted-foreground">
              {format(dateRange.from, "MMM dd")} - {format(dateRange.to, "MMM dd, yyyy")}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {periods.map((p) => (
            <Button
              key={p.value}
              variant={period === p.value ? "default" : "outline"}
              size="sm"
              onClick={() => setPeriod(p.value)}
            >
              {p.label}
            </Button>
          ))}
          <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
            <PopoverTrigger asChild>
              <Button
                variant={period === "custom" ? "default" : "outline"}
                size="sm"
              >
                <CalendarIcon className="w-4 h-4 mr-1" />
                Custom
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="range"
                selected={customRange || undefined}
                onSelect={handleCustomSelect}
                numberOfMonths={2}
                className="pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
        {/* Period P&L */}
        <div className={cn(
          "p-4 rounded-lg border",
          stats.periodPnL >= 0 ? "bg-success/5 border-success/20" : "bg-destructive/5 border-destructive/20"
        )}>
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className={cn("w-4 h-4", stats.periodPnL >= 0 ? "text-success" : "text-destructive")} />
            <span className="text-xs text-muted-foreground">Period P&L</span>
          </div>
          <p className={cn("text-2xl font-bold font-mono", stats.periodPnL >= 0 ? "text-success" : "text-destructive")}>
            ${stats.periodPnL.toFixed(2)}
          </p>
        </div>

        {/* Trades Count */}
        <div className="p-4 rounded-lg bg-secondary/30">
          <div className="flex items-center gap-2 mb-2">
            <Activity className="w-4 h-4 text-primary" />
            <span className="text-xs text-muted-foreground">Trades</span>
          </div>
          <p className="text-2xl font-bold font-mono">{stats.tradesCount}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {stats.wins}W / {stats.losses}L / {stats.breakeven}BE
          </p>
        </div>

        {/* Win Rate */}
        <div className="p-4 rounded-lg bg-secondary/30">
          <div className="flex items-center gap-2 mb-2">
            <Target className={cn("w-4 h-4", stats.winRate >= 50 ? "text-success" : "text-destructive")} />
            <span className="text-xs text-muted-foreground">Win Rate</span>
          </div>
          <p className={cn("text-2xl font-bold font-mono", stats.winRate >= 50 ? "text-success" : "text-destructive")}>
            {stats.winRate.toFixed(1)}%
          </p>
        </div>

        {/* Avg R:R */}
        <div className="p-4 rounded-lg bg-secondary/30">
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 className="w-4 h-4 text-primary" />
            <span className="text-xs text-muted-foreground">Avg R:R</span>
          </div>
          <p className="text-2xl font-bold font-mono text-primary">1:{stats.avgRR.toFixed(1)}</p>
        </div>

        {/* Expected Value */}
        <div className={cn(
          "p-4 rounded-lg border",
          stats.expectedValue >= 0 ? "bg-success/5 border-success/20" : "bg-destructive/5 border-destructive/20"
        )}>
          <div className="flex items-center gap-2 mb-2">
            {stats.expectedValue >= 0 ? (
              <TrendingUp className="w-4 h-4 text-success" />
            ) : (
              <TrendingDown className="w-4 h-4 text-destructive" />
            )}
            <span className="text-xs text-muted-foreground">Expected Value</span>
          </div>
          <p className={cn("text-2xl font-bold font-mono", stats.expectedValue >= 0 ? "text-success" : "text-destructive")}>
            ${stats.expectedValue.toFixed(2)}
          </p>
        </div>
      </div>

      {/* Best/Worst Day */}
      <div className="grid grid-cols-2 gap-4">
        <div className="p-4 rounded-lg bg-success/5 border border-success/20">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-success" />
            <span className="text-sm font-medium">Best Day P&L</span>
          </div>
          <p className="text-xl font-bold font-mono text-success">${stats.bestDayPnL.toFixed(2)}</p>
        </div>
        <div className="p-4 rounded-lg bg-destructive/5 border border-destructive/20">
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown className="w-4 h-4 text-destructive" />
            <span className="text-sm font-medium">Worst Day P&L</span>
          </div>
          <p className="text-xl font-bold font-mono text-destructive">${stats.worstDayPnL.toFixed(2)}</p>
        </div>
      </div>
    </div>
  );
};
