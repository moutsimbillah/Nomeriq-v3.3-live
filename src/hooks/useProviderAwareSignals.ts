import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Signal, SignalStatus } from '@/types/database';
import { useAuth } from '@/contexts/AuthContext';
import { useAdminRole } from './useAdminRole';

interface UseProviderAwareSignalsOptions {
  status?: SignalStatus | SignalStatus[];
  signalType?: 'signal' | 'upcoming' | 'all';
  limit?: number;
  realtime?: boolean;
}

/**
 * Hook that fetches signals with provider-aware filtering.
 * If the user is an admin/signal provider, only fetches their own signals.
 * Regular users see all signals as normal.
 */
export const useProviderAwareSignals = (options: UseProviderAwareSignalsOptions = {}) => {
  const { status, signalType = 'all', limit = 50, realtime = true } = options;
  const [signals, setSignals] = useState<Signal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const { user, hasActiveSubscription, isAdmin } = useAuth();
  const { isProvider, isLoading: roleLoading } = useAdminRole();

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

      let query = supabase
        .from('signals')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      // If user is a provider, filter to only their signals
      if (isProvider && user) {
        query = query.eq('created_by', user.id);
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

      const newSignals = (data as unknown as Signal[]) || [];

      setSignals(newSignals);
      setError(null);
      hasLoadedOnceRef.current = true;
    } catch (err) {
      setError(err as Error);
      console.error('Error fetching provider-aware signals:', err);
    } finally {
      setIsLoading(false);
    }
  }, [status, signalType, limit, isProvider, user, roleLoading]);

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
