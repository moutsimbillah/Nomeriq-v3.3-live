import { UserSegment } from "@/hooks/useAdminDashboardStats";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, UserCheck, UserX, Clock, AlertTriangle, Award } from "lucide-react";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";

interface Props {
  segments: UserSegment;
  totalUsers: number;
  isLoading: boolean;
}

export const UserSegmentation = ({ segments, totalUsers, isLoading }: Props) => {
  if (isLoading) {
    return (
      <Card className="glass-card shadow-none">
        <CardHeader>
          <div className="h-6 bg-muted rounded w-1/3 animate-pulse" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-24 bg-muted rounded animate-pulse" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const getPercentage = (value: number) => {
    return totalUsers > 0 ? (value / totalUsers) * 100 : 0;
  };

  const segmentCards = [
    {
      title: "Paying Users",
      value: segments.payingUsers,
      percentage: getPercentage(segments.payingUsers),
      icon: UserCheck,
      color: "text-success",
      bgColor: "bg-success/10",
      progressColor: "bg-success",
      description: "Active subscriptions",
    },
    {
      title: "Non-Paying Users",
      value: segments.nonPayingUsers,
      percentage: getPercentage(segments.nonPayingUsers),
      icon: UserX,
      color: "text-muted-foreground",
      bgColor: "bg-muted/10",
      progressColor: "bg-muted-foreground",
      description: "No active subscription",
    },
    {
      title: "Long-term Subscribers",
      value: segments.longTermSubscribers,
      percentage: getPercentage(segments.longTermSubscribers),
      icon: Award,
      color: "text-primary",
      bgColor: "bg-primary/10",
      progressColor: "bg-primary",
      description: "3+ months active",
    },
    {
      title: "Recently Churned",
      value: segments.recentlyChurned,
      percentage: getPercentage(segments.recentlyChurned),
      icon: Clock,
      color: "text-warning",
      bgColor: "bg-warning/10",
      progressColor: "bg-warning",
      description: "Left in last 30 days",
    },
    {
      title: "High-Risk Churn",
      value: segments.highRiskChurn,
      percentage: getPercentage(segments.highRiskChurn),
      icon: AlertTriangle,
      color: "text-destructive",
      bgColor: "bg-destructive/10",
      progressColor: "bg-destructive",
      description: "Expiring in 7 days",
    },
  ];

  return (
    <Card className="glass-card shadow-none">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            User Segmentation
          </CardTitle>
          <span className="text-sm text-muted-foreground">
            Total: {totalUsers} users
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          {segmentCards.map((segment) => (
            <div
              key={segment.title}
              className={cn(
                "p-4 rounded-xl border",
                segment.bgColor,
                segment.color.replace('text-', 'border-') + '/20'
              )}
            >
              <div className="flex items-center gap-2 mb-2">
                <segment.icon className={cn("w-4 h-4", segment.color)} />
                <span className="text-xs font-medium truncate">{segment.title}</span>
              </div>
              <p className={cn("text-2xl font-bold font-mono mb-1", segment.color)}>
                {segment.value}
              </p>
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{segment.description}</span>
                  <span className={segment.color}>{segment.percentage.toFixed(1)}%</span>
                </div>
                <div className="h-1.5 bg-background/50 rounded-full overflow-hidden">
                  <div 
                    className={cn("h-full rounded-full transition-all", segment.progressColor)}
                    style={{ width: `${Math.min(segment.percentage, 100)}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
