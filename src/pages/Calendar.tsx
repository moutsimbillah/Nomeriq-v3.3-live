import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { CalendarGrid } from "@/components/calendar/CalendarGrid";
import { CalendarAnalyticsPanel } from "@/components/calendar/CalendarAnalyticsPanel";
import { ProfitLossBar } from "@/components/calendar/ProfitLossBar";
import { DayDetailModal } from "@/components/calendar/DayDetailModal";
import { useCalendarTrades } from "@/hooks/useCalendarTrades";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { format, addMonths, subMonths, isSameDay } from "date-fns";
import { cn } from "@/lib/utils";

type ViewMode = "daily" | "monthly";

const Calendar = () => {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>("daily");
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalDate, setModalDate] = useState<Date | null>(null);

  const { calendarDays, weekData, stats, isLoading, profitLossRatio } =
    useCalendarTrades(currentMonth);

  const handlePrevMonth = () => {
    setCurrentMonth(subMonths(currentMonth, 1));
    setSelectedDate(null);
  };

  const handleNextMonth = () => {
    setCurrentMonth(addMonths(currentMonth, 1));
    setSelectedDate(null);
  };

  const handleSelectDate = (date: Date) => {
    if (selectedDate && isSameDay(selectedDate, date)) {
      setSelectedDate(null);
    } else {
      setSelectedDate(date);
    }
  };

  const handleOpenDayModal = (date: Date) => {
    setModalDate(date);
    setModalOpen(true);
  };

  const handleClearSelection = () => {
    setSelectedDate(null);
  };

  // Get selected day data
  const selectedDayData = selectedDate
    ? calendarDays.find((d) => isSameDay(d.date, selectedDate)) || null
    : null;

  // Get modal day data
  const modalDayData = modalDate
    ? calendarDays.find((d) => isSameDay(d.date, modalDate)) || null
    : null;

  return (
    <DashboardLayout title="Trading Performance Calendar">
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Main Calendar Section */}
        <div className="flex-1 space-y-4">
          {/* Header with navigation and toggle */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="text-sm text-muted-foreground">
                Visual overview of your trading results
              </p>
            </div>

            {/* View Toggle */}
            <div className="flex items-center gap-2">
              <div className="flex items-center rounded-lg overflow-hidden border border-border">
                <Button
                  variant={viewMode === "daily" ? "default" : "ghost"}
                  size="sm"
                  className={cn(
                    "rounded-none h-8 px-4",
                    viewMode === "daily" && "bg-primary text-primary-foreground"
                  )}
                  onClick={() => setViewMode("daily")}
                >
                  Daily
                </Button>
                <Button
                  variant={viewMode === "monthly" ? "default" : "ghost"}
                  size="sm"
                  className={cn(
                    "rounded-none h-8 px-4",
                    viewMode === "monthly" && "bg-primary text-primary-foreground"
                  )}
                  onClick={() => setViewMode("monthly")}
                >
                  Monthly
                </Button>
              </div>
            </div>
          </div>

          {/* Month Navigation */}
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="icon"
              onClick={handlePrevMonth}
              className="h-8 w-8"
            >
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <h2 className="text-lg font-semibold">
              {format(currentMonth, "MMMM yyyy")}
            </h2>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleNextMonth}
              className="h-8 w-8"
            >
              <ChevronRight className="w-5 h-5" />
            </Button>
          </div>

          {/* Profit/Loss Gradient Bar */}
          <ProfitLossBar ratio={profitLossRatio} />

          {/* Calendar Grid */}
          {viewMode === "daily" ? (
            <CalendarGrid
              calendarDays={calendarDays}
              weekData={weekData}
              selectedDate={selectedDate}
              onSelectDate={handleSelectDate}
              onOpenDayModal={handleOpenDayModal}
              currentMonth={currentMonth}
            />
          ) : (
            <div className="glass-card p-6 text-center text-muted-foreground">
              <p>Monthly view coming soon...</p>
              <p className="text-sm mt-2">
                Switch to Daily view to see your trading calendar
              </p>
            </div>
          )}
        </div>

        {/* Analytics Panel */}
        <div className="w-full lg:w-80 shrink-0">
          <CalendarAnalyticsPanel
            stats={stats}
            selectedDay={selectedDayData}
            onClearSelection={handleClearSelection}
            onOpenDayModal={handleOpenDayModal}
            isLoading={isLoading}
          />
        </div>
      </div>

      {/* Day Detail Modal */}
      {modalDate && modalDayData && (
        <DayDetailModal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          date={modalDate}
          dayPnl={modalDayData.pnl}
          dayTrades={modalDayData.trades}
        />
      )}
    </DashboardLayout>
  );
};

export default Calendar;
