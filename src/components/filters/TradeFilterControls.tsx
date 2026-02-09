import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { ArrowUpDown, Calendar as CalendarIcon, Filter, X } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import type { DateRange } from "react-day-picker";

import type {
  CategoryFilter,
  DirectionFilter,
  ResultFilter,
  SortOption,
  TimeFilter,
} from "./TradeFilters";

type Props = {
  isMobile?: boolean;

  sortBy: SortOption;
  onSortChange: (sort: SortOption) => void;

  timeFilter: TimeFilter;
  onTimeFilterChange: (filter: TimeFilter) => void;

  dateRange?: DateRange;
  onDateRangeChange?: (range: DateRange | undefined) => void;

  directionFilter: DirectionFilter;
  onDirectionFilterChange?: (filter: DirectionFilter) => void;

  categoryFilter: CategoryFilter;
  onCategoryFilterChange?: (filter: CategoryFilter) => void;

  resultFilter: ResultFilter;
  onResultFilterChange?: (filter: ResultFilter) => void;

  showResultFilter: boolean;
  showDirectionFilter: boolean;
  showCategoryFilter: boolean;

  hasActiveFilters: boolean;
  onClearFilters: () => void;
};

/**
 * IMPORTANT: This component is intentionally defined outside TradeFilters
 * so it remains stable across parent re-renders (e.g., Active Trades updates every second).
 * Remounting Radix components inside a Dialog/Sheet can trigger unintended dismiss events.
 */
export function TradeFilterControls({
  isMobile = false,
  sortBy,
  onSortChange,
  timeFilter,
  onTimeFilterChange,
  dateRange,
  onDateRangeChange,
  directionFilter,
  onDirectionFilterChange,
  categoryFilter,
  onCategoryFilterChange,
  resultFilter,
  onResultFilterChange,
  showResultFilter,
  showDirectionFilter,
  showCategoryFilter,
  hasActiveFilters,
  onClearFilters,
}: Props) {
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);

  return (
    <div className={cn(isMobile ? "flex flex-col gap-3" : "flex flex-wrap items-center gap-2 sm:gap-3")}>
      {/* Sort */}
      <Select value={sortBy} onValueChange={(v) => onSortChange(v as SortOption)}>
        <SelectTrigger className={cn("h-9 text-xs sm:text-sm", isMobile ? "w-full" : "w-[140px] sm:w-[160px]")}>
          <ArrowUpDown className="w-3.5 h-3.5 mr-1.5" />
          <SelectValue placeholder="Sort by" />
        </SelectTrigger>
        <SelectContent portal={!isMobile}>
          <SelectItem value="newest">Newest First</SelectItem>
          <SelectItem value="oldest">Oldest First</SelectItem>
          <SelectItem value="pair-asc">Pair A-Z</SelectItem>
          <SelectItem value="pair-desc">Pair Z-A</SelectItem>
          <SelectItem value="pnl-high">Highest P&L</SelectItem>
          <SelectItem value="pnl-low">Lowest P&L</SelectItem>
          <SelectItem value="risk-high">Highest Risk</SelectItem>
          <SelectItem value="risk-low">Lowest Risk</SelectItem>
        </SelectContent>
      </Select>

      {/* Time Filter */}
      <Select
        value={timeFilter}
        onValueChange={(v) => {
          onTimeFilterChange(v as TimeFilter);
          if (v === "custom") setIsCalendarOpen(true);
        }}
      >
        <SelectTrigger className={cn("h-9 text-xs sm:text-sm", isMobile ? "w-full" : "w-[120px] sm:w-[140px]")}>
          <CalendarIcon className="w-3.5 h-3.5 mr-1.5" />
          <SelectValue placeholder="Time" />
        </SelectTrigger>
        <SelectContent portal={!isMobile}>
          <SelectItem value="all">All Time</SelectItem>
          <SelectItem value="today">Today</SelectItem>
          <SelectItem value="week">This Week</SelectItem>
          <SelectItem value="month">This Month</SelectItem>
          <SelectItem value="custom">Custom Range</SelectItem>
        </SelectContent>
      </Select>

      {/* Custom Date Range Popover */}
      {timeFilter === "custom" && (
        <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className={cn("h-9 text-xs sm:text-sm", isMobile && "w-full justify-start")}>
              {dateRange?.from ? (
                dateRange.to ? (
                  <>
                    {format(dateRange.from, "MMM d")} - {format(dateRange.to, "MMM d")}
                  </>
                ) : (
                  format(dateRange.from, "MMM d, yyyy")
                )
              ) : (
                "Pick dates"
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent portal={!isMobile} className="w-auto p-0" align="start">
            <Calendar
              initialFocus
              mode="range"
              defaultMonth={dateRange?.from}
              selected={dateRange}
              onSelect={(range) => {
                onDateRangeChange?.(range);
                if (range?.from && range?.to) setIsCalendarOpen(false);
              }}
              numberOfMonths={isMobile ? 1 : 2}
            />
          </PopoverContent>
        </Popover>
      )}

      {/* Direction Filter */}
      {showDirectionFilter && onDirectionFilterChange && (
        <Select value={directionFilter} onValueChange={(v) => onDirectionFilterChange(v as DirectionFilter)}>
          <SelectTrigger className={cn("h-9 text-xs sm:text-sm", isMobile ? "w-full" : "w-[100px] sm:w-[120px]")}>
            <Filter className="w-3.5 h-3.5 mr-1.5" />
            <SelectValue placeholder="Direction" />
          </SelectTrigger>
          <SelectContent portal={!isMobile}>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="BUY">Buy Only</SelectItem>
            <SelectItem value="SELL">Sell Only</SelectItem>
          </SelectContent>
        </Select>
      )}

      {/* Category Filter */}
      {showCategoryFilter && onCategoryFilterChange && (
        <Select value={categoryFilter} onValueChange={(v) => onCategoryFilterChange(v as CategoryFilter)}>
          <SelectTrigger className={cn("h-9 text-xs sm:text-sm", isMobile ? "w-full" : "w-[120px] sm:w-[140px]")}>
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent portal={!isMobile}>
            <SelectItem value="all">All Categories</SelectItem>
            <SelectItem value="forex">Forex</SelectItem>
            <SelectItem value="crypto">Crypto</SelectItem>
            <SelectItem value="metals">Metals</SelectItem>
            <SelectItem value="indices">Indices</SelectItem>
            <SelectItem value="commodities">Commodities</SelectItem>
          </SelectContent>
        </Select>
      )}

      {/* Result Filter (for History) */}
      {showResultFilter && onResultFilterChange && (
        <Select value={resultFilter} onValueChange={(v) => onResultFilterChange(v as ResultFilter)}>
          <SelectTrigger className={cn("h-9 text-xs sm:text-sm", isMobile ? "w-full" : "w-[120px] sm:w-[140px]")}>
            <SelectValue placeholder="Result" />
          </SelectTrigger>
          <SelectContent portal={!isMobile}>
            <SelectItem value="all">All Results</SelectItem>
            <SelectItem value="win">Wins</SelectItem>
            <SelectItem value="loss">Losses</SelectItem>
            <SelectItem value="breakeven">Breakeven</SelectItem>
          </SelectContent>
        </Select>
      )}

      {/* Clear Filters */}
      {hasActiveFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onClearFilters}
          className={cn("h-9 text-xs sm:text-sm text-muted-foreground hover:text-foreground", isMobile && "w-full")}
        >
          <X className="w-3.5 h-3.5 mr-1" />
          Clear All Filters
        </Button>
      )}
    </div>
  );
}
