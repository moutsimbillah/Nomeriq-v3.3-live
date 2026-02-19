import { useState, useEffect, useMemo } from "react";
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
import { playNotificationSound } from "@/lib/notificationSound";
import { Button } from "@/components/ui/button";
import { preloadSignalAnalysisMedia } from "@/lib/signalAnalysisMedia";
import { useProviderNameMap } from "@/hooks/useProviderNameMap";
import { MetricInfoTooltip } from "@/components/common/MetricInfoTooltip";
import { computeOpenTradeMetrics, computeLiveTradePnL, getExposureRiskAmount, getOpenRiskAmount } from "@/lib/admin-metrics";
import { useLivePrices } from "@/hooks/useLivePrices";
import { calculateSignalRrForTarget } from "@/lib/trade-math";
import { useLiveSignalAutoTriggers } from "@/hooks/useLiveSignalAutoTriggers";

interface ActiveTradesTableProps {
  adminGlobalView?: boolean;
  renderFilters?: (filters: React.ReactNode) => void;
}

export const ActiveTradesTable = ({ adminGlobalView = false, renderFilters }: ActiveTradesTableProps) => {
  const {
    trades,
    isLoading,
    isProvider,
  } = useProviderAwareTrades({
    result: 'pending',
    realtime: true,
    adminGlobalView,
  });
  const { user } = useAuth();
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
    if (!adminGlobalView && !isProvider) return filteredTrades;

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
  }, [filteredTrades, adminGlobalView, isProvider, user?.id]);
  const providerNameMap = useProviderNameMap(
    adminGlobalView ? displayTrades.map((t) => t.signal?.created_by || "") : []
  );

  const signalIds = useMemo(
    () => Array.from(new Set(displayTrades.map((t) => t.signal?.id).filter((id): id is string => !!id))),
    [displayTrades]
  );

  const liveModePairs = useMemo(
    () => displayTrades
      .filter((t) => (t.signal as Signal & { market_mode?: string })?.market_mode === "live" && t.signal?.pair)
      .map((t) => t.signal!.pair),
    [displayTrades]
  );
  const livePrices = useLivePrices(liveModePairs);
  const liveSignalsForAutoTriggers = useMemo(
    () =>
      Array.from(
        new Map(
          displayTrades
            .map((t) => t.signal)
            .filter(
              (s): s is Signal =>
                !!s &&
                s.signal_type === "signal" &&
                s.status === "active" &&
                s.market_mode === "live"
            )
            .map((s) => [s.id, s])
        ).values()
      ),
    [displayTrades]
  );
  useLiveSignalAutoTriggers(liveSignalsForAutoTriggers, livePrices, { enabled: true });
  const liveUnrealizedPnL = useMemo(() => {
    return displayTrades.reduce((sum, trade) => {
      const signal = trade.signal as (Signal & { market_mode?: string }) | undefined;
      if (signal?.market_mode !== "live" || !signal?.pair) return sum;
      const price = livePrices[signal.pair];
      if (price == null) return sum;
      return sum + computeLiveTradePnL(trade, price);
    }, 0);
  }, [displayTrades, livePrices]);

  useEffect(() => {
    const signalsToPreload = displayTrades
      .map((trade) => trade.signal as Signal | null | undefined)
      .filter((signal): signal is Signal => Boolean(signal?.analysis_image_url));

    signalsToPreload.forEach((signal) => {
      void preloadSignalAnalysisMedia(signal);
    });
  }, [displayTrades]);

  const { updatesBySignal } = useSignalTakeProfitUpdates({ signalIds, realtime: true });
  const [seenUpdateCounts, setSeenUpdateCounts] = useState<Record<string, number>>({});
  const seenStorageKey = useMemo(
    () => (user?.id ? `trade-updates-seen:${user.id}` : null),
    [user?.id]
  );
  const prevUpdateIdsRef = useState<Set<string>>(new Set())[0];
  const [isInitialUpdateLoad, setIsInitialUpdateLoad] = useState(true);

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
    if (isProvider || adminGlobalView) return;

    const currentIds = new Set<string>();
    Object.values(updatesBySignal).forEach((list) => {
      list.forEach((u) => currentIds.add(u.id));
    });

    if (isInitialUpdateLoad) {
      currentIds.forEach((id) => prevUpdateIdsRef.add(id));
      setIsInitialUpdateLoad(false);
      return;
    }

    const hasNew = Array.from(currentIds).some((id) => !prevUpdateIdsRef.has(id));
    if (hasNew) {
      void playNotificationSound();
    }

    prevUpdateIdsRef.clear();
    currentIds.forEach((id) => prevUpdateIdsRef.add(id));
  }, [updatesBySignal, isProvider, adminGlobalView, isInitialUpdateLoad, prevUpdateIdsRef]);

  const getOpenRisk = (trade: UserTrade) => getOpenRiskAmount(trade);
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
    const targetTp = getTargetTpFromUpdates(trade);
    return calculateSignalRrForTarget(trade.signal, targetTp);
  };
  const calculateTradePotentialProfit = (trade: UserTrade) => {
    return getExposureRiskAmount(trade) * calculateTradeRr(trade);
  };
  const openTradeMetrics = computeOpenTradeMetrics(displayTrades, {
    getRiskPercent: getTradeRiskPercent,
    getTargetTp: getTargetTpFromUpdates,
    liveUnrealizedPnL,
  });
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
  // Render filters in parent layout if callback provided
  useEffect(() => {
    if (renderFilters) {
      renderFilters(
        <TradeFilters
          sortBy={sortBy}
          onSortChange={setSortBy}
          timeFilter={timeFilter}
          onTimeFilterChange={setTimeFilter}
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
          directionFilter={directionFilter}
          onDirectionFilterChange={setDirectionFilter}
          categoryFilter={categoryFilter}
          onCategoryFilterChange={setCategoryFilter}
        />
      );
    }
  }, [renderFilters, sortBy, timeFilter, dateRange, directionFilter, categoryFilter]);

  return <div className="space-y-6">
    {/* Analysis Modal */}
    <SignalAnalysisModal
      signal={selectedSignal}
      open={isOpen}
      onOpenChange={handleOpenChange}
    />


    {/* Title and Filters Section - only show if not rendered in parent layout */}
    {!renderFilters && (
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
        <div>
          <h2 className="text-2xl font-bold mb-1">Active Trades</h2>
          <p className="text-sm text-muted-foreground">
            Monitor all your currently running trades in real-time with live risk and profit tracking.
          </p>
        </div>
        <div className="flex-shrink-0">
          <TradeFilters sortBy={sortBy} onSortChange={setSortBy} timeFilter={timeFilter} onTimeFilterChange={setTimeFilter} dateRange={dateRange} onDateRangeChange={setDateRange} directionFilter={directionFilter} onDirectionFilterChange={setDirectionFilter} categoryFilter={categoryFilter} onCategoryFilterChange={setCategoryFilter} />
        </div>
      </div>
    )}

    {/* Summary Cards */}
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
      <div className="glass-card p-4 sm:p-6 shadow-none">
        <p className="text-xs sm:text-sm text-muted-foreground mb-1">Open Positions</p>
        <p className="text-xl sm:text-3xl font-bold">{isLoading ? "..." : displayTrades.length}</p>
      </div>
      <div className="glass-card p-4 sm:p-6 shadow-none">
        <p className="text-xs sm:text-sm text-muted-foreground mb-1">
          <MetricInfoTooltip
            label="Total Risk"
            description="Sum of open risk exposure from pending trades."
          />
        </p>
        <p className="text-xl sm:text-3xl font-bold text-red-700">
          {isLoading ? "..." : `$${openTradeMetrics.totalRisk.toFixed(2)}`}
        </p>
      </div>
      <div className="glass-card p-4 sm:p-6 shadow-none">
        <p className="text-xs sm:text-sm text-muted-foreground mb-1">
          <MetricInfoTooltip
            label="Potential Profit"
            description="Model estimate from open risk and current target TP."
          />
        </p>
        <p className="text-xl sm:text-3xl font-bold text-success">
          {isLoading ? "..." : `+$${openTradeMetrics.totalPotentialProfit.toFixed(2)}`}
        </p>
      </div>
      <div className="glass-card p-4 sm:p-6 shadow-none">
        <p className="text-xs sm:text-sm text-muted-foreground mb-1">
          <MetricInfoTooltip
            label="Unrealized P&L"
            description="Live P&L for Live Mode signals; $0.00 for Manual Mode signals."
          />
        </p>
        <p className={cn("text-xl sm:text-3xl font-bold text-secondary-foreground", openTradeMetrics.unrealizedPnL >= 0 ? "text-success" : "text-destructive")}>
          {openTradeMetrics.unrealizedPnL >= 0 ? "+" : ""}${openTradeMetrics.unrealizedPnL.toFixed(2)}
        </p>
      </div>
      <div className="glass-card p-4 sm:p-6 shadow-none col-span-2 sm:col-span-1">
        <p className="text-xs sm:text-sm text-muted-foreground mb-1">
          <MetricInfoTooltip
            label="Avg. Risk/Trade"
            description="Average configured risk percent across open trades."
          />
        </p>
        <p className="text-xl sm:text-3xl font-bold text-red-700">{openTradeMetrics.averageRiskPercent.toFixed(2)}%</p>
      </div>
    </div>

    {/* Trades Grid */}
    {isLoading ? <div className="flex items-center justify-center py-12">
      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
    </div> : filteredTrades.length === 0 ? <div className="glass-card p-12 text-center text-muted-foreground shadow-none">
      <p>No active trades</p>
      <p className="text-sm mt-2">{trades.length > 0 ? "Try adjusting your filters" : "New signals will appear here automatically"}</p>
    </div> : <div className="grid gap-4">
      {displayTrades.map(trade => {
        const signal = trade.signal as (Signal & { market_mode?: string }) | undefined;
        const isLiveMode = signal?.market_mode === "live";
        const currentPrice = signal?.pair ? livePrices[signal.pair] : undefined;
        const tradeLivePnL = isLiveMode && currentPrice != null ? computeLiveTradePnL(trade, currentPrice) : null;
        const potentialProfit = calculateTradePotentialProfit(trade);
        const liveRiskPercent = getTradeRiskPercent(trade);
        const hasAnalysis = hasAnalysisContent(signal as Signal | undefined);
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
            "glass-card-hover p-4 sm:p-5 shadow-none py-[11px] relative transition-all",
            hasUnseenUpdates && !isProvider && !adminGlobalView && "ring-1 ring-primary/40 shadow-[0_0_0_1px_rgba(59,130,246,0.18),0_0_24px_rgba(59,130,246,0.14)] animate-[pulse_2.2s_ease-in-out_infinite]"
          )}
        >
          {/* Mobile Layout (< md) */}
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
                {adminGlobalView && (
                  <p className="text-xs text-muted-foreground">
                    Provider: {providerNameMap[signal?.created_by || ""] || "Admin"}
                  </p>
                )}
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
                  hasUnseen={hasUnseenUpdates && !isProvider && !adminGlobalView}
                  unseenCount={unseenCount}
                  onViewed={() => markSignalUpdatesSeen(signal?.id)}
                />
              </div>
            </div>
          </div>

          {/* Desktop Layout (lg+) */}
          <div className={cn(
            "hidden lg:grid gap-4 items-center",
            adminGlobalView
              ? "grid-cols-[repeat(14,minmax(0,1fr))]"
              : "grid-cols-[repeat(13,minmax(0,1fr))]"
          )}>
            {/* Direction Badge - col-span-1 */}
            <div className={cn("col-span-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium w-full", signal?.direction === "BUY" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive")}>
              {signal?.direction}
            </div>

            {/* Pair Info - col-span-2 */}
            <div className="col-span-2 flex items-center gap-2">
              <h3 className="font-bold">{signal?.pair}</h3>
              <Badge variant="outline" className="text-xs">
                {signal?.category}
              </Badge>
            </div>

            {adminGlobalView && (
              <div className="col-span-1 py-2 px-2 rounded-lg border border-border/50 text-center w-full">
                <p className="text-muted-foreground mb-1 text-xs">Provider</p>
                <p className="text-sm font-medium truncate">
                  {providerNameMap[signal?.created_by || ""] || "Admin"}
                </p>
              </div>
            )}

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
              <p className="font-mono text-sm font-bold text-red-500 truncate">${getOpenRisk(trade).toFixed(0)}</p>
            </div>

            {/* Potential Profit - col-span-1 */}
            <div className="col-span-1 py-2 px-2 rounded-lg bg-success/10 text-center w-full">
              <p className="text-muted-foreground mb-1 text-xs">Potential Profit</p>
              <p className="text-success font-mono text-sm font-bold truncate">+${potentialProfit.toFixed(0)}</p>
            </div>

            {/* Live P&L - col-span-1 (Live Mode only) */}
            {isLiveMode && (
              <div className="col-span-1 py-2 px-2 rounded-lg bg-secondary text-center w-full">
                <p className="text-muted-foreground mb-1 text-xs">Live P&L</p>
                <p className={cn("font-mono text-sm font-bold truncate", livePnlClass)}>{livePnlLabel}</p>
              </div>
            )}

            {/* Updates - col-span-1 */}
            <div className="col-span-1 py-2 px-2 rounded-lg bg-secondary/20 text-center w-full">
              <p className="text-muted-foreground mb-1 text-xs">Updates</p>
              <div className="flex justify-center">
                <TradeUpdatesDialog
                  trade={trade}
                  updates={tradeUpdates}
                  hasUnseen={hasUnseenUpdates && !isProvider && !adminGlobalView}
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
  </div>;
};




