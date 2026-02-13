import { useMemo } from "react";
import { useProviderAwareTrades } from "@/hooks/useProviderAwareTrades";
import { cn } from "@/lib/utils";
import { BarChart3, Loader2 } from "lucide-react";
import { calculateWinRatePercent } from "@/lib/kpi-math";

type BucketStats = {
  label: string;
  trades: number;
  wins: number;
  losses: number;
  breakevens: number;
  pnl: number;
};

const DAY_ORDER = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

const SESSION_LABELS = ["Sydney", "Tokyo", "London", "New York"];

const getSession = (date: Date): string => {
  const hour = date.getHours();
  if (hour >= 0 && hour < 6) return "Sydney";
  if (hour >= 6 && hour < 12) return "Tokyo";
  if (hour >= 12 && hour < 18) return "London";
  return "New York";
};

const getDayName = (date: Date): string => {
  const day = date.getDay();
  if (day === 0) return "Sunday";
  if (day === 1) return "Monday";
  if (day === 2) return "Tuesday";
  if (day === 3) return "Wednesday";
  if (day === 4) return "Thursday";
  if (day === 5) return "Friday";
  return "Saturday";
};

const buildBuckets = (labels: string[]): Record<string, BucketStats> =>
  labels.reduce((acc, label) => {
    acc[label] = { label, trades: 0, wins: 0, losses: 0, breakevens: 0, pnl: 0 };
    return acc;
  }, {} as Record<string, BucketStats>);

const formatPnL = (value: number) => `${value >= 0 ? "+" : ""}$${Math.abs(value).toFixed(2)}`;

const getWinRate = (item: BucketStats) => calculateWinRatePercent(item.wins, item.losses);

const sortByPerformanceDesc = (items: BucketStats[]) =>
  [...items].sort((a, b) => {
    const winRateDiff = getWinRate(b) - getWinRate(a);
    if (winRateDiff !== 0) return winRateDiff;

    const pnlDiff = b.pnl - a.pnl;
    if (pnlDiff !== 0) return pnlDiff;

    return b.trades - a.trades;
  });

const getColorToken = (index: number) => {
  const colors = [
    "bg-emerald-400",
    "bg-blue-400",
    "bg-amber-400",
    "bg-indigo-400",
    "bg-rose-400",
    "bg-cyan-400",
    "bg-violet-400",
  ];
  return colors[index % colors.length];
};

interface PerformanceBySessionDayProps {
  adminGlobalView?: boolean;
}

export const PerformanceBySessionDay = ({ adminGlobalView = false }: PerformanceBySessionDayProps) => {
  const { trades, isLoading } = useProviderAwareTrades({ fetchAll: true, realtime: true, adminGlobalView });

  const { dayStats, sessionStats } = useMemo(() => {
    const closedTrades = trades.filter(
      (t) => t.result === "win" || t.result === "loss" || t.result === "breakeven",
    );

    const dayBuckets = buildBuckets(DAY_ORDER);
    const sessionBuckets = buildBuckets(SESSION_LABELS);

    closedTrades.forEach((trade) => {
      const timestamp = new Date(trade.closed_at || trade.created_at);
      const day = getDayName(timestamp);
      const session = getSession(timestamp);
      const pnl = trade.pnl || 0;

      dayBuckets[day].trades += 1;
      dayBuckets[day].pnl += pnl;
      sessionBuckets[session].trades += 1;
      sessionBuckets[session].pnl += pnl;

      if (trade.result === "win") {
        dayBuckets[day].wins += 1;
        sessionBuckets[session].wins += 1;
      } else if (trade.result === "loss") {
        dayBuckets[day].losses += 1;
        sessionBuckets[session].losses += 1;
      } else {
        dayBuckets[day].breakevens += 1;
        sessionBuckets[session].breakevens += 1;
      }
    });

    return {
      dayStats: sortByPerformanceDesc(DAY_ORDER.map((d) => dayBuckets[d])),
      sessionStats: sortByPerformanceDesc(SESSION_LABELS.map((s) => sessionBuckets[s])),
    };
  }, [trades]);

  const renderGaugeCard = (item: BucketStats, index: number) => {
    const winRate = calculateWinRatePercent(item.wins, item.losses);
    const rateColor = winRate >= 50 ? "text-success" : "text-destructive";
    const dotColor = getColorToken(index);
    const barColorMap: Record<string, string> = {
      "bg-emerald-400": "from-emerald-400 to-emerald-500",
      "bg-blue-400": "from-blue-400 to-blue-500",
      "bg-amber-400": "from-amber-400 to-amber-500",
      "bg-indigo-400": "from-indigo-400 to-indigo-500",
      "bg-rose-400": "from-rose-400 to-rose-500",
      "bg-cyan-400": "from-cyan-400 to-cyan-500",
      "bg-violet-400": "from-violet-400 to-violet-500",
    };
    const barColor = barColorMap[dotColor] ?? "from-emerald-400 to-emerald-500";

    return (
      <div key={item.label} className="rounded-xl bg-secondary/30 border border-border/40 p-3">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className={cn("h-2.5 w-2.5 rounded-full shrink-0", dotColor)} />
            <p className="text-sm font-semibold truncate">{item.label}</p>
          </div>
          <div className="flex items-center gap-2 text-right">
            <span className={cn("text-sm font-bold font-mono", rateColor)}>{winRate.toFixed(0)}%</span>
            <span className={cn("text-sm font-bold font-mono", item.pnl >= 0 ? "text-success" : "text-destructive")}>
              {formatPnL(item.pnl)}
            </span>
          </div>
        </div>

        <div className="h-2 rounded-full bg-background/60 overflow-hidden mb-2">
          <div
            className={cn("h-full rounded-full bg-gradient-to-r transition-all duration-300", barColor)}
            style={{ width: `${Math.min(100, Math.max(0, winRate))}%` }}
          />
        </div>

        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">{item.trades} trades</span>
          <span className="font-mono text-muted-foreground">
            {item.wins}W / {item.losses}L / {item.breakevens}BE
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="glass-card p-6 shadow-none h-full flex flex-col bg-gradient-to-b from-background to-background/95">
      <div className="mb-5 flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-primary/15 border border-primary/20 grid place-items-center">
          <BarChart3 className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h3 className="text-lg font-semibold">Performance by Sessions & Days</h3>
          <p className="text-sm text-muted-foreground">Gauge view of win rate and P&L by bucket</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8 flex-1">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 flex-1 min-h-0">
          <div className="rounded-xl bg-secondary/20 border border-border/40 p-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">Days</p>
            <div className="space-y-2 max-h-[315px] overflow-auto pr-1">
              {dayStats.map((item, i) => renderGaugeCard(item, i))}
            </div>
          </div>

          <div className="rounded-xl bg-secondary/20 border border-border/40 p-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">Sessions</p>
            <div className="space-y-2">{sessionStats.map((item, i) => renderGaugeCard(item, i))}</div>
          </div>
        </div>
      )}
    </div>
  );
};
