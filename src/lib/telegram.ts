import { supabase } from "@/integrations/supabase/client";
import { TelegramIntegration } from "@/types/database";

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

export interface TelegramTradeUpdatePayload {
  pair: string;
  category: string;
  direction: string;
  entry_price: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  tp_label: string;
  tp_price: number;
  close_percent: number;
  note?: string | null;
}

export interface TelegramTradeClosedPayload {
  pair: string;
  category: string;
  direction: string;
  entry_price: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  status: "tp_hit" | "sl_hit" | "breakeven";
}

async function sendTelegramMessageToCategory(
  category: string,
  message: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { data, error: integrationsError } = await supabase
      .from("telegram_integrations")
      .select("*")
      .eq("is_enabled", true);

    if (integrationsError) {
      return { ok: false, error: "Failed to fetch Telegram integrations" };
    }

    const allIntegrations = (data || []) as TelegramIntegration[];
    const matchingIntegrations = allIntegrations.filter((integration) => {
      const cats = integration.categories ?? [];
      if (cats.length === 0) return true;
      return cats.includes(category as any);
    });

    if (matchingIntegrations.length === 0) {
      return { ok: true };
    }

    const results = await Promise.all(
      matchingIntegrations.map(async (integration) => {
        const telegramApiUrl = `https://api.telegram.org/bot${integration.bot_token}/sendMessage`;

        const response = await fetch(telegramApiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: integration.chat_id,
            text: message,
            parse_mode: "Markdown",
          }),
        });

        const result = await response.json();

        if (!response.ok) {
          return {
            ok: false as const,
            error: result.description || "Failed to send to Telegram",
          };
        }

        return { ok: true as const };
      })
    );

    const failed = results.filter((r) => !r.ok) as { ok: false; error: string }[];
    if (failed.length > 0) {
      return {
        ok: false,
        error: failed.map((f) => f.error).join("; "),
      };
    }

    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return { ok: false, error: msg };
  }
}

export async function sendTelegramSignal(params: {
  signal: TelegramSignalPayload;
  action: TelegramSignalAction;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const message = formatSignalMessage(params.signal, params.action);
  return sendTelegramMessageToCategory(params.signal.category, message);
}

export async function sendTelegramTradeUpdate(params: {
  signal: TelegramTradeUpdatePayload;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { signal } = params;
  const directionEmoji = signal.direction === "BUY" ? "🟢" : "🔴";
  const noteLine = signal.note ? `\n📝 Note: ${signal.note}` : "";
  const message =
    `📈 TRADE UPDATE\n\n` +
    `${directionEmoji} *${signal.direction}* ${signal.pair}\n` +
    `📁 Category: ${signal.category}\n` +
    `🎯 Entry: ${signal.entry_price ?? "-"}\n` +
    `🛑 Stop Loss: ${signal.stop_loss ?? "-"}\n` +
    `✅ Take Profit: ${signal.take_profit ?? "-"}\n\n` +
    `🔔 ${signal.tp_label}\n` +
    `Price: ${signal.tp_price}\n` +
    `Close: ${signal.close_percent}%` +
    `${noteLine}\n\n` +
    `Trade responsibly! 💹`;

  return sendTelegramMessageToCategory(signal.category, message);
}

export async function sendTelegramTradeClosed(params: {
  signal: TelegramTradeClosedPayload;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { signal } = params;
  const directionEmoji = signal.direction === "BUY" ? "🟢" : "🔴";
  const statusLabel =
    signal.status === "tp_hit" ? "TP Hit ✅" : signal.status === "sl_hit" ? "SL Hit ❌" : "Breakeven ⚖️";
  const message =
    `🏁 TRADE CLOSED\n\n` +
    `${directionEmoji} *${signal.direction}* ${signal.pair}\n` +
    `📁 Category: ${signal.category}\n` +
    `Status: ${statusLabel}\n` +
    `🎯 Entry: ${signal.entry_price ?? "-"}\n` +
    `🛑 Stop Loss: ${signal.stop_loss ?? "-"}\n` +
    `✅ Take Profit: ${signal.take_profit ?? "-"}\n\n` +
    `Trade responsibly! 💹`;

  return sendTelegramMessageToCategory(signal.category, message);
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
