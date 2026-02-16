-- Make Avg Time/Day explicit and stable:
-- Average session seconds across ALL registered users (profiles),
-- not only users with activity today.

CREATE OR REPLACE FUNCTION public.get_presence_overview(
  p_total_users INTEGER DEFAULT NULL,
  p_day_start TIMESTAMPTZ DEFAULT NULL,
  p_online_ttl_seconds INTEGER DEFAULT 45
)
RETURNS TABLE (
  online_user_ids UUID[],
  online_users INTEGER,
  offline_users INTEGER,
  avg_session_seconds NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now TIMESTAMPTZ := now();
  v_day_start TIMESTAMPTZ := COALESCE(p_day_start, date_trunc('day', now()));
  v_ttl INTERVAL := make_interval(secs => GREATEST(COALESCE(p_online_ttl_seconds, 45), 5));
  v_total_users INTEGER := 0;
  v_online_user_ids UUID[] := ARRAY[]::UUID[];
  v_online_users INTEGER := 0;
  v_total_session_seconds NUMERIC := 0;
  v_avg_session_seconds NUMERIC := 0;
  v_self_online BOOLEAN := FALSE;
BEGIN
  SELECT COUNT(*)::INTEGER
  INTO v_total_users
  FROM public.profiles;

  v_total_users := GREATEST(v_total_users, 0);

  IF auth.uid() IS NULL THEN
    RETURN QUERY
    SELECT ARRAY[]::UUID[], 0, v_total_users, 0::NUMERIC;
    RETURN;
  END IF;

  IF NOT (public.is_any_admin(auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role)) THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.user_presence_sessions s
      WHERE s.user_id = auth.uid()
        AND s.last_seen_at >= (v_now - v_ttl)
        AND (s.ended_at IS NULL OR s.ended_at >= s.last_seen_at)
    )
    INTO v_self_online;

    RETURN QUERY
    SELECT
      CASE WHEN v_self_online THEN ARRAY[auth.uid()]::UUID[] ELSE ARRAY[]::UUID[] END,
      CASE WHEN v_self_online THEN 1 ELSE 0 END,
      GREATEST(v_total_users - CASE WHEN v_self_online THEN 1 ELSE 0 END, 0),
      0::NUMERIC;
    RETURN;
  END IF;

  SELECT COALESCE(array_agg(DISTINCT s.user_id), ARRAY[]::UUID[])
  INTO v_online_user_ids
  FROM public.user_presence_sessions s
  WHERE s.last_seen_at >= (v_now - v_ttl)
    AND (s.ended_at IS NULL OR s.ended_at >= s.last_seen_at);

  v_online_users := COALESCE(array_length(v_online_user_ids, 1), 0);

  WITH scoped AS (
    SELECT
      s.user_id,
      GREATEST(s.started_at, v_day_start) AS start_at,
      LEAST(COALESCE(s.ended_at, s.last_seen_at, v_now), v_now) AS end_at
    FROM public.user_presence_sessions s
    WHERE
      s.last_seen_at >= v_day_start
      OR s.started_at >= v_day_start
      OR (s.ended_at IS NOT NULL AND s.ended_at >= v_day_start)
  ),
  intervals AS (
    SELECT
      user_id,
      start_at,
      end_at
    FROM scoped
    WHERE end_at > start_at
  ),
  ordered AS (
    SELECT
      user_id,
      start_at,
      end_at,
      MAX(end_at) OVER (
        PARTITION BY user_id
        ORDER BY start_at, end_at
        ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
      ) AS prev_max_end
    FROM intervals
  ),
  grouped AS (
    SELECT
      user_id,
      start_at,
      end_at,
      SUM(
        CASE
          WHEN prev_max_end IS NULL OR start_at > prev_max_end THEN 1
          ELSE 0
        END
      ) OVER (
        PARTITION BY user_id
        ORDER BY start_at, end_at
      ) AS grp
    FROM ordered
  ),
  merged AS (
    SELECT
      user_id,
      grp,
      MIN(start_at) AS start_at,
      MAX(end_at) AS end_at
    FROM grouped
    GROUP BY user_id, grp
  ),
  user_totals AS (
    SELECT
      user_id,
      SUM(EXTRACT(EPOCH FROM (end_at - start_at)))::NUMERIC AS seconds
    FROM merged
    GROUP BY user_id
  )
  SELECT COALESCE(SUM(seconds), 0)::NUMERIC
  INTO v_total_session_seconds
  FROM user_totals;

  v_avg_session_seconds :=
    CASE
      WHEN v_total_users > 0 THEN v_total_session_seconds / v_total_users
      ELSE 0::NUMERIC
    END;

  RETURN QUERY
  SELECT
    v_online_user_ids,
    v_online_users,
    GREATEST(v_total_users - v_online_users, 0),
    COALESCE(v_avg_session_seconds, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_presence_overview(INTEGER, TIMESTAMPTZ, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_presence_overview(INTEGER, TIMESTAMPTZ, INTEGER) TO service_role;

NOTIFY pgrst, 'reload schema';
