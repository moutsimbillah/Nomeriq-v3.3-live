import { useSignalStats } from "@/hooks/useSignalStats";
import { cn } from "@/lib/utils";
import { formatDistanceToNow, format } from "date-fns";
import { CheckCircle2, XCircle, MinusCircle, Clock, Signal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useMemo } from "react";

export const AdminSignalHistory = () => {
  const { signals, isLoading } = useSignalStats();

  // Get closed signals for history
  const closedSignals = useMemo(() => 
    signals
      .filter(s => s.status === "tp_hit" || s.status === "sl_hit" || s.status === "breakeven")
      .sort((a, b) => 
        new Date(b.closed_at || b.created_at).getTime() - 
        new Date(a.closed_at || a.created_at).getTime()
      )
      .slice(0, 10),
    [signals]
  );

  const calculateRR = (signal: typeof signals[0]) => {
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

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "tp_hit":
        return <CheckCircle2 className="w-4 h-4 text-success" />;
      case "sl_hit":
        return <XCircle className="w-4 h-4 text-destructive" />;
      case "breakeven":
        return <MinusCircle className="w-4 h-4 text-warning" />;
      default:
        return <Clock className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "tp_hit":
        return "TP Hit";
      case "sl_hit":
        return "SL Hit";
      case "breakeven":
        return "Breakeven";
      default:
        return status;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "tp_hit":
        return "border-success/30 text-success bg-success/10";
      case "sl_hit":
        return "border-destructive/30 text-destructive bg-destructive/10";
      case "breakeven":
        return "border-warning/30 text-warning bg-warning/10";
      default:
        return "border-muted/30 text-muted-foreground";
    }
  };

  if (isLoading) {
    return (
      <div className="glass-card p-6 animate-pulse">
        <div className="h-6 bg-muted rounded w-1/4 mb-6"></div>
        <div className="space-y-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-20 bg-muted rounded"></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card p-6 shadow-none">
      <div className="flex items-center gap-2 mb-6">
        <div className="p-2 rounded-lg bg-primary/10">
          <Signal className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h3 className="text-lg font-semibold">Signal History</h3>
          <p className="text-sm text-muted-foreground">Recent closed signals</p>
        </div>
      </div>

      {closedSignals.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <Signal className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>No closed signals yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {closedSignals.map((signal) => {
            const rr = calculateRR(signal);
            return (
              <div
                key={signal.id}
                className="p-4 rounded-xl bg-secondary/30 hover:bg-secondary/40 transition-colors"
              >
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "px-2 py-1 rounded text-xs font-medium",
                      signal.direction === "BUY" 
                        ? "bg-success/20 text-success" 
                        : "bg-destructive/20 text-destructive"
                    )}>
                      {signal.direction}
                    </div>
                    <div>
                      <p className="font-semibold">{signal.pair}</p>
                      <p className="text-xs text-muted-foreground capitalize">
                        {signal.category}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-4">
                    {/* Entry */}
                    <div className="text-center min-w-[60px]">
                      <p className="text-[10px] text-muted-foreground uppercase">Entry</p>
                      <p className="text-sm font-mono font-medium text-primary">
                        {signal.entry_price?.toFixed(2) || "-"}
                      </p>
                    </div>

                    {/* SL */}
                    <div className="text-center min-w-[60px]">
                      <p className="text-[10px] text-muted-foreground uppercase">SL</p>
                      <p className="text-sm font-mono font-medium text-destructive">
                        {signal.stop_loss?.toFixed(2) || "-"}
                      </p>
                    </div>

                    {/* TP */}
                    <div className="text-center min-w-[60px]">
                      <p className="text-[10px] text-muted-foreground uppercase">TP</p>
                      <p className="text-sm font-mono font-medium text-success">
                        {signal.take_profit?.toFixed(2) || "-"}
                      </p>
                    </div>

                    {/* R:R */}
                    <div className="text-center min-w-[60px]">
                      <p className="text-[10px] text-muted-foreground uppercase">R:R</p>
                      <p className="text-sm font-mono font-medium">
                        1:{rr.toFixed(1)}
                      </p>
                    </div>

                    {/* Status */}
                    <Badge
                      variant="outline"
                      className={cn("text-xs", getStatusColor(signal.status))}
                    >
                      {getStatusIcon(signal.status)}
                      <span className="ml-1">{getStatusLabel(signal.status)}</span>
                    </Badge>

                    {/* Time */}
                    <div className="text-right min-w-[80px]">
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(signal.closed_at || signal.created_at), { addSuffix: true })}
                      </p>
                    </div>
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
