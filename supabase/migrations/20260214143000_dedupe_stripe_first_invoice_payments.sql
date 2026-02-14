-- Deduplicate Stripe first-charge payment rows.
-- Context:
-- - checkout.session.completed can create a Stripe payment row (session placeholder)
-- - invoice.paid can create another row for the same first charge
-- This migration keeps the invoice-backed row and removes the checkout placeholder row.

WITH checkout_rows AS (
  SELECT
    id,
    user_id,
    provider_subscription_id,
    amount,
    currency,
    created_at
  FROM public.payments
  WHERE provider = 'stripe'
    AND provider_subscription_id IS NOT NULL
    AND provider_session_id IS NOT NULL
    AND provider_payment_id IS NULL
),
matched_pairs AS (
  SELECT
    c.id AS checkout_payment_id,
    (
      SELECT p.id
      FROM public.payments p
      WHERE p.provider = 'stripe'
        AND p.user_id = c.user_id
        AND p.provider_subscription_id = c.provider_subscription_id
        AND p.provider_payment_id IS NOT NULL
        AND ABS(COALESCE(p.amount, 0) - COALESCE(c.amount, 0)) < 0.00001
        AND p.currency = c.currency
        AND ABS(EXTRACT(EPOCH FROM (p.created_at - c.created_at))) <= 86400
      ORDER BY
        ABS(EXTRACT(EPOCH FROM (p.created_at - c.created_at))) ASC,
        p.created_at DESC
      LIMIT 1
    ) AS invoice_payment_id
  FROM checkout_rows c
),
pairs AS (
  SELECT checkout_payment_id, invoice_payment_id
  FROM matched_pairs
  WHERE invoice_payment_id IS NOT NULL
)
UPDATE public.subscriptions s
SET
  payment_id = p.invoice_payment_id,
  updated_at = NOW()
FROM pairs p
WHERE s.payment_id = p.checkout_payment_id;

WITH checkout_rows AS (
  SELECT
    id,
    user_id,
    provider_subscription_id,
    amount,
    currency,
    created_at
  FROM public.payments
  WHERE provider = 'stripe'
    AND provider_subscription_id IS NOT NULL
    AND provider_session_id IS NOT NULL
    AND provider_payment_id IS NULL
),
matched_pairs AS (
  SELECT
    c.id AS checkout_payment_id,
    (
      SELECT p.id
      FROM public.payments p
      WHERE p.provider = 'stripe'
        AND p.user_id = c.user_id
        AND p.provider_subscription_id = c.provider_subscription_id
        AND p.provider_payment_id IS NOT NULL
        AND ABS(COALESCE(p.amount, 0) - COALESCE(c.amount, 0)) < 0.00001
        AND p.currency = c.currency
        AND ABS(EXTRACT(EPOCH FROM (p.created_at - c.created_at))) <= 86400
      ORDER BY
        ABS(EXTRACT(EPOCH FROM (p.created_at - c.created_at))) ASC,
        p.created_at DESC
      LIMIT 1
    ) AS invoice_payment_id
  FROM checkout_rows c
),
pairs AS (
  SELECT checkout_payment_id
  FROM matched_pairs
  WHERE invoice_payment_id IS NOT NULL
)
DELETE FROM public.payments pay
USING pairs p
WHERE pay.id = p.checkout_payment_id;
