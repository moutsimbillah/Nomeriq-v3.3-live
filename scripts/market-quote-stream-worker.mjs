import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE_ROOT = path.resolve(__dirname, "..");

const parseEnvValue = (raw) => {
  const value = raw.trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
};

const loadEnvFile = (filename) => {
  const fullPath = path.join(WORKSPACE_ROOT, filename);
  if (!fs.existsSync(fullPath)) return;
  const content = fs.readFileSync(fullPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const firstEq = trimmed.indexOf("=");
    if (firstEq <= 0) continue;
    const key = trimmed.slice(0, firstEq).trim();
    const rawValue = trimmed.slice(firstEq + 1);
    if (!key) continue;
    if (process.env[key] != null && process.env[key] !== "") continue;
    process.env[key] = parseEnvValue(rawValue);
  }
};

// Load worker-specific env first, then fallback to app env.
loadEnvFile(".env.worker");
loadEnvFile(".env");

if (!process.env.SUPABASE_URL && process.env.VITE_SUPABASE_URL) {
  process.env.SUPABASE_URL = process.env.VITE_SUPABASE_URL;
}
if (!process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.SUPABASE_SERVICE_KEY) {
  process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_KEY;
}

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

const PROVIDER = "twelve_data";
const SYMBOL_REFRESH_INTERVAL_MS = Number(process.env.MARKET_STREAM_SYMBOL_REFRESH_MS || 5000);
const UPSERT_FLUSH_INTERVAL_MS = Number(process.env.MARKET_STREAM_FLUSH_MS || 250);
const RECONNECT_BASE_DELAY_MS = Number(process.env.MARKET_STREAM_RECONNECT_BASE_MS || 1000);
const RECONNECT_MAX_DELAY_MS = Number(process.env.MARKET_STREAM_RECONNECT_MAX_MS || 15000);

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    "[market-quote-stream-worker] Missing env. Required: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Set them in shell or .env.worker."
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const pairToTwelveDataSymbol = (pair) => {
  const p = String(pair || "").replace(/\s/g, "").toUpperCase();
  if (p.length >= 6) return `${p.slice(0, 3)}/${p.slice(3)}`;
  return p;
};

const toIsoFromPayload = (payload) => {
  const raw =
    payload?.timestamp ??
    payload?.time ??
    payload?.datetime ??
    payload?.quoted_at ??
    null;
  if (raw == null) return new Date().toISOString();
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const ms = raw > 1e12 ? raw : raw * 1000;
    return new Date(ms).toISOString();
  }
  const asNum = Number(raw);
  if (Number.isFinite(asNum)) {
    const ms = asNum > 1e12 ? asNum : asNum * 1000;
    return new Date(ms).toISOString();
  }
  const parsed = Date.parse(String(raw));
  if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  return new Date().toISOString();
};

const chunk = (arr, size) => {
  if (!arr.length) return [];
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

class MarketQuoteStreamWorker {
  constructor() {
    this.apiKey = null;
    this.ws = null;
    this.stopping = false;
    this.reconnectAttempt = 0;

    this.targetSymbols = new Set();
    this.subscribedSymbols = new Set();
    this.pendingQuotes = new Map();

    this.flushTimer = null;
    this.symbolRefreshTimer = null;
    this.keyRefreshTimer = null;
    this.reconnectTimer = null;
  }

  async start() {
    await this.refreshApiKey();
    await this.refreshTargetSymbols();

    this.flushTimer = setInterval(() => {
      void this.flushPendingQuotes();
    }, UPSERT_FLUSH_INTERVAL_MS);

    this.symbolRefreshTimer = setInterval(() => {
      void this.refreshTargetSymbols();
    }, SYMBOL_REFRESH_INTERVAL_MS);

    this.keyRefreshTimer = setInterval(() => {
      void this.refreshApiKey();
    }, 30000);

    await this.ensureSocketState();
  }

  async stop() {
    this.stopping = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.flushTimer) clearInterval(this.flushTimer);
    if (this.symbolRefreshTimer) clearInterval(this.symbolRefreshTimer);
    if (this.keyRefreshTimer) clearInterval(this.keyRefreshTimer);

    await this.flushPendingQuotes();

    if (this.ws) {
      try {
        this.ws.close(1000, "worker stopping");
      } catch (err) {
        console.warn("[market-quote-stream-worker] ws close error:", err);
      }
      this.ws = null;
    }
  }

  async refreshApiKey() {
    const { data, error } = await supabase
      .from("market_mode_settings")
      .select("twelve_data_api_key")
      .limit(1)
      .single();
    if (error) {
      console.warn("[market-quote-stream-worker] failed to load api key:", error.message);
      return;
    }
    const nextKey = data?.twelve_data_api_key || null;
    if (!nextKey) {
      if (this.apiKey !== null) {
        console.warn("[market-quote-stream-worker] api key cleared; stream paused.");
      }
      this.apiKey = null;
      return;
    }

    if (this.apiKey && this.apiKey !== nextKey) {
      console.info("[market-quote-stream-worker] api key changed, reconnecting stream.");
      this.apiKey = nextKey;
      await this.reconnectNow();
      return;
    }
    this.apiKey = nextKey;
  }

  async refreshTargetSymbols() {
    const symbols = new Set();

    const { data: liveSignals, error } = await supabase
      .from("signals")
      .select("pair, category")
      .eq("signal_type", "signal")
      .eq("market_mode", "live")
      .in("status", ["active", "upcoming"]);

    if (error) {
      console.warn("[market-quote-stream-worker] failed to load live symbols:", error.message);
      return;
    }

    const rows = (liveSignals || []).filter((row) => row?.pair && row?.category);
    const uniquePairs = [...new Set(rows.map((r) => String(r.pair).toUpperCase()))];
    const uniqueCategories = [...new Set(rows.map((r) => String(r.category)))];

    let mapByKey = new Map();
    if (uniquePairs.length && uniqueCategories.length) {
      const { data: maps, error: mapError } = await supabase
        .from("market_symbol_map")
        .select("symbol, category, twelve_data_symbol, provider, is_active")
        .eq("provider", PROVIDER)
        .eq("is_active", true)
        .in("symbol", uniquePairs)
        .in("category", uniqueCategories);

      if (mapError) {
        console.warn("[market-quote-stream-worker] failed to load symbol map:", mapError.message);
      } else {
        mapByKey = new Map(
          (maps || []).map((m) => [`${String(m.symbol).toUpperCase()}::${String(m.category)}`, m.twelve_data_symbol])
        );
      }
    }

    for (const row of rows) {
      const pair = String(row.pair).toUpperCase();
      const category = String(row.category);
      const mapped = mapByKey.get(`${pair}::${category}`);
      symbols.add(mapped || pairToTwelveDataSymbol(pair));
    }

    const extraFromEnv = String(process.env.MARKET_STREAM_SYMBOLS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const sym of extraFromEnv) symbols.add(sym);

    this.targetSymbols = symbols;
    await this.ensureSocketState();
  }

  async ensureSocketState() {
    if (this.stopping) return;
    if (!this.apiKey) return;

    if (!this.targetSymbols.size) {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        console.info("[market-quote-stream-worker] no active live symbols; closing stream.");
        this.ws.close(1000, "no symbols");
      }
      return;
    }

    if (!this.ws || this.ws.readyState === WebSocket.CLOSED) {
      this.openSocket();
      return;
    }

    if (this.ws.readyState === WebSocket.OPEN) {
      this.syncSubscriptions();
    }
  }

  openSocket() {
    if (this.stopping || !this.apiKey) return;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const url = `wss://ws.twelvedata.com/v1/quotes/price?apikey=${encodeURIComponent(this.apiKey)}`;
    console.info("[market-quote-stream-worker] opening websocket...");
    this.ws = new WebSocket(url);

    this.ws.addEventListener("open", () => {
      this.reconnectAttempt = 0;
      this.subscribedSymbols.clear();
      console.info("[market-quote-stream-worker] websocket connected.");
      this.syncSubscriptions();
    });

    this.ws.addEventListener("message", (event) => {
      this.handleMessage(event.data);
    });

    this.ws.addEventListener("error", (event) => {
      console.warn("[market-quote-stream-worker] websocket error:", event?.message || event);
    });

    this.ws.addEventListener("close", (event) => {
      console.warn(
        "[market-quote-stream-worker] websocket closed:",
        `code=${event.code}`,
        `reason=${event.reason || "n/a"}`
      );
      this.subscribedSymbols.clear();
      if (!this.stopping) this.scheduleReconnect();
    });
  }

  scheduleReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    const backoff = Math.min(
      RECONNECT_MAX_DELAY_MS,
      RECONNECT_BASE_DELAY_MS * Math.max(1, 2 ** this.reconnectAttempt)
    );
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      void this.ensureSocketState();
    }, backoff);
  }

  async reconnectNow() {
    if (this.ws && this.ws.readyState <= WebSocket.OPEN) {
      try {
        this.ws.close(1012, "reconnect requested");
      } catch (err) {
        console.warn("[market-quote-stream-worker] reconnect close error:", err);
      }
    } else {
      await this.ensureSocketState();
    }
  }

  sendMessage(payload) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify(payload));
  }

  syncSubscriptions() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const target = this.targetSymbols;
    const currentlySubscribed = this.subscribedSymbols;

    const toSubscribe = [...target].filter((s) => !currentlySubscribed.has(s));
    const toUnsubscribe = [...currentlySubscribed].filter((s) => !target.has(s));

    for (const group of chunk(toSubscribe, 50)) {
      this.sendMessage({
        action: "subscribe",
        params: { symbols: group.join(",") },
      });
      group.forEach((s) => currentlySubscribed.add(s));
      console.info("[market-quote-stream-worker] subscribed:", group.join(", "));
    }

    for (const group of chunk(toUnsubscribe, 50)) {
      this.sendMessage({
        action: "unsubscribe",
        params: { symbols: group.join(",") },
      });
      group.forEach((s) => currentlySubscribed.delete(s));
      console.info("[market-quote-stream-worker] unsubscribed:", group.join(", "));
    }
  }

  handleMessage(raw) {
    let parsed;
    try {
      parsed = JSON.parse(String(raw));
    } catch {
      return;
    }

    const nodes = Array.isArray(parsed) ? parsed : [parsed];
    for (const node of nodes) {
      if (!node || typeof node !== "object") continue;
      const maybeEvent = String(node.event || "").toLowerCase();
      if (maybeEvent === "subscribe-status" || maybeEvent === "heartbeat") continue;
      if (node.status === "error" || node.code === 401) {
        console.warn("[market-quote-stream-worker] provider error:", node.message || node);
        continue;
      }

      const symbol = String(node.symbol || node.instrument || "").trim();
      const rawPrice = node.price ?? node.close ?? null;
      const price = Number(rawPrice);
      if (!symbol || !Number.isFinite(price)) continue;

      // Use server ingest time for canonical freshness across clients.
      // Provider timestamp fields can be coarse (e.g. minute bucket), which
      // breaks staleness detection and causes fallback divergence.
      this.pendingQuotes.set(symbol, {
        symbol,
        provider: PROVIDER,
        price,
        quoted_at: new Date().toISOString(),
      });
    }
  }

  async flushPendingQuotes() {
    if (!this.pendingQuotes.size) return;
    const rows = [...this.pendingQuotes.values()];
    this.pendingQuotes.clear();

    const { error } = await supabase
      .from("market_quotes")
      .upsert(rows, { onConflict: "symbol,provider" });

    if (error) {
      console.warn("[market-quote-stream-worker] upsert failed:", error.message);
      for (const row of rows) this.pendingQuotes.set(row.symbol, row);
    }
  }
}

const worker = new MarketQuoteStreamWorker();

const shutdown = async (signal) => {
  console.info(`[market-quote-stream-worker] received ${signal}, stopping...`);
  await worker.stop();
  process.exit(0);
};

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});
process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

async function main() {
  console.info("[market-quote-stream-worker] starting...");
  while (true) {
    try {
      await worker.start();
      return;
    } catch (err) {
      console.error("[market-quote-stream-worker] startup error:", err);
      await sleep(2000);
    }
  }
}

void main();
