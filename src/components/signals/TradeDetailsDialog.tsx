import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SignalTakeProfitUpdate, UserTrade } from "@/types/database";
import { useSignalTakeProfitUpdates } from "@/hooks/useSignalTakeProfitUpdates";
import { format, differenceInMinutes, differenceInHours, differenceInDays } from "date-fns";
import { cn } from "@/lib/utils";
import { FileText, ExternalLink, Image as ImageIcon, Play } from "lucide-react";
import { resolveAnalysisImageUrl } from "@/lib/signalAnalysisMedia";
import {
  calculateDisplayedPotentialProfit,
  calculateOpeningPotentialProfit,
  calculateSignalRrForTarget,
  calculateSignedSignalRrForTarget,
} from "@/lib/trade-math";
import { supabase } from "@/integrations/supabase/client";
import { resolveTradeUpdateDisplayType } from "@/lib/trade-update-classification";

interface TradeDetailsDialogProps {
  trade: UserTrade;
}

type UpdateExecutionStatus =
  | "triggered"
  | "waiting"
  | "ended"
  | "executed"
  | "pending_execution";

const EMPTY_TP_UPDATES: SignalTakeProfitUpdate[] = [];

const getTpPublishedPayloadInfo = (payload: unknown): {
  updateId: string | null;
  updateType: "limit" | "market" | null;
} => {
  if (!payload || typeof payload !== "object") {
    return { updateId: null, updateType: null };
  }

  const raw = payload as Record<string, unknown>;
  const updateId = typeof raw.update_id === "string" ? raw.update_id : null;
  const updateType =
    raw.update_type === "limit" || raw.update_type === "market"
      ? raw.update_type
      : null;

  return { updateId, updateType };
};

const getTpUpdateIdFromPayload = (payload: unknown): string | null => {
  if (!payload || typeof payload !== "object") return null;
  const raw = payload as Record<string, unknown>;
  return typeof raw.update_id === "string" ? raw.update_id : null;
};

const getTpTriggeredPayloadInfo = (
  payload: unknown
): { updateId: string | null; quotePrice: number | null } => {
  if (!payload || typeof payload !== "object") {
    return { updateId: null, quotePrice: null };
  }
  const raw = payload as Record<string, unknown>;
  const updateId = typeof raw.update_id === "string" ? raw.update_id : null;
  const quotePrice = toFiniteNumber(raw.quote_price);
  return { updateId, quotePrice };
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

const getDuration = (createdAt?: string, closedAt?: string | null) => {
  if (!createdAt || !closedAt) return "-";
  const start = new Date(createdAt);
  const end = new Date(closedAt);
  const minutes = differenceInMinutes(end, start);
  const hours = differenceInHours(end, start);
  const days = differenceInDays(end, start);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${minutes}m`;
};

const extractYouTubeId = (url: string): string | null => {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /youtube\.com\/shorts\/([^&\n?#]+)/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
};

export const TradeDetailsDialog = ({ trade }: TradeDetailsDialogProps) => {
  const signal = trade.signal;
  const isLiveSignal = signal?.market_mode === "live";
  const [open, setOpen] = useState(false);
  const signalIds = useMemo(
    () => (open && signal?.id ? [signal.id] : []),
    [open, signal?.id]
  );
  const { updatesBySignal } = useSignalTakeProfitUpdates({ signalIds, realtime: open });
  const updates = useMemo(() => {
    if (!signal?.id) return EMPTY_TP_UPDATES;
    return updatesBySignal[signal.id] ?? EMPTY_TP_UPDATES;
  }, [signal?.id, updatesBySignal]);
  const updateIdsKey = useMemo(
    () => updates.map((u) => u.id).filter(Boolean).join("|"),
    [updates]
  );
  const updateIdByMatchKey = useMemo(() => {
    const next: Record<string, string | null> = {};
    for (const u of updates) {
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
  }, [updates]);
  const [historyTypeByUpdateId, setHistoryTypeByUpdateId] = useState<Record<string, "limit" | "market">>({});
  const [triggeredUpdateIds, setTriggeredUpdateIds] = useState<Record<string, true>>({});
  const [triggeredEventAtByUpdateId, setTriggeredEventAtByUpdateId] = useState<Record<string, string>>({});
  const [triggeredQuotePriceByUpdateId, setTriggeredQuotePriceByUpdateId] = useState<Record<string, number>>({});
  const [breakevenEventAt, setBreakevenEventAt] = useState<string | null>(null);
  const [appliedByUpdateId, setAppliedByUpdateId] = useState<
    Record<string, { closePercent: number; realizedPnl: number }>
  >({});
  const [appliedAtByUpdateId, setAppliedAtByUpdateId] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    const currentSignalId = signal?.id || trade.signal_id;
    const updateIds = updateIdsKey ? updateIdsKey.split("|") : [];
    if (!currentSignalId) {
      setHistoryTypeByUpdateId((prev) => (Object.keys(prev).length === 0 ? prev : {}));
      setTriggeredUpdateIds((prev) => (Object.keys(prev).length === 0 ? prev : {}));
      setTriggeredEventAtByUpdateId((prev) => (Object.keys(prev).length === 0 ? prev : {}));
      setTriggeredQuotePriceByUpdateId((prev) => (Object.keys(prev).length === 0 ? prev : {}));
      setBreakevenEventAt(null);
      return () => {
        cancelled = true;
      };
    }

    const fetchHistoryTypes = async () => {
      const eventTypes = isLiveSignal
        ? ["tp_update_published", "tp_update_triggered", "sl_breakeven"]
        : ["tp_update_published", "sl_breakeven"];
      const { data, error } = await supabase
        .from("signal_event_history" as never)
        .select("event_type, payload, created_at")
        .eq("signal_id", currentSignalId)
        .in("event_type", eventTypes);

      if (cancelled) return;

      if (error) {
        console.error("Error fetching TP update history types:", error);
        setHistoryTypeByUpdateId({});
        setTriggeredUpdateIds({});
        setTriggeredEventAtByUpdateId({});
        setTriggeredQuotePriceByUpdateId({});
        setBreakevenEventAt(null);
        return;
      }

      const next: Record<string, "limit" | "market"> = {};
      const nextTriggered: Record<string, true> = {};
      const nextTriggeredAt: Record<string, string> = {};
      const nextTriggeredQuotePrice: Record<string, number> = {};
      let nextBreakevenAt: string | null = null;
      const rows = (data || []) as Array<{ event_type?: string; payload?: unknown; created_at?: string }>;
      for (const row of rows) {
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
          const { updateType } = getTpPublishedPayloadInfo(row.payload);
          if (updateType) {
            next[updateId] = updateType;
          }
        } else if (isLiveSignal && row.event_type === "tp_update_triggered") {
          const { quotePrice } = getTpTriggeredPayloadInfo(row.payload);
          nextTriggered[updateId] = true;
          if (quotePrice !== null) {
            nextTriggeredQuotePrice[updateId] = quotePrice;
          }
          if (typeof row.created_at === "string") {
            const existing = nextTriggeredAt[updateId];
            if (!existing || row.created_at < existing) {
              nextTriggeredAt[updateId] = row.created_at;
            }
          }
        }
      }

      setHistoryTypeByUpdateId(next);
      setTriggeredUpdateIds(nextTriggered);
      setTriggeredEventAtByUpdateId(nextTriggeredAt);
      setTriggeredQuotePriceByUpdateId(nextTriggeredQuotePrice);
      setBreakevenEventAt(nextBreakevenAt);
    };

    void fetchHistoryTypes();

    return () => {
      cancelled = true;
    };
  }, [open, signal?.id, trade.signal_id, updateIdsKey, isLiveSignal, updateIdByMatchKey]);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    const updateIds = updateIdsKey ? updateIdsKey.split("|") : [];

    if (!trade.id || updateIds.length === 0) {
      setAppliedByUpdateId((prev) => (Object.keys(prev).length === 0 ? prev : {}));
      setAppliedAtByUpdateId((prev) => (Object.keys(prev).length === 0 ? prev : {}));
      return () => {
        cancelled = true;
      };
    }

    const fetchAppliedUpdates = async () => {
      const { data, error } = await supabase
        .from("user_trade_take_profit_updates")
        .select("signal_update_id, close_percent, realized_pnl, created_at")
        .eq("user_trade_id", trade.id)
        .in("signal_update_id", updateIds);

      if (cancelled) return;

      if (error) {
        console.error("Error fetching applied TP updates:", error);
        setAppliedByUpdateId({});
        return;
      }

      const next: Record<string, { closePercent: number; realizedPnl: number }> = {};
      const nextAppliedAt: Record<string, string> = {};
      for (const row of data || []) {
        next[row.signal_update_id] = {
          closePercent: Number(row.close_percent || 0),
          realizedPnl: Number(row.realized_pnl || 0),
        };
        if (typeof row.created_at === "string") {
          const existing = nextAppliedAt[row.signal_update_id];
          if (!existing || row.created_at < existing) {
            nextAppliedAt[row.signal_update_id] = row.created_at;
          }
        }
      }
      setAppliedByUpdateId(next);
      setAppliedAtByUpdateId(nextAppliedAt);
    };

    void fetchAppliedUpdates();

    return () => {
      cancelled = true;
    };
  }, [open, trade.id, updateIdsKey]);

  useEffect(() => {
    if (!open || !trade.id || updateIdsKey.length === 0) return;

    const channel = supabase
      .channel(`trade_details_updates_applied_${trade.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_trade_take_profit_updates",
          filter: `user_trade_id=eq.${trade.id}`,
        },
        async () => {
          const updateIds = updateIdsKey ? updateIdsKey.split("|") : [];
          if (updateIds.length === 0) {
            setAppliedByUpdateId({});
            setAppliedAtByUpdateId({});
            return;
          }
          const { data, error } = await supabase
            .from("user_trade_take_profit_updates")
            .select("signal_update_id, close_percent, realized_pnl, created_at")
            .eq("user_trade_id", trade.id)
            .in("signal_update_id", updateIds);
          if (error) {
            console.error("Error refreshing applied TP updates:", error);
            return;
          }
          const next: Record<string, { closePercent: number; realizedPnl: number }> = {};
          const nextAppliedAt: Record<string, string> = {};
          for (const row of data || []) {
            next[row.signal_update_id] = {
              closePercent: Number(row.close_percent || 0),
              realizedPnl: Number(row.realized_pnl || 0),
            };
            if (typeof row.created_at === "string") {
              const existing = nextAppliedAt[row.signal_update_id];
              if (!existing || row.created_at < existing) {
                nextAppliedAt[row.signal_update_id] = row.created_at;
              }
            }
          }
          setAppliedByUpdateId(next);
          setAppliedAtByUpdateId(nextAppliedAt);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [open, trade.id, updateIdsKey]);

  const { tpRows, fallbackRemainingRisk, fallbackRemainingPercent } = useMemo(() => {
    const initialRisk = Number(trade.initial_risk_amount ?? trade.risk_amount ?? 0);
    const isTradeStillOpen = trade.result === "pending";
    let runningRemainingRisk = Math.max(0, initialRisk);
    const backendRemaining = Math.max(0, Number(trade.remaining_risk_amount ?? initialRisk));
    const tradeCreatedAtMs = Date.parse(trade.created_at || "");
    const hasTradeCreatedAt = Number.isFinite(tradeCreatedAtMs);
    const inferredExecutedByUpdateId: Record<string, true> = {};

    if (isLiveSignal && initialRisk > 0 && updates.length > 0) {
      const hasAnyApplied = updates.some((u) => Boolean(appliedByUpdateId[u.id]));
      const hasAnyTrigger = updates.some((u) => Boolean(triggeredUpdateIds[u.id]));

      // Legacy fallback: infer executed TP prefix from persisted remaining risk
      // when per-update execution rows/events are missing.
      if (!hasAnyApplied && !hasAnyTrigger && backendRemaining < initialRisk - 1e-4) {
        const remainingByPrefix: number[] = [initialRisk];
        for (const u of updates) {
          const prev = remainingByPrefix[remainingByPrefix.length - 1];
          const closePct = Math.max(0, Math.min(100, Number(u.close_percent || 0)));
          const requestedCloseRisk = initialRisk * (closePct / 100);
          const reducedRisk = Math.min(prev, requestedCloseRisk);
          let next = Math.max(0, prev - reducedRisk);
          if (closePct >= 100) next = 0;
          remainingByPrefix.push(next);
        }

        let bestPrefix = 0;
        let bestDiff = Math.abs(remainingByPrefix[0] - backendRemaining);
        for (let i = 1; i < remainingByPrefix.length; i += 1) {
          const diff = Math.abs(remainingByPrefix[i] - backendRemaining);
          if (diff < bestDiff) {
            bestDiff = diff;
            bestPrefix = i;
          }
        }

        const tolerance = Math.max(0.02, initialRisk * 0.005);
        if (bestPrefix > 0 && bestDiff <= tolerance) {
          for (let i = 0; i < bestPrefix; i += 1) {
            inferredExecutedByUpdateId[updates[i].id] = true;
          }
        }
      }
    }

    const computedRows = updates.map((u) => {
      const applied = appliedByUpdateId[u.id];
      const wasApplied = Boolean(applied);
      const hasTriggerEvent = Boolean(triggeredUpdateIds[u.id]);
      const resolvedType = resolveTradeUpdateDisplayType({
        rawUpdateType: u.update_type,
        historyUpdateType: historyTypeByUpdateId[u.id] || null,
      });
      const hasInferredExecution = Boolean(inferredExecutedByUpdateId[u.id]);
      const effectiveUpdateType: "limit" | "market" = resolvedType.type;
      const updateCreatedAtMs = Date.parse(u.created_at || "");
      const updatePublishedBeforeTrade =
        hasTradeCreatedAt &&
        Number.isFinite(updateCreatedAtMs) &&
        updateCreatedAtMs < tradeCreatedAtMs - 1;
      const marketUpdateAlreadyMissed =
        effectiveUpdateType === "market" &&
        !wasApplied &&
        !hasInferredExecution &&
        updatePublishedBeforeTrade;
      const wasTriggered =
        effectiveUpdateType === "limit" && isLiveSignal
          ? hasTriggerEvent || wasApplied || hasInferredExecution
          : wasApplied || hasInferredExecution;
      const executionStatus: UpdateExecutionStatus =
        effectiveUpdateType === "market"
          ? wasTriggered
            ? "executed"
            : marketUpdateAlreadyMissed
              ? "ended"
            : isTradeStillOpen
              ? "pending_execution"
              : "ended"
          : wasTriggered
            ? "triggered"
            : isTradeStillOpen
              ? "waiting"
              : "ended";
      const closePercent = Math.max(0, Math.min(100, Number(u.close_percent ?? 0)));
      const executedClosePercent = wasTriggered
        ? Math.max(0, Math.min(100, Number(applied ? applied.closePercent : closePercent)))
        : 0;
      const requestedCloseRisk = initialRisk * (executedClosePercent / 100);
      const reducedRisk = Math.min(runningRemainingRisk, requestedCloseRisk);
      let remainingAfterRisk = Math.max(0, runningRemainingRisk - reducedRisk);
      if (executedClosePercent >= 100) {
        remainingAfterRisk = 0;
      }
      const executionPrice =
        wasTriggered &&
        typeof triggeredQuotePriceByUpdateId[u.id] === "number" &&
        Number.isFinite(triggeredQuotePriceByUpdateId[u.id])
          ? Number(triggeredQuotePriceByUpdateId[u.id])
          : Number(u.tp_price);
      const rrAtTp = calculateSignedSignalRrForTarget(signal, executionPrice);
      const realizedProfit = wasTriggered
        ? applied
          ? Number(applied.realizedPnl || 0)
          : reducedRisk * rrAtTp
        : 0;
      const remainingAfterPercent = initialRisk > 0 ? (remainingAfterRisk / initialRisk) * 100 : 0;
      const requestedCloseRiskForDisplay = initialRisk * (closePercent / 100);
      const beforeRiskAmount = runningRemainingRisk;
      const projectedReducedRisk = Math.min(beforeRiskAmount, requestedCloseRiskForDisplay);
      let projectedRemainingAfterRisk = Math.max(0, beforeRiskAmount - projectedReducedRisk);
      if (closePercent >= 100) {
        projectedRemainingAfterRisk = 0;
      }
      const projectedRemainingAfterPercent =
        initialRisk > 0 ? (projectedRemainingAfterRisk / initialRisk) * 100 : 0;
      const displayRemainingAfterPercent =
        executionStatus === "waiting" || executionStatus === "pending_execution"
          ? projectedRemainingAfterPercent
          : remainingAfterPercent;
      const activityAt =
        executionStatus === "triggered" || executionStatus === "executed"
          ? appliedAtByUpdateId[u.id] ||
            triggeredEventAtByUpdateId[u.id] ||
            (Number.isFinite(updateCreatedAtMs) ? u.created_at : null)
          : null;
      runningRemainingRisk = remainingAfterRisk;
      return {
        ...u,
        updateType: effectiveUpdateType,
        updateTypeInferredFromHistory: resolvedType.inferredFromHistory,
        executionStatus,
        wasTriggered,
        closePercent,
        remainingAfterPercent,
        displayRemainingAfterPercent,
        executionPrice,
        rrAtTp,
        realizedProfit,
        activityAt,
      };
    });
    return {
      tpRows: computedRows,
      fallbackRemainingRisk: runningRemainingRisk,
      fallbackRemainingPercent:
        initialRisk > 0 ? (runningRemainingRisk / initialRisk) * 100 : 0,
    };
  }, [
    updates,
    trade.initial_risk_amount,
    trade.risk_amount,
    trade.remaining_risk_amount,
    trade.result,
    trade.created_at,
    signal,
    appliedByUpdateId,
    appliedAtByUpdateId,
    historyTypeByUpdateId,
    triggeredUpdateIds,
    triggeredEventAtByUpdateId,
    triggeredQuotePriceByUpdateId,
    isLiveSignal,
  ]);

  const currentTargetTp = useMemo(() => {
    if (!signal) return 0;
    if (updates.length === 0) return signal.take_profit || 0;
    const tpPrices = updates.map((u) => Number(u.tp_price)).filter((n) => Number.isFinite(n));
    if (tpPrices.length === 0) return signal.take_profit || 0;
    return signal.direction === "SELL" ? Math.min(...tpPrices) : Math.max(...tpPrices);
  }, [signal, updates]);

  const rr = useMemo(
    () => calculateSignalRrForTarget(signal, currentTargetTp),
    [signal, currentTargetTp]
  );
  const [resolvedImageUrl, setResolvedImageUrl] = useState<string | null>(null);
  const [isImageLoading, setIsImageLoading] = useState(false);

  const potentialProfit =
    trade.result === "pending"
      ? calculateDisplayedPotentialProfit({
          ...trade,
          signal: signal ? { ...signal, take_profit: currentTargetTp } : signal,
        })
      : calculateOpeningPotentialProfit({
          ...trade,
          signal,
        });
  const initialRisk = Number(trade.initial_risk_amount ?? trade.risk_amount ?? 0);
  const backendRemainingRisk = Math.max(
    0,
    Number(trade.remaining_risk_amount ?? (trade.result === "pending" ? initialRisk : 0))
  );
  const remainingRisk = isLiveSignal
    ? Math.min(backendRemainingRisk, fallbackRemainingRisk)
    : backendRemainingRisk;
  const entryPriceValue = Number(signal?.entry_price);
  const stopLossValue = Number(signal?.stop_loss);
  const hasBreakevenUpdate =
    Number.isFinite(entryPriceValue) &&
    Number.isFinite(stopLossValue) &&
    Math.abs(stopLossValue - entryPriceValue) < 1e-8;
  const realizedFromTpRows = useMemo(
    () =>
      tpRows.reduce(
        (sum, row) =>
          sum +
          (row.executionStatus === "triggered" || row.executionStatus === "executed"
            ? Number(row.realizedProfit || 0)
            : 0),
        0
      ),
    [tpRows]
  );
  const finalCloseItem = useMemo(() => {
    if (!signal || trade.result === "pending") return null;

    const signalStatus = String(signal.status || "").toLowerCase();
    const statusTone =
      signalStatus === "tp_hit"
        ? "success"
        : signalStatus === "sl_hit"
          ? "destructive"
          : "warning";
    const statusLabel =
      signalStatus === "tp_hit"
        ? "TP Triggered"
        : signalStatus === "sl_hit"
          ? "SL Triggered"
          : signalStatus === "breakeven"
            ? "Breakeven Triggered"
            : "Final Close";

    const closePriceRaw = Number(signal.close_price);
    const closePrice =
      Number.isFinite(closePriceRaw) && closePriceRaw > 0 ? closePriceRaw : null;
    const closeAt =
      signal.close_quoted_at ||
      signal.closed_at ||
      trade.closed_at ||
      signal.updated_at ||
      null;
    const totalPnl = Number(trade.pnl || 0);
    const finalLegPnl = totalPnl - realizedFromTpRows;
    const hasMeaningfulFinalLeg =
      Math.abs(finalLegPnl) > 0.0001 || closePrice !== null;

    if (!hasMeaningfulFinalLeg) return null;

    return {
      statusTone,
      statusLabel,
      closePrice,
      closeAt,
      finalLegPnl,
    };
  }, [signal, trade.result, trade.closed_at, trade.pnl, realizedFromTpRows]);
  const timelineItems = useMemo(() => {
    const items: Array<
      | { kind: "tp"; sortTime: number | null; index: number; row: (typeof tpRows)[number] }
      | { kind: "breakeven"; sortTime: number | null; index: number }
      | {
          kind: "final_close";
          sortTime: number | null;
          index: number;
          statusTone: "success" | "destructive" | "warning";
          statusLabel: string;
          closePrice: number | null;
          closeAt: string | null;
          finalLegPnl: number;
        }
    > = tpRows.map((row, index) => {
      const parsed = Date.parse(row.activityAt || "");
      return {
        kind: "tp",
        sortTime: Number.isFinite(parsed) ? parsed : null,
        index,
        row,
      };
    });

    if (hasBreakevenUpdate) {
      const parsed = Date.parse(
        breakevenEventAt ||
        trade.last_update_at ||
        signal?.updated_at ||
        ""
      );
      items.push({
        kind: "breakeven",
        sortTime: Number.isFinite(parsed) ? parsed : null,
        index: tpRows.length + 1,
      });
    }

    if (finalCloseItem) {
      const parsed = Date.parse(finalCloseItem.closeAt || "");
      items.push({
        kind: "final_close",
        sortTime: Number.isFinite(parsed) ? parsed : null,
        index: tpRows.length + (hasBreakevenUpdate ? 2 : 1),
        statusTone: finalCloseItem.statusTone,
        statusLabel: finalCloseItem.statusLabel,
        closePrice: finalCloseItem.closePrice,
        closeAt: finalCloseItem.closeAt,
        finalLegPnl: finalCloseItem.finalLegPnl,
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
  }, [tpRows, hasBreakevenUpdate, breakevenEventAt, trade.last_update_at, signal?.updated_at, finalCloseItem]);
  const remainingPercent =
    initialRisk > 0 ? (remainingRisk / initialRisk) * 100 : fallbackRemainingPercent;
  const duration = getDuration(trade.created_at, trade.closed_at);
  const hasAnalysis = Boolean(signal?.analysis_notes || signal?.analysis_video_url || signal?.analysis_image_url);
  const videoId = signal?.analysis_video_url ? extractYouTubeId(signal.analysis_video_url) : null;

  useEffect(() => {
    if (!open) {
      setResolvedImageUrl(null);
      setIsImageLoading(false);
      return;
    }

    const resolveImage = async () => {
      if (!signal?.analysis_image_url) {
        setResolvedImageUrl(null);
        setIsImageLoading(false);
        return;
      }

      setIsImageLoading(true);
      const url = await resolveAnalysisImageUrl(signal.analysis_image_url);
      setResolvedImageUrl(url);
      setIsImageLoading(false);
    };

    void resolveImage();
  }, [open, signal?.analysis_image_url]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="border-primary/30 text-primary hover:bg-primary/10">
          Details
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader className="pr-10">
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <span>{signal?.pair || "Trade"}</span>
            <Badge variant="outline">{signal?.category || "-"}</Badge>
            <Badge
              variant="outline"
              className={cn(
                signal?.direction === "BUY"
                  ? "border-success/30 text-success bg-success/10"
                  : "border-destructive/30 text-destructive bg-destructive/10"
              )}
            >
              {signal?.direction || "-"}
            </Badge>
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[70vh] pr-4">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="outline" className="font-mono">Pair: {signal?.pair || "-"}</Badge>
              <Badge variant="outline" className="font-mono">Entry: {signal?.entry_price ?? "-"}</Badge>
              <Badge variant="outline" className="font-mono">SL: {signal?.stop_loss ?? "-"}</Badge>
              <Badge variant="outline" className="font-mono">TP: {signal?.take_profit ?? "-"}</Badge>
              {updates.length > 0 && (
                <Badge variant="outline" className="font-mono">Current TP: {currentTargetTp}</Badge>
              )}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div className="rounded-lg border border-border/50 p-3">
                <p className="text-xs text-muted-foreground">Risk %</p>
                <p className="font-semibold">{trade.risk_percent}%</p>
              </div>
              <div className="rounded-lg border border-border/50 p-3">
                <p className="text-xs text-muted-foreground">Risk Amount</p>
                <p className="font-semibold">${(trade.risk_amount || 0).toFixed(2)}</p>
              </div>
              <div className="rounded-lg border border-border/50 p-3">
                <p className="text-xs text-muted-foreground">Remaining Position</p>
                <p className="font-semibold">
                  {remainingPercent.toFixed(2)}% (${remainingRisk.toFixed(2)})
                </p>
              </div>
              <div className="rounded-lg border border-border/50 p-3">
                <p className="text-xs text-muted-foreground">R:R</p>
                <p className="font-semibold">1:{rr.toFixed(1)}</p>
              </div>
              <div className="rounded-lg border border-border/50 p-3">
                <p className="text-xs text-muted-foreground">Potential Profit</p>
                <p className="font-semibold text-success">+${potentialProfit.toFixed(2)}</p>
              </div>
              <div className="rounded-lg border border-border/50 p-3">
                <p className="text-xs text-muted-foreground">P&L</p>
                <p className={cn("font-semibold", (trade.pnl || 0) >= 0 ? "text-success" : "text-destructive")}>
                  {(trade.pnl || 0) >= 0 ? "+" : ""}${(trade.pnl || 0).toFixed(2)}
                </p>
              </div>
              <div className="rounded-lg border border-border/50 p-3">
                <p className="text-xs text-muted-foreground">Duration</p>
                <p className="font-semibold">{duration}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="rounded-lg border border-border/50 p-3">
                <p className="text-xs text-muted-foreground mb-1">Opened At</p>
                <p className="text-sm">{trade.created_at ? format(new Date(trade.created_at), "yyyy-MM-dd HH:mm") : "-"}</p>
              </div>
              <div className="rounded-lg border border-border/50 p-3">
                <p className="text-xs text-muted-foreground mb-1">Closed At</p>
                <p className="text-sm">{trade.closed_at ? format(new Date(trade.closed_at), "yyyy-MM-dd HH:mm") : "-"}</p>
              </div>
            </div>

            <div className="rounded-lg border border-border/50 p-3">
              <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wide">Update History</p>
              {tpRows.length === 0 && !hasBreakevenUpdate && !finalCloseItem ? (
                <p className="text-sm text-muted-foreground">No trade updates published.</p>
              ) : (
                <div className="space-y-2">
                  {timelineItems.map((item) =>
                    item.kind === "tp" ? (
                      <div key={item.row.id} className="rounded-md bg-secondary/30 px-3 py-2 text-sm flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{item.row.tp_label}</Badge>
                        <Badge
                          variant="outline"
                          className={cn(
                            item.row.updateType === "market"
                              ? "border-warning/40 text-warning"
                              : "border-primary/40 text-primary"
                          )}
                        >
                          {item.row.updateType === "market" ? "Market Close" : "Limit Order"}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={cn(
                            item.row.executionStatus === "triggered" || item.row.executionStatus === "executed"
                              ? "border-success/40 text-success"
                              : item.row.executionStatus === "waiting" || item.row.executionStatus === "pending_execution"
                                ? "border-warning/40 text-warning"
                                : "border-muted text-muted-foreground"
                          )}
                        >
                          {item.row.executionStatus === "triggered"
                            ? "Triggered"
                            : item.row.executionStatus === "executed"
                              ? "Executed"
                              : item.row.executionStatus === "waiting"
                                ? "Pending"
                                : item.row.executionStatus === "pending_execution"
                                  ? "Pending Execution"
                                  : "Ended Unfilled"}
                        </Badge>
                        {item.row.remainingAfterPercent <= 0.0001 && (
                          <Badge variant="outline" className="border-success/40 text-success">
                            Position Closed
                          </Badge>
                        )}
                        <span className="font-mono">Price: {item.row.tp_price}</span>
                        {item.row.wasTriggered &&
                          Number.isFinite(item.row.executionPrice) &&
                          Math.abs(Number(item.row.executionPrice) - Number(item.row.tp_price)) > 1e-8 && (
                            <span className="font-mono text-muted-foreground">
                              Fill: {Number(item.row.executionPrice).toFixed(5)}
                            </span>
                          )}
                        <span className="text-primary">Close: {item.row.closePercent.toFixed(2)}%</span>
                        <span
                          className={cn(
                            "font-semibold",
                            item.row.realizedProfit >= 0 ? "text-success" : "text-destructive"
                          )}
                        >
                          Profit: {item.row.wasTriggered ? `${item.row.realizedProfit >= 0 ? "+" : ""}$${item.row.realizedProfit.toFixed(2)}` : "--"}
                        </span>
                        <span className="text-muted-foreground">
                          {item.row.executionStatus === "waiting" || item.row.executionStatus === "pending_execution"
                            ? "Projected Remaining"
                            : "Remaining"}: {item.row.displayRemainingAfterPercent.toFixed(2)}%
                        </span>
                        {item.row.note && <span className="text-muted-foreground">- {item.row.note}</span>}
                      </div>
                    ) : (
                      item.kind === "breakeven" ? (
                        <div key="risk-update-breakeven" className="rounded-lg border border-warning/30 bg-warning/10 p-3">
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            <Badge variant="outline" className="border-warning/40 text-warning">Risk Update</Badge>
                            <span className="text-sm font-semibold text-warning">SL moved to break-even</span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Stop loss now equals entry price, so downside risk is protected at 0R.
                          </p>
                        </div>
                      ) : (
                        <div key="final-trigger-close" className="rounded-lg border border-primary/30 bg-primary/10 p-3">
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            <Badge variant="outline" className="border-primary/40 text-primary">Final Close</Badge>
                            <Badge
                              variant="outline"
                              className={cn(
                                item.statusTone === "success"
                                  ? "border-success/40 text-success"
                                  : item.statusTone === "destructive"
                                    ? "border-destructive/40 text-destructive"
                                    : "border-warning/40 text-warning"
                              )}
                            >
                              {item.statusLabel}
                            </Badge>
                            {item.closePrice !== null && (
                              <span className="font-mono text-sm">Price: {item.closePrice.toFixed(5)}</span>
                            )}
                            <span
                              className={cn(
                                "font-semibold text-sm",
                                item.finalLegPnl >= 0 ? "text-success" : "text-destructive"
                              )}
                            >
                              Profit: {item.finalLegPnl >= 0 ? "+" : ""}${item.finalLegPnl.toFixed(2)}
                            </span>
                            <span className="text-xs text-muted-foreground">Remaining: 0.00%</span>
                          </div>
                        </div>
                      )
                    )
                  )}
                </div>
              )}
            </div>

            <div className="rounded-lg border border-border/50 p-3">
              <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wide">Analysis</p>
              {!hasAnalysis ? (
                <p className="text-sm text-muted-foreground">No analysis provided.</p>
              ) : (
                <div className="space-y-3">
                  {signal?.analysis_notes && (
                    <div className="rounded-md bg-secondary/30 p-3">
                      <div className="flex items-center gap-2 mb-1 text-sm font-medium">
                        <FileText className="w-4 h-4" />
                        Notes
                      </div>
                      <p className="text-sm whitespace-pre-wrap">{signal.analysis_notes}</p>
                    </div>
                  )}
                  {signal?.analysis_video_url && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Play className="w-4 h-4" />
                        Video Analysis
                      </div>
                      {videoId ? (
                        <div className="relative w-full aspect-video rounded-md overflow-hidden border border-border/50">
                          <iframe
                            src={`https://www.youtube.com/embed/${videoId}`}
                            title="Analysis video"
                            className="absolute inset-0 w-full h-full"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                          />
                        </div>
                      ) : null}
                      <a
                        href={signal.analysis_video_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        Open in YouTube <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  )}
                  {signal?.analysis_image_url && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <ImageIcon className="w-4 h-4" />
                        Chart/Image
                      </div>
                      <div className="rounded-md overflow-hidden border border-border/50">
                        {isImageLoading || !resolvedImageUrl ? (
                          <div className="h-48 bg-secondary/30" />
                        ) : (
                          <img
                            src={resolvedImageUrl}
                            alt="Analysis chart"
                            className="w-full h-auto object-contain max-h-[420px]"
                            draggable={false}
                            onContextMenu={(e) => e.preventDefault()}
                          />
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};


