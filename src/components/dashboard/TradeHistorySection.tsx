import { useState, useMemo, useEffect } from "react";
import { cn } from "@/lib/utils";
import { ArrowUpRight, ArrowDownRight, Loader2, History, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useProviderAwareTrades } from "@/hooks/useProviderAwareTrades";
import { format, formatDistanceStrict } from "date-fns";
import { DateRange } from "react-day-picker";
import { TradeFilters, SortOption, TimeFilter, DirectionFilter, CategoryFilter, ResultFilter, filterByTime, sortTrades } from "@/components/filters/TradeFilters";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SignalAnalysisModal } from "@/components/signals/SignalAnalysisModal";
import { useSignalAnalysisModal, hasAnalysisContent } from "@/hooks/useSignalAnalysisModal";
import { Signal } from "@/types/database";
import { TradeDetailsDialog } from "@/components/signals/TradeDetailsDialog";
import { preloadSignalAnalysisMedia } from "@/lib/signalAnalysisMedia";
import { useProviderNameMap } from "@/hooks/useProviderNameMap";
import { calculateOpeningPotentialProfit, calculateSignalRr } from "@/lib/trade-math";
import { calculateWinRatePercent } from "@/lib/kpi-math";

interface TradeHistorySectionProps {
  adminGlobalView?: boolean;
}

export const TradeHistorySection = ({ adminGlobalView = false }: TradeHistorySectionProps) => {
  const { selectedSignal, isOpen, openAnalysis, handleOpenChange } = useSignalAnalysisModal();
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState("10");

  // Filter states
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [directionFilter, setDirectionFilter] = useState<DirectionFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [resultFilter, setResultFilter] = useState<ResultFilter>('all');
  const {
    trades,
    isLoading
  } = useProviderAwareTrades({
    realtime: true,
    fetchAll: true,
    adminGlobalView,
  });

  // Filter closed trades only (win, loss, or breakeven)
  const closedTrades = trades.filter(t => t.result === "win" || t.result === "loss" || t.result === "breakeven");

  // Apply filters
  const filteredTrades = useMemo(() => {
    let result = [...closedTrades];

    // Time filter
    result = filterByTime(
      result,
      timeFilter,
      dateRange,
      (t) => new Date(t.closed_at || t.created_at)
    );

    // Direction filter
    if (directionFilter !== 'all') {
      result = result.filter(t => t.signal?.direction === directionFilter);
    }

    // Category filter
    if (categoryFilter !== 'all') {
      result = result.filter(t => t.signal?.category?.toLowerCase() === categoryFilter.toLowerCase());
    }

    // Result filter
    if (resultFilter !== 'all') {
      result = result.filter(t => t.result === resultFilter);
    }

    // Sort
    return sortTrades(result, sortBy);
  }, [closedTrades, timeFilter, dateRange, directionFilter, categoryFilter, resultFilter, sortBy]);
  const providerNameMap = useProviderNameMap(
    adminGlobalView ? filteredTrades.map((t) => t.signal?.created_by || "") : []
  );

  // Pagination
  const totalPages = useMemo(() => {
    const size = Math.max(1, parseInt(rowsPerPage, 10));
    return Math.max(1, Math.ceil(filteredTrades.length / size));
  }, [filteredTrades.length, rowsPerPage]);
  const paginatedTrades = useMemo(() => {
    const size = Math.max(1, parseInt(rowsPerPage, 10));
    const start = (currentPage - 1) * size;
    return filteredTrades.slice(start, start + size);
  }, [filteredTrades, currentPage, rowsPerPage]);

  useEffect(() => {
    paginatedTrades
      .map((trade) => trade.signal as Signal | null | undefined)
      .filter((signal): signal is Signal => Boolean(signal?.analysis_image_url))
      .forEach((signal) => {
        void preloadSignalAnalysisMedia(signal);
      });
  }, [paginatedTrades]);

  // Reset to page 1 when filters/sort change
  useEffect(() => {
    setCurrentPage(1);
  }, [sortBy, timeFilter, dateRange, directionFilter, categoryFilter, resultFilter, rowsPerPage, filteredTrades.length]);

  // Summary stats (based on filtered trades)
  const wins = filteredTrades.filter(t => t.result === "win").length;
  const losses = filteredTrades.filter(t => t.result === "loss").length;
  const breakevens = filteredTrades.filter(t => t.result === "breakeven").length;
  const totalPnL = filteredTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
  const winRate = calculateWinRatePercent(wins, losses).toFixed(1);
  return <div className="space-y-6">
      {/* Section Header */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold">Trade History</h2>
            <p className="text-sm text-muted-foreground">
              Your completed trades and performance summary
            </p>
          </div>
        </div>
        <TradeFilters sortBy={sortBy} onSortChange={setSortBy} timeFilter={timeFilter} onTimeFilterChange={setTimeFilter} dateRange={dateRange} onDateRangeChange={setDateRange} directionFilter={directionFilter} onDirectionFilterChange={setDirectionFilter} categoryFilter={categoryFilter} onCategoryFilterChange={setCategoryFilter} resultFilter={resultFilter} onResultFilterChange={setResultFilter} showResultFilter={true} />
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="glass-card p-6 shadow-none">
          <p className="text-sm text-muted-foreground mb-1">Total Trades</p>
          <p className="text-3xl font-bold">
            {isLoading ? "..." : filteredTrades.length}
          </p>
        </div>
        <div className="glass-card p-6 shadow-none">
          <p className="text-sm text-muted-foreground mb-1">Win Rate</p>
          <p className="text-3xl font-bold text-success">
            {isLoading ? "..." : `${winRate}%`}
          </p>
        </div>
        <div className="glass-card p-6 shadow-none">
          <p className="text-sm text-muted-foreground mb-1">Wins / Losses</p>
          <p className="text-3xl font-bold">
            <span className="text-success">{isLoading ? "..." : wins}</span>
            <span className="text-muted-foreground mx-2">/</span>
            <span className="text-destructive">{isLoading ? "..." : losses}</span>
          </p>
        </div>
        <div className="glass-card p-6 shadow-none">
          <p className="text-sm text-muted-foreground mb-1">Breakeven</p>
          <p className="text-3xl font-bold text-warning">
            {isLoading ? "..." : breakevens}
          </p>
        </div>
        <div className="glass-card p-6 shadow-none">
          <p className="text-sm text-muted-foreground mb-1">Total P&L</p>
          <p className={cn("text-3xl font-bold", totalPnL >= 0 ? "text-success" : "text-destructive")}>
            {isLoading ? "..." : `${totalPnL >= 0 ? "+" : ""}$${totalPnL.toFixed(2)}`}
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      

      {/* History Table */}
      <div className="glass-card overflow-hidden shadow-none">
        {isLoading ? <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div> : filteredTrades.length === 0 ? <div className="text-center py-12">
            <History className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Trade History</h3>
            <p className="text-muted-foreground">
              {resultFilter === "all" ? "Completed trades will appear here once signals are closed." : `No ${resultFilter} trades found.`}
            </p>
          </div> : <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border/50 bg-secondary/30">
                  <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-4">
                    Pair
                  </th>
                  {adminGlobalView && (
                    <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-4">
                      Provider
                    </th>
                  )}
                  <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-4">
                    Direction
                  </th>
                  <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-4">
                    Entry
                  </th>
                  <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-4">
                    SL / TP
                  </th>
                  <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-4">
                    Result
                  </th>
                  <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-4">
                    R:R
                  </th>
                  <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-4">
                    Risk
                  </th>
                  <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-4">
                    Potential Profit
                  </th>
                  <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-4">
                    P&L
                  </th>
                  <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-4">
                    Duration
                  </th>
                  <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-4">
                    Closed At
                  </th>
                  <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-4">
                    Details
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
              {paginatedTrades.map(trade => {
                const hasAnalysis = hasAnalysisContent(trade.signal as Signal);
                return (
                  <tr 
                    key={trade.id} 
                    className={cn(
                      "hover:bg-accent/30 transition-colors",
                      hasAnalysis && "cursor-pointer"
                    )}
                    onClick={() => hasAnalysis && trade.signal && openAnalysis(trade.signal as Signal)}
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div>
                          <span className="font-semibold">{trade.signal?.pair}</span>
                          <p className="text-xs text-muted-foreground">
                            {trade.signal?.category}
                          </p>
                        </div>
                        {hasAnalysis && (
                          <FileText className="w-4 h-4 text-primary shrink-0" />
                        )}
                      </div>
                    </td>
                    {adminGlobalView && (
                      <td className="px-6 py-4">
                        <span className="text-sm text-muted-foreground">
                          {providerNameMap[trade.signal?.created_by || ""] || "Admin"}
                        </span>
                      </td>
                    )}
                    <td className="px-6 py-4">
                      <div className={cn("inline-flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-lg text-sm font-medium w-20", trade.signal?.direction === "BUY" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive")}>
                        {trade.signal?.direction === "BUY" ? <ArrowUpRight className="w-4 h-4 shrink-0" /> : <ArrowDownRight className="w-4 h-4 shrink-0" />}
                        {trade.signal?.direction}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-sans">
                        {trade.signal?.entry_price}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="space-y-1">
                        <p className="text-xs">
                          <span className="text-destructive font-sans text-sm">
                            {trade.signal?.stop_loss}
                          </span>
                        </p>
                        <p className="text-xs">
                          <span className="text-success font-sans text-sm">
                            {trade.signal?.take_profit}
                          </span>
                        </p>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-left">
                      <Badge variant="outline" className={cn(trade.result === "win" ? "border-success/30 text-success bg-success/10" : trade.result === "breakeven" ? "border-warning/30 text-warning bg-warning/10" : "border-destructive/30 text-destructive bg-destructive/10")}>
                        {trade.result === "win" ? "Win" : trade.result === "breakeven" ? "Breakeven" : "Loss"}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 text-left">
                      <span className="font-mono text-sm text-secondary-foreground">
                        1:{calculateSignalRr(trade).toFixed(1)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-left">
                      <div>
                        <p className="text-sm font-mono font-semibold text-foreground">
                          {Number(trade.risk_percent || 0).toFixed(0)}%
                        </p>
                        <p className="text-xs font-mono text-muted-foreground">
                          ${Number(trade.risk_amount || 0).toFixed(2)}
                        </p>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-left">
                      <span className="font-mono font-semibold text-success">
                        +${calculateOpeningPotentialProfit(trade).toFixed(2)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-left">
                      <span className={cn("font-mono font-semibold", (trade.pnl || 0) >= 0 ? "text-success" : "text-destructive")}>
                        {(trade.pnl || 0) >= 0 ? "+" : ""}$
                        {(trade.pnl || 0).toFixed(2)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-left">
                      <span className="text-sm text-muted-foreground">
                        {trade.created_at && trade.closed_at ? formatDistanceStrict(new Date(trade.created_at), new Date(trade.closed_at)) : "-"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-left">
                      <div>
                        <p className="text-sm">
                          {trade.closed_at ? format(new Date(trade.closed_at), "yyyy-MM-dd") : "-"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {trade.closed_at ? format(new Date(trade.closed_at), "HH:mm") : ""}
                        </p>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-left">
                      <div onClick={(e) => e.stopPropagation()}>
                        <TradeDetailsDialog trade={trade} />
                      </div>
                    </td>
                  </tr>
                );
              })}
              </tbody>
            </table>
          </div>}
      </div>

      {/* Pagination */}
      {filteredTrades.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Rows</span>
            <Select value={rowsPerPage} onValueChange={setRowsPerPage}>
              <SelectTrigger className="h-8 w-[90px] bg-secondary/40 border-border/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="20">20</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between sm:justify-end gap-2">
            <p className="text-xs text-muted-foreground">
              Page {currentPage} of {totalPages}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Analysis Modal */}
      <SignalAnalysisModal
        signal={selectedSignal}
        open={isOpen}
        onOpenChange={handleOpenChange}
      />
    </div>;
};
