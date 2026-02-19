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

const QUOTE_PROVIDER = "twelve_data";
const LIVE_QUOTE_MAX_AGE_MS = 5_000;

const isFreshQuotedAt = (quotedAt: string | null | undefined, maxAgeMs = LIVE_QUOTE_MAX_AGE_MS): boolean => {
  if (!quotedAt) return false;
  const ts = Date.parse(quotedAt);
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts <= maxAgeMs;
};

export interface BatchLiveQuote {
  price: number;
  quoted_at: string;
}

async function readCachedQuotes(symbols: string[]): Promise<Record<string, BatchLiveQuote>> {
  if (symbols.length === 0) return {};
  const uniqueSymbols = [...new Set(symbols.filter(Boolean))];
  const { data, error } = await supabase
    .from("market_quotes")
    .select("symbol, price, quoted_at")
    .eq("provider", QUOTE_PROVIDER)
    .in("symbol", uniqueSymbols);
  if (error || !data) return {};

  const out: Record<string, BatchLiveQuote> = {};
  for (const row of data as Array<{ symbol: string; price: number | string; quoted_at: string }>) {
    const price = Number(row.price);
    if (!Number.isFinite(price)) continue;
    out[row.symbol] = {
      price,
      quoted_at: row.quoted_at,
    };
  }
  return out;
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
  const cached = await readCachedQuotes([twelveDataSymbol]);
  const cachedQuote = cached[twelveDataSymbol];
  if (cachedQuote && isFreshQuotedAt(cachedQuote.quoted_at)) {
    return cachedQuote;
  }

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

export async function fetchBatchQuotes(symbols: string[]): Promise<Record<string, BatchLiveQuote>> {
  if (symbols.length === 0) return {};
  const uniqueSymbols = [...new Set(symbols.filter(Boolean))];
  const cached = await readCachedQuotes(uniqueSymbols);
  const freshCount = uniqueSymbols.filter((symbol) => isFreshQuotedAt(cached[symbol]?.quoted_at)).length;
  if (freshCount === uniqueSymbols.length) {
    return cached;
  }

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
    body: JSON.stringify({ symbols: uniqueSymbols }),
  });
  if (!res.ok) {
    if (Object.keys(cached).length > 0) return cached;
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to fetch quotes");
  }
  const { quotes } = await res.json();
  const out: Record<string, BatchLiveQuote> = { ...cached };
  if (quotes) {
    for (const [sym, val] of Object.entries(quotes) as [string, { price: number; quoted_at?: string }][]) {
      const price = Number(val.price);
      if (!Number.isFinite(price)) continue;
      out[sym] = {
        price,
        quoted_at:
          typeof val.quoted_at === "string" && val.quoted_at.length > 0
            ? val.quoted_at
            : new Date().toISOString(),
      };
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
