import { PairStats, CategoryStats } from "@/hooks/useGlobalTradeStats";
import { TrendingUp, TrendingDown, BarChart3, Target, PieChart } from "lucide-react";
import { cn } from "@/lib/utils";
import { PieChart as RechartsPC, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";

interface Props {
  pairStats: PairStats[];
  categoryStats: CategoryStats[];
  isLoading: boolean;
}

const COLORS = ["hsl(var(--success))", "hsl(var(--primary))", "hsl(var(--warning))", "hsl(var(--accent))", "hsl(var(--secondary))"];

export const PairMarketPerformance = ({ pairStats, categoryStats, isLoading }: Props) => {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {[1, 2].map((i) => (
          <div key={i} className="glass-card p-6 animate-pulse">
            <div className="h-6 bg-muted rounded w-1/2 mb-4" />
            <div className="h-40 bg-muted rounded" />
          </div>
        ))}
      </div>
    );
  }

  const topPairs = pairStats.slice(0, 5);
  const worstPairs = [...pairStats].sort((a, b) => a.totalPnL - b.totalPnL).slice(0, 5);

  const pieData = topPairs.map(p => ({
    name: p.pair,
    value: Math.abs(p.totalPnL),
    pnl: p.totalPnL,
  }));

  const categoryBarData = categoryStats.map(c => ({
    name: c.category,
    pnl: c.totalPnL,
    winRate: c.winRate,
    trades: c.tradesCount,
  }));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Pair Performance */}
      <div className="glass-card p-6 shadow-none">
        <div className="flex items-center gap-2 mb-4">
          <div className="p-2 rounded-lg bg-success/10">
            <TrendingUp className="w-5 h-5 text-success" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">Pair Performance</h3>
            <p className="text-sm text-muted-foreground">P&L by trading pair</p>
          </div>
        </div>

        {pairStats.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">No pair data available</p>
        ) : (
          <>
            {/* Pie Chart */}
            {pieData.length > 0 && (
              <div className="h-[180px] w-full mb-4">
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsPC>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={70}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {pieData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div className="bg-popover border border-border rounded-lg p-2 shadow-lg">
                              <p className="font-semibold text-sm">{data.name}</p>
                              <p className={cn("text-sm font-mono", data.pnl >= 0 ? "text-success" : "text-destructive")}>
                                ${data.pnl.toFixed(2)}
                              </p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                  </RechartsPC>
                </ResponsiveContainer>
              </div>
            )}

            {/* Top Performing */}
            <div className="mb-4">
              <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                <TrendingUp className="w-3 h-3 text-success" /> Top Performing
              </p>
              <div className="space-y-2">
                {topPairs.map((pair, index) => (
                  <div key={pair.pair} className="flex items-center justify-between p-2 rounded-lg bg-secondary/30">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                      <span className="text-sm font-medium">{pair.pair}</span>
                      <span className="text-xs text-muted-foreground">{pair.category}</span>
                    </div>
                    <div className="text-right">
                      <span className={cn("font-mono text-sm font-semibold", pair.totalPnL >= 0 ? "text-success" : "text-destructive")}>
                        ${pair.totalPnL.toFixed(2)}
                      </span>
                      <span className="text-xs text-muted-foreground ml-2">{pair.winRate.toFixed(0)}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Worst Performing */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                <TrendingDown className="w-3 h-3 text-destructive" /> Worst Performing
              </p>
              <div className="space-y-2">
                {worstPairs.slice(0, 3).map((pair) => (
                  <div key={pair.pair} className="flex items-center justify-between p-2 rounded-lg bg-destructive/5 border border-destructive/10">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{pair.pair}</span>
                    </div>
                    <span className={cn("font-mono text-sm font-semibold", pair.totalPnL >= 0 ? "text-success" : "text-destructive")}>
                      ${pair.totalPnL.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Category Performance */}
      <div className="glass-card p-6 shadow-none">
        <div className="flex items-center gap-2 mb-4">
          <div className="p-2 rounded-lg bg-primary/10">
            <PieChart className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">Asset Class Performance</h3>
            <p className="text-sm text-muted-foreground">Performance by category</p>
          </div>
        </div>

        {categoryStats.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">No category data available</p>
        ) : (
          <>
            {/* Bar Chart */}
            <div className="h-[180px] w-full mb-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categoryBarData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}`} width={50} />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-popover border border-border rounded-lg p-2 shadow-lg">
                            <p className="font-semibold text-sm">{label}</p>
                            <p className={cn("text-sm font-mono", data.pnl >= 0 ? "text-success" : "text-destructive")}>
                              ${data.pnl.toFixed(2)}
                            </p>
                            <p className="text-xs text-muted-foreground">{data.trades} trades</p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar dataKey="pnl" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Category Cards */}
            <div className="grid grid-cols-2 gap-3">
              {categoryStats.map((cat) => (
                <div key={cat.category} className="p-3 rounded-lg bg-secondary/30">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium capitalize">{cat.category}</span>
                    <span className={cn("text-xs font-mono font-semibold", cat.winRate >= 50 ? "text-success" : "text-destructive")}>
                      {cat.winRate.toFixed(0)}%
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{cat.tradesCount} trades</span>
                    <span className={cn("font-mono", cat.totalPnL >= 0 ? "text-success" : "text-destructive")}>
                      ${cat.totalPnL.toFixed(2)}
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className={cn("h-full rounded-full", cat.winRate >= 50 ? "bg-success" : "bg-destructive")}
                      style={{ width: `${cat.winRate}%` }}
                    />
                  </div>
                  <div className="flex justify-between mt-1 text-[10px] text-muted-foreground">
                    <span>{cat.wins}W / {cat.losses}L</span>
                    <span>R:R 1:{cat.avgRR.toFixed(1)}</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
