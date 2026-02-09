import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Signal } from "@/types/database";
import { Play, FileText, Image, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

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

  if (!signal) return null;

  const hasVideo = signal.analysis_video_url;
  const hasNotes = signal.analysis_notes;
  const hasImage = signal.analysis_image_url;
  const hasAnyAnalysis = hasVideo || hasNotes || hasImage;

  if (!hasAnyAnalysis) return null;

  const videoId = hasVideo ? extractYouTubeId(signal.analysis_video_url!) : null;
  const notesPreviewLength = 200;
  const shouldTruncateNotes = hasNotes && signal.analysis_notes!.length > notesPreviewLength;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="font-bold">{signal.pair}</span>
            <span className="text-muted-foreground font-normal">Analysis</span>
          </DialogTitle>
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
                  <img
                    src={signal.analysis_image_url!}
                    alt="Analysis chart"
                    className="w-full h-auto object-contain max-h-[400px]"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                </div>
                <a
                  href={signal.analysis_image_url!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  Open full size <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

// Helper hook to check if signal has analysis content
export const useHasAnalysis = (signal: Signal | null | undefined): boolean => {
  if (!signal) return false;
  return !!(signal.analysis_video_url || signal.analysis_notes || signal.analysis_image_url);
};
