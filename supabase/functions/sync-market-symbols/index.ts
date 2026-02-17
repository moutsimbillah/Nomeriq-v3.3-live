import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

const CATEGORY_MAP: Record<string, string> = {
  "forex": "Forex",
  "crypto": "Crypto",
  "indices": "Indices",
  "etf": "Commodities",
  "commodities": "Commodities",
};

function normalizeSymbol(symbol: string, type: string): string {
  const s = symbol.replace("/", "").replace("-", "").toUpperCase();
  if (type === "crypto" && !s.endsWith("USD")) return s + "USD";
  return s;
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
    // Use service role client; function is internal and will be called only from your app.
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const body = (await req.json().catch(() => ({}))) as { api_key?: string };
    const apiKey = body.api_key;

    const { data: row, error: rowError } = await supabase
      .from("market_mode_settings")
      .select("id, twelve_data_api_key")
      .limit(1)
      .maybeSingle();

    if (rowError && rowError.code !== "PGRST116") {
      return new Response(
        JSON.stringify({ error: "Failed to fetch settings" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const key = apiKey || row?.twelve_data_api_key;
    if (!key) {
      return new Response(
        JSON.stringify({ error: "API key required. Please configure your Twelve Data API key in Market Mode settings." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (row?.id) {
      await supabase
        .from("market_mode_settings")
        .update({ sync_status: "syncing", sync_error_message: null })
        .eq("id", row.id);
    }

    const all: { symbol: string; twelve_data_symbol: string; category: string }[] = [];

    // Fallback: common symbols so catalog is never empty
    const fallbackPairs: { symbol: string; twelve_data_symbol: string; category: string }[] = [
      { symbol: "EURUSD", twelve_data_symbol: "EUR/USD", category: "Forex" },
      { symbol: "GBPUSD", twelve_data_symbol: "GBP/USD", category: "Forex" },
      { symbol: "USDJPY", twelve_data_symbol: "USD/JPY", category: "Forex" },
      { symbol: "XAUUSD", twelve_data_symbol: "XAU/USD", category: "Metals" },
      { symbol: "XAGUSD", twelve_data_symbol: "XAG/USD", category: "Metals" },
      { symbol: "BTCUSD", twelve_data_symbol: "BTC/USD", category: "Crypto" },
      { symbol: "ETHUSD", twelve_data_symbol: "ETH/USD", category: "Crypto" },
    ];
    fallbackPairs.forEach((p) => all.push(p));

    const types = ["forex", "crypto"];
    for (const type of types) {
      try {
        const url = `https://api.twelvedata.com/stocks?exchange=CC&type=${type}&apikey=${key}`;
        const res = await fetch(url);
        const data = await res.json();
        if (data.status === "error" || data.code === 401) continue;
        const list = Array.isArray(data.data) ? data.data : data.data?.data ?? [];
        const category = CATEGORY_MAP[type] || "Commodities";
        for (const item of list) {
          const sym = item.symbol || item.code || item.name;
          if (!sym) continue;
          const twelve = sym.includes("/") ? sym : sym.length >= 6 ? sym.slice(0, 3) + "/" + sym.slice(3) : sym + "/USD";
          const norm = normalizeSymbol(sym, type);
          if (!all.some((x) => x.symbol === norm)) {
            all.push({ symbol: norm, twelve_data_symbol: twelve, category });
          }
        }
      } catch {
        // skip this type
      }
    }

    const metals = ["XAU/USD", "XAG/USD", "XPT/USD", "XPD/USD"];
    for (const m of metals) {
      all.push({
        symbol: m.replace("/", ""),
        twelve_data_symbol: m,
        category: "Metals",
      });
    }

    for (const { symbol, twelve_data_symbol, category } of all) {
      await supabase.from("market_symbol_map").upsert(
        {
          symbol,
          twelve_data_symbol,
          category,
          provider: "twelve_data",
          is_active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "symbol" }
      );
    }

    if (row?.id) {
      await supabase
        .from("market_mode_settings")
        .update({
          sync_status: "success",
          last_sync_at: new Date().toISOString(),
          sync_error_message: null,
        })
        .eq("id", row.id);
    }

    return new Response(
      JSON.stringify({ success: true, count: all.length }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("[sync-market-symbols] Error:", e);
    try {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );
      const { data: row } = await supabase
        .from("market_mode_settings")
        .select("id")
        .limit(1)
        .maybeSingle();
      if (row?.id) {
        await supabase
          .from("market_mode_settings")
          .update({ sync_status: "error", sync_error_message: String(e) })
          .eq("id", row.id);
      }
    } catch (updateError) {
      console.error("[sync-market-symbols] Failed to update error status:", updateError);
    }
    return new Response(
      JSON.stringify({ error: String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
