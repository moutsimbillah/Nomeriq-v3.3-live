-- Migration: Add RPC function for searching market pairs
-- This function is used by the signal creation form to autocomplete pairs

CREATE OR REPLACE FUNCTION public.search_market_pairs(
  _category TEXT DEFAULT NULL,
  _query TEXT DEFAULT NULL,
  _mode TEXT DEFAULT 'manual'
)
RETURNS TABLE (
  symbol TEXT,
  twelve_data_symbol TEXT,
  category TEXT,
  provider TEXT,
  is_active BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- For manual mode, return empty (manual entry)
  IF _mode = 'manual' THEN
    RETURN;
  END IF;

  -- For live mode, return pairs from market_symbol_map
  RETURN QUERY
  SELECT 
    msm.symbol,
    msm.twelve_data_symbol,
    msm.category,
    msm.provider,
    msm.is_active
  FROM public.market_symbol_map msm
  WHERE msm.is_active = true
    AND (_category IS NULL OR msm.category = _category)
    AND (_query IS NULL OR 
         LOWER(msm.symbol) LIKE LOWER('%' || _query || '%') OR
         LOWER(msm.twelve_data_symbol) LIKE LOWER('%' || _query || '%'))
  ORDER BY msm.symbol
  LIMIT 100;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.search_market_pairs TO authenticated;
