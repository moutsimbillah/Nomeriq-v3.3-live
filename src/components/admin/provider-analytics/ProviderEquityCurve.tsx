import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { LineChart, TrendingUp, TrendingDown } from "lucide-react";
import { EquityCurvePoint } from "@/hooks/useProviderTradeStats";

interface ProviderEquityCurveProps {
  data: EquityCurvePoint[];
  isLoading: boolean;
}

export const ProviderEquityCurve = ({ data, isLoading }: ProviderEquityCurveProps) => {
  if (isLoading) {
    return (
      <Card className="glass-card shadow-none">
        <CardHeader>
          <div className="flex items-center gap-2">
            <LineChart className="w-5 h-5 text-primary" />
            <CardTitle>Equity Curve</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[300px] w-full" />
        </CardContent>
      </Card>
    );
  }

  const latestBalance = data.length > 1 ? data[data.length - 1].balance : 10000;
  const startingBalance = 10000;
  const totalGrowth = ((latestBalance - startingBalance) / startingBalance) * 100;
  const isPositive = totalGrowth >= 0;

  return (
    <Card className="glass-card shadow-none">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <LineChart className="w-5 h-5 text-primary" />
            <CardTitle>Equity Curve</CardTitle>
          </div>
          <div className={`flex items-center gap-1 px-3 py-1 rounded-lg text-sm font-medium ${
            isPositive ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'
          }`}>
            {isPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
            {isPositive ? '+' : ''}{totalGrowth.toFixed(1)}%
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Simulated equity based on 2% risk per trade from $10,000 starting balance
        </p>
      </CardHeader>
      <CardContent>
        {data.length <= 1 ? (
          <div className="h-[300px] flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <LineChart className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No closed trades yet</p>
              <p className="text-xs mt-1">Equity curve will appear after trades are closed</p>
            </div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="providerEquityGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis 
                dataKey="date" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
              />
              <YAxis 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                tickFormatter={(value) => `$${value.toLocaleString()}`}
                domain={['dataMin - 500', 'dataMax + 500']}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="glass-card p-3 border border-border/50 shadow-none">
                        <p className="text-sm font-medium">{data.label}</p>
                        <p className="text-xs text-muted-foreground">{data.date}</p>
                        <div className="mt-2 space-y-1">
                          <p className="text-sm">
                            Balance: <span className="font-mono font-medium">${data.balance.toLocaleString()}</span>
                          </p>
                          <p className={`text-sm ${data.pnl >= 0 ? 'text-success' : 'text-destructive'}`}>
                            Trade P&L: <span className="font-mono">{data.pnl >= 0 ? '+' : ''}{data.pnl.toFixed(2)}</span>
                          </p>
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Area
                type="monotone"
                dataKey="balance"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                fill="url(#providerEquityGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
};
