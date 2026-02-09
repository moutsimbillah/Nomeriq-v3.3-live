import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { useSignalStats } from "@/hooks/useSignalStats";
import { useMemo, useState } from "react";
import { format, subMonths, subWeeks, subYears, parseISO } from "date-fns";
import { TrendingUp, TrendingDown, Wallet, Target, ArrowUpRight, ArrowDownRight, Shield, AlertTriangle, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type Period = "1W" | "1M" | "3M" | "1Y" | "ALL";

// Simulated starting balance for signal tracking
const SIMULATED_STARTING_BALANCE = 10000;
const SIMULATED_RISK_PER_TRADE = 0.02; // 2%

export const AdminSignalEquityChart = () => {
  const { signals, isLoading } = useSignalStats();
  const [period, setPeriod] = useState<Period>("1Y");

  // Filter closed signals
  const closedSignals = useMemo(() => 
    signals.filter(s => s.status === "tp_hit" || s.status === "sl_hit" || s.status === "breakeven"),
    [signals]
  );

  // Calculate simulated P&L based on signals
  const { chartData, currentBalance, totalPnL } = useMemo(() => {
    const now = new Date();
    let startDate: Date;
    switch (period) {
      case "1W":
        startDate = subWeeks(now, 1);
        break;
      case "1M":
        startDate = subMonths(now, 1);
        break;
      case "3M":
        startDate = subMonths(now, 3);
        break;
      case "1Y":
        startDate = subYears(now, 1);
        break;
      case "ALL":
      default:
        startDate = new Date(0);
        break;
    }

    const filteredSignals = closedSignals
      .filter(s => parseISO(s.closed_at || s.created_at) >= startDate)
      .sort((a, b) => parseISO(a.closed_at || a.created_at).getTime() - parseISO(b.closed_at || b.created_at).getTime());

    if (filteredSignals.length === 0) {
      return {
        chartData: [
          { date: "Start", value: SIMULATED_STARTING_BALANCE },
          { date: "Now", value: SIMULATED_STARTING_BALANCE }
        ],
        currentBalance: SIMULATED_STARTING_BALANCE,
        totalPnL: 0
      };
    }

    let balance = SIMULATED_STARTING_BALANCE;
    const data = [{ date: format(startDate, "MMM dd"), value: balance }];
    
    filteredSignals.forEach(signal => {
      const riskAmount = balance * SIMULATED_RISK_PER_TRADE;
      
      // Calculate R:R for this signal
      const entry = signal.entry_price || 0;
      const sl = signal.stop_loss || 0;
      const tp = signal.take_profit || 0;
      let rr = 1;
      
      if (signal.direction === "BUY" && entry - sl !== 0) {
        rr = Math.abs((tp - entry) / (entry - sl));
      } else if (signal.direction === "SELL" && sl - entry !== 0) {
        rr = Math.abs((entry - tp) / (sl - entry));
      }

      if (signal.status === "tp_hit") {
        balance += riskAmount * rr;
      } else if (signal.status === "sl_hit") {
        balance -= riskAmount;
      }
      // breakeven = no change

      data.push({
        date: format(parseISO(signal.closed_at || signal.created_at), "MMM dd"),
        value: Math.round(balance * 100) / 100
      });
    });

    return {
      chartData: data,
      currentBalance: balance,
      totalPnL: balance - SIMULATED_STARTING_BALANCE
    };
  }, [closedSignals, period]);

  const growth = ((currentBalance - SIMULATED_STARTING_BALANCE) / SIMULATED_STARTING_BALANCE) * 100;
  const isPositive = growth >= 0;
  const hasNoActivity = closedSignals.length === 0;

  // Calculate Account Health Meter for signals
  const signalHealth = useMemo(() => {
    const sortedSignals = [...closedSignals].sort(
      (a, b) => parseISO(a.closed_at || a.created_at).getTime() - parseISO(b.closed_at || b.created_at).getTime()
    );

    // Calculate drawdown
    let peak = SIMULATED_STARTING_BALANCE;
    let maxDrawdown = 0;
    let runningBalance = SIMULATED_STARTING_BALANCE;
    
    sortedSignals.forEach(signal => {
      const riskAmount = runningBalance * SIMULATED_RISK_PER_TRADE;
      const entry = signal.entry_price || 0;
      const sl = signal.stop_loss || 0;
      const tp = signal.take_profit || 0;
      let rr = 1;
      
      if (signal.direction === "BUY" && entry - sl !== 0) {
        rr = Math.abs((tp - entry) / (entry - sl));
      } else if (signal.direction === "SELL" && sl - entry !== 0) {
        rr = Math.abs((entry - tp) / (sl - entry));
      }

      if (signal.status === "tp_hit") {
        runningBalance += riskAmount * rr;
      } else if (signal.status === "sl_hit") {
        runningBalance -= riskAmount;
      }

      if (runningBalance > peak) peak = runningBalance;
      const drawdown = peak > 0 ? ((peak - runningBalance) / peak) * 100 : 0;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    });

    const currentDrawdown = peak > 0 ? ((peak - currentBalance) / peak) * 100 : 0;

    // Consecutive losses
    let consecutiveLosses = 0;
    for (let i = sortedSignals.length - 1; i >= 0; i--) {
      if (sortedSignals[i].status === "sl_hit") {
        consecutiveLosses++;
      } else {
        break;
      }
    }

    // Active signals (risk exposure)
    const activeSignals = signals.filter(s => s.status === "active").length;
    const riskExposurePercent = activeSignals * 2; // 2% per signal

    // Equity slope (last 5 signals)
    const recentSignals = sortedSignals.slice(-5);
    let equitySlope = 0;
    if (recentSignals.length >= 2) {
      const wins = recentSignals.filter(s => s.status === "tp_hit").length;
      equitySlope = wins >= 3 ? 1 : wins <= 1 ? -1 : 0;
    }

    // Health Score
    let healthScore = 100;
    healthScore -= Math.min(currentDrawdown * 2, 40);
    healthScore -= Math.min(consecutiveLosses * 10, 30);
    healthScore -= Math.min(riskExposurePercent * 2, 20);
    healthScore += equitySlope * 10;
    healthScore = Math.max(0, Math.min(100, healthScore));

    let status: "safe" | "warning" | "critical" = "safe";
    if (healthScore < 40) status = "critical";
    else if (healthScore < 70) status = "warning";

    return {
      score: healthScore,
      status,
      currentDrawdown,
      consecutiveLosses,
      riskExposurePercent,
      equitySlope,
    };
  }, [closedSignals, signals, currentBalance]);

  if (isLoading) {
    return (
      <div className="glass-card p-6 animate-pulse">
        <div className="h-6 bg-muted rounded w-1/3 mb-4"></div>
        <div className="h-[320px] bg-muted rounded"></div>
      </div>
    );
  }

  return (
    <div className="glass-card p-6 shadow-none">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className={cn(
            "p-2.5 rounded-xl",
            isPositive ? "bg-success/10" : "bg-destructive/10"
          )}>
            {isPositive ? (
              <TrendingUp className="w-5 h-5 text-success" />
            ) : (
              <TrendingDown className="w-5 h-5 text-destructive" />
            )}
          </div>
          <div>
            <h3 className="font-semibold text-lg">Signal Equity Curve</h3>
            <p className="text-sm text-muted-foreground">Simulated account growth based on signals</p>
          </div>
        </div>
        
        {/* Period Selector */}
        <div className="flex items-center gap-1 p-1 rounded-lg bg-secondary/50">
          {(["1W", "1M", "3M", "1Y", "ALL"] as Period[]).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200",
                period === p
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              )}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="p-4 rounded-xl bg-secondary/30 border border-border/50">
          <div className="flex items-center gap-2 mb-2">
            <Wallet className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Starting Balance</span>
          </div>
          <p className="text-2xl font-bold font-mono">
            ${SIMULATED_STARTING_BALANCE.toLocaleString()}
          </p>
        </div>

        <div className={cn(
          "p-4 rounded-xl border",
          isPositive ? "bg-success/5 border-success/20" : "bg-destructive/5 border-destructive/20"
        )}>
          <div className="flex items-center gap-2 mb-2">
            <Target className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Current Balance</span>
          </div>
          <div className="flex items-baseline gap-2">
            <p className={cn(
              "text-2xl font-bold font-mono",
              isPositive ? "text-success" : "text-destructive"
            )}>
              ${currentBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <span className={cn(
              "text-xs font-medium flex items-center gap-0.5",
              isPositive ? "text-success" : "text-destructive"
            )}>
              {isPositive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
              {isPositive ? "+" : ""}{totalPnL.toFixed(2)}
            </span>
          </div>
        </div>

        <div className={cn(
          "p-4 rounded-xl border",
          isPositive ? "bg-success/5 border-success/20" : "bg-destructive/5 border-destructive/20"
        )}>
          <div className="flex items-center gap-2 mb-2">
            {isPositive ? (
              <TrendingUp className="w-4 h-4 text-success" />
            ) : (
              <TrendingDown className="w-4 h-4 text-destructive" />
            )}
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Total Growth</span>
          </div>
          <div className="flex items-baseline gap-2">
            <p className={cn(
              "text-2xl font-bold font-mono",
              isPositive ? "text-success" : "text-destructive"
            )}>
              {isPositive ? "+" : ""}{growth.toFixed(2)}%
            </p>
            <span className={cn(
              "text-xs font-medium px-1.5 py-0.5 rounded-full",
              isPositive ? "bg-success/20 text-success" : "bg-destructive/20 text-destructive"
            )}>
              {isPositive ? "Profit" : "Loss"}
            </span>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="h-[280px] lg:h-[320px] p-4 rounded-xl bg-secondary/20">
        {hasNoActivity ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <div className="text-center">
              <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-secondary/50 flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-muted-foreground/50" />
              </div>
              <p className="text-base font-medium">No signal history yet</p>
              <p className="text-sm mt-1 text-muted-foreground/70">Equity curve will appear once signals are closed</p>
            </div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="signalEquityGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop 
                    offset="0%" 
                    stopColor={isPositive ? "hsl(var(--success))" : "hsl(var(--destructive))"} 
                    stopOpacity={0.25} 
                  />
                  <stop 
                    offset="100%" 
                    stopColor={isPositive ? "hsl(var(--success))" : "hsl(var(--destructive))"} 
                    stopOpacity={0} 
                  />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="date"
                axisLine={false}
                tickLine={false}
                dy={10}
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                dx={-5}
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                tickFormatter={value => `$${(value / 1000).toFixed(1)}k`}
                width={50}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    const value = payload[0].value as number;
                    return (
                      <div className="bg-popover border border-border rounded-lg p-3 shadow-lg">
                        <p className="text-xs text-muted-foreground mb-1">{label}</p>
                        <p className={cn(
                          "text-lg font-bold font-mono",
                          isPositive ? "text-success" : "text-destructive"
                        )}>
                          ${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke={isPositive ? "hsl(var(--success))" : "hsl(var(--destructive))"}
                strokeWidth={2.5}
                fill="url(#signalEquityGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Signal Health Meter */}
      <div className="mt-6 p-4 rounded-xl bg-secondary/30 border border-border/50">
        <div className="flex items-center gap-2 mb-4">
          {signalHealth.status === "safe" && <Shield className="w-5 h-5 text-success" />}
          {signalHealth.status === "warning" && <AlertTriangle className="w-5 h-5 text-warning" />}
          {signalHealth.status === "critical" && <AlertCircle className="w-5 h-5 text-destructive" />}
          <h4 className="font-semibold">Signal Health Meter</h4>
          <div className={cn(
            "ml-auto px-2.5 py-1 rounded-full text-xs font-semibold uppercase tracking-wide",
            signalHealth.status === "safe" && "bg-success/20 text-success",
            signalHealth.status === "warning" && "bg-warning/20 text-warning",
            signalHealth.status === "critical" && "bg-destructive/20 text-destructive"
          )}>
            {signalHealth.status}
          </div>
        </div>

        {/* Health Score Gauge */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">Health Score</span>
            <span className={cn(
              "text-lg font-bold font-mono",
              signalHealth.status === "safe" && "text-success",
              signalHealth.status === "warning" && "text-warning",
              signalHealth.status === "critical" && "text-destructive"
            )}>
              {signalHealth.score.toFixed(0)}%
            </span>
          </div>
          <div className="relative">
            <div className="h-3 w-full rounded-full bg-secondary overflow-hidden">
              <div 
                className="h-full rounded-full transition-all duration-500"
                style={{ 
                  width: `${signalHealth.score}%`,
                  background: `linear-gradient(90deg, hsl(0, 70%, 45%) 0%, hsl(45, 90%, 50%) 50%, hsl(120, 60%, 45%) 100%)`,
                  backgroundSize: "100% 100%",
                  backgroundPosition: `${100 - signalHealth.score}% 0`
                }}
              />
            </div>
            <div className="absolute top-0 left-[40%] w-px h-3 bg-border/50" />
            <div className="absolute top-0 left-[70%] w-px h-3 bg-border/50" />
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[10px] text-muted-foreground">Critical</span>
            <span className="text-[10px] text-muted-foreground">Warning</span>
            <span className="text-[10px] text-muted-foreground">Safe</span>
          </div>
        </div>

        {/* Health Factors */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3 rounded-lg bg-secondary/50">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Current Drawdown</p>
            <p className={cn(
              "text-sm font-bold font-mono",
              signalHealth.currentDrawdown > 15 ? "text-destructive" : 
              signalHealth.currentDrawdown > 5 ? "text-warning" : "text-success"
            )}>
              {signalHealth.currentDrawdown.toFixed(1)}%
            </p>
          </div>
          <div className="p-3 rounded-lg bg-secondary/50">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Consec. Losses</p>
            <p className={cn(
              "text-sm font-bold font-mono",
              signalHealth.consecutiveLosses >= 3 ? "text-destructive" : 
              signalHealth.consecutiveLosses >= 2 ? "text-warning" : "text-success"
            )}>
              {signalHealth.consecutiveLosses}
            </p>
          </div>
          <div className="p-3 rounded-lg bg-secondary/50">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Risk Exposure</p>
            <p className={cn(
              "text-sm font-bold font-mono",
              signalHealth.riskExposurePercent > 10 ? "text-destructive" : 
              signalHealth.riskExposurePercent > 6 ? "text-warning" : "text-success"
            )}>
              {signalHealth.riskExposurePercent.toFixed(1)}%
            </p>
          </div>
          <div className="p-3 rounded-lg bg-secondary/50">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Equity Slope</p>
            <p className={cn(
              "text-sm font-bold font-mono",
              signalHealth.equitySlope > 0 ? "text-success" : 
              signalHealth.equitySlope < 0 ? "text-destructive" : "text-muted-foreground"
            )}>
              {signalHealth.equitySlope > 0 ? "↑ Positive" : signalHealth.equitySlope < 0 ? "↓ Negative" : "→ Neutral"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};