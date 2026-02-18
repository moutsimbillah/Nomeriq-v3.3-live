import { useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, Info } from "lucide-react";
import { SignalTakeProfitUpdate, UserTrade } from "@/types/database";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/contexts/AuthContext";
import { calculateSignedSignalRrForTarget } from "@/lib/trade-math";
import { cn } from "@/lib/utils";

interface TradeUpdatesDialogProps {
  trade: UserTrade;
  updates: SignalTakeProfitUpdate[];
  hasUnseen?: boolean;
  unseenCount?: number;
  onViewed?: () => void;
}

const calculateRR = (trade: UserTrade, tpPrice: number): number => {
  const signal = trade.signal;
  if (!signal) return 0;
  return calculateSignedSignalRrForTarget(signal, tpPrice);
};

export const TradeUpdatesDialog = ({
  trade,
  updates,
  hasUnseen = false,
  unseenCount = 0,
  onViewed,
}: TradeUpdatesDialogProps) => {
  const { profile } = useAuth();
  const { rows, fallbackRemainingPercent, fallbackRemainingRisk } = useMemo(() => {
    const initialRisk = Number(trade.initial_risk_amount ?? trade.risk_amount ?? 0);
    let runningRemainingRisk = Math.max(0, initialRisk);

    const computedRows = updates.map((u) => {
      const beforeRiskAmount = runningRemainingRisk;
      const beforePercent = initialRisk > 0 ? (beforeRiskAmount / initialRisk) * 100 : 0;
      const closePercent = Math.max(0, Math.min(100, Number(u.close_percent || 0)));
      const reducedRisk = runningRemainingRisk * (closePercent / 100);
      let remainingAfterRisk = Math.max(0, runningRemainingRisk - reducedRisk);
      if (closePercent >= 100) {
        remainingAfterRisk = 0;
      }

      const rr = calculateRR(trade, u.tp_price);
      const realizedProfit = reducedRisk * rr;
      const remainingAfterPercent =
        initialRisk > 0
          ? (remainingAfterRisk / initialRisk) * 100
          : 0;
      const closedPercentOfOriginal =
        initialRisk > 0 ? (reducedRisk / initialRisk) * 100 : 0;
      runningRemainingRisk = remainingAfterRisk;

      return {
        ...u,
        rr,
        closePercent,
        remainingAfterPercent,
        beforeRiskAmount,
        beforePercent,
        closedRiskAmount: reducedRisk,
        closedPercentOfOriginal,
        remainingAfterRisk,
        realizedProfit,
      };
    });

    return {
      rows: computedRows,
      fallbackRemainingPercent:
        initialRisk > 0
          ? (runningRemainingRisk / initialRisk) * 100
          : 0,
      fallbackRemainingRisk: runningRemainingRisk,
    };
  }, [updates, trade]);

  const initialRisk = Number(trade.initial_risk_amount ?? trade.risk_amount ?? 0);
  const remainingRisk = Math.max(
      0,
      Number(
        trade.remaining_risk_amount ??
          fallbackRemainingRisk
      )
    );
  const remainingPercent =
    initialRisk > 0 ? (remainingRisk / initialRisk) * 100 : fallbackRemainingPercent;
  const rawAccountBalance = profile?.account_balance;
  const hasAccountBalance = rawAccountBalance !== null && rawAccountBalance !== undefined;
  const accountBalanceText = hasAccountBalance
    ? `$${Number(rawAccountBalance).toFixed(2)}`
    : "Not set";
  const entryPrice = Number(trade.signal?.entry_price);
  const stopLossPrice = Number(trade.signal?.stop_loss);
  const hasBreakevenUpdate =
    trade.result === "pending" &&
    Number.isFinite(entryPrice) &&
    Number.isFinite(stopLossPrice) &&
    Math.abs(stopLossPrice - entryPrice) < 1e-8;
  const tradeRiskPercent = Math.max(0, Number(trade.risk_percent ?? 0));
  const tradeRiskAmount = Math.max(0, Number(trade.initial_risk_amount ?? trade.risk_amount ?? 0));
  const tooltipRows = rows.slice(0, 4);

  if (updates.length === 0 && !hasBreakevenUpdate) {
    return (
      <Button size="sm" variant="ghost" disabled className="opacity-50">
        <Bell className="w-4 h-4" />
      </Button>
    );
  }

  const displayCount = unseenCount > 0 ? unseenCount : updates.length + (hasBreakevenUpdate ? 1 : 0);

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
          <div className="rounded-lg border border-border/50 bg-secondary/20 p-3 text-sm flex items-start justify-between gap-3">
            <div>
              <span className="text-muted-foreground">Remaining Position: </span>
              <span className="font-semibold text-foreground">{remainingPercent.toFixed(2)}%</span>
              <span className="text-muted-foreground"> (</span>
              <span className="font-semibold text-foreground">${remainingRisk.toFixed(2)}</span>
              <span className="text-muted-foreground">)</span>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="mt-0.5 text-muted-foreground/80 hover:text-muted-foreground transition-colors"
                  aria-label="Trade update calculation info"
                >
                  <Info className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent
                side="top"
                align="end"
                className="w-[30rem] max-w-[90vw] p-0 overflow-hidden border border-border bg-popover text-popover-foreground shadow-xl text-xs"
              >
                <div className="p-3 border-b border-border/40">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Trade Math Breakdown</p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <div className="rounded-md border border-border/40 bg-secondary/20 px-2.5 py-2">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Account Balance</p>
                      <p className="font-semibold text-foreground mt-0.5">{accountBalanceText}</p>
                    </div>
                    <div className="rounded-md border border-border/40 bg-secondary/20 px-2.5 py-2">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Trade Risk</p>
                      <p className="font-semibold text-foreground mt-0.5">
                        {tradeRiskPercent.toFixed(2)}% (${tradeRiskAmount.toFixed(2)})
                      </p>
                    </div>
                  </div>
                </div>

                <div className="p-3 space-y-2.5">
                  <div className="rounded-md border border-border/40 bg-secondary/15 px-2.5 py-2">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Using Your Case</p>
                    <p className="font-medium text-foreground">Start: 100.00% (${tradeRiskAmount.toFixed(2)}) risk open</p>
                  </div>

                  {tooltipRows.map((row) => (
                    <div key={`tooltip-${row.id}`} className="rounded-md border border-border/40 bg-secondary/10 px-2.5 py-2 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold text-foreground">{row.tp_label}</p>
                        <p className="text-muted-foreground text-[11px]">
                          Close {row.closePercent.toFixed(2)}% of remaining
                        </p>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Remaining before: {row.beforePercent.toFixed(2)}% (${row.beforeRiskAmount.toFixed(2)})
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 text-[11px]">
                        <div className="rounded border border-border/40 px-2 py-1.5">
                          <p className="text-muted-foreground">Closed Risk</p>
                          <p className="font-semibold text-foreground">
                            {row.closedPercentOfOriginal.toFixed(2)}% (${row.closedRiskAmount.toFixed(2)})
                          </p>
                        </div>
                        <div className="rounded border border-border/40 px-2 py-1.5">
                          <p className="text-muted-foreground">Realized Profit</p>
                          <p
                            className={cn(
                              "font-semibold",
                              row.realizedProfit >= 0 ? "text-success" : "text-destructive"
                            )}
                          >
                            {row.realizedProfit >= 0 ? "+" : ""}${row.realizedProfit.toFixed(2)}
                          </p>
                        </div>
                        <div className="rounded border border-border/40 px-2 py-1.5">
                          <p className="text-muted-foreground">Remaining</p>
                          <p className="font-semibold text-foreground">
                            {row.remainingAfterPercent.toFixed(2)}% (${row.remainingAfterRisk.toFixed(2)})
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}

                  {rows.length > tooltipRows.length && (
                    <p className="text-[11px] text-muted-foreground">... {rows.length - tooltipRows.length} more update(s)</p>
                  )}

                  <div className="rounded-md border border-primary/30 bg-primary/10 px-2.5 py-2">
                    <p className="text-[10px] uppercase tracking-wide text-primary">Now Remaining</p>
                    <p className="font-bold text-foreground mt-0.5">
                      {remainingPercent.toFixed(2)}% (${remainingRisk.toFixed(2)})
                    </p>
                  </div>
                </div>
              </TooltipContent>
            </Tooltip>
          </div>
          {rows.map((row) => (
            <div key={row.id} className="rounded-lg border border-border/50 p-3">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <Badge variant="outline">{row.tp_label}</Badge>
                <span className="text-sm font-mono">TP: {row.tp_price}</span>
                <span className="text-sm text-primary font-semibold">Close: {row.closePercent.toFixed(2)}%</span>
                <span
                  className={cn(
                    "text-sm font-semibold",
                    row.realizedProfit >= 0 ? "text-success" : "text-destructive"
                  )}
                >
                  {row.realizedProfit >= 0 ? "+" : ""}${row.realizedProfit.toFixed(2)}
                </span>
                <span className="text-xs text-muted-foreground">Remaining: {row.remainingAfterPercent.toFixed(2)}%</span>
              </div>
              {row.note && <p className="text-xs text-muted-foreground">{row.note}</p>}
            </div>
          ))}
          {hasBreakevenUpdate && (
            <div className="rounded-lg border border-warning/30 bg-warning/10 p-3">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <Badge variant="outline" className="border-warning/40 text-warning">Risk Update</Badge>
                <span className="text-sm font-semibold text-warning">SL moved to break-even</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Stop loss now equals entry price, so downside risk is protected at 0R.
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
