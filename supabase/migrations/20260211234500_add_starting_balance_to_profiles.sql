-- Store immutable user starting balance for accurate equity metrics.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS starting_balance DECIMAL(15,2);

-- Best-effort backfill from first recorded trade risk config:
-- starting_balance ~= risk_amount / (risk_percent / 100)
WITH first_trade AS (
  SELECT DISTINCT ON (ut.user_id)
    ut.user_id,
    ut.risk_amount,
    ut.risk_percent
  FROM public.user_trades ut
  WHERE ut.risk_percent IS NOT NULL
    AND ut.risk_percent > 0
    AND ut.risk_amount IS NOT NULL
    AND ut.risk_amount > 0
  ORDER BY ut.user_id, ut.created_at ASC
)
UPDATE public.profiles p
SET starting_balance = ROUND(((ft.risk_amount * 100.0) / ft.risk_percent)::numeric, 2)
FROM first_trade ft
WHERE p.user_id = ft.user_id
  AND p.starting_balance IS NULL;

-- For users with no trades yet but already initialized balance, use current as baseline.
UPDATE public.profiles
SET starting_balance = account_balance
WHERE starting_balance IS NULL
  AND balance_set_at IS NOT NULL
  AND account_balance IS NOT NULL;

NOTIFY pgrst, 'reload schema';
