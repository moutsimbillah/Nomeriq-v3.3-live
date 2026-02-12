import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  Shield,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useAdminRoleContext } from "@/contexts/AdminRoleContext";
import { useSubscriptionPackages, useUserSubscriptions } from "@/hooks/useSubscriptionPackages";
import { cn } from "@/lib/utils";
import { differenceInDays } from "date-fns";

const Settings = () => {
  const navigate = useNavigate();
  const { user, subscription, hasActiveSubscription } = useAuth();
  const { adminRole } = useAdminRoleContext();
  const isSignalProvider = adminRole === "signal_provider_admin";
  const { packages } = useSubscriptionPackages();
  const { activeSubscriptions } = useUserSubscriptions();

  const [phoneNumber, setPhoneNumber] = useState("");
  const [isLoadingPhone, setIsLoadingPhone] = useState(true);

  const [country, setCountry] = useState("");
  const [isLoadingCountry, setIsLoadingCountry] = useState(true);

  const [username, setUsername] = useState("");
  const [telegramUsername, setTelegramUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [isSendingPasswordReset, setIsSendingPasswordReset] = useState(false);
  const { toast } = useToast();

  const handleChangePassword = async () => {
    if (!user?.email) {
      toast({
        title: "Email not found",
        description: "No account email found for password reset.",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsSendingPasswordReset(true);
      const { error } = await supabase.functions.invoke("send-password-reset", {
        body: { email: user.email },
      });

      if (error) throw error;

      toast({
        title: "Verification code sent",
        description: "Check your inbox for the 6-digit code to reset your password.",
      });
      navigate("/reset-password", { state: { email: user.email } });
    } catch (error: any) {
      console.error("Error sending password reset code:", error);
      toast({
        title: "Failed to send verification code",
        description: "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSendingPasswordReset(false);
    }
  };

  // Fetch phone number and country from profile
  useEffect(() => {
    const fetchProfile = async () => {
      if (!user?.id) return;

      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('phone, country, username, telegram_username, first_name, last_name')
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
        if (profileData?.telegram_username) {
          setTelegramUsername(profileData.telegram_username);
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

  const currentActiveSubscription = activeSubscriptions[0] ?? null;
  const currentPlan = useMemo(() => {
    if (!currentActiveSubscription?.package_id) return null;
    return packages.find((p) => p.id === currentActiveSubscription.package_id) ?? null;
  }, [packages, currentActiveSubscription?.package_id]);

  const subscriptionPrice = currentPlan ? Number(currentPlan.price) : 0;
  const subscriptionTier = isSignalProvider
    ? "SIGNAL PROVIDER"
    : hasActiveSubscription
      ? (currentPlan?.name?.toUpperCase() || "ACTIVE PLAN")
      : "FREE";
  const subscriptionDurationLabel = currentPlan
    ? currentPlan.duration_type === "lifetime"
      ? "/lifetime"
      : currentPlan.duration_type === "yearly"
      ? "/yr"
      : "/mo"
    : "";
  const currentPlanFeatures = currentPlan?.features?.slice(0, 3) ?? [];
  const currentPlanCategories = currentPlan?.categories ?? [];

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
                  {/* Save button removed as per requirement to disable editing */}
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
                        readOnly
                        disabled
                        className="pl-10 bg-secondary/30 border-border/50 cursor-not-allowed opacity-70"
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
                        readOnly
                        disabled
                        className="pl-10 bg-secondary/30 border-border/50 cursor-not-allowed opacity-70"
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
                        className="pl-8 bg-secondary/30 border-border/50 cursor-not-allowed opacity-70"
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
                        readOnly
                        disabled
                        placeholder="Add phone number"
                        className="pl-10 bg-secondary/30 border-border/50 cursor-not-allowed opacity-70"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                      Telegram Username
                    </Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">@</span>
                      <Input
                        value={(telegramUsername || "").replace(/^@/, "")}
                        readOnly
                        disabled
                        placeholder="Not set"
                        className="pl-8 bg-secondary/30 border-border/50 cursor-not-allowed opacity-70"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                      Country
                    </Label>
                    <Select value={country} disabled>
                      <SelectTrigger className="bg-secondary/30 border-border/50 cursor-not-allowed opacity-70">
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
                <div className="mt-4 p-3 bg-primary/10 border border-primary/20 rounded-md">
                  <p className="text-xs text-primary flex items-center gap-2">
                    <Shield className="w-3 h-3" />
                    Profile details are managed by administrators. Contact support to update your information.
                  </p>
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
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    onClick={handleChangePassword}
                    disabled={isSendingPasswordReset}
                  >
                    <Shield className="w-4 h-4 mr-2" />
                    {isSendingPasswordReset ? "Sending verification code..." : "Change Password"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Alerts (subscription section hidden for signal providers) */}
          <div className="space-y-6">
            {!isSignalProvider && (
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
                      <span className="text-4xl font-bold text-primary">
                        {hasActiveSubscription ? `$${subscriptionPrice}` : "$0"}
                      </span>
                      <span className="text-muted-foreground">
                        {hasActiveSubscription ? subscriptionDurationLabel : ""}
                      </span>
                    </div>
                  </div>

                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                      Plan Categories
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {currentPlanCategories.length > 0 ? (
                        currentPlanCategories.map((category) => (
                          <Badge
                            key={category}
                            variant="outline"
                            className="h-6 rounded-full px-2.5 py-0 text-[11px] font-medium leading-none"
                          >
                            {category}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {hasActiveSubscription ? "No categories configured" : "No active plan"}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-3">
                    {currentPlanFeatures.length > 0 ? (
                      currentPlanFeatures.map((feature) => (
                        <div key={feature.id} className="flex items-center gap-2 text-sm">
                          <CheckCircle2 className="w-4 h-4 text-success" />
                          <span>{feature.feature_text}</span>
                        </div>
                      ))
                    ) : (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <CheckCircle2 className="w-4 h-4 text-muted-foreground" />
                        <span>{hasActiveSubscription ? "Plan features unavailable" : "No active subscription plan"}</span>
                      </div>
                    )}
                  </div>

                  <Button
                    className="w-full bg-primary hover:bg-primary/90 text-white"
                    onClick={() => navigate("/subscription")}
                  >
                    {hasActiveSubscription ? "Upgrade Subscription" : "Choose Subscription"}
                    <ArrowRight className="w-4 h-4 ml-2 text-white" />
                  </Button>
                </CardContent>
              </Card>
            )}

          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Settings;
