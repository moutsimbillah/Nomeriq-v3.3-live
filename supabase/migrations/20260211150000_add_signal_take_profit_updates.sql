-- Add incremental take-profit updates (TP1/TP2/...) that realize partial
-- profits for active user trades and keep remaining open risk.

-- 1) Extend user_trades for partial-close accounting.
ALTER TABLE public.user_trades
  ADD COLUMN IF NOT EXISTS initial_risk_amount DECIMAL(15,2),
  ADD COLUMN IF NOT EXISTS remaining_risk_amount DECIMAL(15,2),
  ADD COLUMN IF NOT EXISTS realized_pnl DECIMAL(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_update_at TIMESTAMPTZ;

UPDATE public.user_trades
SET
  initial_risk_amount = COALESCE(initial_risk_amount, risk_amount),
  remaining_risk_amount = COALESCE(
    remaining_risk_amount,
    CASE
      WHEN result = 'pending' THEN risk_amount
      ELSE 0
    END
  ),
  realized_pnl = COALESCE(realized_pnl, 0)
WHERE initial_risk_amount IS NULL
   OR remaining_risk_amount IS NULL
   OR realized_pnl IS NULL;

ALTER TABLE public.user_trades
  ALTER COLUMN initial_risk_amount SET NOT NULL,
  ALTER COLUMN remaining_risk_amount SET NOT NULL;

-- 2) Store provider/admin TP updates per signal.
CREATE TABLE IF NOT EXISTS public.signal_take_profit_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id UUID NOT NULL REFERENCES public.signals(id) ON DELETE CASCADE,
  tp_label TEXT NOT NULL,
  tp_price DECIMAL(20,8) NOT NULL,
  close_percent DECIMAL(5,2) NOT NULL CHECK (close_percent > 0 AND close_percent <= 100),
  note TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_signal_take_profit_updates_signal_created
  ON public.signal_take_profit_updates(signal_id, created_at DESC);

-- 3) Keep an audit/apply record so each TP update is applied to each trade once.
CREATE TABLE IF NOT EXISTS public.user_trade_take_profit_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_trade_id UUID NOT NULL REFERENCES public.user_trades(id) ON DELETE CASCADE,
  signal_update_id UUID NOT NULL REFERENCES public.signal_take_profit_updates(id) ON DELETE CASCADE,
  close_percent DECIMAL(5,2) NOT NULL,
  realized_pnl DECIMAL(15,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_trade_id, signal_update_id)
);

CREATE INDEX IF NOT EXISTS idx_user_trade_tp_updates_trade
  ON public.user_trade_take_profit_updates(user_trade_id, created_at DESC);

-- 4) RLS policies.
ALTER TABLE public.signal_take_profit_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_trade_take_profit_updates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view TP updates for visible signals" ON public.signal_take_profit_updates;
CREATE POLICY "Users can view TP updates for visible signals"
ON public.signal_take_profit_updates
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.signals s
    WHERE s.id = signal_take_profit_updates.signal_id
      AND (
        public.user_has_category_access(auth.uid(), s.category)
        OR public.is_any_admin(auth.uid())
        OR s.created_by = auth.uid()
      )
  )
);

DROP POLICY IF EXISTS "Admins and providers can insert TP updates" ON public.signal_take_profit_updates;
CREATE POLICY "Admins and providers can insert TP updates"
ON public.signal_take_profit_updates
FOR INSERT
WITH CHECK (
  public.is_any_admin(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.signals s
    WHERE s.id = signal_take_profit_updates.signal_id
      AND s.created_by = auth.uid()
  )
);

DROP POLICY IF EXISTS "Admins and owners can manage TP updates" ON public.signal_take_profit_updates;
CREATE POLICY "Admins and owners can manage TP updates"
ON public.signal_take_profit_updates
FOR UPDATE
USING (
  public.is_any_admin(auth.uid())
  OR created_by = auth.uid()
)
WITH CHECK (
  public.is_any_admin(auth.uid())
  OR created_by = auth.uid()
);

DROP POLICY IF EXISTS "Admins and owners can delete TP updates" ON public.signal_take_profit_updates;
CREATE POLICY "Admins and owners can delete TP updates"
ON public.signal_take_profit_updates
FOR DELETE
USING (
  public.is_any_admin(auth.uid())
  OR created_by = auth.uid()
);

DROP POLICY IF EXISTS "Users can view their own TP applications" ON public.user_trade_take_profit_updates;
CREATE POLICY "Users can view their own TP applications"
ON public.user_trade_take_profit_updates
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.user_trades ut
    WHERE ut.id = user_trade_take_profit_updates.user_trade_id
      AND (ut.user_id = auth.uid() OR public.is_any_admin(auth.uid()))
  )
);

-- Trigger writes this table as SECURITY DEFINER function.
DROP POLICY IF EXISTS "No direct insert into TP applications" ON public.user_trade_take_profit_updates;
CREATE POLICY "No direct insert into TP applications"
ON public.user_trade_take_profit_updates
FOR INSERT
WITH CHECK (false);

-- 5) Apply TP updates to open trades (partial close + realized profit).
CREATE OR REPLACE FUNCTION public.apply_take_profit_update_to_user_trades()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  trade_record RECORD;
  rr_ratio DECIMAL;
  effective_close_percent DECIMAL;
  reduced_risk DECIMAL;
  realized_amount DECIMAL;
  remaining_after DECIMAL;
BEGIN
  FOR trade_record IN
    SELECT *
    FROM public.user_trades
    WHERE signal_id = NEW.signal_id
      AND result = 'pending'
  LOOP
    -- Idempotency guard
    IF EXISTS (
      SELECT 1
      FROM public.user_trade_take_profit_updates utpu
      WHERE utpu.user_trade_id = trade_record.id
        AND utpu.signal_update_id = NEW.id
    ) THEN
      CONTINUE;
    END IF;

    IF trade_record.initial_risk_amount <= 0 OR trade_record.remaining_risk_amount <= 0 THEN
      CONTINUE;
    END IF;

    -- Cap close percent to remaining exposure.
    effective_close_percent := LEAST(
      NEW.close_percent,
      (trade_record.remaining_risk_amount / trade_record.initial_risk_amount) * 100
    );

    IF effective_close_percent <= 0 THEN
      CONTINUE;
    END IF;

    IF trade_record.signal_id IS NULL THEN
      CONTINUE;
    END IF;

    -- R:R against TP update price.
    SELECT
      CASE
        WHEN s.direction = 'BUY' THEN
          CASE
            WHEN (s.entry_price - s.stop_loss) = 0 THEN 1
            ELSE ABS((NEW.tp_price - s.entry_price) / (s.entry_price - s.stop_loss))
          END
        ELSE
          CASE
            WHEN (s.stop_loss - s.entry_price) = 0 THEN 1
            ELSE ABS((s.entry_price - NEW.tp_price) / (s.stop_loss - s.entry_price))
          END
      END
    INTO rr_ratio
    FROM public.signals s
    WHERE s.id = NEW.signal_id;

    rr_ratio := COALESCE(rr_ratio, 1);
    reduced_risk := trade_record.initial_risk_amount * (effective_close_percent / 100);
    reduced_risk := LEAST(reduced_risk, trade_record.remaining_risk_amount);
    realized_amount := reduced_risk * rr_ratio;
    remaining_after := GREATEST(trade_record.remaining_risk_amount - reduced_risk, 0);

    UPDATE public.user_trades
    SET
      remaining_risk_amount = remaining_after,
      realized_pnl = COALESCE(realized_pnl, 0) + realized_amount,
      pnl = COALESCE(pnl, 0) + realized_amount,
      last_update_at = now(),
      closed_at = CASE WHEN remaining_after <= 0 THEN now() ELSE closed_at END,
      result = CASE WHEN remaining_after <= 0 THEN 'win' ELSE result END
    WHERE id = trade_record.id;

    UPDATE public.profiles
    SET
      account_balance = account_balance + realized_amount,
      updated_at = now()
    WHERE user_id = trade_record.user_id;

    INSERT INTO public.user_trade_take_profit_updates (
      user_trade_id,
      signal_update_id,
      close_percent,
      realized_pnl
    )
    VALUES (
      trade_record.id,
      NEW.id,
      effective_close_percent,
      realized_amount
    )
    ON CONFLICT (user_trade_id, signal_update_id) DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS apply_take_profit_update_to_trades ON public.signal_take_profit_updates;
CREATE TRIGGER apply_take_profit_update_to_trades
AFTER INSERT ON public.signal_take_profit_updates
FOR EACH ROW
EXECUTE FUNCTION public.apply_take_profit_update_to_user_trades();

-- 6) Keep trade creation and closure functions aware of remaining/realized fields.
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

CREATE OR REPLACE FUNCTION public.close_trades_for_signal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  trade_record RECORD;
  rr_ratio DECIMAL;
  final_pnl DECIMAL;
  delta_to_apply DECIMAL;
BEGIN
  IF NEW.status IN ('tp_hit', 'sl_hit', 'breakeven') AND OLD.status = 'active' THEN
    IF NEW.direction = 'BUY' THEN
      IF (NEW.entry_price - NEW.stop_loss) != 0 THEN
        rr_ratio := ABS((NEW.take_profit - NEW.entry_price) / (NEW.entry_price - NEW.stop_loss));
      ELSE
        rr_ratio := 1;
      END IF;
    ELSE
      IF (NEW.stop_loss - NEW.entry_price) != 0 THEN
        rr_ratio := ABS((NEW.entry_price - NEW.take_profit) / (NEW.stop_loss - NEW.entry_price));
      ELSE
        rr_ratio := 1;
      END IF;
    END IF;

    FOR trade_record IN
      SELECT *
      FROM public.user_trades
      WHERE signal_id = NEW.id
        AND result = 'pending'
    LOOP
      IF NEW.status = 'tp_hit' THEN
        final_pnl := COALESCE(trade_record.pnl, 0) + (COALESCE(trade_record.remaining_risk_amount, trade_record.risk_amount) * rr_ratio);
      ELSIF NEW.status = 'breakeven' THEN
        final_pnl := COALESCE(trade_record.pnl, 0);
      ELSE
        final_pnl := COALESCE(trade_record.pnl, 0) - COALESCE(trade_record.remaining_risk_amount, trade_record.risk_amount);
      END IF;

      delta_to_apply := final_pnl - COALESCE(trade_record.pnl, 0);

      UPDATE public.user_trades
      SET
        result = CASE
          WHEN NEW.status = 'tp_hit' THEN 'win'
          WHEN NEW.status = 'sl_hit' THEN 'loss'
          ELSE 'breakeven'
        END,
        pnl = final_pnl,
        remaining_risk_amount = 0,
        closed_at = now()
      WHERE id = trade_record.id;

      IF delta_to_apply <> 0 THEN
        UPDATE public.profiles
        SET
          account_balance = account_balance + delta_to_apply,
          updated_at = now()
        WHERE user_id = trade_record.user_id;
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
