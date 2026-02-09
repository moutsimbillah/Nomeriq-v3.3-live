import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Signal, SignalStatus } from '@/types/database';
import { useAuth } from '@/contexts/AuthContext';

interface UseProviderSignalsOptions {
  status?: SignalStatus | SignalStatus[];
  signalType?: 'signal' | 'upcoming' | 'all';
  limit?: number;
  realtime?: boolean;
}

/**
 * Hook to fetch signals created by the current provider only
 * Used for signal_provider_admin role to isolate their data
 */
export const useProviderSignals = (options: UseProviderSignalsOptions = {}) => {
  const { status, signalType = 'all', limit = 100, realtime = true } = options;
  const [signals, setSignals] = useState<Signal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const { user, isAdmin } = useAuth();
  
  const channelNameRef = useRef(
    `provider_signals_${Math.random().toString(36).slice(2)}`
  );

  const fetchSignals = useCallback(async () => {
    if (!user?.id) {
      setIsLoading(false);
      return;
    }

    try {
      let query = supabase
        .from('signals')
        .select('*')
        .eq('created_by', user.id) // Only fetch signals created by this provider
        .order('created_at', { ascending: false })
        .limit(limit);

      if (status) {
        if (Array.isArray(status)) {
          query = query.in('status', status);
        } else {
          query = query.eq('status', status);
        }
      }

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;
      
      let newSignals = (data as unknown as Signal[]) || [];
      
      if (signalType !== 'all') {
        newSignals = newSignals.filter(s => s.signal_type === signalType);
      }
      
      setSignals(newSignals);
      setError(null);
    } catch (err) {
      setError(err as Error);
      console.error('Error fetching provider signals:', err);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, status, signalType, limit]);

  useEffect(() => {
    if (!isAdmin) {
      setIsLoading(false);
      return;
    }

    fetchSignals();

    if (realtime) {
      const channel = supabase
        .channel(channelNameRef.current)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'signals',
            filter: `created_by=eq.${user?.id}`,
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
  }, [isAdmin, fetchSignals, realtime, user?.id]);

  return { signals, isLoading, error, refetch: fetchSignals };
};
