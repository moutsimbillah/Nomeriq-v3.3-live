import { RevenueData } from "@/hooks/useAdminDashboardStats";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrendingUp, TrendingDown, DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";

interface Props {
  revenue: RevenueData;
  isLoading: boolean;
}

export const RevenueAnalytics = ({ revenue, isLoading }: Props) => {
  if (isLoading) {
    return (
      <Card className="glass-card shadow-none">
        <CardHeader>
          <div className="h-6 bg-muted rounded w-1/3 animate-pulse" />
        </CardHeader>
        <CardContent>
          <div className="h-[300px] bg-muted rounded animate-pulse" />
        </CardContent>
      </Card>
    );
  }

  const totalDailyRevenue = revenue.dailyRevenue.reduce((sum, d) => sum + d.amount, 0);
  const avgDailyRevenue = revenue.dailyRevenue.length > 0 
    ? totalDailyRevenue / revenue.dailyRevenue.filter(d => d.amount > 0).length || 0
    : 0;

  const isGrowthPositive = revenue.revenueGrowthPercent >= 0;

  return (
    <Card className="glass-card shadow-none">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-primary" />
            Revenue Analytics
          </CardTitle>
          <div className={cn(
            "flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium",
            isGrowthPositive ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"
          )}>
            {isGrowthPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
            {revenue.revenueGrowthPercent.toFixed(1)}% MoM
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="daily" className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="daily">Daily (30 days)</TabsTrigger>
            <TabsTrigger value="monthly">Monthly (12 months)</TabsTrigger>
          </TabsList>

          <TabsContent value="daily">
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="p-3 rounded-xl bg-secondary/30 text-center">
                <p className="text-xs text-muted-foreground">30-Day Total</p>
                <p className="text-lg font-bold font-mono">${totalDailyRevenue.toLocaleString()}</p>
              </div>
              <div className="p-3 rounded-xl bg-secondary/30 text-center">
                <p className="text-xs text-muted-foreground">Daily Average</p>
                <p className="text-lg font-bold font-mono">${avgDailyRevenue.toFixed(0)}</p>
              </div>
              <div className="p-3 rounded-xl bg-secondary/30 text-center">
                <p className="text-xs text-muted-foreground">Active Days</p>
                <p className="text-lg font-bold font-mono">
                  {revenue.dailyRevenue.filter(d => d.amount > 0).length}
                </p>
              </div>
            </div>

            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={revenue.dailyRevenue}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="date" 
                    tick={{ fontSize: 10 }}
                    tickFormatter={(value) => value.slice(5)}
                  />
                  <YAxis 
                    tick={{ fontSize: 10 }}
                    tickFormatter={(value) => `$${value}`}
                  />
                  <Tooltip 
                    formatter={(value: number) => [`$${value}`, 'Revenue']}
                    labelFormatter={(label) => `Date: ${label}`}
                    contentStyle={{
                      backgroundColor: 'hsl(var(--background))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                  />
                  <Bar 
                    dataKey="amount" 
                    fill="hsl(var(--primary))" 
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </TabsContent>

          <TabsContent value="monthly">
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={revenue.monthlyRevenue}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="month" 
                    tick={{ fontSize: 10 }}
                    tickFormatter={(value) => value.slice(5)}
                  />
                  <YAxis 
                    tick={{ fontSize: 10 }}
                    tickFormatter={(value) => `$${value}`}
                  />
                  <Tooltip 
                    formatter={(value: number) => [`$${value}`, 'Revenue']}
                    labelFormatter={(label) => `Month: ${label}`}
                    contentStyle={{
                      backgroundColor: 'hsl(var(--background))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                  />
                  <Line 
                    type="monotone"
                    dataKey="amount" 
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={{ fill: 'hsl(var(--primary))', strokeWidth: 2 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};
