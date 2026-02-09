import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Send, Save, Trash2, AlertCircle, CheckCircle2, Eye, EyeOff } from "lucide-react";
import { useTelegramSettings } from "@/hooks/useTelegramSettings";

export function TelegramIntegrationSection() {
  const {
    settings,
    isLoading,
    isSaving,
    saveSettings,
    deleteSettings,
    testConnection
  } = useTelegramSettings();

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
    if (!botToken.trim() || !chatId.trim()) return;
    await saveSettings({
      bot_token: botToken.trim(),
      chat_id: chatId.trim(),
      is_enabled: isEnabled
    });
  };

  const handleTest = async () => {
    setIsTesting(true);
    await testConnection();
    setIsTesting(false);
  };

  const handleDelete = async () => {
    if (!settings) return;
    if (confirm("Are you sure you want to delete your Telegram settings?")) {
      await deleteSettings();
      setBotToken("");
      setChatId("");
      setIsEnabled(true);
    }
  };

  return (
    <Card className="border-border/50" id="telegram">
      <div className="p-4 border-b border-border/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Send className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold">Telegram Integration</h2>
          </div>
          {isLoading ? (
            <Badge variant="outline" className="border-muted-foreground/30 text-muted-foreground">
              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              Loading
            </Badge>
          ) : settings ? (
            <Badge
              variant="outline"
              className={
                settings.is_enabled
                  ? "border-success/30 text-success bg-success/10"
                  : "border-muted-foreground/30 text-muted-foreground"
              }
            >
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
      </div>

      <CardContent className="p-6 space-y-4">
        <p className="text-sm text-muted-foreground">
          Configure your Telegram bot to send trading signals in real-time to your group or channel.
        </p>

        <div className="space-y-2">
          <Label htmlFor="bot-token" className="text-xs text-muted-foreground uppercase tracking-wide">
            Telegram Bot API Token
          </Label>
          <div className="relative">
            <Input
              id="bot-token"
              type={showToken ? "text" : "password"}
              placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
              value={botToken}
              onChange={(e) => setBotToken(e.target.value)}
              className="pr-10 bg-secondary/30 border-border/50"
              autoComplete="off"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
              onClick={() => setShowToken((s) => !s)}
            >
              {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="chat-id" className="text-xs text-muted-foreground uppercase tracking-wide">
            Telegram Group Chat ID
          </Label>
          <Input
            id="chat-id"
            type="text"
            placeholder="-1001234567890"
            value={chatId}
            onChange={(e) => setChatId(e.target.value)}
            className="bg-secondary/30 border-border/50"
            autoComplete="off"
          />
        </div>

        <div className="flex items-center justify-between p-3 rounded-md bg-secondary/30">
          <div>
            <Label htmlFor="telegram-enabled" className="text-sm font-medium cursor-pointer">
              Enable Telegram Notifications
            </Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              Signals will be sent when you create them
            </p>
          </div>
          <Switch id="telegram-enabled" checked={isEnabled} onCheckedChange={setIsEnabled} />
        </div>

        <div className="flex items-center gap-3 pt-4 border-t border-border/50">
          <Button
            onClick={handleSave}
            disabled={isSaving || !botToken.trim() || !chatId.trim()}
            variant="gradient"
            size="default"
            className="flex-1 sm:flex-none"
          >
            {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Save Settings
          </Button>

          <Button
            onClick={handleTest}
            disabled={isTesting || !settings}
            variant="secondary"
            size="default"
            className="flex-1 sm:flex-none"
          >
            {isTesting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
            Test Connection
          </Button>

          {settings && (
            <Button
              onClick={handleDelete}
              disabled={isSaving}
              variant="ghost"
              size="icon"
              className="text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
              title="Delete Telegram settings"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}