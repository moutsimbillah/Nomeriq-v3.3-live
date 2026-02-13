import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Bell, Plus, Trash2 } from "lucide-react";
import { Signal } from "@/types/database";
import { createSignalTakeProfitUpdates, useSignalTakeProfitUpdates } from "@/hooks/useSignalTakeProfitUpdates";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useBrand } from "@/contexts/BrandContext";
import { sendTelegramTradeUpdate } from "@/lib/telegram";
import { getSafeErrorMessage } from "@/lib/error-sanitizer";

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

const calculateRr = (signal: Signal, tpPrice: number): number => {
  const entry = Number(signal.entry_price ?? 0);
  const sl = Number(signal.stop_loss ?? 0);
  if (!entry || !sl) return 0;

  if (signal.direction === "BUY") {
    const risk = entry - sl;
    if (risk === 0) return 0;
    return Math.abs((tpPrice - entry) / risk);
  }

  const risk = sl - entry;
  if (risk === 0) return 0;
  return Math.abs((entry - tpPrice) / risk);
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

  const { updatesBySignal, refetch } = useSignalTakeProfitUpdates({
    signalIds: [signal.id],
    realtime: open,
  });

  const existingUpdates = updatesBySignal[signal.id] || [];

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
    setRows((prev) => [...prev, { tpPrice: "", closePercent: "", note: "" }]);
  };

  const removeRow = (index: number) => {
    setRows((prev) => prev.filter((_, i) => i !== index));
  };

  const setRow = (index: number, key: keyof FormRow, value: string) => {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, [key]: value } : row)));
  };

  const resetForm = () => {
    setRows([{ tpPrice: "", closePercent: "", note: "" }]);
  };

  const handleSubmit = async () => {
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

    if (totalPlannedClosePercent > 100) {
      toast.error("Planned close cannot exceed 100%.");
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

    setIsSubmitting(true);
    try {
      await createSignalTakeProfitUpdates(signal.id, currentUserId, parsed);
      await refetch();

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
            toast.error(getSafeErrorMessage(res.error, "Unable to send Telegram update right now."));
            break;
          }
        }
      }

      toast.success("Trade update(s) published.");
      resetForm();
      setOpen(false);
    } catch (err) {
      console.error("Error creating TP updates:", err);
      const msg = err instanceof Error ? err.message : "Failed to publish updates.";
      const normalized = msg.toLowerCase();
      if (
        normalized.includes("relation") && normalized.includes("signal_take_profit_updates")
      ) {
        toast.error("Database migration not applied: signal_take_profit_updates table is missing.");
      } else if (normalized.includes("row-level security") || normalized.includes("permission")) {
        toast.error("Permission denied to publish updates for this signal.");
      } else {
        toast.error(getSafeErrorMessage(msg, "Failed to publish updates. Please try again."));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) resetForm();
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
            Add TP updates (TP1, TP2, TP3...) with price and close percentage.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex justify-end">
            <Button type="button" variant="outline" onClick={addRow}>
              <Plus className="w-4 h-4 mr-1" />
              Add TP
            </Button>
          </div>

          {existingUpdates.length > 0 && (
            <div className="rounded-xl border border-border/50 p-3">
              <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wide">Published Updates</p>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {existingUpdates.map((u) => (
                  <div key={u.id} className="flex flex-wrap items-center gap-2 text-sm rounded-lg bg-secondary/30 px-3 py-2">
                    <Badge variant="outline">{u.tp_label}</Badge>
                    <span className="font-mono">Price: {u.tp_price}</span>
                    <span className="font-medium text-primary">Close: {u.close_percent}%</span>
                    {riskAmountUsd !== null ? (
                      <span className="font-medium text-success">
                        Profit: +$
                        {(
                          riskAmountUsd *
                          (u.close_percent / 100) *
                          calculateRr(signal, Number(u.tp_price))
                        ).toFixed(2)}
                      </span>
                    ) : (
                      <span className="font-medium text-muted-foreground">Profit: --</span>
                    )}
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
                    placeholder="e.g. 2350"
                  />
                </div>
                <div className="col-span-3">
                  <Label className="text-xs">Close %</Label>
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
                    disabled={rows.length === 1}
                    onClick={() => removeRow(index)}
                    className={cn(rows.length === 1 && "opacity-50")}
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
            </div>
            <Button onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? "Publishing..." : "Publish Updates"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
