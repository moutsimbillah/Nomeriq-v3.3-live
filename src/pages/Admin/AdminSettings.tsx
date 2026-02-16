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
import {
  Shield,
  AlertTriangle,
  Check,
  Loader2,
  Globe,
  Clock,
  CheckCircle2,
  User,
  Mail,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useAdminRoleContext } from "@/contexts/AdminRoleContext";
import { useGlobalSettings } from "@/hooks/useGlobalSettings";
import { TIMEZONES } from "@/hooks/useTimezone";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

const AdminSettings = () => {
  const { user } = useAuth();
  const { adminRole } = useAdminRoleContext();
  const { settings, isLoading, updateSettings } = useGlobalSettings();

  const [globalRisk, setGlobalRisk] = useState("2");
  const [timezone, setTimezone] = useState("UTC");
  const [isSaving, setIsSaving] = useState(false);

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

  // Initialize form from settings
  useEffect(() => {
    if (settings) {
      setGlobalRisk(settings.global_risk_percent.toString());
      setTimezone(settings.timezone || "UTC");
    }
  }, [settings]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateSettings({
        global_risk_percent: parseFloat(globalRisk),
        timezone: timezone,
      });
      toast.success("Settings saved successfully!");
    } catch (err) {
      console.error("Error saving settings:", err);
      toast.error("Failed to save settings");
    } finally {
      setIsSaving(false);
    }
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

        {/* Main Settings */}
        <div className="space-y-6">
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

            <div className="flex justify-end">
              <Button
                onClick={handleSave}
                className="w-[16%] bg-primary hover:bg-primary/90"
                disabled={isSaving}
              >
                {isSaving ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Check className="w-4 h-4 mr-2" />
                )}
                {isSaving ? "Saving..." : "Save All Settings"}
              </Button>
            </div>
        </div>
      </div>
    </AdminLayout>
  );
};

export default AdminSettings;
