import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { UserTrade } from "@/types/database";
import { useSignalTakeProfitUpdates } from "@/hooks/useSignalTakeProfitUpdates";
import { format, differenceInMinutes, differenceInHours, differenceInDays } from "date-fns";
import { cn } from "@/lib/utils";
import { FileText, ExternalLink, Image as ImageIcon, Play } from "lucide-react";
import { resolveAnalysisImageUrl } from "@/lib/signalAnalysisMedia";
import {
  calculateDisplayedPotentialProfit,
  calculateSignalRrForTarget,
  calculateSignedSignalRrForTarget,
} from "@/lib/trade-math";

interface TradeDetailsDialogProps {
  trade: UserTrade;
}

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
  const signalId = signal?.id ? [signal.id] : [];
  const { updatesBySignal } = useSignalTakeProfitUpdates({ signalIds: signalId, realtime: false });
  const updates = signal?.id ? (updatesBySignal[signal.id] || []) : [];
  const tpRows = useMemo(() => {
    const initialRisk = Number(trade.initial_risk_amount ?? trade.risk_amount ?? 0);
    let runningRemainingRisk = Math.max(0, initialRisk);
    return updates.map((u) => {
      const closePercent = Math.max(0, Math.min(100, Number(u.close_percent ?? 0)));
      const reducedRisk = runningRemainingRisk * (closePercent / 100);
      let remainingAfterRisk = Math.max(0, runningRemainingRisk - reducedRisk);
      if (closePercent >= 100) {
        remainingAfterRisk = 0;
      }
      const rrAtTp = calculateSignedSignalRrForTarget(signal, Number(u.tp_price));
      const realizedProfit = reducedRisk * rrAtTp;
      const remainingAfterPercent = initialRisk > 0 ? (remainingAfterRisk / initialRisk) * 100 : 0;
      runningRemainingRisk = remainingAfterRisk;
      return {
        ...u,
        closePercent,
        remainingAfterPercent,
        rrAtTp,
        realizedProfit,
      };
    });
  }, [updates, trade.initial_risk_amount, trade.risk_amount, signal]);

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

  const potentialProfit = calculateDisplayedPotentialProfit({
    ...trade,
    signal: signal ? { ...signal, take_profit: currentTargetTp } : signal,
  });
  const initialRisk = Number(trade.initial_risk_amount ?? trade.risk_amount ?? 0);
  const remainingRisk = Math.max(
    0,
    Number(
      trade.remaining_risk_amount ??
        (trade.result === "pending" ? initialRisk : 0)
    )
  );
  const remainingPercent = initialRisk > 0 ? (remainingRisk / initialRisk) * 100 : 0;
  const duration = getDuration(trade.created_at, trade.closed_at);
  const hasAnalysis = Boolean(signal?.analysis_notes || signal?.analysis_video_url || signal?.analysis_image_url);
  const videoId = signal?.analysis_video_url ? extractYouTubeId(signal.analysis_video_url) : null;

  useEffect(() => {
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
  }, [signal?.analysis_image_url]);

  return (
    <Dialog>
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
              <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wide">TP Updates</p>
              {tpRows.length === 0 ? (
                <p className="text-sm text-muted-foreground">No TP updates published.</p>
              ) : (
                <div className="space-y-2">
                  {tpRows.map((u) => (
                    <div key={u.id} className="rounded-md bg-secondary/30 px-3 py-2 text-sm flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{u.tp_label}</Badge>
                      <span className="font-mono">Price: {u.tp_price}</span>
                      <span className="text-primary">Close: {u.closePercent.toFixed(2)}%</span>
                      <span
                        className={cn(
                          "font-semibold",
                          u.realizedProfit >= 0 ? "text-success" : "text-destructive"
                        )}
                      >
                        Profit: {u.realizedProfit >= 0 ? "+" : ""}${u.realizedProfit.toFixed(2)}
                      </span>
                      <span className="text-muted-foreground">Remaining: {u.remainingAfterPercent.toFixed(2)}%</span>
                      {u.note && <span className="text-muted-foreground">- {u.note}</span>}
                    </div>
                  ))}
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
