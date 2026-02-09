import { useSignals } from "@/hooks/useSignals";
import { cn } from "@/lib/utils";
import { Clock, TrendingUp, TrendingDown, Target } from "lucide-react";
import { formatDistanceToNow, parseISO } from "date-fns";

export const AdminUpcomingSignals = () => {
  const { signals, isLoading } = useSignals({ signalType: "upcoming" });

  // Get upcoming signals (exclude preparing which might be internal)
  const upcomingSignals = signals
    .sort((a, b) => parseISO(b.created_at).getTime() - parseISO(a.created_at).getTime());

  if (isLoading) {
    return (
      <div className="glass-card p-6 animate-pulse">
        <div className="h-6 bg-muted rounded w-1/3 mb-4"></div>
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-20 bg-muted rounded"></div>
          ))}
        </div>
      </div>
    );
  }

  // Calculate R:R for display
  const calculateRR = (signal: typeof upcomingSignals[0]) => {
    const entry = signal.entry_price || 0;
    const sl = signal.stop_loss || 0;
    const tp = signal.take_profit || 0;
    
    if (signal.direction === "BUY" && entry - sl !== 0) {
      return Math.abs((tp - entry) / (entry - sl));
    } else if (signal.direction === "SELL" && sl - entry !== 0) {
      return Math.abs((entry - tp) / (sl - entry));
    }
    return 0;
  };

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case "near_entry":
        return { text: "Near Entry", class: "bg-warning/20 text-warning animate-pulse" };
      case "watching":
      case "waiting":
        return { text: "Watching", class: "bg-primary/20 text-primary" };
      case "preparing":
        return { text: "Preparing", class: "bg-secondary text-muted-foreground" };
      default:
        return { text: "Pending", class: "bg-secondary text-muted-foreground" };
    }
  };

  const isForexCategory = (category: string) => {
    return category.toLowerCase() === "forex";
  };

  return (
    <div className="glass-card p-6 shadow-none">
      <div className="flex items-center gap-2 mb-6">
        <div className="p-2 rounded-lg bg-warning/10">
          <Target className="w-5 h-5 text-warning" />
        </div>
        <h3 className="text-lg font-semibold">Upcoming Signals</h3>
        <span className="ml-auto text-sm text-muted-foreground">
          {upcomingSignals.length} pending
        </span>
      </div>

      {upcomingSignals.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <Target className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No upcoming signals at the moment</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {upcomingSignals.map((signal) => {
            const rr = calculateRR(signal);
            const statusBadge = getStatusBadge(signal.upcoming_status);
            const decimals = isForexCategory(signal.category) ? 5 : 2;
            
            return (
              <div
                key={signal.id}
                className="p-4 rounded-xl bg-secondary/30 border border-border/50 hover:border-warning/30 transition-colors"
              >
                {/* Header */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    {signal.direction === "BUY" ? (
                      <TrendingUp className="w-4 h-4 text-success" />
                    ) : (
                      <TrendingDown className="w-4 h-4 text-destructive" />
                    )}
                    <span className="font-bold">{signal.pair}</span>
                  </div>
                  <span className={cn(
                    "text-xs px-2 py-1 rounded-full font-semibold",
                    statusBadge.class
                  )}>
                    {statusBadge.text}
                  </span>
                </div>

                {/* Price Info */}
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <div className="text-center p-2 rounded-lg bg-primary/10">
                    <p className="text-[10px] text-muted-foreground uppercase">Entry</p>
                    <p className="text-xs font-mono font-semibold text-primary">
                      {signal.entry_price ?? '-'}
                    </p>
                  </div>
                  <div className="text-center p-2 rounded-lg bg-destructive/10">
                    <p className="text-[10px] text-muted-foreground uppercase">SL</p>
                    <p className="text-xs font-mono font-semibold text-destructive">
                      {signal.stop_loss ?? '-'}
                    </p>
                  </div>
                  <div className="text-center p-2 rounded-lg bg-success/10">
                    <p className="text-[10px] text-muted-foreground uppercase">TP</p>
                    <p className="text-xs font-mono font-semibold text-success">
                      {signal.take_profit ?? '-'}
                    </p>
                  </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "px-2 py-0.5 rounded-full font-medium",
                      signal.direction === "BUY" ? "bg-success/20 text-success" : "bg-destructive/20 text-destructive"
                    )}>
                      {signal.direction}
                    </span>
                    <span className="capitalize">{signal.category}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-primary font-semibold">R:R 1:{rr.toFixed(1)}</span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatDistanceToNow(parseISO(signal.created_at), { addSuffix: true })}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};