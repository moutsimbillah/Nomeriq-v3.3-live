import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SignalTakeProfitUpdate } from "@/types/database";
import { isAbortLikeError, shouldSuppressQueryErrorLog } from "@/lib/queryStability";

interface UseSignalTakeProfitUpdatesOptions {
  signalIds: string[];
  realtime?: boolean;
}

export const useSignalTakeProfitUpdates = ({
  signalIds,
  realtime = true,
}: UseSignalTakeProfitUpdatesOptions) => {
  const [updatesBySignal, setUpdatesBySignal] = useState<Record<string, SignalTakeProfitUpdate[]>>({});
  const [isLoading, setIsLoading] = useState(false);
  const channelNameRef = useRef(`signal_tp_updates_${Math.random().toString(36).slice(2)}`);

  const stableSignalIdsKey = useMemo(
    () => Array.from(new Set(signalIds.filter(Boolean))).sort().join("|"),
    [signalIds]
  );
  const stableSignalIds = useMemo(
    () => (stableSignalIdsKey ? stableSignalIdsKey.split("|") : []),
    [stableSignalIdsKey]
  );

  const fetchUpdates = useCallback(async () => {
    const ids = stableSignalIdsKey ? stableSignalIdsKey.split("|") : [];
    if (ids.length === 0) {
      setUpdatesBySignal({});
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("signal_take_profit_updates")
        .select("*")
        .in("signal_id", ids)
        .order("created_at", { ascending: true });

      if (error) throw error;

      const grouped: Record<string, SignalTakeProfitUpdate[]> = {};
      for (const row of (data || []) as SignalTakeProfitUpdate[]) {
        if (!grouped[row.signal_id]) grouped[row.signal_id] = [];
        grouped[row.signal_id].push(row);
      }
      setUpdatesBySignal(grouped);
    } catch (err) {
      if (!shouldSuppressQueryErrorLog(err)) {
        console.error("Error fetching signal TP updates:", err);
      }
    } finally {
      setIsLoading(false);
    }
  }, [stableSignalIdsKey]);

  useEffect(() => {
    fetchUpdates();
  }, [fetchUpdates]);

  useEffect(() => {
    if (!realtime || stableSignalIdsKey.length === 0) return;

    const interval = setInterval(() => {
      fetchUpdates();
    }, 12000);

    return () => clearInterval(interval);
  }, [realtime, stableSignalIdsKey, fetchUpdates]);

  useEffect(() => {
    if (!realtime || stableSignalIdsKey.length === 0) return;

    const channel = supabase
      .channel(channelNameRef.current)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "signal_take_profit_updates",
        },
        () => {
          fetchUpdates();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [realtime, stableSignalIdsKey, fetchUpdates]);

  const totalUpdates = useMemo(
    () => Object.values(updatesBySignal).reduce((sum, list) => sum + list.length, 0),
    [updatesBySignal]
  );

  return {
    updatesBySignal,
    isLoading,
    totalUpdates,
    refetch: fetchUpdates,
  };
};

export interface CreateTakeProfitUpdateInput {
  tpLabel: string;
  tpPrice: number;
  closePercent: number;
  note?: string;
}

export const createSignalTakeProfitUpdates = async (
  signalId: string,
  createdBy: string,
  updates: CreateTakeProfitUpdateInput[]
) => {
  if (!signalId) {
    throw new Error("Missing signal id.");
  }
  if (!createdBy) {
    throw new Error("User session not ready. Please re-login and try again.");
  }
  if (updates.length === 0) {
    throw new Error("Please add at least one TP update row.");
  }

  const payload = updates.map((u) => ({
    signal_id: signalId,
    created_by: createdBy,
    tp_label: u.tpLabel,
    tp_price: u.tpPrice,
    close_percent: u.closePercent,
    note: u.note?.trim() || null,
  }));

  const maxRetries = 2;
  let attempt = 0;
  let lastError: unknown = null;

  while (attempt <= maxRetries) {
    const { error } = await supabase.from("signal_take_profit_updates").insert(payload);
    if (!error) {
      return;
    }

    lastError = error;
    if (!isAbortLikeError(error) || attempt === maxRetries) {
      break;
    }

    const backoffMs = 250 * (attempt + 1);
    await new Promise((resolve) => setTimeout(resolve, backoffMs));
    attempt += 1;
  }

  const errObj = (lastError ?? {}) as { message?: string; details?: string };
  const msg = `${errObj.message || "Insert failed"} ${errObj.details || ""}`.trim();
  throw new Error(msg);
};
