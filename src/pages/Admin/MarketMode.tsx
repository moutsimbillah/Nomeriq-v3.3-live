import { useState, useEffect } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Activity,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertTriangle,
  RefreshCw,
  Key,
  Database,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";

type MarketMode = 'manual' | 'live';
type SyncStatus = 'idle' | 'syncing' | 'success' | 'error';

interface MarketModeSettings {
  id: string;
  mode: MarketMode;
  twelve_data_api_key: string | null;
  last_sync_at: string | null;
  sync_status: SyncStatus | null;
  sync_error_message: string | null;
}

const MarketMode = () => {
  const [settings, setSettings] = useState<MarketModeSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Fetch current settings
  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('market_mode_settings')
        .select('*')
        .single();

      if (error) throw error;

      setSettings(data);
      setApiKey(data.twelve_data_api_key || "");
    } catch (error: any) {
      console.error('Error fetching market mode settings:', error);
      toast.error('Failed to load market mode settings');
    } finally {
      setIsLoading(false);
    }
  };

  const handleModeToggle = async (newMode: MarketMode) => {
    if (newMode === 'live' && !apiKey.trim()) {
      toast.error('Please enter your Twelve Data API key before enabling Live Mode');
      return;
    }

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('market_mode_settings')
        .update({
          mode: newMode,
          updated_at: new Date().toISOString(),
        })
        .eq('id', settings?.id);

      if (error) throw error;

      setSettings((prev) => prev ? { ...prev, mode: newMode } : null);
      toast.success(`Market Mode switched to ${newMode === 'live' ? 'Live' : 'Manual'}`);
    } catch (error: any) {
      console.error('Error updating market mode:', error);
      toast.error('Failed to update market mode');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveApiKey = async () => {
    if (!apiKey.trim()) {
      toast.error('API key cannot be empty');
      return;
    }

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('market_mode_settings')
        .update({
          twelve_data_api_key: apiKey.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', settings?.id);

      if (error) throw error;

      setSettings((prev) => prev ? { ...prev, twelve_data_api_key: apiKey.trim() } : null);
      toast.success('API key saved successfully');
      setTestResult(null);
    } catch (error: any) {
      console.error('Error saving API key:', error);
      toast.error('Failed to save API key');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestApiKey = async () => {
    if (!apiKey.trim()) {
      toast.error('Please enter an API key first');
      return;
    }

    setTestResult(null);
    setIsSaving(true);
    try {
      // Test API key by calling Twelve Data endpoint
      const response = await fetch(
        `https://api.twelvedata.com/time_series?symbol=BTC/USD&interval=1min&apikey=${apiKey.trim()}&outputsize=1`
      );

      const data = await response.json();

      if (data.status === 'error') {
        setTestResult({ success: false, message: data.message || 'Invalid API key' });
        toast.error('API key test failed');
      } else {
        setTestResult({ success: true, message: 'API key is valid and working' });
        toast.success('API key test successful');
      }
    } catch (error: any) {
      setTestResult({ success: false, message: error.message || 'Failed to test API key' });
      toast.error('Failed to test API key');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSyncSymbols = async () => {
    setIsSyncing(true);
    try {
      if (!apiKey.trim()) {
        toast.error('Please enter your Twelve Data API key first');
        setIsSyncing(false);
        return;
      }

      // Call edge function with explicit JWT (avoids missing-auth 401s)
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        throw new Error("Not authenticated. Please sign in again.");
      }

      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-market-symbols`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ api_key: apiKey.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error || "Failed to sync symbols.");
      }

      // Update sync status
      const { error: updateError } = await supabase
        .from('market_mode_settings')
        .update({
          sync_status: 'success',
          last_sync_at: new Date().toISOString(),
          sync_error_message: null,
        })
        .eq('id', settings?.id);

      if (updateError) throw updateError;

      await fetchSettings();
      toast.success('Symbols synced successfully');
    } catch (error: any) {
      console.error('Error syncing symbols:', error);
      
      const { error: updateError } = await supabase
        .from('market_mode_settings')
        .update({
          sync_status: 'error',
          sync_error_message: error.message || 'Sync failed',
        })
        .eq('id', settings?.id);

      toast.error('Failed to sync symbols');
    } finally {
      setIsSyncing(false);
    }
  };

  if (isLoading) {
    return (
      <AdminLayout title="Market Mode">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </AdminLayout>
    );
  }

  const currentMode = settings?.mode || 'manual';
  const isLiveMode = currentMode === 'live';

  return (
    <AdminLayout title="Market Mode">
      <div className="space-y-6">
        {/* Mode Toggle Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="w-5 h-5" />
              Market Mode Configuration
            </CardTitle>
            <CardDescription>
              Choose between Manual Mode (current behavior) or Live Mode (real-time market prices)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-base">Market Mode</Label>
                <p className="text-sm text-muted-foreground">
                  {isLiveMode
                    ? 'Live Mode: Entry prices are fetched automatically from Twelve Data'
                    : 'Manual Mode: Entry prices are entered manually (current behavior)'}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant={currentMode === 'manual' ? 'default' : 'outline'}>
                  Manual
                </Badge>
                <Switch
                  checked={isLiveMode}
                  onCheckedChange={(checked) => handleModeToggle(checked ? 'live' : 'manual')}
                  disabled={isSaving}
                />
                <Badge variant={currentMode === 'live' ? 'default' : 'outline'}>
                  Live
                </Badge>
              </div>
            </div>

            {isLiveMode && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Live Mode is active. All new signals will automatically fetch entry prices from Twelve Data.
                  Make sure your API key is configured below.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {/* Twelve Data API Key Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="w-5 h-5" />
              Twelve Data API Configuration
            </CardTitle>
            <CardDescription>
              Enter your Twelve Data API key to enable Live Mode functionality
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="api-key">API Key</Label>
              <div className="flex gap-2">
                <Input
                  id="api-key"
                  type={showApiKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Enter your Twelve Data API key"
                  className="flex-1"
                />
                <Button
                  variant="outline"
                  onClick={() => setShowApiKey(!showApiKey)}
                >
                  {showApiKey ? 'Hide' : 'Show'}
                </Button>
              </div>
            </div>

            {testResult && (
              <Alert variant={testResult.success ? 'default' : 'destructive'}>
                {testResult.success ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <XCircle className="h-4 w-4" />
                )}
                <AlertDescription>{testResult.message}</AlertDescription>
              </Alert>
            )}

            <div className="flex gap-2">
              <Button
                onClick={handleTestApiKey}
                disabled={!apiKey.trim() || isSaving}
                variant="outline"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Testing...
                  </>
                ) : (
                  'Test API Key'
                )}
              </Button>
              <Button
                onClick={handleSaveApiKey}
                disabled={!apiKey.trim() || isSaving}
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save API Key'
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Symbol Sync Card */}
        {isLiveMode && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="w-5 h-5" />
                Market Symbol Sync
              </CardTitle>
              <CardDescription>
                Sync available trading pairs from Twelve Data to populate the pair selector
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Last Sync</Label>
                  <p className="text-sm text-muted-foreground">
                    {settings?.last_sync_at
                      ? new Date(settings.last_sync_at).toLocaleString()
                      : 'Never synced'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {settings?.sync_status === 'success' && (
                    <Badge variant="default" className="bg-success">
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      Success
                    </Badge>
                  )}
                  {settings?.sync_status === 'error' && (
                    <Badge variant="destructive">
                      <XCircle className="w-3 h-3 mr-1" />
                      Error
                    </Badge>
                  )}
                  <Button
                    onClick={handleSyncSymbols}
                    disabled={!apiKey.trim() || isSyncing}
                    variant="outline"
                  >
                    {isSyncing ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Syncing...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Sync Symbols
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {settings?.sync_error_message && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>{settings.sync_error_message}</AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        )}

        {/* Info Card */}
        <Card className="bg-muted/50">
          <CardContent className="pt-6">
            <div className="space-y-2">
              <h3 className="font-semibold">How Live Mode Works</h3>
              <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                <li>When creating a signal in Live Mode, the pair selector shows only symbols from your synced catalog</li>
                <li>Entry price is automatically fetched and locked (read-only) when you select a pair</li>
                <li>Entry price refreshes every 30 seconds for display, but the locked price is used when creating the signal</li>
                <li>If the quote is older than 30 seconds when you click "Create & Notify", the server will fetch a fresh quote</li>
                <li>Manual Mode signals continue to work exactly as before - no changes to existing behavior</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};

export default MarketMode;
