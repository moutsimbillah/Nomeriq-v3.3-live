-- Backfill missing pending user trades for currently active signals
-- using global risk on current account balance.

DO $$
DECLARE
  v_global_risk DECIMAL;
BEGIN
  SELECT COALESCE(global_risk_percent, 2) INTO v_global_risk
  FROM public.global_settings
  LIMIT 1;

  INSERT INTO public.user_trades (
    user_id,
    signal_id,
    risk_percent,
    risk_amount,
    initial_risk_amount,
    remaining_risk_amount,
    realized_pnl,
    pnl,
    result
  )
  SELECT
    p.user_id,
    s.id,
    v_global_risk,
    ROUND((p.account_balance * v_global_risk) / 100.0, 2),
    ROUND((p.account_balance * v_global_risk) / 100.0, 2),
    ROUND((p.account_balance * v_global_risk) / 100.0, 2),
    0,
    0,
    'pending'
  FROM public.signals s
  JOIN public.subscriptions sub
    ON sub.status = 'active'
   AND (sub.expires_at IS NULL OR sub.expires_at > now())
  JOIN public.profiles p
    ON p.user_id = sub.user_id
  LEFT JOIN public.subscription_packages sp
    ON sp.id = sub.package_id
  WHERE s.signal_type = 'signal'
    AND s.status = 'active'
    AND p.account_balance IS NOT NULL
    AND p.account_balance > 0
    AND (
      sp.categories IS NULL
      OR array_length(sp.categories, 1) IS NULL
      OR s.category = ANY(sp.categories)
    )
  ON CONFLICT (user_id, signal_id) DO NOTHING;

  -- Re-sync full-exposure pending trades in case balances changed.
  UPDATE public.user_trades ut
  SET
    risk_percent = v_global_risk,
    risk_amount = ROUND((p.account_balance * v_global_risk) / 100.0, 2),
    initial_risk_amount = ROUND((p.account_balance * v_global_risk) / 100.0, 2),
    remaining_risk_amount = ROUND((p.account_balance * v_global_risk) / 100.0, 2)
  FROM public.profiles p
  WHERE ut.user_id = p.user_id
    AND ut.result = 'pending'
    AND p.account_balance IS NOT NULL
    AND p.account_balance > 0
    AND COALESCE(ut.realized_pnl, 0) = 0
    AND COALESCE(ut.remaining_risk_amount, ut.risk_amount) = COALESCE(ut.initial_risk_amount, ut.risk_amount);
END;
$$;

NOTIFY pgrst, 'reload schema';

