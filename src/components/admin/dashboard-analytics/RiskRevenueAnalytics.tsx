import { RiskRevenue } from "@/hooks/useAdminDashboardStats";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, Clock, DollarSign, Users, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";

interface Props {
  riskRevenue: RiskRevenue;
  isLoading: boolean;
}

export const RiskRevenueAnalytics = ({ riskRevenue, isLoading }: Props) => {
  if (isLoading) {
    return (
      <Card className="glass-card shadow-none">
        <CardHeader>
          <div className="h-6 bg-muted rounded w-1/3 animate-pulse" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-20 bg-muted rounded animate-pulse" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const totalAtRisk = riskRevenue.expiringNext30Days;
  const urgentRisk = riskRevenue.expiringNext7Days;
  const riskPercentage = totalAtRisk > 0 ? (urgentRisk / totalAtRisk) * 100 : 0;

  return (
    <Card className="glass-card shadow-none">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-warning" />
          Pending & Risk Revenue
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Pending Payments */}
          <div className="p-4 rounded-xl bg-warning/10 border border-warning/20">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-4 h-4 text-warning" />
              <span className="text-sm font-medium">Pending Payments</span>
            </div>
            <p className="text-2xl font-bold font-mono text-warning">
              ${riskRevenue.pendingPaymentsAmount.toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {riskRevenue.pendingPaymentUsers} users awaiting verification
            </p>
          </div>

          {/* Expiring Next 7 Days */}
          <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20">
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="w-4 h-4 text-destructive" />
              <span className="text-sm font-medium">Expiring (7 Days)</span>
            </div>
            <p className="text-2xl font-bold font-mono text-destructive">
              {riskRevenue.expiringNext7Days}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Subscriptions need renewal
            </p>
          </div>

          {/* Expiring Next 14 Days */}
          <div className="p-4 rounded-xl bg-orange-500/10 border border-orange-500/20">
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="w-4 h-4 text-orange-500" />
              <span className="text-sm font-medium">Expiring (14 Days)</span>
            </div>
            <p className="text-2xl font-bold font-mono text-orange-500">
              {riskRevenue.expiringNext14Days}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Monitor for renewal
            </p>
          </div>

          {/* Expiring Next 30 Days */}
          <div className="p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/20">
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="w-4 h-4 text-yellow-500" />
              <span className="text-sm font-medium">Expiring (30 Days)</span>
            </div>
            <p className="text-2xl font-bold font-mono text-yellow-500">
              {riskRevenue.expiringNext30Days}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Upcoming expirations
            </p>
          </div>

          {/* Revenue at Risk */}
          <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 sm:col-span-2">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-destructive" />
                <span className="text-sm font-medium">Revenue at Risk (30 Days)</span>
              </div>
              <span className="text-xs text-muted-foreground">
                {urgentRisk} urgent (7 days)
              </span>
            </div>
            <p className="text-3xl font-bold font-mono text-destructive mb-2">
              ${riskRevenue.revenueAtRisk.toLocaleString()}
            </p>
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Urgency Level</span>
                <span className={cn(
                  riskPercentage > 50 ? "text-destructive" : "text-warning"
                )}>
                  {riskPercentage.toFixed(0)}% in next 7 days
                </span>
              </div>
              <Progress value={riskPercentage} className="h-2" />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
