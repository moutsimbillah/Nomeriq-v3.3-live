-- Global advisory lock helpers used by the quote edge function.
-- Ensures only one requester refreshes external market quotes at a time.

CREATE OR REPLACE FUNCTION public.try_acquire_market_quote_refresh_lock()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN pg_try_advisory_lock(620260219001);
END;
$$;

CREATE OR REPLACE FUNCTION public.release_market_quote_refresh_lock()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN pg_advisory_unlock(620260219001);
END;
$$;

REVOKE ALL ON FUNCTION public.try_acquire_market_quote_refresh_lock() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_market_quote_refresh_lock() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.try_acquire_market_quote_refresh_lock() TO service_role;
GRANT EXECUTE ON FUNCTION public.release_market_quote_refresh_lock() TO service_role;

NOTIFY pgrst, 'reload schema';
