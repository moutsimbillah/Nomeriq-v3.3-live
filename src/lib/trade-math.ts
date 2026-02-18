type TradeMathSignal = {
  entry_price?: number | null;
  stop_loss?: number | null;
  risk_reference_sl?: number | null;
  take_profit?: number | null;
  direction?: string | null;
};

type TradeMathInput = {
  signal?: TradeMathSignal | null;
};

type TradePnlInput = TradeMathInput & {
  result?: string | null;
  pnl?: number | null;
  risk_amount?: number | null;
};

type TradePotentialInput = TradeMathInput & {
  risk_amount?: number | null;
};

export const calculateSignalRrForTarget = (
  signal: TradeMathSignal | null | undefined,
  targetTp: number | null | undefined,
): number =>
  Math.abs(calculateSignedSignalRrForTarget(signal, targetTp));

export const calculateSignedSignalRrForTarget = (
  signal: TradeMathSignal | null | undefined,
  targetTp: number | null | undefined,
): number => {
  const EPSILON = 1e-9;
  const entry = Number(signal?.entry_price || 0);
  const stopLoss = Number(signal?.stop_loss);
  const referenceStopLoss = Number(signal?.risk_reference_sl);
  const resolvedTargetTp = Number(targetTp ?? signal?.take_profit ?? 0);
  const direction = signal?.direction;

  const hasUsableStop =
    Number.isFinite(stopLoss) && Number.isFinite(entry) && Math.abs(entry - stopLoss) > EPSILON;
  const hasUsableReferenceStop =
    Number.isFinite(referenceStopLoss) &&
    Number.isFinite(entry) &&
    Math.abs(entry - referenceStopLoss) > EPSILON;

  let pricingStop = stopLoss;
  if (!hasUsableStop && hasUsableReferenceStop) {
    pricingStop = referenceStopLoss;
  }

  // Break-even fallback:
  // when no usable SL distance exists, synthesize a 1R distance from Entry->TP
  // so RR/live-PnL remain meaningful instead of collapsing to zero.
  const fallbackAnchorTp = Number(signal?.take_profit);
  const fallbackDistanceSource =
    Number.isFinite(fallbackAnchorTp) && Math.abs(fallbackAnchorTp - entry) > EPSILON
      ? fallbackAnchorTp
      : resolvedTargetTp;
  if (
    (!Number.isFinite(pricingStop) || Math.abs(entry - pricingStop) <= EPSILON) &&
    Number.isFinite(entry) &&
    Number.isFinite(fallbackDistanceSource) &&
    Math.abs(fallbackDistanceSource - entry) > EPSILON
  ) {
    const oneRDistance = Math.abs(fallbackDistanceSource - entry);
    pricingStop = direction === "SELL" ? entry + oneRDistance : entry - oneRDistance;
  }

  if (direction === "BUY" && entry - pricingStop !== 0) {
    return (resolvedTargetTp - entry) / (entry - pricingStop);
  }
  if (direction === "SELL" && pricingStop - entry !== 0) {
    return (entry - resolvedTargetTp) / (pricingStop - entry);
  }
  return 0;
};

export const calculateSignalRr = (trade: TradeMathInput): number =>
  calculateSignalRrForTarget(trade.signal, trade.signal?.take_profit);

export const calculateDisplayedPotentialProfit = (
  trade: TradePnlInput,
): number => {
  const isClosed =
    trade.result === "win" ||
    trade.result === "loss" ||
    trade.result === "breakeven";

  if (isClosed) {
    // For closed trades we display realized upside instead of stale theoretical target.
    return Math.max(0, Number(trade.pnl || 0));
  }

  return Number(trade.risk_amount || 0) * calculateSignalRr(trade);
};

// Canonical "opening potential": based on opening trade risk and opening TP R:R.
// Use this for history tables so Potential Profit remains comparable to original setup.
export const calculateOpeningPotentialProfit = (
  trade: TradePotentialInput,
): number => Number(trade.risk_amount || 0) * calculateSignalRr(trade);
