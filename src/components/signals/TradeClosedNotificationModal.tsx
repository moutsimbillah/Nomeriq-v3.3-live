import { useEffect, useState, useRef, useCallback } from "react";
import { Signal, SignalTakeProfitUpdate } from "@/types/database";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useBrand } from "@/contexts/BrandContext";
import { Button } from "@/components/ui/button";
import { TrendingUp, TrendingDown, Target, ShieldAlert, CheckCircle2, XCircle, MinusCircle, X, Bell, Percent, DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUserSubscriptionCategories } from "@/hooks/useSubscriptionPackages";
import { resolveTradeUpdateDisplayType } from "@/lib/trade-update-classification";

type NotificationType =
  | "trade_closed"
  | "new_signal"
  | "signal_active"
  | "trade_update"
  | "trade_update_edited"
  | "trade_update_deleted"
  | "sl_breakeven";
type TradeClosedStatus = "tp_hit" | "sl_hit" | "breakeven";

interface UserTrade {
  id: string;
  risk_percent: number;
  risk_amount: number;
  initial_risk_amount?: number | null;
  remaining_risk_amount?: number | null;
  pnl: number | null;
}

interface UserTradeTakeProfitUpdate {
  close_percent: number;
  realized_pnl: number;
}

interface RemainingPositionSnapshot {
  remainingAfterPercent: number;
  remainingAfterRisk: number;
}

interface NotificationItem {
  id: string;
  signal: Signal;
  type: NotificationType;
  status?: TradeClosedStatus;
  userTrade?: UserTrade | null;
  tradeUpdate?: SignalTakeProfitUpdate | null;
  tradeUpdateAction?: "published" | "edited" | "deleted";
  previousTradeUpdate?: SignalTakeProfitUpdate | null;
  historyUpdateType?: "limit" | "market" | null;
  appliedTradeUpdate?: UserTradeTakeProfitUpdate | null;
  triggeredQuotePrice?: number | null;
  remainingAfterPercent?: number | null;
  remainingAfterRisk?: number | null;
  previousStopLoss?: number | null;
}

interface SignalEventHistoryRow {
  id: string;
  signal_id: string;
  event_type: string;
  actor_user_id?: string | null;
  payload?: unknown;
  created_at: string;
}

interface TradeClosedNotificationModalProps {
  onClose?: () => void;
}

const getTpHistoryUpdateType = (
  payload: unknown,
  signalUpdateId: string
): "limit" | "market" | null => {
  if (!payload || typeof payload !== "object") return null;
  const raw = payload as Record<string, unknown>;
  if (raw.update_id !== signalUpdateId) return null;
  return raw.update_type === "limit" || raw.update_type === "market"
    ? raw.update_type
    : null;
};

const parseTpPayloadRow = (
  input: unknown,
  fallback: {
    id: string;
    signalId: string;
    createdAt: string;
    createdBy?: string | null;
  }
): SignalTakeProfitUpdate => {
  const row = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const note = row.note;
  const updateType = row.update_type;
  return {
    id: fallback.id,
    signal_id: fallback.signalId,
    tp_label: typeof row.tp_label === "string" && row.tp_label.trim().length > 0 ? row.tp_label : "TP",
    tp_price: Number(row.tp_price || 0),
    close_percent: Number(row.close_percent || 0),
    update_type: updateType === "market" ? "market" : "limit",
    note: typeof note === "string" ? note : null,
    created_by: fallback.createdBy || "",
    created_at: fallback.createdAt,
  };
};

export const TradeClosedNotificationModal = ({ onClose }: TradeClosedNotificationModalProps) => {
  const { user, subscription, isAdmin, isLoading: authLoading } = useAuth();
  const userId = user?.id ?? null;
  const { settings } = useBrand();
  const { allowedCategories } = useUserSubscriptionCategories();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [isVisible, setIsVisible] = useState(false);
  const [isOffline, setIsOffline] = useState<boolean>(typeof navigator !== "undefined" ? !navigator.onLine : false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const shownNotificationsRef = useRef<Set<string>>(new Set());
  const knownUpcomingSignalIdsRef = useRef<Set<string>>(new Set());
  const lastSignalStopLossRef = useRef<Map<string, number | null>>(new Map());
  const lastSyncAtRef = useRef<string>(new Date().toISOString());
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wentOfflineRef = useRef(false);
  const reloadingRef = useRef(false);
  const [reconnectNonce, setReconnectNonce] = useState(0);

  const showOfflineWarning = useCallback(() => {
    if (!canReceiveRef.current) return;
    setIsOffline(true);
    wentOfflineRef.current = true;
  }, []);

  // Check if user is subscribed
  const isSubscribed = subscription?.status === 'active' &&
    (!subscription.expires_at || new Date(subscription.expires_at) > new Date());

  // CRITICAL: Admins and Signal Providers should NOT receive trading notifications
  // Only active subscribed users should receive notifications
  // This prevents providers from receiving their own signals
  const canReceiveNotifications = !isAdmin && isSubscribed;

  // Use refs for values that should be checked at callback time
  const canReceiveRef = useRef(canReceiveNotifications);
  const userIdRef = useRef(userId);
  const allowedCategoriesRef = useRef<string[]>(allowedCategories as string[]);

  useEffect(() => {
    canReceiveRef.current = canReceiveNotifications;
  }, [canReceiveNotifications]);

  useEffect(() => {
    if (canReceiveNotifications) return;
    setIsOffline(false);
    wentOfflineRef.current = false;
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, [canReceiveNotifications]);

  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  useEffect(() => {
    allowedCategoriesRef.current = allowedCategories as string[];
  }, [allowedCategories]);

  const persistLastSync = useCallback((iso: string) => {
    if (!userIdRef.current) return;
    localStorage.setItem(`notifications:last-sync:${userIdRef.current}`, iso);
  }, []);

  const bumpLastSync = useCallback((isoLike?: string | null) => {
    if (!isoLike) return;
    const nextMs = new Date(isoLike).getTime();
    if (!Number.isFinite(nextMs)) return;
    const currentMs = new Date(lastSyncAtRef.current).getTime();
    if (!Number.isFinite(currentMs) || nextMs > currentMs) {
      lastSyncAtRef.current = new Date(nextMs).toISOString();
      persistLastSync(lastSyncAtRef.current);
    }
  }, [persistLastSync]);

  useEffect(() => {
    if (!userId) return;
    const saved = localStorage.getItem(`notifications:last-sync:${userId}`);
    // Keep lookback window small if no saved state yet.
    const fallback = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    lastSyncAtRef.current = saved || fallback;
  }, [userId]);

  // Use global risk percent for all users
  const riskPercent = settings?.global_risk_percent || 2;

  // Fetch user's trade for the signal
  const fetchUserTrade = useCallback(async (signalId: string) => {
    if (!userIdRef.current) return null;

    try {
      const { data, error } = await supabase
        .from('user_trades')
        .select('id, risk_percent, risk_amount, initial_risk_amount, remaining_risk_amount, pnl')
        .eq('signal_id', signalId)
        .eq('user_id', userIdRef.current)
        .maybeSingle();

      if (error) {
        console.error('[NotificationModal] Error fetching user trade:', error);
        return null;
      }

      return data as UserTrade | null;
    } catch (err) {
      console.error('[NotificationModal] Error fetching user trade:', err);
      return null;
    }
  }, []);

  const fetchAppliedTradeUpdate = useCallback(async (userTradeId: string, signalUpdateId: string) => {
    const maxAttempts = 3;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const { data, error } = await supabase
        .from("user_trade_take_profit_updates")
        .select("close_percent, realized_pnl")
        .eq("user_trade_id", userTradeId)
        .eq("signal_update_id", signalUpdateId)
        .maybeSingle();

      if (error) {
        console.error("[NotificationModal] Error fetching applied TP update:", error);
        return null;
      }
      if (data) return data as UserTradeTakeProfitUpdate;

      if (attempt < maxAttempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, 120));
      }
    }
    return null;
  }, []);

  const fetchHistoryUpdateType = useCallback(async (
    signalId: string,
    signalUpdateId: string
  ): Promise<"limit" | "market" | null> => {
    const { data, error } = await supabase
      .from("signal_event_history" as never)
      .select("payload")
      .eq("signal_id", signalId)
      .eq("event_type", "tp_update_published");

    if (error) {
      console.error("[NotificationModal] Error fetching TP update history:", error);
      return null;
    }

    const rows = (data || []) as Array<{ payload?: unknown }>;
    for (const row of rows) {
      const updateType = getTpHistoryUpdateType(row.payload, signalUpdateId);
      if (updateType) return updateType;
    }

    return null;
  }, []);

  const fetchTriggeredQuotePrice = useCallback(async (
    signalId: string,
    signalUpdateId: string
  ): Promise<number | null> => {
    const { data, error } = await supabase
      .from("signal_event_history" as never)
      .select("payload, created_at")
      .eq("signal_id", signalId)
      .eq("event_type", "tp_update_triggered")
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[NotificationModal] Error fetching TP trigger quote:", error);
      return null;
    }

    for (const row of (data || []) as Array<{ payload?: unknown }>) {
      if (!row.payload || typeof row.payload !== "object") continue;
      const payload = row.payload as Record<string, unknown>;
      if (payload.update_id !== signalUpdateId) continue;
      const rawQuotePrice = payload.quote_price;
      const quotePrice =
        typeof rawQuotePrice === "number"
          ? rawQuotePrice
          : Number(rawQuotePrice);
      if (Number.isFinite(quotePrice)) return quotePrice;
    }

    return null;
  }, []);

  const fetchRemainingPositionSnapshot = useCallback(async (
    userTrade: UserTrade,
    signalId: string,
    throughSignalUpdateId: string
  ): Promise<RemainingPositionSnapshot | null> => {
    const riskBase = Math.max(0, Number(userTrade.initial_risk_amount ?? userTrade.risk_amount ?? 0));
    if (riskBase <= 0) return null;

    const [signalUpdatesResult, appliedUpdatesResult] = await Promise.all([
      supabase
        .from("signal_take_profit_updates")
        .select("id, created_at")
        .eq("signal_id", signalId)
        .order("created_at", { ascending: true }),
      supabase
        .from("user_trade_take_profit_updates")
        .select("signal_update_id, close_percent")
        .eq("user_trade_id", userTrade.id),
    ]);

    if (signalUpdatesResult.error) {
      console.error("[NotificationModal] Error fetching signal TP updates for remaining snapshot:", signalUpdatesResult.error);
      return null;
    }
    if (appliedUpdatesResult.error) {
      console.error("[NotificationModal] Error fetching applied TP updates for remaining snapshot:", appliedUpdatesResult.error);
      return null;
    }

    const appliedBySignalUpdateId = new Map<string, number>();
    for (const row of (appliedUpdatesResult.data || []) as { signal_update_id: string; close_percent: number }[]) {
      appliedBySignalUpdateId.set(row.signal_update_id, Number(row.close_percent || 0));
    }

    let runningRemainingRisk = riskBase;
    for (const row of (signalUpdatesResult.data || []) as { id: string }[]) {
      if (!appliedBySignalUpdateId.has(row.id)) continue;

      const closePercent = Math.max(0, Math.min(100, Number(appliedBySignalUpdateId.get(row.id) || 0)));
      const requestedCloseRisk = riskBase * (closePercent / 100);
      const reducedRisk = Math.min(runningRemainingRisk, requestedCloseRisk);
      runningRemainingRisk = Math.max(0, runningRemainingRisk - reducedRisk);
      if (closePercent >= 100) {
        runningRemainingRisk = 0;
      }

      if (row.id === throughSignalUpdateId) {
        return {
          remainingAfterRisk: runningRemainingRisk,
          remainingAfterPercent: (runningRemainingRisk / riskBase) * 100,
        };
      }
    }

    return null;
  }, []);

  const fetchSignalById = useCallback(async (signalId: string) => {
    try {
      const { data, error } = await supabase
        .from("signals")
        .select("*")
        .eq("id", signalId)
        .maybeSingle();

      if (error) {
        console.error("[NotificationModal] Error fetching signal for trade update:", error);
        return null;
      }

      return (data as Signal | null) ?? null;
    } catch (err) {
      console.error("[NotificationModal] Error fetching signal for trade update:", err);
      return null;
    }
  }, []);

  // Calculate closed-trade P&L from stored trade values (single source of truth).
  const calculatePnL = (trade: UserTrade | null) => {
    if (!trade) return { amount: 0, percent: 0 };
    const amount = Number(trade.pnl || 0);
    const riskBase = Math.max(0, Number(trade.initial_risk_amount ?? trade.risk_amount ?? 0));
    const riskPercent = Number(trade.risk_percent || 0);
    const percent = riskBase > 0 ? (amount / riskBase) * riskPercent : 0;
    return { amount, percent };
  };

  // Add new notification
  const addNotification = useCallback((notification: NotificationItem) => {
    setNotifications(prev => [...prev, notification]);
    setIsVisible(true);

    // Play notification sound
    if (audioRef.current) {
      audioRef.current.play().catch(() => { });
    }
  }, []);

  const processSignalInsert = useCallback((newSignal: Signal, source: "realtime" | "catchup" = "realtime") => {
    if (!canReceiveRef.current) return;
    const currentStopLoss =
      newSignal.stop_loss === null || newSignal.stop_loss === undefined
        ? null
        : Number(newSignal.stop_loss);
    lastSignalStopLossRef.current.set(
      newSignal.id,
      currentStopLoss !== null && Number.isFinite(currentStopLoss) ? currentStopLoss : null
    );
    bumpLastSync(newSignal.created_at || newSignal.updated_at);
    if (
      allowedCategoriesRef.current.length > 0 &&
      !allowedCategoriesRef.current.includes(newSignal.category)
    ) {
      return;
    }
    if (newSignal.signal_type === "upcoming" || newSignal.status === "upcoming") {
      knownUpcomingSignalIdsRef.current.add(newSignal.id);
      return;
    }
    if (newSignal.signal_type !== "signal") return;

    const notificationKey = `new-signal-${newSignal.id}`;
    if (shownNotificationsRef.current.has(notificationKey)) return;

    if (source === "realtime") {
      const signalTime = new Date(newSignal.created_at).getTime();
      const now = Date.now();
      if (now - signalTime > 300000) return;
    }

    shownNotificationsRef.current.add(notificationKey);
    addNotification({
      id: notificationKey,
      signal: newSignal,
      type: "new_signal",
    });
  }, [addNotification, bumpLastSync]);

  const processSignalUpdate = useCallback(async (updatedSignal: Signal, oldSignal?: Partial<Signal> | null, source: "realtime" | "catchup" = "realtime") => {
    if (!canReceiveRef.current) return;
    bumpLastSync(updatedSignal.updated_at || updatedSignal.created_at);
    if (
      allowedCategoriesRef.current.length > 0 &&
      !allowedCategoriesRef.current.includes(updatedSignal.category)
    ) {
      return;
    }
    const rememberStopLoss = () => {
      const currentStopLoss =
        updatedSignal.stop_loss === null || updatedSignal.stop_loss === undefined
          ? null
          : Number(updatedSignal.stop_loss);
      lastSignalStopLossRef.current.set(
        updatedSignal.id,
        currentStopLoss !== null && Number.isFinite(currentStopLoss) ? currentStopLoss : null
      );
    };

    const knownPreviousStopLoss = lastSignalStopLossRef.current.get(updatedSignal.id);
    const previousStopLossFromPayload =
      oldSignal?.stop_loss === null || oldSignal?.stop_loss === undefined
        ? null
        : Number(oldSignal.stop_loss);
    const previousStopLossNum =
      previousStopLossFromPayload !== null && Number.isFinite(previousStopLossFromPayload)
        ? previousStopLossFromPayload
        : knownPreviousStopLoss ?? null;

    const entryPrice = Number(updatedSignal.entry_price);
    const stopLoss = Number(updatedSignal.stop_loss);
    const trackingStatus = (updatedSignal.tracking_status || "").toLowerCase();
    const previousTrackingStatus = ((oldSignal as { tracking_status?: string | null } | null)?.tracking_status || "").toLowerCase();

    const movedToBreakeven =
      updatedSignal.signal_type === "signal" &&
      updatedSignal.status === "active" &&
      Number.isFinite(entryPrice) &&
      Number.isFinite(stopLoss) &&
      Math.abs(stopLoss - entryPrice) < 1e-8 &&
      (
        (trackingStatus === "breakeven_moved" && previousTrackingStatus !== "breakeven_moved") ||
        (previousStopLossNum !== null &&
          Number.isFinite(previousStopLossNum) &&
          Math.abs(previousStopLossNum - entryPrice) > 1e-8)
      );

    if (updatedSignal.signal_type === "upcoming" || updatedSignal.status === "upcoming") {
      knownUpcomingSignalIdsRef.current.add(updatedSignal.id);
    }

    const currentStatus = updatedSignal.status?.toLowerCase();
    const previousStatus = oldSignal?.status?.toLowerCase();

    const closedStatuses = ["tp_hit", "sl_hit", "breakeven"];
    const isClosingTrade = closedStatuses.includes(currentStatus || "");
    const wasNotClosed = !previousStatus || !closedStatuses.includes(previousStatus);

    if (isClosingTrade && wasNotClosed) {
      const closureKey = `trade-closed-${updatedSignal.id}-${currentStatus}`;
      if (shownNotificationsRef.current.has(closureKey)) {
        rememberStopLoss();
        return;
      }

      const trade = await fetchUserTrade(updatedSignal.id);
      shownNotificationsRef.current.add(closureKey);

      addNotification({
        id: closureKey,
        signal: updatedSignal,
        type: "trade_closed",
        status: currentStatus as TradeClosedStatus,
        userTrade: trade,
      });
      rememberStopLoss();
      return;
    }

    const hasAllPrices =
      updatedSignal.entry_price !== null &&
      updatedSignal.entry_price !== undefined &&
      updatedSignal.stop_loss !== null &&
      updatedSignal.stop_loss !== undefined &&
      updatedSignal.take_profit !== null &&
      updatedSignal.take_profit !== undefined;

    const isClosedLike =
      closedStatuses.includes(updatedSignal.status as TradeClosedStatus) ||
      ["closed", "cancelled"].includes(updatedSignal.status);

    const becameSignalType =
      oldSignal?.signal_type === "upcoming" && updatedSignal.signal_type === "signal";
    const becameActiveFromUpcomingStatus =
      oldSignal?.status === "upcoming" && updatedSignal.status === "active";

    const isSignalActivation =
      !isClosedLike &&
      hasAllPrices &&
      (becameSignalType || becameActiveFromUpcomingStatus) &&
      updatedSignal.signal_type === "signal";

    if (isSignalActivation) {
      const wasKnownUpcoming = knownUpcomingSignalIdsRef.current.has(updatedSignal.id);
      knownUpcomingSignalIdsRef.current.delete(updatedSignal.id);
      const newSignalKey = `new-signal-${updatedSignal.id}`;
      // Prevent duplicate UX: a directly published live signal should only show "Buy/Sell Signal",
      // not an additional "Signal Now Active" card for the same signal id.
      if (shownNotificationsRef.current.has(newSignalKey)) {
        rememberStopLoss();
        return;
      }

      if (!wasKnownUpcoming) {
        shownNotificationsRef.current.add(newSignalKey);
        addNotification({
          id: newSignalKey,
          signal: updatedSignal,
          type: "new_signal",
        });
        rememberStopLoss();
        return;
      }

      const activationKey = `signal-active-${updatedSignal.id}`;
      if (shownNotificationsRef.current.has(activationKey)) return;
      shownNotificationsRef.current.add(activationKey);
      addNotification({
        id: activationKey,
        signal: updatedSignal,
        type: "signal_active",
      });
      rememberStopLoss();
      return;
    }

    if (movedToBreakeven) {
      const beKey = `sl-breakeven-${updatedSignal.id}-${updatedSignal.updated_at || ""}`;
      if (!shownNotificationsRef.current.has(beKey)) {
        const trade = await fetchUserTrade(updatedSignal.id);
        shownNotificationsRef.current.add(beKey);
        addNotification({
          id: beKey,
          signal: updatedSignal,
          type: "sl_breakeven",
          userTrade: trade,
          previousStopLoss: previousStopLossNum,
        });
      }
      rememberStopLoss();
      return;
    }

    rememberStopLoss();
  }, [addNotification, bumpLastSync, fetchUserTrade]);

  const processTradeUpdateInsert = useCallback(async (
    updateRow: SignalTakeProfitUpdate,
    source: "realtime" | "catchup" = "realtime"
  ) => {
    if (!canReceiveRef.current) return;
    bumpLastSync(updateRow.created_at);

    const notificationKey = `trade-update-${updateRow.id}`;
    if (shownNotificationsRef.current.has(notificationKey)) return;

    if (source === "realtime") {
      const updateTimeMs = new Date(updateRow.created_at).getTime();
      if (Number.isFinite(updateTimeMs) && Date.now() - updateTimeMs > 300000) {
        return;
      }
    }

    const signal = await fetchSignalById(updateRow.signal_id);
    if (!signal) return;

    if (
      allowedCategoriesRef.current.length > 0 &&
      !allowedCategoriesRef.current.includes(signal.category)
    ) {
      return;
    }

    const trade = await fetchUserTrade(signal.id);
    if (!trade) return;

    const applied = await fetchAppliedTradeUpdate(trade.id, updateRow.id);
    // Skip popup when this update did not actually apply to this user's trade
    // (prevents misleading values after trade is already fully closed).
    if (!applied) return;

    const refreshedTrade = await fetchUserTrade(signal.id);
    const tradeForDisplay = refreshedTrade || trade;
    const historyUpdateType = await fetchHistoryUpdateType(signal.id, updateRow.id);
    const triggeredQuotePrice = await fetchTriggeredQuotePrice(signal.id, updateRow.id);
    const remainingSnapshot = await fetchRemainingPositionSnapshot(
      tradeForDisplay,
      signal.id,
      updateRow.id
    );

    shownNotificationsRef.current.add(notificationKey);
    addNotification({
      id: notificationKey,
      signal,
      type: "trade_update",
      tradeUpdateAction: "published",
      userTrade: tradeForDisplay,
      tradeUpdate: updateRow,
      historyUpdateType,
      appliedTradeUpdate: applied,
      triggeredQuotePrice,
      remainingAfterPercent: remainingSnapshot?.remainingAfterPercent ?? null,
      remainingAfterRisk: remainingSnapshot?.remainingAfterRisk ?? null,
    });
  }, [
    addNotification,
    bumpLastSync,
    fetchAppliedTradeUpdate,
    fetchHistoryUpdateType,
    fetchTriggeredQuotePrice,
    fetchRemainingPositionSnapshot,
    fetchSignalById,
    fetchUserTrade,
  ]);

  const processTradeUpdateChangeEventInsert = useCallback(async (
    eventRow: SignalEventHistoryRow,
    source: "realtime" | "catchup" = "realtime"
  ) => {
    if (!canReceiveRef.current) return;
    if (eventRow.event_type !== "tp_update_edited" && eventRow.event_type !== "tp_update_deleted") {
      return;
    }

    bumpLastSync(eventRow.created_at);
    const notificationKey = `${eventRow.event_type}-${eventRow.id}`;
    if (shownNotificationsRef.current.has(notificationKey)) return;

    if (source === "realtime") {
      const eventTimeMs = new Date(eventRow.created_at).getTime();
      if (Number.isFinite(eventTimeMs) && Date.now() - eventTimeMs > 300000) {
        return;
      }
    }

    const payload =
      eventRow.payload && typeof eventRow.payload === "object"
        ? (eventRow.payload as Record<string, unknown>)
        : null;
    if (!payload) return;
    const updateId = typeof payload.update_id === "string" ? payload.update_id : null;
    if (!updateId) return;

    const signal = await fetchSignalById(eventRow.signal_id);
    if (!signal) return;
    if (
      allowedCategoriesRef.current.length > 0 &&
      !allowedCategoriesRef.current.includes(signal.category)
    ) {
      return;
    }

    const trade = await fetchUserTrade(signal.id);
    if (!trade) return;

    if (eventRow.event_type === "tp_update_edited") {
      const nextUpdate = parseTpPayloadRow(payload.new, {
        id: updateId,
        signalId: signal.id,
        createdAt: eventRow.created_at,
        createdBy: eventRow.actor_user_id || null,
      });
      if (nextUpdate.update_type !== "limit") return;
      const previousUpdate = parseTpPayloadRow(payload.old, {
        id: updateId,
        signalId: signal.id,
        createdAt: eventRow.created_at,
        createdBy: eventRow.actor_user_id || null,
      });

      shownNotificationsRef.current.add(notificationKey);
      addNotification({
        id: notificationKey,
        signal,
        type: "trade_update_edited",
        tradeUpdateAction: "edited",
        userTrade: trade,
        tradeUpdate: nextUpdate,
        previousTradeUpdate: previousUpdate,
        historyUpdateType: "limit",
      });
      return;
    }

    const deletedUpdate = parseTpPayloadRow(payload, {
      id: updateId,
      signalId: signal.id,
      createdAt: eventRow.created_at,
      createdBy: eventRow.actor_user_id || null,
    });
    if (deletedUpdate.update_type !== "limit") return;

    shownNotificationsRef.current.add(notificationKey);
    addNotification({
      id: notificationKey,
      signal,
      type: "trade_update_deleted",
      tradeUpdateAction: "deleted",
      userTrade: trade,
      tradeUpdate: deletedUpdate,
      historyUpdateType: "limit",
    });
  }, [addNotification, bumpLastSync, fetchSignalById, fetchUserTrade]);

  const fetchMissedNotifications = useCallback(async (emitNotifications = false) => {
    if (!userIdRef.current || !canReceiveRef.current) return;
    const since = lastSyncAtRef.current;
    try {
      const { data, error } = await supabase
        .from("signals")
        .select("*")
        .or(`created_at.gt.${since},updated_at.gt.${since}`)
        .order("updated_at", { ascending: true })
        .limit(200);

      if (error) {
        console.error("[NotificationModal] Error fetching missed notifications:", error);
        return;
      }

      for (const signal of data || []) {
        const sig = signal as Signal;
        const createdAtMs = new Date(sig.created_at).getTime();
        const sinceMs = new Date(since).getTime();

        if (emitNotifications) {
          if (Number.isFinite(createdAtMs) && createdAtMs > sinceMs) {
            processSignalInsert(sig, "catchup");
          }
          await processSignalUpdate(sig, null, "catchup");
        } else {
          const stopLoss =
            sig.stop_loss === null || sig.stop_loss === undefined ? null : Number(sig.stop_loss);
          lastSignalStopLossRef.current.set(
            sig.id,
            stopLoss !== null && Number.isFinite(stopLoss) ? stopLoss : null
          );
          bumpLastSync(sig.updated_at || sig.created_at);
        }
      }

      const { data: missedTradeUpdates, error: tradeUpdateError } = await supabase
        .from("signal_take_profit_updates")
        .select("*")
        .gt("created_at", since)
        .order("created_at", { ascending: true })
        .limit(200);

      if (tradeUpdateError) {
        console.error("[NotificationModal] Error fetching missed trade updates:", tradeUpdateError);
        return;
      }

      for (const update of (missedTradeUpdates || []) as SignalTakeProfitUpdate[]) {
        if (emitNotifications) {
          await processTradeUpdateInsert(update, "catchup");
        } else {
          bumpLastSync(update.created_at);
        }
      }

      const { data: missedTpEvents, error: tpEventsError } = await supabase
        .from("signal_event_history" as never)
        .select("id, signal_id, event_type, actor_user_id, payload, created_at")
        .gt("created_at", since)
        .in("event_type", ["tp_update_edited", "tp_update_deleted"])
        .order("created_at", { ascending: true })
        .limit(200);

      if (tpEventsError) {
        console.error("[NotificationModal] Error fetching missed TP change events:", tpEventsError);
        return;
      }

      for (const eventRow of (missedTpEvents || []) as SignalEventHistoryRow[]) {
        if (emitNotifications) {
          await processTradeUpdateChangeEventInsert(eventRow, "catchup");
        } else {
          bumpLastSync(eventRow.created_at);
        }
      }
    } catch (err) {
      console.error("[NotificationModal] Error during missed notifications fetch:", err);
    }
  }, [
    processSignalInsert,
    processSignalUpdate,
    processTradeUpdateInsert,
    processTradeUpdateChangeEventInsert,
    bumpLastSync,
  ]);

  // Remove single notification
  const removeNotification = useCallback((id: string) => {
    setNotifications(prev => {
      const updated = prev.filter(n => n.id !== id);
      if (updated.length === 0) {
        setIsVisible(false);
      }
      return updated;
    });
  }, []);

  // Close all notifications
  const handleCloseAll = useCallback(() => {
    setIsVisible(false);
    setTimeout(() => {
      setNotifications([]);
      onClose?.();
    }, 300);
  }, [onClose]);

  useEffect(() => {
    if (authLoading || !userId || !canReceiveNotifications) return;

    const channelName = `unified-notification-modal-${userId}-${reconnectNonce}`;
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "signals",
        },
        (payload) => {
          processSignalInsert(payload.new as Signal);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "signals",
        },
        async (payload) => {
          await processSignalUpdate(payload.new as Signal, payload.old as Partial<Signal> | null, "realtime");
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "signal_take_profit_updates",
        },
        async (payload) => {
          await processTradeUpdateInsert(payload.new as SignalTakeProfitUpdate, "realtime");
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "signal_event_history",
        },
        async (payload) => {
          const row = payload.new as SignalEventHistoryRow;
          if (row.event_type === "tp_update_edited" || row.event_type === "tp_update_deleted") {
            await processTradeUpdateChangeEventInsert(row, "realtime");
          }
        }
      )
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          if (wentOfflineRef.current && !reloadingRef.current) {
            reloadingRef.current = true;
            setTimeout(() => window.location.reload(), 900);
            return;
          }
          await fetchMissedNotifications(false);
          return;
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          showOfflineWarning();
          if (!reconnectTimeoutRef.current) {
            reconnectTimeoutRef.current = setTimeout(() => {
              reconnectTimeoutRef.current = null;
              setReconnectNonce((n) => n + 1);
            }, 1200);
          }
        }
      });

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      supabase.removeChannel(channel);
    };
  }, [
    userId,
    authLoading,
    canReceiveNotifications,
    reconnectNonce,
    processSignalInsert,
    processSignalUpdate,
    processTradeUpdateInsert,
    processTradeUpdateChangeEventInsert,
    fetchMissedNotifications,
    showOfflineWarning,
  ]);

  useEffect(() => {
    if (!canReceiveNotifications) return;

    const handleOnline = () => {
      setIsOffline(false);
      if (wentOfflineRef.current && !reloadingRef.current) {
        reloadingRef.current = true;
        setTimeout(() => window.location.reload(), 900);
        return;
      }
      void fetchMissedNotifications(true);
      setReconnectNonce((n) => n + 1);
    };
    const handleOffline = () => {
      showOfflineWarning();
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void fetchMissedNotifications(true);
      }
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [canReceiveNotifications, fetchMissedNotifications, showOfflineWarning]);

  // Fallback polling so users still receive popups even if realtime events are delayed/missing.
  useEffect(() => {
    if (authLoading || !userId || !canReceiveNotifications) return;

    const interval = setInterval(() => {
      void fetchMissedNotifications(true);
    }, 12000);

    return () => clearInterval(interval);
  }, [authLoading, userId, canReceiveNotifications, fetchMissedNotifications]);

  // Dedicated instant listener so warning appears immediately on browser disconnect.
  useEffect(() => {
    if (!canReceiveNotifications) return;

    const onImmediateOffline = () => {
      showOfflineWarning();
    };

    window.addEventListener("offline", onImmediateOffline);
    return () => {
      window.removeEventListener("offline", onImmediateOffline);
    };
  }, [canReceiveNotifications, showOfflineWarning]);

  const getStatusConfig = (status: TradeClosedStatus) => {
    switch (status) {
      case 'tp_hit':
        return {
          icon: CheckCircle2,
          label: 'Take Profit Hit',
          subtitle: 'Trade Closed in Profit',
          bgClass: 'bg-success/10',
          borderClass: 'border-success/30',
          textClass: 'text-success',
          iconBgClass: 'bg-success/20',
        };
      case 'sl_hit':
        return {
          icon: XCircle,
          label: 'Stop Loss Hit',
          subtitle: 'Trade Closed at Loss',
          bgClass: 'bg-destructive/10',
          borderClass: 'border-destructive/30',
          textClass: 'text-destructive',
          iconBgClass: 'bg-destructive/20',
        };
      case 'breakeven':
        return {
          icon: MinusCircle,
          label: 'Breakeven',
          subtitle: 'Trade Closed at Entry',
          bgClass: 'bg-warning/10',
          borderClass: 'border-warning/30',
          textClass: 'text-warning',
          iconBgClass: 'bg-warning/20',
        };
    }
  };

  // Format P&L display
  const formatPnL = (amount: number) => {
    const sign = amount >= 0 ? '+' : '';
    return `${sign}$${Math.abs(amount).toFixed(2)}`;
  };

  const formatPercent = (percent: number) => {
    const sign = percent >= 0 ? '+' : '';
    return `${sign}${percent.toFixed(2)}%`;
  };

  // Get notification count by type
  const getNotificationTitle = () => {
    const count = notifications.length;
    const types = new Set(notifications.map(n => n.type));

    if (types.size === 1) {
      const type = notifications[0].type;
      if (type === 'trade_closed') return `${count} Trade${count > 1 ? 's' : ''} Closed`;
      if (type === 'new_signal') return `${count} New Signal${count > 1 ? 's' : ''}`;
      if (type === 'signal_active') return `${count} Signal${count > 1 ? 's' : ''} Now Active`;
      if (type === 'trade_update') return `${count} Trade Update${count > 1 ? 's' : ''}`;
      if (type === 'trade_update_edited') return `${count} Trade Update Edit${count > 1 ? 's' : ''}`;
      if (type === 'trade_update_deleted') return `${count} Trade Update Deletion${count > 1 ? 's' : ''}`;
      if (type === 'sl_breakeven') return `${count} Risk Update${count > 1 ? 's' : ''}`;
    }
    return `${count} Notification${count > 1 ? 's' : ''}`;
  };

  // Render New Signal notification
  const renderNewSignalNotification = (notification: NotificationItem) => {
    const { signal } = notification;
    const isBuy = signal.direction === 'BUY';

    return (
      <div
        key={notification.id}
        className="rounded-2xl border border-[#1e293b] bg-[#0b1121] shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-300"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#1e293b] relative">
          <button
            onClick={() => removeNotification(notification.id)}
            className="absolute top-4 right-4 p-1 rounded-full hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4 text-slate-400" />
          </button>

          <div className="flex items-center gap-3">
            <div className={cn(
              "w-10 h-10 rounded-full flex items-center justify-center",
              isBuy ? "bg-[#00c07f]/20" : "bg-[#ef4444]/20"
            )}>
              <CheckCircle2 className={cn("w-5 h-5", isBuy ? "text-[#00c07f]" : "text-[#ef4444]")} />
            </div>
            <div>
              <h3 className={cn("text-base font-bold", isBuy ? "text-[#00c07f]" : "text-[#ef4444]")}>
                {isBuy ? 'Buy Signal' : 'Sell Signal'}
              </h3>
              <p className="text-xs font-medium text-slate-400">Trade Signal Received</p>
            </div>
          </div>
        </div>

        {/* Pair Info */}
        <div className="px-5 py-3 flex items-center justify-between bg-black/20">
          <div className="flex items-center gap-2">
            <span className={cn(
              "px-2.5 py-1 rounded text-xs font-black uppercase tracking-wider text-white",
              isBuy ? "bg-[#00c07f]" : "bg-[#ef4444]"
            )}>
              {signal.direction}
            </span>
            <span className="text-lg font-bold text-white">{signal.pair}</span>
          </div>
          <span className="text-xs text-slate-500 font-bold uppercase tracking-widest">{signal.category}</span>
        </div>

        {/* Prices */}
        <div className="px-5 py-5 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl p-3 text-center border border-white/5 bg-white/5">
              <p className="text-[10px] text-slate-400 uppercase tracking-widest mb-1">Entry</p>
              <p className="font-mono font-bold text-base text-white">{signal.entry_price ?? '-'}</p>
            </div>

            <div className="rounded-xl p-3 text-center border border-[#ef4444]/20 bg-[#ef4444]/10">
              <p className="text-[10px] text-[#ef4444] uppercase tracking-widest mb-1 flex items-center justify-center gap-1">SL</p>
              <p className="font-mono font-bold text-base text-[#ef4444]">{signal.stop_loss ?? '-'}</p>
            </div>

            <div className="rounded-xl p-3 text-center border border-[#00c07f]/20 bg-[#00c07f]/10">
              <p className="text-[10px] text-[#00c07f] uppercase tracking-widest mb-1 flex items-center justify-center gap-1">TP</p>
              <p className="font-mono font-bold text-base text-[#00c07f]">{signal.take_profit ?? '-'}</p>
            </div>
          </div>

          <div className="bg-orange-500/10 rounded-xl p-3 border border-orange-500/20 text-center flex items-center justify-between px-4">
            <span className="text-xs text-slate-400 font-medium">Risk Per Trade</span>
            <span className="text-lg font-bold text-orange-400">{riskPercent}%</span>
          </div>
        </div>

        {/* Button */}
        <div className="px-5 pb-5">
          <Button
            onClick={() => removeNotification(notification.id)}
            className={cn(
              "w-full h-12 font-bold text-white shadow-lg transition-all border-0",
              isBuy ? "bg-[#00c07f] hover:bg-[#00a06b]" : "bg-[#ef4444] hover:bg-[#dc2626]"
            )}
          >
            Got it
          </Button>
        </div>
      </div>
    );
  };

  // Render Signal Active notification (upcoming became active)
  const renderSignalActiveNotification = (notification: NotificationItem) => {
    const { signal } = notification;
    const isBuy = signal.direction === 'BUY';

    return (
      <div
        key={notification.id}
        className="rounded-2xl border border-[#1e293b] bg-[#0b1121] shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-300"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#1e293b] relative">
          <button
            onClick={() => removeNotification(notification.id)}
            className="absolute top-4 right-4 p-1 rounded-full hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4 text-slate-400" />
          </button>

          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-full bg-blue-500/20">
              <Bell className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <h3 className="text-base font-bold text-blue-500">Signal Now Active</h3>
              <p className="text-xs font-medium text-slate-400">Upcoming trade is now live</p>
            </div>
          </div>
        </div>

        {/* Trade Details */}
        <div className="p-4 space-y-3">
          {/* Pair and Direction */}
          <div className="px-5 py-3 flex items-center justify-between bg-black/20 rounded-xl">
            <div className="flex items-center gap-2">
              <span className={cn(
                "px-2.5 py-1 rounded text-xs font-black uppercase tracking-wider text-white",
                isBuy ? "bg-[#00c07f]" : "bg-[#ef4444]"
              )}>
                {signal.direction}
              </span>
              <span className="text-lg font-bold text-white">{signal.pair}</span>
            </div>
            <span className="text-xs text-slate-500 font-bold uppercase tracking-widest">{signal.category}</span>
          </div>

          {/* Risk Per Trade */}
          <div className="bg-orange-500/10 rounded-xl p-3 border border-orange-500/20 text-center flex items-center justify-between px-4">
            <span className="text-xs text-slate-400 font-medium">Risk Per Trade</span>
            <span className="text-lg font-bold text-orange-400">{riskPercent}%</span>
          </div>

          {/* Price Details Grid */}
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl p-3 text-center border border-white/5 bg-white/5">
              <p className="text-[10px] text-slate-400 uppercase tracking-widest mb-1">Entry</p>
              <p className="font-mono font-bold text-base text-white">{signal.entry_price ?? '-'}</p>
            </div>
            <div className="rounded-xl p-3 text-center border border-[#ef4444]/20 bg-[#ef4444]/10">
              <p className="text-[10px] text-[#ef4444] uppercase tracking-widest mb-1">SL</p>
              <p className="font-mono font-bold text-base text-[#ef4444]">{signal.stop_loss ?? "-"}</p>
            </div>
            <div className="rounded-xl p-3 text-center border border-[#00c07f]/20 bg-[#00c07f]/10">
              <p className="text-[10px] text-[#00c07f] uppercase tracking-widest mb-1">TP</p>
              <p className="font-mono font-bold text-base text-[#00c07f]">{signal.take_profit ?? "-"}</p>
            </div>
          </div>
        </div>

        {/* Footer Button */}
        <div className="px-4 pb-4">
          <Button
            onClick={() => removeNotification(notification.id)}
            className="w-full h-12 font-bold text-white bg-blue-500 hover:bg-blue-600 shadow-lg border-0"
          >
            Got it
          </Button>
        </div>
      </div>
    );
  };

  // Render Trade Closed notification
  const renderTradeClosedNotification = (notification: NotificationItem) => {
    const { signal, status, userTrade } = notification;
    if (!status) return null;

    const statusConfig = getStatusConfig(status);
    const StatusIcon = statusConfig.icon;
    const isBuy = signal.direction === 'BUY';
    const pnl = calculatePnL(userTrade || null);

    return (
      <div
        key={notification.id}
        className="rounded-2xl border border-[#1e293b] bg-[#0b1121] shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-300"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#1e293b] relative">
          <button
            onClick={() => removeNotification(notification.id)}
            className="absolute top-4 right-4 p-1 rounded-full hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4 text-slate-400" />
          </button>

          <div className="flex items-center gap-3">
            <div className={cn(
              "w-10 h-10 rounded-full flex items-center justify-center",
              status === 'tp_hit' ? "bg-[#00c07f]/20" : status === 'sl_hit' ? "bg-[#ef4444]/20" : "bg-orange-500/20"
            )}>
              <StatusIcon className={cn("w-5 h-5", status === 'tp_hit' ? "text-[#00c07f]" : status === 'sl_hit' ? "text-[#ef4444]" : "text-orange-500")} />
            </div>
            <div>
              <h3 className={cn("text-base font-bold", status === 'tp_hit' ? "text-[#00c07f]" : status === 'sl_hit' ? "text-[#ef4444]" : "text-orange-500")}>
                {statusConfig.label}
              </h3>
              <p className="text-xs font-medium text-slate-400">{statusConfig.subtitle}</p>
            </div>
          </div>
        </div>

        {/* Trade Details */}
        <div className="px-5 py-4 space-y-4">
          {/* Pair Info */}
          <div className="flex items-center justify-between bg-black/20 rounded-xl p-3">
            <div className="flex items-center gap-2">
              <span className={cn(
                "px-2.5 py-1 rounded text-xs font-black uppercase tracking-wider text-white",
                isBuy ? "bg-[#00c07f]" : "bg-[#ef4444]"
              )}>
                {signal.direction}
              </span>
              <span className="text-lg font-bold text-white">{signal.pair}</span>
            </div>
            <span className="text-xs text-slate-500 font-bold uppercase tracking-widest">{signal.category}</span>
          </div>

          {/* Price Grid */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl p-2 text-center border border-white/5 bg-white/5">
              <p className="text-[9px] text-slate-400 uppercase tracking-widest mb-0.5">Entry</p>
              <p className="font-mono font-bold text-xs text-white">{signal.entry_price ?? "-"}</p>
            </div>
            <div className="rounded-xl p-2 text-center border border-[#ef4444]/20 bg-[#ef4444]/10">
              <p className="text-[9px] text-[#ef4444] uppercase tracking-widest mb-0.5">SL</p>
              <p className="font-mono font-bold text-xs text-[#ef4444]">{signal.stop_loss ?? "-"}</p>
            </div>
            <div className="rounded-xl p-2 text-center border border-[#00c07f]/20 bg-[#00c07f]/10">
              <p className="text-[9px] text-[#00c07f] uppercase tracking-widest mb-0.5">TP</p>
              <p className="font-mono font-bold text-xs text-[#00c07f]">{signal.take_profit ?? "-"}</p>
            </div>
          </div>

          {/* P&L Result */}
          {status !== 'breakeven' && (
            <div className={cn(
              "rounded-xl p-4 text-center border-2",
              status === 'tp_hit'
                ? "bg-[#00c07f]/10 border-[#00c07f]/30"
                : "bg-[#ef4444]/10 border-[#ef4444]/30"
            )}>
              <p className={cn("text-xs uppercase tracking-widest mb-1 font-bold", status === 'tp_hit' ? "text-[#00c07f]" : "text-[#ef4444]")}>
                {status === 'tp_hit' ? 'Profit' : 'Loss'}
              </p>
              <p className={cn("text-3xl font-black font-mono mb-1", status === 'tp_hit' ? "text-[#00c07f]" : "text-[#ef4444]")}>
                {formatPnL(pnl.amount)}
              </p>
              <p className={cn("text-sm font-bold opacity-80", status === 'tp_hit' ? "text-[#00c07f]" : "text-[#ef4444]")}>
                {formatPercent(pnl.percent)}
              </p>
            </div>
          )}
        </div>

        {/* Footer Button */}
        <div className="px-5 pb-5">
          <Button
            onClick={() => removeNotification(notification.id)}
            className={cn(
              "w-full h-12 font-bold text-white shadow-lg transition-all border-0",
              status === 'tp_hit'
                ? "bg-[#00c07f] hover:bg-[#00a06b]"
                : status === 'sl_hit'
                  ? "bg-[#ef4444] hover:bg-[#dc2626]"
                  : "bg-orange-500 hover:bg-orange-600"
            )}
          >
            Got it
          </Button>
        </div>
      </div>
    );
  };

  const renderTradeUpdateNotification = (notification: NotificationItem) => {
    const { signal, tradeUpdate, userTrade, appliedTradeUpdate, previousTradeUpdate } = notification;
    if (!tradeUpdate) return null;

    const action: "published" | "edited" | "deleted" =
      notification.tradeUpdateAction ||
      (notification.type === "trade_update_edited"
        ? "edited"
        : notification.type === "trade_update_deleted"
          ? "deleted"
          : "published");

    const resolvedType = resolveTradeUpdateDisplayType({
      rawUpdateType: tradeUpdate.update_type,
      historyUpdateType: notification.historyUpdateType || null,
    });
    const updateType = resolvedType.type;
    const riskBase = Math.max(0, Number(userTrade?.initial_risk_amount ?? userTrade?.risk_amount ?? 0));
    const fallbackRemainingRisk = Math.max(
      0,
      Number(userTrade?.remaining_risk_amount ?? (riskBase > 0 ? riskBase : 0))
    );
    const fallbackRemainingPercent = riskBase > 0 ? (fallbackRemainingRisk / riskBase) * 100 : 0;

    if (action !== "published") {
      const previousPrice = Number(previousTradeUpdate?.tp_price ?? tradeUpdate.tp_price);
      const previousClose = Number(previousTradeUpdate?.close_percent ?? tradeUpdate.close_percent);
      const nextPrice = Number(tradeUpdate.tp_price);
      const nextClose = Number(tradeUpdate.close_percent);
      const previousNote = (previousTradeUpdate?.note || "-").trim() || "-";
      const nextNote = (tradeUpdate.note || "-").trim() || "-";

      return (
        <div
          key={notification.id}
          className="rounded-2xl border border-[#1e293b] bg-[#0b1121] shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-300"
        >
          <div className="px-5 py-4 border-b border-[#1e293b] relative">
            <button
              onClick={() => removeNotification(notification.id)}
              className="absolute top-4 right-4 p-1 rounded-full hover:bg-white/10 transition-colors"
            >
              <X className="w-4 h-4 text-slate-400" />
            </button>

            <div className="flex items-center gap-3">
              <div className={cn(
                "p-2.5 rounded-full",
                action === "edited" ? "bg-primary/20" : "bg-warning/20"
              )}>
                <Bell className={cn("w-5 h-5", action === "edited" ? "text-primary" : "text-warning")} />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">
                  {action === "edited" ? "Trade Update Edited" : "Trade Update Deleted"}
                </h3>
                <p className="text-xs font-medium text-slate-400">
                  {action === "edited"
                    ? "Provider/Admin edited a pending limit TP"
                    : "Provider/Admin deleted a pending limit TP"}
                </p>
              </div>
            </div>
          </div>

          <div className="px-5 py-3 flex flex-wrap items-center gap-2 bg-black/20">
            <span className="px-2.5 py-1 rounded text-xs font-black uppercase tracking-wider text-white bg-primary/20">
              Pair: {signal.pair}
            </span>
            <span className="px-2.5 py-1 rounded text-xs font-mono text-white bg-white/5">Entry: {signal.entry_price ?? "-"}</span>
            <span className="px-2.5 py-1 rounded text-xs font-mono text-white bg-white/5">SL: {signal.stop_loss ?? "-"}</span>
            <span className="px-2.5 py-1 rounded text-xs font-mono text-white bg-white/5">TP: {signal.take_profit ?? "-"}</span>
          </div>

          <div className="p-4">
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="px-2 py-0.5 rounded text-xs font-semibold border border-primary/40 text-primary">
                  {tradeUpdate.tp_label}
                </span>
                <span className={cn(
                  "px-2 py-0.5 rounded text-xs font-semibold border",
                  updateType === "market"
                    ? "border-warning/40 text-warning"
                    : "border-primary/40 text-primary"
                )}>
                  {updateType === "market" ? "Market Close" : "Limit Order"}
                </span>
                {action === "edited" ? (
                  <>
                    <span className="text-sm font-mono text-white">
                      Price: {previousPrice} -&gt; {nextPrice}
                    </span>
                    <span className="text-sm text-primary font-semibold">
                      Close: {previousClose.toFixed(2)}% -&gt; {nextClose.toFixed(2)}%
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-sm font-mono text-white">Deleted Price: {nextPrice}</span>
                    <span className="text-sm text-primary font-semibold">Deleted Close: {nextClose.toFixed(2)}%</span>
                  </>
                )}
              </div>
              {action === "edited" && (
                <p className="mt-1 text-xs text-slate-400">
                  Note: {previousNote} -&gt; {nextNote}
                </p>
              )}
              {action === "deleted" && tradeUpdate.note && (
                <p className="mt-1 text-xs text-slate-400">Deleted note: {tradeUpdate.note}</p>
              )}
              <p className="mt-1 text-xs text-slate-400">
                Remaining Position:{" "}
                <span className="font-semibold text-foreground">
                  {fallbackRemainingPercent.toFixed(2)}% (${fallbackRemainingRisk.toFixed(2)})
                </span>
              </p>
            </div>
          </div>

          <div className="px-5 pb-5">
            <Button
              onClick={() => removeNotification(notification.id)}
              className="w-full h-12 font-bold text-white shadow-lg transition-all border-0 bg-primary hover:bg-primary/90"
            >
              Got it
            </Button>
          </div>
        </div>
      );
    }

    if (!userTrade || !appliedTradeUpdate) return null;

    const closePercent = Math.max(0, Math.min(100, Number(appliedTradeUpdate.close_percent || 0)));
    const realizedAmount = Number(appliedTradeUpdate.realized_pnl || 0);
    const realizedPercent = riskBase > 0
      ? (realizedAmount / riskBase) * Number(userTrade.risk_percent || 0)
      : 0;
    const snapshotRemainingRisk =
      notification.remainingAfterRisk != null && Number.isFinite(Number(notification.remainingAfterRisk))
        ? Math.max(0, Number(notification.remainingAfterRisk))
        : null;
    const snapshotRemainingPercent =
      notification.remainingAfterPercent != null && Number.isFinite(Number(notification.remainingAfterPercent))
        ? Math.max(0, Number(notification.remainingAfterPercent))
        : null;

    const remainingRisk = snapshotRemainingRisk ?? Math.max(
      0,
      Number(
        userTrade.remaining_risk_amount ??
          (riskBase > 0 ? riskBase * (1 - closePercent / 100) : 0)
      )
    );
    const remainingPercent =
      snapshotRemainingPercent ?? (riskBase > 0 ? (remainingRisk / riskBase) * 100 : 0);

    return (
      <div
        key={notification.id}
        className="rounded-2xl border border-[#1e293b] bg-[#0b1121] shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-300"
      >
        <div className="px-5 py-4 border-b border-[#1e293b] relative">
          <button
            onClick={() => removeNotification(notification.id)}
            className="absolute top-4 right-4 p-1 rounded-full hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4 text-slate-400" />
          </button>

          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-full bg-primary/20">
              <Bell className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Trade Update</h3>
              <p className="text-xs font-medium text-slate-400">Provider/Admin posted a TP update</p>
            </div>
          </div>
        </div>

        <div className="px-5 py-3 flex flex-wrap items-center gap-2 bg-black/20">
          <span className="px-2.5 py-1 rounded text-xs font-black uppercase tracking-wider text-white bg-primary/20">
            Pair: {signal.pair}
          </span>
          <span className="px-2.5 py-1 rounded text-xs font-mono text-white bg-white/5">Entry: {signal.entry_price ?? "-"}</span>
          <span className="px-2.5 py-1 rounded text-xs font-mono text-white bg-white/5">SL: {signal.stop_loss ?? "-"}</span>
          <span className="px-2.5 py-1 rounded text-xs font-mono text-white bg-white/5">TP: {signal.take_profit ?? "-"}</span>
        </div>

        <div className="p-4">
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="px-2 py-0.5 rounded text-xs font-semibold border border-primary/40 text-primary">
                {tradeUpdate.tp_label}
              </span>
              <span
                className={cn(
                  "px-2 py-0.5 rounded text-xs font-semibold border",
                  updateType === "market"
                    ? "border-warning/40 text-warning"
                    : "border-primary/40 text-primary"
                )}
              >
                {updateType === "market" ? "Market Close" : "Limit Order"}
              </span>
              {remainingPercent <= 0.0001 && (
                <span className="px-2 py-0.5 rounded text-xs font-semibold border border-success/40 text-success">
                  Position Closed
                </span>
              )}
              <span className="text-sm font-mono text-white">TP: {tradeUpdate.tp_price}</span>
              {updateType === "limit" &&
                typeof notification.triggeredQuotePrice === "number" &&
                Number.isFinite(notification.triggeredQuotePrice) &&
                Math.abs(Number(notification.triggeredQuotePrice) - Number(tradeUpdate.tp_price)) > 1e-8 && (
                  <span className="text-xs font-mono text-slate-400">
                    Fill: {Number(notification.triggeredQuotePrice).toFixed(5)}
                  </span>
                )}
              <span className="text-sm text-primary font-semibold">Close: {closePercent.toFixed(2)}%</span>
              <span className={cn("text-sm font-semibold", realizedAmount >= 0 ? "text-success" : "text-destructive")}>
                {formatPnL(realizedAmount)}
              </span>
              <span className={cn("text-xs font-semibold", realizedPercent >= 0 ? "text-success" : "text-destructive")}>
                {formatPercent(realizedPercent)}
              </span>
            </div>
            {tradeUpdate.note && (
              <p className="mt-1 text-xs text-slate-400">{tradeUpdate.note}</p>
            )}
            <p className="mt-1 text-xs text-slate-400">
              Remaining Position:{" "}
              <span className="font-semibold text-foreground">
                {remainingPercent.toFixed(2)}% (${remainingRisk.toFixed(2)})
              </span>
            </p>
          </div>
        </div>

        <div className="px-5 pb-5">
          <Button
            onClick={() => removeNotification(notification.id)}
            className="w-full h-12 font-bold text-white shadow-lg transition-all border-0 bg-primary hover:bg-primary/90"
          >
            Got it
          </Button>
        </div>
      </div>
    );
  };

  const renderStopMovedToBreakevenNotification = (notification: NotificationItem) => {
    const { signal, previousStopLoss } = notification;
    const isBuy = signal.direction === "BUY";

    return (
      <div
        key={notification.id}
        className="rounded-2xl border border-[#1e293b] bg-[#0b1121] shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-300"
      >
        <div className="px-5 py-4 border-b border-[#1e293b] relative">
          <button
            onClick={() => removeNotification(notification.id)}
            className="absolute top-4 right-4 p-1 rounded-full hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4 text-slate-400" />
          </button>

          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-full bg-warning/20">
              <ShieldAlert className="w-5 h-5 text-warning" />
            </div>
            <div>
              <h3 className="text-base font-bold text-warning">SL Moved To Break Even</h3>
              <p className="text-xs font-medium text-slate-400">Provider/Admin updated risk protection</p>
            </div>
          </div>
        </div>

        <div className="px-5 py-3 flex flex-wrap items-center gap-2 bg-black/20">
          <span className={cn(
            "px-2.5 py-1 rounded text-xs font-black uppercase tracking-wider text-white",
            isBuy ? "bg-[#00c07f]" : "bg-[#ef4444]"
          )}>
            {signal.direction}
          </span>
          <span className="text-lg font-bold text-white">{signal.pair}</span>
          <span className="text-xs text-slate-500 font-bold uppercase tracking-widest">{signal.category}</span>
        </div>

        <div className="p-4 space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl p-3 text-center border border-white/5 bg-white/5">
              <p className="text-[10px] text-slate-400 uppercase tracking-widest mb-1">Entry</p>
              <p className="font-mono font-bold text-base text-white">{signal.entry_price ?? "-"}</p>
            </div>
            <div className="rounded-xl p-3 text-center border border-[#ef4444]/20 bg-[#ef4444]/10">
              <p className="text-[10px] text-[#ef4444] uppercase tracking-widest mb-1">Previous SL</p>
              <p className="font-mono font-bold text-base text-[#ef4444]">{previousStopLoss ?? "-"}</p>
            </div>
            <div className="rounded-xl p-3 text-center border border-warning/20 bg-warning/10">
              <p className="text-[10px] text-warning uppercase tracking-widest mb-1">New SL</p>
              <p className="font-mono font-bold text-base text-warning">{signal.stop_loss ?? "-"}</p>
            </div>
          </div>
        </div>

        <div className="px-5 pb-5">
          <Button
            onClick={() => removeNotification(notification.id)}
            className="w-full h-12 font-bold text-white bg-warning hover:bg-warning/90 shadow-lg border-0"
          >
            Got it
          </Button>
        </div>
      </div>
    );
  };

  // Render notification based on type
  const renderNotification = (notification: NotificationItem) => {
    switch (notification.type) {
      case 'new_signal':
        return renderNewSignalNotification(notification);
      case 'signal_active':
        return renderSignalActiveNotification(notification);
      case 'trade_closed':
        return renderTradeClosedNotification(notification);
      case 'trade_update':
      case 'trade_update_edited':
      case 'trade_update_deleted':
        return renderTradeUpdateNotification(notification);
      case 'sl_breakeven':
        return renderStopMovedToBreakevenNotification(notification);
      default:
        return null;
    }
  };

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isVisible) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isVisible]);

  // Ensure audio element is always mounted so ref is available
  // The logic below was previously returning null early, causing audioRef to be null when play() was called for the first notification

  return (
    <>
      {canReceiveNotifications && isOffline && (
        <div className="fixed inset-0 z-[120] pointer-events-none bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl border border-destructive/40 bg-[#0b1121] p-6 shadow-2xl">
            <h3 className="text-xl font-bold text-destructive mb-2">Realtime Connection Lost</h3>
            <p className="text-sm text-slate-200 leading-relaxed">
              Live signals and trade updates are paused due to connection loss. Do not take new trades until connection is restored.
            </p>
            <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              This page will auto-reload as soon as realtime connection returns.
            </div>
          </div>
        </div>
      )}

      {/* Audio element for notification sound - Always rendered */}
      <audio
        ref={audioRef}
        src="/notification-sound.mp3"
        preload="auto"
      />

      {/* Only render modal content when there are notifications and it is visible */}
      {(notifications.length > 0 && isVisible) && (
        <>
          {/* Backdrop with blur */}
          <div
            className={cn(
              "fixed inset-0 z-50 bg-background/80 backdrop-blur-md transition-opacity duration-300",
              isVisible ? "opacity-100" : "opacity-0"
            )}
            onClick={(e) => e.preventDefault()}
          />

          {/* Modal Container */}
          <div
            className={cn(
              "fixed inset-0 z-50 flex items-center justify-center p-4 transition-all duration-300",
              isVisible ? "opacity-100" : "opacity-0"
            )}
          >
            <div
              className={cn(
                "w-full max-w-md transition-transform duration-300 flex flex-col",
                isVisible ? "scale-100" : "scale-95"
              )}
              style={{ maxHeight: 'calc(100vh - 4rem)' }}
            >
              {/* Parent window */}
              <div className="rounded-3xl border border-[#1e293b] bg-[#070f22]/95 shadow-[0_24px_80px_rgba(2,8,23,0.65)] backdrop-blur-xl p-3">
                {/* Header with notification count */}
                {notifications.length > 1 && (
                  <div className="flex items-center justify-between px-3 py-2 mb-2 flex-shrink-0 border-b border-[#1e293b]">
                    <span className="text-sm font-medium text-slate-300">
                      {getNotificationTitle()}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleCloseAll}
                      className="text-xs text-slate-300 hover:text-white hover:bg-white/5"
                    >
                      Dismiss All
                    </Button>
                  </div>
                )}

                {/* Scrollable notifications container */}
                <div
                  className="flex-1 overflow-y-auto overscroll-contain"
                  style={{ maxHeight: notifications.length > 1 ? 'calc(100vh - 9rem)' : 'calc(100vh - 5rem)' }}
                >
                  <div className="space-y-4 px-1 pb-1">
                    {notifications.map((notification) => renderNotification(notification))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
};

