import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
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
import {
  sendTelegramMoveSlToBreakeven,
  sendTelegramTradeUpdate,
  sendTelegramTradeUpdateDeleted,
  sendTelegramTradeUpdateEdited,
} from "@/lib/telegram";
import { getSafeErrorMessage } from "@/lib/error-sanitizer";
import { useLivePrices } from "@/hooks/useLivePrices";
import { deriveLiveCloseOutcome, getLiveCloseSnapshot } from "@/lib/live-signal-close";
import { supabase } from "@/integrations/supabase/client";
import { calculateSignedSignalRrForTarget } from "@/lib/trade-math";
import { resolveTradeUpdateDisplayType } from "@/lib/trade-update-classification";

interface FormRow {
  tpPrice: string;
  closePercent: string;
  note: string;
}

interface PublishedEditRow {
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
}

interface PublishedUpdateExecutionStatus {
  label: string;
  tone: "success" | "warning" | "muted";
}

const calculateRr = (signal: Signal, tpPrice: number): number => {
  if (!Number.isFinite(Number(signal.entry_price)) || !Number.isFinite(Number(tpPrice))) return 0;
  return calculateSignedSignalRrForTarget(signal, tpPrice);
};

const getTpUpdateIdFromPayload = (payload: unknown): string | null => {
  if (!payload || typeof payload !== "object") return null;
  const raw = payload as Record<string, unknown>;
  return typeof raw.update_id === "string" ? raw.update_id : null;
};

const toFiniteNumber = (value: unknown): number | null => {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
};

const getTpUpdateMatchKey = (input: {
  tpLabel?: unknown;
  tpPrice?: unknown;
  closePercent?: unknown;
  note?: unknown;
}): string | null => {
  const tpLabel = typeof input.tpLabel === "string" ? input.tpLabel.trim() : "";
  const tpPrice = toFiniteNumber(input.tpPrice);
  const closePercent = toFiniteNumber(input.closePercent);
  if (!tpLabel || tpPrice === null || closePercent === null) return null;
  const note = typeof input.note === "string" ? input.note.trim() : "";
  const tpScaled = Math.round(tpPrice * 100000);
  const closeScaled = Math.round(closePercent * 100);
  return `${tpLabel}|${tpScaled}|${closeScaled}|${note}`;
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
  const [tpMode, setTpMode] = useState<TpUpdateMode>("limit");
  const [marketPriceLock, setMarketPriceLock] = useState<MarketPriceLock | null>(null);
  const [isLockingMarketPrice, setIsLockingMarketPrice] = useState(false);
  const [marketLockFailed, setMarketLockFailed] = useState(false);
  const [isMovingSlToBreakeven, setIsMovingSlToBreakeven] = useState(false);
  const [breakevenJustMoved, setBreakevenJustMoved] = useState(false);
  const [publishedExecutionStatusByUpdateId, setPublishedExecutionStatusByUpdateId] = useState<
    Record<string, PublishedUpdateExecutionStatus>
  >({});
  const [publishedTypeByUpdateId, setPublishedTypeByUpdateId] = useState<Record<string, "limit" | "market">>({});
  const [historyTypeByUpdateId, setHistoryTypeByUpdateId] = useState<Record<string, "limit" | "market">>({});
  const [publishedActionAtByUpdateId, setPublishedActionAtByUpdateId] = useState<Record<string, string>>({});
  const [breakevenEventAt, setBreakevenEventAt] = useState<string | null>(null);
  const [editingUpdateId, setEditingUpdateId] = useState<string | null>(null);
  const [editingPublishedRow, setEditingPublishedRow] = useState<PublishedEditRow | null>(null);
  const [isSavingPublishedEdit, setIsSavingPublishedEdit] = useState(false);
  const [deletingUpdateId, setDeletingUpdateId] = useState<string | null>(null);
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

  const { updatesBySignal, refetch } = useSignalTakeProfitUpdates({
    signalIds: [signal.id],
    realtime: open,
  });

  const existingUpdates = useMemo(
    () => updatesBySignal[signal.id] ?? [],
    [updatesBySignal, signal.id]
  );
  useEffect(() => {
    if (!editingUpdateId) return;
    const stillExists = existingUpdates.some((u) => u.id === editingUpdateId);
    if (!stillExists) {
      setEditingUpdateId(null);
      setEditingPublishedRow(null);
    }
  }, [editingUpdateId, existingUpdates]);
  const updateIdByMatchKey = useMemo(() => {
    const next: Record<string, string | null> = {};
    for (const u of existingUpdates) {
      const key = getTpUpdateMatchKey({
        tpLabel: u.tp_label,
        tpPrice: u.tp_price,
        closePercent: u.close_percent,
        note: u.note,
      });
      if (!key) continue;
      if (next[key] && next[key] !== u.id) {
        next[key] = null;
        continue;
      }
      next[key] = u.id;
    }
    return next;
  }, [existingUpdates]);
  const publishedBaseRows = useMemo(
    () =>
      existingUpdates.map((u) => ({
        ...u,
        rawUpdateType: u.update_type ?? null,
        updateType: u.update_type === "market" ? "market" : "limit",
      })),
    [existingUpdates]
  );
  const lastPublishedTpPrice = useMemo(() => {
    const publishedTpPrices = existingUpdates
      .map((u) => Number(u.tp_price))
      .filter((n) => Number.isFinite(n));
    return publishedTpPrices.length > 0
      ? publishedTpPrices[publishedTpPrices.length - 1]
      : null;
  }, [existingUpdates]);

  const fetchPublishedExecutionStatus = useCallback(async () => {
    if (!open || existingUpdates.length === 0) {
      setPublishedExecutionStatusByUpdateId({});
      setPublishedTypeByUpdateId({});
      setHistoryTypeByUpdateId({});
      setPublishedActionAtByUpdateId({});
      setBreakevenEventAt(null);
      return;
    }

    const updateIds = existingUpdates.map((u) => u.id).filter(Boolean);
    if (updateIds.length === 0) {
      setPublishedExecutionStatusByUpdateId({});
      setPublishedTypeByUpdateId({});
      setHistoryTypeByUpdateId({});
      setPublishedActionAtByUpdateId({});
      setBreakevenEventAt(null);
      return;
    }

    try {
      const { data: eventRows, error: eventError } = await supabase
        .from("signal_event_history" as never)
        .select("event_type, payload, created_at")
        .eq("signal_id", signal.id)
        .in(
          "event_type",
          isLiveSignal
            ? ["tp_update_published", "tp_update_triggered", "sl_breakeven"]
            : ["tp_update_published", "sl_breakeven"]
        );

      if (eventError) throw eventError;

      const historyTypeMap: Record<string, "limit" | "market"> = {};
      const triggeredUpdateIds = new Set<string>();
      const triggeredAtByUpdateId: Record<string, string> = {};
      let nextBreakevenAt: string | null = null;

      for (const row of (eventRows || []) as Array<{ event_type?: string; payload?: unknown; created_at?: string }>) {
        if (row.event_type === "sl_breakeven" && typeof row.created_at === "string") {
          if (!nextBreakevenAt || row.created_at > nextBreakevenAt) {
            nextBreakevenAt = row.created_at;
          }
          continue;
        }
        let updateId = getTpUpdateIdFromPayload(row.payload);
        if (!updateId && row.payload && typeof row.payload === "object") {
          const payload = row.payload as Record<string, unknown>;
          const key = getTpUpdateMatchKey({
            tpLabel: payload.tp_label,
            tpPrice: payload.tp_price,
            closePercent: payload.close_percent,
            note: payload.note,
          });
          if (key) {
            updateId = updateIdByMatchKey[key] || null;
          }
        }
        if (!updateId || !updateIds.includes(updateId)) continue;

        if (row.event_type === "tp_update_published") {
          const payload =
            row.payload && typeof row.payload === "object"
              ? (row.payload as Record<string, unknown>)
              : null;
          const updateType = payload?.update_type;
          if (updateType === "limit" || updateType === "market") {
            historyTypeMap[updateId] = updateType;
          }
        } else if (isLiveSignal && row.event_type === "tp_update_triggered") {
          triggeredUpdateIds.add(updateId);
          if (typeof row.created_at === "string") {
            const existing = triggeredAtByUpdateId[updateId];
            if (!existing || row.created_at < existing) {
              triggeredAtByUpdateId[updateId] = row.created_at;
            }
          }
        }
      }

      const isSignalOpen = signal.status === "active" || signal.status === "upcoming";
      const next: Record<string, PublishedUpdateExecutionStatus> = {};
      const nextTypeByUpdateId: Record<string, "limit" | "market"> = {};
      const nextActionAtByUpdateId: Record<string, string> = {};

      for (const updateRow of publishedBaseRows) {
        const resolvedType = resolveTradeUpdateDisplayType({
          rawUpdateType: updateRow.rawUpdateType,
          historyUpdateType: historyTypeMap[updateRow.id] || null,
        });
        const hasTriggerEvent = triggeredUpdateIds.has(updateRow.id);
        const effectiveType: "limit" | "market" = resolvedType.type;
        nextTypeByUpdateId[updateRow.id] = effectiveType;

        if (isLiveSignal && effectiveType === "limit") {
          if (!hasTriggerEvent) {
            next[updateRow.id] = {
              label: isSignalOpen ? "Pending" : "Ended Unfilled",
              tone: isSignalOpen ? "warning" : "muted",
            };
            continue;
          }
          const triggeredAt = triggeredAtByUpdateId[updateRow.id] || updateRow.created_at || "";
          if (triggeredAt) {
            nextActionAtByUpdateId[updateRow.id] = triggeredAt;
          }
          next[updateRow.id] = {
            label: "Triggered",
            tone: "success",
          };
          continue;
        }

        const actionAt = updateRow.created_at || "";
        if (actionAt) nextActionAtByUpdateId[updateRow.id] = actionAt;
        next[updateRow.id] = {
          label: "Executed",
          tone: "success",
        };
      }

      setPublishedExecutionStatusByUpdateId(next);
      setPublishedTypeByUpdateId(nextTypeByUpdateId);
      setHistoryTypeByUpdateId(historyTypeMap);
      setPublishedActionAtByUpdateId(nextActionAtByUpdateId);
      setBreakevenEventAt(nextBreakevenAt);
    } catch (err) {
      console.error("Error fetching published update statuses:", err);
      setPublishedExecutionStatusByUpdateId({});
      setPublishedTypeByUpdateId({});
      setHistoryTypeByUpdateId({});
      setPublishedActionAtByUpdateId({});
      setBreakevenEventAt(null);
    }
  }, [open, existingUpdates, signal.id, signal.status, publishedBaseRows, isLiveSignal, updateIdByMatchKey]);

  useEffect(() => {
    if (!open) {
      setPublishedExecutionStatusByUpdateId({});
      setPublishedTypeByUpdateId({});
      setHistoryTypeByUpdateId({});
      setPublishedActionAtByUpdateId({});
      setBreakevenEventAt(null);
      return;
    }
    void fetchPublishedExecutionStatus();
  }, [open, fetchPublishedExecutionStatus]);

  useEffect(() => {
    if (!open) return;
    const interval = setInterval(() => {
      void fetchPublishedExecutionStatus();
    }, 8000);
    return () => clearInterval(interval);
  }, [open, fetchPublishedExecutionStatus]);

  const publishedRows = useMemo(() => {
    let actualRemainingPercent = 100;
    let projectedRemainingPercent = 100;

    return publishedBaseRows.map((u) => {
      const closePct = Math.max(0, Math.min(100, Number(u.close_percent || 0)));
      const statusLabel = publishedExecutionStatusByUpdateId[u.id]?.label || "";
      const resolvedType = resolveTradeUpdateDisplayType({
        rawUpdateType: u.rawUpdateType,
        historyUpdateType: historyTypeByUpdateId[u.id] || null,
      });
      const effectiveType = publishedTypeByUpdateId[u.id] || resolvedType.type;
      const executedByDefault = effectiveType === "market" || (!isLiveSignal && effectiveType === "limit");
      const isExecutedLike =
        statusLabel === "Executed" ||
        statusLabel === "Triggered" ||
        statusLabel.startsWith("Triggered ") ||
        (!statusLabel && executedByDefault);

      const reducedActualPercent = isExecutedLike
        ? Math.min(actualRemainingPercent, closePct)
        : 0;
      actualRemainingPercent = Math.max(0, actualRemainingPercent - reducedActualPercent);

      const reducedProjectedPercent = Math.min(projectedRemainingPercent, closePct);
      projectedRemainingPercent = Math.max(0, projectedRemainingPercent - reducedProjectedPercent);

      return {
        ...u,
        remainingAfterPercent: actualRemainingPercent,
        projectedRemainingAfterPercent: projectedRemainingPercent,
      };
    });
  }, [
    publishedBaseRows,
    publishedExecutionStatusByUpdateId,
    publishedTypeByUpdateId,
    historyTypeByUpdateId,
    isLiveSignal,
  ]);

  const remainingCloseCapacityPercent = useMemo(
    () =>
      publishedRows.length > 0
        ? Math.max(0, Number(publishedRows[publishedRows.length - 1].remainingAfterPercent || 0))
        : 100,
    [publishedRows]
  );
  const remainingCapacityPercent = remainingCloseCapacityPercent;

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
  const displayRemainingExposureBase =
    riskAmountUsd !== null
      ? Math.max(0, (riskAmountUsd * remainingCapacityPercent) / 100)
      : null;
  const EPSILON = 1e-9;
  const entryPriceValue = Number(signal.entry_price);
  const rawStopLossValue = Number(signal.stop_loss);
  const stopLossValue =
    breakevenJustMoved && Number.isFinite(entryPriceValue)
      ? entryPriceValue
      : rawStopLossValue;
  const hasBreakevenUpdate =
    Number.isFinite(entryPriceValue) &&
    Number.isFinite(stopLossValue) &&
    Math.abs(stopLossValue - entryPriceValue) <= EPSILON;
  const displayRemainingExposure =
    hasBreakevenUpdate && displayRemainingExposureBase !== null
      ? 0
      : displayRemainingExposureBase;
  const stopLossBadgeValue = Number.isFinite(stopLossValue)
    ? stopLossValue
    : (signal.stop_loss ?? "-");
  const publishedHistoryCount = existingUpdates.length + (hasBreakevenUpdate ? 1 : 0);
  const canMoveSlBase =
    Number.isFinite(entryPriceValue) &&
    Number.isFinite(stopLossValue) &&
    Math.abs(stopLossValue - entryPriceValue) > EPSILON;
  const hasLivePriceForBreakeven =
    isLiveSignal &&
    Number.isFinite(entryPriceValue) &&
    typeof currentMarketPrice === "number" &&
    Number.isFinite(currentMarketPrice);
  const isCurrentPriceInProfitForBreakeven = !isLiveSignal
    ? true
    : hasLivePriceForBreakeven
      ? signal.direction === "BUY"
        ? currentMarketPrice > entryPriceValue + EPSILON
        : currentMarketPrice < entryPriceValue - EPSILON
      : false;
  const canMoveSlToBreakeven = canMoveSlBase && isCurrentPriceInProfitForBreakeven;
  const publishedTimelineItems = useMemo(() => {
    const items: Array<
      | { kind: "tp"; sortTime: number | null; index: number; row: (typeof publishedRows)[number] }
      | { kind: "breakeven"; sortTime: number | null; index: number }
    > = publishedRows.map((row, index) => {
      const statusLabel = publishedExecutionStatusByUpdateId[row.id]?.label || "";
      const isUnresolved = statusLabel.startsWith("Pending") || statusLabel === "Ended Unfilled";
      const activityAt = publishedActionAtByUpdateId[row.id] || (!isUnresolved ? row.created_at : null);
      const parsed = Date.parse(activityAt || "");
      return {
        kind: "tp",
        sortTime: Number.isFinite(parsed) ? parsed : null,
        index,
        row,
      };
    });

    if (hasBreakevenUpdate) {
      const parsed = Date.parse(breakevenEventAt || signal.updated_at || "");
      items.push({
        kind: "breakeven",
        sortTime: Number.isFinite(parsed) ? parsed : null,
        index: publishedRows.length + 1,
      });
    }

    return items.sort((a, b) => {
      const aHasTime = typeof a.sortTime === "number";
      const bHasTime = typeof b.sortTime === "number";
      if (aHasTime && bHasTime && a.sortTime !== b.sortTime) {
        return (a.sortTime as number) - (b.sortTime as number);
      }
      if (aHasTime && !bHasTime) return -1;
      if (!aHasTime && bHasTime) return 1;
      return a.index - b.index;
    });
  }, [
    publishedRows,
    publishedExecutionStatusByUpdateId,
    publishedActionAtByUpdateId,
    hasBreakevenUpdate,
    breakevenEventAt,
    signal.updated_at,
  ]);
  const isExposureDepleted = remainingCapacityPercent <= 0.0001;
  const showMoveSlButton =
    !(isSubmitting || isMovingSlToBreakeven || !canMoveSlToBreakeven);
  const showPublishUpdatesButton =
    !(isSubmitting || isMarketMode || isExposureDepleted);
  const showCloseButton = isMarketMode;
  const canCloseInMarketMode =
    !(isSubmitting || !marketPriceLock || isExposureDepleted);
  const showFooterActions =
    showMoveSlButton || showPublishUpdatesButton || showCloseButton;

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

  const beginPendingLimitEdit = (row: {
    id: string;
    tp_price: number;
    close_percent: number;
    note: string | null;
  }) => {
    setEditingUpdateId(row.id);
    setEditingPublishedRow({
      tpPrice: Number(row.tp_price).toString(),
      closePercent: Number(row.close_percent).toString(),
      note: row.note || "",
    });
  };

  const cancelPendingLimitEdit = () => {
    setEditingUpdateId(null);
    setEditingPublishedRow(null);
  };

  const savePendingLimitEdit = useCallback(async () => {
    if (!editingUpdateId || !editingPublishedRow) return;
    if (isSavingPublishedEdit || deletingUpdateId !== null) return;
    const originalRow = existingUpdates.find((u) => u.id === editingUpdateId) || null;
    const statusLabel = publishedExecutionStatusByUpdateId[editingUpdateId]?.label || "";
    const effectiveType =
      publishedTypeByUpdateId[editingUpdateId] ||
      (originalRow?.update_type === "market" ? "market" : "limit");
    const canStillEdit = effectiveType === "limit" && statusLabel.startsWith("Pending");
    if (!canStillEdit) {
      toast.error("This TP is no longer pending limit. Refresh and try again.");
      return;
    }

    const nextTpPrice = Number(editingPublishedRow.tpPrice);
    const nextClosePercent = Number(editingPublishedRow.closePercent);
    if (!Number.isFinite(nextTpPrice) || nextTpPrice <= 0) {
      toast.error("TP price must be a valid number greater than 0.");
      return;
    }
    if (!Number.isFinite(nextClosePercent) || nextClosePercent <= 0 || nextClosePercent > 100) {
      toast.error("Close % must be between 0 and 100.");
      return;
    }

    const signalEntry = Number(signal.entry_price);
    if (!Number.isFinite(signalEntry)) {
      toast.error("Signal entry is missing. Please update the base signal first.");
      return;
    }
    const isInvalidForDirection =
      signal.direction === "BUY" ? nextTpPrice <= signalEntry : nextTpPrice >= signalEntry;
    if (isInvalidForDirection) {
      toast.error(
        signal.direction === "BUY"
          ? "TP price must stay above entry for BUY."
          : "TP price must stay below entry for SELL."
      );
      return;
    }

    if (isLiveSignal) {
      let previousTp: number | null = null;
      for (const update of existingUpdates) {
        const candidateTp =
          update.id === editingUpdateId ? nextTpPrice : Number(update.tp_price);
        if (!Number.isFinite(candidateTp)) {
          toast.error("All TP prices must be valid numbers.");
          return;
        }
        if (previousTp !== null) {
          const isOutOfOrder =
            signal.direction === "BUY"
              ? candidateTp <= previousTp + EPSILON
              : candidateTp >= previousTp - EPSILON;
          if (isOutOfOrder) {
            toast.error(
              signal.direction === "BUY"
                ? "TP prices must stay in strictly ascending order."
                : "TP prices must stay in strictly descending order."
            );
            return;
          }
        }
        previousTp = candidateTp;
      }
    }

    setIsSavingPublishedEdit(true);
    try {
      const nextNote = editingPublishedRow.note.trim();
      const { error } = await supabase
        .from("signal_take_profit_updates")
        .update({
          tp_price: nextTpPrice,
          close_percent: nextClosePercent,
          note: nextNote.length > 0 ? nextNote : null,
        })
        .eq("id", editingUpdateId);

      if (error) throw error;

      await refetch();
      await fetchPublishedExecutionStatus();

      if (signal.send_updates_to_telegram && originalRow) {
        const telegramResult = await sendTelegramTradeUpdateEdited({
          signal: {
            pair: signal.pair,
            category: signal.category,
            direction: signal.direction,
            entry_price: signal.entry_price,
            stop_loss: signal.stop_loss,
            take_profit: signal.take_profit,
            tp_label: originalRow.tp_label,
            update_type: "limit",
            previous_tp_price: Number(originalRow.tp_price),
            next_tp_price: nextTpPrice,
            previous_close_percent: Number(originalRow.close_percent),
            next_close_percent: nextClosePercent,
            previous_note: originalRow.note,
            next_note: nextNote.length > 0 ? nextNote : null,
          },
        });
        if (telegramResult.ok === false) {
          toast.warning(
            getSafeErrorMessage(
              telegramResult.error,
              "TP edited, but Telegram update failed."
            )
          );
        }
      }

      setEditingUpdateId(null);
      setEditingPublishedRow(null);
      toast.success("Pending limit order updated.");
    } catch (err) {
      console.error("Error updating pending limit order:", err);
      const msg = err instanceof Error ? err.message : "Failed to update pending limit order.";
      toast.error(getSafeErrorMessage(msg, "Failed to update pending limit order."));
    } finally {
      setIsSavingPublishedEdit(false);
    }
  }, [
    editingUpdateId,
    editingPublishedRow,
    isSavingPublishedEdit,
    deletingUpdateId,
    signal,
    isLiveSignal,
    existingUpdates,
    publishedExecutionStatusByUpdateId,
    publishedTypeByUpdateId,
    EPSILON,
    refetch,
    fetchPublishedExecutionStatus,
  ]);

  const deletePendingLimitUpdate = useCallback(
    async (row: {
      id: string;
      tp_label: string;
      tp_price: number;
      close_percent: number;
      note: string | null;
      update_type?: "limit" | "market";
    }) => {
      if (isSavingPublishedEdit || deletingUpdateId !== null) return;
      const statusLabel = publishedExecutionStatusByUpdateId[row.id]?.label || "";
      const effectiveType =
        publishedTypeByUpdateId[row.id] || (row.update_type === "market" ? "market" : "limit");
      const canStillDelete = effectiveType === "limit" && statusLabel.startsWith("Pending");
      if (!canStillDelete) {
        toast.error("This TP is no longer pending limit. Refresh and try again.");
        return;
      }

      if (typeof window !== "undefined") {
        const ok = window.confirm(`Delete ${row.tp_label}? This pending limit order will be removed.`);
        if (!ok) return;
      }

      setDeletingUpdateId(row.id);
      try {
        const { error } = await supabase
          .from("signal_take_profit_updates")
          .delete()
          .eq("id", row.id);
        if (error) throw error;

        if (editingUpdateId === row.id) {
          setEditingUpdateId(null);
          setEditingPublishedRow(null);
        }

        await refetch();
        await fetchPublishedExecutionStatus();

        if (signal.send_updates_to_telegram) {
          const telegramResult = await sendTelegramTradeUpdateDeleted({
            signal: {
              pair: signal.pair,
              category: signal.category,
              direction: signal.direction,
              entry_price: signal.entry_price,
              stop_loss: signal.stop_loss,
              take_profit: signal.take_profit,
              tp_label: row.tp_label,
              update_type: row.update_type === "market" ? "market" : "limit",
              tp_price: Number(row.tp_price),
              close_percent: Number(row.close_percent),
              note: row.note,
            },
          });
          if (telegramResult.ok === false) {
            toast.warning(
              getSafeErrorMessage(
                telegramResult.error,
                "TP deleted, but Telegram update failed."
              )
            );
          }
        }

        toast.success("Pending limit order deleted.");
      } catch (err) {
        console.error("Error deleting pending limit order:", err);
        const msg = err instanceof Error ? err.message : "Failed to delete pending limit order.";
        toast.error(getSafeErrorMessage(msg, "Failed to delete pending limit order."));
      } finally {
        setDeletingUpdateId((current) => (current === row.id ? null : current));
      }
    },
    [
      isSavingPublishedEdit,
      deletingUpdateId,
      editingUpdateId,
      publishedExecutionStatusByUpdateId,
      publishedTypeByUpdateId,
      signal,
      refetch,
      fetchPublishedExecutionStatus,
    ]
  );

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
      };
      setMarketPriceLock(nextLock);
      setMarketLockFailed(false);
      setRows((prev) => {
        const first = prev[0] || { tpPrice: "", closePercent: "", note: "" };
        return [{ ...first, tpPrice: nextLock.price.toString() }];
      });
      return nextLock;
    } catch (err) {
      console.warn("Market quote sync failed:", err);
      setMarketLockFailed(true);
      return null;
    } finally {
      setIsLockingMarketPrice(false);
    }
  }, [isLiveSignal, signal]);

    useEffect(() => {
      if (!open || !isMarketMode) return;
      void lockMarketPrice();
      const interval = setInterval(() => {
        void lockMarketPrice();
      }, 1000);
      return () => clearInterval(interval);
    }, [open, isMarketMode, lockMarketPrice]);

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

        if (signal.send_updates_to_telegram) {
          let runningRemainingPercent = Math.max(0, remainingCapacityPercent);
          let runningRemainingExposure =
            typeof displayRemainingExposure === "number" &&
            Number.isFinite(displayRemainingExposure)
              ? Math.max(0, displayRemainingExposure)
              : null;

          for (const row of parsed) {
            const closePercent = Math.max(0, Math.min(100, Number(row.closePercent || 0)));
            const beforeRemainingPercent = runningRemainingPercent;
            const reducedPercentOfOriginal = Math.min(beforeRemainingPercent, closePercent);
            runningRemainingPercent = Math.max(0, runningRemainingPercent - reducedPercentOfOriginal);

            let remainingAfterExposure: number | null = null;
            if (runningRemainingExposure !== null) {
              const perPercentExposure =
                beforeRemainingPercent > 0
                  ? runningRemainingExposure / beforeRemainingPercent
                  : 0;
              const reducedExposure = Math.min(
                runningRemainingExposure,
                perPercentExposure * reducedPercentOfOriginal
              );
              runningRemainingExposure = Math.max(0, runningRemainingExposure - reducedExposure);
              remainingAfterExposure = runningRemainingExposure;
            }

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
                update_type: row.updateType || "limit",
                remaining_after_percent: runningRemainingPercent,
                remaining_after_exposure: remainingAfterExposure,
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
    [
      signal,
      currentUserId,
      refetch,
      resetForm,
      remainingCapacityPercent,
      displayRemainingExposure,
    ]
  );

  const handleSubmit = async () => {
    if (isMarketMode) {
      toast.error("Publish is disabled in Market mode. Use the Close button.");
      return;
    }

    if (isExposureDepleted) {
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
      updateType: "limit" as const,
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

    if (totalPlannedClosePercent > remainingCapacityPercent + 0.0001) {
      toast.error(
        `Planned close cannot exceed remaining position (${remainingCapacityPercent.toFixed(
          2
        )}%).`
      );
      return;
    }

    if (isLiveSignal) {
      const firstRow = parsed[0];
      if (!firstRow) {
        toast.error("Please add at least one TP row.");
        return;
      }

      if (lastPublishedTpPrice == null) {
        if (currentMarketPrice == null || !Number.isFinite(currentMarketPrice)) {
          toast.error("Live current price is unavailable. Please wait for quote sync.");
          return;
        }
        const firstVsMarketInvalid =
          signal.direction === "BUY"
            ? firstRow.tpPrice <= currentMarketPrice + EPSILON
            : firstRow.tpPrice >= currentMarketPrice - EPSILON;
        if (firstVsMarketInvalid) {
          if (signal.direction === "BUY") {
            toast.error(
              `First TP must be strictly above current market price (${currentMarketPrice}).`
            );
          } else {
            toast.error(
              `First TP must be strictly below current market price (${currentMarketPrice}).`
            );
          }
          return;
        }
      } else {
        const firstVsLastTpInvalid =
          signal.direction === "BUY"
            ? firstRow.tpPrice <= lastPublishedTpPrice + EPSILON
            : firstRow.tpPrice >= lastPublishedTpPrice - EPSILON;
        if (firstVsLastTpInvalid) {
          if (signal.direction === "BUY") {
            toast.error(
              `First new TP must be strictly above last published TP (${lastPublishedTpPrice}).`
            );
          } else {
            toast.error(
              `First new TP must be strictly below last published TP (${lastPublishedTpPrice}).`
            );
          }
          return;
        }
      }
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
    let previousTp: number | null =
      lastPublishedTpPrice != null
        ? lastPublishedTpPrice
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

    if (isExposureDepleted) {
      toast.error("Cannot close: this signal has no remaining open position.");
      return;
    }

    const firstRow = rows[0];
    const closePercent = Number(firstRow?.closePercent);
    if (!Number.isFinite(closePercent) || closePercent <= 0 || closePercent > 100) {
      toast.error("Close % is required and must be between 0 and 100.");
      return;
    }

    if (closePercent > remainingCapacityPercent + 0.0001) {
      toast.error(
        `Close % cannot exceed remaining position (${remainingCapacityPercent.toFixed(2)}%).`
      );
      return;
    }

    const lock = marketPriceLock ?? (await lockMarketPrice());
    if (!lock) {
      return;
    }

    const parsed: CreateTakeProfitUpdateInput[] = [
      {
        tpLabel: `TP ${existingUpdates.length + 1}`,
        tpPrice: Number(lock.price),
        closePercent,
        updateType: "market",
        note: firstRow?.note || "",
      },
    ];

    await publishRows(parsed, {
      successMessage: "Market close update published.",
      closeDialog: false,
    });
  };

  const handleMoveSlToBreakeven = async () => {
    if (!Number.isFinite(entryPriceValue)) {
      toast.error("Entry price is missing. Cannot move SL to break even.");
      return;
    }
    if (!canMoveSlBase) {
      toast.info("Stop loss is already at break even.");
      return;
    }
    if (isLiveSignal && !hasLivePriceForBreakeven) {
      toast.error("Live current price is unavailable. Please wait for quote sync.");
      return;
    }
    if (isLiveSignal && !isCurrentPriceInProfitForBreakeven) {
      toast.error("Move to break-even is allowed only when current price is in profit.");
      return;
    }

    setIsMovingSlToBreakeven(true);
    try {
      const previousStopLossValue = Number.isFinite(rawStopLossValue)
        ? rawStopLossValue
        : signal.stop_loss;
      const { error } = await supabase
        .from("signals")
        .update({
          stop_loss: entryPriceValue,
          updated_at: new Date().toISOString(),
        } as never)
        .eq("id", signal.id);

      if (error) throw error;

      if (signal.send_updates_to_telegram) {
        const telegramResult = await sendTelegramMoveSlToBreakeven({
          signal: {
            pair: signal.pair,
            category: signal.category,
            direction: signal.direction,
            entry_price: signal.entry_price,
            stop_loss: entryPriceValue,
            take_profit: signal.take_profit,
            previous_stop_loss: previousStopLossValue,
          },
        });
        if (telegramResult.ok === false) {
          toast.warning(
            getSafeErrorMessage(
              telegramResult.error,
              "SL moved to break even, but Telegram update failed."
            )
          );
        }
      }

      toast.success("Stop loss moved to break even.");
      setBreakevenJustMoved(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to move SL to break even.";
      const normalized = msg.toLowerCase();
      if (
        normalized.includes("strictly lower than entry") ||
        normalized.includes("strictly higher than entry")
      ) {
        toast.error("Backend rule still blocks break-even SL. Apply latest migration.");
      } else {
        toast.error(getSafeErrorMessage(msg, "Failed to move SL to break even."));
      }
    } finally {
      setIsMovingSlToBreakeven(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setTpMode("limit");
          setMarketPriceLock(null);
          setMarketLockFailed(false);
          setBreakevenJustMoved(false);
          setEditingUpdateId(null);
          setEditingPublishedRow(null);
          setIsSavingPublishedEdit(false);
          setDeletingUpdateId(null);
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
          {publishedHistoryCount > 0 && (
            <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-[10px]">
              {publishedHistoryCount}
            </Badge>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent aria-describedby={undefined} className="max-w-3xl">
        <DialogHeader className="pr-10">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <DialogTitle>Trade Update</DialogTitle>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="outline" className="font-mono">Pair: {signal.pair}</Badge>
              <Badge variant="outline" className="font-mono">Entry: {signal.entry_price ?? "-"}</Badge>
              <Badge variant="outline" className="font-mono">SL: {stopLossBadgeValue}</Badge>
              <Badge variant="outline" className="font-mono">TP: {signal.take_profit ?? "-"}</Badge>
            </div>
          </div>
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

          {isLiveSignal && !isMarketMode && (
            <p className="text-xs text-muted-foreground">
              Live Limit rule:{" "}
              {lastPublishedTpPrice == null
                ? signal.direction === "BUY"
                  ? "First TP must stay above current market price."
                  : "First TP must stay below current market price."
                : signal.direction === "BUY"
                  ? `Next TP must stay above last published TP (${lastPublishedTpPrice}).`
                  : `Next TP must stay below last published TP (${lastPublishedTpPrice}).`}
            </p>
          )}

          {isLiveSignal && (
            <div className="rounded-xl border border-border/50 p-3 bg-secondary/20">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={isMarketMode ? "default" : "outline"}
                    onClick={() => setTpMode("market")}
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
                        ? "Syncing..."
                        : marketLockFailed
                          ? "Live quote unavailable, retrying..."
                          : "Auto-sync every 1s"}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="rounded-lg border border-border/50 bg-secondary/20 p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center">
                <span className="text-muted-foreground">Remaining Position: </span>
                <span className="font-semibold text-foreground">
                  {remainingCapacityPercent.toFixed(2)}%
                </span>
                {typeof displayRemainingExposure === "number" && (
                  <>
                    <span className="text-muted-foreground"> (</span>
                    <span className="font-semibold text-foreground">
                      ${displayRemainingExposure.toFixed(2)}
                    </span>
                    <span className="text-muted-foreground">)</span>
                  </>
                )}
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={addRow}
                disabled={isMarketMode || isExposureDepleted}
                title={isMarketMode ? "Disabled in Market mode. Close one TP at a time." : undefined}
              >
                <Plus className="w-4 h-4 mr-1" />
                Add TP
              </Button>
            </div>
            {isExposureDepleted && (
              <p className="mt-2 text-warning">No further TP updates can be published.</p>
            )}
          </div>

          {(existingUpdates.length > 0 || hasBreakevenUpdate) && (
            <div className="rounded-xl border border-border/50 p-3">
              <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wide">Published Updates</p>
              <div className="space-y-2 min-h-[17rem] max-h-[17rem] overflow-y-auto">
                {publishedTimelineItems.map((item) =>
                  item.kind === "tp" ? (() => {
                    const u = item.row;
                    const resolvedType = resolveTradeUpdateDisplayType({
                      rawUpdateType: u.rawUpdateType,
                      historyUpdateType: historyTypeByUpdateId[u.id] || null,
                    });
                    const typeForDisplay = publishedTypeByUpdateId[u.id] || resolvedType.type;
                    const executionStatus = publishedExecutionStatusByUpdateId[u.id];
                    const statusLabel = executionStatus?.label || "";
                    const isPendingLike =
                      statusLabel.startsWith("Pending") || statusLabel.startsWith("Triggered ");
                    const isEndedUnfilled = statusLabel === "Ended Unfilled";
                    const canEditDeletePendingLimit =
                      typeForDisplay === "limit" && statusLabel.startsWith("Pending");
                    const isEditingThisRow =
                      editingUpdateId === u.id && editingPublishedRow !== null;

                    if (isEditingThisRow) {
                      return (
                        <div key={u.id} className="rounded-lg bg-secondary/30 px-3 py-3 space-y-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline">{u.tp_label}</Badge>
                            <Badge variant="outline" className="border-primary/40 text-primary">
                              Limit Order
                            </Badge>
                            <Badge variant="outline" className="border-warning/40 text-warning">
                              Pending
                            </Badge>
                            <Badge variant="outline" className="border-primary/40 text-primary">
                              Editing
                            </Badge>
                          </div>
                          <div className="grid grid-cols-12 gap-2 items-end">
                            <div className="col-span-12 sm:col-span-4">
                              <Label className="text-xs">TP Price</Label>
                              <Input
                                type="number"
                                step="any"
                                value={editingPublishedRow.tpPrice}
                                onChange={(e) =>
                                  setEditingPublishedRow((prev) =>
                                    prev ? { ...prev, tpPrice: e.target.value } : prev
                                  )
                                }
                              />
                            </div>
                            <div className="col-span-12 sm:col-span-3">
                              <Label className="text-xs">Close %</Label>
                              <Input
                                type="number"
                                step="0.01"
                                value={editingPublishedRow.closePercent}
                                onChange={(e) =>
                                  setEditingPublishedRow((prev) =>
                                    prev ? { ...prev, closePercent: e.target.value } : prev
                                  )
                                }
                              />
                            </div>
                            <div className="col-span-12 sm:col-span-5">
                              <Label className="text-xs">Note (optional)</Label>
                              <Input
                                value={editingPublishedRow.note}
                                onChange={(e) =>
                                  setEditingPublishedRow((prev) =>
                                    prev ? { ...prev, note: e.target.value } : prev
                                  )
                                }
                              />
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={cancelPendingLimitEdit}
                              disabled={isSavingPublishedEdit || deletingUpdateId !== null}
                            >
                              Cancel
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => {
                                void savePendingLimitEdit();
                              }}
                              disabled={isSavingPublishedEdit || deletingUpdateId !== null}
                            >
                              {isSavingPublishedEdit ? "Saving..." : "Save"}
                            </Button>
                          </div>
                        </div>
                      );
                    }
                    return (
                      <div key={u.id} className="flex flex-wrap items-center gap-2 text-sm rounded-lg bg-secondary/30 px-3 py-2">
                        <Badge variant="outline">{u.tp_label}</Badge>
                        <Badge
                          variant="outline"
                          className={cn(
                            typeForDisplay === "market"
                              ? "border-warning/40 text-warning"
                              : "border-primary/40 text-primary"
                          )}
                        >
                          {typeForDisplay === "market" ? "Market Close" : "Limit Order"}
                        </Badge>
                        {executionStatus && (
                          <Badge
                            variant="outline"
                            className={cn(
                              executionStatus.tone === "success"
                                ? "border-success/40 text-success"
                                : executionStatus.tone === "warning"
                                  ? "border-warning/40 text-warning"
                                  : "border-muted text-muted-foreground"
                            )}
                          >
                            {executionStatus.label}
                          </Badge>
                        )}
                        {u.remainingAfterPercent <= 0.0001 && (
                          <Badge variant="outline" className="border-success/40 text-success">
                            Position Closed
                          </Badge>
                        )}
                        <span className="font-mono">Price: {u.tp_price}</span>
                        <span className="font-medium text-primary">Close: {u.close_percent}%</span>
                        {riskAmountUsd !== null ? (() => {
                          const realizedPnl =
                            riskAmountUsd *
                            (u.close_percent / 100) *
                            calculateRr(signal, Number(u.tp_price));
                          if (isEndedUnfilled) {
                            return <span className="font-medium text-muted-foreground">Profit: --</span>;
                          }
                          return (
                            <span
                              className={cn(
                                "font-medium",
                                realizedPnl >= 0 ? "text-success" : "text-destructive"
                              )}
                            >
                              {isPendingLike ? "Projected Profit" : "Profit"}: {realizedPnl >= 0 ? "+" : ""}${realizedPnl.toFixed(2)}
                            </span>
                          );
                        })() : (
                          <span className="font-medium text-muted-foreground">Profit: --</span>
                        )}
                        <span className="font-medium text-muted-foreground">
                          {isPendingLike ? "Projected Remaining" : "Remaining"}: {(isPendingLike
                            ? u.projectedRemainingAfterPercent
                            : u.remainingAfterPercent).toFixed(2)}%
                        </span>
                        {u.note && <span className="text-muted-foreground">- {u.note}</span>}
                        {canEditDeletePendingLimit && (
                          <div className="ml-auto flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                beginPendingLimitEdit({
                                  id: u.id,
                                  tp_price: Number(u.tp_price),
                                  close_percent: Number(u.close_percent),
                                  note: u.note,
                                })
                              }
                              disabled={isSavingPublishedEdit || deletingUpdateId !== null}
                            >
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => {
                                void deletePendingLimitUpdate({
                                  id: u.id,
                                  tp_label: u.tp_label,
                                  tp_price: Number(u.tp_price),
                                  close_percent: Number(u.close_percent),
                                  note: u.note,
                                  update_type: typeForDisplay,
                                });
                              }}
                              disabled={isSavingPublishedEdit || deletingUpdateId !== null}
                            >
                              {deletingUpdateId === u.id ? "Deleting..." : "Delete"}
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })() : (
                    <div key="risk-update-breakeven" className="rounded-lg border border-warning/30 bg-warning/10 p-3">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <Badge variant="outline" className="border-warning/40 text-warning">Risk Update</Badge>
                        <span className="text-sm font-semibold text-warning">SL moved to break-even</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Stop loss now equals entry price, so downside risk is protected at 0R.
                      </p>
                    </div>
                  )
                )}
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
              <span className="font-semibold text-foreground">{remainingCapacityPercent.toFixed(2)}%</span>
            </div>
            {showFooterActions && (
              <div className="flex items-center gap-2">
                {showMoveSlButton && (
                  <Button
                    variant="outline"
                    onClick={handleMoveSlToBreakeven}
                  >
                    Move SL to Break Even
                  </Button>
                )}
                {showPublishUpdatesButton && (
                  <Button
                    onClick={handleSubmit}
                  >
                    Publish Updates
                  </Button>
                )}
                {showCloseButton && (
                  <Button
                    variant="destructive"
                    onClick={handleMarketClose}
                    disabled={!canCloseInMarketMode}
                    title={
                      !canCloseInMarketMode
                        ? !marketPriceLock
                          ? "Waiting for live market lock."
                          : isExposureDepleted
                            ? "No remaining open position to close."
                            : "Close is temporarily unavailable."
                        : undefined
                    }
                  >
                    {isSubmitting ? "Closing..." : "Close"}
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};



