-- Enforce subscription category access consistently for signals visibility
-- and auto-created user trades.

-- 1) Replace permissive signals SELECT policies with category-aware policy only.
DROP POLICY IF EXISTS "Active subscribers and admins can view signals" ON public.signals;
DROP POLICY IF EXISTS "Active subscribers can view signals" ON public.signals;
DROP POLICY IF EXISTS "Users can view signals by category" ON public.signals;

CREATE POLICY "Users can view signals by category"
ON public.signals
FOR SELECT
USING (
  public.user_has_category_access(auth.uid(), category)
  OR public.is_any_admin(auth.uid())
  OR public.has_role(auth.uid(), 'admin')
);

-- 2) Ensure auto-created trades are generated only for users whose active
-- package grants access to NEW.category.
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
  -- Only create trades for active market signals
  IF NEW.signal_type <> 'signal' OR NEW.status <> 'active' THEN
    RETURN NEW;
  END IF;

  SELECT global_risk_percent INTO global_risk FROM public.global_settings LIMIT 1;

  FOR user_record IN
    SELECT p.user_id, p.account_balance, p.custom_risk_percent
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
      AND NOT EXISTS (
        SELECT 1
        FROM public.user_roles ur
        WHERE ur.user_id = p.user_id
          AND ur.role = 'admin'
      )
  LOOP
    risk_pct := COALESCE(user_record.custom_risk_percent, global_risk);
    risk_amt := (user_record.account_balance * risk_pct) / 100;

    INSERT INTO public.user_trades (user_id, signal_id, risk_percent, risk_amount, result)
    VALUES (user_record.user_id, NEW.id, risk_pct, risk_amt, 'pending')
    ON CONFLICT (user_id, signal_id) DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$$;

-- 3) Cleanup: remove pending trades that user should not receive by category.
DELETE FROM public.user_trades ut
USING public.signals s
WHERE ut.signal_id = s.id
  AND ut.result = 'pending'
  AND NOT public.user_has_category_access(ut.user_id, s.category);

NOTIFY pgrst, 'reload schema';
