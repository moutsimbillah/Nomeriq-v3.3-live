import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { Calendar, TrendingUp, TrendingDown, Activity, DollarSign, X } from "lucide-react";
import { Button } from "@/components/ui/button";
interface CalendarStats {
  tradingDays: number;
  totalTrades: number;
  profitableDays: number;
  losingDays: number;
  totalPnL: number;
  avgDailyPnL: number;
  bestDay: {
    date: string;
    pnl: number;
  } | null;
  worstDay: {
    date: string;
    pnl: number;
  } | null;
}
interface DayData {
  date: Date;
  trades: number;
  pnl: number;
  isCurrentMonth: boolean;
}
interface CalendarAnalyticsPanelProps {
  stats: CalendarStats;
  selectedDay: DayData | null;
  onClearSelection: () => void;
  onOpenDayModal: (date: Date) => void;
  isLoading: boolean;
}
export const CalendarAnalyticsPanel = ({
  stats,
  selectedDay,
  onClearSelection,
  onOpenDayModal,
  isLoading
}: CalendarAnalyticsPanelProps) => {
  const formatSignedCurrency = (value: number) =>
    `${value >= 0 ? "+" : "-"}$${Math.abs(value).toFixed(2)}`;

  if (isLoading) {
    return <div className="space-y-4 animate-pulse">
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-16 bg-muted rounded-lg" />)}
        </div>
        <div className="h-24 bg-muted rounded-lg" />
        <div className="h-24 bg-muted rounded-lg" />
      </div>;
  }
  return <div className="space-y-4">
      {/* Summary Cards - 2x2 grid */}
      <div className="grid grid-cols-2 gap-3">
        <div className="glass-card p-3 shadow-none">
          <p className="text-[10px] text-muted-foreground mb-1">Trading Days</p>
          <p className="text-xl font-bold">{stats.tradingDays}</p>
        </div>
        <div className="glass-card p-3 shadow-none">
          <p className="text-[10px] text-muted-foreground mb-1">Total Trades</p>
          <p className="text-xl font-bold">{stats.totalTrades}</p>
        </div>
        <div className="glass-card p-3 shadow-none">
          <p className="text-[10px] text-muted-foreground mb-1">Profitable</p>
          <p className="text-xl font-bold text-success">{stats.profitableDays}</p>
        </div>
        <div className="glass-card p-3 shadow-none">
          <p className="text-[10px] text-muted-foreground mb-1">Losing</p>
          <p className="text-xl font-bold text-destructive">{stats.losingDays}</p>
        </div>
      </div>

      {/* Total P/L */}
      <div className={cn("glass-card p-4 border-l-4 shadow-none", stats.totalPnL >= 0 ? "border-l-success" : "border-l-destructive")}>
        <p className="text-[10px] text-muted-foreground mb-1">TOTAL P/L</p>
        <p className={cn("text-2xl font-bold font-mono", stats.totalPnL >= 0 ? "text-success" : "text-destructive")}>
          {stats.totalPnL >= 0 ? "+" : ""}${stats.totalPnL.toFixed(2)}
        </p>
      </div>

      {/* Avg Daily P/L */}
      <div className={cn("glass-card p-4 border-l-4 shadow-none", stats.avgDailyPnL >= 0 ? "border-l-success" : "border-l-destructive")}>
        <p className="text-[10px] text-muted-foreground mb-1">AVG DAILY P/L</p>
        <p className={cn("text-2xl font-bold font-mono", stats.avgDailyPnL >= 0 ? "text-success" : "text-destructive")}>
          {stats.avgDailyPnL >= 0 ? "+" : ""}${stats.avgDailyPnL.toFixed(2)}
        </p>
      </div>

      {/* Best Day */}
      <div className={cn("glass-card p-4 shadow-none", stats.bestDay && "cursor-pointer hover:bg-secondary/30 transition-colors")} onClick={() => {
      if (stats.bestDay) {
        onOpenDayModal(parseISO(stats.bestDay.date));
      }
    }}>
        <div className="flex items-center gap-1.5 mb-2">
          <TrendingUp className="w-3.5 h-3.5 text-success" />
          <p className="text-[10px] text-muted-foreground">Best Day</p>
        </div>
        {stats.bestDay ? <>
            <p className={cn(
              "text-xl font-bold font-mono",
              stats.bestDay.pnl >= 0 ? "text-success" : "text-destructive"
            )}>
              {formatSignedCurrency(stats.bestDay.pnl)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {format(parseISO(stats.bestDay.date), "MMMM d, yyyy")}
            </p>
          </> : <>
            <p className="text-xl font-bold font-mono">$0.00</p>
            <p className="text-xs text-muted-foreground mt-1">—</p>
          </>}
      </div>

      {/* Worst Day */}
      <div className={cn("glass-card p-4 shadow-none", stats.worstDay && "cursor-pointer hover:bg-secondary/30 transition-colors")} onClick={() => {
      if (stats.worstDay) {
        onOpenDayModal(parseISO(stats.worstDay.date));
      }
    }}>
        <div className="flex items-center gap-1.5 mb-2">
          <TrendingDown className="w-3.5 h-3.5 text-destructive" />
          <p className="text-[10px] text-muted-foreground">Worst Day</p>
        </div>
        {stats.worstDay ? <>
            <p className={cn(
              "text-xl font-bold font-mono",
              stats.worstDay.pnl >= 0 ? "text-success" : "text-destructive"
            )}>
              {formatSignedCurrency(stats.worstDay.pnl)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {format(parseISO(stats.worstDay.date), "MMMM d, yyyy")}
            </p>
          </> : <>
            <p className="text-xl font-bold font-mono">$0.00</p>
            <p className="text-xs text-muted-foreground mt-1">—</p>
          </>}
      </div>

    </div>;
};
