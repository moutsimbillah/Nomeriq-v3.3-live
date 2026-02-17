-- RPC: Return current market mode for signal form (admins only need to know mode)
CREATE OR REPLACE FUNCTION public.get_market_mode()
RETURNS public.market_mode
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT mode FROM public.market_mode_settings LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.get_market_mode() TO authenticated;
