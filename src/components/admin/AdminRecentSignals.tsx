import { useSignalStats } from "@/hooks/useSignalStats";
import { cn } from "@/lib/utils";
import { Clock, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { formatDistanceToNow, parseISO } from "date-fns";

export const AdminRecentSignals = () => {
  const { signals, isLoading } = useSignalStats();

  // Get recent closed signals (last 7)
  const recentSignals = signals
    .filter(s => s.status === "tp_hit" || s.status === "sl_hit" || s.status === "breakeven")
    .sort((a, b) => parseISO(b.closed_at || b.created_at).getTime() - parseISO(a.closed_at || a.created_at).getTime())
    .slice(0, 7);

  if (isLoading) {
    return (
      <div className="glass-card p-6 h-full animate-pulse">
        <div className="h-6 bg-muted rounded w-1/2 mb-4"></div>
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-16 bg-muted rounded"></div>
          ))}
        </div>
      </div>
    );
  }

  const getResultIcon = (status: string) => {
    if (status === "tp_hit") return <TrendingUp className="w-4 h-4 text-success" />;
    if (status === "sl_hit") return <TrendingDown className="w-4 h-4 text-destructive" />;
    return <Minus className="w-4 h-4 text-warning" />;
  };

  const getResultBadge = (status: string) => {
    if (status === "tp_hit") return { text: "TP Hit", class: "bg-success/20 text-success" };
    if (status === "sl_hit") return { text: "SL Hit", class: "bg-destructive/20 text-destructive" };
    return { text: "Breakeven", class: "bg-warning/20 text-warning" };
  };

  // Calculate R:R for display
  const calculateRR = (signal: typeof recentSignals[0]) => {
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

  return (
    <div className="glass-card p-6 h-full shadow-none flex flex-col">
      <div className="flex items-center gap-2 mb-4">
        <div className="p-2 rounded-lg bg-primary/10">
          <Clock className="w-5 h-5 text-primary" />
        </div>
        <h3 className="text-lg font-semibold">Recent Signals</h3>
      </div>

      {recentSignals.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <p className="text-sm">No closed signals yet</p>
        </div>
      ) : (
        <div className="space-y-2 flex-1 overflow-y-auto">
          {recentSignals.map((signal) => {
            const badge = getResultBadge(signal.status);
            const rr = calculateRR(signal);
            
            return (
              <div
                key={signal.id}
                className="p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {getResultIcon(signal.status)}
                    <span className="font-semibold text-sm">{signal.pair}</span>
                    <span className={cn(
                      "text-xs px-2 py-0.5 rounded-full font-medium",
                      signal.direction === "BUY" ? "bg-success/20 text-success" : "bg-destructive/20 text-destructive"
                    )}>
                      {signal.direction}
                    </span>
                  </div>
                  <span className={cn(
                    "text-xs px-2 py-0.5 rounded-full font-medium",
                    badge.class
                  )}>
                    {badge.text}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="capitalize">{signal.category}</span>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-primary">1:{rr.toFixed(1)}</span>
                    <span>{formatDistanceToNow(parseISO(signal.closed_at || signal.created_at), { addSuffix: true })}</span>
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