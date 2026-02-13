import { Signal, UserTrade } from "@/types/database";
import { calculateWinRatePercent } from "@/lib/kpi-math";

export interface ClosedTradeMetrics {
  totalClosedTrades: number;
  wins: number;
  losses: number;
  breakeven: number;
  winRate: number;
  totalPnL: number;
}

export interface OpenTradeMetrics {
  openCount: number;
  totalRisk: number;
  totalPotentialProfit: number;
  averageRiskPercent: number;
  unrealizedPnL: number;
}

export interface LiveSignalMetrics {
  liveSignalCount: number;
}

export interface UpcomingSignalMetrics {
  upcomingSignalCount: number;
}

export const isClosedTrade = (trade: Pick<UserTrade, "result">): boolean =>
  trade.result === "win" || trade.result === "loss" || trade.result === "breakeven";

export const isOpenTrade = (trade: Pick<UserTrade, "result">): boolean =>
  trade.result === "pending";

export const isLiveSignal = (signal: Pick<Signal, "signal_type" | "status">): boolean =>
  signal.signal_type === "signal" && signal.status === "active";

export const isUpcomingSignal = (signal: Pick<Signal, "signal_type" | "status">): boolean =>
  signal.signal_type === "upcoming" || signal.status === "upcoming";

export const computeClosedTradeMetrics = (
  trades: Array<Pick<UserTrade, "result" | "pnl">>,
): ClosedTradeMetrics => {
  const closedTrades = trades.filter(isClosedTrade);
  const wins = closedTrades.filter((t) => t.result === "win").length;
  const losses = closedTrades.filter((t) => t.result === "loss").length;
  const breakeven = closedTrades.filter((t) => t.result === "breakeven").length;
  const totalPnL = closedTrades.reduce((sum, t) => sum + Number(t.pnl || 0), 0);
  const winRate = calculateWinRatePercent(wins, losses);

  return {
    totalClosedTrades: closedTrades.length,
    wins,
    losses,
    breakeven,
    winRate,
    totalPnL,
  };
};

interface OpenTradeMetricOptions {
  getRiskPercent?: (trade: UserTrade) => number;
  getTargetTp?: (trade: UserTrade) => number;
}

const getOpenRiskAmount = (trade: UserTrade): number =>
  Math.max(0, Number(trade.remaining_risk_amount ?? trade.risk_amount ?? 0));

const getRrForTrade = (trade: UserTrade, targetTp?: number): number => {
  const entry = Number(trade.signal?.entry_price || 0);
  const stopLoss = Number(trade.signal?.stop_loss || 0);
  const tp = Number(targetTp ?? trade.signal?.take_profit ?? 0);
  const direction = trade.signal?.direction;

  if (direction === "BUY" && entry - stopLoss !== 0) {
    return Math.abs((tp - entry) / (entry - stopLoss));
  }

  if (direction === "SELL" && stopLoss - entry !== 0) {
    return Math.abs((entry - tp) / (stopLoss - entry));
  }

  return 0;
};

export const computeOpenTradeMetrics = (
  trades: UserTrade[],
  options: OpenTradeMetricOptions = {},
): OpenTradeMetrics => {
  const openTrades = trades.filter(isOpenTrade);
  const getRiskPercent = options.getRiskPercent ?? (() => 0);
  const getTargetTp = options.getTargetTp;

  const totalRisk = openTrades.reduce((sum, trade) => sum + getOpenRiskAmount(trade), 0);
  const totalPotentialProfit = openTrades.reduce((sum, trade) => {
    const rr = getRrForTrade(trade, getTargetTp?.(trade));
    return sum + getOpenRiskAmount(trade) * rr;
  }, 0);
  const averageRiskPercent =
    openTrades.length > 0
      ? openTrades.reduce((sum, trade) => sum + getRiskPercent(trade), 0) / openTrades.length
      : 0;

  return {
    openCount: openTrades.length,
    totalRisk,
    totalPotentialProfit,
    averageRiskPercent,
    unrealizedPnL: 0,
  };
};

export const computeLiveSignalMetrics = (
  signals: Array<Pick<Signal, "signal_type" | "status">>,
): LiveSignalMetrics => ({
  liveSignalCount: signals.filter(isLiveSignal).length,
});

export const computeUpcomingSignalMetrics = (
  signals: Array<Pick<Signal, "signal_type" | "status">>,
): UpcomingSignalMetrics => ({
  upcomingSignalCount: signals.filter(isUpcomingSignal).length,
});
