import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, CreditCard } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { Subscription } from "@/types/database";

interface UserSubscriptionSectionProps {
  subscription: Subscription | null;
}

export const UserSubscriptionSection = ({ subscription }: UserSubscriptionSectionProps) => {
  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "border-success/30 text-success bg-success/10";
      case "pending":
        return "border-warning/30 text-warning bg-warning/10";
      case "expired":
      case "inactive":
        return "border-destructive/30 text-destructive bg-destructive/10";
      default:
        return "border-muted-foreground/30 text-muted-foreground bg-muted/10";
    }
  };

  const calculateDaysRemaining = () => {
    if (!subscription?.expires_at) return null;
    const expiresAt = new Date(subscription.expires_at);
    const now = new Date();
    const diffTime = expiresAt.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const daysRemaining = calculateDaysRemaining();

  return (
    <div className="glass-card p-6 shadow-none">
      <h3 className="font-semibold mb-4 flex items-center gap-2">
        <CreditCard className="w-4 h-4 text-primary" />
        Subscription Details
      </h3>
      <div className="space-y-3">
        <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30">
          <span className="text-sm text-muted-foreground">Status</span>
          <Badge 
            variant="outline" 
            className={cn("text-sm px-3 py-1", getStatusColor(subscription?.status || "inactive"))}
          >
            {(subscription?.status || "inactive").toUpperCase()}
          </Badge>
        </div>

        {subscription?.starts_at && (
          <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30">
            <span className="text-sm text-muted-foreground flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Started
            </span>
            <span className="text-sm font-medium">
              {format(new Date(subscription.starts_at), "MMM dd, yyyy")}
            </span>
          </div>
        )}

        {subscription?.expires_at && (
          <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30">
            <span className="text-sm text-muted-foreground flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Expires
            </span>
            <span className="text-sm font-medium">
              {format(new Date(subscription.expires_at), "MMM dd, yyyy")}
            </span>
          </div>
        )}

        {subscription?.status === "active" && daysRemaining !== null && (
          <div className={cn(
            "flex items-center justify-between p-3 rounded-lg",
            daysRemaining <= 7 ? "bg-warning/10 border border-warning/20" : "bg-success/10 border border-success/20"
          )}>
            <span className="text-sm text-muted-foreground">Days Remaining</span>
            <span className={cn(
              "text-sm font-bold",
              daysRemaining <= 7 ? "text-warning" : "text-success"
            )}>
              {daysRemaining} {daysRemaining === 1 ? "day" : "days"}
            </span>
          </div>
        )}

        {subscription?.status === "expired" && (
          <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
            <p className="text-xs text-destructive">
              This subscription has expired. The user needs to make a new payment to reactivate.
            </p>
          </div>
        )}

        {subscription?.status === "pending" && (
          <div className="p-3 rounded-lg bg-warning/10 border border-warning/20">
            <p className="text-xs text-warning">
              Awaiting payment verification. Check the payment history below.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
