import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface StatCardProps {
  title: ReactNode;
  value: string | number;
  change?: string;
  changeType?: "profit" | "loss" | "neutral";
  icon: LucideIcon;
  iconColor?: string;
}

export const StatCard = ({
  title,
  value,
  change,
  changeType = "neutral",
  icon: Icon,
  iconColor = "text-primary"
}: StatCardProps) => {
  return (
    <div className="glass-card-hover p-2.5 sm:p-4 lg:p-6 shadow-none">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] sm:text-xs lg:text-sm text-muted-foreground mb-0.5 truncate leading-tight">
            {title}
          </p>
          <p className="text-sm sm:text-xl lg:text-2xl font-semibold leading-tight">
            {value}
          </p>
          {change && (
            <p className={cn(
              "text-[10px] sm:text-xs mt-0.5 sm:mt-1 font-medium truncate leading-tight",
              changeType === "profit" && "text-success",
              changeType === "loss" && "text-destructive",
              changeType === "neutral" && "text-muted-foreground"
            )}>
              {change}
            </p>
          )}
        </div>
        <div className={cn(
          "p-1.5 sm:p-2 lg:p-3 rounded-md sm:rounded-lg flex-shrink-0",
          iconColor === "text-primary" && "bg-primary/10",
          iconColor === "text-success" && "bg-success/10",
          iconColor === "text-destructive" && "bg-destructive/10",
          iconColor === "text-warning" && "bg-warning/10"
        )}>
          <Icon className={cn("w-3.5 h-3.5 sm:w-5 sm:h-5 lg:w-6 lg:h-6", iconColor)} />
        </div>
      </div>
    </div>
  );
};
