-- Phase 1 accuracy guardrails:
-- 1) Enforce global_settings as a true singleton table.
-- 2) Provide canonical trade KPI function to keep formulas consistent across pages.

-- Keep only one global_settings row (latest by updated_at) before enforcing singleton.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (ORDER BY updated_at DESC, id DESC) AS rn
  FROM public.global_settings
)
DELETE FROM public.global_settings gs
USING ranked r
WHERE gs.id = r.id
  AND r.rn > 1;

ALTER TABLE public.global_settings
  ADD COLUMN IF NOT EXISTS singleton_key BOOLEAN NOT NULL DEFAULT TRUE;

UPDATE public.global_settings
SET singleton_key = TRUE
WHERE singleton_key IS DISTINCT FROM TRUE;

ALTER TABLE public.global_settings
  DROP CONSTRAINT IF EXISTS global_settings_singleton_key_true;

ALTER TABLE public.global_settings
  ADD CONSTRAINT global_settings_singleton_key_true
  CHECK (singleton_key = TRUE);

DROP INDEX IF EXISTS global_settings_singleton_idx;
CREATE UNIQUE INDEX global_settings_singleton_idx
  ON public.global_settings (singleton_key);

-- Canonical KPI function:
-- win_rate_percent = wins / (wins + losses) * 100
-- (breakeven is excluded from denominator by design).
CREATE OR REPLACE FUNCTION public.get_trade_kpis(
  p_user_id UUID DEFAULT NULL,
  p_provider_id UUID DEFAULT NULL,
  p_categories TEXT[] DEFAULT NULL
)
RETURNS TABLE (
  total_trades BIGINT,
  wins BIGINT,
  losses BIGINT,
  breakeven BIGINT,
  pending BIGINT,
  closed_trades BIGINT,
  win_rate_percent NUMERIC,
  total_pnl NUMERIC
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH scoped AS (
    SELECT
      ut.result,
      COALESCE(ut.pnl, 0)::NUMERIC AS pnl
    FROM public.user_trades ut
    LEFT JOIN public.signals s
      ON s.id = ut.signal_id
    WHERE
      (p_user_id IS NULL OR ut.user_id = p_user_id)
      AND (p_provider_id IS NULL OR s.created_by = p_provider_id)
      AND (
        p_categories IS NULL
        OR cardinality(p_categories) = 0
        OR s.category = ANY(p_categories)
      )
  ),
  agg AS (
    SELECT
      COUNT(*)::BIGINT AS total_trades,
      COUNT(*) FILTER (WHERE result = 'win')::BIGINT AS wins,
      COUNT(*) FILTER (WHERE result = 'loss')::BIGINT AS losses,
      COUNT(*) FILTER (WHERE result = 'breakeven')::BIGINT AS breakeven,
      COUNT(*) FILTER (WHERE result = 'pending')::BIGINT AS pending,
      COALESCE(SUM(pnl), 0)::NUMERIC AS total_pnl
    FROM scoped
  )
  SELECT
    a.total_trades,
    a.wins,
    a.losses,
    a.breakeven,
    a.pending,
    (a.wins + a.losses + a.breakeven)::BIGINT AS closed_trades,
    CASE
      WHEN (a.wins + a.losses) > 0
        THEN (a.wins::NUMERIC * 100) / (a.wins + a.losses)
      ELSE 0::NUMERIC
    END AS win_rate_percent,
    a.total_pnl
  FROM agg a;
$$;

GRANT EXECUTE ON FUNCTION public.get_trade_kpis(UUID, UUID, TEXT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_trade_kpis(UUID, UUID, TEXT[]) TO service_role;

NOTIFY pgrst, 'reload schema';
