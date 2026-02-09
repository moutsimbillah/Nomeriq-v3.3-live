import { useState, useEffect } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Send, Save, Trash2, AlertCircle, CheckCircle2, Eye, EyeOff } from "lucide-react";
import { useTelegramSettings } from "@/hooks/useTelegramSettings";

const TelegramIntegration = () => {
  const { settings, isLoading, isSaving, saveSettings, deleteSettings, testConnection } = useTelegramSettings();
  
  const [botToken, setBotToken] = useState("");
  const [chatId, setChatId] = useState("");
  const [isEnabled, setIsEnabled] = useState(true);
  const [showToken, setShowToken] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  useEffect(() => {
    if (settings) {
      setBotToken(settings.bot_token);
      setChatId(settings.chat_id);
      setIsEnabled(settings.is_enabled);
    }
  }, [settings]);

  const handleSave = async () => {
    if (!botToken.trim() || !chatId.trim()) {
      return;
    }
    await saveSettings({
      bot_token: botToken.trim(),
      chat_id: chatId.trim(),
      is_enabled: isEnabled,
    });
  };

  const handleTest = async () => {
    setIsTesting(true);
    await testConnection();
    setIsTesting(false);
  };

  const handleDelete = async () => {
    if (confirm("Are you sure you want to delete your Telegram settings?")) {
      await deleteSettings();
      setBotToken("");
      setChatId("");
      setIsEnabled(true);
    }
  };

  if (isLoading) {
    return (
      <AdminLayout title="Telegram Integration">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Telegram Integration">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Status Card */}
        <Card className="glass-card shadow-none">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Send className="w-5 h-5 text-primary" />
                  Telegram Bot Configuration
                </CardTitle>
                <CardDescription>
                  Configure your Telegram bot to automatically send trading signals to your group.
                </CardDescription>
              </div>
              {settings ? (
                <Badge variant="outline" className={settings.is_enabled ? "border-success/30 text-success bg-success/10" : "border-muted-foreground/30 text-muted-foreground"}>
                  {settings.is_enabled ? (
                    <>
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      Active
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-3 h-3 mr-1" />
                      Disabled
                    </>
                  )}
                </Badge>
              ) : (
                <Badge variant="outline" className="border-warning/30 text-warning bg-warning/10">
                  <AlertCircle className="w-3 h-3 mr-1" />
                  Not Configured
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Bot Token */}
            <div className="space-y-2">
              <Label htmlFor="bot-token">Bot API Token</Label>
              <div className="relative">
                <Input
                  id="bot-token"
                  type={showToken ? "text" : "password"}
                  placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
                  value={botToken}
                  onChange={(e) => setBotToken(e.target.value)}
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                  onClick={() => setShowToken(!showToken)}
                >
                  {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Get this from <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">@BotFather</a> on Telegram
              </p>
            </div>

            {/* Chat ID */}
            <div className="space-y-2">
              <Label htmlFor="chat-id">Group Chat ID</Label>
              <Input
                id="chat-id"
                type="text"
                placeholder="-1001234567890"
                value={chatId}
                onChange={(e) => setChatId(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Add your bot to the group, then use <a href="https://t.me/userinfobot" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">@userinfobot</a> to get the chat ID
              </p>
            </div>

            {/* Enable Toggle */}
            <div className="flex items-center justify-between p-4 rounded-lg bg-secondary/30">
              <div>
                <Label htmlFor="telegram-enabled" className="text-base font-medium">Enable Telegram Notifications</Label>
                <p className="text-sm text-muted-foreground">Send signals to your Telegram group automatically</p>
              </div>
              <Switch
                id="telegram-enabled"
                checked={isEnabled}
                onCheckedChange={setIsEnabled}
              />
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 pt-4 border-t border-border/50">
              <Button onClick={handleSave} disabled={isSaving || !botToken.trim() || !chatId.trim()} variant="gradient">
                {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                Save Settings
              </Button>
              
              {settings && (
                <>
                  <Button onClick={handleTest} disabled={isTesting} variant="outline">
                    {isTesting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                    Test Connection
                  </Button>
                  
                  <Button onClick={handleDelete} disabled={isSaving} variant="ghost" className="text-destructive hover:text-destructive">
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete
                  </Button>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* How it works */}
        <Card className="glass-card shadow-none">
          <CardHeader>
            <CardTitle className="text-base">How It Works</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="text-primary font-bold">1.</span>
                When creating a signal, check the "Send to Telegram" option
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary font-bold">2.</span>
                New Upcoming and Active signals will be sent to your group
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary font-bold">3.</span>
                When an Upcoming trade is activated, a new notification is sent
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary font-bold">4.</span>
                Messages include: Pair, Direction, Entry, SL, TP, and Analysis notes
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};

export default TelegramIntegration;
