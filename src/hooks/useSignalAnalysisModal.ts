import { useState, useCallback } from "react";
import { Signal } from "@/types/database";
import { preloadSignalAnalysisMedia } from "@/lib/signalAnalysisMedia";

/**
 * Hook to manage signal analysis modal state
 * Returns state and handlers for opening/closing the analysis modal
 */
export const useSignalAnalysisModal = () => {
  const [selectedSignal, setSelectedSignal] = useState<Signal | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const openAnalysis = useCallback((signal: Signal) => {
    // Only open if signal has analysis content
    const hasAnalysis = signal.analysis_video_url || signal.analysis_notes || signal.analysis_image_url;
    if (hasAnalysis) {
      void preloadSignalAnalysisMedia(signal);
      setSelectedSignal(signal);
      setIsOpen(true);
    }
  }, []);

  const closeAnalysis = useCallback(() => {
    setIsOpen(false);
    // Delay clearing signal to allow closing animation
    setTimeout(() => setSelectedSignal(null), 200);
  }, []);

  const handleOpenChange = useCallback((open: boolean) => {
    if (!open) {
      closeAnalysis();
    }
  }, [closeAnalysis]);

  return {
    selectedSignal,
    isOpen,
    openAnalysis,
    closeAnalysis,
    handleOpenChange,
  };
};

/**
 * Check if a signal has analysis content
 */
export const hasAnalysisContent = (signal: Signal | null | undefined): boolean => {
  if (!signal) return false;
  return !!(signal.analysis_video_url || signal.analysis_notes || signal.analysis_image_url);
};
