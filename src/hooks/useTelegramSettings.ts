import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface TelegramSettings {
  id?: string;
  user_id: string;
  bot_token: string;
  chat_id: string;
  is_enabled: boolean;
}

export const useTelegramSettings = () => {
  const { user } = useAuth();
  const [settings, setSettings] = useState<TelegramSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const fetchSettings = useCallback(async () => {
    if (!user?.id) {
      setIsLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('provider_telegram_settings')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;
      
      setSettings(data as TelegramSettings | null);
    } catch (err) {
      console.error('Error fetching Telegram settings:', err);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const saveSettings = async (newSettings: Omit<TelegramSettings, 'id' | 'user_id'>) => {
    if (!user?.id) return false;

    setIsSaving(true);
    try {
      if (settings?.id) {
        // Update existing
        const { error } = await supabase
          .from('provider_telegram_settings')
          .update({
            bot_token: newSettings.bot_token,
            chat_id: newSettings.chat_id,
            is_enabled: newSettings.is_enabled,
          })
          .eq('id', settings.id);

        if (error) throw error;
      } else {
        // Insert new
        const { error } = await supabase
          .from('provider_telegram_settings')
          .insert({
            user_id: user.id,
            bot_token: newSettings.bot_token,
            chat_id: newSettings.chat_id,
            is_enabled: newSettings.is_enabled,
          });

        if (error) throw error;
      }

      toast.success('Telegram settings saved successfully');
      await fetchSettings();
      return true;
    } catch (err) {
      console.error('Error saving Telegram settings:', err);
      toast.error('Failed to save Telegram settings');
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const deleteSettings = async () => {
    if (!settings?.id) return false;

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('provider_telegram_settings')
        .delete()
        .eq('id', settings.id);

      if (error) throw error;

      toast.success('Telegram settings deleted');
      setSettings(null);
      return true;
    } catch (err) {
      console.error('Error deleting Telegram settings:', err);
      toast.error('Failed to delete Telegram settings');
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const testConnection = async () => {
    if (!settings?.bot_token || !settings?.chat_id) {
      toast.error('Please save your settings first');
      return false;
    }

    try {
      const telegramApiUrl = `https://api.telegram.org/bot${settings.bot_token}/sendMessage`;
      
      const response = await fetch(telegramApiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: settings.chat_id,
          text: '✅ *Test Message*\n\nYour Telegram integration is working correctly!',
          parse_mode: 'Markdown',
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.description || 'Failed to send test message');
      }

      toast.success('Test message sent successfully!');
      return true;
    } catch (err) {
      console.error('Error testing Telegram connection:', err);
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      toast.error(`Test failed: ${errorMessage}`);
      return false;
    }
  };

  return {
    settings,
    isLoading,
    isSaving,
    saveSettings,
    deleteSettings,
    testConnection,
    refetch: fetchSettings,
  };
};
