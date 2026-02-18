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
const CACHE_TTL_MS = 15_000;

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

    const results: Record<string, { price: number; quoted_at: string }> = {};
    const nowMs = Date.now();
    const { data: cachedRows } = await supabase
      .from("market_quotes")
      .select("symbol, price, quoted_at")
      .eq("provider", QUOTE_PROVIDER)
      .in("symbol", toFetch);
    const cachedBySymbol = new Map<string, { price: number; quoted_at: string }>();
    for (const row of (cachedRows ?? []) as Array<{ symbol: string; price: number | string; quoted_at: string }>) {
      const cachedPrice = Number(row.price);
      if (!Number.isFinite(cachedPrice)) continue;
      cachedBySymbol.set(row.symbol, { price: cachedPrice, quoted_at: row.quoted_at });
    }

    const symbolsToRefresh: string[] = [];
    for (const sym of toFetch) {
      const cached = cachedBySymbol.get(sym);
      const cachedQuotedAt = cached ? new Date(cached.quoted_at).getTime() : NaN;
      const hasFreshCached =
        !!cached &&
        Number.isFinite(cachedQuotedAt) &&
        nowMs - cachedQuotedAt <= CACHE_TTL_MS;
      if (hasFreshCached) {
        results[sym] = cached;
      } else {
        symbolsToRefresh.push(sym);
      }
    }

    if (symbolsToRefresh.length > 0) {
      let fetchedQuotes: Array<{ symbol: string; price: number; quoted_at: string }> = [];
      try {
        fetchedQuotes = await Promise.all(
          symbolsToRefresh.map(async (sym) => {
            const { price, error } = await fetchQuoteFromTwelveData(sym, apiKey);
            if (error) {
              const fallback = cachedBySymbol.get(sym);
              if (fallback) return { symbol: sym, ...fallback };
              throw new Error(`${error} (${sym})`);
            }
            return {
              symbol: sym,
              price,
              quoted_at: new Date().toISOString(),
            };
          })
        );
      } catch (fetchErr) {
        return new Response(
          JSON.stringify({ error: String(fetchErr) }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      await supabase
        .from("market_quotes")
        .upsert(
          fetchedQuotes.map((q) => ({
            symbol: q.symbol,
            price: q.price,
            provider: QUOTE_PROVIDER,
            quoted_at: q.quoted_at,
          })),
          { onConflict: "symbol,provider" }
        );

      for (const quote of fetchedQuotes) {
        results[quote.symbol] = { price: quote.price, quoted_at: quote.quoted_at };
      }
    }

    if (!symbols?.length && (symbol || twelve_data_symbol)) {
      return new Response(
        JSON.stringify({
          price: results[toFetch[0]].price,
          quoted_at: results[toFetch[0]].quoted_at,
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
