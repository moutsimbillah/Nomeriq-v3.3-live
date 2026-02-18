import { supabase } from "@/integrations/supabase/client";
import { fetchLiveQuote, pairToTwelveDataSymbol } from "@/lib/market-api";
import type { Signal } from "@/types/database";
import { calculateSignedSignalRrForTarget } from "@/lib/trade-math";

export type LiveCloseStatus = "tp_hit" | "sl_hit" | "breakeven";

const EPSILON = 1e-9;

export function deriveLiveCloseOutcome(
  signal: Pick<Signal, "direction" | "entry_price" | "stop_loss" | "take_profit" | "risk_reference_sl">,
  closePrice: number
): { status: LiveCloseStatus; rr: number } {
  if (!Number.isFinite(Number(closePrice))) {
    return { status: "breakeven", rr: 0 };
  }

  const rr = calculateSignedSignalRrForTarget(signal, closePrice);

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
    "entry_quote_id" | "pair" | "category" | "direction" | "entry_price" | "stop_loss" | "take_profit" | "risk_reference_sl"
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
