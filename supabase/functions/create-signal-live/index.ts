import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

const STALE_SECONDS = 30;

async function fetchQuote(symbol: string, apiKey: string): Promise<{ price: number }> {
  const url = `https://api.twelvedata.com/price?symbol=${encodeURIComponent(symbol)}&apikey=${apiKey}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.status === "error" || data.code === 401) throw new Error(data.message || "Quote failed");
  const price = parseFloat(data.price);
  if (!Number.isFinite(price)) throw new Error("Invalid price");
  return { price };
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

    // Get user from auth header if present (for created_by field)
    const authHeader = req.headers.get("authorization");
    let userId: string | null = null;
    if (authHeader) {
      try {
        const { data: { user } } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
        userId = user?.id || null;
      } catch {
        // ignore auth errors, continue without user
      }
    }

    const body = await req.json();
    const {
      pair,
      category,
      direction,
      stop_loss,
      take_profit,
      signal_type,
      upcoming_status,
      notes,
      analysis_video_url,
      analysis_notes,
      analysis_image_url,
      send_updates_to_telegram,
      send_closed_trades_to_telegram,
      entry_price_client,
      entry_quoted_at_client,
      twelve_data_symbol,
    } = body;

    const { data: settings } = await supabase
      .from("market_mode_settings")
      .select("twelve_data_api_key")
      .limit(1)
      .single();

    const apiKey = settings?.twelve_data_api_key;
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "Live mode: API key not configured" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const symbolForQuote = twelve_data_symbol || pair?.replace(/([A-Z]{3})([A-Z]{3})/, "$1/$2");
    const quotedAt = entry_quoted_at_client ? new Date(entry_quoted_at_client).getTime() : 0;
    const now = Date.now();
    const ageSeconds = (now - quotedAt) / 1000;
    let entryPrice = Number(entry_price_client);
    let quotedAtIso = entry_quoted_at_client;

    if (ageSeconds > STALE_SECONDS || !Number.isFinite(entryPrice)) {
      const { price } = await fetchQuote(symbolForQuote, apiKey);
      entryPrice = price;
      quotedAtIso = new Date().toISOString();
    }

    const { data: quoteRow, error: quoteErr } = await supabase
      .from("market_quotes")
      .upsert(
        { symbol: symbolForQuote, price: entryPrice, provider: "twelve_data", quoted_at: quotedAtIso },
        { onConflict: "symbol,provider" }
      )
      .select("id")
      .single();

    if (quoteErr) {
      return new Response(
        JSON.stringify({ error: "Failed to store quote" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const status = signal_type === "upcoming" ? "upcoming" : "active";
    const { data: signal, error: insertErr } = await supabase
      .from("signals")
      .insert({
        pair: (pair || "").toUpperCase(),
        category: category || "Crypto",
        direction: direction || "BUY",
        entry_price: entryPrice,
        stop_loss: stop_loss ?? 0,
        take_profit: take_profit ?? 0,
        status,
        signal_type: signal_type || "signal",
        upcoming_status: signal_type === "upcoming" ? upcoming_status : null,
        notes: notes || null,
        created_by: userId,
        analysis_video_url: analysis_video_url || null,
        analysis_notes: analysis_notes || null,
        analysis_image_url: analysis_image_url || null,
        send_updates_to_telegram: !!send_updates_to_telegram,
        send_closed_trades_to_telegram: !!send_closed_trades_to_telegram,
        market_mode: "live",
        entry_quote_id: quoteRow?.id ?? null,
        entry_quoted_at: quotedAtIso,
        entry_source: "twelve_data",
      })
      .select("id, pair, category, direction, entry_price, stop_loss, take_profit, signal_type, upcoming_status")
      .single();

    if (insertErr) {
      return new Response(
        JSON.stringify({ error: insertErr.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, signal }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
