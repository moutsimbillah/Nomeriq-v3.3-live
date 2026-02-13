import { useState } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { cn } from "@/lib/utils";
import { ArrowUpRight, ArrowDownRight, Loader2, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useProviderAwareTrades } from "@/hooks/useProviderAwareTrades";
import { format, differenceInMinutes, differenceInHours, differenceInDays } from "date-fns";
import { DateRange } from "react-day-picker";
import { TradeFilters, SortOption, TimeFilter, DirectionFilter, CategoryFilter, ResultFilter, filterByTime, sortTrades } from "@/components/filters/TradeFilters";
import { SignalAnalysisModal } from "@/components/signals/SignalAnalysisModal";
import { useSignalAnalysisModal, hasAnalysisContent } from "@/hooks/useSignalAnalysisModal";
import { Signal } from "@/types/database";
import { TradeDetailsDialog } from "@/components/signals/TradeDetailsDialog";
import { useProviderNameMap } from "@/hooks/useProviderNameMap";
import { computeClosedTradeMetrics } from "@/lib/admin-metrics";
import { MetricInfoTooltip } from "@/components/common/MetricInfoTooltip";
import { calculateDisplayedPotentialProfit, calculateSignalRr } from "@/lib/trade-math";

const AdminHistory = () => {
    const { selectedSignal, isOpen, openAnalysis, handleOpenChange } = useSignalAnalysisModal();
    const {
        trades,
        isLoading,
    } = useProviderAwareTrades({
        realtime: true,
        fetchAll: true,
        adminGlobalView: true
    });

    // Filter states
    const [sortBy, setSortBy] = useState<SortOption>('newest');
    const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');
    const [dateRange, setDateRange] = useState<DateRange | undefined>();
    const [directionFilter, setDirectionFilter] = useState<DirectionFilter>('all');
    const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
    const [resultFilter, setResultFilter] = useState<ResultFilter>('all');

    // Filter closed trades only (win, loss, or breakeven)
    let closedTrades = trades.filter(t => t.result === 'win' || t.result === 'loss' || t.result === 'breakeven');
    const providerNameMap = useProviderNameMap(
      closedTrades.map((t) => t.signal?.created_by || "")
    );

    // Apply filters
    closedTrades = filterByTime(
        closedTrades,
        timeFilter,
        dateRange,
        (t) => new Date(t.closed_at || t.created_at)
    );

    // Direction filter
    if (directionFilter !== 'all') {
        closedTrades = closedTrades.filter(t => t.signal?.direction === directionFilter);
    }

    // Category filter
    if (categoryFilter !== 'all') {
        closedTrades = closedTrades.filter(t => t.signal?.category?.toLowerCase() === categoryFilter.toLowerCase());
    }

    // Result filter
    if (resultFilter !== 'all') {
        closedTrades = closedTrades.filter(t => t.result === resultFilter);
    }

    // Sort
    closedTrades = sortTrades(closedTrades, sortBy);

    const metrics = computeClosedTradeMetrics(closedTrades);

    return (
        <AdminLayout title="Global Trade History">
            {/* Summary Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
                <div className="glass-card p-6 shadow-none">
                    <p className="text-sm text-muted-foreground mb-1">Total Trades</p>
                    <p className="text-3xl font-bold">{isLoading ? "..." : metrics.totalClosedTrades}</p>
                </div>
                <div className="glass-card p-6 shadow-none">
                    <p className="text-sm text-muted-foreground mb-1">
                        <MetricInfoTooltip
                            label="Win Rate"
                            description="Wins divided by (Wins + Losses). Breakeven is excluded."
                        />
                    </p>
                    <p className="text-3xl font-bold text-success">{isLoading ? "..." : `${metrics.winRate.toFixed(1)}%`}</p>
                </div>
                <div className="glass-card p-6 shadow-none">
                    <p className="text-sm text-muted-foreground mb-1">Wins / Losses</p>
                    <p className="text-3xl font-bold">
                        <span className="text-success">{isLoading ? "..." : metrics.wins}</span>
                        <span className="text-muted-foreground mx-2">/</span>
                        <span className="text-destructive">{isLoading ? "..." : metrics.losses}</span>
                    </p>
                </div>
                <div className="glass-card p-6 shadow-none">
                    <p className="text-sm text-muted-foreground mb-1">Breakeven</p>
                    <p className="text-3xl font-bold text-warning">{isLoading ? "..." : metrics.breakeven}</p>
                </div>
                <div className="glass-card p-6 shadow-none">
                    <p className="text-sm text-muted-foreground mb-1">
                        <MetricInfoTooltip
                            label="Total Platform P&L"
                            description="Sum of realized P&L from closed trades."
                        />
                    </p>
                    <p className={cn("text-3xl font-bold", metrics.totalPnL >= 0 ? "text-success" : "text-destructive")}>
                        {isLoading ? "..." : `${metrics.totalPnL >= 0 ? "+" : ""}$${metrics.totalPnL.toFixed(2)}`}
                    </p>
                </div>
            </div>

            {/* Filters */}
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
                resultFilter={resultFilter}
                onResultFilterChange={setResultFilter}
                showResultFilter={true}
            />

            {/* History Table */}
            <div className="glass-card overflow-hidden shadow-none my-[24px]">
                {isLoading ? (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                    </div>
                ) : closedTrades.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                        <p>No closed trades yet</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-border/50 bg-secondary/30">
                                    <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-4">
                                        Pair
                                    </th>
                                    <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-4">
                                        Provider
                                    </th>
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
                                        Duration
                                    </th>
                                    <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-4">
                                        P&L
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
                                {closedTrades.map(trade => {
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
                                                        <p className="text-xs text-muted-foreground">{trade.signal?.category}</p>
                                                    </div>
                                                    {hasAnalysis && (
                                                        <FileText className="w-4 h-4 text-primary shrink-0" />
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="text-sm text-muted-foreground">
                                                    {providerNameMap[trade.signal?.created_by || ""] || "Admin"}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className={cn("inline-flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-lg text-sm font-medium w-20", trade.signal?.direction === "BUY" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive")}>
                                                    {trade.signal?.direction === "BUY" ? <ArrowUpRight className="w-4 h-4 shrink-0" /> : <ArrowDownRight className="w-4 h-4 shrink-0" />}
                                                    {trade.signal?.direction}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="font-mono text-sm">{trade.signal?.entry_price}</span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="space-y-1">
                                                    <p className="text-xs">
                                                        <span className="text-destructive font-mono">
                                                            {trade.signal?.stop_loss}
                                                        </span>
                                                    </p>
                                                    <p className="text-xs">
                                                        <span className="text-success font-mono">
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
                                                    +${calculateDisplayedPotentialProfit(trade).toFixed(2)}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-left">
                                                {(() => {
                                                    if (!trade.created_at || !trade.closed_at) return <span className="text-muted-foreground">-</span>;
                                                    const start = new Date(trade.created_at);
                                                    const end = new Date(trade.closed_at);
                                                    const minutes = differenceInMinutes(end, start);
                                                    const hours = differenceInHours(end, start);
                                                    const days = differenceInDays(end, start);

                                                    let duration = "";
                                                    if (days > 0) duration = `${days}d ${hours % 24}h`;
                                                    else if (hours > 0) duration = `${hours}h ${minutes % 60}m`;
                                                    else duration = `${minutes}m`;

                                                    return <span className="font-mono text-sm text-secondary-foreground">{duration}</span>;
                                                })()}
                                            </td>
                                            <td className="px-6 py-4 text-left">
                                                <span className={cn("font-mono font-semibold", (trade.pnl || 0) >= 0 ? "text-success" : "text-destructive")}>
                                                    {(trade.pnl || 0) >= 0 ? "+" : ""}${(trade.pnl || 0).toFixed(2)}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-left">
                                                <div>
                                                    <p className="text-sm">
                                                        {trade.closed_at ? format(new Date(trade.closed_at), 'yyyy-MM-dd') : '-'}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground">
                                                        {trade.closed_at ? format(new Date(trade.closed_at), 'HH:mm') : ''}
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
                    </div>
                )}
            </div>

            {/* Analysis Modal */}
            <SignalAnalysisModal
                signal={selectedSignal}
                open={isOpen}
                onOpenChange={handleOpenChange}
            />
        </AdminLayout>
    );
};

export default AdminHistory;
