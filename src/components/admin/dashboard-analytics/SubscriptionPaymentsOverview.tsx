import { SubscriptionStats, PaymentStats } from "@/hooks/useAdminDashboardStats";
import { 
  CheckCircle2, 
  XCircle, 
  Clock, 
  AlertTriangle,
  CreditCard,
  Ban,
  Timer
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Props {
  subscriptions: SubscriptionStats;
  payments: PaymentStats;
  isLoading: boolean;
}

export const SubscriptionPaymentsOverview = ({ subscriptions, payments, isLoading }: Props) => {
  if (isLoading) {
    return (
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="glass-card p-6 animate-pulse">
          <div className="h-6 bg-muted rounded w-1/3 mb-4" />
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-12 bg-muted rounded" />
            ))}
          </div>
        </div>
        <div className="glass-card p-6 animate-pulse">
          <div className="h-6 bg-muted rounded w-1/3 mb-4" />
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-12 bg-muted rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const subscriptionItems = [
    {
      label: "Active Subscriptions",
      value: subscriptions.activeSubscriptions,
      icon: CheckCircle2,
      color: "text-success",
      bgColor: "bg-success/10",
    },
    {
      label: "Expired Subscriptions",
      value: subscriptions.expiredSubscriptions,
      icon: XCircle,
      color: "text-destructive",
      bgColor: "bg-destructive/10",
    },
    {
      label: "Inactive Subscriptions",
      value: subscriptions.inactiveSubscriptions,
      icon: Ban,
      color: "text-muted-foreground",
      bgColor: "bg-muted/10",
    },
    {
      label: "Pending Renewals",
      value: subscriptions.pendingRenewals,
      icon: Clock,
      color: "text-warning",
      bgColor: "bg-warning/10",
    },
    {
      label: "Grace Period Users",
      value: subscriptions.gracePeriodUsers,
      icon: AlertTriangle,
      color: "text-orange-500",
      bgColor: "bg-orange-500/10",
    },
  ];

  const paymentItems = [
    {
      label: "Successful Payments",
      value: payments.successfulPayments,
      amount: `$${payments.totalPaymentsAmount.toLocaleString()}`,
      icon: CheckCircle2,
      color: "text-success",
      bgColor: "bg-success/10",
    },
    {
      label: "Pending Payments",
      value: payments.pendingPayments,
      amount: `$${payments.pendingAmount.toLocaleString()}`,
      icon: Clock,
      color: "text-warning",
      bgColor: "bg-warning/10",
    },
    {
      label: "Rejected Payments",
      value: payments.rejectedPayments,
      amount: null,
      icon: XCircle,
      color: "text-destructive",
      bgColor: "bg-destructive/10",
    },
  ];

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      {/* Subscription KPIs */}
      <Card className="glass-card shadow-none">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Timer className="w-5 h-5 text-primary" />
            Subscription Status
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {subscriptionItems.map((item) => (
            <div
              key={item.label}
              className="flex items-center justify-between p-3 rounded-xl bg-secondary/30"
            >
              <div className="flex items-center gap-3">
                <div className={cn("p-2 rounded-lg", item.bgColor)}>
                  <item.icon className={cn("w-4 h-4", item.color)} />
                </div>
                <span className="text-sm font-medium">{item.label}</span>
              </div>
              <span className="text-lg font-bold font-mono">{item.value}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Payment KPIs */}
      <Card className="glass-card shadow-none">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-primary" />
            Payment Status
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {paymentItems.map((item) => (
            <div
              key={item.label}
              className="flex items-center justify-between p-3 rounded-xl bg-secondary/30"
            >
              <div className="flex items-center gap-3">
                <div className={cn("p-2 rounded-lg", item.bgColor)}>
                  <item.icon className={cn("w-4 h-4", item.color)} />
                </div>
                <div>
                  <span className="text-sm font-medium">{item.label}</span>
                  {item.amount && (
                    <p className="text-xs text-muted-foreground">{item.amount}</p>
                  )}
                </div>
              </div>
              <span className="text-lg font-bold font-mono">{item.value}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
};
