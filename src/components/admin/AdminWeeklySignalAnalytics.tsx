import { useState, useMemo } from "react";
import { useSignalWeeklyAnalytics } from "@/hooks/useSignalStats";
import { cn } from "@/lib/utils";
import { Calendar, TrendingUp, TrendingDown, BarChart3, Target, Activity } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, Area, AreaChart } from "recharts";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { format, startOfWeek, endOfWeek, subWeeks, parseISO } from "date-fns";

type PeriodType = "this_week" | "last_week" | "custom";

interface DateRange {
  from: Date | undefined;
  to: Date | undefined;
}

export const AdminWeeklySignalAnalytics = () => {
  const { signals, getFilteredSignals, calculateMetrics, isLoading } = useSignalWeeklyAnalytics();

  const [period, setPeriod] = useState<PeriodType>("this_week");
  const [customRange, setCustomRange] = useState<DateRange>({ from: undefined, to: undefined });
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);

  // Calculate date range based on selected period
  const dateRange = useMemo(() => {
    const now = new Date();
    switch (period) {
      case "this_week":
        return {
          from: startOfWeek(now, { weekStartsOn: 1 }),
          to: endOfWeek(now, { weekStartsOn: 1 }),
        };
      case "last_week":
        const lastWeek = subWeeks(now, 1);
        return {
          from: startOfWeek(lastWeek, { weekStartsOn: 1 }),
          to: endOfWeek(lastWeek, { weekStartsOn: 1 }),
        };
      case "custom":
        return customRange;
      default:
        return { from: undefined, to: undefined };
    }
  }, [period, customRange]);

  // Filter signals within the selected date range
  const filteredSignals = useMemo(() => {
    if (!dateRange.from || !dateRange.to) return [];
    return getFilteredSignals(dateRange.from, dateRange.to);
  }, [dateRange, getFilteredSignals]);

  const metrics = useMemo(() => calculateMetrics(filteredSignals), [filteredSignals, calculateMetrics]);

  // Generate chart data showing signal outcomes over time
  const chartData = useMemo(() => {
    if (filteredSignals.length === 0) return [];

    const sortedSignals = [...filteredSignals].sort(
      (a, b) =>
        new Date(a.closed_at || a.created_at).getTime() -
        new Date(b.closed_at || b.created_at).getTime()
    );

    let cumulativeWins = 0;
    return sortedSignals.map((signal, index) => {
      if (signal.status === 'tp_hit') cumulativeWins++;
      return {
        signal: index + 1,
        wins: cumulativeWins,
        winRate: ((cumulativeWins / (index + 1)) * 100).toFixed(1),
        date: format(new Date(signal.closed_at || signal.created_at), "MMM dd"),
      };
    });
  }, [filteredSignals]);

  const handleCustomDateSelect = (range: DateRange | undefined) => {
    if (range) {
      setCustomRange(range);
    }
  };

  const getPeriodLabel = () => {
    if (!dateRange.from || !dateRange.to) return "Select dates";
    return `${format(dateRange.from, "MMM dd")} - ${format(dateRange.to, "MMM dd, yyyy")}`;
  };

  if (isLoading) {
    return (
      <div className="glass-card p-6 animate-pulse">
        <div className="h-6 bg-muted rounded w-1/3 mb-4"></div>
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-muted rounded"></div>
          ))}
        </div>
        <div className="h-40 bg-muted rounded"></div>
      </div>
    );
  }

  return (
    <div className="glass-card p-6 shadow-none">
      {/* Header with Period Selection */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-primary/10">
            <BarChart3 className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">Weekly Signal Analytics</h3>
            <p className="text-sm text-muted-foreground">{getPeriodLabel()}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant={period === "this_week" ? "default" : "outline"}
            size="sm"
            onClick={() => setPeriod("this_week")}
          >
            This Week
          </Button>
          <Button
            variant={period === "last_week" ? "default" : "outline"}
            size="sm"
            onClick={() => setPeriod("last_week")}
          >
            Last Week
          </Button>
          <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
            <PopoverTrigger asChild>
              <Button
                variant={period === "custom" ? "default" : "outline"}
                size="sm"
                onClick={() => setPeriod("custom")}
              >
                <Calendar className="w-4 h-4 mr-1" />
                Custom
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <CalendarComponent
                mode="range"
                selected={customRange}
                onSelect={handleCustomDateSelect}
                numberOfMonths={2}
                className="pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
        {/* Signals Taken */}
        <div className="p-4 rounded-lg bg-secondary/30">
          <div className="flex items-center gap-2 mb-2">
            <Activity className="w-4 h-4 text-primary" />
            <span className="text-xs text-muted-foreground">Signals Closed</span>
          </div>
          <p className="text-xl font-bold font-mono">{metrics.signalsTaken}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {metrics.wins}W / {metrics.losses}L
          </p>
        </div>

        {/* Breakeven */}
        <div className="p-4 rounded-lg bg-secondary/30">
          <div className="flex items-center gap-2 mb-2">
            <Activity className="w-4 h-4 text-warning" />
            <span className="text-xs text-muted-foreground">Breakeven</span>
          </div>
          <p className="text-xl font-bold font-mono text-warning">{metrics.breakeven}</p>
          <p className="text-xs text-muted-foreground mt-1">No outcome</p>
        </div>

        {/* Win Rate */}
        <div className="p-4 rounded-lg bg-secondary/30">
          <div className="flex items-center gap-2 mb-2">
            <Target className="w-4 h-4 text-success" />
            <span className="text-xs text-muted-foreground">Win Rate</span>
          </div>
          <p
            className={cn(
              "text-xl font-bold font-mono",
              metrics.winRate >= 50 ? "text-success" : "text-destructive"
            )}
          >
            {metrics.winRate.toFixed(0)}%
          </p>
        </div>

        {/* Average R:R */}
        <div className="p-4 rounded-lg bg-secondary/30">
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 className="w-4 h-4 text-primary" />
            <span className="text-xs text-muted-foreground">Avg R:R</span>
          </div>
          <p className="text-xl font-bold font-mono text-primary">
            1:{metrics.avgRR.toFixed(1)}
          </p>
        </div>

        {/* Outcome */}
        <div className="p-4 rounded-lg bg-secondary/30">
          <div className="flex items-center gap-2 mb-2">
            {metrics.winRate >= 50 ? (
              <TrendingUp className="w-4 h-4 text-success" />
            ) : (
              <TrendingDown className="w-4 h-4 text-destructive" />
            )}
            <span className="text-xs text-muted-foreground">Outcome</span>
          </div>
          <p
            className={cn(
              "text-xl font-bold font-mono",
              metrics.winRate >= 50 ? "text-success" : "text-destructive"
            )}
          >
            {metrics.winRate >= 50 ? "Profitable" : "Needs Work"}
          </p>
        </div>
      </div>

      {/* Win Rate Progression Chart */}
      <div className="p-4 rounded-lg bg-secondary/30">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-4 h-4 text-success" />
          <span className="text-sm font-medium">Win Rate Progression</span>
        </div>
        {chartData.length === 0 ? (
          <div className="h-[150px] flex items-center justify-center text-muted-foreground text-sm">
            No signals in selected period
          </div>
        ) : (
          <div className="h-[150px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="adminSignalGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="5%"
                      stopColor="hsl(var(--success))"
                      stopOpacity={0.3}
                    />
                    <stop
                      offset="95%"
                      stopColor="hsl(var(--success))"
                      stopOpacity={0}
                    />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="date"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  tickFormatter={(value) => `${value}%`}
                  width={40}
                  domain={[0, 100]}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-popover border border-border rounded-lg p-2 shadow-lg">
                          <p className="text-xs text-muted-foreground">{data.date}</p>
                          <p className="font-semibold font-mono text-success">
                            {data.winRate}% Win Rate
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {data.wins} wins / {data.signal} signals
                          </p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="winRate"
                  stroke="hsl(var(--success))"
                  strokeWidth={2}
                  fill="url(#adminSignalGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
};
