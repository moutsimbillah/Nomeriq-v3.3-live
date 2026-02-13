import { useCallback, useEffect, useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { ArrowUpRight, ArrowDownRight, Clock, AlertCircle, Loader2, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { Signal } from "@/types/database";
import { DateRange } from "react-day-picker";
import { TradeFilters, SortOption, TimeFilter, DirectionFilter, CategoryFilter, filterByTime } from "@/components/filters/TradeFilters";
import { useAuth } from "@/contexts/AuthContext";
import { useAdminRole } from "@/hooks/useAdminRole";
import { SignalAnalysisModal } from "@/components/signals/SignalAnalysisModal";
import { useSignalAnalysisModal, hasAnalysisContent } from "@/hooks/useSignalAnalysisModal";
import { useUserSubscriptionCategories } from "@/hooks/useSubscriptionPackages";
import { shouldSuppressQueryErrorLog } from "@/lib/queryStability";
import { preloadSignalAnalysisMedia } from "@/lib/signalAnalysisMedia";
import { useProviderNameMap } from "@/hooks/useProviderNameMap";

interface UpcomingTradesSectionProps {
  adminGlobalView?: boolean;
}

export const UpcomingTradesSection = ({ adminGlobalView = false }: UpcomingTradesSectionProps) => {
  const [upcomingTrades, setUpcomingTrades] = useState<Signal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { user, isAdmin } = useAuth();
  const userId = user?.id ?? null;
  const { isProvider, isLoading: roleLoading } = useAdminRole();
  const { allowedCategories } = useUserSubscriptionCategories();
  
  // Analysis modal state
  const { selectedSignal, isOpen, openAnalysis, handleOpenChange } = useSignalAnalysisModal();

  // Filter states
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [directionFilter, setDirectionFilter] = useState<DirectionFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');

  const fetchUpcoming = useCallback(async () => {
    if (roleLoading) return;
    
    try {
      let query = supabase.from('signals').select('*').order('created_at', {
        ascending: false
      });
      
      // If user is a provider, filter to only their signals
      if (!adminGlobalView && isProvider && userId) {
        query = query.eq('created_by', userId);
      }
      // Regular users should only see subscribed categories.
      if (!adminGlobalView && !isProvider && !isAdmin && allowedCategories.length > 0) {
        query = query.in('category', allowedCategories);
      }

      const { data, error } = await query;
      
      if (error) throw error;
      const allSignals = data as unknown as Signal[];
      // Filter for upcoming signals: either by signal_type, status, or upcoming_status
      const filtered = (allSignals || []).filter(s => 
        (s.signal_type === 'upcoming' || s.status === 'upcoming' || s.upcoming_status) && 
        s.status !== 'closed' && 
        s.status !== 'cancelled'
      );
      setUpcomingTrades(filtered);
    } catch (err) {
      if (!shouldSuppressQueryErrorLog(err)) {
        console.error('Error fetching upcoming trades:', err);
      }
    } finally {
      setIsLoading(false);
    }
  }, [roleLoading, isProvider, userId, isAdmin, allowedCategories, adminGlobalView]);

  useEffect(() => {
    if (!roleLoading) {
      fetchUpcoming();
    }
    const channelId = `dashboard-upcoming-${Math.random().toString(36).substring(7)}`;
    const channel = supabase.channel(channelId).on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'signals'
    }, () => {
      fetchUpcoming();
    }).subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [roleLoading, fetchUpcoming]);

  // Apply filters
  const filteredTrades = useMemo(() => {
    let result = [...upcomingTrades];
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
    
    // Time filter
    result = filterByTime(result, timeFilter, dateRange);
    
    // Direction filter
    if (directionFilter !== 'all') {
      result = result.filter(t => t.direction === directionFilter);
    }
    
    // Category filter
    if (categoryFilter !== 'all') {
      result = result.filter(t => t.category?.toLowerCase() === categoryFilter.toLowerCase());
    }
    
    // Sort
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
  }, [upcomingTrades, timeFilter, dateRange, directionFilter, categoryFilter, sortBy]);
  const providerNameMap = useProviderNameMap(
    adminGlobalView ? filteredTrades.map((s) => s.created_by || "") : []
  );

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
  return <div className="space-y-6">
      {/* Analysis Modal */}
      <SignalAnalysisModal
        signal={selectedSignal}
        open={isOpen}
        onOpenChange={handleOpenChange}
      />
      {/* Section Header */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h3 className="font-semibold text-2xl">Upcoming Trades</h3>
            <p className="text-sm text-muted-foreground">
              Potential setups we're monitoring
            </p>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
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
            showResultFilter={false}
          />
          {/* Status Legend */}
          <div className="flex flex-wrap items-center gap-3 sm:gap-4">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-warning animate-pulse" />
              <span className="text-muted-foreground text-xs sm:text-sm">Near Entry</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-primary" />
              <span className="text-muted-foreground text-xs sm:text-sm">Preparing</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-muted-foreground" />
              <span className="text-muted-foreground text-xs sm:text-sm">Waiting</span>
            </div>
          </div>
        </div>
      </div>

      {/* Trades Grid */}
      {isLoading ? <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div> : filteredTrades.length === 0 ? <div className="glass-card p-8 text-center shadow-none">
          <Clock className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No Upcoming Trades</h3>
          <p className="text-muted-foreground">
            {upcomingTrades.length > 0 ? "Try adjusting your filters" : "We're not currently watching any setups. Check back soon!"}
          </p>
        </div> : <div className="space-y-3">
          {filteredTrades.map(trade => {
            const hasAnalysis = hasAnalysisContent(trade);
            return <div 
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
                      {adminGlobalView && (
                        <p className="text-xs text-muted-foreground">
                          Provider: {providerNameMap[trade.created_by || ""] || "Admin"}
                        </p>
                      )}
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
                  {adminGlobalView && (
                    <p className="text-xs text-muted-foreground truncate">
                      Provider: {providerNameMap[trade.created_by || ""] || "Admin"}
                    </p>
                  )}
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
                <p className="text-sm text-muted-foreground truncate text-left font-sans">
                  {trade.notes || "—"}
                </p>
              </div>
            </div>
          })}
        </div>}

      {/* Information Tip */}
      <div className="p-4 rounded-xl bg-primary/10 border border-primary/20">
        <p className="text-xs text-primary leading-relaxed">
          💡 <strong>How Upcoming Trades Work:</strong> These are potential trade setups we're monitoring.
          When conditions are met, they'll become active signals with push notifications.
          "Near Entry" trades are close to triggering — keep an eye on notifications!
        </p>
      </div>
    </div>;
};
