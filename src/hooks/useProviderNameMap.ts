import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type ProviderNameMap = Record<string, string>;

const toDisplayName = (profile: {
  first_name: string | null;
  last_name: string | null;
  email: string | null;
}) => {
  const full = `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim();
  if (full) return full;
  if (profile.email) return profile.email.split("@")[0];
  return "Unknown";
};

export const useProviderNameMap = (providerIds: string[]) => {
  const [providerNameMap, setProviderNameMap] = useState<ProviderNameMap>({});

  const uniqueIds = useMemo(
    () => Array.from(new Set(providerIds.filter(Boolean))).sort(),
    [providerIds.join("|")],
  );
  const uniqueIdsKey = uniqueIds.join("|");

  const mapsAreEqual = (a: ProviderNameMap, b: ProviderNameMap) => {
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) return false;
    for (const key of aKeys) {
      if (a[key] !== b[key]) return false;
    }
    return true;
  };

  useEffect(() => {
    let isMounted = true;

    const fetchNames = async () => {
      if (uniqueIds.length === 0) {
        if (isMounted) {
          setProviderNameMap((prev) => (Object.keys(prev).length === 0 ? prev : {}));
        }
        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, first_name, last_name, email")
        .in("user_id", uniqueIds);

      if (error) return;
      if (!isMounted) return;

      const map: ProviderNameMap = {};
      (data || []).forEach((p) => {
        map[p.user_id] = toDisplayName({
          first_name: p.first_name,
          last_name: p.last_name,
          email: p.email,
        });
      });
      setProviderNameMap((prev) => (mapsAreEqual(prev, map) ? prev : map));
    };

    void fetchNames();
    return () => {
      isMounted = false;
    };
  }, [uniqueIdsKey]);

  return providerNameMap;
};
