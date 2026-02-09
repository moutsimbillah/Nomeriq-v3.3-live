import { UserGrowthData } from "@/hooks/useAdminDashboardStats";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, UserCheck, UserX, TrendingUp, TrendingDown, Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

interface Props {
  userGrowth: UserGrowthData;
  isLoading: boolean;
}

export const UserGrowthAnalytics = ({ userGrowth, isLoading }: Props) => {
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

  const pieData = [
    { name: 'Active', value: userGrowth.activeVsInactive.active, color: 'hsl(var(--success))' },
    { name: 'Inactive', value: userGrowth.activeVsInactive.inactive, color: 'hsl(var(--destructive))' },
  ];

  const totalSignups30Days = userGrowth.dailySignups.reduce((sum, d) => sum + d.count, 0);

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      {/* Signups Chart */}
      <Card className="glass-card shadow-none">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            User Signups
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="daily" className="w-full">
            <TabsList className="mb-4">
              <TabsTrigger value="daily">Daily</TabsTrigger>
              <TabsTrigger value="monthly">Monthly</TabsTrigger>
            </TabsList>

            <TabsContent value="daily">
              <div className="mb-4 p-3 rounded-xl bg-secondary/30 text-center">
                <p className="text-xs text-muted-foreground">30-Day Total Signups</p>
                <p className="text-2xl font-bold font-mono">{totalSignups30Days}</p>
              </div>
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={userGrowth.dailySignups}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis 
                      dataKey="date" 
                      tick={{ fontSize: 10 }}
                      tickFormatter={(value) => value.slice(5)}
                    />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip 
                      formatter={(value: number) => [value, 'Signups']}
                      labelFormatter={(label) => `Date: ${label}`}
                      contentStyle={{
                        backgroundColor: 'hsl(var(--background))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                      }}
                    />
                    <Area 
                      type="monotone"
                      dataKey="count" 
                      stroke="hsl(var(--primary))"
                      fill="hsl(var(--primary) / 0.2)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </TabsContent>

            <TabsContent value="monthly">
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={userGrowth.monthlySignups}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis 
                      dataKey="month" 
                      tick={{ fontSize: 10 }}
                      tickFormatter={(value) => value.slice(5)}
                    />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip 
                      formatter={(value: number) => [value, 'Signups']}
                      labelFormatter={(label) => `Month: ${label}`}
                      contentStyle={{
                        backgroundColor: 'hsl(var(--background))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                      }}
                    />
                    <Area 
                      type="monotone"
                      dataKey="count" 
                      stroke="hsl(var(--primary))"
                      fill="hsl(var(--primary) / 0.2)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Rates & Pie Chart */}
      <Card className="glass-card shadow-none">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" />
            User Metrics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="p-3 rounded-xl bg-success/10 text-center">
              <p className="text-xs text-muted-foreground">Activation</p>
              <p className="text-lg font-bold text-success">{userGrowth.activationRate.toFixed(1)}%</p>
            </div>
            <div className="p-3 rounded-xl bg-primary/10 text-center">
              <p className="text-xs text-muted-foreground">Retention</p>
              <p className="text-lg font-bold text-primary">{userGrowth.retentionRate.toFixed(1)}%</p>
            </div>
            <div className="p-3 rounded-xl bg-destructive/10 text-center">
              <p className="text-xs text-muted-foreground">Churn</p>
              <p className="text-lg font-bold text-destructive">{userGrowth.churnRate.toFixed(1)}%</p>
            </div>
          </div>

          <div className="flex items-center justify-center gap-6">
            <div className="h-[180px] w-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(value: number) => [value, 'Users']}
                    contentStyle={{
                      backgroundColor: 'hsl(var(--background))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-success" />
                <span className="text-sm">Active: {userGrowth.activeVsInactive.active}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-destructive" />
                <span className="text-sm">Inactive: {userGrowth.activeVsInactive.inactive}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
