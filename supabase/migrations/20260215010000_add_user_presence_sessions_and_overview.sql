-- Stable presence/session metrics:
-- 1) Persist user session start/heartbeat/end in DB
-- 2) Compute server-side daily average session time and online users

CREATE TABLE IF NOT EXISTS public.user_presence_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  session_id TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_presence_sessions_user_session_unique UNIQUE (user_id, session_id),
  CONSTRAINT user_presence_sessions_last_seen_after_start CHECK (last_seen_at >= started_at),
  CONSTRAINT user_presence_sessions_end_after_start CHECK (ended_at IS NULL OR ended_at >= started_at)
);

CREATE INDEX IF NOT EXISTS user_presence_sessions_user_idx
  ON public.user_presence_sessions (user_id);

CREATE INDEX IF NOT EXISTS user_presence_sessions_last_seen_idx
  ON public.user_presence_sessions (last_seen_at DESC);

CREATE INDEX IF NOT EXISTS user_presence_sessions_started_idx
  ON public.user_presence_sessions (started_at DESC);

DROP TRIGGER IF EXISTS update_user_presence_sessions_updated_at ON public.user_presence_sessions;
CREATE TRIGGER update_user_presence_sessions_updated_at
BEFORE UPDATE ON public.user_presence_sessions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.user_presence_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own presence sessions" ON public.user_presence_sessions;
CREATE POLICY "Users can manage own presence sessions"
ON public.user_presence_sessions
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can view all presence sessions" ON public.user_presence_sessions;
CREATE POLICY "Admins can view all presence sessions"
ON public.user_presence_sessions
FOR SELECT
USING (public.is_any_admin(auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE OR REPLACE FUNCTION public.upsert_user_presence_session(
  p_session_id TEXT,
  p_started_at TIMESTAMPTZ DEFAULT now(),
  p_last_seen_at TIMESTAMPTZ DEFAULT now()
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_started_at TIMESTAMPTZ := COALESCE(p_started_at, now());
  v_last_seen_at TIMESTAMPTZ := COALESCE(p_last_seen_at, now());
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_session_id IS NULL OR btrim(p_session_id) = '' THEN
    RAISE EXCEPTION 'session_id is required';
  END IF;

  IF v_last_seen_at < v_started_at THEN
    v_last_seen_at := v_started_at;
  END IF;

  INSERT INTO public.user_presence_sessions (
    user_id,
    session_id,
    started_at,
    last_seen_at,
    ended_at
  )
  VALUES (
    v_user_id,
    p_session_id,
    v_started_at,
    v_last_seen_at,
    NULL
  )
  ON CONFLICT (user_id, session_id)
  DO UPDATE
  SET
    started_at = LEAST(public.user_presence_sessions.started_at, EXCLUDED.started_at),
    last_seen_at = GREATEST(public.user_presence_sessions.last_seen_at, EXCLUDED.last_seen_at),
    ended_at = NULL,
    updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.close_user_presence_session(
  p_session_id TEXT,
  p_ended_at TIMESTAMPTZ DEFAULT now()
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_ended_at TIMESTAMPTZ := COALESCE(p_ended_at, now());
BEGIN
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  IF p_session_id IS NULL OR btrim(p_session_id) = '' THEN
    RETURN;
  END IF;

  UPDATE public.user_presence_sessions
  SET
    last_seen_at = GREATEST(last_seen_at, v_ended_at),
    ended_at = GREATEST(COALESCE(ended_at, v_ended_at), v_ended_at),
    updated_at = now()
  WHERE user_id = v_user_id
    AND session_id = p_session_id;
END;
$$;

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
  v_total_users INTEGER := GREATEST(COALESCE(p_total_users, 0), 0);
  v_online_user_ids UUID[] := ARRAY[]::UUID[];
  v_online_users INTEGER := 0;
  v_avg_session_seconds NUMERIC := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN QUERY
    SELECT ARRAY[]::UUID[], 0, v_total_users, 0::NUMERIC;
    RETURN;
  END IF;

  IF NOT (public.is_any_admin(auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role)) THEN
    RETURN QUERY
    SELECT ARRAY[auth.uid()]::UUID[], 1, GREATEST(v_total_users - 1, 0), 0::NUMERIC;
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
  SELECT COALESCE(AVG(seconds), 0)::NUMERIC
  INTO v_avg_session_seconds
  FROM user_totals;

  RETURN QUERY
  SELECT
    v_online_user_ids,
    v_online_users,
    GREATEST(v_total_users - v_online_users, 0),
    COALESCE(v_avg_session_seconds, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_user_presence_session(TEXT, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.close_user_presence_session(TEXT, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_presence_overview(INTEGER, TIMESTAMPTZ, INTEGER) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.upsert_user_presence_session(TEXT, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_user_presence_session(TEXT, TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION public.close_user_presence_session(TEXT, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_user_presence_session(TEXT, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_presence_overview(INTEGER, TIMESTAMPTZ, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_presence_overview(INTEGER, TIMESTAMPTZ, INTEGER) TO service_role;

NOTIFY pgrst, 'reload schema';
