import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, Info } from "lucide-react";
import { SignalTakeProfitUpdate, UserTrade } from "@/types/database";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/contexts/AuthContext";
import { calculateSignedSignalRrForTarget } from "@/lib/trade-math";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { resolveTradeUpdateDisplayType } from "@/lib/trade-update-classification";

interface TradeUpdatesDialogProps {
  trade: UserTrade;
  updates: SignalTakeProfitUpdate[];
  hasUnseen?: boolean;
  unseenCount?: number;
  onViewed?: () => void;
}

type UpdateExecutionStatus =
  | "triggered"
  | "waiting"
  | "ended"
  | "executed"
  | "pending_execution";

const getTpPublishedPayloadInfo = (
  payload: unknown
): { updateId: string | null; updateType: "limit" | "market" | null } => {
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
  const [open, setOpen] = useState(false);
  const [historyTypeByUpdateId, setHistoryTypeByUpdateId] = useState<Record<string, "limit" | "market">>({});
  const [triggeredUpdateIds, setTriggeredUpdateIds] = useState<Record<string, true>>({});
  const [triggeredEventAtByUpdateId, setTriggeredEventAtByUpdateId] = useState<Record<string, string>>({});
  const [triggeredQuotePriceByUpdateId, setTriggeredQuotePriceByUpdateId] = useState<Record<string, number>>({});
  const [breakevenEventAt, setBreakevenEventAt] = useState<string | null>(null);
  const [appliedByUpdateId, setAppliedByUpdateId] = useState<
    Record<string, { closePercent: number; realizedPnl: number }>
  >({});
  const [appliedAtByUpdateId, setAppliedAtByUpdateId] = useState<Record<string, string>>({});
  const isLiveSignal = trade.signal?.market_mode === "live";
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

  useEffect(() => {
    let cancelled = false;
    const signalId = trade.signal?.id || trade.signal_id;
    const updateIds = updateIdsKey ? updateIdsKey.split("|") : [];
    if (!signalId) {
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
        .eq("signal_id", signalId)
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
  }, [trade.signal?.id, trade.signal_id, updateIdsKey, isLiveSignal, updateIdByMatchKey]);

  useEffect(() => {
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
  }, [trade.id, updateIdsKey]);

  useEffect(() => {
    if (!open || !trade.id) return;
    const channel = supabase
      .channel(`trade_updates_applied_${trade.id}`)
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
            setAppliedByUpdateId((prev) => (Object.keys(prev).length === 0 ? prev : {}));
            setAppliedAtByUpdateId((prev) => (Object.keys(prev).length === 0 ? prev : {}));
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

  useEffect(() => {
    if (!open) return;

    const interval = setInterval(async () => {
      const signalId = trade.signal?.id || trade.signal_id;
      const updateIds = updateIdsKey ? updateIdsKey.split("|") : [];
      if (!trade.id || !signalId || updateIds.length === 0) return;

      const [historyRes, appliedRes] = await Promise.all([
        (() => {
          const eventTypes = isLiveSignal
            ? ["tp_update_published", "tp_update_triggered", "sl_breakeven"]
            : ["tp_update_published", "sl_breakeven"];
          return supabase
            .from("signal_event_history" as never)
            .select("event_type, payload, created_at")
            .eq("signal_id", signalId)
            .in("event_type", eventTypes);
        })(),
        supabase
          .from("user_trade_take_profit_updates")
          .select("signal_update_id, close_percent, realized_pnl, created_at")
          .eq("user_trade_id", trade.id)
          .in("signal_update_id", updateIds),
      ]);

      if (!historyRes.error) {
        const nextHistory: Record<string, "limit" | "market"> = {};
        const nextTriggered: Record<string, true> = {};
        const nextTriggeredAt: Record<string, string> = {};
        let nextBreakevenAt: string | null = null;
        const rows = (historyRes.data || []) as Array<{ event_type?: string; payload?: unknown; created_at?: string }>;
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
              nextHistory[updateId] = updateType;
            }
          } else if (isLiveSignal && row.event_type === "tp_update_triggered") {
            nextTriggered[updateId] = true;
            if (typeof row.created_at === "string") {
              const existing = nextTriggeredAt[updateId];
              if (!existing || row.created_at < existing) {
                nextTriggeredAt[updateId] = row.created_at;
              }
            }
          }
        }
        setHistoryTypeByUpdateId(nextHistory);
        setTriggeredUpdateIds(nextTriggered);
        setTriggeredEventAtByUpdateId(nextTriggeredAt);
        setBreakevenEventAt(nextBreakevenAt);
      }

      if (!appliedRes.error) {
        const nextApplied: Record<string, { closePercent: number; realizedPnl: number }> = {};
        const nextAppliedAt: Record<string, string> = {};
        for (const row of appliedRes.data || []) {
          nextApplied[row.signal_update_id] = {
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
        setAppliedByUpdateId(nextApplied);
        setAppliedAtByUpdateId(nextAppliedAt);
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [open, trade.id, trade.signal?.id, trade.signal_id, updateIdsKey, isLiveSignal, updateIdByMatchKey]);

  const { rows, fallbackRemainingPercent, fallbackRemainingRisk } = useMemo(() => {
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
      const resolvedType = resolveTradeUpdateDisplayType({
        rawUpdateType: u.update_type,
        historyUpdateType: historyTypeByUpdateId[u.id] || null,
      });
      const hasTriggerEvent = Boolean(triggeredUpdateIds[u.id]);
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
      const beforeRiskAmount = runningRemainingRisk;
      const beforePercent = initialRisk > 0 ? (beforeRiskAmount / initialRisk) * 100 : 0;
      const closePercent = Math.max(0, Math.min(100, Number(u.close_percent || 0)));
      const executedClosePercent = wasTriggered
        ? Math.max(0, Math.min(100, Number(applied ? applied.closePercent : closePercent)))
        : 0;
      const requestedCloseRisk = initialRisk * (executedClosePercent / 100);
      const reducedRisk = Math.min(runningRemainingRisk, requestedCloseRisk);
      let remainingAfterRisk = Math.max(0, runningRemainingRisk - reducedRisk);
      if (executedClosePercent >= 100) {
        remainingAfterRisk = 0;
      }

      const rr = calculateRR(trade, u.tp_price);
      const executionPrice =
        wasTriggered &&
        typeof triggeredQuotePriceByUpdateId[u.id] === "number" &&
        Number.isFinite(triggeredQuotePriceByUpdateId[u.id])
          ? Number(triggeredQuotePriceByUpdateId[u.id])
          : Number(u.tp_price);
      const rrAtExecutionPrice = calculateRR(trade, executionPrice);
      const realizedProfit = wasTriggered
        ? applied
          ? Number(applied.realizedPnl || 0)
          : reducedRisk * rrAtExecutionPrice
        : 0;
      const remainingAfterPercent =
        initialRisk > 0
          ? (remainingAfterRisk / initialRisk) * 100
          : 0;
      const requestedCloseRiskForDisplay = initialRisk * (closePercent / 100);
      const projectedReducedRisk = Math.min(beforeRiskAmount, requestedCloseRiskForDisplay);
      let projectedRemainingAfterRisk = Math.max(0, beforeRiskAmount - projectedReducedRisk);
      if (closePercent >= 100) {
        projectedRemainingAfterRisk = 0;
      }
      const projectedRemainingAfterPercent =
        initialRisk > 0 ? (projectedRemainingAfterRisk / initialRisk) * 100 : 0;
      const displayRemainingAfterRisk =
        executionStatus === "waiting" || executionStatus === "pending_execution"
          ? projectedRemainingAfterRisk
          : remainingAfterRisk;
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
      const closedPercentOfOriginal =
        initialRisk > 0 ? (reducedRisk / initialRisk) * 100 : 0;
      runningRemainingRisk = remainingAfterRisk;

      return {
        ...u,
        updateType: effectiveUpdateType,
        updateTypeInferredFromHistory: resolvedType.inferredFromHistory,
        executionStatus,
        wasTriggered,
        rr: rrAtExecutionPrice,
        executionPrice,
        closePercent,
        executedClosePercent,
        remainingAfterPercent,
        displayRemainingAfterPercent,
        beforeRiskAmount,
        beforePercent,
        closedRiskAmount: reducedRisk,
        closedPercentOfOriginal,
        remainingAfterRisk,
        displayRemainingAfterRisk,
        realizedProfit,
        activityAt,
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
  }, [
    updates,
    trade,
    appliedByUpdateId,
    appliedAtByUpdateId,
    historyTypeByUpdateId,
    triggeredUpdateIds,
    triggeredEventAtByUpdateId,
    triggeredQuotePriceByUpdateId,
    isLiveSignal,
  ]);

  const initialRisk = Number(trade.initial_risk_amount ?? trade.risk_amount ?? 0);
  const backendRemainingRisk = Math.max(0, Number(trade.remaining_risk_amount ?? fallbackRemainingRisk));
  const remainingRiskForPercent = isLiveSignal
    ? Math.min(backendRemainingRisk, fallbackRemainingRisk)
    : backendRemainingRisk;
  const remainingPercent =
    initialRisk > 0 ? (remainingRiskForPercent / initialRisk) * 100 : fallbackRemainingPercent;
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
  const displayRemainingRisk = hasBreakevenUpdate ? 0 : remainingRiskForPercent;
  const timelineItems = useMemo(() => {
    const items: Array<
      | { kind: "tp"; sortTime: number | null; index: number; row: (typeof rows)[number] }
      | { kind: "breakeven"; sortTime: number | null; index: number }
    > = rows.map((row, index) => {
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
        trade.signal?.updated_at ||
        ""
      );
      items.push({
        kind: "breakeven",
        sortTime: Number.isFinite(parsed) ? parsed : null,
        index: rows.length + 1,
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
  }, [rows, hasBreakevenUpdate, breakevenEventAt, trade.last_update_at, trade.signal?.updated_at]);
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
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) {
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
      <DialogContent aria-describedby={undefined} className="max-w-2xl">
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
              <span className="font-semibold text-foreground">${displayRemainingRisk.toFixed(2)}</span>
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
                          Close {row.closePercent.toFixed(2)}% of original
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
                            {row.displayRemainingAfterPercent.toFixed(2)}% (${row.displayRemainingAfterRisk.toFixed(2)})
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
                      {remainingPercent.toFixed(2)}% (${displayRemainingRisk.toFixed(2)})
                    </p>
                  </div>
                </div>
              </TooltipContent>
            </Tooltip>
          </div>
          {timelineItems.map((item) =>
            item.kind === "tp" ? (
              <div key={item.row.id} className="rounded-lg border border-border/50 p-3">
                <div className="flex flex-wrap items-center gap-2 mb-1">
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
                  <span className="text-sm font-mono">TP: {item.row.tp_price}</span>
                  {item.row.wasTriggered &&
                    Number.isFinite(item.row.executionPrice) &&
                    Math.abs(Number(item.row.executionPrice) - Number(item.row.tp_price)) > 1e-8 && (
                      <span className="text-xs font-mono text-muted-foreground">
                        Fill: {Number(item.row.executionPrice).toFixed(5)}
                      </span>
                    )}
                  <span className="text-sm text-primary font-semibold">Close: {item.row.closePercent.toFixed(2)}%</span>
                  {item.row.wasTriggered ? (
                    <span
                      className={cn(
                        "text-sm font-semibold",
                        item.row.realizedProfit >= 0 ? "text-success" : "text-destructive"
                      )}
                    >
                      {item.row.realizedProfit >= 0 ? "+" : ""}${item.row.realizedProfit.toFixed(2)}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">P&amp;L: --</span>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {item.row.executionStatus === "waiting" || item.row.executionStatus === "pending_execution"
                      ? "Projected Remaining"
                      : "Remaining"}: {item.row.displayRemainingAfterPercent.toFixed(2)}%
                  </span>
                </div>
                {item.row.note && <p className="text-xs text-muted-foreground">{item.row.note}</p>}
              </div>
            ) : (
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
      </DialogContent>
    </Dialog>
  );
};


