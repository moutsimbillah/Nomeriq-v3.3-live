import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface GlobalSettings {
  id: string;
  global_risk_percent: number;
  subscription_price: number;
  wallet_address: string;
  brand_name: string;
  logo_url: string | null;
  support_email: string | null;
  support_phone: string | null;
  timezone: string;
  updated_at: string;
}

export const useGlobalSettings = () => {
  const [settings, setSettings] = useState<GlobalSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchSettings = useCallback(async () => {
    try {
      const { data, error: fetchError } = await supabase
        .from('global_settings')
        .select('*')
        .limit(1)
        .maybeSingle();

      if (fetchError) throw fetchError;
      setSettings(data as GlobalSettings);
      setError(null);
    } catch (err) {
      setError(err as Error);
      console.error('Error fetching global settings:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();

    // Subscribe to realtime changes
    const channel = supabase
      .channel('global_settings_changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'global_settings',
        },
        () => {
          fetchSettings();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchSettings]);

  const updateSettings = async (updates: Partial<GlobalSettings>) => {
    if (!settings) return;
    
    const { error } = await supabase
      .from('global_settings')
      .update(updates)
      .eq('id', settings.id);

    if (error) throw error;
    await fetchSettings();
  };

  return {
    settings,
    isLoading,
    error,
    refetch: fetchSettings,
    updateSettings,
  };
};
