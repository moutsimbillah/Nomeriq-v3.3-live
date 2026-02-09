import { useState } from "react";
import { ProviderStats } from "@/hooks/useGlobalTradeStats";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Users, TrendingUp, TrendingDown, ArrowUpDown, Trophy, Medal } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  providers: ProviderStats[];
  isLoading: boolean;
}

type SortKey = 'totalSignals' | 'winRate' | 'totalPnL' | 'avgRR' | 'consistencyScore';

export const ProviderPerformanceTable = ({ providers, isLoading }: Props) => {
  const [sortKey, setSortKey] = useState<SortKey>('totalPnL');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const sortedProviders = [...providers].sort((a, b) => {
    const aVal = a[sortKey];
    const bVal = b[sortKey];
    return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
  });

  if (isLoading) {
    return (
      <div className="glass-card p-6 animate-pulse">
        <div className="h-6 bg-muted rounded w-1/3 mb-4" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 bg-muted rounded" />
          ))}
        </div>
      </div>
    );
  }

  if (providers.length === 0) {
    return (
      <div className="glass-card p-6 shadow-none">
        <div className="flex items-center gap-2 mb-4">
          <div className="p-2 rounded-lg bg-primary/10">
            <Users className="w-5 h-5 text-primary" />
          </div>
          <h3 className="text-lg font-semibold">Signal Provider Performance</h3>
        </div>
        <p className="text-muted-foreground text-center py-8">No signal providers found</p>
      </div>
    );
  }

  const getRankIcon = (index: number) => {
    if (index === 0) return <Trophy className="w-5 h-5 text-warning" />;
    if (index === 1) return <Medal className="w-5 h-5 text-muted-foreground" />;
    if (index === 2) return <Medal className="w-5 h-5 text-primary" />;
    return <span className="w-5 h-5 text-center text-muted-foreground font-mono">{index + 1}</span>;
  };

  return (
    <div className="glass-card p-6 shadow-none overflow-hidden">
      <div className="flex items-center gap-2 mb-6">
        <div className="p-2 rounded-lg bg-primary/10">
          <Users className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h3 className="text-lg font-semibold">Signal Provider Performance</h3>
          <p className="text-sm text-muted-foreground">{providers.length} providers ranked by performance</p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">Rank</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => handleSort('totalSignals')}
                  className="h-auto p-0 font-medium"
                >
                  Signals <ArrowUpDown className="ml-1 w-3 h-3" />
                </Button>
              </TableHead>
              <TableHead>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => handleSort('winRate')}
                  className="h-auto p-0 font-medium"
                >
                  Win Rate <ArrowUpDown className="ml-1 w-3 h-3" />
                </Button>
              </TableHead>
              <TableHead>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => handleSort('avgRR')}
                  className="h-auto p-0 font-medium"
                >
                  Avg R:R <ArrowUpDown className="ml-1 w-3 h-3" />
                </Button>
              </TableHead>
              <TableHead>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => handleSort('totalPnL')}
                  className="h-auto p-0 font-medium"
                >
                  Total P&L <ArrowUpDown className="ml-1 w-3 h-3" />
                </Button>
              </TableHead>
              <TableHead>Avg P&L/Signal</TableHead>
              <TableHead>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => handleSort('consistencyScore')}
                  className="h-auto p-0 font-medium"
                >
                  Consistency <ArrowUpDown className="ml-1 w-3 h-3" />
                </Button>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedProviders.map((provider, index) => (
              <TableRow key={provider.userId}>
                <TableCell>
                  <div className="flex items-center justify-center">
                    {getRankIcon(index)}
                  </div>
                </TableCell>
                <TableCell>
                  <div>
                    <p className="font-medium">{provider.name}</p>
                    <p className="text-xs text-muted-foreground">{provider.email}</p>
                  </div>
                </TableCell>
                <TableCell className="font-mono">{provider.totalSignals}</TableCell>
                <TableCell>
                  <span className={cn(
                    "font-mono font-medium",
                    provider.winRate >= 50 ? "text-success" : "text-destructive"
                  )}>
                    {provider.winRate.toFixed(1)}%
                  </span>
                </TableCell>
                <TableCell className="font-mono">1:{provider.avgRR.toFixed(1)}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    {provider.totalPnL >= 0 ? (
                      <TrendingUp className="w-4 h-4 text-success" />
                    ) : (
                      <TrendingDown className="w-4 h-4 text-destructive" />
                    )}
                    <span className={cn(
                      "font-mono font-medium",
                      provider.totalPnL >= 0 ? "text-success" : "text-destructive"
                    )}>
                      ${provider.totalPnL.toFixed(2)}
                    </span>
                  </div>
                </TableCell>
                <TableCell className={cn(
                  "font-mono",
                  provider.avgPnLPerSignal >= 0 ? "text-success" : "text-destructive"
                )}>
                  ${provider.avgPnLPerSignal.toFixed(2)}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                      <div 
                        className={cn(
                          "h-full rounded-full",
                          provider.consistencyScore >= 70 ? "bg-success" : 
                          provider.consistencyScore >= 40 ? "bg-warning" : "bg-destructive"
                        )}
                        style={{ width: `${Math.min(provider.consistencyScore, 100)}%` }}
                      />
                    </div>
                    <span className="text-xs font-mono text-muted-foreground">
                      {provider.consistencyScore.toFixed(0)}
                    </span>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};
