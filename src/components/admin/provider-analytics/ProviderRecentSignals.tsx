import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Clock, ArrowUpRight, ArrowDownRight, AlertCircle, CheckCircle2, XCircle, MinusCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Signal } from "@/types/database";
import { format, parseISO } from "date-fns";

interface ProviderRecentSignalsProps {
  signals: Signal[];
  isLoading: boolean;
}

export const ProviderRecentSignals = ({ signals, isLoading }: ProviderRecentSignalsProps) => {
  const recentSignals = signals.slice(0, 10);

  const getStatusIcon = (signal: Signal) => {
    if (signal.signal_type === 'upcoming') {
      return <Clock className="w-4 h-4" />;
    }
    switch (signal.status) {
      case 'active':
        return <AlertCircle className="w-4 h-4" />;
      case 'tp_hit':
        return <CheckCircle2 className="w-4 h-4" />;
      case 'sl_hit':
        return <XCircle className="w-4 h-4" />;
      case 'breakeven':
        return <MinusCircle className="w-4 h-4" />;
      default:
        return <Clock className="w-4 h-4" />;
    }
  };

  const getStatusColor = (signal: Signal) => {
    if (signal.signal_type === 'upcoming') {
      return 'border-warning/30 text-warning bg-warning/10';
    }
    switch (signal.status) {
      case 'active':
        return 'border-primary/30 text-primary bg-primary/10';
      case 'tp_hit':
        return 'border-success/30 text-success bg-success/10';
      case 'sl_hit':
        return 'border-destructive/30 text-destructive bg-destructive/10';
      case 'breakeven':
        return 'border-warning/30 text-warning bg-warning/10';
      default:
        return 'border-muted-foreground/30 text-muted-foreground';
    }
  };

  const getStatusLabel = (signal: Signal) => {
    if (signal.signal_type === 'upcoming') {
      switch (signal.upcoming_status) {
        case 'near_entry':
          return 'Near Entry';
        case 'preparing':
          return 'Preparing';
        default:
          return 'Upcoming';
      }
    }
    switch (signal.status) {
      case 'active':
        return 'Active';
      case 'tp_hit':
        return 'Win';
      case 'sl_hit':
        return 'Loss';
      case 'breakeven':
        return 'Breakeven';
      default:
        return signal.status;
    }
  };

  if (isLoading) {
    return (
      <Card className="glass-card shadow-none">
        <CardHeader>
          <CardTitle>Recent Signals</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[200px] w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass-card shadow-none">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Recent Signals</CardTitle>
          <Badge variant="outline" className="text-xs">
            {signals.length} total
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">Your latest trading signals</p>
      </CardHeader>
      <CardContent>
        {recentSignals.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Clock className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No signals yet</p>
            <p className="text-xs mt-1">Create your first signal to get started</p>
          </div>
        ) : (
          <div className="space-y-3">
            {recentSignals.map((signal) => (
              <div
                key={signal.id}
                className={cn(
                  "flex items-center justify-between p-3 rounded-lg bg-secondary/30 border border-border/50",
                  signal.status === 'active' && "border-l-4 border-l-primary"
                )}
              >
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "p-2 rounded-lg",
                    signal.direction === "BUY" ? "bg-success/10" : "bg-destructive/10"
                  )}>
                    {signal.direction === "BUY" ? (
                      <ArrowUpRight className="w-4 h-4 text-success" />
                    ) : (
                      <ArrowDownRight className="w-4 h-4 text-destructive" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">{signal.pair}</span>
                      <Badge variant="outline" className="text-[10px]">
                        {signal.category}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {format(parseISO(signal.created_at), 'MMM dd, HH:mm')}
                    </p>
                  </div>
                </div>
                <Badge variant="outline" className={cn("flex items-center gap-1", getStatusColor(signal))}>
                  {getStatusIcon(signal)}
                  {getStatusLabel(signal)}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
