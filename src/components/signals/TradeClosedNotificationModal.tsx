import { useEffect, useState, useRef, useCallback } from "react";
import { Signal } from "@/types/database";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useBrand } from "@/contexts/BrandContext";
import { Button } from "@/components/ui/button";
import { TrendingUp, TrendingDown, Target, ShieldAlert, CheckCircle2, XCircle, MinusCircle, X, Bell, Percent, DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

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
  const { user, subscription, isAdmin, isLoading: authLoading, profile } = useAuth();
  const { settings } = useBrand();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [isVisible, setIsVisible] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const shownNotificationsRef = useRef<Set<string>>(new Set());

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
  
  useEffect(() => {
    canReceiveRef.current = canReceiveNotifications;
  }, [canReceiveNotifications]);

  useEffect(() => {
    userIdRef.current = user?.id;
  }, [user?.id]);

  // Get risk percent from user profile or global settings
  const riskPercent = profile?.custom_risk_percent || settings?.global_risk_percent || 2;

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
      audioRef.current.play().catch(() => {});
    }
  }, []);

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
    // Wait for auth to fully load before setting up listener
    if (authLoading || !user) return;
    
    console.log('[NotificationModal] Setting up realtime listener, userId:', user.id);

    const channelName = `unified-notification-modal-${user.id}`;
    
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'signals',
        },
        (payload) => {
          // Check permission at callback time using ref
          if (!canReceiveRef.current) return;
          
          const newSignal = payload.new as Signal;
          
          // Only show for actual signals (not upcoming)
          if (newSignal.signal_type !== 'signal') return;
          
          // Skip if already shown
          const notificationKey = `new-signal-${newSignal.id}`;
          if (shownNotificationsRef.current.has(notificationKey)) return;
          
          // Check if signal is recent (within 5 minutes)
          const signalTime = new Date(newSignal.created_at).getTime();
          const now = Date.now();
          if (now - signalTime > 300000) return;
          
          console.log('[NotificationModal] New signal received:', newSignal.pair, newSignal.direction);

          shownNotificationsRef.current.add(notificationKey);
          
          addNotification({
            id: notificationKey,
            signal: newSignal,
            type: 'new_signal'
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'signals',
        },
        async (payload) => {
          // Check permission at callback time using ref
          if (!canReceiveRef.current) return;
          
          const updatedSignal = payload.new as Signal;
          const oldSignal = payload.old as Partial<Signal> | null;
          
          // Normalize status to lowercase for comparison
          const currentStatus = updatedSignal.status?.toLowerCase();
          const previousStatus = oldSignal?.status?.toLowerCase();
          
          // Check for trade closure (TP hit, SL hit, Breakeven)
          const closedStatuses = ['tp_hit', 'sl_hit', 'breakeven'];
          const isClosingTrade = closedStatuses.includes(currentStatus || '');
          const wasNotClosed = !previousStatus || !closedStatuses.includes(previousStatus);
          
          console.log('[NotificationModal] Signal update detected:', {
            pair: updatedSignal.pair,
            currentStatus,
            previousStatus,
            isClosingTrade,
            wasNotClosed
          });
          
          if (isClosingTrade && wasNotClosed) {
            const closureKey = `trade-closed-${updatedSignal.id}-${currentStatus}`;
            if (shownNotificationsRef.current.has(closureKey)) return;
            
            // Do not enforce a tight time window here.
            // Some status updates (especially breakeven) may not update closed_at reliably,
            // and updated_at can lag depending on how the backend writes the row.
            // Realtime events are already "new" by definition, and we dedupe via shownNotificationsRef.
            
            console.log('[NotificationModal] Trade closed notification triggered:', updatedSignal.pair, currentStatus);

            // Fetch user's trade for this signal
            const trade = await fetchUserTrade(updatedSignal.id);
            
            shownNotificationsRef.current.add(closureKey);
            
            // Map back to proper TradeClosedStatus type
            const statusType = currentStatus as TradeClosedStatus;
            
            addNotification({
              id: closureKey,
              signal: updatedSignal,
              type: 'trade_closed',
              status: statusType,
              userTrade: trade
            });
            return;
          }
          
          // Check for upcoming -> active signal conversion
          const hasAllPrices =
            updatedSignal.entry_price !== null &&
            updatedSignal.entry_price !== undefined &&
            updatedSignal.stop_loss !== null &&
            updatedSignal.stop_loss !== undefined &&
            updatedSignal.take_profit !== null &&
            updatedSignal.take_profit !== undefined;

          const isClosedLike = closedStatuses.includes(updatedSignal.status as TradeClosedStatus) ||
            ['closed', 'cancelled'].includes(updatedSignal.status);

          const becameSignalType =
            oldSignal?.signal_type === 'upcoming' && updatedSignal.signal_type === 'signal';

          // Fallback for cases where old row isn't present
          const updatedAtMs = new Date(updatedSignal.updated_at).getTime();
          const isRecentUpdate = Date.now() - updatedAtMs < 2 * 60 * 1000;
          const fallbackLooksLikeConversion =
            !oldSignal?.signal_type && updatedSignal.signal_type === 'signal' && isRecentUpdate;

          const isSignalActivation =
            !isClosedLike &&
            hasAllPrices &&
            (becameSignalType || fallbackLooksLikeConversion) &&
            updatedSignal.signal_type === 'signal';

          if (isSignalActivation) {
            const activationKey = `signal-active-${updatedSignal.id}`;
            if (shownNotificationsRef.current.has(activationKey)) return;
            
            console.log('[NotificationModal] Upcoming->Signal conversion detected:', updatedSignal.pair);

            shownNotificationsRef.current.add(activationKey);
            
            addNotification({
              id: activationKey,
              signal: updatedSignal,
              type: 'signal_active'
            });
          }
        }
      )
      .subscribe((status) => {
        console.log('[NotificationModal] Realtime subscription status:', status);
      });

    return () => {
      console.log('[NotificationModal] Cleaning up realtime channel');
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, authLoading, addNotification]);

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
        className="rounded-2xl border border-border/50 bg-card shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-300"
      >
        {/* Header */}
        <div className={cn("px-5 py-4 relative", isBuy ? "bg-success/10" : "bg-destructive/10")}>
          <button
            onClick={() => removeNotification(notification.id)}
            className="absolute top-3 right-3 p-1 rounded-full hover:bg-background/20 transition-colors"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>

          <div className="flex items-center gap-3">
            <span className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold",
              isBuy ? "bg-success/20 text-success" : "bg-destructive/20 text-destructive"
            )}>
              {isBuy ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              {signal.direction}
            </span>
            <h3 className="text-xl font-bold">{signal.pair}</h3>
            <span className="px-2.5 py-0.5 rounded-full bg-muted text-xs font-medium text-muted-foreground">
              {signal.category}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-2">New Signal Alert</p>
        </div>

        {/* Price Details */}
        <div className="p-5 space-y-4">
          {/* Risk Per Trade */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-warning/10 border border-warning/20">
            <div className="flex items-center gap-2">
              <Percent className="w-4 h-4 text-warning" />
              <span className="text-sm text-muted-foreground">Risk Per Trade</span>
            </div>
            <span className="font-bold text-warning">{riskPercent}%</span>
          </div>

          {/* Entry Price */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-primary/10 border border-primary/20">
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-primary" />
              <span className="text-sm text-muted-foreground">Entry Price</span>
            </div>
            <span className="font-mono font-bold text-lg">{signal.entry_price ?? '-'}</span>
          </div>

          {/* SL & TP Grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20">
              <div className="flex items-center gap-2 mb-1">
                <ShieldAlert className="w-3.5 h-3.5 text-destructive" />
                <span className="text-xs text-muted-foreground">Stop Loss</span>
              </div>
              <span className="font-mono font-bold text-destructive">{signal.stop_loss ?? '-'}</span>
            </div>

            <div className="p-3 rounded-xl bg-success/10 border border-success/20">
              <div className="flex items-center gap-2 mb-1">
                <Target className="w-3.5 h-3.5 text-success" />
                <span className="text-xs text-muted-foreground">Take Profit</span>
              </div>
              <span className="font-mono font-bold text-success">{signal.take_profit ?? '-'}</span>
            </div>
          </div>
        </div>

        {/* Footer Button */}
        <div className="px-5 pb-5">
          <Button 
            onClick={() => removeNotification(notification.id)}
            className="w-full"
            variant="gradient"
            size="default"
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
        className="rounded-2xl border border-border/50 bg-card shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-300"
      >
        {/* Header */}
        <div className="px-5 py-4 relative bg-primary/10">
          <button
            onClick={() => removeNotification(notification.id)}
            className="absolute top-3 right-3 p-1 rounded-full hover:bg-background/20 transition-colors"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>

          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary/20">
              <Bell className="w-6 h-6 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-primary">Signal Now Active</h3>
              <p className="text-xs text-muted-foreground">Upcoming trade is now live</p>
            </div>
          </div>
        </div>

        {/* Trade Details */}
        <div className="p-4 space-y-3">
          {/* Pair and Direction */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-secondary/50 border border-border/30">
            <div className="flex items-center gap-2">
              <span className={cn(
                "inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold",
                isBuy ? "bg-success/20 text-success" : "bg-destructive/20 text-destructive"
              )}>
                {isBuy ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                {signal.direction}
              </span>
              <span className="text-lg font-bold">{signal.pair}</span>
            </div>
            <span className="px-2 py-0.5 rounded-full bg-muted text-[10px] font-medium text-muted-foreground capitalize">
              {signal.category}
            </span>
          </div>

          {/* Risk Per Trade */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-warning/10 border border-warning/20">
            <div className="flex items-center gap-2">
              <Percent className="w-4 h-4 text-warning" />
              <span className="text-sm text-muted-foreground">Risk Per Trade</span>
            </div>
            <span className="font-bold text-warning">{riskPercent}%</span>
          </div>

          {/* Price Details Grid */}
          <div className="grid grid-cols-3 gap-2">
            <div className="p-2 rounded-lg bg-primary/10 border border-primary/20 text-center">
              <p className="text-[9px] text-muted-foreground uppercase mb-0.5">Entry</p>
                <p className="font-mono font-bold text-xs">{signal.entry_price ?? "-"}</p>
            </div>

            <div className="p-2 rounded-lg bg-destructive/10 border border-destructive/20 text-center">
              <div className="flex items-center justify-center gap-0.5 mb-0.5">
                <ShieldAlert className="w-2.5 h-2.5 text-destructive" />
                <p className="text-[9px] text-muted-foreground uppercase">SL</p>
              </div>
                <p className="font-mono font-bold text-xs text-destructive">{signal.stop_loss ?? "-"}</p>
            </div>

            <div className="p-2 rounded-lg bg-success/10 border border-success/20 text-center">
              <div className="flex items-center justify-center gap-0.5 mb-0.5">
                <Target className="w-2.5 h-2.5 text-success" />
                <p className="text-[9px] text-muted-foreground uppercase">TP</p>
              </div>
                <p className="font-mono font-bold text-xs text-success">{signal.take_profit ?? "-"}</p>
            </div>
          </div>
        </div>

        {/* Footer Button */}
        <div className="px-4 pb-4">
          <Button 
            onClick={() => removeNotification(notification.id)}
            className="w-full"
            variant="gradient"
            size="default"
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
        className="rounded-2xl border border-border/50 bg-card shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-300"
      >
        {/* Header with Status */}
        <div className={cn("px-5 py-4 relative", statusConfig.bgClass)}>
          <button
            onClick={() => removeNotification(notification.id)}
            className="absolute top-3 right-3 p-1 rounded-full hover:bg-background/20 transition-colors"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>

          <div className="flex items-center gap-3">
            <div className={cn("p-2.5 rounded-xl", statusConfig.iconBgClass)}>
              <StatusIcon className={cn("w-6 h-6", statusConfig.textClass)} />
            </div>
            
            <div className="flex-1">
              <h3 className={cn("text-lg font-bold", statusConfig.textClass)}>
                {statusConfig.label}
              </h3>
              <p className="text-xs text-muted-foreground">
                {statusConfig.subtitle}
              </p>
            </div>
          </div>
        </div>

        {/* Trade Details */}
        <div className="p-4 space-y-3">
          {/* Pair and Direction */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-secondary/50 border border-border/30">
            <div className="flex items-center gap-2">
              <span className={cn(
                "inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold",
                isBuy ? "bg-success/20 text-success" : "bg-destructive/20 text-destructive"
              )}>
                {isBuy ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                {signal.direction}
              </span>
              <span className="text-lg font-bold">{signal.pair}</span>
            </div>
            <span className="px-2 py-0.5 rounded-full bg-muted text-[10px] font-medium text-muted-foreground capitalize">
              {signal.category}
            </span>
          </div>

          {/* Price Details Grid */}
          <div className="grid grid-cols-3 gap-2">
            <div className="p-2 rounded-lg bg-primary/10 border border-primary/20 text-center">
              <p className="text-[9px] text-muted-foreground uppercase mb-0.5">Entry</p>
                <p className="font-mono font-bold text-xs">{signal.entry_price ?? "-"}</p>
            </div>

            <div className="p-2 rounded-lg bg-destructive/10 border border-destructive/20 text-center">
              <div className="flex items-center justify-center gap-0.5 mb-0.5">
                <ShieldAlert className="w-2.5 h-2.5 text-destructive" />
                <p className="text-[9px] text-muted-foreground uppercase">SL</p>
              </div>
                <p className="font-mono font-bold text-xs text-destructive">{signal.stop_loss ?? "-"}</p>
            </div>

            <div className="p-2 rounded-lg bg-success/10 border border-success/20 text-center">
              <div className="flex items-center justify-center gap-0.5 mb-0.5">
                <Target className="w-2.5 h-2.5 text-success" />
                <p className="text-[9px] text-muted-foreground uppercase">TP</p>
              </div>
                <p className="font-mono font-bold text-xs text-success">{signal.take_profit ?? "-"}</p>
            </div>
          </div>

          {/* P&L Result */}
          {status !== 'breakeven' && (
            <div className={cn(
              "flex flex-col items-center justify-center p-3 rounded-xl border",
              statusConfig.bgClass,
              statusConfig.borderClass
            )}>
              <p className={cn("text-[10px] uppercase tracking-wide mb-0.5", statusConfig.textClass)}>
                {status === 'tp_hit' ? 'Profit' : 'Loss'}
              </p>
              <span className={cn("text-xl font-bold font-mono", statusConfig.textClass)}>
                {formatPnL(pnl.amount)}
              </span>
              <span className={cn("text-xs font-medium mt-0.5", statusConfig.textClass)}>
                {formatPercent(pnl.percent)} of account
              </span>
            </div>
          )}
        </div>

        {/* Footer Button */}
        <div className="px-4 pb-4">
          <Button 
            onClick={() => removeNotification(notification.id)}
            className="w-full"
            variant="gradient"
            size="default"
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

  if (notifications.length === 0 || !isVisible) return null;

  return (
    <>
      {/* Audio element for notification sound */}
      <audio
        ref={audioRef}
        src="/notification-sound.mp3"
        preload="auto"
      />

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
          {/* Header with notification count */}
          {notifications.length > 1 && (
            <div className="flex items-center justify-between px-4 py-2 mb-2 flex-shrink-0 bg-card/90 backdrop-blur rounded-t-2xl">
              <span className="text-sm font-medium text-muted-foreground">
                {getNotificationTitle()}
              </span>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={handleCloseAll}
                className="text-xs"
              >
                Dismiss All
              </Button>
            </div>
          )}

          {/* Scrollable notifications container */}
          <div 
            className="flex-1 overflow-y-auto overscroll-contain"
            style={{ maxHeight: notifications.length > 1 ? 'calc(100vh - 8rem)' : 'calc(100vh - 4rem)' }}
          >
            <div className="space-y-4 px-1 pb-2">
              {notifications.map((notification) => renderNotification(notification))}
            </div>
          </div>

        </div>
      </div>
    </>
  );
};