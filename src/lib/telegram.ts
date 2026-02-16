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

export type TelegramDeliveryResult =
  | {
      ok: true;
      status: "sent";
      attemptedCount: number;
      deliveredCount: number;
    }
  | {
      ok: true;
      status: "skipped";
      reason: "not_configured" | "no_matching_category";
      message: string;
    }
  | {
      ok: false;
      status: "failed";
      error: string;
      attemptedCount: number;
      deliveredCount: number;
      failedCount: number;
    };

export function getTelegramDeliveryFeedback(
  result: TelegramDeliveryResult,
  targetLabel = "Telegram notification"
): { level: "success" | "warning" | "error"; message: string } {
  if (result.ok && result.status === "sent") {
    const destinationLabel = result.deliveredCount === 1 ? "destination" : "destinations";
    return {
      level: "success",
      message: `${targetLabel} sent successfully to ${result.deliveredCount} ${destinationLabel}.`,
    };
  }

  if (result.ok && result.status === "skipped") {
    return {
      level: "warning",
      message: `${targetLabel} not sent: ${result.message}`,
    };
  }

  if (result.deliveredCount > 0) {
    return {
      level: "warning",
      message: `${targetLabel} partially sent (${result.deliveredCount}/${result.attemptedCount}). ${result.error}`,
    };
  }

  return {
    level: "error",
    message: `${targetLabel} failed: ${result.error}`,
  };
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
): Promise<TelegramDeliveryResult> {
  try {
    const { data, error: integrationsError } = await supabase
      .from("telegram_integrations")
      .select("*")
      .eq("is_enabled", true);

    if (integrationsError) {
      return {
        ok: false,
        status: "failed",
        error: "Failed to fetch Telegram integrations",
        attemptedCount: 0,
        deliveredCount: 0,
        failedCount: 0,
      };
    }

    const allIntegrations = (data || []) as TelegramIntegration[];
    if (allIntegrations.length === 0) {
      return {
        ok: true,
        status: "skipped",
        reason: "not_configured",
        message: "No enabled Telegram integration is configured.",
      };
    }

    const matchingIntegrations = allIntegrations.filter((integration) => {
      const cats = integration.categories ?? [];
      if (cats.length === 0) return true;
      return (cats as string[]).includes(category);
    });

    if (matchingIntegrations.length === 0) {
      return {
        ok: true,
        status: "skipped",
        reason: "no_matching_category",
        message: `No enabled Telegram integration is linked to category "${category}".`,
      };
    }

    const results = await Promise.all(
      matchingIntegrations.map(async (integration) => {
        const telegramApiUrl = `https://api.telegram.org/bot${integration.bot_token}/sendMessage`;
        const finalMessage = applyIntegrationMessageConfig(
          message,
          integration,
          options
        );

        try {
          const response = await fetch(telegramApiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: integration.chat_id,
              text: finalMessage,
              parse_mode: "Markdown",
            }),
          });

          let result: Record<string, unknown> | null = null;
          try {
            result = (await response.json()) as Record<string, unknown>;
          } catch {
            // Telegram may return non-JSON payload for upstream/proxy failures.
          }

          if (!response.ok) {
            return {
              ok: false as const,
              integrationName: integration.name || integration.chat_id || "Unnamed integration",
              error:
                (result?.description as string | undefined) ||
                `Telegram HTTP ${response.status}`,
            };
          }

          return { ok: true as const };
        } catch (err) {
          const message = err instanceof Error ? err.message : "Connection failed";
          return {
            ok: false as const,
            integrationName: integration.name || integration.chat_id || "Unnamed integration",
            error: message,
          };
        }
      })
    );

    const attemptedCount = matchingIntegrations.length;
    const deliveredCount = results.filter((r) => r.ok).length;
    const failed = results.filter((r) => !r.ok) as {
      ok: false;
      integrationName: string;
      error: string;
    }[];

    if (failed.length > 0) {
      const summary = failed
        .slice(0, 3)
        .map((f) => `${f.integrationName}: ${f.error}`)
        .join("; ");
      return {
        ok: false,
        status: "failed",
        error: summary || "Failed to send Telegram message.",
        attemptedCount,
        deliveredCount,
        failedCount: failed.length,
      };
    }

    return {
      ok: true,
      status: "sent",
      attemptedCount,
      deliveredCount,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return {
      ok: false,
      status: "failed",
      error: msg,
      attemptedCount: 0,
      deliveredCount: 0,
      failedCount: 0,
    };
  }
}

export async function sendTelegramSignal(params: {
  signal: TelegramSignalPayload;
  action: TelegramSignalAction;
}): Promise<TelegramDeliveryResult> {
  const message = formatSignalMessage(params.signal, params.action);
  return sendTelegramMessageToCategory(params.signal.category, message, {
    overrideHeader: true,
  });
}

export async function sendTelegramTradeUpdate(params: {
  signal: TelegramTradeUpdatePayload;
}): Promise<TelegramDeliveryResult> {
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
}): Promise<TelegramDeliveryResult> {
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
