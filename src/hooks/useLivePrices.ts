import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { fetchBatchQuotes, pairToTwelveDataSymbol, type BatchLiveQuote } from "@/lib/market-api";
import { supabase } from "@/integrations/supabase/client";

type QuoteRow = {
  symbol: string;
  provider: string;
  price: number | string;
  quoted_at: string;
};

type QuoteMap = Record<string, { price: number; quoted_at: string }>;
type PairQuoteSymbolMap = Record<string, string>;

const STALE_QUOTE_MS = 10_000;
const FALLBACK_RECHECK_MS = 4_000;
const FALLBACK_DEDUPE_MS = 1_200;
const DB_SNAPSHOT_INTERVAL_MS = 1_000;

let sharedFallbackPromise: Promise<Record<string, BatchLiveQuote>> | null = null;
let sharedFallbackRequestedAt = 0;

const mergeQuoteRecords = (
  prev: QuoteMap,
  rows: Array<{ symbol: string; price: number; quoted_at: string }>,
  latestTsBySymbolRef: MutableRefObject<Record<string, number>>,
  latestArrivalMsBySymbolRef: MutableRefObject<Record<string, number>>
): QuoteMap => {
  let changed = false;
  const next: QuoteMap = { ...prev };
  for (const row of rows) {
    const ts = Date.parse(row.quoted_at || "");
    if (!Number.isFinite(ts)) continue;
    const prevTs = latestTsBySymbolRef.current[row.symbol] ?? 0;
    if (ts < prevTs) continue;
    const prevQuote = next[row.symbol];
    if (!prevQuote || prevQuote.price !== row.price || prevQuote.quoted_at !== row.quoted_at) {
      next[row.symbol] = { price: row.price, quoted_at: row.quoted_at };
      latestTsBySymbolRef.current[row.symbol] = ts;
      latestArrivalMsBySymbolRef.current[row.symbol] = Date.now();
      changed = true;
    }
  }
  return changed ? next : prev;
};

const symbolsAreStale = (
  symbols: string[],
  latestTsBySymbolRef: MutableRefObject<Record<string, number>>,
  latestArrivalMsBySymbolRef: MutableRefObject<Record<string, number>>
) => {
  const now = Date.now();
  return symbols.some((symbol) => {
    const arrivalMs = latestArrivalMsBySymbolRef.current[symbol] ?? 0;
    if (arrivalMs) return now - arrivalMs > STALE_QUOTE_MS;
    const ts = latestTsBySymbolRef.current[symbol] ?? 0;
    return !ts || now - ts > STALE_QUOTE_MS;
  });
};

const runSharedFallbackFetch = async (symbols: string[]): Promise<Record<string, BatchLiveQuote> | null> => {
  if (!symbols.length) return null;
  const now = Date.now();
  if (sharedFallbackPromise) return sharedFallbackPromise;
  if (now - sharedFallbackRequestedAt < FALLBACK_DEDUPE_MS) return null;

  sharedFallbackRequestedAt = now;
  sharedFallbackPromise = fetchBatchQuotes(symbols)
    .catch(() => ({}))
    .finally(() => {
      sharedFallbackPromise = null;
    }) as Promise<Record<string, BatchLiveQuote>>;

  return sharedFallbackPromise;
};

/**
 * Fetches current prices for given pairs (app format e.g. BTCUSD).
 * Returns map of pair -> price. Used for live PnL on Active Trades.
 */
export function useLivePrices(pairs: string[]) {
  const stablePairs = useMemo(
    () => [...new Set(pairs.filter(Boolean).map((p) => p.toUpperCase()))].sort(),
    [pairs]
  );

  const [quoteSymbolByPair, setQuoteSymbolByPair] = useState<PairQuoteSymbolMap>({});
  const [quotesBySymbol, setQuotesBySymbol] = useState<QuoteMap>({});
  const latestTsBySymbolRef = useRef<Record<string, number>>({});
  const latestArrivalMsBySymbolRef = useRef<Record<string, number>>({});

  useEffect(() => {
    if (!stablePairs.length) {
      setQuoteSymbolByPair({});
      return;
    }

    let cancelled = false;
    void (async () => {
      const defaultMap: PairQuoteSymbolMap = {};
      for (const pair of stablePairs) {
        defaultMap[pair] = pairToTwelveDataSymbol(pair);
      }

      const { data, error } = await supabase
        .from("market_symbol_map")
        .select("symbol, twelve_data_symbol")
        .eq("provider", "twelve_data")
        .eq("is_active", true)
        .in("symbol", stablePairs);

      if (cancelled) return;
      if (error || !data) {
        setQuoteSymbolByPair(defaultMap);
        return;
      }

      const nextMap: PairQuoteSymbolMap = { ...defaultMap };
      for (const row of data as Array<{ symbol: string; twelve_data_symbol: string }>) {
        const pair = String(row.symbol || "").toUpperCase();
        const quoteSymbol = String(row.twelve_data_symbol || "").trim();
        if (!pair || !quoteSymbol) continue;
        nextMap[pair] = quoteSymbol;
      }
      setQuoteSymbolByPair(nextMap);
    })();

    return () => {
      cancelled = true;
    };
  }, [stablePairs]);

  const twelveDataSymbols = useMemo(() => {
    const out = stablePairs.map((pair) => quoteSymbolByPair[pair] || pairToTwelveDataSymbol(pair));
    return [...new Set(out.filter(Boolean))].sort();
  }, [stablePairs, quoteSymbolByPair]);
  const symbolsKey = useMemo(() => twelveDataSymbols.join("|"), [twelveDataSymbols]);

  useEffect(() => {
    if (!twelveDataSymbols.length) {
      setQuotesBySymbol({});
      latestTsBySymbolRef.current = {};
      latestArrivalMsBySymbolRef.current = {};
      return;
    }
    const watched = new Set(twelveDataSymbols);
    setQuotesBySymbol((prev) => {
      let changed = false;
      const next: QuoteMap = {};
      for (const [symbol, quote] of Object.entries(prev)) {
        if (watched.has(symbol)) {
          next[symbol] = quote;
        } else {
          changed = true;
          delete latestTsBySymbolRef.current[symbol];
          delete latestArrivalMsBySymbolRef.current[symbol];
        }
      }
      return changed ? next : prev;
    });
  }, [symbolsKey, twelveDataSymbols]);

  useEffect(() => {
    if (!twelveDataSymbols.length) return;
    let cancelled = false;

    const loadDbSnapshot = async () => {
      const { data, error } = await supabase
        .from("market_quotes")
        .select("symbol, provider, price, quoted_at")
        .eq("provider", "twelve_data")
        .in("symbol", twelveDataSymbols);

      if (cancelled || error || !data?.length) return;
      const mappedRows = (data as QuoteRow[])
        .map((row) => ({
          symbol: row.symbol,
          price: Number(row.price),
          quoted_at: row.quoted_at,
        }))
        .filter((row) => Number.isFinite(row.price));
      setQuotesBySymbol((prev) =>
        mergeQuoteRecords(prev, mappedRows, latestTsBySymbolRef, latestArrivalMsBySymbolRef)
      );
    };

    void loadDbSnapshot();
    const snapshotIntervalId = globalThis.setInterval(() => {
      void loadDbSnapshot();
    }, DB_SNAPSHOT_INTERVAL_MS);

    return () => {
      cancelled = true;
      globalThis.clearInterval(snapshotIntervalId);
    };
  }, [symbolsKey, twelveDataSymbols]);

  useEffect(() => {
    if (!twelveDataSymbols.length) return;

    const watchedSymbols = new Set(twelveDataSymbols);
    const channelName = `live_market_quotes_${Math.random().toString(36).slice(2)}`;
    const onQuoteChange = (payload: { new?: QuoteRow; old?: QuoteRow }) => {
      const row = payload.new ?? payload.old;
      if (!row) return;
      if (row.provider !== "twelve_data") return;
      if (!watchedSymbols.has(row.symbol)) return;

      const price = Number(row.price);
      if (!Number.isFinite(price)) return;
      const ts = Date.parse(row.quoted_at || "");
      if (!Number.isFinite(ts)) return;

      const prevTs = latestTsBySymbolRef.current[row.symbol] ?? 0;
      if (ts < prevTs) return;

      setQuotesBySymbol((prev) =>
        mergeQuoteRecords(
          prev,
          [{ symbol: row.symbol, price, quoted_at: row.quoted_at }],
          latestTsBySymbolRef,
          latestArrivalMsBySymbolRef
        )
      );
    };

    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "market_quotes",
          filter: "provider=eq.twelve_data",
        },
        onQuoteChange
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "market_quotes",
          filter: "provider=eq.twelve_data",
        },
        onQuoteChange
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [symbolsKey, twelveDataSymbols]);

  useEffect(() => {
    if (!twelveDataSymbols.length) return;
    let cancelled = false;

    const recoverIfStale = async () => {
      if (!symbolsAreStale(twelveDataSymbols, latestTsBySymbolRef, latestArrivalMsBySymbolRef)) return;
      const fetched = await runSharedFallbackFetch(twelveDataSymbols);
      if (cancelled || !fetched || !Object.keys(fetched).length) return;

      const rows = Object.entries(fetched).map(([symbol, quote]) => ({
        symbol,
        price: Number(quote.price),
        quoted_at: quote.quoted_at,
      }));
      setQuotesBySymbol((prev) =>
        mergeQuoteRecords(prev, rows, latestTsBySymbolRef, latestArrivalMsBySymbolRef)
      );
    };

    void recoverIfStale();
    const id = globalThis.setInterval(() => {
      void recoverIfStale();
    }, FALLBACK_RECHECK_MS);

    return () => {
      cancelled = true;
      globalThis.clearInterval(id);
    };
  }, [symbolsKey, twelveDataSymbols]);

  const pricesByPair = useMemo(() => {
    const out: Record<string, number> = {};
    if (!Object.keys(quotesBySymbol).length) return out;
    stablePairs.forEach((p) => {
      const sym = quoteSymbolByPair[p] || pairToTwelveDataSymbol(p);
      const quote = quotesBySymbol[sym];
      if (quote && Number.isFinite(quote.price)) {
        out[p] = quote.price;
      }
    });
    return out;
  }, [stablePairs, quoteSymbolByPair, quotesBySymbol]);

  return pricesByPair;
}
