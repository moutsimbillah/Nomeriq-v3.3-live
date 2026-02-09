import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { countries } from "@/constants/countries";
import {
  User,
  Mail,
  Phone,
  CheckCircle2,
  ArrowRight,
  Globe,
  Clock,
  Languages,
  DollarSign,
  Bell,
  Shield,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useAdminRoleContext } from "@/contexts/AdminRoleContext";
import { useGlobalSettings } from "@/hooks/useGlobalSettings";
import { cn } from "@/lib/utils";
import { differenceInDays } from "date-fns";

const Settings = () => {
  const navigate = useNavigate();
  const { user, subscription, hasActiveSubscription } = useAuth();
  const { adminRole } = useAdminRoleContext();
  const { settings } = useGlobalSettings();

  const [notifications, setNotifications] = useState({
    liveSignalAlerts: true,
    executionReports: true,
    weeklyInsights: false,
  });

  const [phoneNumber, setPhoneNumber] = useState("");
  const [isLoadingPhone, setIsLoadingPhone] = useState(true);

  const [country, setCountry] = useState("");
  const [isLoadingCountry, setIsLoadingCountry] = useState(true);

  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  // Fetch phone number and country from profile
  useEffect(() => {
    const fetchProfile = async () => {
      if (!user?.id) return;

      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('phone, country, username, first_name, last_name')
          .eq('user_id', user.id)
          .single();

        if (error) throw error;

        const profileData = data as any;

        if (profileData?.phone) {
          setPhoneNumber(profileData.phone);
        }
        if (profileData?.country) {
          setCountry(profileData.country);
        }
        if (profileData?.username) {
          setUsername(profileData.username);
        }
        if (profileData?.first_name || profileData?.last_name) {
          setFullName(`${profileData.first_name || ''} ${profileData.last_name || ''}`.trim());
        } else if (user?.user_metadata?.full_name) {
          setFullName(user.user_metadata.full_name);
        }
      } catch (error) {
        console.error('Error fetching profile:', error);
      } finally {
        setIsLoadingPhone(false);
        setIsLoadingCountry(false);
      }
    };

    fetchProfile();
  }, [user?.id]);

  const [systemPreferences, setSystemPreferences] = useState({
    currency: "USD",
    timezone: "UTC-5 (New York)",
    language: "English (US)",
  });

  const userDisplayName = user?.user_metadata?.first_name
    ? `${user.user_metadata.first_name} ${user.user_metadata.last_name || ""}`
    : user?.email?.split("@")[0] || "User";

  // Backwards compatibility for templates using these variables
  const userName = userDisplayName;
  const userEmail = user?.email || "";

  // Determine user role based on admin role first, then subscription status
  const userRole = adminRole === "super_admin"
    ? "Super Admin"
    : adminRole === "signal_provider_admin"
      ? "Signal Provider Admin"
      : adminRole === "payments_admin"
        ? "Payments Admin"
        : hasActiveSubscription
          ? "Trader"
          : "Member";

  const userInitials = userDisplayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
  const isVerified = user?.user_metadata?.custom_email_verified === true;
  const userRegion = "United States";
  const joinedDate = user?.created_at ? new Date(user.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : "Jan 2026";

  // Subscription info
  const subscriptionInfo = (() => {
    if (!subscription) {
      return {
        status: 'inactive',
        statusText: 'INACTIVE',
        daysText: 'No subscription',
        daysRemaining: 0
      };
    }
    const isActive = hasActiveSubscription;
    const expiresAt = subscription.expires_at ? new Date(subscription.expires_at) : null;
    if (!isActive) {
      return {
        status: 'inactive',
        statusText: 'INACTIVE',
        daysText: 'Expired',
        daysRemaining: 0
      };
    }
    if (expiresAt) {
      const daysRemaining = differenceInDays(expiresAt, new Date());
      return {
        status: 'active',
        statusText: 'ACTIVE',
        daysText: `${daysRemaining} days remaining`,
        daysRemaining
      };
    }
    return {
      status: 'active',
      statusText: 'ACTIVE',
      daysText: 'Lifetime access',
      daysRemaining: 999
    };
  })();

  const subscriptionPrice = settings?.subscription_price || 10;
  const subscriptionTier = hasActiveSubscription ? "INSTITUTIONAL PRO" : "FREE";

  return (
    <DashboardLayout title="">
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
              <h1 className="text-3xl font-bold">{userDisplayName}</h1>
              <Badge className="bg-primary/20 text-primary border-primary/30 hover:bg-primary/30">
                {subscriptionTier}
              </Badge>
            </div>
            <p className="text-muted-foreground mb-2">
              {userRole} • Joined {joinedDate}
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
          {/* Left Column - Forms */}
          <div className="lg:col-span-2 space-y-6">
            {/* Personal Information */}
            <Card className="border-border/50">
              <div className="p-4 border-b border-border/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <User className="w-5 h-5 text-primary" />
                    <h2 className="text-lg font-semibold">Personal Information</h2>
                  </div>
                  <Button
                    variant="link"
                    className="text-primary h-auto p-0 text-sm"
                    onClick={() => {
                      const handleSaveChanges = async () => {
                        if (!user?.id) return;
                        setIsSaving(true);
                        try {
                          const [firstName, ...lastNameParts] = fullName.split(' ');
                          const lastName = lastNameParts.join(' ');

                          const { error } = await supabase
                            .from('profiles')
                            .update({
                              first_name: firstName,
                              last_name: lastName,
                              phone: phoneNumber,
                              country: country
                            })
                            .eq('user_id', user.id);

                          if (error) throw error;

                          // Also update auth metadata for consistency
                          await supabase.auth.updateUser({
                            data: {
                              first_name: firstName,
                              last_name: lastName,
                              phone: phoneNumber,
                              country: country,
                              full_name: fullName
                            }
                          });

                          toast({
                            title: "Profile updated",
                            description: "Your personal information has been saved successfully.",
                            variant: "default",
                            className: "bg-success border-success text-white"
                          });
                        } catch (error) {
                          console.error('Error saving profile:', error);
                          toast({
                            title: "Error",
                            description: "Failed to save profile. Please try again.",
                            variant: "destructive",
                          });
                        } finally {
                          setIsSaving(false);
                        }
                      };
                      handleSaveChanges();
                    }}
                    disabled={isSaving}
                  >
                    {isSaving ? "Saving..." : "Save Changes"}
                  </Button>
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
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        className="pl-10 bg-secondary/30 border-border/50"
                        placeholder="Enter your full name"
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
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                      Username
                    </Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">@</span>
                      <Input
                        value={username || ""}
                        readOnly={true}
                        disabled={true}
                        className="pl-8 bg-secondary/30 border-border/50"
                        placeholder="Not set"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                      Phone Number
                    </Label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value)}
                        placeholder="Add phone number"
                        className="pl-10 bg-secondary/30 border-border/50"
                        disabled={isLoadingPhone}
                      />
                    </div>
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                      Country
                    </Label>
                    <Select value={country} onValueChange={setCountry}>
                      <SelectTrigger className="bg-secondary/30 border-border/50">
                        <SelectValue placeholder="Select your country" />
                      </SelectTrigger>
                      <SelectContent className="max-h-[300px]">
                        {countries.map((c) => (
                          <SelectItem key={c} value={c}>
                            {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* System Preferences */}
            <Card className="border-border/50">
              <div className="p-4 border-b border-border/50">
                <div className="flex items-center gap-2">
                  <Shield className="w-5 h-5 text-primary" />
                  <h2 className="text-lg font-semibold">System Preferences</h2>
                </div>
              </div>
              <CardContent className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                      Default Currency
                    </Label>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground z-10" />
                      <Select
                        value={systemPreferences.currency}
                        onValueChange={(value) =>
                          setSystemPreferences({ ...systemPreferences, currency: value })
                        }
                      >
                        <SelectTrigger className="pl-10 bg-secondary/30 border-border/50">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="USD">USD</SelectItem>
                          <SelectItem value="EUR">EUR</SelectItem>
                          <SelectItem value="GBP">GBP</SelectItem>
                          <SelectItem value="JPY">JPY</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                      Trading Timezone
                    </Label>
                    <div className="relative">
                      <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground z-10" />
                      <Select
                        value={systemPreferences.timezone}
                        onValueChange={(value) =>
                          setSystemPreferences({ ...systemPreferences, timezone: value })
                        }
                      >
                        <SelectTrigger className="pl-10 bg-secondary/30 border-border/50">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="UTC-5 (New York)">UTC-5 (New York)</SelectItem>
                          <SelectItem value="UTC+0 (London)">UTC+0 (London)</SelectItem>
                          <SelectItem value="UTC+1 (Paris)">UTC+1 (Paris)</SelectItem>
                          <SelectItem value="UTC+8 (Singapore)">UTC+8 (Singapore)</SelectItem>
                          <SelectItem value="UTC+9 (Tokyo)">UTC+9 (Tokyo)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                      Interface Language
                    </Label>
                    <div className="relative">
                      <Languages className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground z-10" />
                      <Select
                        value={systemPreferences.language}
                        onValueChange={(value) =>
                          setSystemPreferences({ ...systemPreferences, language: value })
                        }
                      >
                        <SelectTrigger className="pl-10 bg-secondary/30 border-border/50">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="English (US)">English (US)</SelectItem>
                          <SelectItem value="English (UK)">English (UK)</SelectItem>
                          <SelectItem value="Spanish">Spanish</SelectItem>
                          <SelectItem value="French">French</SelectItem>
                          <SelectItem value="German">German</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Security & Access */}
            <Card className="border-border/50">
              <div className="p-4 border-b border-border/50">
                <div className="flex items-center gap-2">
                  <Shield className="w-5 h-5 text-primary" />
                  <h2 className="text-lg font-semibold">Security & Access</h2>
                </div>
              </div>
              <CardContent className="p-6">
                <div className="space-y-4">
                  <Button variant="outline" className="w-full justify-start">
                    <Shield className="w-4 h-4 mr-2" />
                    Change Password
                  </Button>
                  <Button variant="outline" className="w-full justify-start">
                    <Shield className="w-4 h-4 mr-2" />
                    Two-Factor Authentication
                  </Button>
                  <Button variant="outline" className="w-full justify-start text-destructive hover:text-destructive">
                    <Shield className="w-4 h-4 mr-2" />
                    Manage Sessions
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Subscription & Alerts */}
          <div className="space-y-6">
            {/* Subscription Card */}
            <Card className="border-border/50 bg-gradient-to-br from-primary/5 to-transparent">
              <div className="p-4 border-b border-border/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Globe className="w-5 h-5 text-primary" />
                    <h2 className="text-lg font-semibold">Subscription</h2>
                  </div>
                  <Badge
                    className={cn(
                      "text-xs font-semibold",
                      subscriptionInfo.status === "active"
                        ? "bg-success/20 text-success border-success/30"
                        : "bg-destructive/20 text-destructive border-destructive/30"
                    )}
                  >
                    {subscriptionInfo.statusText}
                  </Badge>
                </div>
              </div>
              <CardContent className="p-6 space-y-6">
                <div>
                  <div className="text-sm text-muted-foreground mb-1">TIME REMAINING</div>
                  <div className="text-2xl font-bold mb-4">{subscriptionInfo.daysText}</div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-4xl font-bold text-primary">${subscriptionPrice}</span>
                    <span className="text-muted-foreground">/mo</span>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="w-4 h-4 text-success" />
                    <span>Institutional Speed Signals</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="w-4 h-4 text-success" />
                    <span>Advanced Performance Analytics</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="w-4 h-4 text-success" />
                    <span>Unlimited Trade Journaling</span>
                  </div>
                </div>

                <Button
                  className="w-full bg-primary hover:bg-primary/90"
                  onClick={() => navigate("/subscription")}
                >
                  Upgrade Subscription
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </CardContent>
            </Card>

            {/* Alerts */}
            <Card className="border-border/50">
              <div className="p-4 border-b border-border/50">
                <div className="flex items-center gap-2">
                  <Bell className="w-5 h-5 text-primary" />
                  <h2 className="text-lg font-semibold">Alerts</h2>
                </div>
              </div>
              <CardContent className="p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">Live Signal Alerts</div>
                  </div>
                  <Switch
                    checked={notifications.liveSignalAlerts}
                    onCheckedChange={(checked) =>
                      setNotifications({ ...notifications, liveSignalAlerts: checked })
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">Execution Reports</div>
                  </div>
                  <Switch
                    checked={notifications.executionReports}
                    onCheckedChange={(checked) =>
                      setNotifications({ ...notifications, executionReports: checked })
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">Weekly Insights</div>
                  </div>
                  <Switch
                    checked={notifications.weeklyInsights}
                    onCheckedChange={(checked) =>
                      setNotifications({ ...notifications, weeklyInsights: checked })
                    }
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Settings;
