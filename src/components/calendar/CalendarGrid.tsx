import { format, getWeek, isSameDay, isToday } from "date-fns";
import { cn } from "@/lib/utils";
interface DayData {
  date: Date;
  trades: number;
  pnl: number;
  isCurrentMonth: boolean;
}
interface WeekData {
  weekNumber: number;
  trades: number;
  pnl: number;
}
interface CalendarGridProps {
  calendarDays: DayData[];
  weekData: Map<number, WeekData>;
  selectedDate: Date | null;
  onSelectDate: (date: Date | null) => void;
  onOpenDayModal: (date: Date) => void;
  currentMonth: Date;
}
const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
export const CalendarGrid = ({
  calendarDays,
  weekData,
  selectedDate,
  onSelectDate,
  onOpenDayModal,
  currentMonth
}: CalendarGridProps) => {
  // Group days into weeks
  const allWeeks: DayData[][] = [];
  for (let i = 0; i < calendarDays.length; i += 7) {
    allWeeks.push(calendarDays.slice(i, i + 7));
  }

  // Filter out the last week if all its days are from outside the current month
  const weeks = allWeeks.filter((week, index) => {
    // Always keep if not the last week
    if (index < allWeeks.length - 1) return true;
    // For the last week, keep only if at least one day is in the current month
    return week.some(day => day.isCurrentMonth);
  });
  const getWeekSummary = (weekDays: DayData[]) => {
    // Get the week number from the first day of the week that's in current month
    const dayInMonth = weekDays.find(d => d.isCurrentMonth) || weekDays[0];
    const weekNum = getWeek(dayInMonth.date, {
      weekStartsOn: 0
    });
    return weekData.get(weekNum) || {
      weekNumber: weekNum,
      trades: 0,
      pnl: 0
    };
  };
  return <div className="glass-card overflow-hidden ml-1 px-0 mx-0 py-0 pt-0 pb-0 my-[13px] shadow-none">
      {/* Header row with weekdays + WEEK */}
      <div className="grid grid-cols-8 pb-0 mb-[8px] bg-transparent border-black/0">
        {WEEKDAYS.map(day => <div key={day} className="py-3 text-center text-xs font-medium text-muted-foreground my-[4px] mx-[4px] px-0 rounded-xl bg-black/0">
            {day}
          </div>)}
        <div className="py-3 text-center text-xs font-medium text-muted-foreground">
          WEEK
        </div>
      </div>

      {/* Calendar weeks */}
      {weeks.map((week, weekIndex) => {
      const weekSummary = getWeekSummary(week);
      const weekNum = weekIndex + 1;
      return <div key={weekIndex} className="grid grid-cols-8 border-t border-0 border-black/0 mx-[8px] my-[2px]">
            {/* Days */}
            {week.map((day, dayIndex) => {
          const isSelected = selectedDate && isSameDay(day.date, selectedDate);
          const isCurrentDay = isToday(day.date);
          const hasData = day.trades > 0;
          const isProfit = day.pnl > 0;
          const isLoss = day.pnl < 0;
          return <div key={dayIndex} onClick={() => {
            if (!hasData) {
              onSelectDate(null);
              return;
            }
            onSelectDate(day.date);
            onOpenDayModal(day.date);
          }} className={cn("min-h-[80px] p-2 border-r cursor-pointer transition-all duration-200 hover:bg-secondary/40 border-secondary-foreground border-solid opacity-100 rounded-xl mx-px my-px px-[9px] py-[7px] border-0", !day.isCurrentMonth && "opacity-40", hasData && isProfit && "bg-success/10", hasData && isLoss && "bg-destructive/10", isSelected && "ring-2 ring-success ring-inset", isCurrentDay && !isSelected && "ring-1 ring-primary/50 ring-inset")}>
                  <div className="flex flex-col h-full">
                    <span className={cn("text-sm font-medium mb-1 text-center", !day.isCurrentMonth && "text-muted-foreground", isCurrentDay && "text-primary font-bold")}>
                      {format(day.date, "d")}
                    </span>

                    {hasData ? <div className="flex-1 flex flex-col justify-center">
                        <span className={cn("text-xs font-bold font-mono text-center", isProfit ? "text-success" : "text-destructive")}>
                          {isProfit ? "+" : ""}${day.pnl.toFixed(2)}
                        </span>
                        <span className="text-[10px] text-muted-foreground mt-0.5 text-center">
                          {day.trades} trade{day.trades !== 1 ? "s" : ""}
                        </span>
                      </div> : <div className="flex-1 flex items-center justify-center">
                        <span className="text-[10px] text-muted-foreground/50 text-center">
                          No data
                        </span>
                      </div>}
                  </div>
                </div>;
        })}

            {/* Week summary */}
            <div className="min-h-[80px] p-2 flex flex-col justify-center items-center bg-secondary/20 rounded-xl gap-0 ml-[4px]">
              <span className="text-[10px] text-muted-foreground mb-1">
                Week {weekNum}
              </span>
              <span className={cn("text-xs font-bold font-mono", weekSummary.pnl > 0 ? "text-success" : weekSummary.pnl < 0 ? "text-destructive" : "text-muted-foreground")}>
                {weekSummary.pnl >= 0 ? "+" : ""}${weekSummary.pnl.toFixed(2)}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {weekSummary.trades} trades
              </span>
            </div>
          </div>;
    })}
    </div>;
};
