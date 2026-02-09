import { cn } from "@/lib/utils";
import { ArrowUpRight, ArrowDownRight, Bell, Loader2 } from "lucide-react";
import { useProviderAwareTrades } from "@/hooks/useProviderAwareTrades";
import { formatDistanceToNow } from "date-fns";
import { Badge } from "@/components/ui/badge";
export const RecentSignals = () => {
  const {
    trades,
    isLoading
  } = useProviderAwareTrades({
    limit: 7,
    realtime: true
  });
  const formatTime = (dateString: string) => {
    return formatDistanceToNow(new Date(dateString), {
      addSuffix: true
    });
  };

  // Mark as new if created within last 5 minutes
  const isNew = (createdAt: string) => {
    const diff = Date.now() - new Date(createdAt).getTime();
    return diff < 5 * 60 * 1000;
  };
  return <div className="glass-card p-6 shadow-none h-full flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold">Recent Trades</h3>
          <p className="text-sm text-muted-foreground">Your latest trading activity</p>
        </div>
        <div className="relative">
          <Bell className="w-5 h-5 text-muted-foreground" />
          {trades.some(t => isNew(t.created_at)) && <span className="absolute -top-1 -right-1 w-2 h-2 bg-success rounded-full animate-pulse" />}
        </div>
      </div>

      {isLoading ? <div className="flex items-center justify-center py-8 flex-1">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div> : trades.length === 0 ? <div className="text-center py-8 text-muted-foreground flex-1">
          <p>No trades yet</p>
        </div> : <div className="space-y-3 flex-1">
          {trades.map(trade => {
        const signal = trade.signal;
        return <div key={trade.id} className={cn("flex items-center justify-between p-4 rounded-xl transition-all duration-200", isNew(trade.created_at) ? "bg-primary/10 border border-primary/20" : "bg-secondary/30 hover:bg-secondary/50")}>
                <div className="flex items-center gap-4">
                  <div className={cn("p-2 rounded-lg", signal?.direction === "BUY" ? "bg-success/20" : "bg-destructive/20")}>
                    {signal?.direction === "BUY" ? <ArrowUpRight className="w-4 h-4 text-success" /> : <ArrowDownRight className="w-4 h-4 text-destructive" />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold">{signal?.pair}</p>
                      {trade.result && trade.result !== 'pending' && <Badge variant="outline" className={cn("text-xs", trade.result === "win" ? "border-success/30 text-success bg-success/10" : "border-destructive/30 text-destructive bg-destructive/10")}>
                          {trade.result === "win" ? "Win" : "Loss"}
                        </Badge>}
                      {trade.result === 'pending' && <Badge variant="outline" className="text-xs border-primary/30 text-primary bg-primary/10">
                          Active
                        </Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatTime(trade.created_at)}
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  <span className={cn("text-xs font-medium px-2 py-1 rounded", signal?.direction === "BUY" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive")}>
                    {signal?.direction}
                  </span>
                  {trade.pnl !== null && trade.result !== 'pending' && <p className={cn("text-sm font-mono mt-1", trade.pnl >= 0 ? "text-success" : "text-destructive")}>
                      {trade.pnl >= 0 ? "+" : ""}${trade.pnl.toFixed(2)}
                    </p>}
                  {trade.result === 'pending' && <p className="text-sm font-mono mt-1 text-muted-foreground">
                      ${trade.risk_amount.toFixed(2)} risk
                    </p>}
                </div>
              </div>;
      })}
        </div>}
    </div>;
};