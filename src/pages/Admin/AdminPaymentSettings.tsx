import { useEffect, useState } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useGlobalSettings } from "@/hooks/useGlobalSettings";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  DollarSign,
  Copy,
  Check,
  Loader2,
  CreditCard,
  KeyRound,
  BookOpen,
  Eye,
  EyeOff,
} from "lucide-react";

const AdminPaymentSettings = () => {
  const { settings, isLoading, updateSettings } = useGlobalSettings();

  const [walletAddress, setWalletAddress] = useState("");
  const [enableUsdtTrc20, setEnableUsdtTrc20] = useState(true);
  const [enableBankTransfer, setEnableBankTransfer] = useState(false);
  const [enableStripe, setEnableStripe] = useState(false);
  const [bankAccountName, setBankAccountName] = useState("");
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [bankName, setBankName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [stripeSecretKey, setStripeSecretKey] = useState("");
  const [stripeWebhookSecret, setStripeWebhookSecret] = useState("");
  const [stripePublishableKey, setStripePublishableKey] = useState("");
  const [showStripeSecret, setShowStripeSecret] = useState(false);
  const [showWebhookSecret, setShowWebhookSecret] = useState(false);
  const [isLoadingStripeConfig, setIsLoadingStripeConfig] = useState(true);
  const webhookEndpoint = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-webhook`;
  const webhookExampleEndpoint =
    "https://your-project-ref.supabase.co/functions/v1/stripe-webhook";

  useEffect(() => {
    if (!settings) return;
    setWalletAddress(settings.wallet_address || "");
    setEnableUsdtTrc20(settings.enable_usdt_trc20 ?? true);
    setEnableBankTransfer(settings.enable_bank_transfer ?? false);
    setEnableStripe(settings.enable_stripe ?? false);
    setBankAccountName(settings.bank_account_name || "");
    setBankAccountNumber(settings.bank_account_number || "");
    setBankName(settings.bank_name || "");
  }, [settings]);

  useEffect(() => {
    const loadStripeConfig = async () => {
      setIsLoadingStripeConfig(true);
      const { data, error } = await supabase
        .from("payment_provider_settings")
        .select("stripe_secret_key, stripe_webhook_secret, stripe_publishable_key, stripe_webhook_endpoint")
        .eq("provider", "stripe")
        .maybeSingle();
      if (error) {
        console.error("Error loading Stripe provider settings:", error);
        toast.error("Failed to load Stripe configuration");
        setIsLoadingStripeConfig(false);
        return;
      }
      setStripeSecretKey(data?.stripe_secret_key || "");
      setStripeWebhookSecret(data?.stripe_webhook_secret || "");
      setStripePublishableKey(data?.stripe_publishable_key || "");
      setIsLoadingStripeConfig(false);
    };

    loadStripeConfig();
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateSettings({
        wallet_address: walletAddress,
        enable_usdt_trc20: enableUsdtTrc20,
        enable_bank_transfer: enableBankTransfer,
        enable_stripe: enableStripe,
        bank_account_name: bankAccountName || null,
        bank_account_number: bankAccountNumber || null,
        bank_name: bankName || null,
      });
      const { error: stripeConfigError } = await supabase
        .from("payment_provider_settings")
        .upsert(
          {
            provider: "stripe",
            stripe_secret_key: stripeSecretKey.trim() || null,
            stripe_webhook_secret: stripeWebhookSecret.trim() || null,
            stripe_publishable_key: stripePublishableKey.trim() || null,
            stripe_webhook_endpoint: webhookEndpoint,
          },
          { onConflict: "provider" }
        );
      if (stripeConfigError) {
        const code = (stripeConfigError as { code?: string }).code;
        if (code === "42P01") {
          throw new Error("Payment provider settings table is missing. Please run latest database migrations.");
        }
        if (code === "42501") {
          throw new Error("Permission denied while saving Stripe configuration. Please apply latest RLS migration.");
        }
        throw stripeConfigError;
      }
      toast.success("Payment settings saved successfully");
    } catch (err) {
      console.error("Error saving payment settings:", err);
      const message =
        err instanceof Error && err.message
          ? err.message
          : "Failed to save payment settings";
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopyWallet = () => {
    navigator.clipboard.writeText(walletAddress);
    setCopied(true);
    toast.success("Wallet address copied");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <AdminLayout title="Payment Settings">
      <div className="max-w-4xl space-y-6">
        <Card className="border-border/50 bg-gradient-to-br from-success/5 to-transparent">
          <div className="p-4 border-b border-border/50">
            <div className="flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-success" />
              <h2 className="text-lg font-semibold">Payment Methods</h2>
            </div>
          </div>
          <CardContent className="p-6 space-y-6">
            <div className="space-y-4">
              <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                Enabled Payment Methods
              </Label>

              <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 border border-border/50">
                <div className="flex-1">
                  <p className="text-sm font-medium">USDT (TRC20)</p>
                  <p className="text-xs text-muted-foreground">Cryptocurrency payment via Tron network</p>
                </div>
                <Switch checked={enableUsdtTrc20} onCheckedChange={setEnableUsdtTrc20} />
              </div>
              {enableUsdtTrc20 && (
                <div className="space-y-2 pl-4 border-l-2 border-primary/30">
                  <Label className="text-xs">USDT Wallet (TRC20)</Label>
                  <div className="flex gap-2">
                    <Input
                      value={walletAddress}
                      onChange={(e) => setWalletAddress(e.target.value)}
                      className="bg-secondary/30 border-border/50 font-mono text-sm"
                    />
                    <Button variant="outline" size="icon" onClick={handleCopyWallet} className="shrink-0">
                      {copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    This address is displayed to users during payment.
                  </p>
                </div>
              )}

              <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 border border-border/50">
                <div className="flex-1">
                  <p className="text-sm font-medium">Bank Transfer (Manual)</p>
                  <p className="text-xs text-muted-foreground">Traditional bank account transfer</p>
                </div>
                <Switch checked={enableBankTransfer} onCheckedChange={setEnableBankTransfer} />
              </div>

              {enableBankTransfer && (
                <div className="space-y-3 pl-4 border-l-2 border-primary/30">
                  <div className="space-y-2">
                    <Label className="text-xs">Account Holder Name</Label>
                    <Input
                      value={bankAccountName}
                      onChange={(e) => setBankAccountName(e.target.value)}
                      placeholder="John Doe"
                      className="bg-secondary/30 border-border/50"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Account Number</Label>
                    <Input
                      value={bankAccountNumber}
                      onChange={(e) => setBankAccountNumber(e.target.value)}
                      placeholder="1234567890"
                      className="bg-secondary/30 border-border/50"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Bank Name</Label>
                    <Input
                      value={bankName}
                      onChange={(e) => setBankName(e.target.value)}
                      placeholder="Bank Name"
                      className="bg-secondary/30 border-border/50"
                    />
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 border border-border/50">
                <div className="flex-1">
                  <p className="text-sm font-medium">Stripe (Card Payments)</p>
                  <p className="text-xs text-muted-foreground">Credit/Debit card processing</p>
                </div>
                <Switch checked={enableStripe} onCheckedChange={setEnableStripe} />
              </div>
              {enableStripe && (
                <div className="space-y-3 pl-4 border-l-2 border-primary/30">
                  <div className="rounded-lg border border-border/60 bg-secondary/20 p-3 space-y-3">
                    <div className="flex items-center gap-2">
                      <KeyRound className="w-4 h-4 text-primary" />
                      <p className="text-sm font-medium">Stripe Configuration (Required)</p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Paste Stripe keys here and click save. Configuration is applied live to checkout and webhook handlers.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full justify-center"
                      onClick={() => setShowGuide((v) => !v)}
                    >
                      <BookOpen className="w-4 h-4 mr-2" />
                      {showGuide ? "Hide Setup Guide" : "Show Setup Guide"}
                    </Button>
                    {showGuide && (
                      <div className="rounded-md border border-border/50 p-3 bg-secondary/20 space-y-2">
                        <p className="text-xs font-medium">Stripe Setup Guide</p>
                        <ol className="text-xs text-muted-foreground list-decimal pl-4 space-y-1">
                          <li>Open Stripe Dashboard and switch to Test or Live mode.</li>
                          <li>Copy Stripe Secret Key and paste it below.</li>
                          <li>In Stripe, create webhook endpoint: <span className="font-mono">{webhookExampleEndpoint}</span></li>
                          <li>Select events: <span className="font-mono">checkout.session.completed</span>, <span className="font-mono">invoice.paid</span>, <span className="font-mono">invoice.payment_failed</span>, <span className="font-mono">customer.subscription.deleted</span>.</li>
                          <li>Copy webhook signing secret (<span className="font-mono">whsec_...</span>) and paste it below.</li>
                          <li>Optional: paste Publishable Key for future frontend usage.</li>
                          <li>Click <span className="font-medium">Save Payment Settings</span>, then run one test checkout.</li>
                        </ol>
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label className="text-xs">Stripe Secret Key</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          type={showStripeSecret ? "text" : "password"}
                          value={stripeSecretKey}
                          onChange={(e) => setStripeSecretKey(e.target.value)}
                          placeholder="sk_test_... or sk_live_..."
                          className="bg-secondary/30 border-border/50 font-mono text-xs"
                          disabled={isLoadingStripeConfig}
                        />
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-9 w-9 shrink-0"
                          onClick={() => setShowStripeSecret((v) => !v)}
                        >
                          {showStripeSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs">Stripe Webhook Secret</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          type={showWebhookSecret ? "text" : "password"}
                          value={stripeWebhookSecret}
                          onChange={(e) => setStripeWebhookSecret(e.target.value)}
                          placeholder="whsec_..."
                          className="bg-secondary/30 border-border/50 font-mono text-xs"
                          disabled={isLoadingStripeConfig}
                        />
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-9 w-9 shrink-0"
                          onClick={() => setShowWebhookSecret((v) => !v)}
                        >
                          {showWebhookSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs">Stripe Publishable Key (Optional)</Label>
                      <Input
                        value={stripePublishableKey}
                        onChange={(e) => setStripePublishableKey(e.target.value)}
                        placeholder="pk_test_... or pk_live_..."
                        className="bg-secondary/30 border-border/50 font-mono text-xs"
                        disabled={isLoadingStripeConfig}
                      />
                    </div>

                  </div>
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                Users will only see enabled payment methods on the subscription page.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-secondary/30 border border-border/50">
              <h4 className="font-medium mb-3 text-sm flex items-center gap-2">
                <CreditCard className="w-4 h-4" />
                Configuration Summary
              </h4>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">USDT</span>
                  <Badge variant="outline" className={cn(enableUsdtTrc20 ? "text-success border-success/30" : "text-muted-foreground")}>
                    {enableUsdtTrc20 ? "Enabled" : "Disabled"}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Bank Transfer</span>
                  <Badge variant="outline" className={cn(enableBankTransfer ? "text-success border-success/30" : "text-muted-foreground")}>
                    {enableBankTransfer ? "Enabled" : "Disabled"}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Stripe</span>
                  <Badge variant="outline" className={cn(enableStripe ? "text-success border-success/30" : "text-muted-foreground")}>
                    {enableStripe ? "Enabled" : "Disabled"}
                  </Badge>
                </div>
              </div>
            </div>

            <Button onClick={handleSave} className="w-full" disabled={isSaving || isLoading || isLoadingStripeConfig}>
              {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
              {isSaving ? "Saving..." : "Save Payment Settings"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};

export default AdminPaymentSettings;
