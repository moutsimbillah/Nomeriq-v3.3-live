import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Signal, SignalStatus } from '@/types/database';
import { useAuth } from '@/contexts/AuthContext';
import { useUserSubscriptionCategories } from './useSubscriptionPackages';
import { shouldSuppressQueryErrorLog } from '@/lib/queryStability';

interface UseSignalsOptions {
  status?: SignalStatus | SignalStatus[];
  signalType?: 'signal' | 'upcoming' | 'all';
  limit?: number;
  realtime?: boolean;
  categories?: string[]; // optional client-side category filter
}

export const useSignals = (options: UseSignalsOptions = {}) => {
  const { status, signalType = 'all', limit = 50, realtime = true, categories } = options;
  const [signals, setSignals] = useState<Signal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const { hasActiveSubscription, isAdmin } = useAuth();
  const { allowedCategories } = useUserSubscriptionCategories();
  
  // Track previously seen signal IDs to detect new ones
  const previousSignalIdsRef = useRef<Set<string>>(new Set());
  const isInitialLoadRef = useRef(true);
  // Avoid channel name collisions when multiple components call useSignals at once.
  const channelNameRef = useRef(
    `signals_changes_${Math.random().toString(36).slice(2)}`
  );

  const fetchSignals = useCallback(async () => {
    try {
      let query = supabase
        .from('signals')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (status) {
        if (Array.isArray(status)) {
          query = query.in('status', status);
        } else {
          query = query.eq('status', status);
        }
      }

      const effectiveCategories =
        categories && categories.length > 0
          ? categories
          : !isAdmin
          ? allowedCategories
          : [];

      if (effectiveCategories.length > 0) {
        query = query.in('category', effectiveCategories);
      }

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;
      
      // Cast to our Signal type and filter by signalType client-side
      // since the DB types may not be synced yet
      let newSignals = (data as unknown as Signal[]) || [];
      
      if (signalType !== 'all') {
        newSignals = newSignals.filter(s => s.signal_type === signalType);
      }
      
      const now = Date.now();
      const isRecent = (createdAt: string, windowMs: number) =>
        now - new Date(createdAt).getTime() < windowMs;

      const currentIds = new Set(newSignals.map((s) => s.id));

      // Store IDs so subsequent realtime refreshes can detect genuinely new ones
      if (isInitialLoadRef.current) {
        isInitialLoadRef.current = false;
      }

      previousSignalIdsRef.current = currentIds;
      
      setSignals(newSignals);
      setError(null);
    } catch (err) {
      setError(err as Error);
      if (!shouldSuppressQueryErrorLog(err)) {
        console.error('Error fetching signals:', err);
      }
    } finally {
      setIsLoading(false);
    }
  }, [status, signalType, limit, categories, isAdmin, allowedCategories]);

  useEffect(() => {
    if (!hasActiveSubscription && !isAdmin) {
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
  }, [hasActiveSubscription, isAdmin, fetchSignals, realtime]);

  return { signals, isLoading, error, refetch: fetchSignals };
};

export const useSignal = (signalId: string | undefined) => {
  const [signal, setSignal] = useState<Signal | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!signalId) {
      setIsLoading(false);
      return;
    }

    const fetchSignal = async () => {
      try {
        const { data, error: fetchError } = await supabase
          .from('signals')
          .select('*')
          .eq('id', signalId)
          .maybeSingle();

        if (fetchError) throw fetchError;
        setSignal(data as Signal);
      } catch (err) {
        setError(err as Error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSignal();
  }, [signalId]);

  return { signal, isLoading, error };
};
