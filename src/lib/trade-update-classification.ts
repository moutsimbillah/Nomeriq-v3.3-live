export type TradeUpdateDisplayType = "limit" | "market";

interface ResolveTradeUpdateDisplayTypeInput {
  rawUpdateType?: "limit" | "market" | null;
  historyUpdateType?: "limit" | "market" | string | null;
}

export const resolveTradeUpdateDisplayType = (
  input: ResolveTradeUpdateDisplayTypeInput
): { type: TradeUpdateDisplayType; inferredFromHistory: boolean } => {
  // Canonical source is the TP update row itself.
  if (input.rawUpdateType === "market" || input.rawUpdateType === "limit") {
    return { type: input.rawUpdateType, inferredFromHistory: false };
  }

  const historyType = input.historyUpdateType === "market"
    ? "market"
    : input.historyUpdateType === "limit"
      ? "limit"
      : null;
  if (historyType) {
    return { type: historyType, inferredFromHistory: true };
  }

  return { type: "limit", inferredFromHistory: false };
};
