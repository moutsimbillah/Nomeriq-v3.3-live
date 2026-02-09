import { supabase } from "@/integrations/supabase/client";

export type TelegramSignalAction = "created" | "activated";

export interface TelegramSignalPayload {
  pair: string;
  category: string;
  direction: string;
  entry_price: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  analysis_notes: string | null;
  analysis_video_url: string | null;
  analysis_image_url: string | null;
  signal_type: string;
  upcoming_status: string | null;
}

export async function sendTelegramSignal(params: {
  signal: TelegramSignalPayload;
  action: TelegramSignalAction;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    console.log("[Telegram] Starting send with params:", params);

    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError) {
      console.error("[Telegram] Session error:", sessionError);
      return { ok: false, error: sessionError.message };
    }

    if (!session) {
      console.error("[Telegram] No session found");
      return { ok: false, error: "Not authenticated" };
    }

    console.log("[Telegram] Session found, fetching global Telegram settings...");

    // Fetch global Telegram settings (shared by all users)
    const { data: settings, error: settingsError } = await supabase
      .from("global_telegram_settings")
      .select("*")
      .eq("is_enabled", true)
      .maybeSingle();

    if (settingsError) {
      console.error("[Telegram] Error fetching settings:", settingsError);
      return { ok: false, error: "Failed to fetch Telegram settings" };
    }

    if (!settings) {
      console.log("[Telegram] No global Telegram settings found or disabled");
      return { ok: true }; // Not an error, just not configured
    }

    console.log("[Telegram] Settings found, sending message to Telegram API...");

    // Format the message
    const message = formatSignalMessage(params.signal, params.action);

    // Type assertion for settings (until types are regenerated)
    const telegramSettings = settings as { bot_token: string; chat_id: string };

    // Call Telegram API directly
    const telegramApiUrl = `https://api.telegram.org/bot${telegramSettings.bot_token}/sendMessage`;

    const response = await fetch(telegramApiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: telegramSettings.chat_id,
        text: message,
        parse_mode: "Markdown",
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error("[Telegram] API error:", result);
      return { ok: false, error: result.description || "Failed to send to Telegram" };
    }

    console.log("[Telegram] Success! Message sent to Telegram");
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[Telegram] Exception:", msg, err);
    return { ok: false, error: msg };
  }
}

// Helper function to format signal message
function formatSignalMessage(signal: TelegramSignalPayload, action: TelegramSignalAction): string {
  const isUpcoming = signal.signal_type === "upcoming";
  const directionEmoji = signal.direction === "BUY" ? "🟢" : "🔴";
  const actionTitle = action === "activated"
    ? "🚀 SIGNAL ACTIVATED"
    : isUpcoming
      ? "⏳ NEW UPCOMING TRADE"
      : "📊 NEW TRADING SIGNAL";

  let message = `${actionTitle}\n\n${directionEmoji} *${signal.direction}* ${signal.pair}\n📁 Category: ${signal.category}`;

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
    message += `\n\n📝 Analysis:\n${signal.analysis_notes}`;
  }

  if (signal.analysis_video_url) {
    message += `\n\n🎥 Video: ${signal.analysis_video_url}`;
  }

  if (signal.analysis_image_url) {
    message += `\n\n🖼️ Image: ${signal.analysis_image_url}`;
  }

  message += "\n\nTrade responsibly! 💹";

  return message;
}
