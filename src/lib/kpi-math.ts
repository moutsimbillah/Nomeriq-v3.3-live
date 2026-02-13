export const calculateWinRatePercent = (wins: number, losses: number): number => {
  const decidedTrades = Math.max(0, Number(wins || 0)) + Math.max(0, Number(losses || 0));
  if (decidedTrades <= 0) return 0;
  return (Math.max(0, Number(wins || 0)) / decidedTrades) * 100;
};
