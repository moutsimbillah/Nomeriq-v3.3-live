import { useState } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { TrendingUp, TrendingDown, Wallet, Target, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { cn } from "@/lib/utils";

type Period = "1W" | "1M" | "3M" | "1Y" | "ALL";

interface Props {
  data: { date: string; value: number }[];
  globalRiskPercent: number;
  isLoading: boolean;
}

const STARTING_BALANCE = 10000;

export const GlobalEquityCurve = ({ data, globalRiskPercent, isLoading }: Props) => {
  const [period, setPeriod] = useState<Period>("ALL");

  if (isLoading) {
    return (
      <div className="glass-card p-6 animate-pulse">
        <div className="h-6 bg-muted rounded w-1/3 mb-4" />
        <div className="h-[300px] bg-muted rounded" />
      </div>
    );
  }

  const currentBalance = data.length > 0 ? data[data.length - 1].value : STARTING_BALANCE;
  const totalPnL = currentBalance - STARTING_BALANCE;
  const growth = ((currentBalance - STARTING_BALANCE) / STARTING_BALANCE) * 100;
  const isPositive = growth >= 0;

  // Filter data based on period
  const getFilteredData = () => {
    if (period === "ALL" || data.length <= 1) return data;
    
    const now = new Date();
    const cutoff = new Date();
    
    switch (period) {
      case "1W":
        cutoff.setDate(now.getDate() - 7);
        break;
      case "1M":
        cutoff.setMonth(now.getMonth() - 1);
        break;
      case "3M":
        cutoff.setMonth(now.getMonth() - 3);
        break;
      case "1Y":
        cutoff.setFullYear(now.getFullYear() - 1);
        break;
    }
    
    // For simplicity, we'll show all data since we don't have actual dates
    return data;
  };

  const filteredData = getFilteredData();

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
            <h3 className="font-semibold text-lg">Global Equity Curve</h3>
            <p className="text-sm text-muted-foreground">Platform-wide simulated performance ({globalRiskPercent}% risk per trade)</p>
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
            ${STARTING_BALANCE.toLocaleString()}
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
      <div className="h-[300px] p-4 rounded-xl bg-secondary/20">
        {filteredData.length <= 1 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <div className="text-center">
              <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-secondary/50 flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-muted-foreground/50" />
              </div>
              <p className="text-base font-medium">No trade history yet</p>
              <p className="text-sm mt-1 text-muted-foreground/70">Equity curve will appear once trades are closed</p>
            </div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={filteredData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="globalEquityGradient" x1="0" y1="0" x2="0" y2="1">
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
                fill="url(#globalEquityGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};
