import { useSignalStats } from "@/hooks/useSignalStats";
import { useLivePrices } from "@/hooks/useLivePrices";
import { cn } from "@/lib/utils";
import { Signal, TrendingUp, TrendingDown, Clock } from "lucide-react";
import { formatDistanceToNow, parseISO } from "date-fns";

export const AdminActiveSignals = () => {
  const { signals, isLoading } = useSignalStats();

  // Get active signals
  const activeSignals = signals
    .filter(s => s.status === "active")
    .sort((a, b) => parseISO(b.created_at).getTime() - parseISO(a.created_at).getTime());
  const liveModePairs = activeSignals
    .filter((s) => s.market_mode === "live" && !!s.pair)
    .map((s) => s.pair);
  const livePrices = useLivePrices(liveModePairs);

  if (isLoading) {
    return (
      <div className="glass-card p-6 animate-pulse">
        <div className="h-6 bg-muted rounded w-1/3 mb-4"></div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-muted rounded"></div>
          ))}
        </div>
      </div>
    );
  }

  // Calculate R:R for display
  const calculateRR = (signal: typeof activeSignals[0]) => {
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

  const isForexCategory = (category: string) => {
    return category.toLowerCase() === "forex";
  };

  return (
    <div className="glass-card p-6 shadow-none">
      <div className="flex items-center gap-2 mb-6">
        <div className="p-2 rounded-lg bg-primary/10">
          <Signal className="w-5 h-5 text-primary" />
        </div>
        <h3 className="text-lg font-semibold">Active Signals</h3>
        <span className="ml-auto text-sm text-muted-foreground">
          {activeSignals.length} active
        </span>
      </div>

      {activeSignals.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <Signal className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No active signals at the moment</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {activeSignals.map((signal) => {
            const rr = calculateRR(signal);
            const decimals = isForexCategory(signal.category) ? 5 : 2;
            
            return (
              <div
                key={signal.id}
                className="p-4 rounded-xl bg-secondary/30 border border-border/50 hover:border-primary/30 transition-colors"
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
                    signal.direction === "BUY" 
                      ? "bg-success/20 text-success" 
                      : "bg-destructive/20 text-destructive"
                  )}>
                    {signal.direction}
                  </span>
                </div>

                {/* Price Info */}
                <div className={cn(
                  "grid gap-2 mb-3",
                  signal.market_mode === "live" ? "grid-cols-4" : "grid-cols-3"
                )}>
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
                  {signal.market_mode === "live" && (
                    <div className="text-center p-2 rounded-lg bg-secondary/60">
                      <p className="text-[10px] text-muted-foreground uppercase">Current</p>
                      <p className="text-xs font-mono font-semibold text-foreground">
                        {livePrices[signal.pair] != null
                          ? Number(livePrices[signal.pair]).toFixed(decimals)
                          : "--"}
                      </p>
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="capitalize bg-secondary/50 px-2 py-1 rounded">{signal.category}</span>
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
