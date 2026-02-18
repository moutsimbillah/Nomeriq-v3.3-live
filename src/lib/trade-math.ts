type TradeMathSignal = {
  entry_price?: number | null;
  stop_loss?: number | null;
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
  const entry = Number(signal?.entry_price || 0);
  const stopLoss = Number(signal?.stop_loss || 0);
  const resolvedTargetTp = Number(targetTp ?? signal?.take_profit ?? 0);
  const direction = signal?.direction;

  if (direction === "BUY" && entry - stopLoss !== 0) {
    return (resolvedTargetTp - entry) / (entry - stopLoss);
  }
  if (direction === "SELL" && stopLoss - entry !== 0) {
    return (entry - resolvedTargetTp) / (stopLoss - entry);
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
