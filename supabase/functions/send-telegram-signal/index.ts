import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

interface SignalData {
  pair: string;
  category: string;
  direction: "BUY" | "SELL";
  entry_price?: number | null;
  stop_loss?: number | null;
  take_profit?: number | null;
  analysis_notes?: string | null;
  analysis_video_url?: string | null;
  analysis_image_url?: string | null;
  signal_type: "signal" | "upcoming";
  upcoming_status?: string | null;
}

interface TelegramRequest {
  signal: SignalData;
  action: "created" | "activated"; // 'created' for new signals, 'activated' for upcoming->active
}

// Escape special Markdown characters to prevent parsing errors
const escapeMarkdown = (text: string): string => {
  if (!text) return "";
  // Escape special Markdown characters: _ * [ ] ( ) ~ ` > # + - = | { } . !
  return text
    .replace(/\\/g, "\\\\")
    .replace(/_/g, "\\_")
    .replace(/\*/g, "\\*")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/~/g, "\\~")
    .replace(/`/g, "\\`")
    .replace(/>/g, "\\>")
    .replace(/#/g, "\\#")
    .replace(/\+/g, "\\+")
    .replace(/=/g, "\\=")
    .replace(/\|/g, "\\|")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}")
    .replace(/\./g, "\\.")
    .replace(/!/g, "\\!");
};

const formatSignalMessage = (signal: SignalData, action: string): string => {
  const isUpcoming = signal.signal_type === "upcoming";
  const directionEmoji = signal.direction === "BUY" ? "🟢" : "🔴";
  const actionTitle = action === "activated"
    ? "🚀 SIGNAL ACTIVATED"
    : isUpcoming
      ? "⏳ NEW UPCOMING TRADE"
      : "📊 NEW TRADING SIGNAL";

  // Escape user-provided content
  const safePair = escapeMarkdown(signal.pair);
  const safeCategory = escapeMarkdown(signal.category);

  let message = `${actionTitle}

${directionEmoji} *${signal.direction}* ${safePair}
📁 Category: ${safeCategory}`;

  if (signal.entry_price) {
    message += `\n🎯 Entry: ${signal.entry_price}`;
  }
  if (signal.stop_loss) {
    message += `\n🛑 Stop Loss: ${signal.stop_loss}`;
  }
  if (signal.take_profit) {
    message += `\n✅ Take Profit: ${signal.take_profit}`;
  }

  if (isUpcoming && signal.upcoming_status) {
    const statusLabels: Record<string, string> = {
      waiting: "⏳ Waiting",
      preparing: "🔄 Preparing",
      near_entry: "🎯 Near Entry",
    };
    message += `\n\n📌 Status: ${statusLabels[signal.upcoming_status] || signal.upcoming_status}`;
  }

  if (signal.analysis_notes) {
    const safeNotes = escapeMarkdown(signal.analysis_notes);
    message += `\n\n📝 Analysis:\n${safeNotes}`;
  }

  if (signal.analysis_video_url) {
    message += `\n\n🎥 Video: ${signal.analysis_video_url}`;
  }

  if (signal.analysis_image_url) {
    message += `\n\n🖼️ Image: ${signal.analysis_image_url}`;
  }

  message += "\n\nTrade responsibly! 💹";

  return message;
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("[Edge] send-telegram-signal called");

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Supabase configuration missing");
    }

    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      console.error("[Edge] No authorization header found");
      return new Response(
        JSON.stringify({ success: false, error: "No authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[Edge] Auth header found, creating client...");

    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    });

    // Get the authenticated user from the JWT
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();

    if (userError || !user) {
      console.error("[Edge] User verification failed:", userError);
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[Edge] User verified successfully:", user.id, "email:", user.email);

    const { signal, action }: TelegramRequest = await req.json();

    if (!signal) {
      throw new Error("Missing signal data");
    }

    console.log("[Edge] Signal data:", signal, "Action:", action);

    const { data: telegramSettings, error: settingsError } = await supabaseClient
      .from("provider_telegram_settings")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_enabled", true)
      .maybeSingle();

    if (settingsError) {
      console.error("[Edge] Error fetching Telegram settings:", settingsError);
      throw new Error("Failed to fetch Telegram settings");
    }

    if (!telegramSettings) {
      console.log("[Edge] No Telegram settings found or disabled");
      return new Response(
        JSON.stringify({ success: true, message: "Telegram not configured or disabled" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { bot_token, chat_id } = telegramSettings;

    const message = formatSignalMessage(signal, action);

    console.log("[Edge] Sending message to Telegram. Chat ID:", chat_id, "Message preview:", message.substring(0, 100));

    const telegramApiUrl = `https://api.telegram.org/bot${bot_token}/sendMessage`;

    const telegramResponse = await fetch(telegramApiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chat_id,
        text: message,
        parse_mode: "Markdown",
      }),
    });

    const telegramResult = await telegramResponse.json();

    if (!telegramResponse.ok) {
      console.error("[Edge] Telegram API error:", telegramResult);
      throw new Error(`Telegram API error: ${telegramResult.description || "Unknown error"}`);
    }

    console.log("[Edge] Telegram message sent successfully");

    return new Response(
      JSON.stringify({ success: true, message: "Signal sent to Telegram" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("[Edge] Error in send-telegram-signal:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    // Return 401 for auth errors, 500 for others
    const statusCode = errorMessage.includes("Unauthorized") || errorMessage.includes("authorization") ? 401 : 500;

    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: statusCode, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
