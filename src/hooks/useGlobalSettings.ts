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
  // Payment method configuration (optional for backward compatibility)
  enable_usdt_trc20?: boolean;
  enable_bank_transfer?: boolean;
  enable_stripe?: boolean;
  bank_account_name?: string | null;
  bank_account_number?: string | null;
  bank_name?: string | null;
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
      setSettings(data as GlobalSettings | null);
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
    if (!settings) {
      console.error('Cannot update settings: settings is null');
      throw new Error('Settings not loaded');
    }

    console.log('Updating settings with:', updates);

    const { error } = await supabase
      .from('global_settings')
      .update(updates)
      .eq('id', settings.id);

    if (error) {
      console.error('Supabase update error:', error);
      console.error('Error details:', JSON.stringify(error, null, 2));
      throw error;
    }

    console.log('Settings updated successfully');
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
