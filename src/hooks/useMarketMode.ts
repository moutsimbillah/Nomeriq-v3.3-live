import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { MarketMode } from "@/types/database";

export function useMarketMode() {
  const { data: mode, isLoading } = useQuery({
    queryKey: ["market-mode"],
    queryFn: async (): Promise<MarketMode> => {
      const { data, error } = await supabase.rpc("get_market_mode");
      if (error) return "manual";
      return (data === "live" ? "live" : "manual") as MarketMode;
    },
    staleTime: 60 * 1000,
  });
  return { marketMode: mode ?? "manual", isLoading };
}
