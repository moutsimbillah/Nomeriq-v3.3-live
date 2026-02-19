import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};
const QUOTE_PROVIDER = "twelve_data";
const CACHE_TTL_MS = 1_000;
const FETCH_CHUNK_SIZE = 8;
const REFRESH_LOCK_RETRY_DELAY_MS = 120;
const REFRESH_LOCK_RETRY_ATTEMPTS = 4;

type CachedQuote = {
  price: number;
  quoted_at: string;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isFreshQuote = (quote: CachedQuote | undefined, nowMs: number): boolean => {
  if (!quote) return false;
  const quotedMs = Date.parse(quote.quoted_at);
  if (!Number.isFinite(quotedMs)) return false;
  return nowMs - quotedMs <= CACHE_TTL_MS;
};

async function loadCachedQuotes(
  supabase: ReturnType<typeof createClient>,
  symbols: string[],
): Promise<Map<string, CachedQuote>> {
  const out = new Map<string, CachedQuote>();
  if (!symbols.length) return out;

  const { data, error } = await supabase
    .from("market_quotes")
    .select("symbol, price, quoted_at")
    .eq("provider", QUOTE_PROVIDER)
    .in("symbol", symbols);

  if (error) {
    console.error("[twelve-data-quote] Failed to read cached quotes:", error);
    return out;
  }

  for (const row of (data ?? []) as Array<{ symbol: string; price: number | string; quoted_at: string }>) {
    const price = Number(row.price);
    if (!Number.isFinite(price)) continue;
    out.set(row.symbol, { price, quoted_at: row.quoted_at });
  }

  return out;
}

async function fetchQuotesFromTwelveData(
  symbols: string[],
  apiKey: string,
): Promise<Map<string, { price?: number; error?: string }>> {
  const out = new Map<string, { price?: number; error?: string }>();
  if (!symbols.length) return out;

  for (let i = 0; i < symbols.length; i += FETCH_CHUNK_SIZE) {
    const chunk = symbols.slice(i, i + FETCH_CHUNK_SIZE);
    const url = `https://api.twelvedata.com/price?symbol=${encodeURIComponent(chunk.join(","))}&apikey=${apiKey}`;

    let data: unknown = null;
    try {
      const res = await fetch(url);
      data = await res.json();
      if (!res.ok) {
        const msg = `HTTP ${res.status}`;
        for (const sym of chunk) {
          out.set(sym, { error: msg });
        }
        continue;
      }
    } catch (err) {
      const msg = String(err);
      for (const sym of chunk) {
        out.set(sym, { error: msg });
      }
      continue;
    }

    if (!data || typeof data !== "object") {
      for (const sym of chunk) {
        out.set(sym, { error: "Invalid response from quote provider" });
      }
      continue;
    }

    const payload = data as Record<string, unknown>;
    const rootStatus = payload.status;
    if (rootStatus === "error") {
      const msg = String(payload.message || "Twelve Data API error");
      for (const sym of chunk) {
        out.set(sym, { error: msg });
      }
      continue;
    }

    for (const sym of chunk) {
      const exact = payload[sym];
      const normalizedKey = Object.keys(payload).find((k) => k.toUpperCase() === sym.toUpperCase());
      const alt = normalizedKey ? payload[normalizedKey] : undefined;
      const rawNode = exact ?? alt;

      let rawPrice: unknown = null;
      let errorMsg: string | null = null;

      if (rawNode && typeof rawNode === "object") {
        const node = rawNode as Record<string, unknown>;
        if (node.status === "error") {
          errorMsg = String(node.message || "Twelve Data API error");
        } else {
          rawPrice = node.price;
        }
      } else if (
        chunk.length === 1 &&
        Object.prototype.hasOwnProperty.call(payload, "price")
      ) {
        rawPrice = payload.price;
      }

      const price = Number(rawPrice);
      if (!errorMsg && Number.isFinite(price)) {
        out.set(sym, { price });
      } else {
        out.set(sym, { error: errorMsg || "Invalid price" });
      }
    }
  }

  return out;
}

async function tryAcquireRefreshLock(
  supabase: ReturnType<typeof createClient>,
): Promise<boolean> {
  const { data, error } = await supabase.rpc("try_acquire_market_quote_refresh_lock");
  if (error) {
    console.error("[twelve-data-quote] Failed to acquire refresh lock:", error);
    return false;
  }
  return Boolean(data);
}

async function releaseRefreshLock(
  supabase: ReturnType<typeof createClient>,
): Promise<void> {
  const { error } = await supabase.rpc("release_market_quote_refresh_lock");
  if (error) {
    console.error("[twelve-data-quote] Failed to release refresh lock:", error);
  }
}

async function fetchQuoteFromTwelveData(
  symbol: string,
  apiKey: string
): Promise<{ price: number; error?: string }> {
  const url = `https://api.twelvedata.com/price?symbol=${encodeURIComponent(symbol)}&apikey=${apiKey}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.status === "error" || data.code === 401) {
    return { price: 0, error: data.message || "Twelve Data API error" };
  }
  const price = parseFloat(data.price);
  return Number.isFinite(price) ? { price } : { price: 0, error: "Invalid price" };
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { 
      status: 200,
      headers: corsHeaders 
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    const { symbol, symbols, twelve_data_symbol } = body as {
      symbol?: string;
      symbols?: string[];
      twelve_data_symbol?: string;
    };

    const { data: settings } = await supabase
      .from("market_mode_settings")
      .select("twelve_data_api_key")
      .limit(1)
      .single();

    const apiKey = settings?.twelve_data_api_key;
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "Twelve Data API key not configured" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const requestedSymbols = symbols?.length
      ? symbols
      : [twelve_data_symbol || symbol].filter(Boolean);
    const toFetch = [...new Set(requestedSymbols.map((s) => String(s).trim()).filter(Boolean))].sort();
    if (!toFetch.length) {
      return new Response(
        JSON.stringify({ error: "symbol or symbols required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let cachedBySymbol = await loadCachedQuotes(supabase, toFetch);
    let nowMs = Date.now();
    let staleSymbols = toFetch.filter((sym) => !isFreshQuote(cachedBySymbol.get(sym), nowMs));

    if (staleSymbols.length > 0) {
      let lockAcquired = false;
      try {
        lockAcquired = await tryAcquireRefreshLock(supabase);

        if (lockAcquired) {
          cachedBySymbol = await loadCachedQuotes(supabase, toFetch);
          nowMs = Date.now();
          staleSymbols = toFetch.filter((sym) => !isFreshQuote(cachedBySymbol.get(sym), nowMs));

          if (staleSymbols.length > 0) {
            const fetchedBySymbol = await fetchQuotesFromTwelveData(staleSymbols, apiKey);
            const quotedAt = new Date().toISOString();

            const upsertRows = staleSymbols
              .map((sym) => {
                const fetched = fetchedBySymbol.get(sym);
                if (!fetched || !Number.isFinite(Number(fetched.price))) return null;
                return {
                  symbol: sym,
                  price: Number(fetched.price),
                  provider: QUOTE_PROVIDER,
                  quoted_at: quotedAt,
                };
              })
              .filter(Boolean) as Array<{ symbol: string; price: number; provider: string; quoted_at: string }>;

            if (upsertRows.length > 0) {
              const { error: upsertErr } = await supabase
                .from("market_quotes")
                .upsert(upsertRows, { onConflict: "symbol,provider" });
              if (upsertErr) {
                console.error("[twelve-data-quote] Failed to upsert fresh quotes:", upsertErr);
              }
            }
          }
        } else {
          for (let retry = 0; retry < REFRESH_LOCK_RETRY_ATTEMPTS; retry += 1) {
            await sleep(REFRESH_LOCK_RETRY_DELAY_MS);
            cachedBySymbol = await loadCachedQuotes(supabase, toFetch);
            nowMs = Date.now();
            staleSymbols = toFetch.filter((sym) => !isFreshQuote(cachedBySymbol.get(sym), nowMs));
            if (!staleSymbols.length) break;
          }
        }
      } finally {
        if (lockAcquired) {
          await releaseRefreshLock(supabase);
        }
      }
    }

    cachedBySymbol = await loadCachedQuotes(supabase, toFetch);
    const results: Record<string, { price: number; quoted_at: string }> = {};
    for (const sym of toFetch) {
      const cached = cachedBySymbol.get(sym);
      if (!cached) continue;
      results[sym] = {
        price: cached.price,
        quoted_at: cached.quoted_at,
      };
    }

    if (!symbols?.length && (symbol || twelve_data_symbol)) {
      const first = results[toFetch[0]];
      if (!first) {
        return new Response(
          JSON.stringify({ error: "Quote unavailable for requested symbol" }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({
          price: first.price,
          quoted_at: first.quoted_at,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    return new Response(
      JSON.stringify({ quotes: results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
