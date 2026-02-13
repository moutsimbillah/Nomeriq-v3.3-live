import { useEffect, useState, useRef, useCallback } from "react";
import { Signal } from "@/types/database";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useBrand } from "@/contexts/BrandContext";
import { Button } from "@/components/ui/button";
import { TrendingUp, TrendingDown, Target, ShieldAlert, CheckCircle2, XCircle, MinusCircle, X, Bell, Percent, DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUserSubscriptionCategories } from "@/hooks/useSubscriptionPackages";

type NotificationType = "trade_closed" | "new_signal" | "signal_active";
type TradeClosedStatus = "tp_hit" | "sl_hit" | "breakeven";

interface UserTrade {
  risk_percent: number;
  risk_amount: number;
  pnl: number | null;
}

interface NotificationItem {
  id: string;
  signal: Signal;
  type: NotificationType;
  status?: TradeClosedStatus;
  userTrade?: UserTrade | null;
}

interface TradeClosedNotificationModalProps {
  onClose?: () => void;
}

export const TradeClosedNotificationModal = ({ onClose }: TradeClosedNotificationModalProps) => {
  const { user, subscription, isAdmin, isLoading: authLoading } = useAuth();
  const { settings } = useBrand();
  const { allowedCategories } = useUserSubscriptionCategories();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [isVisible, setIsVisible] = useState(false);
  const [isOffline, setIsOffline] = useState<boolean>(typeof navigator !== "undefined" ? !navigator.onLine : false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const shownNotificationsRef = useRef<Set<string>>(new Set());
  const lastSyncAtRef = useRef<string>(new Date().toISOString());
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wentOfflineRef = useRef(false);
  const reloadingRef = useRef(false);
  const [reconnectNonce, setReconnectNonce] = useState(0);

  const showOfflineWarning = useCallback(() => {
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
  const userIdRef = useRef(user?.id);
  const allowedCategoriesRef = useRef<string[]>(allowedCategories as string[]);

  useEffect(() => {
    canReceiveRef.current = canReceiveNotifications;
  }, [canReceiveNotifications]);

  useEffect(() => {
    userIdRef.current = user?.id;
  }, [user?.id]);

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
    if (!user?.id) return;
    const saved = localStorage.getItem(`notifications:last-sync:${user.id}`);
    // Keep lookback window small if no saved state yet.
    const fallback = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    lastSyncAtRef.current = saved || fallback;
  }, [user?.id]);

  // Use global risk percent for all users
  const riskPercent = settings?.global_risk_percent || 2;

  // Fetch user's trade for the signal
  const fetchUserTrade = async (signalId: string) => {
    if (!userIdRef.current) return null;

    try {
      const { data, error } = await supabase
        .from('user_trades')
        .select('risk_percent, risk_amount, pnl')
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
  };

  // Calculate P&L based on signal outcome
  const calculatePnL = (sig: Signal, trade: UserTrade | null, status: TradeClosedStatus) => {
    if (!trade) return { amount: 0, percent: 0 };

    const entry = sig.entry_price || 0;
    const sl = sig.stop_loss || 0;
    const tp = sig.take_profit || 0;
    const riskAmount = trade.risk_amount;
    const tradeRiskPercent = trade.risk_percent;

    // Calculate R:R ratio
    let rrRatio = 0;
    if (sig.direction === "BUY" && entry - sl !== 0) {
      rrRatio = Math.abs((tp - entry) / (entry - sl));
    } else if (sig.direction === "SELL" && sl - entry !== 0) {
      rrRatio = Math.abs((entry - tp) / (sl - entry));
    }

    switch (status) {
      case 'tp_hit':
        return {
          amount: riskAmount * rrRatio,
          percent: tradeRiskPercent * rrRatio
        };
      case 'sl_hit':
        return {
          amount: -riskAmount,
          percent: -tradeRiskPercent
        };
      case 'breakeven':
      default:
        return { amount: 0, percent: 0 };
    }
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
    bumpLastSync(newSignal.created_at || newSignal.updated_at);
    if (
      allowedCategoriesRef.current.length > 0 &&
      !allowedCategoriesRef.current.includes(newSignal.category)
    ) {
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

    const currentStatus = updatedSignal.status?.toLowerCase();
    const previousStatus = oldSignal?.status?.toLowerCase();

    const closedStatuses = ["tp_hit", "sl_hit", "breakeven"];
    const isClosingTrade = closedStatuses.includes(currentStatus || "");
    const wasNotClosed = !previousStatus || !closedStatuses.includes(previousStatus);

    if (isClosingTrade && wasNotClosed) {
      const closureKey = `trade-closed-${updatedSignal.id}-${currentStatus}`;
      if (shownNotificationsRef.current.has(closureKey)) return;

      const trade = await fetchUserTrade(updatedSignal.id);
      shownNotificationsRef.current.add(closureKey);

      addNotification({
        id: closureKey,
        signal: updatedSignal,
        type: "trade_closed",
        status: currentStatus as TradeClosedStatus,
        userTrade: trade,
      });
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

    const updatedAtMs = new Date(updatedSignal.updated_at).getTime();
    const isRecentUpdate = Date.now() - updatedAtMs < 2 * 60 * 1000;
    const fallbackLooksLikeConversion =
      !oldSignal?.signal_type &&
      updatedSignal.signal_type === "signal" &&
      (source === "catchup" || isRecentUpdate);

    const isSignalActivation =
      !isClosedLike &&
      hasAllPrices &&
      (becameSignalType || fallbackLooksLikeConversion) &&
      updatedSignal.signal_type === "signal";

    if (isSignalActivation) {
      const activationKey = `signal-active-${updatedSignal.id}`;
      if (shownNotificationsRef.current.has(activationKey)) return;
      shownNotificationsRef.current.add(activationKey);
      addNotification({
        id: activationKey,
        signal: updatedSignal,
        type: "signal_active",
      });
    }
  }, [addNotification, bumpLastSync]);

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
          bumpLastSync(sig.updated_at || sig.created_at);
        }
      }
    } catch (err) {
      console.error("[NotificationModal] Error during missed notifications fetch:", err);
    }
  }, [processSignalInsert, processSignalUpdate, bumpLastSync]);

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
    if (authLoading || !user) return;

    const channelName = `unified-notification-modal-${user.id}-${reconnectNonce}`;
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
      .subscribe(async (status) => {
        console.log("[NotificationModal] Realtime subscription status:", status);
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
          if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
          }
          reconnectTimeoutRef.current = setTimeout(() => {
            setReconnectNonce((n) => n + 1);
          }, 1200);
        }
      });

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      supabase.removeChannel(channel);
    };
  }, [user?.id, authLoading, reconnectNonce, processSignalInsert, processSignalUpdate, fetchMissedNotifications, showOfflineWarning]);

  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      if (wentOfflineRef.current && !reloadingRef.current) {
        reloadingRef.current = true;
        setTimeout(() => window.location.reload(), 900);
        return;
      }
      fetchMissedNotifications(false);
      setReconnectNonce((n) => n + 1);
    };
    const handleOffline = () => {
      showOfflineWarning();
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        fetchMissedNotifications(false);
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
  }, [fetchMissedNotifications, showOfflineWarning]);

  // Dedicated instant listener so warning appears immediately on browser disconnect.
  useEffect(() => {
    const onImmediateOffline = () => {
      showOfflineWarning();
    };

    window.addEventListener("offline", onImmediateOffline);
    return () => {
      window.removeEventListener("offline", onImmediateOffline);
    };
  }, [showOfflineWarning]);

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
    const pnl = calculatePnL(signal, userTrade || null, status);

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

  // Render notification based on type
  const renderNotification = (notification: NotificationItem) => {
    switch (notification.type) {
      case 'new_signal':
        return renderNewSignalNotification(notification);
      case 'signal_active':
        return renderSignalActiveNotification(notification);
      case 'trade_closed':
        return renderTradeClosedNotification(notification);
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
      {isOffline && (
        <div className="fixed inset-0 z-[120] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
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
