import { useEffect, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { sendTelegramTradeClosed } from "@/lib/telegram";
import { getSafeErrorMessage } from "@/lib/error-sanitizer";
import type { Signal } from "@/types/database";
import { calculateSignedSignalRrForTarget } from "@/lib/trade-math";

interface ProcessedRow {
  signal_id: string;
  resolved_status: "tp_hit" | "sl_hit" | "breakeven";
  close_price: number | null;
  close_quoted_at: string | null;
  close_source: string | null;
  closed_now: boolean;
}

interface ProcessedLimitUpdateRow {
  signal_id: string;
  signal_update_id: string;
  triggered: boolean;
  applied_count: number;
  quote_price: number | null;
  quote_quoted_at: string | null;
}

interface UseLiveSignalAutoTriggersOptions {
  enabled?: boolean;
  enableTelegram?: boolean;
  onSignalsClosed?: () => void;
}

export const useLiveSignalAutoTriggers = (
  signals: Signal[],
  livePrices: Record<string, number>,
  options: UseLiveSignalAutoTriggersOptions = {}
) => {
  const { enabled = true, enableTelegram = false, onSignalsClosed } = options;
  const inFlightRef = useRef(false);
  const lastFingerprintRef = useRef<string>("");

  const activeLiveSignals = useMemo(
    () =>
      signals.filter(
        (s) =>
          s.signal_type === "signal" &&
          s.status === "active" &&
          s.market_mode === "live" &&
          !!s.pair
      ),
    [signals]
  );

  const signalIds = useMemo(() => activeLiveSignals.map((s) => s.id), [activeLiveSignals]);

  // Trigger evaluation only when a visible quote changed.
  const priceFingerprint = useMemo(
    () =>
      activeLiveSignals
        .map((s) => `${s.id}:${livePrices[s.pair] != null ? Number(livePrices[s.pair]).toFixed(8) : "na"}`)
        .sort()
        .join("|"),
    [activeLiveSignals, livePrices]
  );

  useEffect(() => {
    if (!enabled || signalIds.length === 0) return;
    if (!priceFingerprint || priceFingerprint === lastFingerprintRef.current) return;
    if (!activeLiveSignals.some((s) => livePrices[s.pair] != null)) return;
    if (inFlightRef.current) return;

    lastFingerprintRef.current = priceFingerprint;
    inFlightRef.current = true;

    void (async () => {
      try {
        const { data: limitData, error: limitError } = await supabase.rpc(
          "process_live_limit_tp_updates" as any,
          { _signal_ids: signalIds }
        );
        if (limitError) {
          console.warn("[LiveAutoTriggers] Failed to process live limit TP updates:", limitError.message);
        }
        const appliedLimitRows = ((limitData || []) as ProcessedLimitUpdateRow[]).filter(
          (r) => r.triggered && Number(r.applied_count || 0) > 0
        );

        const { data, error } = await supabase.rpc(
          "process_live_signal_auto_triggers" as any,
          { _signal_ids: signalIds }
        );
        if (error) {
          console.warn("[LiveAutoTriggers] Failed to process auto triggers:", error.message);
          return;
        }

        const rows = ((data || []) as ProcessedRow[]).filter((r) => r.closed_now);
        if (rows.length === 0 && appliedLimitRows.length === 0) return;

        if (enableTelegram) {
          for (const row of rows) {
            const signal = activeLiveSignals.find((s) => s.id === row.signal_id);
            if (!signal || !signal.send_closed_trades_to_telegram) continue;

            const closePrice =
              row.close_price != null && Number.isFinite(Number(row.close_price))
                ? Number(row.close_price)
                : null;
            const rr =
              closePrice != null
                ? calculateSignedSignalRrForTarget(signal, closePrice)
                : null;

            const telegramResult = await sendTelegramTradeClosed({
              signal: {
                pair: signal.pair,
                category: signal.category,
                direction: signal.direction,
                entry_price: signal.entry_price,
                stop_loss: signal.stop_loss,
                take_profit: signal.take_profit,
                status: row.resolved_status,
                close_price: closePrice,
                close_quoted_at: row.close_quoted_at,
                rr_multiple: rr,
              },
            });

            if (telegramResult.ok === false) {
              console.warn(
                "[LiveAutoTriggers] Telegram close failed:",
                getSafeErrorMessage(telegramResult.error, "Unknown telegram failure")
              );
            }
          }
        }

        onSignalsClosed?.();
      } catch (err) {
        console.warn("[LiveAutoTriggers] Unexpected error:", err);
      } finally {
        inFlightRef.current = false;
      }
    })();
  }, [enabled, enableTelegram, signalIds, priceFingerprint, activeLiveSignals, livePrices, onSignalsClosed]);
};
