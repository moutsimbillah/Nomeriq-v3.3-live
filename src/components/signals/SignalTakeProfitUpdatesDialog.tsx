import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Bell, Plus, Trash2 } from "lucide-react";
import { Signal } from "@/types/database";
import {
  createSignalTakeProfitUpdates,
  useSignalTakeProfitUpdates,
} from "@/hooks/useSignalTakeProfitUpdates";
import type { CreateTakeProfitUpdateInput } from "@/hooks/useSignalTakeProfitUpdates";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useBrand } from "@/contexts/BrandContext";
import { sendTelegramTradeUpdate } from "@/lib/telegram";
import { getSafeErrorMessage } from "@/lib/error-sanitizer";
import { useLivePrices } from "@/hooks/useLivePrices";
import { deriveLiveCloseOutcome, getLiveCloseSnapshot } from "@/lib/live-signal-close";
import { supabase } from "@/integrations/supabase/client";

interface FormRow {
  tpPrice: string;
  closePercent: string;
  note: string;
}

interface SignalTakeProfitUpdatesDialogProps {
  signal: Signal;
  currentUserId: string;
  disabled?: boolean;
}

type TpUpdateMode = "market" | "limit";

interface MarketPriceLock {
  price: number;
  quotedAt: string;
  symbol: string;
  expiresAtMs: number;
}

const calculateRr = (signal: Signal, tpPrice: number): number => {
  const entry = Number(signal.entry_price);
  const sl = Number(signal.stop_loss);
  if (!Number.isFinite(entry) || !Number.isFinite(sl) || !Number.isFinite(tpPrice)) return 0;

  if (signal.direction === "BUY") {
    const risk = entry - sl;
    if (risk === 0) {
      if (tpPrice > entry) return 1;
      if (tpPrice < entry) return -1;
      return 0;
    }
    return (tpPrice - entry) / risk;
  }

  const risk = sl - entry;
  if (risk === 0) {
    if (tpPrice < entry) return 1;
    if (tpPrice > entry) return -1;
    return 0;
  }
  return (entry - tpPrice) / risk;
};

export const SignalTakeProfitUpdatesDialog = ({
  signal,
  currentUserId,
  disabled = false,
}: SignalTakeProfitUpdatesDialogProps) => {
  const { profile } = useAuth();
  const { settings } = useBrand();
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [rows, setRows] = useState<FormRow[]>([{ tpPrice: "", closePercent: "", note: "" }]);
  const [remainingExposure, setRemainingExposure] = useState<number | null>(null);
  const [isRemainingLoading, setIsRemainingLoading] = useState(false);
  const [tpMode, setTpMode] = useState<TpUpdateMode>("limit");
  const [marketPriceLock, setMarketPriceLock] = useState<MarketPriceLock | null>(null);
  const [isLockingMarketPrice, setIsLockingMarketPrice] = useState(false);
  const [lockClockMs, setLockClockMs] = useState(() => Date.now());
  const isLiveSignal = signal.market_mode === "live";
  const isMarketMode = isLiveSignal && tpMode === "market";
  const livePrices = useLivePrices(open && isLiveSignal && signal.pair ? [signal.pair] : []);
  const currentMarketPrice = isLiveSignal ? livePrices[signal.pair] : undefined;
  const currentLiveRr =
    currentMarketPrice != null
      ? deriveLiveCloseOutcome(signal, currentMarketPrice).rr
      : null;
  const currentLivePnlClass =
    currentLiveRr == null
      ? "text-muted-foreground"
      : currentLiveRr >= 0
        ? "text-success"
        : "text-destructive";
  const currentLivePnlLabel =
    currentLiveRr == null ? "--" : `${currentLiveRr >= 0 ? "+" : ""}${currentLiveRr.toFixed(2)}R`;
  const marketLockRemainingMs = marketPriceLock ? Math.max(0, marketPriceLock.expiresAtMs - lockClockMs) : 0;
  const marketLockRemainingSeconds = Math.ceil(marketLockRemainingMs / 1000);
  const marketLockExpired = isMarketMode && (!!marketPriceLock && marketLockRemainingMs <= 0);

  const { updatesBySignal, refetch } = useSignalTakeProfitUpdates({
    signalIds: [signal.id],
    realtime: open,
  });

  const existingUpdates = updatesBySignal[signal.id] || [];
  const publishedRows = useMemo(() => {
    let remainingPercent = 100;
    return existingUpdates.map((u) => {
      const closePct = Math.max(0, Math.min(100, Number(u.close_percent || 0)));
      const effectiveClosed = remainingPercent * (closePct / 100);
      remainingPercent = Math.max(0, remainingPercent - effectiveClosed);
      return {
        ...u,
        remainingAfterPercent: remainingPercent,
      };
    });
  }, [existingUpdates]);
  const remainingCloseCapacityPercent = useMemo(
    () =>
      publishedRows.length > 0
        ? Math.max(0, Number(publishedRows[publishedRows.length - 1].remainingAfterPercent || 0))
        : 100,
    [publishedRows]
  );

  const fetchRemainingExposure = useCallback(async () => {
    setIsRemainingLoading(true);
    try {
      const { data, error } = await supabase
        .from("user_trades")
        .select("remaining_risk_amount")
        .eq("signal_id", signal.id)
        .eq("result", "pending");

      if (error) throw error;

      const totalRemaining = (data || []).reduce(
        (sum, row: { remaining_risk_amount?: number | null }) =>
          sum + Number(row.remaining_risk_amount || 0),
        0
      );
      setRemainingExposure(totalRemaining);
    } catch (err) {
      console.error("Error fetching remaining exposure:", err);
      setRemainingExposure(null);
    } finally {
      setIsRemainingLoading(false);
    }
  }, [signal.id]);

  useEffect(() => {
    if (!open) return;
    void fetchRemainingExposure();
  }, [open, fetchRemainingExposure]);
  useEffect(() => {
    if (!open || !isMarketMode) return;
    setLockClockMs(Date.now());
    const timer = setInterval(() => {
      setLockClockMs(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, [open, isMarketMode]);

  const totalPlannedClosePercent = useMemo(
    () =>
      rows.reduce((sum, row) => {
        const pct = Number(row.closePercent);
        return sum + (Number.isFinite(pct) ? pct : 0);
      }, 0),
    [rows]
  );

  const riskPercent = settings?.global_risk_percent ?? 2;
  const accountBalance = profile?.account_balance ?? null;
  const riskAmountUsd =
    typeof accountBalance === "number" && accountBalance > 0
      ? (accountBalance * riskPercent) / 100
      : null;

  const addRow = () => {
    if (isMarketMode) return;
    setRows((prev) => [...prev, { tpPrice: "", closePercent: "", note: "" }]);
  };

  const removeRow = (index: number) => {
    if (isMarketMode) return;
    setRows((prev) => prev.filter((_, i) => i !== index));
  };

  const setRow = (index: number, key: keyof FormRow, value: string) => {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, [key]: value } : row)));
  };

  const resetForm = useCallback(
    (mode: TpUpdateMode = tpMode) => {
      setRows([
        {
          tpPrice:
            mode === "market" && marketPriceLock ? marketPriceLock.price.toString() : "",
          closePercent: "",
          note: "",
        },
      ]);
    },
    [tpMode, marketPriceLock]
  );

  const lockMarketPrice = useCallback(async (): Promise<MarketPriceLock | null> => {
    if (!isLiveSignal) return null;

    setIsLockingMarketPrice(true);
    try {
      const snapshot = await getLiveCloseSnapshot(signal);
      const nextLock: MarketPriceLock = {
        price: Number(snapshot.closePrice),
        quotedAt: snapshot.closeQuotedAt,
        symbol: snapshot.symbol,
        expiresAtMs: Date.now() + 15000,
      };
      setMarketPriceLock(nextLock);
      setRows((prev) => {
        const first = prev[0] || { tpPrice: "", closePercent: "", note: "" };
        return [{ ...first, tpPrice: nextLock.price.toString() }];
      });
      return nextLock;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to fetch market price.";
      toast.error(getSafeErrorMessage(msg, "Failed to lock current market price."));
      return null;
    } finally {
      setIsLockingMarketPrice(false);
    }
  }, [isLiveSignal, signal]);

  const ensureFreshMarketLock = useCallback(async (): Promise<MarketPriceLock | null> => {
    if (!isMarketMode) return null;
    if (marketPriceLock && marketPriceLock.expiresAtMs > Date.now()) {
      return marketPriceLock;
    }
    return lockMarketPrice();
  }, [isMarketMode, marketPriceLock, lockMarketPrice]);

  useEffect(() => {
    if (!open || !isMarketMode) return;
    setRows((prev) => {
      const first = prev[0] || { tpPrice: "", closePercent: "", note: "" };
      return [
        {
          ...first,
          tpPrice:
            marketPriceLock?.price != null
              ? marketPriceLock.price.toString()
              : first.tpPrice,
        },
      ];
    });
    if (!marketPriceLock || marketPriceLock.expiresAtMs <= Date.now()) {
      void lockMarketPrice();
    }
  }, [open, isMarketMode, marketPriceLock?.price, marketPriceLock?.expiresAtMs, lockMarketPrice]);

  const publishRows = useCallback(
    async (
      parsed: CreateTakeProfitUpdateInput[],
      options?: {
        successMessage?: string;
        closeDialog?: boolean;
      }
    ) => {
      setIsSubmitting(true);
      try {
        await createSignalTakeProfitUpdates(signal.id, currentUserId, parsed);
        await refetch();
        await fetchRemainingExposure();

        if (signal.send_updates_to_telegram) {
          for (const row of parsed) {
            const res = await sendTelegramTradeUpdate({
              signal: {
                pair: signal.pair,
                category: signal.category,
                direction: signal.direction,
                entry_price: signal.entry_price,
                stop_loss: signal.stop_loss,
                take_profit: signal.take_profit,
                tp_label: row.tpLabel,
                tp_price: row.tpPrice,
                close_percent: row.closePercent,
                note: row.note,
              },
            });
            if (res.ok === false) {
              toast.error(
                getSafeErrorMessage(res.error, "Unable to send Telegram update right now.")
              );
              break;
            }
          }
        }

        toast.success(options?.successMessage || "Trade update(s) published.");

        if (options?.closeDialog === false) {
          resetForm("market");
        } else {
          resetForm("limit");
          setTpMode("limit");
          setMarketPriceLock(null);
          setOpen(false);
        }
      } catch (err) {
        console.error("Error creating TP updates:", err);
        const msg = err instanceof Error ? err.message : "Failed to publish updates.";
        const normalized = msg.toLowerCase();
        if (
          normalized.includes("relation") && normalized.includes("signal_take_profit_updates")
        ) {
          toast.error("Database migration not applied: signal_take_profit_updates table is missing.");
        } else if (normalized.includes("no remaining open position")) {
          toast.error("Cannot add trade update: no remaining open position for this signal.");
        } else if (normalized.includes("row-level security") || normalized.includes("permission")) {
          toast.error("Permission denied to publish updates for this signal.");
        } else {
          toast.error(getSafeErrorMessage(msg, "Failed to publish updates. Please try again."));
        }
      } finally {
        setIsSubmitting(false);
      }
    },
    [signal, currentUserId, refetch, fetchRemainingExposure, resetForm]
  );

  const handleSubmit = async () => {
    if (isMarketMode) {
      toast.error("Publish is disabled in Market mode. Use the Close button.");
      return;
    }

    if (typeof remainingExposure === "number" && remainingExposure <= 0) {
      toast.error("Cannot publish update: this signal has no remaining open position.");
      return;
    }

    const signalEntry = Number(signal.entry_price);
    if (!Number.isFinite(signalEntry)) {
      toast.error("Signal entry is missing. Please update the base signal first.");
      return;
    }

    const parsed = rows.map((row, i) => ({
      tpLabel: `TP ${existingUpdates.length + i + 1}`,
      tpPrice: Number(row.tpPrice),
      closePercent: Number(row.closePercent),
      note: row.note,
    }));

    const hasInvalid = parsed.some(
      (row) =>
        !Number.isFinite(row.tpPrice) ||
        row.tpPrice <= 0 ||
        !Number.isFinite(row.closePercent) ||
        row.closePercent <= 0 ||
        row.closePercent > 100
    );

    if (hasInvalid) {
      toast.error("Please provide valid TP price and close percent (0-100).");
      return;
    }

    if (totalPlannedClosePercent > remainingCloseCapacityPercent + 0.0001) {
      toast.error(
        `Planned close cannot exceed remaining position (${remainingCloseCapacityPercent.toFixed(
          2
        )}%).`
      );
      return;
    }

    const hasInvalidTpByDirection = parsed.some((row) => {
      if (signal.direction === "BUY") {
        // BUY: TP updates must stay on profitable side of the entry.
        // They can be below or above original TP, but must be strictly above entry.
        return row.tpPrice <= signalEntry;
      }
      // SELL: TP updates must stay on profitable side of the entry.
      // They can be above or below original TP, but must be strictly below entry.
      return row.tpPrice >= signalEntry;
    });

    if (hasInvalidTpByDirection) {
      if (signal.direction === "BUY") {
        toast.error(`For BUY signals, TP updates must be strictly higher than the original entry price (${signalEntry}).`);
      } else {
        toast.error(`For SELL signals, TP updates must be strictly lower than the original entry price (${signalEntry}).`);
      }
      return;
    }

    // Enforce ordered TP ladder:
    // BUY: next TP must be > previous TP
    // SELL: next TP must be < previous TP
    const publishedTpPrices = existingUpdates
      .map((u) => Number(u.tp_price))
      .filter((n) => Number.isFinite(n));
    let previousTp: number | null =
      publishedTpPrices.length > 0
        ? publishedTpPrices[publishedTpPrices.length - 1]
        : null;
    const hasInvalidOrder = parsed.some((row) => {
      const invalid =
        previousTp === null
          ? false
          : signal.direction === "BUY"
            ? row.tpPrice <= previousTp
            : row.tpPrice >= previousTp;
      previousTp = row.tpPrice;
      return invalid;
    });

    if (hasInvalidOrder) {
      if (signal.direction === "BUY") {
        toast.error("Invalid TP order: each next TP price must be strictly higher than the previous TP.");
      } else {
        toast.error("Invalid TP order: each next TP price must be strictly lower than the previous TP.");
      }
      return;
    }

    await publishRows(parsed);
  };

  const handleMarketClose = async () => {
    if (!isMarketMode) return;

    if (typeof remainingExposure === "number" && remainingExposure <= 0) {
      toast.error("Cannot close: this signal has no remaining open position.");
      return;
    }

    const firstRow = rows[0];
    const closePercent = Number(firstRow?.closePercent);
    if (!Number.isFinite(closePercent) || closePercent <= 0 || closePercent > 100) {
      toast.error("Close % is required and must be between 0 and 100.");
      return;
    }

    if (closePercent > remainingCloseCapacityPercent + 0.0001) {
      toast.error(
        `Close % cannot exceed remaining position (${remainingCloseCapacityPercent.toFixed(2)}%).`
      );
      return;
    }

    const lock = await ensureFreshMarketLock();
    if (!lock) {
      return;
    }

    const parsed: CreateTakeProfitUpdateInput[] = [
      {
        tpLabel: `TP ${existingUpdates.length + 1}`,
        tpPrice: Number(lock.price),
        closePercent,
        note: firstRow?.note || "",
      },
    ];

    await publishRows(parsed, {
      successMessage: "Market close update published.",
      closeDialog: false,
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setTpMode("limit");
          setMarketPriceLock(null);
          setRows([{ tpPrice: "", closePercent: "", note: "" }]);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          disabled={disabled}
          className={cn(
            "border-primary/30 text-primary",
            disabled ? "opacity-50 cursor-not-allowed" : "hover:bg-primary/10"
          )}
        >
          <Bell className="w-4 h-4 mr-1" />
          Update
          {existingUpdates.length > 0 && (
            <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-[10px]">
              {existingUpdates.length}
            </Badge>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader className="pr-10">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <DialogTitle>Trade Update</DialogTitle>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="outline" className="font-mono">Pair: {signal.pair}</Badge>
              <Badge variant="outline" className="font-mono">Entry: {signal.entry_price ?? "-"}</Badge>
              <Badge variant="outline" className="font-mono">SL: {signal.stop_loss ?? "-"}</Badge>
              <Badge variant="outline" className="font-mono">TP: {signal.take_profit ?? "-"}</Badge>
            </div>
          </div>
          <DialogDescription>
            {isMarketMode
              ? "Market mode: TP price is locked from the live quote for 15 seconds. Set Close % and note, then press Close."
              : "Add TP updates (TP1, TP2, TP3...) with price and close percentage."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {isLiveSignal && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="outline" className="font-mono">
                Current: {currentMarketPrice != null ? currentMarketPrice.toFixed(5) : "--"}
              </Badge>
              <Badge variant="outline" className={cn("font-mono", currentLivePnlClass)}>
                Live P&amp;L: {currentLivePnlLabel}
              </Badge>
            </div>
          )}

          {isLiveSignal && (
            <div className="rounded-xl border border-border/50 p-3 bg-secondary/20">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs uppercase tracking-wide text-muted-foreground">
                    TP Update Type
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant={isMarketMode ? "default" : "outline"}
                    onClick={() => {
                      setTpMode("market");
                      if (!marketPriceLock || marketPriceLock.expiresAtMs <= Date.now()) {
                        void lockMarketPrice();
                      }
                    }}
                    disabled={isSubmitting}
                    className={cn(isMarketMode && "pointer-events-none")}
                  >
                    Market
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={!isMarketMode ? "default" : "outline"}
                    onClick={() => setTpMode("limit")}
                    disabled={isSubmitting}
                    className={cn(!isMarketMode && "pointer-events-none")}
                  >
                    Limit
                  </Button>
                </div>

                {isMarketMode && (
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-mono">
                      Locked: {marketPriceLock ? marketPriceLock.price.toFixed(5) : "--"}
                    </span>
                    {marketPriceLock && (
                      <span className="font-mono">
                        ({marketPriceLock.symbol})
                      </span>
                    )}
                    {marketPriceLock?.quotedAt && (
                      <span className="font-mono">
                        {new Date(marketPriceLock.quotedAt).toLocaleTimeString()}
                      </span>
                    )}
                    <span>
                      {isLockingMarketPrice
                        ? "Locking..."
                        : marketLockExpired
                          ? "Expired"
                          : `Expires in ${marketLockRemainingSeconds}s`}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void lockMarketPrice()}
                      disabled={isLockingMarketPrice || isSubmitting}
                    >
                      Refresh Price
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={addRow}
              disabled={
                isMarketMode ||
                isRemainingLoading ||
                (typeof remainingExposure === "number" && remainingExposure <= 0)
              }
              title={isMarketMode ? "Disabled in Market mode. Close one TP at a time." : undefined}
            >
              <Plus className="w-4 h-4 mr-1" />
              Add TP
            </Button>
          </div>

          {typeof remainingExposure === "number" && (
            <div
              className={cn(
                "rounded-lg border px-3 py-2 text-sm",
                remainingExposure > 0
                  ? "border-success/30 bg-success/10 text-success"
                  : "border-warning/30 bg-warning/10 text-warning"
              )}
            >
              Remaining open exposure: <span className="font-semibold">${remainingExposure.toFixed(2)}</span>
              {remainingExposure <= 0 && (
                <span className="ml-2">No further TP updates can be published.</span>
              )}
            </div>
          )}

          {existingUpdates.length > 0 && (
            <div className="rounded-xl border border-border/50 p-3">
              <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wide">Published Updates</p>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {publishedRows.map((u) => (
                  <div key={u.id} className="flex flex-wrap items-center gap-2 text-sm rounded-lg bg-secondary/30 px-3 py-2">
                    <Badge variant="outline">{u.tp_label}</Badge>
                    <span className="font-mono">Price: {u.tp_price}</span>
                    <span className="font-medium text-primary">Close: {u.close_percent}%</span>
                    {riskAmountUsd !== null ? (() => {
                      const realizedPnl =
                        riskAmountUsd *
                        (u.close_percent / 100) *
                        calculateRr(signal, Number(u.tp_price));
                      return (
                        <span
                          className={cn(
                            "font-medium",
                            realizedPnl >= 0 ? "text-success" : "text-destructive"
                          )}
                        >
                          Profit: {realizedPnl >= 0 ? "+" : ""}${realizedPnl.toFixed(2)}
                        </span>
                      );
                    })() : (
                      <span className="font-medium text-muted-foreground">Profit: --</span>
                    )}
                    <span className="font-medium text-muted-foreground">
                      Remaining: {u.remainingAfterPercent.toFixed(2)}%
                    </span>
                    {u.note && <span className="text-muted-foreground">- {u.note}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-3">
            {rows.map((row, index) => (
              <div key={index} className="grid grid-cols-12 gap-2 items-end rounded-xl border border-border/50 p-3">
                <div className="col-span-2">
                  <Label className="text-xs">Label</Label>
                  <Input value={`TP ${existingUpdates.length + index + 1}`} disabled />
                </div>
                <div className="col-span-3">
                  <Label className="text-xs">TP Price</Label>
                  <Input
                    type="number"
                    step="any"
                    value={row.tpPrice}
                    onChange={(e) => setRow(index, "tpPrice", e.target.value)}
                    placeholder={isMarketMode ? "Locked from market quote" : "e.g. 2350"}
                    disabled={isMarketMode}
                    readOnly={isMarketMode}
                  />
                </div>
                <div className="col-span-3">
                  <Label className="text-xs">Close % {isMarketMode ? "*" : ""}</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={row.closePercent}
                    onChange={(e) => setRow(index, "closePercent", e.target.value)}
                    placeholder="e.g. 50"
                  />
                </div>
                <div className="col-span-3">
                  <Label className="text-xs">Note (optional)</Label>
                  <Input
                    value={row.note}
                    onChange={(e) => setRow(index, "note", e.target.value)}
                    placeholder="Partial close"
                  />
                </div>
                <div className="col-span-1 flex justify-end">
                  <Button
                    size="icon"
                    variant="ghost"
                    disabled={rows.length === 1 || isMarketMode}
                    onClick={() => removeRow(index)}
                    className={cn((rows.length === 1 || isMarketMode) && "opacity-50")}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-muted-foreground">
              Planned close: <span className="font-semibold text-foreground">{totalPlannedClosePercent.toFixed(2)}%</span>
              <span className="mx-2 text-muted-foreground/50">|</span>
              Remaining available:{" "}
              <span className="font-semibold text-foreground">{remainingCloseCapacityPercent.toFixed(2)}%</span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={handleSubmit}
                disabled={
                  isSubmitting ||
                  isMarketMode ||
                  isRemainingLoading ||
                  (typeof remainingExposure === "number" && remainingExposure <= 0)
                }
                title={isMarketMode ? "Disabled in Market mode. Use Close." : undefined}
              >
                {isSubmitting ? "Publishing..." : "Publish Updates"}
              </Button>
              {isMarketMode && (
                <Button
                  variant="destructive"
                  onClick={handleMarketClose}
                  disabled={
                    isSubmitting ||
                    isLockingMarketPrice ||
                    isRemainingLoading ||
                    (typeof remainingExposure === "number" && remainingExposure <= 0)
                  }
                >
                  {isSubmitting ? "Closing..." : "Close"}
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
