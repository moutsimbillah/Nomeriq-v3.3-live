import { useState } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Pencil, Trash2, ArrowUpRight, ArrowDownRight, CheckCircle2, XCircle, Send, Loader2, Zap, MinusCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSignals } from "@/hooks/useSignals";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { AdminSignalForm } from "@/components/admin/AdminSignalForm";
import { getTelegramDeliveryFeedback, sendTelegramSignal, sendTelegramTradeClosed } from "@/lib/telegram";
import { SignalTakeProfitUpdatesDialog } from "@/components/signals/SignalTakeProfitUpdatesDialog";
import { useSignalTakeProfitUpdates } from "@/hooks/useSignalTakeProfitUpdates";
import { getSafeErrorMessage } from "@/lib/error-sanitizer";
import { useProviderNameMap } from "@/hooks/useProviderNameMap";
import { MetricInfoTooltip } from "@/components/common/MetricInfoTooltip";
import {
  computeLiveSignalMetrics,
  computeUpcomingSignalMetrics,
  isLiveSignal,
  isUpcomingSignal,
} from "@/lib/admin-metrics";
import { useMarketMode } from "@/hooks/useMarketMode";
import { searchMarketPairs, fetchLiveQuote, createSignalLive } from "@/lib/market-api";
import type { MarketPair } from "@/lib/market-api";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { deriveLiveCloseOutcome, getLiveCloseSnapshot } from "@/lib/live-signal-close";
import { useLivePrices } from "@/hooks/useLivePrices";
import { useLiveSignalAutoTriggers } from "@/hooks/useLiveSignalAutoTriggers";
import { useOpenExposureSignalIds } from "@/hooks/useOpenExposureSignalIds";
import { calculateSignedSignalRrForTarget } from "@/lib/trade-math";

const categories = ["Forex", "Metals", "Crypto", "Indices", "Commodities"];
const AdminSignals = () => {
  // Admins should never receive user-facing popups.
  const {
    signals,
    isLoading,
    refetch
  } = useSignals({
    realtime: true
  });
  const { updatesBySignal } = useSignalTakeProfitUpdates({
    signalIds: signals.map((s) => s.id),
    realtime: true,
  });
  const { user } = useAuth();
  const { marketMode } = useMarketMode();
  const { openSignalIds, signalIdsWithTrades, isLoading: isOpenExposureLoading } = useOpenExposureSignalIds(
    signals.map((s) => s.id),
    { realtime: true }
  );
  const visibleSignals = Array.from(
    new Map(
      signals
        .filter((s) => {
          if (isUpcomingSignal(s)) return true;
          if (isLiveSignal(s)) {
            if (openSignalIds.has(s.id)) return true;
            // Keep newly created/no-subscriber signals visible until they actually have trade rows.
            return !signalIdsWithTrades.has(s.id);
          }
          return false;
        })
        .map((s) => [s.id, s])
    ).values()
  );
  const liveMetrics = computeLiveSignalMetrics(visibleSignals);
  const upcomingMetrics = computeUpcomingSignalMetrics(visibleSignals);
  const providerNameMap = useProviderNameMap(
    visibleSignals.map((s) => s.created_by || "")
  );
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingSignalId, setEditingSignalId] = useState<string | null>(null);
  const [convertingSignalId, setConvertingSignalId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pairOptions, setPairOptions] = useState<MarketPair[]>([]);
  const [pairSearchLoading, setPairSearchLoading] = useState(false);
  const [liveLockedEntry, setLiveLockedEntry] = useState<number | null>(null);
  const [liveLockedQuotedAt, setLiveLockedQuotedAt] = useState<string | null>(null);
  const [twelveDataSymbol, setTwelveDataSymbol] = useState<string | null>(null);
  const refreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [formData, setFormData] = useState({
    pair: "",
    category: "",
    direction: "BUY" as "BUY" | "SELL",
    entry: "",
    stopLoss: "",
    takeProfit: "",
    signalType: "signal" as "signal" | "upcoming",
    upcomingStatus: "waiting" as "waiting" | "near_entry" | "preparing",
    notes: "",
    analysisVideoUrl: "",
    analysisNotes: "",
    analysisImageUrl: "",
    sendToTelegram: false,
    sendUpdatesToTelegram: false,
    sendClosedTradesToTelegram: false
  });
  const resetForm = () => {
    setFormData({
      pair: "",
      category: "",
      direction: "BUY",
      entry: "",
      stopLoss: "",
      takeProfit: "",
      signalType: "signal",
      upcomingStatus: "waiting",
      notes: "",
      analysisVideoUrl: "",
      analysisNotes: "",
      analysisImageUrl: "",
      sendToTelegram: false,
      sendUpdatesToTelegram: false,
      sendClosedTradesToTelegram: false
    });
    setPairOptions([]);
    setLiveLockedEntry(null);
    setLiveLockedQuotedAt(null);
    setTwelveDataSymbol(null);
    if (refreshIntervalRef.current) {
      clearInterval(refreshIntervalRef.current);
      refreshIntervalRef.current = null;
    }
  };

  const handlePairSearch = useCallback(async (category: string, query: string) => {
    if (marketMode !== "live" || !category) return;
    setPairSearchLoading(true);
    try {
      const list = await searchMarketPairs(category, query || null, "live");
      setPairOptions(list);
    } finally {
      setPairSearchLoading(false);
    }
  }, [marketMode]);

  const handlePairSelect = useCallback(async (p: MarketPair) => {
    setTwelveDataSymbol(p.twelve_data_symbol);
    try {
      const { price, quoted_at } = await fetchLiveQuote(p.twelve_data_symbol);
      setFormData((prev) => ({ ...prev, entry: String(price) }));
      setLiveLockedEntry(price);
      setLiveLockedQuotedAt(quoted_at);
    } catch (e) {
      toast.error("Failed to fetch entry price");
    }
    if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current);
    refreshIntervalRef.current = setInterval(async () => {
      try {
        const { price } = await fetchLiveQuote(p.twelve_data_symbol);
        setFormData((prev) => ({ ...prev, entry: String(price) }));
      } catch {
        // ignore refresh errors
      }
    }, 30000);
  }, []);

  useEffect(() => {
    return () => {
      if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current);
    };
  }, []);
  const validateDirectionalPriceSetup = (requireAll: boolean): string | null => {
    const entry = formData.entry.trim() === "" ? null : Number(formData.entry);
    const stopLoss = formData.stopLoss.trim() === "" ? null : Number(formData.stopLoss);
    const takeProfit = formData.takeProfit.trim() === "" ? null : Number(formData.takeProfit);

    if (requireAll && (entry === null || stopLoss === null || takeProfit === null)) {
      return "Please fill in entry, stop loss, and take profit.";
    }

    if ((stopLoss !== null || takeProfit !== null) && entry === null) {
      return "Entry price is required when stop loss or take profit is provided.";
    }

    if (entry !== null && !Number.isFinite(entry)) return "Invalid entry price.";
    if (stopLoss !== null && !Number.isFinite(stopLoss)) return "Invalid stop loss price.";
    if (takeProfit !== null && !Number.isFinite(takeProfit)) return "Invalid take profit price.";

    if (entry !== null && stopLoss !== null) {
      if (formData.direction === "BUY" && stopLoss >= entry) {
        return "For BUY, stop loss must be strictly lower than entry price.";
      }
      if (formData.direction === "SELL" && stopLoss <= entry) {
        return "For SELL, stop loss must be strictly higher than entry price.";
      }
    }

    if (entry !== null && takeProfit !== null) {
      if (formData.direction === "BUY" && takeProfit <= entry) {
        return "For BUY, take profit must be strictly higher than entry price.";
      }
      if (formData.direction === "SELL" && takeProfit >= entry) {
        return "For SELL, take profit must be strictly lower than entry price.";
      }
    }

    return null;
  };

  const showCreateOrPublishResultToast = (
    webAppMessage: string,
    telegramFeedback: ReturnType<typeof getTelegramDeliveryFeedback> | null
  ) => {
    const webSuccessPrefix = `Web app: ${webAppMessage}`;
    if (!telegramFeedback) {
      toast.success(webSuccessPrefix);
      return;
    }

    if (telegramFeedback.level === "success") {
      toast.success(`${webSuccessPrefix} ${telegramFeedback.message}`);
      return;
    }

    toast.warning(
      `${webSuccessPrefix} Telegram: failed/skipped. ${getSafeErrorMessage(
        telegramFeedback.message,
        "Please check Telegram integration settings and network."
      )}`
    );
  };

  const handleCreate = async () => {
    if (!formData.pair || !formData.category) {
      toast.error("Please fill in pair and category");
      return;
    }
    const createPriceError = validateDirectionalPriceSetup(formData.signalType === "signal");
    if (createPriceError) {
      toast.error(createPriceError);
      return;
    }
    const isLiveActiveSignal = marketMode === "live" && formData.signalType === "signal";
    if (isLiveActiveSignal && (!twelveDataSymbol || liveLockedEntry == null || !liveLockedQuotedAt)) {
      toast.error("Select a pair to lock entry price first.");
      return;
    }

    setIsSubmitting(true);
    try {
      const baseSuccessMessage =
        formData.signalType === 'upcoming' ? "Upcoming trade created successfully." : "Signal created successfully.";

      if (isLiveActiveSignal) {
        const { signal } = await createSignalLive({
          pair: formData.pair.toUpperCase(),
          category: formData.category,
          direction: formData.direction,
          stop_loss: formData.stopLoss ? parseFloat(formData.stopLoss) : 0,
          take_profit: formData.takeProfit ? parseFloat(formData.takeProfit) : 0,
          signal_type: formData.signalType,
          upcoming_status: formData.signalType === 'upcoming' ? formData.upcomingStatus : null,
          notes: formData.notes || null,
          analysis_video_url: formData.analysisVideoUrl || null,
          analysis_notes: formData.analysisNotes || null,
          analysis_image_url: formData.analysisImageUrl || null,
          send_updates_to_telegram: formData.sendUpdatesToTelegram,
          send_closed_trades_to_telegram: formData.sendClosedTradesToTelegram,
          entry_price_client: liveLockedEntry,
          entry_quoted_at_client: liveLockedQuotedAt,
          twelve_data_symbol: twelveDataSymbol!,
        });

        let telegramFeedback: ReturnType<typeof getTelegramDeliveryFeedback> | null = null;
        if (formData.sendToTelegram) {
          const res = await sendTelegramSignal({
            action: "created",
            signal: {
              pair: formData.pair.toUpperCase(),
              category: formData.category,
              direction: formData.direction,
              entry_price: liveLockedEntry,
              stop_loss: formData.stopLoss ? parseFloat(formData.stopLoss) : null,
              take_profit: formData.takeProfit ? parseFloat(formData.takeProfit) : null,
              analysis_notes: formData.analysisNotes || null,
              analysis_video_url: formData.analysisVideoUrl || null,
              analysis_image_url: formData.analysisImageUrl || null,
              signal_type: formData.signalType,
              upcoming_status: formData.signalType === 'upcoming' ? formData.upcomingStatus : null,
            },
          });
          telegramFeedback = getTelegramDeliveryFeedback(res, "Telegram alert");
        }
        showCreateOrPublishResultToast(baseSuccessMessage, telegramFeedback);
      } else {
        const { error } = await supabase.from('signals').insert({
          pair: formData.pair.toUpperCase(),
          category: formData.category,
          direction: formData.direction,
          entry_price: formData.entry ? parseFloat(formData.entry) : null,
          stop_loss: formData.stopLoss ? parseFloat(formData.stopLoss) : null,
          take_profit: formData.takeProfit ? parseFloat(formData.takeProfit) : null,
          status: formData.signalType === 'upcoming' ? 'upcoming' : 'active',
          signal_type: formData.signalType,
          upcoming_status: formData.signalType === 'upcoming' ? formData.upcomingStatus : null,
          notes: formData.notes || null,
          created_by: user?.id,
          analysis_video_url: formData.analysisVideoUrl || null,
          analysis_notes: formData.analysisNotes || null,
          analysis_image_url: formData.analysisImageUrl || null,
          send_updates_to_telegram: formData.sendUpdatesToTelegram,
          send_closed_trades_to_telegram: formData.sendClosedTradesToTelegram
        });
        if (error) throw error;

        let telegramFeedback: ReturnType<typeof getTelegramDeliveryFeedback> | null = null;
        if (formData.sendToTelegram) {
          const res = await sendTelegramSignal({
            action: "created",
            signal: {
              pair: formData.pair.toUpperCase(),
              category: formData.category,
              direction: formData.direction,
              entry_price: formData.entry ? parseFloat(formData.entry) : null,
              stop_loss: formData.stopLoss ? parseFloat(formData.stopLoss) : null,
              take_profit: formData.takeProfit ? parseFloat(formData.takeProfit) : null,
              analysis_notes: formData.analysisNotes || null,
              analysis_video_url: formData.analysisVideoUrl || null,
              analysis_image_url: formData.analysisImageUrl || null,
              signal_type: formData.signalType,
              upcoming_status: formData.signalType === 'upcoming' ? formData.upcomingStatus : null,
            },
          });
          telegramFeedback = getTelegramDeliveryFeedback(res, "Telegram alert");
        }
        showCreateOrPublishResultToast(baseSuccessMessage, telegramFeedback);
      }

      setIsCreateOpen(false);
      resetForm();
      refetch();
    } catch (err: unknown) {
      console.error('Error creating signal:', err);
      toast.error(err instanceof Error ? err.message : "Failed to create signal. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };
  const handleEdit = async () => {
    if (!editingSignalId) return;
    const editPriceError = validateDirectionalPriceSetup(formData.signalType === "signal");
    if (editPriceError) {
      toast.error(editPriceError);
      return;
    }
    setIsSubmitting(true);
    try {
      const {
        error
      } = await supabase.from('signals').update({
        pair: formData.pair.toUpperCase(),
        category: formData.category,
        direction: formData.direction,
        entry_price: formData.entry ? parseFloat(formData.entry) : null,
        stop_loss: formData.stopLoss ? parseFloat(formData.stopLoss) : null,
        take_profit: formData.takeProfit ? parseFloat(formData.takeProfit) : null,
        signal_type: formData.signalType,
        upcoming_status: formData.signalType === 'upcoming' ? formData.upcomingStatus : null,
        notes: formData.notes || null,
        analysis_video_url: formData.analysisVideoUrl || null,
        analysis_notes: formData.analysisNotes || null,
        analysis_image_url: formData.analysisImageUrl || null,
        send_updates_to_telegram: formData.sendUpdatesToTelegram,
        send_closed_trades_to_telegram: formData.sendClosedTradesToTelegram
      }).eq('id', editingSignalId);
      if (error) throw error;
      toast.success("Signal updated successfully");
      setEditingSignalId(null);
      resetForm();
      refetch();
    } catch (err) {
      console.error('Error updating signal:', err);
      toast.error("Failed to update signal");
    } finally {
      setIsSubmitting(false);
    }
  };
  const handleConvertToSignal = async () => {
    if (!convertingSignalId) return;

    const convertPriceError = validateDirectionalPriceSetup(true);
    if (convertPriceError) {
      toast.error(convertPriceError);
      return;
    }
    setIsSubmitting(true);
    try {
      const {
        error
      } = await supabase.from('signals').update({
        pair: formData.pair.toUpperCase(),
        category: formData.category,
        direction: formData.direction,
        entry_price: parseFloat(formData.entry),
        stop_loss: parseFloat(formData.stopLoss),
        take_profit: parseFloat(formData.takeProfit),
        signal_type: 'signal',
        status: 'active',
        upcoming_status: null,
        notes: formData.notes || null,
        analysis_video_url: formData.analysisVideoUrl || null,
        analysis_notes: formData.analysisNotes || null,
        analysis_image_url: formData.analysisImageUrl || null,
        send_updates_to_telegram: formData.sendUpdatesToTelegram,
        send_closed_trades_to_telegram: formData.sendClosedTradesToTelegram
      }).eq('id', convertingSignalId);
      if (error) throw error;

      let telegramFeedback: ReturnType<typeof getTelegramDeliveryFeedback> | null = null;
      if (formData.sendToTelegram) {
        const res = await sendTelegramSignal({
          action: "activated",
          signal: {
            pair: formData.pair.toUpperCase(),
            category: formData.category,
            direction: formData.direction,
            entry_price: parseFloat(formData.entry),
            stop_loss: parseFloat(formData.stopLoss),
            take_profit: parseFloat(formData.takeProfit),
            analysis_notes: formData.analysisNotes || null,
            analysis_video_url: formData.analysisVideoUrl || null,
            analysis_image_url: formData.analysisImageUrl || null,
            signal_type: 'signal', // Converted to active signal
            upcoming_status: null,
          },
        });

        telegramFeedback = getTelegramDeliveryFeedback(res, "Telegram alert");
      }

      showCreateOrPublishResultToast(baseSuccessMessage, telegramFeedback);

      setConvertingSignalId(null);
      resetForm();
      refetch();
    } catch (err) {
      console.error('Error converting signal:', err);
      toast.error("Failed to convert to signal");
    } finally {
      setIsSubmitting(false);
    }
  };
  const handleDelete = async (id: string) => {
    try {
      const {
        error
      } = await supabase.from('signals').delete().eq('id', id);
      if (error) throw error;
      toast.success("Signal deleted");
      refetch();
    } catch (err) {
      console.error('Error deleting signal:', err);
      toast.error("Failed to delete signal");
    }
  };
  const updateStatus = async (id: string, requestedStatus: "tp_hit" | "sl_hit" | "breakeven") => {
    try {
      const signal = signals.find((s) => s.id === id);
      if (!signal) {
        toast.error("Signal not found");
        return;
      }
      const isLiveCloseOnlySignal = marketMode === "live" && signal.market_mode === "live";
      const entryPriceValue = Number(signal.entry_price);
      const stopLossValue = Number(signal.stop_loss);
      const isManualBreakevenArmed =
        !isLiveCloseOnlySignal &&
        Number.isFinite(entryPriceValue) &&
        Number.isFinite(stopLossValue) &&
        Math.abs(stopLossValue - entryPriceValue) <= 1e-8;
      let resolvedStatus = requestedStatus;
      let closePrice: number | null = null;
      let closeQuotedAt: string | null = null;
      let closeSource: string | null = null;
      let closeRr: number | null = null;

      if (!isLiveCloseOnlySignal && requestedStatus === "breakeven" && !isManualBreakevenArmed) {
        toast.error("Move SL to break-even first (SL must equal entry) before closing as breakeven.");
        return;
      }

      if (isLiveCloseOnlySignal) {
        if (requestedStatus !== "sl_hit") {
          toast.error("In live mode, use only the red close button.");
          return;
        }
        const snapshot = await getLiveCloseSnapshot(signal);
        resolvedStatus = snapshot.status;
        closePrice = snapshot.closePrice;
        closeQuotedAt = snapshot.closeQuotedAt;
        closeSource = snapshot.symbol;
        closeRr = snapshot.rr;
      } else if (requestedStatus === "sl_hit") {
        // Manual mode close button behavior:
        // 1) if SL is already moved to entry => close as breakeven at entry.
        // 2) otherwise always close as SL hit (on remaining exposure only).
        if (isManualBreakevenArmed) {
          resolvedStatus = "breakeven";
          closePrice = entryPriceValue;
          closeRr = 0;
        } else {
          resolvedStatus = "sl_hit";
          if (Number.isFinite(stopLossValue)) {
            closePrice = stopLossValue;
            closeRr = -1;
          }
        }
      } else if (!isLiveCloseOnlySignal && requestedStatus === "tp_hit") {
        const tpPrice = Number(signal.take_profit);
        if (Number.isFinite(tpPrice)) {
          closePrice = tpPrice;
          closeRr = calculateSignedSignalRrForTarget(signal, tpPrice);
        }
      } else if (!isLiveCloseOnlySignal && requestedStatus === "breakeven" && isManualBreakevenArmed) {
        closePrice = entryPriceValue;
        closeRr = 0;
      }

      const updatePayload: Record<string, unknown> = {
        status: resolvedStatus,
        closed_at: new Date().toISOString(),
      };
      if (!isLiveCloseOnlySignal && closePrice !== null) {
        updatePayload.close_price = closePrice;
      }
      if (isLiveCloseOnlySignal) {
        updatePayload.close_price = closePrice;
        updatePayload.close_quoted_at = closeQuotedAt;
        updatePayload.close_source = closeSource;
      }
      const {
        error
      } = await supabase
        .from('signals')
        .update(updatePayload as any)
        .eq('id', id);
      if (error) throw error;
      if (
        signal.send_closed_trades_to_telegram &&
        (resolvedStatus === "tp_hit" || resolvedStatus === "sl_hit" || resolvedStatus === "breakeven")
      ) {
        const closedStatus = resolvedStatus as "tp_hit" | "sl_hit" | "breakeven";
        const res = await sendTelegramTradeClosed({
          signal: {
            pair: signal.pair,
            category: signal.category,
            direction: signal.direction,
            entry_price: signal.entry_price,
            stop_loss: signal.stop_loss,
            take_profit: signal.take_profit,
            status: closedStatus,
            close_price: closePrice,
            close_quoted_at: closeQuotedAt,
            rr_multiple: closeRr,
          },
        });
        if (res.ok === false) {
          toast.error(getSafeErrorMessage(res.error, "Unable to send Telegram close update right now."));
        }
      }
      if (isLiveCloseOnlySignal && closePrice != null) {
        toast.success(`Signal closed at ${closePrice} (${resolvedStatus.replace('_', ' ')})`);
      } else {
        toast.success(`Signal marked as ${resolvedStatus.replace('_', ' ')}`);
      }
      refetch();
    } catch (err) {
      console.error('Error updating status:', err);
      toast.error("Failed to update status");
    }
  };
  const openEditDialog = (signal: typeof signals[0]) => {
    setFormData({
      pair: signal.pair,
      category: signal.category,
      direction: signal.direction as "BUY" | "SELL",
      entry: signal.entry_price?.toString() || "",
      stopLoss: signal.stop_loss?.toString() || "",
      takeProfit: signal.take_profit?.toString() || "",
      signalType: signal.signal_type as "signal" | "upcoming" || "signal",
      upcomingStatus: signal.upcoming_status as "waiting" | "near_entry" | "preparing" || "waiting",
      notes: signal.notes || "",
      analysisVideoUrl: signal.analysis_video_url || "",
      analysisNotes: signal.analysis_notes || "",
      analysisImageUrl: signal.analysis_image_url || "",
      sendToTelegram: false,
      sendUpdatesToTelegram: signal.send_updates_to_telegram ?? false,
      sendClosedTradesToTelegram: signal.send_closed_trades_to_telegram ?? false
    });
    setEditingSignalId(signal.id);
  };
  const openConvertDialog = (signal: typeof signals[0]) => {
    setFormData({
      pair: signal.pair,
      category: signal.category,
      direction: signal.direction as "BUY" | "SELL",
      entry: signal.entry_price?.toString() || "",
      stopLoss: signal.stop_loss?.toString() || "",
      takeProfit: signal.take_profit?.toString() || "",
      signalType: "signal",
      // Force to signal for conversion
      upcomingStatus: "waiting",
      notes: signal.notes || "",
      analysisVideoUrl: signal.analysis_video_url || "",
      analysisNotes: signal.analysis_notes || "",
      analysisImageUrl: signal.analysis_image_url || "",
      sendToTelegram: false,
      sendUpdatesToTelegram: signal.send_updates_to_telegram ?? false,
      sendClosedTradesToTelegram: signal.send_closed_trades_to_telegram ?? false
    });
    setConvertingSignalId(signal.id);
  };
  const showLiveColumns = marketMode === "live";
  const liveModePairs = useMemo(
    () =>
      showLiveColumns
        ? visibleSignals
            .filter((s) => s.market_mode === "live" && !!s.pair)
            .map((s) => s.pair)
        : [],
    [visibleSignals, showLiveColumns]
  );
  const livePrices = useLivePrices(liveModePairs);
  useLiveSignalAutoTriggers(visibleSignals, livePrices, {
    enabled: showLiveColumns,
    enableTelegram: true,
    onSignalsClosed: refetch,
  });

  // Form extracted into a standalone component to prevent unmount/mount on each keystroke.

  return <AdminLayout title="Live Trades">
    {/* Header Actions */}
    <div className="flex items-center justify-between mb-6">
      <div className="flex items-center gap-4 text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <MetricInfoTooltip
            label={`${liveMetrics.liveSignalCount} active signals`}
            description="Live Trades shows live signal count, not user trade count."
          />
        </span>
        <span className="text-warning inline-flex items-center gap-1.5">
          <MetricInfoTooltip
            label={`${upcomingMetrics.upcomingSignalCount} upcoming`}
            description="Upcoming count is based on upcoming signals, not executed trades."
          />
        </span>
      </div>
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogTrigger asChild>
          <Button variant="gradient" onClick={resetForm} className="text-white hover:text-white [&_svg]:text-white">
            <Plus className="w-4 h-4 mr-2" />
            Create Signal
          </Button>
        </DialogTrigger>
        <DialogContent className="max-h-[90vh] p-0">
          <ScrollArea className="max-h-[85vh]">
            <div className="p-6">
              <DialogHeader>
                <DialogTitle>Create New Signal</DialogTitle>
                <DialogDescription>
                  Create a new trading signal. Users will receive push notifications.
                </DialogDescription>
              </DialogHeader>
              <AdminSignalForm
                categories={categories}
                formData={formData}
                setFormData={setFormData}
                isSubmitting={isSubmitting}
                onSubmit={handleCreate}
                submitLabel="Create & Notify Users"
                showTelegramOption={true}
                marketMode={marketMode}
                pairOptions={pairOptions}
                pairSearchLoading={pairSearchLoading}
                onPairSearch={handlePairSearch}
                onPairSelect={handlePairSelect}
                entryReadOnly={marketMode === "live" && formData.signalType === "signal" && twelveDataSymbol != null}
                entryQuotedAt={liveLockedQuotedAt}
              />
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>

    {/* Signals Table */}
    <div className="glass-card overflow-hidden shadow-none">
      {isLoading || isOpenExposureLoading ? <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div> : visibleSignals.length === 0 ? <div className="text-center py-12 text-muted-foreground">
        <p>No signals yet. Create your first signal!</p>
      </div> : <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border/50 bg-secondary/30">
              <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-4">Pair</th>
              <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-4">Provider</th>
              <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-4">Type</th>
              <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-4">Direction</th>
              <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-4">Entry</th>
              <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-4">SL / TP</th>
              {showLiveColumns && (
                <>
                  <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-4">Current</th>
                  <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-4">Live P&amp;L</th>
                </>
              )}
              <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-4">Updates</th>
              <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-4">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/30">
            {visibleSignals.map(signal => {
              const hasPublishedTpUpdates = (updatesBySignal[signal.id]?.length || 0) > 0;
              const isLiveCloseOnlySignal = marketMode === "live" && signal.market_mode === "live";
              const currentPrice =
                showLiveColumns && isLiveCloseOnlySignal ? livePrices[signal.pair] : undefined;
              const liveRr =
                currentPrice != null
                  ? deriveLiveCloseOutcome(signal, currentPrice).rr
                  : null;
              const livePnlLabel =
                liveRr == null ? "--" : `${liveRr >= 0 ? "+" : ""}${liveRr.toFixed(2)}R`;
              const livePnlClass =
                liveRr == null
                  ? "text-muted-foreground"
                  : liveRr >= 0
                    ? "text-success"
                    : "text-destructive";
              const disabledReason = hasPublishedTpUpdates
                ? "Disabled after first TP update is published."
                : isLiveCloseOnlySignal
                  ? "Disabled in live mode. Use red button to close at market price."
                  : undefined;
              const entryPriceValue = Number(signal.entry_price);
              const stopLossValue = Number(signal.stop_loss);
              const isManualBreakevenArmed =
                !isLiveCloseOnlySignal &&
                Number.isFinite(entryPriceValue) &&
                Number.isFinite(stopLossValue) &&
                Math.abs(stopLossValue - entryPriceValue) <= 1e-8;
              const breakevenDisabledReason = isLiveCloseOnlySignal
                ? "Disabled in live mode. Use red button to close at market price."
                : !isManualBreakevenArmed
                  ? "Available after SL is moved to entry (break-even)."
                  : undefined;
              return <tr key={signal.id} className="hover:bg-accent/30 transition-colors">
              <td className="px-6 py-4">
                <div>
                  <p className="font-semibold">{signal.pair}</p>
                  <p className="text-xs text-muted-foreground">{signal.category}</p>
                </div>
              </td>
              <td className="px-6 py-4">
                <span className="text-sm text-muted-foreground">
                  {providerNameMap[signal.created_by || ""] || "Admin"}
                </span>
              </td>
              <td className="px-6 py-4">
                <Badge variant="outline" className={signal.signal_type === 'upcoming' ? 'border-warning/30 text-warning bg-warning/10' : 'border-primary/30 text-primary bg-primary/10'}>
                  {signal.signal_type === 'upcoming' ? 'Upcoming' : 'Signal'}
                </Badge>
              </td>
              <td className="px-6 py-4">
                <div className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-sm font-medium", signal.direction === "BUY" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive")}>
                  {signal.direction === "BUY" ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                  {signal.direction}
                </div>
              </td>
              <td className="px-6 py-4">
                <span className="font-mono text-sm">{signal.entry_price ?? '—'}</span>
              </td>
              <td className="px-6 py-4">
                <div className="text-xs font-mono whitespace-nowrap">
                  <span className="text-destructive">{signal.stop_loss ?? "-"}</span>
                  <span className="text-muted-foreground mx-1">/</span>
                  <span className="text-success">{signal.take_profit ?? "-"}</span>
                </div>
              </td>
              {showLiveColumns && (
                <>
                  <td className="px-6 py-4">
                    <span className="font-mono text-sm">
                      {currentPrice != null ? currentPrice.toFixed(5) : "--"}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={cn("font-mono text-sm font-semibold", livePnlClass)}>
                      {livePnlLabel}
                    </span>
                  </td>
                </>
              )}
              <td className="px-6 py-4 text-center">
                {signal.signal_type === "signal" ? (
                  <SignalTakeProfitUpdatesDialog
                    signal={signal}
                    currentUserId={user?.id || ""}
                    disabled={signal.status !== "active"}
                  />
                ) : (
                  <span className="text-xs text-muted-foreground">-</span>
                )}
              </td>
              <td className="px-6 py-4">
                <div className="flex items-center justify-end gap-2">
                  {/* Convert to Signal button for upcoming trades */}
                  {signal.signal_type === "upcoming" && <Dialog open={convertingSignalId === signal.id} onOpenChange={open => !open && setConvertingSignalId(null)}>
                    <DialogTrigger asChild>
                      <Button size="sm" variant="outline" className="border-primary/30 text-primary hover:bg-primary/10" onClick={() => openConvertDialog(signal)}>
                        <Zap className="w-4 h-4 mr-1" />
                        Activate
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-h-[90vh] overflow-hidden p-0">
                      <ScrollArea className="h-[85vh] w-full">
                        <div className="p-6">
                          <DialogHeader>
                            <DialogTitle>Convert to Active Signal</DialogTitle>
                            <DialogDescription>
                              Fill in the entry prices to publish this as an active signal. Users will be notified.
                            </DialogDescription>
                          </DialogHeader>
                          <AdminSignalForm
                            categories={categories}
                            formData={formData}
                            setFormData={setFormData}
                            isSubmitting={isSubmitting}
                            onSubmit={handleConvertToSignal}
                            submitLabel="Publish Signal"
                            showTelegramOption={true}
                          />
                        </div>
                      </ScrollArea>
                    </DialogContent>
                  </Dialog>}
                  {signal.status === "active" && signal.signal_type === "signal" && <>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={hasPublishedTpUpdates || isLiveCloseOnlySignal}
                      title={disabledReason}
                      className="border-success/30 text-success hover:bg-success/10 disabled:opacity-40 disabled:cursor-not-allowed"
                      onClick={() => updateStatus(signal.id, "tp_hit")}
                    >
                      <CheckCircle2 className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isLiveCloseOnlySignal || !isManualBreakevenArmed}
                      title={breakevenDisabledReason}
                      className="border-warning/30 text-warning hover:bg-warning/10 disabled:opacity-40 disabled:cursor-not-allowed"
                      onClick={() => updateStatus(signal.id, "breakeven")}
                    >
                      <MinusCircle className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      title={
                        isLiveCloseOnlySignal
                          ? "Close trade at current live market price."
                          : isManualBreakevenArmed
                            ? "Close at break-even entry price."
                            : "Close at SL hit for remaining position."
                      }
                      className="border-destructive/30 text-destructive hover:bg-destructive/10 disabled:opacity-40 disabled:cursor-not-allowed"
                      onClick={() => updateStatus(signal.id, "sl_hit")}
                    >
                      <XCircle className="w-4 h-4" />
                    </Button>
                  </>}
                  {/* Edit and Delete buttons - ONLY for upcoming (unpublished) signals */}
                  {/* Published signals (signal_type === 'signal') are IMMUTABLE */}
                  {signal.signal_type === "upcoming" && (
                    <>
                      <Dialog open={editingSignalId === signal.id} onOpenChange={open => !open && setEditingSignalId(null)}>
                        <DialogTrigger asChild>
                          <Button size="sm" variant="ghost" onClick={() => openEditDialog(signal)}>
                            <Pencil className="w-4 h-4" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-h-[90vh] p-0">
                          <ScrollArea className="max-h-[85vh]">
                            <div className="p-6">
                              <DialogHeader>
                                <DialogTitle>Edit Upcoming Trade</DialogTitle>
                                <DialogDescription>Update the upcoming trade details before publishing.</DialogDescription>
                              </DialogHeader>
                              <AdminSignalForm categories={categories} formData={formData} setFormData={setFormData} isSubmitting={isSubmitting} onSubmit={handleEdit} submitLabel="Update" showTelegramOption={true} />
                            </div>
                          </ScrollArea>
                        </DialogContent>
                      </Dialog>
                      <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => handleDelete(signal.id)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </>
                  )}
                </div>
              </td>
            </tr>;
            })}
          </tbody>
        </table>
      </div>}
    </div>
  </AdminLayout>;
};
export default AdminSignals;
