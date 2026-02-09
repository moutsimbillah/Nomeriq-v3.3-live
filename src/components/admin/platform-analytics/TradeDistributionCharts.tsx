import { TradeDistribution } from "@/hooks/useGlobalTradeStats";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, PieChart, Pie, Cell } from "recharts";
import { Clock, BarChart3, PieChartIcon, Globe } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  distribution: TradeDistribution;
  isLoading: boolean;
}

const COLORS = {
  wins: "hsl(var(--success))",
  losses: "hsl(var(--destructive))",
  breakeven: "hsl(var(--warning))",
};

const BAR_COLORS = ["hsl(var(--primary))", "hsl(var(--success))", "hsl(var(--warning))", "hsl(var(--accent))", "hsl(var(--secondary))"];

export const TradeDistributionCharts = ({ distribution, isLoading }: Props) => {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="glass-card p-6 animate-pulse">
            <div className="h-6 bg-muted rounded w-1/2 mb-4" />
            <div className="h-40 bg-muted rounded" />
          </div>
        ))}
      </div>
    );
  }

  const pieData = distribution.winLossDistribution.map(d => ({
    name: d.type,
    value: d.count,
    color: d.type === 'Wins' ? COLORS.wins : d.type === 'Losses' ? COLORS.losses : COLORS.breakeven,
  }));

  const totalTrades = pieData.reduce((sum, d) => sum + d.value, 0);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* R:R Distribution */}
      <div className="glass-card p-6 shadow-none">
        <div className="flex items-center gap-2 mb-4">
          <div className="p-2 rounded-lg bg-primary/10">
            <BarChart3 className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">R:R Distribution</h3>
            <p className="text-sm text-muted-foreground">Trade risk-reward ratios</p>
          </div>
        </div>

        <div className="h-[180px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={distribution.rrDistribution} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
              <XAxis 
                dataKey="range" 
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} 
                axisLine={false} 
                tickLine={false} 
              />
              <YAxis 
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} 
                axisLine={false} 
                tickLine={false}
                width={30}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    return (
                      <div className="bg-popover border border-border rounded-lg p-2 shadow-lg">
                        <p className="font-semibold text-sm">{label}</p>
                        <p className="text-primary font-mono">{payload[0].value} trades</p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Win/Loss Distribution */}
      <div className="glass-card p-6 shadow-none">
        <div className="flex items-center gap-2 mb-4">
          <div className="p-2 rounded-lg bg-success/10">
            <PieChartIcon className="w-5 h-5 text-success" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">Win/Loss Distribution</h3>
            <p className="text-sm text-muted-foreground">{totalTrades} total trades</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="h-[160px] w-[160px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={70}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      const percent = totalTrades > 0 ? ((data.value / totalTrades) * 100).toFixed(1) : 0;
                      return (
                        <div className="bg-popover border border-border rounded-lg p-2 shadow-lg">
                          <p className="font-semibold text-sm">{data.name}</p>
                          <p className="font-mono">{data.value} ({percent}%)</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex-1 space-y-2">
            {pieData.map((entry) => (
              <div key={entry.name} className="flex items-center justify-between p-2 rounded-lg bg-secondary/30">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }} />
                  <span className="text-sm font-medium">{entry.name}</span>
                </div>
                <span className="font-mono text-sm">{entry.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Holding Time Distribution */}
      <div className="glass-card p-6 shadow-none">
        <div className="flex items-center gap-2 mb-4">
          <div className="p-2 rounded-lg bg-warning/10">
            <Clock className="w-5 h-5 text-warning" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">Holding Time Distribution</h3>
            <p className="text-sm text-muted-foreground">
              Avg duration: {distribution.avgTradeDuration.toFixed(1)}h
            </p>
          </div>
        </div>

        <div className="h-[180px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={distribution.holdingTimeDistribution} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
              <XAxis 
                dataKey="range" 
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} 
                axisLine={false} 
                tickLine={false} 
              />
              <YAxis 
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} 
                axisLine={false} 
                tickLine={false}
                width={30}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    return (
                      <div className="bg-popover border border-border rounded-lg p-2 shadow-lg">
                        <p className="font-semibold text-sm">{label}</p>
                        <p className="text-warning font-mono">{payload[0].value} trades</p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Bar dataKey="count" fill="hsl(var(--warning))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Session Performance */}
      <div className="glass-card p-6 shadow-none">
        <div className="flex items-center gap-2 mb-4">
          <div className="p-2 rounded-lg bg-blue-500/10">
            <Globe className="w-5 h-5 text-blue-500" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">Trading Session Performance</h3>
            <p className="text-sm text-muted-foreground">Performance by market session (UTC)</p>
          </div>
        </div>

        <div className="space-y-3">
          {distribution.sessionPerformance.map((session) => {
            const total = session.wins + session.losses;
            const winRate = total > 0 ? (session.wins / total) * 100 : 0;
            
            return (
              <div key={session.session} className="p-3 rounded-lg bg-secondary/30">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">{session.session}</span>
                  <span className={cn(
                    "font-mono text-sm font-semibold",
                    session.pnl >= 0 ? "text-success" : "text-destructive"
                  )}>
                    ${session.pnl.toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{session.wins}W / {session.losses}L</span>
                  <span className={cn(
                    "font-mono",
                    winRate >= 50 ? "text-success" : "text-destructive"
                  )}>
                    {winRate.toFixed(0)}% win rate
                  </span>
                </div>
                <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div 
                    className={cn("h-full rounded-full", winRate >= 50 ? "bg-success" : "bg-destructive")}
                    style={{ width: `${winRate}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
