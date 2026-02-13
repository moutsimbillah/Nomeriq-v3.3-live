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

const DEFAULT_FOOTER = "Trade responsibly!";

const formatDirection = (direction: string) => {
  const value = (direction || "").trim().toLowerCase();
  if (!value) return "-";
  return value.charAt(0).toUpperCase() + value.slice(1);
};

const buildCoreTradeLines = (params: {
  category: string;
  direction: string;
  pair: string;
  entry: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
}) => {
  return [
    `Category: ${params.category || "-"}`,
    `Direction: ${formatDirection(params.direction)}`,
    `Pair: ${params.pair || "-"}`,
    `Entry: ${params.entry ?? "-"}`,
    `Stop Loss: ${params.stopLoss ?? "-"}`,
    `Take Profit: ${params.takeProfit ?? "-"}`,
  ].join("\n");
};

const applyIntegrationMessageConfig = (
  baseMessage: string,
  integration: TelegramIntegration,
  options?: { overrideHeader?: boolean }
) => {
  let msg = baseMessage
    .split("\n")
    .filter((line) => !/Trade responsibly/i.test(line))
    .filter((line) => !/^\s*Risk:/i.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (options?.overrideHeader) {
    const customHeader = (integration.message_header || "").trim();
    if (customHeader) {
      const lines = msg.split("\n");
      const firstNonEmptyLine = lines.findIndex((line) => line.trim().length > 0);
      if (firstNonEmptyLine >= 0) {
        lines[firstNonEmptyLine] = customHeader;
      } else {
        lines.unshift(customHeader);
      }
      msg = lines.join("\n");
    }
  }

  const footer = (integration.message_footer || "").trim() || DEFAULT_FOOTER;
  return `${msg}\n\n${footer}`.trim();
};

async function sendTelegramMessageToCategory(
  category: string,
  message: string,
  options?: { overrideHeader?: boolean }
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
      return (cats as string[]).includes(category);
    });

    if (matchingIntegrations.length === 0) {
      return { ok: true };
    }

    const results = await Promise.all(
      matchingIntegrations.map(async (integration) => {
        const telegramApiUrl = `https://api.telegram.org/bot${integration.bot_token}/sendMessage`;
        const finalMessage = applyIntegrationMessageConfig(
          message,
          integration,
          options
        );

        const response = await fetch(telegramApiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: integration.chat_id,
            text: finalMessage,
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

    const failed = results.filter((r) => !r.ok) as {
      ok: false;
      error: string;
    }[];
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
  return sendTelegramMessageToCategory(params.signal.category, message, {
    overrideHeader: true,
  });
}

export async function sendTelegramTradeUpdate(params: {
  signal: TelegramTradeUpdatePayload;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { signal } = params;
  const noteLine = signal.note ? `\nNote: ${signal.note}` : "";
  const coreLines = buildCoreTradeLines({
    category: signal.category,
    direction: signal.direction,
    pair: signal.pair,
    entry: signal.entry_price,
    stopLoss: signal.stop_loss,
    takeProfit: signal.take_profit,
  });
  const message =
    `TRADE UPDATE\n\n` +
    `${coreLines}\n\n` +
    `${signal.tp_label}\n` +
    `Price: ${signal.tp_price}\n` +
    `Close: ${signal.close_percent}%` +
    `${noteLine}`;

  return sendTelegramMessageToCategory(signal.category, message);
}

export async function sendTelegramTradeClosed(params: {
  signal: TelegramTradeClosedPayload;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { signal } = params;
  const coreLines = buildCoreTradeLines({
    category: signal.category,
    direction: signal.direction,
    pair: signal.pair,
    entry: signal.entry_price,
    stopLoss: signal.stop_loss,
    takeProfit: signal.take_profit,
  });
  const statusLabel =
    signal.status === "tp_hit"
      ? "TP Hit"
      : signal.status === "sl_hit"
        ? "SL Hit"
        : "Breakeven";
  const message =
    `TRADE CLOSED\n\n` +
    `${coreLines}\n` +
    `Status: ${statusLabel}`;

  return sendTelegramMessageToCategory(signal.category, message);
}

function formatSignalMessage(
  signal: TelegramSignalPayload,
  action: TelegramSignalAction
): string {
  const isUpcoming = signal.signal_type === "upcoming";
  const actionTitle =
    action === "activated"
      ? "SIGNAL ACTIVATED"
      : isUpcoming
        ? "NEW UPCOMING TRADE"
        : "NEW TRADING SIGNAL";

  const coreLines = buildCoreTradeLines({
    category: signal.category,
    direction: signal.direction,
    pair: signal.pair,
    entry: signal.entry_price,
    stopLoss: signal.stop_loss,
    takeProfit: signal.take_profit,
  });

  let message = `${actionTitle}\n\n${coreLines}`;

  if (isUpcoming && signal.upcoming_status) {
    const statusLabels: Record<string, string> = {
      waiting: "Waiting",
      preparing: "Preparing",
      near_entry: "Near Entry",
    };
    message += `\n\nStatus: ${statusLabels[signal.upcoming_status] || signal.upcoming_status}`;
  }

  if (signal.analysis_notes) {
    message += `\n\nAnalysis:\n${signal.analysis_notes}`;
  }

  if (signal.analysis_video_url) {
    message += `\n\nVideo: ${signal.analysis_video_url}`;
  }

  if (signal.analysis_image_url) {
    message += `\n\nImage: ${signal.analysis_image_url}`;
  }

  return message;
}
