import { supabase } from "@/integrations/supabase/client";

/** Derive Twelve Data style symbol from app pair (e.g. BTCUSD -> BTC/USD) */
export function pairToTwelveDataSymbol(pair: string): string {
  const p = pair.replace(/\s/g, "").toUpperCase();
  if (p.length >= 6) return p.slice(0, 3) + "/" + p.slice(3);
  return p;
}

export interface MarketPair {
  symbol: string;
  twelve_data_symbol: string;
  category: string;
  provider: string;
  is_active: boolean;
}

export async function searchMarketPairs(
  category: string | null,
  query: string | null,
  mode: "manual" | "live"
): Promise<MarketPair[]> {
  const { data, error } = await supabase.rpc("search_market_pairs", {
    _category: category || null,
    _query: query || null,
    _mode: mode,
  });
  if (error) return [];
  return (data ?? []) as MarketPair[];
}

export async function fetchLiveQuote(twelveDataSymbol: string): Promise<{
  price: number;
  quoted_at: string;
}> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) {
    throw new Error("Not authenticated. Please sign in again.");
  }
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/twelve-data-quote`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
    body: JSON.stringify({ twelve_data_symbol: twelveDataSymbol }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to fetch quote");
  }
  return res.json();
}

export async function fetchBatchQuotes(symbols: string[]): Promise<Record<string, number>> {
  if (symbols.length === 0) return {};
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) {
    throw new Error("Not authenticated. Please sign in again.");
  }
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/twelve-data-quote`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
    body: JSON.stringify({ symbols }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to fetch quotes");
  }
  const { quotes } = await res.json();
  const out: Record<string, number> = {};
  if (quotes) {
    for (const [sym, val] of Object.entries(quotes) as [string, { price: number }][]) {
      out[sym] = val.price;
    }
  }
  return out;
}

export interface CreateSignalLivePayload {
  pair: string;
  category: string;
  direction: "BUY" | "SELL";
  stop_loss: number;
  take_profit: number;
  signal_type: "signal" | "upcoming";
  upcoming_status?: string | null;
  notes?: string | null;
  analysis_video_url?: string | null;
  analysis_notes?: string | null;
  analysis_image_url?: string | null;
  send_updates_to_telegram?: boolean;
  send_closed_trades_to_telegram?: boolean;
  entry_price_client: number;
  entry_quoted_at_client: string;
  twelve_data_symbol: string;
}

export async function createSignalLive(payload: CreateSignalLivePayload): Promise<{ signal: { id: string } }> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) {
    throw new Error("Not authenticated. Please sign in again.");
  }
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-signal-live`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Failed to create signal");
  return data;
}
