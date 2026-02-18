import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchBatchQuotes, pairToTwelveDataSymbol } from "@/lib/market-api";

/**
 * Fetches current prices for given pairs (app format e.g. BTCUSD).
 * Returns map of pair -> price. Used for live PnL on Active Trades.
 */
export function useLivePrices(pairs: string[]) {
  const twelveDataSymbols = useMemo(
    () => [...new Set(pairs.map(pairToTwelveDataSymbol).filter(Boolean))].sort(),
    [pairs]
  );

  const { data: pricesByTwelve } = useQuery({
    queryKey: ["live-prices", twelveDataSymbols],
    queryFn: () => fetchBatchQuotes(twelveDataSymbols),
    enabled: twelveDataSymbols.length > 0,
    refetchInterval: 15000,
    staleTime: 10000,
  });

  const pricesByPair = useMemo(() => {
    const out: Record<string, number> = {};
    if (!pricesByTwelve) return out;
    pairs.forEach((p) => {
      const sym = pairToTwelveDataSymbol(p);
      if (pricesByTwelve[sym] != null) out[p] = pricesByTwelve[sym];
    });
    return out;
  }, [pairs, pricesByTwelve]);

  return pricesByPair;
}
