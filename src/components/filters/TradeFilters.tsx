import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { SlidersHorizontal } from "lucide-react";
import { subWeeks, subMonths, startOfDay, endOfDay } from "date-fns";
import { DateRange } from "react-day-picker";
import { TradeFilterControls } from "@/components/filters/TradeFilterControls";

export type SortOption = 'newest' | 'oldest' | 'pair-asc' | 'pair-desc' | 'pnl-high' | 'pnl-low' | 'risk-high' | 'risk-low';
export type TimeFilter = 'all' | 'today' | 'week' | 'month' | 'custom';
export type DirectionFilter = 'all' | 'BUY' | 'SELL';
export type CategoryFilter = 'all' | 'forex' | 'crypto' | 'metals' | 'indices' | 'commodities';
export type ResultFilter = 'all' | 'win' | 'loss' | 'breakeven' | 'pending';

interface TradeFiltersProps {
  sortBy: SortOption;
  onSortChange: (sort: SortOption) => void;
  timeFilter: TimeFilter;
  onTimeFilterChange: (filter: TimeFilter) => void;
  dateRange?: DateRange;
  onDateRangeChange?: (range: DateRange | undefined) => void;
  directionFilter?: DirectionFilter;
  onDirectionFilterChange?: (filter: DirectionFilter) => void;
  categoryFilter?: CategoryFilter;
  onCategoryFilterChange?: (filter: CategoryFilter) => void;
  resultFilter?: ResultFilter;
  onResultFilterChange?: (filter: ResultFilter) => void;
  showResultFilter?: boolean;
  showDirectionFilter?: boolean;
  showCategoryFilter?: boolean;
}

export const TradeFilters = ({
  sortBy,
  onSortChange,
  timeFilter,
  onTimeFilterChange,
  dateRange,
  onDateRangeChange,
  directionFilter = 'all',
  onDirectionFilterChange,
  categoryFilter = 'all',
  onCategoryFilterChange,
  resultFilter = 'all',
  onResultFilterChange,
  showResultFilter = false,
  showDirectionFilter = true,
  showCategoryFilter = true,
}: TradeFiltersProps) => {
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  const hasActiveFilters = 
    timeFilter !== 'all' || 
    directionFilter !== 'all' || 
    categoryFilter !== 'all' || 
    resultFilter !== 'all' ||
    sortBy !== 'newest';

  const activeFilterCount = [
    timeFilter !== 'all',
    directionFilter !== 'all',
    categoryFilter !== 'all',
    resultFilter !== 'all',
    sortBy !== 'newest'
  ].filter(Boolean).length;

  const clearFilters = () => {
    onSortChange('newest');
    onTimeFilterChange('all');
    onDateRangeChange?.(undefined);
    onDirectionFilterChange?.('all');
    onCategoryFilterChange?.('all');
    onResultFilterChange?.('all');
  };

  return (
    <div>
      {/* Mobile/Tablet: Bottom sheet */}
      <div className="lg:hidden">
        <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 gap-2">
              <SlidersHorizontal className="w-4 h-4" />
              Filters
              {activeFilterCount > 0 && (
                <Badge variant="secondary" className="h-5 w-5 p-0 flex items-center justify-center text-xs">
                  {activeFilterCount}
                </Badge>
              )}
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="h-auto max-h-[80vh] rounded-t-xl">
            <SheetHeader className="mb-4">
              <SheetTitle>Filters & Sorting</SheetTitle>
            </SheetHeader>
            <TradeFilterControls
              isMobile
              sortBy={sortBy}
              onSortChange={onSortChange}
              timeFilter={timeFilter}
              onTimeFilterChange={onTimeFilterChange}
              dateRange={dateRange}
              onDateRangeChange={onDateRangeChange}
              directionFilter={directionFilter}
              onDirectionFilterChange={onDirectionFilterChange}
              categoryFilter={categoryFilter}
              onCategoryFilterChange={onCategoryFilterChange}
              resultFilter={resultFilter}
              onResultFilterChange={onResultFilterChange}
              showResultFilter={showResultFilter}
              showDirectionFilter={showDirectionFilter}
              showCategoryFilter={showCategoryFilter}
              hasActiveFilters={hasActiveFilters}
              onClearFilters={clearFilters}
            />
          </SheetContent>
        </Sheet>
      </div>

      {/* Desktop: Inline filters */}
      <div className="hidden lg:block">
        <TradeFilterControls
          sortBy={sortBy}
          onSortChange={onSortChange}
          timeFilter={timeFilter}
          onTimeFilterChange={onTimeFilterChange}
          dateRange={dateRange}
          onDateRangeChange={onDateRangeChange}
          directionFilter={directionFilter}
          onDirectionFilterChange={onDirectionFilterChange}
          categoryFilter={categoryFilter}
          onCategoryFilterChange={onCategoryFilterChange}
          resultFilter={resultFilter}
          onResultFilterChange={onResultFilterChange}
          showResultFilter={showResultFilter}
          showDirectionFilter={showDirectionFilter}
          showCategoryFilter={showCategoryFilter}
          hasActiveFilters={hasActiveFilters}
          onClearFilters={clearFilters}
        />
      </div>
    </div>
  );
};

// Helper to filter trades by time
export const filterByTime = <T extends { created_at: string }>(
  items: T[],
  timeFilter: TimeFilter,
  dateRange?: DateRange,
  getItemDate?: (item: T) => Date
): T[] => {
  if (timeFilter === 'all') return items;

  const now = new Date();
  let startDate: Date;
  let endDate: Date = endOfDay(now);

  switch (timeFilter) {
    case 'today':
      startDate = startOfDay(now);
      break;
    case 'week':
      startDate = startOfDay(subWeeks(now, 1));
      break;
    case 'month':
      startDate = startOfDay(subMonths(now, 1));
      break;
    case 'custom':
      if (!dateRange?.from) return items;
      startDate = startOfDay(dateRange.from);
      endDate = dateRange.to ? endOfDay(dateRange.to) : endOfDay(dateRange.from);
      break;
    default:
      return items;
  }

  return items.filter(item => {
    const itemDate = getItemDate ? getItemDate(item) : new Date(item.created_at);
    return itemDate >= startDate && itemDate <= endDate;
  });
};

// Helper to sort trades
export const sortTrades = <T extends { 
  created_at: string; 
  signal?: { pair?: string } | null;
  pnl?: number | null;
  risk_amount?: number;
}>(
  items: T[],
  sortBy: SortOption
): T[] => {
  return [...items].sort((a, b) => {
    switch (sortBy) {
      case 'newest':
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      case 'oldest':
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      case 'pair-asc':
        return (a.signal?.pair || '').localeCompare(b.signal?.pair || '');
      case 'pair-desc':
        return (b.signal?.pair || '').localeCompare(a.signal?.pair || '');
      case 'pnl-high':
        return (b.pnl || 0) - (a.pnl || 0);
      case 'pnl-low':
        return (a.pnl || 0) - (b.pnl || 0);
      case 'risk-high':
        return (b.risk_amount || 0) - (a.risk_amount || 0);
      case 'risk-low':
        return (a.risk_amount || 0) - (b.risk_amount || 0);
      default:
        return 0;
    }
  });
};
