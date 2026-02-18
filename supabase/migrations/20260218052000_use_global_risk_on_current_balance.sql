-- Enforce one risk model for all users:
-- risk_amount = account_balance * global_risk_percent / 100
-- (no starting_balance basis, no per-user custom risk override).

CREATE OR REPLACE FUNCTION public.create_trades_for_signal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_record RECORD;
  global_risk DECIMAL;
  risk_pct DECIMAL;
  risk_amt DECIMAL;
BEGIN
  IF NEW.signal_type <> 'signal' OR NEW.status <> 'active' THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(global_risk_percent, 2) INTO global_risk
  FROM public.global_settings
  LIMIT 1;

  risk_pct := COALESCE(global_risk, 2);

  FOR user_record IN
    SELECT
      p.user_id,
      p.account_balance
    FROM public.profiles p
    JOIN public.subscriptions s
      ON s.user_id = p.user_id
    LEFT JOIN public.subscription_packages sp
      ON sp.id = s.package_id
    WHERE s.status = 'active'
      AND (s.expires_at IS NULL OR s.expires_at > now())
      AND p.account_balance IS NOT NULL
      AND p.account_balance > 0
      AND (
        sp.categories IS NULL
        OR array_length(sp.categories, 1) IS NULL
        OR NEW.category = ANY(sp.categories)
      )
  LOOP
    risk_amt := ROUND((user_record.account_balance * risk_pct) / 100.0, 2);

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
    VALUES (
      user_record.user_id,
      NEW.id,
      risk_pct,
      risk_amt,
      risk_amt,
      risk_amt,
      0,
      0,
      'pending'
    )
    ON CONFLICT (user_id, signal_id) DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$$;

-- Re-sync currently open full-exposure pending trades to the unified risk model.
-- This avoids touching partially-managed positions (where exposure was reduced).
DO $$
DECLARE
  v_global_risk DECIMAL;
BEGIN
  SELECT COALESCE(global_risk_percent, 2) INTO v_global_risk
  FROM public.global_settings
  LIMIT 1;

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

