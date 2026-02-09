import { useState } from "react";
import { Bell, ArrowUpRight, ArrowDownRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useTrades } from "@/hooks/useTrades";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useNavigate } from "react-router-dom";

interface NotificationButtonProps {
  className?: string;
}

export const NotificationButton = ({ className }: NotificationButtonProps) => {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { trades, isLoading } = useTrades({
    result: "pending",
    realtime: true,
  });

  const handleViewAll = () => {
    setOpen(false);
    navigate("/active-trades");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn("relative", className)}
          aria-label="View notifications"
        >
          <Bell className="w-5 h-5" />
          {trades.length > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-primary text-primary-foreground text-xs font-medium rounded-full flex items-center justify-center">
              {trades.length > 9 ? "9+" : trades.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-80 p-0 bg-popover border-border"
        align="end"
        sideOffset={14}
      >
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="font-semibold">Active Trades</h3>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => setOpen(false)}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        <ScrollArea className="max-h-[400px]">
          {isLoading ? (
            <div className="p-4 text-center text-muted-foreground">
              Loading...
            </div>
          ) : trades.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <Bell className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>No active trades</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {trades.slice(0, 5).map((trade) => {
                const signal = trade.signal;
                return (
                  <div
                    key={trade.id}
                    className="p-4 hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={cn(
                          "p-2 rounded-lg flex-shrink-0",
                          signal?.direction === "BUY"
                            ? "bg-success/20"
                            : "bg-destructive/20"
                        )}
                      >
                        {signal?.direction === "BUY" ? (
                          <ArrowUpRight className="w-4 h-4 text-success" />
                        ) : (
                          <ArrowDownRight className="w-4 h-4 text-destructive" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{signal?.pair}</span>
                          <Badge variant="outline" className="text-xs">
                            {signal?.category}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-sm">
                          <span
                            className={cn(
                              "font-medium",
                              signal?.direction === "BUY"
                                ? "text-success"
                                : "text-destructive"
                            )}
                          >
                            {signal?.direction}
                          </span>
                          <span className="text-muted-foreground">
                            Entry: {signal?.entry_price}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                          <span>SL: {signal?.stop_loss}</span>
                          <span>TP: {signal?.take_profit}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>

        {trades.length > 0 && (
          <div className="p-3 border-t border-border">
            <Button
              variant="outline"
              className="w-full"
              onClick={handleViewAll}
            >
              View All Active Trades ({trades.length})
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};
