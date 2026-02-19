import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { shouldSuppressQueryErrorLog } from "@/lib/queryStability";

interface UseOpenExposureSignalIdsOptions {
  realtime?: boolean;
}

export const useOpenExposureSignalIds = (
  signalIds: string[],
  options: UseOpenExposureSignalIdsOptions = {}
) => {
  const { realtime = true } = options;
  const [openSignalIds, setOpenSignalIds] = useState<Set<string>>(new Set());
  const [signalIdsWithTrades, setSignalIdsWithTrades] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const channelNameRef = useRef(`open_exposure_signal_ids_${Math.random().toString(36).slice(2)}`);
  const requestSeqRef = useRef(0);

  const stableSignalIdsKey = useMemo(
    () => Array.from(new Set(signalIds.filter(Boolean))).sort().join("|"),
    [signalIds]
  );

  const fetchOpenSignalIds = useCallback(async () => {
    const requestId = ++requestSeqRef.current;
    const ids = stableSignalIdsKey ? stableSignalIdsKey.split("|") : [];
    if (ids.length === 0) {
      // Keep previous sets to avoid transient empty-state flicker while parent lists refresh.
      if (requestId === requestSeqRef.current) {
        setIsLoading(false);
      }
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("user_trades")
        .select("signal_id, result, remaining_risk_amount")
        .in("signal_id", ids)
        .not("signal_id", "is", null);

      if (error) throw error;
      if (requestId !== requestSeqRef.current) return;

      const open = new Set<string>();
      const withTrades = new Set<string>();
      for (const row of (data || []) as Array<{
        signal_id: string | null;
        result: string | null;
        remaining_risk_amount: number | string | null;
      }>) {
        if (!row.signal_id) continue;
        withTrades.add(row.signal_id);
        const remaining = Number(row.remaining_risk_amount || 0);
        if (row.result === "pending" && Number.isFinite(remaining) && remaining > 0.01) {
          open.add(row.signal_id);
        }
      }
      setOpenSignalIds(open);
      setSignalIdsWithTrades(withTrades);
    } catch (err) {
      if (requestId !== requestSeqRef.current) return;
      if (!shouldSuppressQueryErrorLog(err)) {
        console.error("Error fetching open exposure signal ids:", err);
      }
    } finally {
      if (requestId === requestSeqRef.current) {
        setIsLoading(false);
      }
    }
  }, [stableSignalIdsKey]);

  useEffect(() => {
    void fetchOpenSignalIds();
  }, [fetchOpenSignalIds]);

  useEffect(() => {
    if (!realtime || !stableSignalIdsKey) return;

    const channel = supabase
      .channel(channelNameRef.current)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_trades",
        },
        () => {
          void fetchOpenSignalIds();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [realtime, stableSignalIdsKey, fetchOpenSignalIds]);

  return {
    openSignalIds,
    signalIdsWithTrades,
    isLoading,
    refetch: fetchOpenSignalIds,
  };
};
