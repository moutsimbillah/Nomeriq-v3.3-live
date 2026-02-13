import { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { GlobalSettings } from '@/types/database';

interface BrandContextType {
  settings: GlobalSettings | null;
  isLoading: boolean;
  refreshSettings: () => Promise<void>;
}

const defaultSettings: GlobalSettings = {
  id: '',
  global_risk_percent: 2,
  subscription_price: 50,
  wallet_address: 'TNYhMKhLQWz6d5oX7Kqj7sdUo8vNcRYuPE',
  brand_name: 'nomeriq',
  logo_url: null,
  logo_url_dark: null,
  support_email: 'support@nomeriq.com',
  support_phone: null,
  timezone: 'UTC',
  social_facebook: null,
  social_twitter: null,
  social_instagram: null,
  social_telegram: null,
  social_discord: null,
  copyright_name: 'nomeriq',
  disclaimer_text: 'Trading involves substantial risk and is not suitable for every investor. Past performance is not indicative of future results.',
  updated_at: new Date().toISOString(),
};

const BRAND_SETTINGS_CACHE_KEY = 'brand_settings_cache_v1';

const readCachedSettings = (): GlobalSettings | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(BRAND_SETTINGS_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as GlobalSettings;
  } catch {
    return null;
  }
};

const writeCachedSettings = (settings: GlobalSettings) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(BRAND_SETTINGS_CACHE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore cache write failures
  }
};

const BrandContext = createContext<BrandContextType | undefined>(undefined);

export const BrandProvider = ({ children }: { children: ReactNode }) => {
  const [settings, setSettings] = useState<GlobalSettings | null>(() => readCachedSettings());
  const [isLoading, setIsLoading] = useState(() => readCachedSettings() === null);
  const fetchAttemptedRef = useRef(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('global_settings')
        .select('*')
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error('[BrandContext] Error fetching settings:', error);
        // Use default settings on error
        setSettings((prev) => {
          const next = prev ?? defaultSettings;
          writeCachedSettings(next);
          return next;
        });
      } else if (data) {
        const typed = data as GlobalSettings;
        setSettings(typed);
        writeCachedSettings(typed);
      } else {
        // No data found, use defaults
        setSettings(defaultSettings);
        writeCachedSettings(defaultSettings);
      }
    } catch (error) {
      console.error('[BrandContext] Error fetching settings:', error);
      // Use default settings on error
      setSettings((prev) => {
        const next = prev ?? defaultSettings;
        writeCachedSettings(next);
        return next;
      });
    } finally {
      setIsLoading(false);
      // Clear timeout if fetch completed
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    }
  };

  const refreshSettings = async () => {
    await fetchSettings();
  };

  useEffect(() => {
    // Prevent double-fetching in strict mode
    if (fetchAttemptedRef.current) return;
    fetchAttemptedRef.current = true;

    // Set a timeout to ensure we never stay in loading state forever
    // If fetch takes longer than 5 seconds, fall back to defaults
    timeoutRef.current = setTimeout(() => {
      console.warn('[BrandContext] Settings fetch timeout - using defaults');
      setSettings((prev) => {
        const next = prev ?? defaultSettings;
        writeCachedSettings(next);
        return next;
      });
      setIsLoading(false);
    }, 5000);

    fetchSettings();

    // Subscribe to real-time updates
    const channel = supabase
      .channel('global_settings_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
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
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return (
    <BrandContext.Provider value={{ settings, isLoading, refreshSettings }}>
      {children}
    </BrandContext.Provider>
  );
};

export const useBrand = () => {
  const context = useContext(BrandContext);
  if (context === undefined) {
    throw new Error('useBrand must be used within a BrandProvider');
  }
  return context;
};
