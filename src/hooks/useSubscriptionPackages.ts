import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  SubscriptionPackage,
  SubscriptionPackageFeature,
  Subscription,
  SignalCategory,
} from '@/types/database';
import { useAuth } from '@/contexts/AuthContext';
import { shouldSuppressQueryErrorLog } from '@/lib/queryStability';
import { pickPrimarySubscription } from '@/lib/subscription-selection';

export interface SubscriptionPackageWithFeatures extends SubscriptionPackage {
  features: SubscriptionPackageFeature[];
}

const toFiniteNumber = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const comparePackagesLowToHigh = (
  a: SubscriptionPackageWithFeatures,
  b: SubscriptionPackageWithFeatures
): number => {
  const priceDiff =
    toFiniteNumber(a.price, Number.MAX_SAFE_INTEGER) -
    toFiniteNumber(b.price, Number.MAX_SAFE_INTEGER);
  if (priceDiff !== 0) return priceDiff;

  const durationDiff =
    toFiniteNumber((a as { duration_months?: unknown }).duration_months, Number.MAX_SAFE_INTEGER) -
    toFiniteNumber((b as { duration_months?: unknown }).duration_months, Number.MAX_SAFE_INTEGER);
  if (durationDiff !== 0) return durationDiff;

  const sortOrderDiff =
    toFiniteNumber(a.sort_order, Number.MAX_SAFE_INTEGER) -
    toFiniteNumber(b.sort_order, Number.MAX_SAFE_INTEGER);
  if (sortOrderDiff !== 0) return sortOrderDiff;

  return String(a.name ?? '').localeCompare(String(b.name ?? ''));
};

interface UseSubscriptionPackagesOptions {
  /** When 'all', returns every package (for admin). Default 'active' for user-facing lists. */
  statusFilter?: 'active' | 'all';
}

interface UseSubscriptionPackagesResult {
  packages: SubscriptionPackageWithFeatures[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export const useSubscriptionPackages = (
  options: UseSubscriptionPackagesOptions = {}
): UseSubscriptionPackagesResult => {
  const { statusFilter = 'active' } = options;
  const [packages, setPackages] = useState<SubscriptionPackageWithFeatures[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchPackages = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      let query = supabase
        .from('subscription_packages')
        .select('*')
        .order('sort_order', { ascending: true });
      if (statusFilter === 'active') {
        query = query.eq('status', 'active');
      }
      const { data: packageRows, error: pkgError } = await query;

      if (pkgError) throw pkgError;

      const packageIds = (packageRows ?? []).map((p) => p.id);

      const { data: featureRows, error: featError } = await supabase
        .from('subscription_package_features')
        .select('*')
        .in('package_id', packageIds.length ? packageIds : ['00000000-0000-0000-0000-000000000000'])
        .order('sort_order', { ascending: true });

      if (featError) throw featError;

      const featureMap = new Map<string, SubscriptionPackageFeature[]>();
      (featureRows ?? []).forEach((f) => {
        const list = featureMap.get(f.package_id) ?? [];
        list.push(f as SubscriptionPackageFeature);
        featureMap.set(f.package_id, list);
      });

      const withFeatures: SubscriptionPackageWithFeatures[] = [];
      for (const p of packageRows ?? []) {
        try {
          const pkg = p as Record<string, unknown>;
          const raw = pkg.categories;
          const categories = Array.isArray(raw)
            ? (raw.filter(Boolean) as SignalCategory[])
            : [];
          withFeatures.push({
            ...(pkg as SubscriptionPackage),
            categories,
            features: featureMap.get(pkg.id as string) ?? [],
          });
        } catch (_) {
          // skip malformed row
        }
      }

      setPackages([...withFeatures].sort(comparePackagesLowToHigh));
    } catch (err) {
      console.error('Error fetching subscription packages:', err);
      setError(err as Error);
      setPackages([]);
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchPackages();
  }, [fetchPackages]);

  return { packages, isLoading, error, refetch: fetchPackages };
};

export interface UserSubscriptionWithPackage extends Subscription {
  package?: SubscriptionPackage | null;
}

interface UseUserSubscriptionResult {
  subscription: UserSubscriptionWithPackage | null;
  hasActiveSubscription: boolean;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export const useUserSubscription = (): UseUserSubscriptionResult => {
  const { user } = useAuth();
  const [subscription, setSubscription] = useState<UserSubscriptionWithPackage | null>(
    null
  );
  const [isLoading, setIsLoading] = useState<boolean>(!!user);
  const [error, setError] = useState<Error | null>(null);
  const userId = user?.id ?? null;

  const fetchSubscription = useCallback(async () => {
    if (!userId) {
      setSubscription(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const { data: subRows, error: subError } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false });

      if (subError) throw subError;

      const subRow = pickPrimarySubscription((subRows || []) as Subscription[]);
      if (!subRow) {
        setSubscription(null);
        setError(null);
        setIsLoading(false);
        return;
      }

      let pkg: SubscriptionPackage | null = null;

      if (subRow.package_id) {
        const { data: pkgRow, error: pkgError } = await supabase
          .from('subscription_packages')
          .select('*')
          .eq('id', subRow.package_id)
          .maybeSingle();

        if (pkgError) throw pkgError;
        pkg = (pkgRow ?? null) as SubscriptionPackage | null;
      }

      setSubscription({
        ...(subRow as Subscription),
        package: pkg,
      });
      setError(null);
    } catch (err) {
      if (!shouldSuppressQueryErrorLog(err)) {
        console.error('Error fetching user subscription:', err);
      }
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchSubscription();
  }, [fetchSubscription]);

  const hasActiveSubscription =
    !!subscription &&
    subscription.status === 'active' &&
    (!subscription.expires_at ||
      new Date(subscription.expires_at) > new Date());

  return {
    subscription,
    hasActiveSubscription,
    isLoading,
    error,
    refetch: fetchSubscription,
  };
}

export interface UseUserSubscriptionsResult {
  subscriptions: UserSubscriptionWithPackage[];
  activeSubscriptions: UserSubscriptionWithPackage[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export const useUserSubscriptions = (): UseUserSubscriptionsResult => {
  const { user } = useAuth();
  const [subscriptions, setSubscriptions] = useState<UserSubscriptionWithPackage[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(!!user);
  const [error, setError] = useState<Error | null>(null);
  const userId = user?.id ?? null;

  const fetchSubscriptions = useCallback(async () => {
    if (!userId) {
      setSubscriptions([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const cacheKey = `user_subscriptions_${userId}`;
      const now = Date.now();
      const existing = (globalThis as any)[cacheKey] as
        | {
            value: UserSubscriptionWithPackage[];
            expiresAt: number;
            inflight?: Promise<UserSubscriptionWithPackage[]>;
          }
        | undefined;

      if (existing && existing.expiresAt > now) {
        setSubscriptions(existing.value);
        setError(null);
        setIsLoading(false);
        return;
      }

      if (existing?.inflight) {
        const value = await existing.inflight;
        setSubscriptions(value);
        setError(null);
        setIsLoading(false);
        return;
      }

      const inflight = (async (): Promise<UserSubscriptionWithPackage[]> => {
        const { data: subRows, error: subError } = await supabase
          .from('subscriptions')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false });

        if (subError) throw subError;

        if (!subRows || subRows.length === 0) return [];

        const packageIds = subRows
          .map((s) => s.package_id)
          .filter((id): id is string => !!id);

        const packagesById = new Map<string, SubscriptionPackage>();

        if (packageIds.length > 0) {
          const { data: pkgRows, error: pkgError } = await supabase
            .from('subscription_packages')
            .select('*')
            .in('id', packageIds);

          if (pkgError) throw pkgError;

          (pkgRows ?? []).forEach((p) => {
            packagesById.set(p.id, p as SubscriptionPackage);
          });
        }

        return subRows.map((s) => ({
          ...(s as Subscription),
          package: s.package_id ? packagesById.get(s.package_id) ?? null : null,
        }));
      })();

      (globalThis as any)[cacheKey] = {
        value: existing?.value ?? [],
        expiresAt: now + 10_000,
        inflight,
      };

      const withPackages = await inflight;
      (globalThis as any)[cacheKey] = {
        value: withPackages,
        expiresAt: Date.now() + 10_000,
      };

      setSubscriptions(withPackages);
      setError(null);
    } catch (err) {
      if (!shouldSuppressQueryErrorLog(err)) {
        console.error('Error fetching user subscriptions:', err);
      }
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchSubscriptions();
  }, [fetchSubscriptions]);

  const now = new Date();
  const activeSubscriptions = subscriptions
    .filter((sub) => {
      if (sub.status !== 'active') return false;
      if (!sub.expires_at) return true;
      return new Date(sub.expires_at) > now;
    })
    .sort((a, b) => {
      const aExp = a.expires_at
        ? new Date(a.expires_at).getTime()
        : Number.MAX_SAFE_INTEGER;
      const bExp = b.expires_at
        ? new Date(b.expires_at).getTime()
        : Number.MAX_SAFE_INTEGER;
      return bExp - aExp;
    });

  return {
    subscriptions,
    activeSubscriptions,
    isLoading,
    error,
    refetch: fetchSubscriptions,
  };
};

export const useUserSubscriptionCategories = () => {
  const { user } = useAuth();
  const [allowedCategories, setAllowedCategories] = useState<SignalCategory[]>([
    "Forex",
    "Metals",
    "Crypto",
    "Indices",
    "Commodities",
  ]);

  // Shared cache to avoid dozens of duplicate requests across dashboard hooks/components.
  // key: user_id
  const cacheKey = user?.id ?? "";
  const cache = (globalThis as any).__allowed_categories_cache as
    | {
        key: string;
        value: SignalCategory[];
        expiresAt: number;
        inflight?: Promise<SignalCategory[]>;
      }
    | undefined;

  const fetchAllowedCategories = useCallback(async (): Promise<SignalCategory[]> => {
    if (!user?.id) {
      return ["Forex", "Metals", "Crypto", "Indices", "Commodities"];
    }

    const now = Date.now();
    const existing = (globalThis as any).__allowed_categories_cache as
      | {
          key: string;
          value: SignalCategory[];
          expiresAt: number;
          inflight?: Promise<SignalCategory[]>;
        }
      | undefined;

    if (existing && existing.key === user.id && existing.expiresAt > now && existing.value.length > 0) {
      return existing.value;
    }
    if (existing && existing.key === user.id && existing.inflight) {
      return existing.inflight;
    }

    const inflight = (async () => {
      const { data: subRows, error: subError } = await supabase
        .from('subscriptions')
        .select('package_id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .or('expires_at.is.null,expires_at.gt.now()');

      if (subError) throw subError;

      const packageIds = (subRows || [])
        .map((r) => r.package_id)
        .filter((id): id is string => !!id);

      if (packageIds.length === 0) {
        return [] as SignalCategory[];
      }

      const { data: pkgRows, error: pkgError } = await supabase
        .from('subscription_packages')
        .select('categories')
        .in('id', packageIds);

      if (pkgError) throw pkgError;

      const merged = Array.from(
        new Set(
          (pkgRows || []).flatMap((pkg: any) =>
            Array.isArray(pkg.categories) && pkg.categories.length > 0
              ? (pkg.categories as SignalCategory[])
              : (["Forex", "Metals", "Crypto", "Indices", "Commodities"] as SignalCategory[])
          )
        )
      ) as SignalCategory[];

      return merged;
    })();

    (globalThis as any).__allowed_categories_cache = {
      key: user.id,
      value: existing?.value ?? [],
      expiresAt: now + 15_000,
      inflight,
    };

    try {
      const value = await inflight;
      (globalThis as any).__allowed_categories_cache = {
        key: user.id,
        value,
        expiresAt: Date.now() + 15_000,
      };
      return value;
    } catch (err) {
      // Keep old cache if available to prevent UI thrash during transient 503/abort errors.
      if (existing && existing.key === user.id && existing.value.length > 0) {
        return existing.value;
      }
      throw err;
    }
  }, [user?.id]);

  useEffect(() => {
    let active = true;
    fetchAllowedCategories()
      .then((cats) => {
        if (!active) return;
        setAllowedCategories(
          cats.length > 0
            ? cats
            : ["Forex", "Metals", "Crypto", "Indices", "Commodities"]
        );
      })
      .catch((err) => {
        if (!shouldSuppressQueryErrorLog(err)) {
          console.error("Error fetching allowed categories:", err);
        }
      });

    return () => {
      active = false;
    };
  }, [fetchAllowedCategories]);

  const stableAllowedCategories = useMemo(
    () => [...allowedCategories].sort(),
    [allowedCategories]
  );

  return {
    allowedCategories: stableAllowedCategories,
  };
};
