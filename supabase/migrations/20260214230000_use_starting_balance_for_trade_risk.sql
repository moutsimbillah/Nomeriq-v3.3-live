-- Use fixed risk base (starting_balance) when creating new user trades for signals.
-- Fallback to account_balance only if starting_balance is missing.

CREATE OR REPLACE FUNCTION public.create_trades_for_signal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_record RECORD;
  risk_pct DECIMAL;
  global_risk DECIMAL;
  risk_amt DECIMAL;
BEGIN
  IF NEW.signal_type <> 'signal' OR NEW.status <> 'active' THEN
    RETURN NEW;
  END IF;

  SELECT global_risk_percent INTO global_risk FROM public.global_settings LIMIT 1;

  FOR user_record IN
    SELECT
      p.user_id,
      COALESCE(p.starting_balance, p.account_balance) AS risk_base_balance,
      p.custom_risk_percent
    FROM public.profiles p
    JOIN public.subscriptions s
      ON s.user_id = p.user_id
    LEFT JOIN public.subscription_packages sp
      ON sp.id = s.package_id
    WHERE s.status = 'active'
      AND (s.expires_at IS NULL OR s.expires_at > now())
      AND COALESCE(p.starting_balance, p.account_balance) IS NOT NULL
      AND COALESCE(p.starting_balance, p.account_balance) > 0
      AND (
        sp.categories IS NULL
        OR array_length(sp.categories, 1) IS NULL
        OR NEW.category = ANY(sp.categories)
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.user_roles ur
        WHERE ur.user_id = p.user_id
          AND ur.role = 'admin'
      )
  LOOP
    risk_pct := COALESCE(user_record.custom_risk_percent, global_risk);
    risk_amt := (user_record.risk_base_balance * risk_pct) / 100;

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

NOTIFY pgrst, 'reload schema';

