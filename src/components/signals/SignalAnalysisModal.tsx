import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Signal } from "@/types/database";
import { Play, FileText, Image, ChevronDown, ChevronUp, ExternalLink, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { resolveAnalysisImageUrl } from "@/lib/signalAnalysisMedia";

interface SignalAnalysisModalProps {
  signal: Signal | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Helper to extract YouTube video ID from various URL formats
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

export const SignalAnalysisModal = ({
  signal,
  open,
  onOpenChange,
}: SignalAnalysisModalProps) => {
  const [isNotesExpanded, setIsNotesExpanded] = useState(false);
  const [resolvedImageUrl, setResolvedImageUrl] = useState<string | null>(null);
  const [isImageLoading, setIsImageLoading] = useState(false);
  const [hasImageError, setHasImageError] = useState(false);
  const [isImageViewerOpen, setIsImageViewerOpen] = useState(false);

  const hasVideo = signal?.analysis_video_url;
  const hasNotes = signal?.analysis_notes;
  const hasImage = signal?.analysis_image_url;
  const hasAnyAnalysis = Boolean(hasVideo || hasNotes || hasImage);

  const videoId = hasVideo ? extractYouTubeId(signal?.analysis_video_url || "") : null;
  const notesPreviewLength = 200;
  const shouldTruncateNotes = Boolean(hasNotes && (signal?.analysis_notes || "").length > notesPreviewLength);

  useEffect(() => {
    const resolveImage = async () => {
      if (!signal?.analysis_image_url) {
        setResolvedImageUrl(null);
        setIsImageLoading(false);
        setHasImageError(false);
        return;
      }

      setHasImageError(false);

      setIsImageLoading(true);
      const url = await resolveAnalysisImageUrl(signal.analysis_image_url);
      setIsImageLoading(false);
      setResolvedImageUrl(url);
    };

    void resolveImage();
  }, [signal?.analysis_image_url]);

  useEffect(() => {
    // Never keep fullscreen viewer open across modal state changes.
    if (!open) {
      setIsImageViewerOpen(false);
    }
  }, [open, signal?.id]);

  if (!signal || !hasAnyAnalysis) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="max-w-2xl max-h-[90vh] overflow-hidden">
        <DialogHeader className="pr-10">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <DialogTitle className="flex items-center gap-2">
              <span className="font-bold">{signal.pair}</span>
              <span className="text-muted-foreground font-normal">Analysis</span>
            </DialogTitle>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="outline" className="font-mono">Pair: {signal.pair}</Badge>
              <Badge variant="outline" className="font-mono">Entry: {signal.entry_price ?? "-"}</Badge>
              <Badge variant="outline" className="font-mono">SL: {signal.stop_loss ?? "-"}</Badge>
              <Badge variant="outline" className="font-mono">TP: {signal.take_profit ?? "-"}</Badge>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(90vh-120px)] pr-4">
          <div className="space-y-6">
            {/* YouTube Video */}
            {hasVideo && videoId && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Play className="w-4 h-4" />
                  <span>Video Analysis</span>
                </div>
                <div className="relative w-full aspect-video rounded-lg overflow-hidden bg-secondary">
                  <iframe
                    src={`https://www.youtube.com/embed/${videoId}`}
                    title="Analysis Video"
                    className="absolute inset-0 w-full h-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
                <a
                  href={signal.analysis_video_url!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  Open in YouTube <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}

            {/* Text Notes */}
            {hasNotes && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <FileText className="w-4 h-4" />
                  <span>Notes</span>
                </div>
                <div className="p-4 rounded-lg bg-secondary/50 border border-border/50">
                  <p className={cn(
                    "text-sm whitespace-pre-wrap",
                    !isNotesExpanded && shouldTruncateNotes && "line-clamp-4"
                  )}>
                    {isNotesExpanded || !shouldTruncateNotes
                      ? signal.analysis_notes
                      : `${signal.analysis_notes!.slice(0, notesPreviewLength)}...`}
                  </p>
                  {shouldTruncateNotes && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-2 h-auto p-0 text-primary"
                      onClick={() => setIsNotesExpanded(!isNotesExpanded)}
                    >
                      {isNotesExpanded ? (
                        <>
                          <ChevronUp className="w-4 h-4 mr-1" />
                          Show less
                        </>
                      ) : (
                        <>
                          <ChevronDown className="w-4 h-4 mr-1" />
                          Read more
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* Image */}
            {hasImage && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Image className="w-4 h-4" />
                  <span>Chart/Image</span>
                </div>
                <div className="rounded-lg overflow-hidden border border-border/50">
                  {isImageLoading || !resolvedImageUrl ? (
                    <div className="h-52 bg-secondary/30" />
                  ) : hasImageError ? (
                    <div className="h-32 flex items-center justify-center text-sm text-muted-foreground">
                      Image unavailable
                    </div>
                  ) : (
                    <div
                      role="button"
                      tabIndex={0}
                      className="w-full"
                      onClick={() => resolvedImageUrl && setIsImageViewerOpen(true)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          if (resolvedImageUrl) setIsImageViewerOpen(true);
                        }
                      }}
                    >
                      <img
                        src={resolvedImageUrl}
                        alt="Analysis chart"
                        className="w-full h-auto object-contain max-h-[400px] cursor-zoom-in"
                        onContextMenu={(e) => e.preventDefault()}
                        draggable={false}
                        onError={() => setHasImageError(true)}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>

      {isImageViewerOpen && resolvedImageUrl && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-[9999] bg-black/95 flex items-center justify-center p-4">
              <button
                type="button"
                className="absolute top-4 right-4 h-10 w-10 rounded-full border border-white/20 text-white hover:bg-white/10 inline-flex items-center justify-center"
                onClick={() => setIsImageViewerOpen(false)}
              >
                <X className="w-5 h-5" />
              </button>
              <img
                src={resolvedImageUrl}
                alt="Analysis chart full size"
                className="max-w-full max-h-full object-contain"
                onContextMenu={(e) => e.preventDefault()}
                draggable={false}
              />
            </div>,
            document.body
          )
        : null}
    </Dialog>
  );
};

