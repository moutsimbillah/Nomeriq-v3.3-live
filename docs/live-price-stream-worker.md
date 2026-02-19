# Live Price Stream Worker (Backend Fan-Out)

This worker keeps one upstream Twelve Data WebSocket feed and writes ticks to `public.market_quotes`.
Clients then receive the same canonical price via Supabase Realtime (no per-client quote polling).

## Benefits

- One upstream stream for all users (lower API usage cost).
- Consistent live price across admin/provider/user screens.
- Faster propagation through DB + Realtime fan-out.

Note:

- Worker stores `quoted_at` using ingest/server time to keep freshness consistent for all clients.

## Prerequisites

- Node.js 22+ (uses native WebSocket client)
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `market_mode_settings.twelve_data_api_key` set in DB

Worker env loading order:

1. shell env vars
2. `.env.worker`
3. `.env`

Create `.env.worker` from `.env.worker.example` and put secrets there.

Optional:

- `MARKET_STREAM_SYMBOLS` comma-separated extra symbols to always stream.
- `MARKET_STREAM_SYMBOL_REFRESH_MS` default `5000`
- `MARKET_STREAM_FLUSH_MS` default `250`
- `MARKET_STREAM_RECONNECT_BASE_MS` default `1000`
- `MARKET_STREAM_RECONNECT_MAX_MS` default `15000`

## Run

```bash
npm run quotes:worker
```

## Where to find `SUPABASE_SERVICE_ROLE_KEY`

In Supabase dashboard:

1. Open your project.
2. Go to `Project Settings` -> `API`.
3. Under project API keys, copy the `service_role` key.

Treat this as backend secret. Never put it in frontend env (`VITE_*`) or client code.

## What it streams

Dynamic symbols come from live mode signals:

- `signals.signal_type = 'signal'`
- `signals.market_mode = 'live'`
- `signals.status IN ('active','upcoming')`

The worker resolves pair/category to Twelve Data symbol using `market_symbol_map` and falls back to pair conversion (`BTCUSD -> BTC/USD`) when mapping is missing.

## Deployment recommendation

Run as a long-lived process on your backend host (PM2/systemd/container). Keep only one instance active unless you add leader-election.
