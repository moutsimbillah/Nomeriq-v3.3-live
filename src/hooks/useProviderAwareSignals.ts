import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Signal, SignalStatus } from '@/types/database';
import { useAuth } from '@/contexts/AuthContext';
import { useAdminRole } from './useAdminRole';
import { useUserSubscriptionCategories } from './useSubscriptionPackages';
import { shouldSuppressQueryErrorLog } from '@/lib/queryStability';

interface UseProviderAwareSignalsOptions {
  status?: SignalStatus | SignalStatus[];
  signalType?: 'signal' | 'upcoming' | 'all';
  limit?: number;
  realtime?: boolean;
  adminGlobalView?: boolean;
}

/**
 * Hook that fetches signals with provider-aware filtering.
 * Default behavior:
 * - Providers/admins: only their own issued signals.
 * - Regular users: signals limited by subscription categories.
 * Set adminGlobalView=true to intentionally fetch global admin data.
 */
export const useProviderAwareSignals = (options: UseProviderAwareSignalsOptions = {}) => {
  const { status, signalType = 'all', limit = 50, realtime = true, adminGlobalView = false } = options;
  const [signals, setSignals] = useState<Signal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const { user, hasActiveSubscription, isAdmin } = useAuth();
  const userId = user?.id ?? null;
  const { isProvider, isLoading: roleLoading } = useAdminRole();
  const { allowedCategories } = useUserSubscriptionCategories();

  const channelNameRef = useRef(
    `provider_aware_signals_${Math.random().toString(36).slice(2)}`
  );

  // Prevent "blinking" loaders on realtime updates
  const hasLoadedOnceRef = useRef(false);

  const fetchSignals = useCallback(async () => {
    if (roleLoading) return;

    try {
      // Only show the big loader on the very first load.
      if (!hasLoadedOnceRef.current) setIsLoading(true);

      const cacheKey = [
        userId ?? 'anon',
        isProvider ? 'provider' : 'user',
        isAdmin ? 'admin' : 'member',
        adminGlobalView ? 'admin_global' : 'scoped',
        signalType,
        Array.isArray(status) ? status.join(',') : status ?? 'all',
        limit,
        allowedCategories.join(','),
      ].join(':');
      const now = Date.now();
      const cacheStore = ((globalThis as any).__provider_aware_signals_cache ??=
        {}) as Record<
        string,
        { ts: number; data: Signal[]; inflight?: Promise<Signal[]> }
      >;
      const cached = cacheStore[cacheKey];

      if (cached && now - cached.ts < 1200) {
        setSignals(cached.data);
        setError(null);
        hasLoadedOnceRef.current = true;
        return;
      }
      if (cached?.inflight) {
        const value = await cached.inflight;
        setSignals(value);
        setError(null);
        hasLoadedOnceRef.current = true;
        return;
      }

      const inflight = (async () => {
        let query = supabase
          .from('signals')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(limit);

        // Explicit global mode for admin analytics only.
        if (adminGlobalView && isAdmin) {
          // No created_by/category filters.
        } else if ((isProvider || isAdmin) && userId) {
          // Provider-aware default: admins/providers see only their own issued signals.
          query = query.eq('created_by', userId);
        } else if (!isProvider && !isAdmin && allowedCategories.length > 0) {
          // Regular users should only fetch categories they are subscribed to.
          query = query.in('category', allowedCategories);
        }

        // Signal type filtering: upcoming signals are identified either by explicit signal_type
        // OR by having an upcoming_status set (legacy/alternate data shape).
        if (signalType !== 'all') {
          if (signalType === 'upcoming') {
            query = query.or('signal_type.eq.upcoming,upcoming_status.not.is.null');
          } else {
            // Regular active signals: exclude upcoming_status-based rows
            query = query.or('signal_type.eq.signal,upcoming_status.is.null');
          }
        }

        if (status) {
          if (Array.isArray(status)) {
            query = query.in('status', status);
          } else {
            query = query.eq('status', status);
          }
        }

        const { data, error: fetchError } = await query;

        if (fetchError) throw fetchError;

        return (data as unknown as Signal[]) || [];
      })();

      cacheStore[cacheKey] = {
        ts: cached?.ts ?? 0,
        data: cached?.data ?? [],
        inflight,
      };

      const newSignals = await inflight;
      cacheStore[cacheKey] = {
        ts: Date.now(),
        data: newSignals,
      };

      setSignals(newSignals);
      setError(null);
      hasLoadedOnceRef.current = true;
    } catch (err) {
      setError(err as Error);
      if (!shouldSuppressQueryErrorLog(err)) {
        console.error('Error fetching provider-aware signals:', err);
      }
    } finally {
      setIsLoading(false);
    }
  }, [status, signalType, limit, isProvider, isAdmin, adminGlobalView, allowedCategories, userId, roleLoading]);

  useEffect(() => {
    if (!hasActiveSubscription && !isAdmin) {
      setIsLoading(false);
      return;
    }

    if (!roleLoading) {
      fetchSignals();
    }
  }, [hasActiveSubscription, isAdmin, fetchSignals, roleLoading]);

  useEffect(() => {
    if (realtime && !roleLoading) {
      const channel = supabase
        .channel(channelNameRef.current)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'signals',
          },
          () => {
            fetchSignals();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [fetchSignals, realtime, roleLoading]);

  return { signals, isLoading: isLoading || roleLoading, error, refetch: fetchSignals, isProvider };
};
