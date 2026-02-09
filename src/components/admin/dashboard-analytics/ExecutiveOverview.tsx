import { ExecutiveStats } from "@/hooks/useAdminDashboardStats";
import { 
  Users, 
  UserCheck, 
  UserX, 
  UserPlus,
  DollarSign,
  TrendingUp,
  Wallet,
  Gift,
  Calculator
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  stats: ExecutiveStats;
  isLoading: boolean;
}

export const ExecutiveOverview = ({ stats, isLoading }: Props) => {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="glass-card p-4 animate-pulse">
            <div className="h-4 bg-muted rounded w-2/3 mb-2" />
            <div className="h-8 bg-muted rounded w-1/2" />
          </div>
        ))}
      </div>
    );
  }

  const cards = [
    {
      title: "Total Users",
      value: stats.totalUsers.toString(),
      subtitle: "All registered",
      icon: Users,
      iconColor: "text-primary",
      bgColor: "bg-primary/10",
    },
    {
      title: "Active Paying",
      value: stats.activePayingUsers.toString(),
      subtitle: `${stats.totalUsers > 0 ? ((stats.activePayingUsers / stats.totalUsers) * 100).toFixed(0) : 0}% of total`,
      icon: UserCheck,
      iconColor: "text-success",
      bgColor: "bg-success/10",
    },
    {
      title: "Inactive Users",
      value: stats.inactiveUsers.toString(),
      subtitle: "No subscription",
      icon: UserX,
      iconColor: "text-destructive",
      bgColor: "bg-destructive/10",
    },
    {
      title: "New Today",
      value: stats.newUsersToday.toString(),
      subtitle: `${stats.newUsersThisWeek} this week`,
      icon: UserPlus,
      iconColor: "text-blue-500",
      bgColor: "bg-blue-500/10",
    },
    {
      title: "New This Month",
      value: stats.newUsersThisMonth.toString(),
      subtitle: "Monthly signups",
      icon: UserPlus,
      iconColor: "text-primary",
      bgColor: "bg-primary/10",
    },
    {
      title: "Total Revenue",
      value: `$${stats.totalRevenue.toLocaleString()}`,
      subtitle: "All time",
      icon: DollarSign,
      iconColor: "text-success",
      bgColor: "bg-success/10",
    },
    {
      title: "Monthly Revenue",
      value: `$${stats.monthlyRevenue.toLocaleString()}`,
      subtitle: "This month",
      icon: TrendingUp,
      iconColor: stats.monthlyRevenue > 0 ? "text-success" : "text-muted-foreground",
      bgColor: stats.monthlyRevenue > 0 ? "bg-success/10" : "bg-muted/10",
    },
    {
      title: "Avg Revenue/User",
      value: `$${stats.averageRevenuePerUser.toFixed(2)}`,
      subtitle: "ARPU",
      icon: Calculator,
      iconColor: "text-primary",
      bgColor: "bg-primary/10",
    },
    {
      title: "Lifetime Value",
      value: `$${stats.lifetimeValue.toFixed(2)}`,
      subtitle: "LTV per paying user",
      icon: Wallet,
      iconColor: "text-blue-500",
      bgColor: "bg-blue-500/10",
    },
    {
      title: "Discounts Given",
      value: `$${stats.totalDiscountsGiven.toFixed(0)}`,
      subtitle: "Total discount value",
      icon: Gift,
      iconColor: "text-warning",
      bgColor: "bg-warning/10",
    },
    {
      title: "Net Revenue",
      value: `$${stats.netRevenueAfterDiscounts.toFixed(0)}`,
      subtitle: "After discounts",
      icon: DollarSign,
      iconColor: stats.netRevenueAfterDiscounts >= 0 ? "text-success" : "text-destructive",
      bgColor: stats.netRevenueAfterDiscounts >= 0 ? "bg-success/10" : "bg-destructive/10",
    },
    {
      title: "Conversion",
      value: `${stats.totalUsers > 0 ? ((stats.activePayingUsers / stats.totalUsers) * 100).toFixed(1) : 0}%`,
      subtitle: "Users → Paid",
      icon: TrendingUp,
      iconColor: "text-primary",
      bgColor: "bg-primary/10",
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
      {cards.map((card) => (
        <div
          key={card.title}
          className="glass-card p-4 shadow-none hover:shadow-md transition-shadow"
        >
          <div className="flex items-center gap-2 mb-2">
            <div className={cn("p-1.5 rounded-lg", card.bgColor)}>
              <card.icon className={cn("w-4 h-4", card.iconColor)} />
            </div>
            <span className="text-xs font-medium text-muted-foreground truncate">
              {card.title}
            </span>
          </div>
          <p className="text-xl font-bold font-mono">{card.value}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{card.subtitle}</p>
        </div>
      ))}
    </div>
  );
};
