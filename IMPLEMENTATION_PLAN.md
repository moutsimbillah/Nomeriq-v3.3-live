# Live PnL & Market Mode Implementation Plan

## Overview
Add "Live Mode" for trading signals with real-time market prices from Twelve Data, while keeping "Manual Mode" completely unchanged.

## Architecture Summary

### Database Changes
1. **market_mode_settings** table: Store manual/live mode preference and Twelve Data API key
2. **market_symbol_map** table: Catalog of available pairs from Twelve Data (synced via background worker)
3. **signals** table additions:
   - `market_mode` ENUM('manual', 'live')
   - `entry_quote_id` UUID (reference to quote snapshot)
   - `entry_quoted_at` TIMESTAMPTZ
   - `entry_source` TEXT (e.g., 'twelve_data')
4. **market_quotes** table: Cache latest quotes per symbol for performance

### Components

#### 1. Admin Sidebar
- Add "Market Mode" page link (super_admin only)
- Location: Under "Admin Management" section

#### 2. Market Mode Admin Page (`/admin/market-mode`)
- Toggle between Manual/Live mode
- Input field for Twelve Data API key (encrypted storage)
- Status indicators (API connection test, symbol sync status)

#### 3. Signal Creation Form (Live Mode)
- **Pair Selector**: Autocomplete from `market_symbol_map` (filtered by category)
- **Entry Price**: Auto-fetched, read-only, refreshes every 30s
- **Quote Validation**: On "Create & Notify", server validates quote age:
  - If <= 30s: Use locked entry
  - If > 30s: Server auto-fetches latest and overrides (or prompts confirmation)

#### 4. User Dashboard (Active Trades)
- **Live Mode Signals**:
  - Show live PnL in "Unrealized P&L" card
  - Show "Current Price" block in trade row
- **Manual Mode Signals**:
  - PnL stays at $0.00
  - No "Current Price" block

### Backend Services

#### 1. Twelve Data Integration
- Supabase Edge Function: `twelve-data-quote`
- Fetches real-time quotes for symbols
- Handles rate limiting and errors

#### 2. Symbol Sync Worker
- Background cron job (Supabase Edge Function or external service)
- Syncs available symbols from Twelve Data → `market_symbol_map`
- Runs daily or on-demand

#### 3. Real-time Price Streaming
- WebSocket or polling service for active Live Mode signals
- Updates `market_quotes` table
- Frontend subscribes to price changes

#### 4. RPC Functions
- `search_market_pairs(category, query, mode)`: Returns available pairs for autocomplete
- `get_live_quote(symbol)`: Fetches current quote (with caching)

### PnL Calculation Logic

For Live Mode signals:
```
If BUY:
  PnL = (current_price - entry_price) * position_size
  
If SELL:
  PnL = (entry_price - current_price) * position_size
```

Position size = risk_amount / abs(entry_price - stop_loss)

## Implementation Steps

1. ✅ Database migrations (market_mode_settings, market_symbol_map, market_quotes, signals columns, RPCs)
2. ✅ Market Mode admin page (toggle Manual/Live, Twelve Data API key, sync symbols)
3. ✅ Twelve Data API integration (Edge: twelve-data-quote, sync-market-symbols, create-signal-live)
4. ✅ Symbol sync worker (sync-market-symbols Edge Function + fallback pairs)
5. ✅ Signal creation form (Live: pair from DB catalog, entry locked + 30s refresh; Manual unchanged)
6. ✅ Real-time price updates (batch quote for active live symbols; useLivePrices hook)
7. ✅ Live PnL calculation (computeLiveTradePnL; Unrealized P&L card for Live only)
8. ✅ User dashboard updates (Current Price block + live PnL in Active Trades; Manual stays $0, no block)

## Isolation Strategy

- Manual Mode: Zero changes to existing code paths
- Live Mode: New conditional branches based on `market_mode` field
- All Live Mode logic wrapped in `if (market_mode === 'live')` checks
- Default behavior: Manual Mode (backward compatible)
