import { useState, useEffect, useRef, useMemo } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { cn } from "@/lib/utils";
import { Loader2, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useProviderAwareTrades } from "@/hooks/useProviderAwareTrades";
import { differenceInSeconds, differenceInMinutes, differenceInHours, differenceInDays } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import { useBrand } from "@/contexts/BrandContext";
import { DateRange } from "react-day-picker";
import { TradeFilters, SortOption, TimeFilter, DirectionFilter, CategoryFilter, filterByTime, sortTrades } from "@/components/filters/TradeFilters";
import { SignalAnalysisModal } from "@/components/signals/SignalAnalysisModal";
import { useSignalAnalysisModal, hasAnalysisContent } from "@/hooks/useSignalAnalysisModal";
import { Signal, UserTrade } from "@/types/database";
import { useSignalTakeProfitUpdates } from "@/hooks/useSignalTakeProfitUpdates";
import { TradeUpdatesDialog } from "@/components/signals/TradeUpdatesDialog";
import { Button } from "@/components/ui/button";
import { playNotificationSound } from "@/lib/notificationSound";
import { preloadSignalAnalysisMedia } from "@/lib/signalAnalysisMedia";
import { useLivePrices } from "@/hooks/useLivePrices";
import { computeLiveTradePnL } from "@/lib/admin-metrics";

const ActiveTrades = () => {
  const { selectedSignal, isOpen, openAnalysis, handleOpenChange } = useSignalAnalysisModal();
  const {
    trades,
    isLoading,
    isProvider,
  } = useProviderAwareTrades({
    result: 'pending',
    realtime: true,
  });
  const { user } = useAuth();
  const {
    settings
  } = useBrand();
  const [, setTick] = useState(0);

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

  const filteredTrades = useMemo(() => {
    let result = [...trades];

    // Keep Active Trades aligned with Live Trades: only currently live signals
    result = result.filter((t) => t.signal?.status === 'active' && (t.signal?.signal_type || 'signal') === 'signal');

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
  const displayTrades = useMemo(() => {
    if (!isProvider) return filteredTrades;

    const groupedBySignal = new Map<string, UserTrade[]>();
    filteredTrades.forEach((trade) => {
      const signalId = trade.signal?.id;
      if (!signalId) return;
      const existing = groupedBySignal.get(signalId) ?? [];
      existing.push(trade);
      groupedBySignal.set(signalId, existing);
    });

    return Array.from(groupedBySignal.values()).map((tradesForSignal) => {
      if (user?.id) {
        const ownTrade = tradesForSignal.find((t) => t.user_id === user.id);
        if (ownTrade) return ownTrade;
      }
      return tradesForSignal[0];
    });
  }, [filteredTrades, isProvider, user?.id]);

  useEffect(() => {
    const signalsToPreload = displayTrades
      .map((trade) => trade.signal as Signal | null | undefined)
      .filter((signal): signal is Signal => Boolean(signal?.analysis_image_url));

    signalsToPreload.forEach((signal) => {
      void preloadSignalAnalysisMedia(signal);
    });
  }, [displayTrades]);

  const signalIds = Array.from(new Set(displayTrades.map((t) => t.signal?.id).filter((id): id is string => !!id)));
  const { updatesBySignal } = useSignalTakeProfitUpdates({ signalIds, realtime: true });

  const liveModePairs = useMemo(
    () => displayTrades
      .filter((t) => (t.signal as Signal & { market_mode?: string })?.market_mode === "live" && t.signal?.pair)
      .map((t) => t.signal!.pair),
    [displayTrades]
  );
  const livePrices = useLivePrices(liveModePairs);
  const unrealizedPnL = useMemo(() => {
    return displayTrades.reduce((sum, trade) => {
      const signal = trade.signal as (Signal & { market_mode?: string }) | undefined;
      if (signal?.market_mode !== "live" || !signal?.pair) return sum;
      const price = livePrices[signal.pair];
      if (price == null) return sum;
      return sum + computeLiveTradePnL(trade, price);
    }, 0);
  }, [displayTrades, livePrices]);
  const [seenUpdateCounts, setSeenUpdateCounts] = useState<Record<string, number>>({});
  const seenStorageKey = useMemo(
    () => (user?.id ? `trade-updates-seen:${user.id}` : null),
    [user?.id]
  );
  const previousUpdateIdsRef = useRef<Set<string>>(new Set());
  const [initialUpdatesLoaded, setInitialUpdatesLoaded] = useState(false);

  useEffect(() => {
    if (!seenStorageKey) return;
    try {
      const raw = localStorage.getItem(seenStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, number>;
      if (parsed && typeof parsed === "object") {
        setSeenUpdateCounts(parsed);
      }
    } catch {
      // no-op
    }
  }, [seenStorageKey]);

  useEffect(() => {
    if (!seenStorageKey) return;
    try {
      localStorage.setItem(seenStorageKey, JSON.stringify(seenUpdateCounts));
    } catch {
      // no-op
    }
  }, [seenUpdateCounts, seenStorageKey]);

  const unseenCountBySignal = useMemo(() => {
    const result: Record<string, number> = {};
    for (const [signalId, list] of Object.entries(updatesBySignal)) {
      const seen = seenUpdateCounts[signalId] ?? 0;
      result[signalId] = Math.max(0, list.length - seen);
    }
    return result;
  }, [updatesBySignal, seenUpdateCounts]);

  const markSignalUpdatesSeen = (signalId?: string) => {
    if (!signalId) return;
    const total = updatesBySignal[signalId]?.length || 0;
    setSeenUpdateCounts((prev) => {
      if ((prev[signalId] ?? 0) >= total) return prev;
      return { ...prev, [signalId]: total };
    });
  };

  useEffect(() => {
    if (isProvider) return;

    const currentIds = new Set<string>();
    Object.values(updatesBySignal).forEach((list) => {
      list.forEach((u) => currentIds.add(u.id));
    });

    if (!initialUpdatesLoaded) {
      previousUpdateIdsRef.current = currentIds;
      setInitialUpdatesLoaded(true);
      return;
    }

    const hasNew = Array.from(currentIds).some((id) => !previousUpdateIdsRef.current.has(id));
    if (hasNew) {
      void playNotificationSound();
    }

    previousUpdateIdsRef.current = currentIds;
  }, [updatesBySignal, initialUpdatesLoaded, isProvider]);
  const getOpenRisk = (trade: UserTrade) => Math.max(0, Number(trade.remaining_risk_amount ?? trade.risk_amount ?? 0));
  const getTradeRiskPercent = (trade: UserTrade) => Number(trade.risk_percent ?? settings?.global_risk_percent ?? 2);
  const getTargetTpFromUpdates = (trade: UserTrade) => {
    const signal = trade.signal;
    const updates = updatesBySignal[signal?.id || ""] || [];
    if (updates.length === 0) return signal?.take_profit || 0;

    const tpPrices = updates
      .map((u) => Number(u.tp_price))
      .filter((n) => Number.isFinite(n));

    if (tpPrices.length === 0) return signal?.take_profit || 0;
    return signal?.direction === "SELL"
      ? Math.min(...tpPrices)
      : Math.max(...tpPrices);
  };
  const calculateTradeRr = (trade: UserTrade) => {
    const signal = trade.signal;
    const entry = signal?.entry_price || 0;
    const sl = signal?.stop_loss || 0;
    const targetTp = getTargetTpFromUpdates(trade);
    let rr = 0;
    if (signal?.direction === "BUY" && entry - sl !== 0) {
      rr = Math.abs((targetTp - entry) / (entry - sl));
    } else if (signal?.direction === "SELL" && sl - entry !== 0) {
      rr = Math.abs((entry - targetTp) / (sl - entry));
    }
    return rr;
  };
  const calculateTradePotentialProfit = (trade: UserTrade) => {
    return getOpenRisk(trade) * calculateTradeRr(trade);
  };
  const totalRisk = displayTrades.reduce((sum, t) => sum + getOpenRisk(t), 0);
  const averageLiveRiskPercent = displayTrades.length
    ? displayTrades.reduce((sum, t) => sum + getTradeRiskPercent(t), 0) / displayTrades.length
    : 0;

  // Calculate total potential profit
  const totalPotentialProfit = displayTrades.reduce((sum, t) => sum + calculateTradePotentialProfit(t), 0);
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
  return <DashboardLayout
    title="Active Trades"
    subtitle="Monitor all your currently running trades in real-time with live risk and profit tracking."
  >
    {/* Summary Cards */}
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4 mb-6">
      <div className="glass-card p-4 sm:p-6 shadow-none">
        <p className="text-xs sm:text-base text-muted-foreground mb-1">Open Positions</p>
        <p className="text-xl sm:text-3xl font-bold">{isLoading ? "..." : displayTrades.length}</p>
      </div>
      <div className="glass-card p-4 sm:p-6 shadow-none">
        <p className="text-xs sm:text-base text-muted-foreground mb-1">Total Risk</p>
        <p className="text-xl sm:text-3xl font-bold">
          {isLoading ? "..." : `$${totalRisk.toFixed(2)}`}
        </p>
      </div>
      <div className="glass-card p-4 sm:p-6 shadow-none">
        <p className="text-xs sm:text-base text-muted-foreground mb-1">Potential Profit</p>
        <p className="text-xl sm:text-3xl font-bold text-success">
          {isLoading ? "..." : `+$${totalPotentialProfit.toFixed(2)}`}
        </p>
      </div>
      <div className="glass-card p-4 sm:p-6 shadow-none">
        <p className="text-xs sm:text-base text-muted-foreground mb-1">Unrealized P&L</p>
        <p className={cn("text-xl sm:text-3xl font-bold", unrealizedPnL >= 0 ? "text-success" : "text-destructive")}>
          {unrealizedPnL >= 0 ? "+" : ""}${unrealizedPnL.toFixed(2)}
        </p>
      </div>
      <div className="glass-card p-4 sm:p-6 shadow-none col-span-2 sm:col-span-1">
        <p className="text-xs sm:text-base text-muted-foreground mb-1">Avg. Risk/Trade</p>
        <p className="text-xl sm:text-3xl font-bold">{averageLiveRiskPercent.toFixed(2)}%</p>
      </div>
    </div>

    {/* Filters */}
    <TradeFilters sortBy={sortBy} onSortChange={setSortBy} timeFilter={timeFilter} onTimeFilterChange={setTimeFilter} dateRange={dateRange} onDateRangeChange={setDateRange} directionFilter={directionFilter} onDirectionFilterChange={setDirectionFilter} categoryFilter={categoryFilter} onCategoryFilterChange={setCategoryFilter} />

    {/* Trades Grid */}
    {isLoading ? <div className="flex items-center justify-center py-12">
      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
    </div> : displayTrades.length === 0 ? <div className="glass-card p-12 text-center text-muted-foreground shadow-none">
      <p>No active trades</p>
      <p className="text-sm mt-2">New signals will appear here automatically</p>
    </div> : <div className="grid gap-4 my-[24px]">
      {displayTrades.map(trade => {
        const signal = trade.signal as (Signal & { market_mode?: string }) | undefined;
        const isLiveMode = signal?.market_mode === "live";
        const currentPrice = signal?.pair ? livePrices[signal.pair] : undefined;
        const tradeLivePnL = isLiveMode && currentPrice != null ? computeLiveTradePnL(trade, currentPrice) : null;
        const potentialProfit = calculateTradePotentialProfit(trade);
        const liveRiskPercent = getTradeRiskPercent(trade);
        const hasAnalysis = hasAnalysisContent(signal as Signal);
        const tradeUpdates = updatesBySignal[signal?.id || ""] || [];
        const unseenCount = signal?.id ? (unseenCountBySignal[signal.id] ?? 0) : 0;
        const hasUnseenUpdates = unseenCount > 0;
        const livePnlLabel = tradeLivePnL === null
          ? "--"
          : `${tradeLivePnL >= 0 ? "+" : ""}$${tradeLivePnL.toFixed(2)}`;
        const livePnlClass = tradeLivePnL === null
          ? "text-muted-foreground"
          : tradeLivePnL >= 0
            ? "text-success"
            : "text-destructive";
        return <div
          key={trade.id}
          className={cn(
            "glass-card-hover p-4 sm:p-5 shadow-none py-[10px] relative transition-all",
            hasUnseenUpdates && !isProvider && "ring-1 ring-primary/40 shadow-[0_0_0_1px_rgba(59,130,246,0.18),0_0_24px_rgba(59,130,246,0.14)] animate-[pulse_2.2s_ease-in-out_infinite]"
          )}
        >
          {/* Mobile Layout (< lg) */}
          <div className="block lg:hidden space-y-4">
            {/* Header Row: Direction + Pair */}
            <div className="flex items-center gap-3">
              <div className={cn("px-3 py-1.5 rounded-lg text-xs font-medium shrink-0", signal?.direction === "BUY" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive")}>
                {signal?.direction}
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

            {/* Price Grid */}
            <div className={cn("grid gap-2", isLiveMode && currentPrice != null ? "grid-cols-4" : "grid-cols-3")}>
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
              {isLiveMode && currentPrice != null && (
                <div className="py-2 px-3 rounded-lg bg-secondary text-center">
                  <p className="text-muted-foreground text-[10px] mb-0.5">Current</p>
                  <p className="font-mono text-xs font-medium">{currentPrice}</p>
                </div>
              )}
            </div>

            {/* Stats Row */}
            <div className={cn("grid gap-2", isLiveMode ? "grid-cols-3" : "grid-cols-2")}>
              <div className="py-2 px-2 rounded-lg bg-muted/50 text-center">
                <p className="text-muted-foreground text-[10px] mb-0.5">Risk {liveRiskPercent.toFixed(2)}%</p>
                <p className="text-primary font-mono text-xs font-bold">${getOpenRisk(trade).toFixed(0)}</p>
              </div>
              <div className="py-2 px-2 rounded-lg bg-success/10 text-center">
                <p className="text-muted-foreground text-[10px] mb-0.5">Potential Profit</p>
                <p className="text-success font-mono text-xs font-bold">+${potentialProfit.toFixed(0)}</p>
              </div>
              {isLiveMode && (
                <div className="py-2 px-2 rounded-lg bg-secondary text-center">
                  <p className="text-muted-foreground text-[10px] mb-0.5">Live P&L</p>
                  <p className={cn("font-mono text-xs font-bold", livePnlClass)}>{livePnlLabel}</p>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={!hasAnalysis}
                className={cn(
                  "border-primary/30 text-primary",
                  hasAnalysis ? "hover:bg-primary/10" : "opacity-50 cursor-not-allowed"
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  if (signal && hasAnalysis) openAnalysis(signal as Signal);
                }}
              >
                <FileText className="w-4 h-4 mr-1" />
                Analysis
              </Button>
              <div onClick={(e) => e.stopPropagation()}>
                <TradeUpdatesDialog
                  trade={trade}
                  updates={tradeUpdates}
                  hasUnseen={hasUnseenUpdates && !isProvider}
                  unseenCount={unseenCount}
                  onViewed={() => markSignalUpdatesSeen(signal?.id)}
                />
              </div>
            </div>
          </div>

          {/* Desktop Layout (lg+) */}
          <div className="hidden lg:grid grid-cols-[repeat(13,minmax(0,1fr))] gap-4 items-center">
            {/* Direction Badge - col-span-1 */}
            <div className={cn("col-span-1 inline-flex items-center justify-center px-3 py-2 rounded-lg text-sm font-medium w-full", signal?.direction === "BUY" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive")}>
              {signal?.direction}
            </div>

            {/* Pair Info - col-span-2 */}
            <div className="col-span-2 flex items-center gap-2">
              <h3 className="font-bold">{signal?.pair}</h3>
              <Badge variant="outline" className="text-xs">
                {signal?.category}
              </Badge>
            </div>

            {/* Entry Price - col-span-1 */}
            <div className="col-span-1 py-2 px-2 rounded-lg bg-primary/10 text-center w-full">
              <p className="text-muted-foreground mb-1 text-xs">Entry</p>
              <p className="text-primary font-mono text-sm font-medium truncate">{signal?.entry_price}</p>
            </div>

            {/* Stop Loss - col-span-1 */}
            <div className="col-span-1 py-2 px-2 rounded-lg bg-destructive/10 text-center w-full">
              <p className="text-muted-foreground mb-1 text-xs">SL</p>
              <p className="text-destructive font-mono text-sm font-medium truncate">{signal?.stop_loss}</p>
            </div>

            {/* Take Profit - col-span-1 */}
            <div className="col-span-1 py-2 px-2 rounded-lg bg-success/10 text-center w-full">
              <p className="text-muted-foreground mb-1 text-xs">TP</p>
              <p className="text-success font-mono text-sm font-medium truncate">{signal?.take_profit}</p>
            </div>

            {/* Current Price - col-span-1 (Live Mode only) */}
            {isLiveMode && currentPrice != null && (
              <div className="col-span-1 py-2 px-2 rounded-lg bg-secondary text-center w-full">
                <p className="text-muted-foreground mb-1 text-xs">Current</p>
                <p className="font-mono text-sm font-medium truncate">{currentPrice}</p>
              </div>
            )}

            {/* Started Time - col-span-1 */}
            <div className="col-span-1 py-2 px-2 rounded-lg border border-border/50 text-center w-full">
              <p className="text-muted-foreground mb-1 text-xs">Started</p>
              <p className="font-mono text-sm font-medium truncate">{getTimeAgo(trade.created_at)}</p>
            </div>

            {/* Risk Info - col-span-1 */}
            <div className="col-span-1 py-2 px-2 rounded-lg bg-muted/50 text-center w-full">
              <p className="text-muted-foreground mb-1 text-xs">Risk {liveRiskPercent.toFixed(2)}%</p>
              <p className="font-mono text-sm font-bold text-destructive truncate">${getOpenRisk(trade).toFixed(0)}</p>
            </div>

            {/* Potential Profit - col-span-1 */}
            <div className="col-span-1 py-2 px-2 rounded-lg bg-success/10 text-center w-full">
              <p className="text-muted-foreground mb-1 text-xs">Potential Profit</p>
              <p className="text-success font-mono text-sm font-bold truncate">+${potentialProfit.toFixed(0)}</p>
            </div>

            {isLiveMode && (
              <div className="col-span-1 py-2 px-2 rounded-lg bg-secondary text-center w-full">
                <p className="text-muted-foreground mb-1 text-xs">Live P&L</p>
                <p className={cn("font-mono text-sm font-bold truncate", livePnlClass)}>{livePnlLabel}</p>
              </div>
            )}

            <div className="col-span-1 py-2 px-2 rounded-lg bg-secondary/20 text-center w-full">
              <p className="text-muted-foreground mb-1 text-xs">Updates</p>
              <div className="flex justify-center">
                <TradeUpdatesDialog
                  trade={trade}
                  updates={tradeUpdates}
                  hasUnseen={hasUnseenUpdates && !isProvider}
                  unseenCount={unseenCount}
                  onViewed={() => markSignalUpdatesSeen(signal?.id)}
                />
              </div>
            </div>

            <div className="col-span-1 py-2 px-2 rounded-lg bg-secondary/20 text-center w-full">
              <p className="text-muted-foreground mb-1 text-xs">Analysis</p>
              <div className="flex justify-center">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!hasAnalysis}
                  className={cn(
                    "border-primary/30 text-primary",
                    hasAnalysis ? "hover:bg-primary/10" : "opacity-50 cursor-not-allowed"
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (signal && hasAnalysis) openAnalysis(signal as Signal);
                  }}
                >
                  <FileText className="w-4 h-4 mr-1" />
                  View
                </Button>
              </div>
            </div>
          </div>
        </div>;
      })}
    </div>}

    {/* Analysis Modal */}
    <SignalAnalysisModal
      signal={selectedSignal}
      open={isOpen}
      onOpenChange={handleOpenChange}
    />
  </DashboardLayout>;
};
export default ActiveTrades;



