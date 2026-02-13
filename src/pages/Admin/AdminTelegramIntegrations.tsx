import { useEffect, useState } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Plus,
  Edit2,
  ToggleLeft,
  ToggleRight,
  Send,
  Loader2,
  Trash2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { TelegramIntegration, SignalCategory } from "@/types/database";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { getSafeErrorMessage } from "@/lib/error-sanitizer";

type EditableIntegration = Omit<TelegramIntegration, "id" | "created_at" | "updated_at"> & {
  id?: string;
};

const CATEGORY_OPTIONS: SignalCategory[] = [
  "Forex",
  "Metals",
  "Crypto",
  "Indices",
  "Commodities",
];
const DEFAULT_MESSAGE = "Trade responsibly!";
const DEFAULT_HEADER = "";

const getOrderedCategories = (categories?: SignalCategory[]) => {
  const source = categories && categories.length > 0 ? categories : CATEGORY_OPTIONS;
  const unique = Array.from(new Set(source)) as SignalCategory[];
  return CATEGORY_OPTIONS.filter((cat) => unique.includes(cat));
};

const AdminTelegramIntegrations = () => {
  const [integrations, setIntegrations] = useState<TelegramIntegration[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [editingIntegration, setEditingIntegration] =
    useState<TelegramIntegration | null>(null);

  const [formState, setFormState] = useState<EditableIntegration>({
    name: "",
    bot_token: "",
    chat_id: "",
    categories: CATEGORY_OPTIONS,
    is_enabled: true,
    message_header: DEFAULT_HEADER,
    message_footer: DEFAULT_MESSAGE,
  });

  const loadIntegrations = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("telegram_integrations")
        .select("*")
        .order("created_at", { ascending: true });

      if (error) throw error;
      setIntegrations((data || []) as TelegramIntegration[]);
    } catch (err) {
      console.error("Error loading Telegram integrations:", err);
      toast.error("Failed to load Telegram integrations");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadIntegrations();
  }, []);

  const openCreateDialog = () => {
    if (integrations.length >= 5) {
      toast.error("You can only create up to 5 Telegram integrations.");
      return;
    }
    setEditingIntegration(null);
    setFormState({
      name: "",
      bot_token: "",
      chat_id: "",
      categories: CATEGORY_OPTIONS,
      is_enabled: true,
      message_header: DEFAULT_HEADER,
      message_footer: DEFAULT_MESSAGE,
    });
    setIsDialogOpen(true);
  };

  const openEditDialog = (integration: TelegramIntegration) => {
    setEditingIntegration(integration);
    setFormState({
      id: integration.id,
      name: integration.name,
      bot_token: integration.bot_token,
      chat_id: integration.chat_id,
      categories:
        (integration.categories && integration.categories.length > 0
          ? integration.categories
          : CATEGORY_OPTIONS) as SignalCategory[],
      is_enabled: integration.is_enabled,
      message_header: integration.message_header ?? DEFAULT_HEADER,
      message_footer: integration.message_footer ?? DEFAULT_MESSAGE,
    });
    setIsDialogOpen(true);
  };

  const toggleCategory = (cat: SignalCategory) => {
    setFormState((prev) => {
      const exists = prev.categories.includes(cat);
      const nextCategories = exists
        ? prev.categories.filter((c) => c !== cat)
        : [...prev.categories, cat];
      return { ...prev, categories: nextCategories };
    });
  };

  const validate = (): boolean => {
    if (!formState.name.trim()) {
      toast.error("Integration name is required");
      return false;
    }
    if (!formState.bot_token.trim()) {
      toast.error("Bot token is required");
      return false;
    }
    if (!formState.chat_id.trim()) {
      toast.error("Chat ID is required");
      return false;
    }
    if (formState.categories.length === 0) {
      toast.error("Select at least one category");
      return false;
    }
    if (!formState.bot_token.startsWith("5") && !formState.bot_token.includes(":")) {
      // Loose validation; avoid blocking valid tokens while nudging format
      toast.error("Bot token format looks invalid. It should be the value from BotFather.");
      return false;
    }
    return true;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setIsSaving(true);
    try {
      if (!editingIntegration && integrations.length >= 5) {
        toast.error("You can only create up to 5 Telegram integrations.");
        setIsSaving(false);
        return;
      }

      const payload = {
        name: formState.name.trim(),
        bot_token: formState.bot_token.trim(),
        chat_id: formState.chat_id.trim(),
        categories: formState.categories,
        is_enabled: formState.is_enabled,
        message_header: (formState.message_header || "").trim() || null,
        message_footer: (formState.message_footer || "").trim() || DEFAULT_MESSAGE,
      };

      const saveWithPayload = async (data: typeof payload) => {
        if (editingIntegration) {
          return supabase
            .from("telegram_integrations")
            .update(data)
            .eq("id", editingIntegration.id);
        }
        return supabase.from("telegram_integrations").insert(data);
      };

      let { error } = await saveWithPayload(payload);

      const isMissingHeaderColumnError =
        !!error &&
        ((error as { code?: string }).code === "42703" ||
          /message_header/i.test(
            `${(error as { message?: string }).message || ""} ${(error as { details?: string }).details || ""}`
          ));

      if (isMissingHeaderColumnError) {
        const fallbackPayload = {
          name: payload.name,
          bot_token: payload.bot_token,
          chat_id: payload.chat_id,
          categories: payload.categories,
          is_enabled: payload.is_enabled,
          message_footer: payload.message_footer,
        };
        const fallbackResult = await saveWithPayload(fallbackPayload as typeof payload);
        error = fallbackResult.error;
        if (!error) {
          toast.warning("Saved without header message. Please run latest Telegram migration.");
        }
      }

      if (error) throw error;

      toast.success(
        editingIntegration
          ? "Telegram integration updated"
          : "Telegram integration created"
      );
      setIsDialogOpen(false);
      setEditingIntegration(null);
      await loadIntegrations();
    } catch (err) {
      console.error("Error saving Telegram integration:", err);
      toast.error(getSafeErrorMessage(err, "Failed to save Telegram integration. Please try again."));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteIntegration = async (integration: TelegramIntegration) => {
    const ok = confirm(`Delete "${integration.name}" integration? This cannot be undone.`);
    if (!ok) return;

    try {
      const { error } = await supabase
        .from("telegram_integrations")
        .delete()
        .eq("id", integration.id);
      if (error) throw error;
      toast.success("Telegram integration deleted");
      await loadIntegrations();
    } catch (err) {
      console.error("Error deleting Telegram integration:", err);
      toast.error("Failed to delete Telegram integration");
    }
  };

  const handleTestConnection = async () => {
    const botToken = formState.bot_token.trim();
    const chatId = formState.chat_id.trim();

    if (!botToken) {
      toast.error("Bot token is required for testing");
      return;
    }
    if (!chatId) {
      toast.error("Chat ID is required for testing");
      return;
    }

    setIsTesting(true);
    try {
      const getMeRes = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
      const getMeJson = await getMeRes.json();

      if (!getMeRes.ok || !getMeJson?.ok) {
        throw new Error(getMeJson?.description || "Invalid bot token");
      }

      const testMessage = `✅ Test connection successful\nIntegration: ${formState.name || "Nomeriq Integration"}`;
      const sendRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: testMessage,
          disable_web_page_preview: true,
        }),
      });
      const sendJson = await sendRes.json();

      if (!sendRes.ok || !sendJson?.ok) {
        throw new Error(sendJson?.description || "Could not send test message");
      }

      toast.success("Test successful. Message sent to Telegram.");
    } catch (err) {
      console.error("Telegram test failed:", err);
      toast.error(getSafeErrorMessage(err, "Test failed. Please verify token/chat ID and bot permissions."));
    } finally {
      setIsTesting(false);
    }
  };

  const handleToggleEnabled = async (integration: TelegramIntegration) => {
    try {
      const { error } = await supabase
        .from("telegram_integrations")
        .update({ is_enabled: !integration.is_enabled })
        .eq("id", integration.id);
      if (error) throw error;
      await loadIntegrations();
    } catch (err) {
      console.error("Error toggling Telegram integration:", err);
      toast.error("Failed to update integration status");
    }
  };

  return (
    <AdminLayout title="Telegram Integrations">
      <div className="max-w-5xl mx-auto px-4 md:px-6 py-6 space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <Send className="w-5 h-5 text-primary" />
              Telegram Integrations
            </h1>
            <p className="text-sm text-muted-foreground">
              Configure Telegram bots and channels for sending category-based
              signals. Maximum 5 integrations.
            </p>
          </div>
          <Button onClick={openCreateDialog} disabled={integrations.length >= 5}>
            <Plus className="w-4 h-4 mr-2" />
            New Integration
          </Button>
        </div>

        <div className="glass-card p-0 overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : integrations.length === 0 ? (
            <div className="py-10 px-6 text-center text-muted-foreground">
              <p className="font-medium mb-1">No Telegram integrations yet</p>
              <p className="text-sm">
                Create your first integration to start routing signals to
                Telegram.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50 bg-secondary/30">
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Categories
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Chat ID
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Footer Message
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Status
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {integrations.map((integration) => (
                    <tr key={integration.id} className="hover:bg-accent/30">
                      <td className="px-6 py-4">
                        <div className="font-medium">{integration.name}</div>
                      </td>
                      <td className="px-6 py-4">
                        {(() => {
                          const orderedCategories = getOrderedCategories(integration.categories);
                          const isAllCategories =
                            orderedCategories.length === CATEGORY_OPTIONS.length;

                          return isAllCategories ? (
                            <Badge
                              variant="outline"
                              className="px-2.5 py-1 text-[11px] border-primary/30 text-primary bg-primary/10"
                            >
                              All Categories
                            </Badge>
                          ) : (
                            <div className="flex flex-wrap gap-1.5 max-w-[220px]">
                              {orderedCategories.map((cat) => (
                                <Badge
                                  key={cat}
                                  variant="outline"
                                  className="px-2 py-0.5 text-[11px] border-border/70 text-foreground/90"
                                >
                                  {cat}
                                </Badge>
                              ))}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-mono text-xs">
                          {integration.chat_id}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="space-y-1 max-w-[260px]">
                          <p className="text-[10px] text-muted-foreground truncate">
                            Header: {(integration.message_header || "").trim() || "Default"}
                          </p>
                          <p className="text-[10px] text-muted-foreground truncate">
                            Footer: {(integration.message_footer || "").trim() || "No message set"}
                          </p>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-xs px-2 py-0.5",
                            integration.is_enabled
                              ? "border-success/40 text-success bg-success/10"
                              : "border-muted-foreground/40 text-muted-foreground"
                          )}
                        >
                          {integration.is_enabled ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleToggleEnabled(integration)}
                          >
                            {integration.is_enabled ? (
                              <ToggleRight className="w-5 h-5 text-success" />
                            ) : (
                              <ToggleLeft className="w-5 h-5 text-muted-foreground" />
                            )}
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => openEditDialog(integration)}
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            onClick={() => handleDeleteIntegration(integration)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>
                {editingIntegration ? "Edit Integration" : "New Integration"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Integration Name</label>
                <Input
                  value={formState.name}
                  onChange={(e) =>
                    setFormState((prev) => ({ ...prev, name: e.target.value }))
                  }
                  placeholder="Main Signals Channel"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Bot Token</label>
                <Input
                  value={formState.bot_token}
                  onChange={(e) =>
                    setFormState((prev) => ({
                      ...prev,
                      bot_token: e.target.value,
                    }))
                  }
                  placeholder="123456789:ABCDEF..."
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Chat ID</label>
                <Input
                  value={formState.chat_id}
                  onChange={(e) =>
                    setFormState((prev) => ({
                      ...prev,
                      chat_id: e.target.value,
                    }))
                  }
                  placeholder="@your_channel or numeric chat id"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Categories</label>
                <p className="text-xs text-muted-foreground">
                  Signals for the selected categories will be sent to this
                  integration.
                </p>
                <div className="flex flex-wrap gap-2">
                  {CATEGORY_OPTIONS.map((cat) => {
                    const selected = formState.categories.includes(cat);
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => toggleCategory(cat)}
                        className={cn(
                          "px-3 py-1 rounded-full text-xs border transition-colors",
                          selected
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background text-muted-foreground border-border hover:border-primary/60"
                        )}
                      >
                        {cat}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-lg border border-border/60 p-3 space-y-3">
                <div>
                  <p className="text-sm font-medium">Message Template</p>
                  <p className="text-xs text-muted-foreground">
                    Header overrides the default signal title. Footer is appended to all alerts.
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Header Message</label>
                  <Input
                    value={formState.message_header || ""}
                    onChange={(e) =>
                      setFormState((prev) => ({
                        ...prev,
                        message_header: e.target.value,
                      }))
                    }
                    placeholder="Leave empty to use default (e.g. NEW TRADING SIGNAL)"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Footer Message</label>
                  <Textarea
                    value={formState.message_footer || ""}
                    onChange={(e) =>
                      setFormState((prev) => ({
                        ...prev,
                        message_footer: e.target.value,
                      }))
                    }
                    placeholder={DEFAULT_MESSAGE}
                    className="min-h-[70px]"
                  />
                </div>

              </div>

              <div className="flex items-center justify-between pt-2">
                <div className="flex items-center gap-2 text-sm">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs",
                      formState.is_enabled
                        ? "border-success/40 text-success"
                        : "border-muted-foreground/40 text-muted-foreground"
                    )}
                  >
                    {formState.is_enabled ? "Active" : "Inactive"}
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      setFormState((prev) => ({
                        ...prev,
                        is_enabled: !prev.is_enabled,
                      }))
                    }
                  >
                    {formState.is_enabled ? (
                      <ToggleRight className="w-4 h-4 mr-1" />
                    ) : (
                      <ToggleLeft className="w-4 h-4 mr-1" />
                    )}
                    {formState.is_enabled ? "Disable" : "Enable"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleTestConnection}
                    disabled={isTesting || isSaving}
                  >
                    {isTesting && (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    )}
                    Test Connection
                  </Button>
                  <Button type="button" onClick={handleSave} disabled={isSaving}>
                    {isSaving && (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    )}
                    Save
                  </Button>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
};

export default AdminTelegramIntegrations;
