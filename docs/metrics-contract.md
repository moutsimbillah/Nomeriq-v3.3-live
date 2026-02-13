# Metrics Contract (Single-Tenant Phase 1)

This document defines one source of truth for each important number so pages do not disagree.

## Why this exists

- This product is used for financial decisions.
- If two screens calculate differently, trust drops immediately.
- Every metric below has one canonical source.

## Canonical sources

- Trade KPIs (`total_trades`, `wins`, `losses`, `breakeven`, `pending`, `closed_trades`, `win_rate_percent`, `total_pnl`)
  - Source: database function `public.get_trade_kpis(...)`.
  - Rule: dashboards and admin KPI cards should prefer this function over frontend recalculation.

- Trade-level R:R
  - Source: `src/lib/trade-math.ts` (`calculateSignalRr`, `calculateSignalRrForTarget`).
  - Rule: components should use shared helper functions, not local duplicated formulas.

- Trade-level Potential Profit (display)
  - Source: `src/lib/trade-math.ts` (`calculateDisplayedPotentialProfit`).
  - Rule:
  - Open trades: `risk_amount * R:R`.
  - Closed trades: show realized upside only (`max(pnl, 0)`), not stale theoretical target.

- Active subscription selected for user state
  - Source: `src/lib/subscription-selection.ts` (`pickPrimarySubscription`).
  - Rule:
  - Prefer currently active and not expired.
  - If none active, prefer newest pending.
  - Otherwise use newest record.

## Data consistency guardrails already added

- Stripe event ordering protection
  - `subscriptions.provider_event_created_at`
  - `subscriptions.provider_last_event_id`
  - Webhook logic ignores stale/out-of-order provider events.

- Global settings singleton
  - `global_settings.singleton_key` unique enforcement.
  - Prevents accidental multi-row settings drift.

- Async stale-response protection
  - Request sequence guards prevent older async responses from overwriting newer state in key hooks.

## Operational checks before rollout

- Verify KPI parity:
  - Compare dashboard totals with direct SQL call to `get_trade_kpis`.
- Verify subscription parity:
  - Confirm `AuthContext`, package hooks, and admin user details resolve the same active subscription.
- Verify payment event ordering:
  - Replay old Stripe event and confirm it is skipped.
- Verify CI gate:
  - `.github/workflows/phase1-accuracy.yml` must pass (`npm test` + `npm run build`) before merge.

## Change policy

- Any new metric added to UI must first define:
  - Canonical source
  - Shared helper/function owner
  - Reconciliation check
- Do not add page-local math for existing metrics.
