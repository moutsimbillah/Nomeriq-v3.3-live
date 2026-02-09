import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Save, TrendingUp, DollarSign, Target, Activity, Mail, Phone, User, Calendar, AlertTriangle, RefreshCcw, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Profile, Subscription, UserTrade, Signal } from "@/types/database";
import { UserSubscriptionSection } from "@/components/admin/user-details/UserSubscriptionSection";
import { UserPaymentHistory } from "@/components/admin/user-details/UserPaymentHistory";

interface TradeWithSignal extends UserTrade {
  signal: Signal;
}

interface Payment {
  id: string;
  amount: number;
  currency: string;
  tx_hash: string;
  status: string;
  created_at: string;
  verified_at: string | null;
  rejection_reason: string | null;
}
const AdminUserDetails = () => {
  const {
    userId
  } = useParams();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [trades, setTrades] = useState<TradeWithSignal[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isPaymentsLoading, setIsPaymentsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [editedBalance, setEditedBalance] = useState("");
  const [editedRisk, setEditedRisk] = useState("");
  const [editedSubscriptionStatus, setEditedSubscriptionStatus] = useState<string>("");
  const [editedFirstName, setEditedFirstName] = useState("");
  const [editedLastName, setEditedLastName] = useState("");
  const [editedPhone, setEditedPhone] = useState("");

  // Fetch user data
  useEffect(() => {
    if (!userId) return;
    const fetchUserData = async () => {
      setIsLoading(true);
      try {
        // Fetch profile
        const {
          data: profileData,
          error: profileError
        } = await supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle();
        if (profileError) throw profileError;
        setProfile(profileData);
        setEditedBalance(profileData?.account_balance?.toString() || "0");
        setEditedRisk(profileData?.custom_risk_percent?.toString() || "2");
        setEditedFirstName(profileData?.first_name || "");
        setEditedLastName(profileData?.last_name || "");
        setEditedPhone(profileData?.phone || "");

        // Fetch subscription
        const {
          data: subData,
          error: subError
        } = await supabase.from("subscriptions").select("*").eq("user_id", userId).maybeSingle();
        if (subError) throw subError;
        setSubscription(subData as Subscription | null);
        setEditedSubscriptionStatus(subData?.status || "inactive");

        // Fetch trades with signals
        const {
          data: tradesData,
          error: tradesError
        } = await supabase.from("user_trades").select(`*, signal:signals(*)`).eq("user_id", userId).order("created_at", {
          ascending: false
        }).limit(50);
        if (tradesError) throw tradesError;
        setTrades(tradesData as TradeWithSignal[] || []);
      } catch (error) {
        console.error("Error fetching user data:", error);
        toast({
          title: "Error",
          description: "Failed to load user data",
          variant: "destructive"
        });
      } finally {
        setIsLoading(false);
      }
    };
    fetchUserData();
  }, [userId]);

  // Fetch payments separately with real-time subscription
  useEffect(() => {
    if (!userId) return;

    const fetchPayments = async () => {
      setIsPaymentsLoading(true);
      try {
        const { data, error } = await supabase
          .from("payments")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: false });
        
        if (error) throw error;
        setPayments(data || []);
      } catch (error) {
        console.error("Error fetching payments:", error);
      } finally {
        setIsPaymentsLoading(false);
      }
    };

    fetchPayments();

    // Set up real-time subscription for payments
    const channelId = `user-payments-${userId}-${Math.random().toString(36).slice(2)}`;
    const channel = supabase
      .channel(channelId)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "payments",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          fetchPayments();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  // Calculate stats from real trades
  const stats = useMemo(() => {
    const wins = trades.filter(t => t.result === "win").length;
    const losses = trades.filter(t => t.result === "loss").length;
    const pending = trades.filter(t => t.result === "pending").length;
    const closedTrades = wins + losses;
    const winRate = closedTrades > 0 ? wins / closedTrades * 100 : 0;
    const totalPnL = trades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    return {
      totalTrades: trades.length,
      wins,
      losses,
      pending,
      winRate,
      totalPnL
    };
  }, [trades]);

  // Build equity chart data from trades
  const chartData = useMemo(() => {
    const startingBalance = profile?.account_balance || 0;
    if (trades.length === 0) {
      return [{
        date: "Now",
        balance: startingBalance
      }];
    }

    // Calculate cumulative balance from oldest to newest
    const sortedTrades = [...trades].reverse();
    let balance = startingBalance - stats.totalPnL; // Start from original balance

    const data = [{
      date: "Start",
      balance
    }];
    sortedTrades.forEach((trade, index) => {
      if (trade.pnl) {
        balance += trade.pnl;
      }
      data.push({
        date: `Trade ${index + 1}`,
        balance: Math.round(balance * 100) / 100
      });
    });
    return data;
  }, [trades, profile, stats.totalPnL]);
  const handleSave = async () => {
    if (!userId) return;
    
    // Input validation for balance
    const balanceValue = parseFloat(editedBalance);
    if (isNaN(balanceValue) || balanceValue < 0) {
      toast({
        title: "Invalid Balance",
        description: "Account balance must be a positive number.",
        variant: "destructive"
      });
      return;
    }
    if (balanceValue > 10000000) {
      toast({
        title: "Invalid Balance",
        description: "Account balance cannot exceed $10,000,000.",
        variant: "destructive"
      });
      return;
    }
    
    // Input validation for risk percentage
    const riskValue = parseFloat(editedRisk);
    if (isNaN(riskValue) || riskValue < 1 || riskValue > 3) {
      toast({
        title: "Invalid Risk Percentage",
        description: "Risk percentage must be between 1% and 3%.",
        variant: "destructive"
      });
      return;
    }
    
    // Confirmation for large balance changes
    const currentBalance = profile?.account_balance || 0;
    const balanceDifference = Math.abs(balanceValue - currentBalance);
    if (balanceDifference > 10000) {
      const confirmed = window.confirm(
        `You are about to change the balance by $${balanceDifference.toLocaleString()}. Are you sure you want to proceed?`
      );
      if (!confirmed) return;
    }
    
    setIsSaving(true);
    try {
      // Update profile (balance, risk, and personal info)
      const {
        error: profileError,
        data: updatedProfile
      } = await supabase.from("profiles").update({
        account_balance: balanceValue,
        custom_risk_percent: riskValue,
        first_name: editedFirstName.trim() || null,
        last_name: editedLastName.trim() || null,
        phone: editedPhone.trim() || null,
        updated_at: new Date().toISOString()
      }).eq("user_id", userId).select().single();
      if (profileError) throw profileError;

      // Update subscription status
      const {
        error: subError
      } = await supabase.from("subscriptions").update({
        status: editedSubscriptionStatus,
        starts_at: editedSubscriptionStatus === "active" ? new Date().toISOString() : subscription?.starts_at,
        expires_at: editedSubscriptionStatus === "active" ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() : subscription?.expires_at,
        updated_at: new Date().toISOString()
      }).eq("user_id", userId);
      if (subError) throw subError;

      // Update local state
      setProfile(prev => prev ? {
        ...prev,
        account_balance: balanceValue,
        custom_risk_percent: riskValue,
        first_name: editedFirstName.trim() || null,
        last_name: editedLastName.trim() || null,
        phone: editedPhone.trim() || null,
        updated_at: new Date().toISOString()
      } : null);
      setSubscription(prev => prev ? {
        ...prev,
        status: editedSubscriptionStatus as Subscription["status"]
      } : null);
      toast({
        title: "Changes Saved",
        description: "User settings have been updated successfully."
      });
    } catch (error) {
      console.error("Error saving changes:", error);
      toast({
        title: "Error",
        description: "Failed to save changes. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };
  const handleResetAccount = async () => {
    if (!userId || !profile) return;
    const confirmed = window.confirm("Are you sure you want to reset this user's account? This will delete all trades and reset the balance to $0. This action cannot be undone.");
    if (!confirmed) return;
    setIsResetting(true);
    try {
      // Delete all user trades
      const {
        error: tradesError
      } = await supabase.from("user_trades").delete().eq("user_id", userId);
      if (tradesError) throw tradesError;

      // Reset account balance
      const {
        error: profileError
      } = await supabase.from("profiles").update({
        account_balance: 0,
        balance_set_at: null,
        updated_at: new Date().toISOString()
      }).eq("user_id", userId);
      if (profileError) throw profileError;

      // Update local state
      setTrades([]);
      setProfile(prev => prev ? {
        ...prev,
        account_balance: 0,
        balance_set_at: null
      } : null);
      setEditedBalance("0");
      toast({
        title: "Account Reset",
        description: "User account has been reset successfully."
      });
    } catch (error) {
      console.error("Error resetting account:", error);
      toast({
        title: "Error",
        description: "Failed to reset account. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsResetting(false);
    }
  };
  if (isLoading) {
    return <AdminLayout title="">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </AdminLayout>;
  }
  if (!profile) {
    return <AdminLayout title="">
        <div className="text-center py-12">
          <p className="text-muted-foreground">User not found</p>
          <Button onClick={() => navigate("/admin/users")} className="mt-4">
            Back to Users
          </Button>
        </div>
      </AdminLayout>;
  }
  const displayName = profile.first_name && profile.last_name ? `${profile.first_name} ${profile.last_name}` : profile.username || profile.email;
  const currentBalance = profile.account_balance || 0;
  const startingBalance = currentBalance - stats.totalPnL;
  const growthPercent = startingBalance > 0 ? ((currentBalance - startingBalance) / startingBalance * 100).toFixed(1) : "0.0";
  return <AdminLayout title="">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <Button variant="ghost" size="icon" onClick={() => navigate("/admin/users")}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{displayName}</h1>
          <p className="text-muted-foreground">@{profile.username || "no-username"}</p>
        </div>
        <Badge variant="outline" className={cn("text-sm px-3 py-1", subscription?.status === "active" && "border-success/30 text-success bg-success/10", subscription?.status === "pending" && "border-warning/30 text-warning bg-warning/10", (subscription?.status === "expired" || subscription?.status === "inactive") && "border-destructive/30 text-destructive bg-destructive/10")}>
          {(subscription?.status || "inactive").toUpperCase()}
        </Badge>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left Column - User Info & Settings */}
        <div className="space-y-6">
          {/* User Info */}
          <div className="glass-card p-6 shadow-none">
            <h3 className="font-semibold mb-4">User Information</h3>
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary/30">
                <Mail className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm">{profile.email}</span>
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <User className="w-4 h-4 text-muted-foreground" />
                  First Name
                </Label>
                <Input value={editedFirstName} onChange={e => setEditedFirstName(e.target.value)} placeholder="First name" className="bg-secondary/50" />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <User className="w-4 h-4 text-muted-foreground" />
                  Last Name
                </Label>
                <Input value={editedLastName} onChange={e => setEditedLastName(e.target.value)} placeholder="Last name" className="bg-secondary/50" />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-muted-foreground" />
                  Phone Number
                </Label>
                <Input value={editedPhone} onChange={e => setEditedPhone(e.target.value)} placeholder="Phone number" className="bg-secondary/50" />
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary/30">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm">Joined {format(new Date(profile.created_at), "MMM dd, yyyy")}</span>
              </div>
            </div>
          </div>

          {/* Admin Controls */}
          <div className="glass-card p-6 shadow-none">
            <h3 className="font-semibold mb-4">Admin Controls</h3>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Account Balance (USD)</Label>
                <Input type="number" value={editedBalance} onChange={e => setEditedBalance(e.target.value)} className="bg-secondary/50" />
              </div>

              <div className="space-y-2">
                <Label>Risk Per Trade (%)</Label>
                <Select value={editedRisk} onValueChange={setEditedRisk}>
                  <SelectTrigger className="bg-secondary/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1%</SelectItem>
                    <SelectItem value="2">2%</SelectItem>
                    <SelectItem value="3">3%</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Subscription Status</Label>
                <Select value={editedSubscriptionStatus} onValueChange={setEditedSubscriptionStatus}>
                  <SelectTrigger className="bg-secondary/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="expired">Expired</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button onClick={handleSave} className="w-full" variant="gradient" disabled={isSaving}>
                {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                {isSaving ? "Saving..." : "Save Changes"}
              </Button>

              <Button onClick={handleResetAccount} className="w-full" variant="destructive" disabled={isResetting}>
                {isResetting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCcw className="w-4 h-4 mr-2" />}
                {isResetting ? "Resetting..." : "Reset Account"}
              </Button>

              <div className="p-3 rounded-lg bg-warning/10 border border-warning/20">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                  <p className="text-xs text-warning">
                    Changes to balance and risk settings are logged for compliance.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Subscription Details */}
          <UserSubscriptionSection subscription={subscription} />

          {/* Payment History */}
          <UserPaymentHistory payments={payments} isLoading={isPaymentsLoading} />
        </div>

        {/* Right Column - Performance */}
        <div className="lg:col-span-2 space-y-6">
          {/* Performance Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="glass-card p-4 shadow-none">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="w-4 h-4 text-primary" />
                <span className="text-xs text-muted-foreground">Balance</span>
              </div>
              <p className="text-xl font-bold">${currentBalance.toLocaleString()}</p>
            </div>
            <div className="glass-card p-4 shadow-none">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-4 h-4 text-success" />
                <span className="text-xs text-muted-foreground">Growth</span>
              </div>
              <p className={cn("text-xl font-bold", parseFloat(growthPercent) >= 0 ? "text-success" : "text-destructive")}>
                {parseFloat(growthPercent) >= 0 ? "+" : ""}{growthPercent}%
              </p>
            </div>
            <div className="glass-card p-4 shadow-none">
              <div className="flex items-center gap-2 mb-2">
                <Target className="w-4 h-4 text-primary" />
                <span className="text-xs text-muted-foreground">Win Rate</span>
              </div>
              <p className="text-xl font-bold">{stats.winRate.toFixed(0)}%</p>
            </div>
            <div className="glass-card p-4 shadow-none">
              <div className="flex items-center gap-2 mb-2">
                <Activity className="w-4 h-4 text-primary" />
                <span className="text-xs text-muted-foreground">Total Trades</span>
              </div>
              <p className="text-xl font-bold">{stats.totalTrades}</p>
            </div>
          </div>

          {/* Equity Chart */}
          <div className="glass-card p-6 shadow-none">
            <h3 className="font-semibold mb-4">Account Growth</h3>
            <div className="h-[250px]">
              {chartData.length > 1 ? <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(142, 76%, 46%)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(142, 76%, 46%)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(222, 47%, 16%)" vertical={false} />
                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{
                  fill: "hsl(215, 20%, 55%)",
                  fontSize: 12
                }} />
                    <YAxis axisLine={false} tickLine={false} tick={{
                  fill: "hsl(215, 20%, 55%)",
                  fontSize: 12
                }} tickFormatter={v => `$${(v / 1000).toFixed(1)}k`} />
                    <Tooltip contentStyle={{
                  backgroundColor: "hsl(222, 47%, 10%)",
                  border: "1px solid hsl(222, 47%, 16%)",
                  borderRadius: "8px"
                }} formatter={(value: number) => [`$${value.toLocaleString()}`, "Balance"]} />
                    <Area type="monotone" dataKey="balance" stroke="hsl(142, 76%, 46%)" strokeWidth={2} fill="url(#colorBalance)" />
                  </AreaChart>
                </ResponsiveContainer> : <div className="flex items-center justify-center h-full text-muted-foreground">
                  <p>No trade history to display</p>
                </div>}
            </div>
          </div>

          {/* Recent Trades */}
          <div className="glass-card p-6 shadow-none">
            <h3 className="font-semibold mb-4">Recent Trades ({trades.length})</h3>
            {trades.length === 0 ? <div className="text-center py-8 text-muted-foreground">
                <p>No trades recorded</p>
              </div> : <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {trades.map(trade => <div key={trade.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/30">
                    <div className="flex items-center gap-3">
                      <span className={cn("px-2 py-0.5 rounded text-xs font-medium", trade.signal?.direction === "BUY" ? "bg-success/20 text-success" : "bg-destructive/20 text-destructive")}>
                        {trade.signal?.direction || "N/A"}
                      </span>
                      <span className="font-medium">{trade.signal?.pair || "Unknown"}</span>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(trade.created_at), "MMM dd, yyyy")}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={cn(trade.result === "win" ? "border-success/30 text-success" : trade.result === "loss" ? "border-destructive/30 text-destructive" : "border-warning/30 text-warning")}>
                        {trade.result || "Pending"}
                      </Badge>
                      <span className={cn("font-mono font-semibold", (trade.pnl || 0) >= 0 ? "text-success" : "text-destructive")}>
                        {(trade.pnl || 0) >= 0 ? "+" : ""}${(trade.pnl || 0).toFixed(2)}
                      </span>
                    </div>
                  </div>)}
              </div>}
          </div>
        </div>
      </div>
    </AdminLayout>;
};
export default AdminUserDetails;