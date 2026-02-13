import { useState, useMemo } from "react";
import { useTrades } from "@/hooks/useTrades";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { Calendar, TrendingUp, TrendingDown, BarChart3, Target, Percent, Activity } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, Area, AreaChart } from "recharts";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { format, startOfWeek, endOfWeek, subWeeks, isWithinInterval, parseISO } from "date-fns";
import { calculateWinRatePercent } from "@/lib/kpi-math";
import { calculateSignalRr } from "@/lib/trade-math";

type PeriodType = "this_week" | "last_week" | "custom";

interface DateRange {
  from: Date | undefined;
  to: Date | undefined;
}

export const WeeklyTradesAnalytics = () => {
  const { trades, isLoading } = useTrades({ realtime: true, fetchAll: true });
  const { profile } = useAuth();
  const accountBalance = profile?.account_balance || 0;

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

  // Filter closed trades within the selected date range
  const filteredTrades = useMemo(() => {
    if (!dateRange.from || !dateRange.to) return [];

    return trades.filter((trade) => {
      if (trade.result !== "win" && trade.result !== "loss" && trade.result !== "breakeven") {
        return false;
      }
      const tradeDate = trade.closed_at ? parseISO(trade.closed_at) : parseISO(trade.created_at);
      return isWithinInterval(tradeDate, { start: dateRange.from!, end: dateRange.to! });
    });
  }, [trades, dateRange]);

  // Calculate metrics
  const metrics = useMemo(() => {
    if (filteredTrades.length === 0) {
      return {
        netPnL: 0,
        growth: 0,
        tradesTaken: 0,
        winRate: 0,
        avgRR: 0,
        wins: 0,
        losses: 0,
        breakeven: 0,
      };
    }

    const netPnL = filteredTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const wins = filteredTrades.filter((t) => t.result === "win").length;
    const losses = filteredTrades.filter((t) => t.result === "loss").length;
    const breakeven = filteredTrades.filter((t) => t.result === "breakeven").length;
    const winRate = calculateWinRatePercent(wins, losses);

    // Calculate growth based on account balance at start of period
    const startBalance = accountBalance - netPnL;
    const growth = startBalance > 0 ? (netPnL / startBalance) * 100 : 0;

    // Calculate average R:R
    let totalRR = 0;
    let rrCount = 0;
    filteredTrades.forEach((trade) => {
      const rr = calculateSignalRr(trade);
      if (rr > 0) {
        totalRR += rr;
        rrCount++;
      }
    });
    const avgRR = rrCount > 0 ? totalRR / rrCount : 0;

    return {
      netPnL,
      growth,
      tradesTaken: filteredTrades.length,
      winRate,
      avgRR,
      wins,
      losses,
      breakeven,
    };
  }, [filteredTrades, accountBalance]);

  // Generate equity curve data
  const equityCurveData = useMemo(() => {
    if (filteredTrades.length === 0) return [];

    const sortedTrades = [...filteredTrades].sort(
      (a, b) =>
        new Date(a.closed_at || a.created_at).getTime() -
        new Date(b.closed_at || b.created_at).getTime()
    );

    const startBalance = accountBalance - metrics.netPnL;
    let runningBalance = startBalance;

    return sortedTrades.map((trade, index) => {
      runningBalance += trade.pnl || 0;
      return {
        trade: index + 1,
        balance: runningBalance,
        date: format(new Date(trade.closed_at || trade.created_at), "MMM dd"),
      };
    });
  }, [filteredTrades, accountBalance, metrics.netPnL]);

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
    <div className="glass-card p-4 shadow-none">
      {/* Header with Period Selection */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-md bg-primary/10">
            <BarChart3 className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">Weekly Trades Analytics</h3>
            <p className="text-xs text-muted-foreground">{getPeriodLabel()}</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            variant={period === "this_week" ? "default" : "outline"}
            size="sm"
            className="h-7 text-xs px-2"
            onClick={() => setPeriod("this_week")}
          >
            This Week
          </Button>
          <Button
            variant={period === "last_week" ? "default" : "outline"}
            size="sm"
            className="h-7 text-xs px-2"
            onClick={() => setPeriod("last_week")}
          >
            Last Week
          </Button>
          <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
            <PopoverTrigger asChild>
              <Button
                variant={period === "custom" ? "default" : "outline"}
                size="sm"
                className="h-7 text-xs px-2"
                onClick={() => setPeriod("custom")}
              >
                <Calendar className="w-3 h-3 mr-1" />
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

      {/* Metrics Grid - Compact */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-4">
        {/* Net PnL */}
        <div className="p-2.5 rounded-lg bg-secondary/30">
          <div className="flex items-center gap-1 mb-1">
            {metrics.netPnL >= 0 ? (
              <TrendingUp className="w-3 h-3 text-success" />
            ) : (
              <TrendingDown className="w-3 h-3 text-destructive" />
            )}
            <span className="text-[10px] text-muted-foreground">Net PnL</span>
          </div>
          <p
            className={cn(
              "text-sm font-bold font-mono",
              metrics.netPnL >= 0 ? "text-success" : "text-destructive"
            )}
          >
            {metrics.netPnL >= 0 ? "+" : ""}${metrics.netPnL.toFixed(2)}
          </p>
        </div>

        {/* Growth */}
        <div className="p-2.5 rounded-lg bg-secondary/30">
          <div className="flex items-center gap-1 mb-1">
            <Percent className="w-3 h-3 text-primary" />
            <span className="text-[10px] text-muted-foreground">Growth</span>
          </div>
          <p
            className={cn(
              "text-sm font-bold font-mono",
              metrics.growth >= 0 ? "text-success" : "text-destructive"
            )}
          >
            {metrics.growth >= 0 ? "+" : ""}{metrics.growth.toFixed(2)}%
          </p>
        </div>

        {/* Trades Taken */}
        <div className="p-2.5 rounded-lg bg-secondary/30">
          <div className="flex items-center gap-1 mb-1">
            <Activity className="w-3 h-3 text-accent" />
            <span className="text-[10px] text-muted-foreground">Trades</span>
          </div>
          <p className="text-sm font-bold font-mono">{metrics.tradesTaken}</p>
          <p className="text-[10px] text-muted-foreground">
            {metrics.wins}W / {metrics.losses}L
          </p>
        </div>

        {/* Breakeven */}
        <div className="p-2.5 rounded-lg bg-secondary/30">
          <div className="flex items-center gap-1 mb-1">
            <Activity className="w-3 h-3 text-warning" />
            <span className="text-[10px] text-muted-foreground">BE</span>
          </div>
          <p className="text-sm font-bold font-mono text-warning">{metrics.breakeven}</p>
          <p className="text-[10px] text-muted-foreground">No P&L</p>
        </div>

        {/* Win Rate */}
        <div className="p-2.5 rounded-lg bg-secondary/30">
          <div className="flex items-center gap-1 mb-1">
            <Target className="w-3 h-3 text-success" />
            <span className="text-[10px] text-muted-foreground">Win Rate</span>
          </div>
          <p
            className={cn(
              "text-sm font-bold font-mono",
              metrics.winRate >= 50 ? "text-success" : "text-destructive"
            )}
          >
            {metrics.winRate.toFixed(0)}%
          </p>
        </div>

        {/* Average R:R */}
        <div className="p-2.5 rounded-lg bg-secondary/30">
          <div className="flex items-center gap-1 mb-1">
            <BarChart3 className="w-3 h-3 text-warning" />
            <span className="text-[10px] text-muted-foreground">Avg R:R</span>
          </div>
          <p className="text-sm font-bold font-mono text-primary">
            1:{metrics.avgRR.toFixed(1)}
          </p>
        </div>
      </div>

      {/* Weekly Equity Curve - Compact */}
      <div className="p-3 rounded-lg bg-secondary/30">
        <div className="flex items-center gap-1.5 mb-2">
          <TrendingUp className="w-3 h-3 text-success" />
          <span className="text-xs font-medium">Equity Curve</span>
        </div>
        {equityCurveData.length === 0 ? (
          <div className="h-[100px] flex items-center justify-center text-muted-foreground text-xs">
            No trades in selected period
          </div>
        ) : (
          <div className="h-[100px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={equityCurveData}>
                <defs>
                  <linearGradient id="weeklyEquityGradient" x1="0" y1="0" x2="0" y2="1">
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
                  tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                  tickFormatter={(value) => `$${value.toFixed(0)}`}
                  width={40}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-popover border border-border rounded-md p-1.5 shadow-lg">
                          <p className="text-[10px] text-muted-foreground">{data.date}</p>
                          <p className="text-xs font-semibold font-mono text-success">
                            ${data.balance.toFixed(2)}
                          </p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="balance"
                  stroke="hsl(var(--success))"
                  strokeWidth={1.5}
                  fill="url(#weeklyEquityGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
};
