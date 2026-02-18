import { supabase } from "@/integrations/supabase/client";
import { fetchLiveQuote, pairToTwelveDataSymbol } from "@/lib/market-api";
import type { Signal } from "@/types/database";

export type LiveCloseStatus = "tp_hit" | "sl_hit" | "breakeven";

const EPSILON = 1e-9;

export function deriveLiveCloseOutcome(
  signal: Pick<Signal, "direction" | "entry_price" | "stop_loss">,
  closePrice: number
): { status: LiveCloseStatus; rr: number } {
  const entry = Number(signal.entry_price);
  const stop = Number(signal.stop_loss);

  if (!Number.isFinite(entry) || !Number.isFinite(stop) || !Number.isFinite(closePrice)) {
    return { status: "breakeven", rr: 0 };
  }

  const riskPerUnit =
    signal.direction === "BUY" ? entry - stop : stop - entry;

  if (!Number.isFinite(riskPerUnit) || Math.abs(riskPerUnit) < EPSILON) {
    const directionalDiff =
      signal.direction === "BUY" ? closePrice - entry : entry - closePrice;
    if (directionalDiff > EPSILON) return { status: "tp_hit", rr: 0 };
    if (directionalDiff < -EPSILON) return { status: "sl_hit", rr: 0 };
    return { status: "breakeven", rr: 0 };
  }

  const rr =
    signal.direction === "BUY"
      ? (closePrice - entry) / riskPerUnit
      : (entry - closePrice) / riskPerUnit;

  if (rr > EPSILON) return { status: "tp_hit", rr };
  if (rr < -EPSILON) return { status: "sl_hit", rr };
  return { status: "breakeven", rr: 0 };
}

export async function resolveLiveQuoteSymbol(
  signal: Pick<Signal, "entry_quote_id" | "pair" | "category">
): Promise<string> {
  if (signal.entry_quote_id) {
    const { data } = await supabase
      .from("market_quotes")
      .select("symbol")
      .eq("id", signal.entry_quote_id)
      .maybeSingle();
    if (data?.symbol) return data.symbol;
  }

  const { data } = await supabase
    .from("market_symbol_map")
    .select("twelve_data_symbol")
    .eq("symbol", signal.pair.toUpperCase())
    .eq("category", signal.category)
    .eq("is_active", true)
    .maybeSingle();
  if (data?.twelve_data_symbol) return data.twelve_data_symbol;

  return pairToTwelveDataSymbol(signal.pair);
}

export async function getLiveCloseSnapshot(
  signal: Pick<
    Signal,
    "entry_quote_id" | "pair" | "category" | "direction" | "entry_price" | "stop_loss"
  >
): Promise<{
  symbol: string;
  closePrice: number;
  closeQuotedAt: string;
  status: LiveCloseStatus;
  rr: number;
}> {
  const symbol = await resolveLiveQuoteSymbol(signal);
  const { price, quoted_at } = await fetchLiveQuote(symbol);
  const { status, rr } = deriveLiveCloseOutcome(signal, price);

  return {
    symbol,
    closePrice: price,
    closeQuotedAt: quoted_at,
    status,
    rr,
  };
}
