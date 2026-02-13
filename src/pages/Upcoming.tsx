import { useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { cn } from "@/lib/utils";
import { ArrowUpRight, ArrowDownRight, Clock, AlertCircle, Loader2, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Signal } from "@/types/database";
import { DateRange } from "react-day-picker";
import { TradeFilters, SortOption, TimeFilter, DirectionFilter, CategoryFilter, filterByTime } from "@/components/filters/TradeFilters";
import { useProviderAwareSignals } from "@/hooks/useProviderAwareSignals";
import { SignalAnalysisModal } from "@/components/signals/SignalAnalysisModal";
import { useSignalAnalysisModal, hasAnalysisContent } from "@/hooks/useSignalAnalysisModal";
import { preloadSignalAnalysisMedia } from "@/lib/signalAnalysisMedia";

type UpcomingStatusFilter = 'all' | 'waiting' | 'preparing' | 'near_entry';

const Upcoming = () => {
  const { selectedSignal, isOpen, openAnalysis, handleOpenChange } = useSignalAnalysisModal();
  // Use provider-aware signals hook - fetch all signals, filter client-side for upcoming
  const {
    signals: allSignals,
    isLoading
  } = useProviderAwareSignals({
    signalType: 'all',  // Fetch all, filter client-side for upcoming
    realtime: true,
    limit: 100
  });

  // Filter states
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [directionFilter, setDirectionFilter] = useState<DirectionFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');

  const filteredTrades = useMemo(() => {
    // Filter for upcoming signals client-side (matching dashboard behavior)
    const filteredUpcoming = allSignals.filter(s =>
      (s.signal_type === 'upcoming' || s.status === 'upcoming' || s.upcoming_status) &&
      s.status !== 'closed' &&
      s.status !== 'cancelled'
    );

    let result = [...filteredUpcoming];
    result = filterByTime(result, timeFilter, dateRange);

    if (directionFilter !== 'all') {
      result = result.filter(t => t.direction === directionFilter);
    }

    if (categoryFilter !== 'all') {
      result = result.filter(t => t.category?.toLowerCase() === categoryFilter.toLowerCase());
    }

    const getPotential = (s: Signal) => {
      const entry = Number(s.entry_price ?? 0);
      const tp = Number(s.take_profit ?? 0);
      return Math.abs(tp - entry);
    };
    const getRisk = (s: Signal) => {
      const entry = Number(s.entry_price ?? 0);
      const sl = Number(s.stop_loss ?? 0);
      return Math.abs(entry - sl);
    };

    return [...result].sort((a, b) => {
      switch (sortBy) {
        case 'newest':
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case 'oldest':
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case 'pair-asc':
          return (a.pair || '').localeCompare(b.pair || '');
        case 'pair-desc':
          return (b.pair || '').localeCompare(a.pair || '');
        case 'pnl-high':
          return getPotential(b) - getPotential(a);
        case 'pnl-low':
          return getPotential(a) - getPotential(b);
        case 'risk-high':
          return getRisk(b) - getRisk(a);
        case 'risk-low':
          return getRisk(a) - getRisk(b);
        default:
          return 0;
      }
    });
  }, [allSignals, timeFilter, dateRange, directionFilter, categoryFilter, sortBy]);

  useEffect(() => {
    filteredTrades
      .filter((signal) => Boolean(signal.analysis_image_url))
      .forEach((signal) => {
        void preloadSignalAnalysisMedia(signal);
      });
  }, [filteredTrades]);

  const getStatusDisplay = (status: string | null) => {
    switch (status) {
      case 'near_entry':
        return 'Near Entry';
      case 'preparing':
        return 'Preparing';
      case 'waiting':
        return 'Waiting';
      default:
        return status || 'Waiting';
    }
  };
  return <DashboardLayout title="Upcoming Trades">
      {/* Status Legend */}
      <div className="flex flex-wrap items-center gap-3 sm:gap-4 mb-6">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-warning animate-pulse" />
          <span className="text-xs sm:text-sm text-muted-foreground">Near Entry</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-primary" />
          <span className="text-xs sm:text-sm text-muted-foreground">Preparing</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-muted-foreground" />
          <span className="text-xs sm:text-sm text-muted-foreground">Waiting</span>
        </div>
      </div>

      {/* Filters */}
      <TradeFilters sortBy={sortBy} onSortChange={setSortBy} timeFilter={timeFilter} onTimeFilterChange={setTimeFilter} dateRange={dateRange} onDateRangeChange={setDateRange} directionFilter={directionFilter} onDirectionFilterChange={setDirectionFilter} categoryFilter={categoryFilter} onCategoryFilterChange={setCategoryFilter} showResultFilter={false} />

      {/* Trades Grid */}
      {isLoading ? <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div> : filteredTrades.length === 0 ? <div className="glass-card p-8 text-center shadow-none mt-[24px]">
          <Clock className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No Upcoming Trades</h3>
          <p className="text-muted-foreground">
            We're not currently watching any setups. Check back soon!
          </p>
        </div> : <div className="grid gap-4 my-[24px]">
          {filteredTrades.map(trade => {
            const hasAnalysis = hasAnalysisContent(trade);
            return (
              <div 
                key={trade.id} 
                className={cn(
                  "glass-card-hover p-4 shadow-none relative",
                  trade.upcoming_status === "near_entry" && "border-l-4 border-l-warning",
                  hasAnalysis && "cursor-pointer hover:ring-2 hover:ring-primary/30"
                )}
                onClick={() => hasAnalysis && openAnalysis(trade)}
              >
                {/* Analysis indicator */}
                {hasAnalysis && (
                  <div className="absolute top-2 right-2 p-1 rounded-full bg-primary/20 z-10">
                    <FileText className="w-3 h-3 text-primary" />
                  </div>
                )}
              {/* Mobile Layout (< lg) */}
              <div className="block lg:hidden space-y-3">
                {/* Header Row */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className={cn("p-2 rounded-xl shrink-0", trade.direction === "BUY" ? "bg-success/20" : "bg-destructive/20")}>
                      {trade.direction === "BUY" ? <ArrowUpRight className="w-4 h-4 text-success" /> : <ArrowDownRight className="w-4 h-4 text-destructive" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-sm">{trade.pair}</h3>
                        <Badge variant="outline" className="text-xs">
                          {trade.category}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <div className={cn("px-3 py-1.5 rounded-lg text-xs font-medium shrink-0", trade.direction === "BUY" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive")}>
                    {trade.direction}
                  </div>
                </div>

                {/* Price Grid */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="py-2 px-3 rounded-lg bg-primary/10 text-center">
                    <p className="text-muted-foreground text-[10px] mb-0.5">Entry</p>
                    <p className="text-primary font-mono text-xs font-medium">{trade.entry_price || '—'}</p>
                  </div>
                  <div className="py-2 px-3 rounded-lg bg-destructive/10 text-center">
                    <p className="text-muted-foreground text-[10px] mb-0.5">SL</p>
                    <p className="text-destructive font-mono text-xs font-medium">{trade.stop_loss || '—'}</p>
                  </div>
                  <div className="py-2 px-3 rounded-lg bg-success/10 text-center">
                    <p className="text-muted-foreground text-[10px] mb-0.5">TP</p>
                    <p className="text-success font-mono text-xs font-medium">{trade.take_profit || '—'}</p>
                  </div>
                </div>

                {/* Status + Notes Row */}
                <div className="flex items-center justify-between gap-3">
                  <Badge variant="outline" className={cn("shrink-0", trade.upcoming_status === "near_entry" && "border-warning/30 text-warning bg-warning/10", trade.upcoming_status === "preparing" && "border-primary/30 text-primary bg-primary/10", (!trade.upcoming_status || trade.upcoming_status === "waiting") && "border-muted-foreground/30 text-muted-foreground bg-muted/50")}>
                    {trade.upcoming_status === "near_entry" && <AlertCircle className="w-3 h-3 mr-1 shrink-0" />}
                    {(!trade.upcoming_status || trade.upcoming_status === "waiting") && <Clock className="w-3 h-3 mr-1 shrink-0" />}
                    {getStatusDisplay(trade.upcoming_status)}
                  </Badge>
                  <p className="text-xs text-muted-foreground truncate">
                    {trade.notes || "—"}
                  </p>
                </div>
              </div>

              {/* Desktop Layout (lg+) */}
              <div className="hidden lg:grid lg:grid-cols-[auto_1fr_auto_auto_1fr] items-center gap-4">
                {/* Direction Icon */}
                <div className={cn("p-2.5 rounded-xl shrink-0", trade.direction === "BUY" ? "bg-success/20" : "bg-destructive/20")}>
                  {trade.direction === "BUY" ? <ArrowUpRight className="w-5 h-5 text-success" /> : <ArrowDownRight className="w-5 h-5 text-destructive" />}
                </div>

                {/* Pair Info */}
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold">{trade.pair}</h3>
                    <Badge variant="outline" className="text-xs shrink-0">
                      {trade.category}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {trade.entry_price && `Entry: ${trade.entry_price}`}
                    {trade.stop_loss && ` • SL: ${trade.stop_loss}`}
                    {trade.take_profit && ` • TP: ${trade.take_profit}`}
                  </p>
                </div>

                {/* Direction Badge */}
                <div className={cn("inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium w-20 shrink-0", trade.direction === "BUY" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive")}>
                  <ArrowUpRight className={cn("w-4 h-4 shrink-0", trade.direction === "SELL" && "hidden")} />
                  <ArrowDownRight className={cn("w-4 h-4 shrink-0", trade.direction === "BUY" && "hidden")} />
                  {trade.direction}
                </div>

                {/* Status Badge */}
                <Badge variant="outline" className={cn("w-28 justify-center shrink-0", trade.upcoming_status === "near_entry" && "border-warning/30 text-warning bg-warning/10", trade.upcoming_status === "preparing" && "border-primary/30 text-primary bg-primary/10", (!trade.upcoming_status || trade.upcoming_status === "waiting") && "border-muted-foreground/30 text-muted-foreground bg-muted/50")}>
                  {trade.upcoming_status === "near_entry" && <AlertCircle className="w-3 h-3 mr-1 shrink-0" />}
                  {(!trade.upcoming_status || trade.upcoming_status === "waiting") && <Clock className="w-3 h-3 mr-1 shrink-0" />}
                  {getStatusDisplay(trade.upcoming_status)}
                </Badge>

                {/* Notes */}
                <p className="text-sm text-muted-foreground truncate text-left">
                  {trade.notes || "—"}
                </p>
              </div>
            </div>
            );
          })}
        </div>}

      {/* Info Box */}
      <div className="mt-8 p-4 sm:p-6 glass-card shadow-lg">
        <div className="flex items-start gap-3 sm:gap-4">
          <div className="p-2 sm:p-3 rounded-xl bg-primary/10 shrink-0">
            <Clock className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
          </div>
          <div>
            <h4 className="font-semibold mb-2 text-sm sm:text-base">How Upcoming Trades Work</h4>
            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
              These are potential trade setups we're monitoring. When conditions
              are met, they'll become active signals with push notifications.
              <span className="text-warning font-medium">
                {" "}
                "Near Entry"
              </span>{" "}
              trades are close to triggering — keep an eye on notifications!
            </p>
          </div>
        </div>
      </div>

      {/* Analysis Modal */}
      <SignalAnalysisModal
        signal={selectedSignal}
        open={isOpen}
        onOpenChange={handleOpenChange}
      />
    </DashboardLayout>;
};
export default Upcoming;
