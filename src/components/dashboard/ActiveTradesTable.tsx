import { useState, useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";
import { ArrowUpRight, ArrowDownRight, Loader2, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useProviderAwareTrades } from "@/hooks/useProviderAwareTrades";
import { differenceInSeconds, differenceInMinutes, differenceInHours, differenceInDays } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import { useBrand } from "@/contexts/BrandContext";
import { DateRange } from "react-day-picker";
import { TradeFilters, SortOption, TimeFilter, DirectionFilter, CategoryFilter, filterByTime, sortTrades } from "@/components/filters/TradeFilters";
import { SignalAnalysisModal } from "@/components/signals/SignalAnalysisModal";
import { useSignalAnalysisModal, hasAnalysisContent } from "@/hooks/useSignalAnalysisModal";
import { Signal } from "@/types/database";

export const ActiveTradesTable = () => {
  const {
    trades,
    isLoading,
    isProvider,
  } = useProviderAwareTrades({
    result: 'pending',
    realtime: true,
  });
  const {
    profile
  } = useAuth();
  const {
    settings
  } = useBrand();
  const [, setTick] = useState(0);
  
  // Analysis modal state
  const { selectedSignal, isOpen, openAnalysis, handleOpenChange } = useSignalAnalysisModal();

  // Filter states
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [directionFilter, setDirectionFilter] = useState<DirectionFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');

  // Real-time clock update every second
  useEffect(() => {
    const interval = setInterval(() => {
      setTick(t => t + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Apply filters
  const filteredTrades = useMemo(() => {
    let result = [...trades];

    // Time filter
    result = filterByTime(result, timeFilter, dateRange);

    // Direction filter
    if (directionFilter !== 'all') {
      result = result.filter(t => t.signal?.direction === directionFilter);
    }

    // Category filter
    if (categoryFilter !== 'all') {
      result = result.filter(t => t.signal?.category?.toLowerCase() === categoryFilter.toLowerCase());
    }

    // Sort
    return sortTrades(result, sortBy);
  }, [trades, timeFilter, dateRange, directionFilter, categoryFilter, sortBy]);
  const riskPercent = isProvider ? (settings?.global_risk_percent || 2) : (profile?.custom_risk_percent || settings?.global_risk_percent || 2);
  const totalRisk = filteredTrades.reduce((sum, t) => sum + t.risk_amount, 0);

  // Calculate total potential profit
  const totalPotentialProfit = filteredTrades.reduce((sum, t) => {
    const signal = t.signal;
    const entry = signal?.entry_price || 0;
    const sl = signal?.stop_loss || 0;
    const tp = signal?.take_profit || 0;
    let rr = 0;
    if (signal?.direction === 'BUY' && entry - sl !== 0) {
      rr = Math.abs((tp - entry) / (entry - sl));
    } else if (signal?.direction === 'SELL' && sl - entry !== 0) {
      rr = Math.abs((entry - tp) / (sl - entry));
    }
    return sum + t.risk_amount * rr;
  }, 0);
  const unrealizedPnL = 0;
  const getSignalStatus = (status: string) => {
    switch (status) {
      case 'active':
        return 'Running';
      case 'tp_hit':
        return 'Near TP';
      case 'sl_hit':
        return 'Near SL';
      default:
        return status;
    }
  };
  const getTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = differenceInSeconds(now, date);
    const minutes = differenceInMinutes(now, date);
    const hours = differenceInHours(now, date);
    const days = differenceInDays(now, date);
    if (seconds < 60) {
      return `${seconds}s ago`;
    } else if (minutes < 60) {
      return `${minutes}m ago`;
    } else if (hours < 24) {
      return `${hours}h ago`;
    } else {
      return `${days}d ago`;
    }
  };
  const calculateRR = (signal: any) => {
    const entry = signal?.entry_price || 0;
    const sl = signal?.stop_loss || 0;
    const tp = signal?.take_profit || 0;
    let rr = 0;
    if (signal?.direction === 'BUY' && entry - sl !== 0) {
      rr = Math.abs((tp - entry) / (entry - sl));
    } else if (signal?.direction === 'SELL' && sl - entry !== 0) {
      rr = Math.abs((entry - tp) / (sl - entry));
    }
    return rr;
  };

  const handleTradeClick = (signal: Signal | undefined) => {
    if (signal && hasAnalysisContent(signal)) {
      openAnalysis(signal);
    }
  };

  return <div className="space-y-6">
      {/* Analysis Modal */}
      <SignalAnalysisModal
        signal={selectedSignal}
        open={isOpen}
        onOpenChange={handleOpenChange}
      />
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold">Active Trades</h2>
          <p className="text-sm text-muted-foreground">
            Currently open positions being tracked in real-time
          </p>
        </div>
        <TradeFilters sortBy={sortBy} onSortChange={setSortBy} timeFilter={timeFilter} onTimeFilterChange={setTimeFilter} dateRange={dateRange} onDateRangeChange={setDateRange} directionFilter={directionFilter} onDirectionFilterChange={setDirectionFilter} categoryFilter={categoryFilter} onCategoryFilterChange={setCategoryFilter} />
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        <div className="glass-card p-4 sm:p-6 shadow-none">
          <p className="text-xs sm:text-sm text-muted-foreground mb-1">Open Positions</p>
          <p className="text-xl sm:text-3xl font-bold">{isLoading ? "..." : trades.length}</p>
        </div>
        <div className="glass-card p-4 sm:p-6 shadow-none">
          <p className="text-xs sm:text-sm text-muted-foreground mb-1">Total Risk</p>
          <p className="text-xl sm:text-3xl font-bold text-red-700">
            {isLoading ? "..." : `$${totalRisk.toFixed(2)}`}
          </p>
        </div>
        <div className="glass-card p-4 sm:p-6 shadow-none">
          <p className="text-xs sm:text-sm text-muted-foreground mb-1">Potential Profit</p>
          <p className="text-xl sm:text-3xl font-bold text-success">
            {isLoading ? "..." : `+$${totalPotentialProfit.toFixed(2)}`}
          </p>
        </div>
        <div className="glass-card p-4 sm:p-6 shadow-none">
          <p className="text-xs sm:text-sm text-muted-foreground mb-1">Unrealized P&L</p>
          <p className={cn("text-xl sm:text-3xl font-bold text-secondary-foreground", unrealizedPnL >= 0 ? "text-success" : "text-destructive")}>
            {unrealizedPnL >= 0 ? "+" : ""}${unrealizedPnL.toFixed(2)}
          </p>
        </div>
        <div className="glass-card p-4 sm:p-6 shadow-none col-span-2 sm:col-span-1">
          <p className="text-xs sm:text-sm text-muted-foreground mb-1">Avg. Risk/Trade</p>
          <p className="text-xl sm:text-3xl font-bold text-red-700">{riskPercent}%</p>
        </div>
      </div>

      {/* Trades Grid */}
      {isLoading ? <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div> : filteredTrades.length === 0 ? <div className="glass-card p-12 text-center text-muted-foreground shadow-none">
          <p>No active trades</p>
          <p className="text-sm mt-2">{trades.length > 0 ? "Try adjusting your filters" : "New signals will appear here automatically"}</p>
        </div> : <div className="grid gap-4">
          {trades.map(trade => {
        const signal = trade.signal;
        const rr = calculateRR(signal);
        const potentialProfit = trade.risk_amount * rr;
        const hasAnalysis = hasAnalysisContent(signal as Signal | undefined);
        return <div 
                key={trade.id} 
                className={cn(
                  "glass-card-hover p-4 sm:p-5 shadow-none py-[11px] relative",
                  hasAnalysis && "cursor-pointer hover:ring-2 hover:ring-primary/30"
                )}
                onClick={() => handleTradeClick(signal as Signal | undefined)}
              >
                {/* Analysis indicator */}
                {hasAnalysis && (
                  <div className="absolute top-2 right-2 p-1 rounded-full bg-primary/20 z-10">
                    <FileText className="w-3 h-3 text-primary" />
                  </div>
                )}
                {/* Mobile Layout (< md) */}
                <div className="block lg:hidden space-y-4">
                  {/* Header Row: Direction + Pair + Status */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className={cn("p-2 rounded-xl shrink-0", signal?.direction === "BUY" ? "bg-success/20" : "bg-destructive/20")}>
                        {signal?.direction === "BUY" ? <ArrowUpRight className="w-4 h-4 text-success" /> : <ArrowDownRight className="w-4 h-4 text-destructive" />}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-sm">{signal?.pair}</h3>
                          <Badge variant="outline" className="text-xs">
                            {signal?.category}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">{getTimeAgo(trade.created_at)}</p>
                      </div>
                    </div>
                    <div className={cn("px-3 py-1.5 rounded-lg text-xs font-medium shrink-0", signal?.direction === "BUY" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive")}>
                      {signal?.direction}
                    </div>
                  </div>

                  {/* Price Grid */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="py-2 px-3 rounded-lg bg-primary/10 text-center">
                      <p className="text-muted-foreground text-[10px] mb-0.5">Entry</p>
                      <p className="text-primary font-mono text-xs font-medium">{signal?.entry_price}</p>
                    </div>
                    <div className="py-2 px-3 rounded-lg bg-destructive/10 text-center">
                      <p className="text-muted-foreground text-[10px] mb-0.5">SL</p>
                      <p className="text-destructive font-mono text-xs font-medium">{signal?.stop_loss}</p>
                    </div>
                    <div className="py-2 px-3 rounded-lg bg-success/10 text-center">
                      <p className="text-muted-foreground text-[10px] mb-0.5">TP</p>
                      <p className="text-success font-mono text-xs font-medium">{signal?.take_profit}</p>
                    </div>
                  </div>

                  {/* Stats Row */}
                  <div className="grid grid-cols-4 gap-2">
                    <div className="py-2 px-2 rounded-lg bg-primary/10 border border-primary/30 text-center">
                      <p className="text-muted-foreground text-[10px] mb-0.5">Status</p>
                      <p className="text-primary font-medium text-xs">{getSignalStatus(signal?.status || 'active')}</p>
                    </div>
                    <div className="py-2 px-2 rounded-lg bg-secondary text-center">
                      <p className="text-muted-foreground text-[10px] mb-0.5">R:R</p>
                      <p className="text-secondary-foreground font-mono text-xs font-medium">1:{rr.toFixed(1)}</p>
                    </div>
                    <div className="py-2 px-2 rounded-lg bg-muted/50 text-center">
                      <p className="text-muted-foreground text-[10px] mb-0.5">Risk</p>
                      <p className="text-primary font-mono text-xs font-bold">${trade.risk_amount.toFixed(0)}</p>
                    </div>
                    <div className="py-2 px-2 rounded-lg bg-success/10 text-center">
                      <p className="text-muted-foreground text-[10px] mb-0.5">Profit</p>
                      <p className="text-success font-mono text-xs font-bold">+${potentialProfit.toFixed(0)}</p>
                    </div>
                  </div>
                </div>

                {/* Desktop Layout (lg+) */}
                <div className="hidden lg:flex items-center justify-between gap-4">
                  {/* Direction Icon */}
                  <div className={cn("p-2.5 rounded-xl shrink-0", signal?.direction === "BUY" ? "bg-success/20" : "bg-destructive/20")}>
                    {signal?.direction === "BUY" ? <ArrowUpRight className="w-5 h-5 text-success" /> : <ArrowDownRight className="w-5 h-5 text-destructive" />}
                  </div>

                  {/* Pair Info */}
                  <div className="flex items-center gap-2 shrink-0">
                    <h3 className="font-bold">{signal?.pair}</h3>
                    <Badge variant="outline" className="text-xs">
                      {signal?.category}
                    </Badge>
                  </div>

                  {/* Direction Badge */}
                  <div className={cn("inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium w-20 shrink-0", signal?.direction === "BUY" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive")}>
                    {signal?.direction}
                  </div>

                  {/* Status */}
                  <div className="py-2 px-4 rounded-lg bg-primary/10 border border-primary/30 text-center shrink-0 min-w-[80px]">
                    <p className="text-muted-foreground mb-1 text-xs">Status</p>
                    <p className="text-primary font-medium text-sm">{getSignalStatus(signal?.status || 'active')}</p>
                  </div>

                  {/* Entry Price */}
                  <div className="py-2 px-4 rounded-lg bg-primary/10 text-center shrink-0 min-w-[80px]">
                    <p className="text-muted-foreground mb-1 text-xs">Entry</p>
                    <p className="text-primary font-mono text-sm font-medium">{signal?.entry_price}</p>
                  </div>

                  {/* Stop Loss */}
                  <div className="py-2 px-4 rounded-lg bg-destructive/10 text-center shrink-0 min-w-[80px]">
                    <p className="text-muted-foreground mb-1 text-xs">SL</p>
                    <p className="text-destructive font-mono text-sm font-medium">{signal?.stop_loss}</p>
                  </div>

                  {/* Take Profit */}
                  <div className="py-2 px-4 rounded-lg bg-success/10 text-center shrink-0 min-w-[80px]">
                    <p className="text-muted-foreground mb-1 text-xs">TP</p>
                    <p className="text-success font-mono text-sm font-medium">{signal?.take_profit}</p>
                  </div>

                  {/* Started Time */}
                  <div className="py-2 px-4 rounded-lg border border-border/50 text-center shrink-0 min-w-[80px]">
                    <p className="text-muted-foreground mb-1 text-xs">Started</p>
                    <p className="font-mono text-sm font-medium">{getTimeAgo(trade.created_at)}</p>
                  </div>

                  {/* R:R Ratio */}
                  <div className="py-2 px-4 rounded-lg bg-secondary text-center shrink-0 min-w-[70px]">
                    <p className="text-muted-foreground mb-1 text-xs">R:R</p>
                    <p className="text-secondary-foreground font-mono text-sm font-medium">1:{rr.toFixed(1)}</p>
                  </div>

                  {/* Risk Info */}
                  <div className="py-2 px-4 rounded-lg bg-muted/50 text-center shrink-0 min-w-[90px]">
                    <p className="text-muted-foreground mb-1 text-xs">Risk {riskPercent}%</p>
                    <p className="font-mono text-sm font-bold text-red-500">${trade.risk_amount.toFixed(2)}</p>
                  </div>

                  {/* Potential Profit */}
                  <div className="py-2 px-4 rounded-lg bg-success/10 text-center shrink-0 min-w-[120px]">
                    <p className="text-muted-foreground mb-1 text-xs">Potential Profit</p>
                    <p className="text-success font-mono text-sm font-bold">+${potentialProfit.toFixed(2)}</p>
                  </div>
                </div>
              </div>;
      })}
        </div>}
    </div>;
};