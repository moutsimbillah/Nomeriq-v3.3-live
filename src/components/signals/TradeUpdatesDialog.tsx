import { useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell } from "lucide-react";
import { SignalTakeProfitUpdate, UserTrade } from "@/types/database";

interface TradeUpdatesDialogProps {
  trade: UserTrade;
  updates: SignalTakeProfitUpdate[];
  hasUnseen?: boolean;
  unseenCount?: number;
  onViewed?: () => void;
}

const calculateRR = (trade: UserTrade, tpPrice: number): number => {
  const signal = trade.signal;
  const entry = signal?.entry_price || 0;
  const sl = signal?.stop_loss || 0;
  if (!signal || entry === 0) return 1;

  if (signal.direction === "BUY") {
    if (entry - sl === 0) return 1;
    return Math.abs((tpPrice - entry) / (entry - sl));
  }
  if (sl - entry === 0) return 1;
  return Math.abs((entry - tpPrice) / (sl - entry));
};

export const TradeUpdatesDialog = ({
  trade,
  updates,
  hasUnseen = false,
  unseenCount = 0,
  onViewed,
}: TradeUpdatesDialogProps) => {
  const rows = useMemo(() => {
    const initialRisk = trade.initial_risk_amount ?? trade.risk_amount;
    let remainingPercent = 100;

    return updates.map((u) => {
      const cappedClosePercent = Math.max(0, Math.min(remainingPercent, u.close_percent));
      remainingPercent = Math.max(0, remainingPercent - cappedClosePercent);

      const rr = calculateRR(trade, u.tp_price);
      const realizedProfit = initialRisk * (cappedClosePercent / 100) * rr;

      return {
        ...u,
        rr,
        cappedClosePercent,
        realizedProfit,
      };
    });
  }, [updates, trade]);

  if (updates.length === 0) {
    return (
      <Button size="sm" variant="ghost" disabled className="opacity-50">
        <Bell className="w-4 h-4" />
      </Button>
    );
  }

  const displayCount = unseenCount > 0 ? unseenCount : updates.length;

  return (
    <Dialog
      onOpenChange={(open) => {
        if (open) {
          onViewed?.();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className={
            hasUnseen
              ? "border-primary/60 text-primary hover:bg-primary/10 ring-1 ring-primary/40 animate-[pulse_2.2s_ease-in-out_infinite]"
              : "border-primary/30 text-primary hover:bg-primary/10"
          }
        >
          <Bell className="w-4 h-4 mr-1" />
          <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
            {displayCount}
          </Badge>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader className="pr-10">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <DialogTitle>Trade Update</DialogTitle>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="outline" className="font-mono">Pair: {trade.signal?.pair ?? "-"}</Badge>
              <Badge variant="outline" className="font-mono">Entry: {trade.signal?.entry_price ?? "-"}</Badge>
              <Badge variant="outline" className="font-mono">SL: {trade.signal?.stop_loss ?? "-"}</Badge>
              <Badge variant="outline" className="font-mono">TP: {trade.signal?.take_profit ?? "-"}</Badge>
            </div>
          </div>
        </DialogHeader>
        <div className="space-y-2">
          {rows.map((row) => (
            <div key={row.id} className="rounded-lg border border-border/50 p-3">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <Badge variant="outline">{row.tp_label}</Badge>
                <span className="text-sm font-mono">TP: {row.tp_price}</span>
                <span className="text-sm text-primary font-semibold">Close: {row.cappedClosePercent.toFixed(2)}%</span>
                <span className="text-sm text-success font-semibold">+${row.realizedProfit.toFixed(2)}</span>
              </div>
              {row.note && <p className="text-xs text-muted-foreground">{row.note}</p>}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};
