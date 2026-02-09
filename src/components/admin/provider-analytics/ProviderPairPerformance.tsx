import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart3, TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { PairStats } from "@/hooks/useProviderTradeStats";

interface ProviderPairPerformanceProps {
  pairStats: PairStats[];
  isLoading: boolean;
}

export const ProviderPairPerformance = ({ pairStats, isLoading }: ProviderPairPerformanceProps) => {
  if (isLoading) {
    return (
      <Card className="glass-card shadow-none">
        <CardHeader>
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" />
            <CardTitle>Pair Performance</CardTitle>
          </div>
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
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-primary" />
          <CardTitle>Pair Performance</CardTitle>
        </div>
        <p className="text-xs text-muted-foreground">Your trading performance per instrument</p>
      </CardHeader>
      <CardContent>
        {pairStats.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <BarChart3 className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No pair data yet</p>
            <p className="text-xs mt-1">Stats will appear after you create signals</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border/50">
                  <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider py-3 px-2">Pair</th>
                  <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wider py-3 px-2">Trades</th>
                  <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wider py-3 px-2">Win Rate</th>
                  <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wider py-3 px-2">Avg R:R</th>
                  <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider py-3 px-2">P&L</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {pairStats.slice(0, 10).map((pair) => (
                  <tr key={pair.pair} className="hover:bg-accent/30 transition-colors">
                    <td className="py-3 px-2">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{pair.pair}</span>
                        <Badge variant="outline" className="text-[10px]">
                          {pair.category}
                        </Badge>
                      </div>
                    </td>
                    <td className="text-center py-3 px-2">
                      <span className="font-mono text-sm">{pair.tradesCount}</span>
                      <div className="text-[10px] text-muted-foreground">
                        {pair.wins}W / {pair.losses}L
                      </div>
                    </td>
                    <td className="text-center py-3 px-2">
                      <span className={cn(
                        "font-mono text-sm font-medium",
                        pair.winRate >= 50 ? "text-success" : "text-destructive"
                      )}>
                        {pair.winRate.toFixed(0)}%
                      </span>
                    </td>
                    <td className="text-center py-3 px-2">
                      <span className="font-mono text-sm">{pair.avgRR.toFixed(2)}</span>
                    </td>
                    <td className="text-right py-3 px-2">
                      <div className={cn(
                        "flex items-center justify-end gap-1 font-mono text-sm font-medium",
                        pair.totalPnL >= 0 ? "text-success" : "text-destructive"
                      )}>
                        {pair.totalPnL >= 0 ? (
                          <TrendingUp className="w-3 h-3" />
                        ) : (
                          <TrendingDown className="w-3 h-3" />
                        )}
                        {pair.totalPnL >= 0 ? '+' : ''}{pair.totalPnL.toFixed(2)}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
