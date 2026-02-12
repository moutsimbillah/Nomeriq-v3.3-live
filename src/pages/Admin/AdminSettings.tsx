import { useState, useEffect } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Shield,
  DollarSign,
  AlertTriangle,
  Copy,
  Check,
  Loader2,
  Globe,
  Clock,
  CheckCircle2,
  User,
  Mail,
  Settings as SettingsIcon,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useAdminRoleContext } from "@/contexts/AdminRoleContext";
import { useGlobalSettings } from "@/hooks/useGlobalSettings";
import { TelegramIntegrationSection } from "@/components/settings/TelegramIntegrationSection";
import { TIMEZONES } from "@/hooks/useTimezone";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

const AdminSettings = () => {
  const { user } = useAuth();
  const { adminRole } = useAdminRoleContext();
  const { settings, isLoading, updateSettings } = useGlobalSettings();

  const [globalRisk, setGlobalRisk] = useState("2");
  const [subscriptionPrice, setSubscriptionPrice] = useState("50");
  const [walletAddress, setWalletAddress] = useState("");
  const [timezone, setTimezone] = useState("UTC");
  const [isSaving, setIsSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  // Payment method states
  const [enableUsdtTrc20, setEnableUsdtTrc20] = useState(true);
  const [enableBankTransfer, setEnableBankTransfer] = useState(false);
  const [enableStripe, setEnableStripe] = useState(false);
  const [bankAccountName, setBankAccountName] = useState("");
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [bankName, setBankName] = useState("");

  const [country, setCountry] = useState("");
  const [isLoadingCountry, setIsLoadingCountry] = useState(true);

  // Fetch country from profile
  useEffect(() => {
    const fetchProfile = async () => {
      if (!user?.id) return;

      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('country')
          .eq('user_id', user.id)
          .single();

        if (error) throw error;

        const profileData = data as any;

        if (profileData?.country) {
          setCountry(profileData.country);
        }
      } catch (error) {
        console.error('Error fetching profile:', error);
      } finally {
        setIsLoadingCountry(false);
      }
    };

    fetchProfile();
  }, [user?.id]);

  // Get user display info
  const userEmail = user?.email || "";
  const userName = user?.user_metadata?.full_name || "Admin User";
  const userRole =
    adminRole === "super_admin"
      ? "Super Admin"
      : adminRole === "signal_provider_admin"
        ? "Signal Provider Admin"
        : "Payments Admin";
  const userInitials = userName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
  const isVerified = user?.user_metadata?.custom_email_verified === true;
  const joinedDate = user?.created_at
    ? new Date(user.created_at).toLocaleDateString("en-US", {
      month: "short",
      year: "numeric",
    })
    : "Jan 2026";

  const canConfigureTelegram =
    adminRole === "signal_provider_admin" || adminRole === "super_admin";

  // Initialize form from settings
  useEffect(() => {
    if (settings) {
      setGlobalRisk(settings.global_risk_percent.toString());
      setSubscriptionPrice(settings.subscription_price.toString());
      setWalletAddress(settings.wallet_address);
      setTimezone(settings.timezone || "UTC");
      // Payment methods
      setEnableUsdtTrc20(settings.enable_usdt_trc20 ?? true);
      setEnableBankTransfer(settings.enable_bank_transfer ?? false);
      setEnableStripe(settings.enable_stripe ?? false);
      setBankAccountName(settings.bank_account_name || "");
      setBankAccountNumber(settings.bank_account_number || "");
      setBankName(settings.bank_name || "");
    }
  }, [settings]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateSettings({
        global_risk_percent: parseFloat(globalRisk),
        subscription_price: parseFloat(subscriptionPrice),
        wallet_address: walletAddress,
        timezone: timezone,
        enable_usdt_trc20: enableUsdtTrc20,
        enable_bank_transfer: enableBankTransfer,
        enable_stripe: enableStripe,
        bank_account_name: bankAccountName || null,
        bank_account_number: bankAccountNumber || null,
        bank_name: bankName || null,
      });
      toast.success("Settings saved successfully!");
    } catch (err) {
      console.error("Error saving settings:", err);
      toast.error("Failed to save settings");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopyWallet = () => {
    navigator.clipboard.writeText(walletAddress);
    setCopied(true);
    toast.success("Wallet address copied!");
    setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading) {
    return (
      <AdminLayout title="">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        {/* Profile Header */}
        <div className="flex items-center gap-6">
          <div className="relative">
            <Avatar className="h-24 w-24 border-4 border-primary/30">
              <AvatarImage src={user?.user_metadata?.avatar_url} />
              <AvatarFallback className="text-2xl font-bold bg-gradient-to-br from-primary to-primary/60">
                {userInitials}
              </AvatarFallback>
            </Avatar>
            {isVerified && (
              <div className="absolute -bottom-1 -right-1 bg-success rounded-full p-1">
                <CheckCircle2 className="w-5 h-5 text-white" />
              </div>
            )}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-3xl font-bold">{userName}</h1>
              <Badge className="bg-primary/20 text-primary border-primary/30 hover:bg-primary/30">
                {userRole}
              </Badge>
            </div>
            <p className="text-muted-foreground mb-2">
              Platform Administrator • Joined {joinedDate}
            </p>
            <div className="flex items-center gap-6 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">ACCOUNT STATUS</span>
                <div className="flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4 text-success" />
                  <span className="text-success font-medium">Fully Verified</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground uppercase tracking-wide text-xs">COUNTRY</span>
                <span className="font-medium">{isLoadingCountry ? "Loading..." : country || "Not set"}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Main Settings */}
          <div className="lg:col-span-2 space-y-6">
            {/* Admin Information */}
            <Card className="border-border/50">
              <div className="p-4 border-b border-border/50">
                <div className="flex items-center gap-2">
                  <User className="w-5 h-5 text-primary" />
                  <h2 className="text-lg font-semibold">Admin Information</h2>
                </div>
              </div>
              <CardContent className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                      Full Name
                    </Label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        defaultValue={userName}
                        className="pl-10 bg-secondary/30 border-border/50"
                        disabled
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                      Email Address
                    </Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        defaultValue={userEmail}
                        className="pl-10 bg-secondary/30 border-border/50"
                        disabled
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Timezone Settings */}
            <Card className="border-border/50">
              <div className="p-4 border-b border-border/50">
                <div className="flex items-center gap-2">
                  <Globe className="w-5 h-5 text-primary" />
                  <h2 className="text-lg font-semibold">Timezone Settings</h2>
                </div>
              </div>
              <CardContent className="p-6 space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                    Website Timezone
                  </Label>
                  <div className="relative">
                    <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground z-10" />
                    <Select value={timezone} onValueChange={setTimezone}>
                      <SelectTrigger className="pl-10 bg-secondary/30 border-border/50">
                        <SelectValue placeholder="Select timezone" />
                      </SelectTrigger>
                      <SelectContent>
                        {TIMEZONES.map((tz) => (
                          <SelectItem key={tz.value} value={tz.value}>
                            {tz.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    All dates and times throughout the website will be displayed in this
                    timezone.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-primary/5 border border-primary/10">
                  <p className="text-sm">
                    <span className="text-muted-foreground">Current timezone: </span>
                    <span className="font-semibold">
                      {TIMEZONES.find((tz) => tz.value === timezone)?.label || timezone}
                    </span>
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Risk Management */}
            <Card className="border-border/50">
              <div className="p-4 border-b border-border/50">
                <div className="flex items-center gap-2">
                  <Shield className="w-5 h-5 text-warning" />
                  <h2 className="text-lg font-semibold">Risk Management</h2>
                </div>
              </div>
              <CardContent className="p-6 space-y-6">
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                    Global Risk Per Trade
                  </Label>
                  <Select value={globalRisk} onValueChange={setGlobalRisk}>
                    <SelectTrigger className="bg-secondary/30 border-border/50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1% - Conservative</SelectItem>
                      <SelectItem value="2">2% - Moderate (Recommended)</SelectItem>
                      <SelectItem value="3">3% - Aggressive</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    This setting affects all new signals. Users cannot change this.
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div
                    className={`p-4 rounded-xl text-center transition-all ${globalRisk === "1"
                      ? "bg-primary/10 border border-primary/30"
                      : "bg-secondary/30"
                      }`}
                  >
                    <p className="text-2xl font-bold">1%</p>
                    <p className="text-xs text-muted-foreground">Conservative</p>
                    <p className="text-xs text-success mt-1">Lower risk</p>
                  </div>
                  <div
                    className={`p-4 rounded-xl text-center transition-all ${globalRisk === "2"
                      ? "bg-primary/10 border border-primary/30"
                      : "bg-secondary/30"
                      }`}
                  >
                    <p className="text-2xl font-bold">2%</p>
                    <p className="text-xs text-muted-foreground">Moderate</p>
                    <p className="text-xs text-primary mt-1">Recommended</p>
                  </div>
                  <div
                    className={`p-4 rounded-xl text-center transition-all ${globalRisk === "3"
                      ? "bg-primary/10 border border-primary/30"
                      : "bg-secondary/30"
                      }`}
                  >
                    <p className="text-2xl font-bold">3%</p>
                    <p className="text-xs text-muted-foreground">Aggressive</p>
                    <p className="text-xs text-destructive mt-1">Higher risk</p>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-warning/10 border border-warning/20">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm text-warning font-medium">Important Notice</p>
                      <p className="text-xs text-warning/80 mt-1">
                        Changing the global risk setting will only affect new signals. Existing
                        active trades will maintain their original risk levels.
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Subscription Settings & Telegram */}
          <div className="space-y-6">
            {/* Telegram Integration - Only for Signal Provider Admins */}
            {canConfigureTelegram && <TelegramIntegrationSection />}
            {/* Subscription Settings */}
            <Card className="border-border/50 bg-gradient-to-br from-success/5 to-transparent">
              <div className="p-4 border-b border-border/50">
                <div className="flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-success" />
                  <h2 className="text-lg font-semibold">Subscription Settings</h2>
                </div>
              </div>
              <CardContent className="p-6 space-y-6">
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                    Monthly Price (USDT)
                  </Label>
                  <div className="flex gap-3">
                    <Input
                      type="number"
                      value={subscriptionPrice}
                      onChange={(e) => setSubscriptionPrice(e.target.value)}
                      className="bg-secondary/30 border-border/50"
                    />
                    <span className="flex items-center px-4 rounded-lg bg-secondary/30 text-sm font-medium border border-border/50">
                      USDT
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                    USDT Wallet (TRC20)
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      value={walletAddress}
                      onChange={(e) => setWalletAddress(e.target.value)}
                      className="bg-secondary/30 border-border/50 font-mono text-sm"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={handleCopyWallet}
                      className="shrink-0"
                    >
                      {copied ? (
                        <Check className="w-4 h-4 text-success" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    This address is displayed to users during payment.
                  </p>
                </div>

                {/* Payment Methods Configuration */}
                <div className="space-y-4 pt-4 border-t border-border/50">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                    Enabled Payment Methods
                  </Label>

                  {/* USDT TRC20 Toggle */}
                  <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 border border-border/50">
                    <div className="flex-1">
                      <p className="text-sm font-medium">USDT (TRC20)</p>
                      <p className="text-xs text-muted-foreground">Cryptocurrency payment via Tron network</p>
                    </div>
                    <Switch
                      checked={enableUsdtTrc20}
                      onCheckedChange={setEnableUsdtTrc20}
                    />
                  </div>

                  {/* Bank Transfer Toggle */}
                  <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 border border-border/50">
                    <div className="flex-1">
                      <p className="text-sm font-medium">Bank Transfer (Manual)</p>
                      <p className="text-xs text-muted-foreground">Traditional bank account transfer</p>
                    </div>
                    <Switch
                      checked={enableBankTransfer}
                      onCheckedChange={setEnableBankTransfer}
                    />
                  </div>

                  {/* Bank Account Details (shown when bank transfer is enabled) */}
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
                          placeholder="Bank of America"
                          className="bg-secondary/30 border-border/50"
                        />
                      </div>
                    </div>
                  )}

                  {/* Stripe Toggle */}
                  <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 border border-border/50">
                    <div className="flex-1">
                      <p className="text-sm font-medium">Stripe (Card Payments)</p>
                      <p className="text-xs text-muted-foreground">Credit/Debit card processing</p>
                    </div>
                    <Switch
                      checked={enableStripe}
                      onCheckedChange={setEnableStripe}
                    />
                  </div>

                  <p className="text-xs text-muted-foreground">
                    Users will only see enabled payment methods on the subscription page.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-secondary/30 border border-border/50">
                  <h4 className="font-medium mb-3 text-sm">Pricing Summary</h4>
                  <div className="space-y-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Monthly Price</span>
                      <span className="font-semibold">${subscriptionPrice} USDT</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Payment Method</span>
                      <span className="font-semibold">USDT (TRC20)</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Verification</span>
                      <span className="font-semibold">Manual (Admin)</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Network</span>
                      <span className="font-semibold">Tron (TRC20)</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Quick Actions */}
            <Card className="border-border/50">
              <div className="p-4 border-b border-border/50">
                <div className="flex items-center gap-2">
                  <SettingsIcon className="w-5 h-5 text-primary" />
                  <h2 className="text-lg font-semibold">Quick Actions</h2>
                </div>
              </div>
              <CardContent className="p-6 space-y-3">
                <Button
                  onClick={handleSave}
                  className="w-full bg-primary hover:bg-primary/90"
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4 mr-2" />
                  )}
                  {isSaving ? "Saving..." : "Save All Settings"}
                </Button>
                <div className="text-xs text-muted-foreground text-center">
                  Changes will be applied immediately
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
};

export default AdminSettings;