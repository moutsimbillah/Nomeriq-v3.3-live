import { useState } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Pencil, Trash2, ArrowUpRight, ArrowDownRight, CheckCircle2, XCircle, Loader2, Zap, MinusCircle, User, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useProviderSignals } from "@/hooks/useProviderSignals";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { AdminSignalForm } from "@/components/admin/AdminSignalForm";
import { Signal } from "@/types/database";
import { getTelegramDeliveryFeedback, sendTelegramSignal, sendTelegramTradeClosed } from "@/lib/telegram";
import { SignalTakeProfitUpdatesDialog } from "@/components/signals/SignalTakeProfitUpdatesDialog";
import { getSafeErrorMessage } from "@/lib/error-sanitizer";

const categories = ["Forex", "Metals", "Crypto", "Indices", "Commodities"];

const ProviderSignals = () => {
  const { signals, isLoading, refetch } = useProviderSignals({ realtime: true });
  const { user, profile } = useAuth();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingSignalId, setEditingSignalId] = useState<string | null>(null);
  const [convertingSignalId, setConvertingSignalId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
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
  };

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

    setIsSubmitting(true);
    try {
      const baseSuccessMessage =
        formData.signalType === 'upcoming' ? "Upcoming trade created successfully." : "Signal created successfully.";
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

      setIsCreateOpen(false);
      resetForm();
      refetch();
    } catch (err: any) {
      console.error('Error creating signal:', err);
      toast.error("Failed to create signal. Please try again.");
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
      const { error } = await supabase.from('signals').update({
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
      }).eq('id', editingSignalId).eq('created_by', user?.id); // Only update own signals

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
      const { error } = await supabase.from('signals').update({
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
      }).eq('id', convertingSignalId).eq('created_by', user?.id);

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
      const { error } = await supabase.from('signals').delete().eq('id', id).eq('created_by', user?.id);
      if (error) throw error;
      toast.success("Signal deleted");
      refetch();
    } catch (err) {
      console.error('Error deleting signal:', err);
      toast.error("Failed to delete signal");
    }
  };

  const updateStatus = async (id: string, status: string) => {
    try {
      const signal = signals.find((s) => s.id === id);
      const { error } = await supabase.from('signals').update({
        status,
        closed_at: status !== 'active' ? new Date().toISOString() : null
      }).eq('id', id).eq('created_by', user?.id);

      if (error) throw error;
      if (
        signal &&
        signal.send_closed_trades_to_telegram &&
        (status === "tp_hit" || status === "sl_hit" || status === "breakeven")
      ) {
        const closedStatus = status as "tp_hit" | "sl_hit" | "breakeven";
        const res = await sendTelegramTradeClosed({
          signal: {
            pair: signal.pair,
            category: signal.category,
            direction: signal.direction,
            entry_price: signal.entry_price,
            stop_loss: signal.stop_loss,
            take_profit: signal.take_profit,
            status: closedStatus,
          },
        });
        if (res.ok === false) {
          toast.error(getSafeErrorMessage(res.error, "Unable to send Telegram close update right now."));
        }
      }
      toast.success(`Signal marked as ${status.replace('_', ' ')}`);
      refetch();
    } catch (err) {
      console.error('Error updating status:', err);
      toast.error("Failed to update status");
    }
  };

  const openEditDialog = (signal: Signal) => {
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

  const openConvertDialog = (signal: Signal) => {
    setFormData({
      pair: signal.pair,
      category: signal.category,
      direction: signal.direction as "BUY" | "SELL",
      entry: signal.entry_price?.toString() || "",
      stopLoss: signal.stop_loss?.toString() || "",
      takeProfit: signal.take_profit?.toString() || "",
      signalType: "signal",
      upcomingStatus: "waiting",
      notes: signal.notes || "",
      analysisVideoUrl: signal.analysis_video_url || "",
      analysisNotes: signal.analysis_notes || "",
      analysisImageUrl: signal.analysis_image_url || "",
      sendToTelegram: true,  // Default to true when converting to active
      sendUpdatesToTelegram: signal.send_updates_to_telegram ?? false,
      sendClosedTradesToTelegram: signal.send_closed_trades_to_telegram ?? false
    });
    setConvertingSignalId(signal.id);
  };

  const getStatusDisplay = (signal: Signal) => {
    if (signal.signal_type === 'upcoming') {
      switch (signal.upcoming_status) {
        case 'near_entry': return 'Near Entry';
        case 'preparing': return 'Preparing';
        case 'waiting': return 'Waiting';
        default: return 'Upcoming';
      }
    }
    switch (signal.status) {
      case 'active': return 'Running';
      case 'tp_hit': return 'TP Hit';
      case 'sl_hit': return 'SL Hit';
      case 'breakeven': return 'Breakeven';
      case 'closed': return 'Closed';
      default: return signal.status;
    }
  };

  const getStatusBadgeClass = (signal: Signal) => {
    if (signal.signal_type === 'upcoming') {
      switch (signal.upcoming_status) {
        case 'near_entry': return 'border-warning/30 text-warning bg-warning/10';
        case 'preparing': return 'border-primary/30 text-primary bg-primary/10';
        default: return 'border-muted-foreground/30 text-muted-foreground bg-muted/50';
      }
    }
    switch (signal.status) {
      case 'active': return 'border-primary/30 text-primary bg-primary/10';
      case 'tp_hit': return 'border-success/30 text-success bg-success/10';
      case 'sl_hit': return 'border-destructive/30 text-destructive bg-destructive/10';
      case 'breakeven': return 'border-warning/30 text-warning bg-warning/10';
      default: return 'border-muted-foreground/30 text-muted-foreground';
    }
  };

  const providerName = profile?.first_name || 'Provider';
  const visibleSignals = signals.filter(
    (s) => s.signal_type === "upcoming" || s.status === "active"
  );

  return (
    <AdminLayout title="Live Trades">
      {/* Provider Info Banner */}
      <div className="glass-card p-4 mb-6 shadow-none border-l-4 border-l-primary">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <User className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="text-sm font-medium">{providerName}'s Signals</p>
            <p className="text-xs text-muted-foreground">
              You can only view and manage signals you have created. Other providers' signals are not visible.
            </p>
          </div>
        </div>
      </div>

      {/* Header Actions */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4 text-muted-foreground">
          <span>{signals.filter(s => s.status === "active" && s.signal_type === "signal").length} active signals</span>
          <span className="text-warning">{signals.filter(s => s.signal_type === "upcoming").length} upcoming</span>
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
                />
              </div>
            </ScrollArea>
          </DialogContent>
        </Dialog>
      </div>

      {/* Signals Table */}
      <div className="glass-card overflow-hidden shadow-none">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : visibleSignals.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p className="font-medium">No signals yet</p>
            <p className="text-sm mt-1">Create your first signal to start providing trade alerts!</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border/50 bg-secondary/30">
                  <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-4">Pair</th>
                  <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-4">Type</th>
                  <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-4">Direction</th>
                  <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-4">Entry</th>
                  <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-4">SL / TP</th>
                  <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-4">Status</th>
                  <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-4">Updates</th>
                  <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-4">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {visibleSignals.map(signal => (
                  <tr key={signal.id} className="hover:bg-accent/30 transition-colors">
                    <td className="px-6 py-4">
                      <div>
                        <p className="font-semibold">{signal.pair}</p>
                        <p className="text-xs text-muted-foreground">{signal.category}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <Badge variant="outline" className={signal.signal_type === 'upcoming' ? 'border-warning/30 text-warning bg-warning/10' : 'border-primary/30 text-primary bg-primary/10'}>
                        {signal.signal_type === 'upcoming' ? 'Upcoming' : 'Signal'}
                      </Badge>
                    </td>
                    <td className="px-6 py-4">
                      <div className={cn(
                        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-sm font-medium",
                        signal.direction === "BUY" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"
                      )}>
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
                    <td className="px-6 py-4 text-center">
                      <Badge variant="outline" className={getStatusBadgeClass(signal)}>
                        {getStatusDisplay(signal)}
                      </Badge>
                    </td>
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
                        {signal.signal_type === "upcoming" && (
                          <Dialog open={convertingSignalId === signal.id} onOpenChange={open => !open && setConvertingSignalId(null)}>
                            <DialogTrigger asChild>
                              <Button size="sm" variant="outline" className="border-primary/30 text-primary hover:bg-primary/10" onClick={() => openConvertDialog(signal)}>
                                <Zap className="w-4 h-4 mr-1" />
                                Activate
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="max-h-[90vh] overflow-hidden p-0">
                              <ScrollArea className="h-[85vh]">
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
                          </Dialog>
                        )}

                        {signal.status === "active" && signal.signal_type === "signal" && (
                          <>
                            <Button size="sm" variant="outline" className="border-success/30 text-success hover:bg-success/10" onClick={() => updateStatus(signal.id, "tp_hit")}>
                              <CheckCircle2 className="w-4 h-4" />
                            </Button>
                            <Button size="sm" variant="outline" className="border-warning/30 text-warning hover:bg-warning/10" onClick={() => updateStatus(signal.id, "breakeven")}>
                              <MinusCircle className="w-4 h-4" />
                            </Button>
                            <Button size="sm" variant="outline" className="border-destructive/30 text-destructive hover:bg-destructive/10" onClick={() => updateStatus(signal.id, "sl_hit")}>
                              <XCircle className="w-4 h-4" />
                            </Button>
                          </>
                        )}

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
                                    <AdminSignalForm
                                      categories={categories}
                                      formData={formData}
                                      setFormData={setFormData}
                                      isSubmitting={isSubmitting}
                                      onSubmit={handleEdit}
                                      submitLabel="Update"
                                    />
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Disclaimer */}
      <div className="mt-6 p-4 rounded-xl bg-primary/10 border border-primary/20">
        <p className="text-xs text-primary leading-relaxed">
          🔒 <strong>Provider Isolation:</strong> You can only see and manage your own signals.
          Signals created by other providers are not visible to you.
          When you create a signal, it is automatically assigned to your provider account.
        </p>
      </div>
    </AdminLayout>
  );
};

export default ProviderSignals;
