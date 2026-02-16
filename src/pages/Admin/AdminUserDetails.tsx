import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Save, TrendingUp, DollarSign, Target, Activity, Mail, Phone, User, Calendar, AlertTriangle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { DateRange } from "react-day-picker";
import { format, differenceInMinutes, differenceInHours, differenceInDays } from "date-fns";
import { Profile, Subscription, UserTrade, Signal, SignalCategory } from "@/types/database";
import { UserPaymentHistory } from "@/components/admin/user-details/UserPaymentHistory";
import { TradeDetailsDialog } from "@/components/signals/TradeDetailsDialog";
import { TradeFilters, SortOption, TimeFilter, DirectionFilter, CategoryFilter, ResultFilter, filterByTime, sortTrades } from "@/components/filters/TradeFilters";
import { pickPrimarySubscription } from "@/lib/subscription-selection";
import { calculateOpeningPotentialProfit, calculateSignalRr } from "@/lib/trade-math";

interface TradeWithSignal extends UserTrade {
  signal: Signal;
}

interface Payment {
  id: string;
  amount: number;
  currency: string;
  tx_hash: string | null;
  status: string;
  created_at: string;
  verified_at: string | null;
  rejection_reason: string | null;
  payment_method?: string | null;
  provider_session_id?: string | null;
  provider_payment_id?: string | null;
  package?: {
    name?: string | null;
    duration_type?: string | null;
  } | null;
}

const DEFAULT_CATEGORIES: SignalCategory[] = [
  "Forex",
  "Metals",
  "Crypto",
  "Indices",
  "Commodities",
];

const AdminUserDetails = () => {
  const {
    userId
  } = useParams();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [trades, setTrades] = useState<TradeWithSignal[]>([]);
  const [allowedCategories, setAllowedCategories] = useState<SignalCategory[]>(DEFAULT_CATEGORIES);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isPaymentsLoading, setIsPaymentsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [editedSubscriptionStatus, setEditedSubscriptionStatus] = useState<string>("");
  const [editedFirstName, setEditedFirstName] = useState("");
  const [editedLastName, setEditedLastName] = useState("");
  const [editedPhone, setEditedPhone] = useState("");
  const [editedTelegramUsername, setEditedTelegramUsername] = useState("");
  const [subscriptionPlanName, setSubscriptionPlanName] = useState<string>("-");
  const [subscriptionDurationType, setSubscriptionDurationType] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [directionFilter, setDirectionFilter] = useState<DirectionFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [resultFilter, setResultFilter] = useState<ResultFilter>("all");
  const [tradeRowsPerPage, setTradeRowsPerPage] = useState<string>("10");
  const [tradePage, setTradePage] = useState(1);

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
        setEditedFirstName(profileData?.first_name || "");
        setEditedLastName(profileData?.last_name || "");
        setEditedPhone(profileData?.phone || "");
        setEditedTelegramUsername(profileData?.telegram_username || "");

        // Fetch subscription
        const {
          data: subRows,
          error: subError
        } = await supabase.from("subscriptions").select("*").eq("user_id", userId).order("updated_at", {
          ascending: false
        });
        if (subError) throw subError;
        const subData = pickPrimarySubscription((subRows || []) as Subscription[]) || null;
        setSubscription(subData as Subscription | null);
        setEditedSubscriptionStatus(subData?.status || "inactive");
        if (subData?.package_id) {
          const { data: pkg } = await supabase
            .from("subscription_packages")
            .select("name, duration_type")
            .eq("id", subData.package_id)
            .maybeSingle();
          setSubscriptionPlanName(pkg?.name || "-");
          setSubscriptionDurationType(pkg?.duration_type || null);
        } else {
          setSubscriptionPlanName("-");
          setSubscriptionDurationType(null);
        }

        // Resolve allowed categories exactly like user dashboard logic
        const { data: activeSubs, error: activeSubsError } = await supabase
          .from("subscriptions")
          .select("package_id")
          .eq("user_id", userId)
          .eq("status", "active")
          .or("expires_at.is.null,expires_at.gt.now()");
        if (activeSubsError) throw activeSubsError;

        const packageIds = (activeSubs || [])
          .map((s) => s.package_id)
          .filter((id): id is string => !!id);

        if (packageIds.length > 0) {
          const { data: packages, error: packageError } = await supabase
            .from("subscription_packages")
            .select("categories")
            .in("id", packageIds);
          if (packageError) throw packageError;

          const merged = Array.from(
            new Set(
              (packages || []).flatMap((pkg: any) =>
                Array.isArray(pkg.categories) && pkg.categories.length > 0
                  ? (pkg.categories as SignalCategory[])
                  : DEFAULT_CATEGORIES
              )
            )
          ) as SignalCategory[];

          setAllowedCategories(merged.length > 0 ? merged : DEFAULT_CATEGORIES);
        } else {
          setAllowedCategories(DEFAULT_CATEGORIES);
        }

        // Fetch trades with signals
        const {
          data: tradesData,
          error: tradesError
        } = await supabase.from("user_trades").select(`*, signal:signals(*)`).eq("user_id", userId).order("created_at", {
          ascending: false
        });
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
          .select("*, package:subscription_packages(name, duration_type)")
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

  const filteredTrades = useMemo(() => {
    if (allowedCategories.length === 0) return trades;
    return trades.filter((t) => allowedCategories.includes((t.signal?.category as SignalCategory) || ("" as SignalCategory)));
  }, [trades, allowedCategories]);

  // Calculate stats directly from user trade history
  const stats = useMemo(() => {
    const wins = filteredTrades.filter(t => t.result === "win");
    const losses = filteredTrades.filter(t => t.result === "loss");
    const breakeven = filteredTrades.filter(t => t.result === "breakeven");
    const pending = filteredTrades.filter(t => t.result === "pending");
    const closedTrades = [...wins, ...losses, ...breakeven];
    const winRateDenominator = wins.length + losses.length;
    const winRate = winRateDenominator > 0 ? wins.length / winRateDenominator * 100 : 0;
    const realizedPnL = closedTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    return {
      totalTrades: filteredTrades.length,
      closedTrades: closedTrades.length,
      wins: wins.length,
      losses: losses.length,
      breakeven: breakeven.length,
      pending: pending.length,
      winRate,
      realizedPnL
    };
  }, [filteredTrades]);

  const currentBalance = profile?.account_balance || 0;
  const totalPnLAllTrades = useMemo(() => filteredTrades.reduce((sum, t) => sum + (t.pnl || 0), 0), [filteredTrades]);
  const persistedStarting = typeof profile?.starting_balance === "number" && Number.isFinite(profile.starting_balance) && profile.starting_balance > 0
    ? profile.starting_balance
    : null;
  const derivedStarting = currentBalance - totalPnLAllTrades;
  const safeDerivedStarting = Number.isFinite(derivedStarting) && derivedStarting > 0
    ? derivedStarting
    : (currentBalance > 0 ? currentBalance : 1000);
  const startingBalance = persistedStarting ?? safeDerivedStarting;
  const growthPercent = startingBalance > 0 ? ((currentBalance - startingBalance) / startingBalance * 100).toFixed(1) : "0.0";

  // Build equity chart data from full trade history, matching user dashboard math
  const chartData = useMemo(() => {
    const chronologicalTrades = [...filteredTrades].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    if (chronologicalTrades.length === 0) {
      return [{
        date: "Start",
        balance: startingBalance,
        timestamp: null as string | null
      }];
    }

    let balance = startingBalance;

    const data = [{
      date: "Start",
      balance,
      timestamp: null as string | null
    }];
    chronologicalTrades.forEach((trade, index) => {
      if (trade.pnl) {
        balance += trade.pnl;
      }
      data.push({
        date: `Trade ${index + 1}`,
        balance: Math.round(balance * 100) / 100,
        timestamp: trade.created_at || null
      });
    });
    return data;
  }, [filteredTrades, startingBalance]);
  const closedTrades = useMemo(
    () => filteredTrades.filter((t) => t.result === "win" || t.result === "loss" || t.result === "breakeven"),
    [filteredTrades]
  );
  const historyTrades = useMemo(() => {
    let rows = [...closedTrades];

    rows = filterByTime(rows, timeFilter, dateRange, (t) => new Date(t.closed_at || t.created_at));

    if (directionFilter !== "all") {
      rows = rows.filter((t) => t.signal?.direction === directionFilter);
    }

    if (categoryFilter !== "all") {
      rows = rows.filter((t) => t.signal?.category?.toLowerCase() === categoryFilter.toLowerCase());
    }

    if (resultFilter !== "all") {
      rows = rows.filter((t) => t.result === resultFilter);
    }

    return sortTrades(rows, sortBy);
  }, [closedTrades, timeFilter, dateRange, directionFilter, categoryFilter, resultFilter, sortBy]);
  const tradeTotalPages = useMemo(() => {
    const size = Math.max(1, parseInt(tradeRowsPerPage, 10));
    return Math.max(1, Math.ceil(historyTrades.length / size));
  }, [historyTrades.length, tradeRowsPerPage]);
  const paginatedHistoryTrades = useMemo(() => {
    const size = Math.max(1, parseInt(tradeRowsPerPage, 10));
    const start = (tradePage - 1) * size;
    return historyTrades.slice(start, start + size);
  }, [historyTrades, tradeRowsPerPage, tradePage]);
  useEffect(() => {
    setTradePage(1);
  }, [sortBy, timeFilter, dateRange, directionFilter, categoryFilter, resultFilter, tradeRowsPerPage, historyTrades.length]);
  const maxDrawdown = useMemo(() => {
    const balances: number[] = [startingBalance];
    let running = startingBalance;
    [...filteredTrades]
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      .forEach((t) => {
        running += t.pnl || 0;
        balances.push(running);
      });

    let peak = balances[0] || 0;
    let worstDrawdownAmount = 0;
    let worstDrawdownPercent = 0;

    for (const b of balances) {
      if (b > peak) peak = b;
      const ddAmount = Math.max(0, peak - b);
      const ddPercent = peak > 0 ? (ddAmount / peak) * 100 : 0;
      if (ddPercent > worstDrawdownPercent) {
        worstDrawdownPercent = ddPercent;
        worstDrawdownAmount = ddAmount;
      }
    }

    return {
      percent: worstDrawdownPercent,
      amount: worstDrawdownAmount,
    };
  }, [filteredTrades, startingBalance]);
  const subscriptionDaysRemaining = useMemo(() => {
    if (!subscription?.expires_at) return null;
    const expiresAt = new Date(subscription.expires_at);
    const now = new Date();
    return Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  }, [subscription?.expires_at]);
  const handleSave = async () => {
    if (!userId) return;

    setIsSaving(true);
    try {
      // Update profile personal info
      const {
        error: profileError
      } = await supabase.from("profiles").update({
        first_name: editedFirstName.trim() || null,
        last_name: editedLastName.trim() || null,
        phone: editedPhone.trim() || null,
        telegram_username: editedTelegramUsername.trim() || null,
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
        first_name: editedFirstName.trim() || null,
        last_name: editedLastName.trim() || null,
        phone: editedPhone.trim() || null,
        telegram_username: editedTelegramUsername.trim() || null,
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
  const initials = displayName
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return <AdminLayout title="">
    <div className="space-y-6">
      <div className="glass-card p-5 sm:p-6 border border-border/40 shadow-none">
        <div className="flex flex-col lg:flex-row lg:items-center gap-4 lg:gap-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate("/admin/users")} className="shrink-0">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-primary to-blue-400/80 flex items-center justify-center text-white text-lg font-bold">
              {initials}
            </div>
            <div>
              <h1 className="text-2xl font-bold leading-tight">{displayName}</h1>
              <p className="text-sm text-muted-foreground mt-1">@{profile.username || "no-username"}</p>
            </div>
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-none max-w-full">
            <div className="flex items-center gap-2 min-w-max">
              <Badge variant="outline" className="text-sm px-3 py-1 border-primary/30 text-primary bg-primary/10">
                Active Plan: {subscriptionPlanName}
                {subscriptionDurationType ? ` (${subscriptionDurationType === "lifetime" ? "Lifetime" : subscriptionDurationType === "yearly" ? "Yearly" : "Monthly"})` : ""}
              </Badge>
              <Badge variant="outline" className={cn("text-sm px-3 py-1", subscription?.status === "active" && "border-success/30 text-success bg-success/10", subscription?.status === "pending" && "border-warning/30 text-warning bg-warning/10", (subscription?.status === "expired" || subscription?.status === "inactive") && "border-destructive/30 text-destructive bg-destructive/10")}>
                {(subscription?.status || "inactive").toUpperCase()}
              </Badge>
              <Badge variant="outline" className="text-sm px-3 py-1 border-primary/30 text-primary bg-primary/10">
                Joined {format(new Date(profile.created_at), "MMM dd, yyyy")}
              </Badge>
              {subscription?.starts_at && (
                <Badge variant="outline" className="text-sm px-3 py-1 border-border/50 text-muted-foreground bg-secondary/20">
                  Started {format(new Date(subscription.starts_at), "MMM dd, yyyy")}
                </Badge>
              )}
              {subscription?.expires_at && (
                <Badge variant="outline" className="text-sm px-3 py-1 border-border/50 text-muted-foreground bg-secondary/20">
                  Expires {format(new Date(subscription.expires_at), "MMM dd, yyyy")}
                </Badge>
              )}
              {subscription?.status === "active" && subscriptionDaysRemaining !== null && (
                <Badge
                  variant="outline"
                  className={cn(
                    "text-sm px-3 py-1",
                    subscriptionDaysRemaining <= 7
                      ? "border-warning/30 text-warning bg-warning/10"
                      : "border-success/30 text-success bg-success/10"
                  )}
                >
                  {subscriptionDaysRemaining} {subscriptionDaysRemaining === 1 ? "day" : "days"} remaining
                </Badge>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        <div className="glass-card p-4 border border-border/40 shadow-none">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="w-4 h-4 text-primary" />
            <span className="text-xs text-muted-foreground uppercase tracking-wide">Starting Balance</span>
          </div>
          <p className="text-2xl font-semibold">${startingBalance.toLocaleString()}</p>
        </div>
        <div className="glass-card p-4 border border-border/40 shadow-none">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="w-4 h-4 text-primary" />
            <span className="text-xs text-muted-foreground uppercase tracking-wide">Current Balance</span>
          </div>
          <p className="text-2xl font-semibold">${currentBalance.toLocaleString()}</p>
        </div>
        <div className="glass-card p-4 border border-border/40 shadow-none">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-success" />
            <span className="text-xs text-muted-foreground uppercase tracking-wide">Growth</span>
          </div>
          <p className={cn("text-2xl font-semibold", parseFloat(growthPercent) >= 0 ? "text-success" : "text-destructive")}>
            {parseFloat(growthPercent) >= 0 ? "+" : ""}{growthPercent}%
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            From realized history
          </p>
        </div>
        <div className="glass-card p-4 border border-border/40 shadow-none">
          <div className="flex items-center gap-2 mb-2">
            <Target className="w-4 h-4 text-primary" />
            <span className="text-xs text-muted-foreground uppercase tracking-wide">Win Rate</span>
          </div>
          <p className="text-2xl font-semibold">{stats.winRate.toFixed(0)}%</p>
        </div>
        <div className="glass-card p-4 border border-border/40 shadow-none">
          <div className="flex items-center gap-2 mb-2">
            <Activity className="w-4 h-4 text-primary" />
            <span className="text-xs text-muted-foreground uppercase tracking-wide">Total Trades</span>
          </div>
          <p className="text-2xl font-semibold">{stats.totalTrades}</p>
        </div>
        <div className="glass-card p-4 border border-border/40 shadow-none">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-warning" />
            <span className="text-xs text-muted-foreground uppercase tracking-wide">Max Drawdown</span>
          </div>
          <p className="text-2xl font-semibold text-warning">{maxDrawdown.percent.toFixed(1)}%</p>
          <p className="text-xs text-muted-foreground mt-1">${maxDrawdown.amount.toFixed(2)}</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-4 space-y-6">
          <div className="glass-card p-6 border border-border/40 shadow-none lg:h-[460px] flex flex-col">
            <h3 className="font-semibold mb-4">Profile Details</h3>
            <div className="space-y-4 flex-1">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary/30 border border-border/30">
                <Mail className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm break-all">{profile.email}</span>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <User className="w-4 h-4 text-muted-foreground" />
                    First Name
                  </Label>
                  <Input value={editedFirstName} onChange={e => setEditedFirstName(e.target.value)} placeholder="First name" className="bg-secondary/50 border-border/50" />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <User className="w-4 h-4 text-muted-foreground" />
                    Last Name
                  </Label>
                  <Input value={editedLastName} onChange={e => setEditedLastName(e.target.value)} placeholder="Last name" className="bg-secondary/50 border-border/50" />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-muted-foreground" />
                  Phone Number
                </Label>
                <Input value={editedPhone} onChange={e => setEditedPhone(e.target.value)} placeholder="Phone number" className="bg-secondary/50 border-border/50" />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <User className="w-4 h-4 text-muted-foreground" />
                  Telegram Username
                </Label>
                <Input value={editedTelegramUsername} onChange={e => setEditedTelegramUsername(e.target.value)} placeholder="@username" className="bg-secondary/50 border-border/50" />
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary/30 border border-border/30">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm">Joined {format(new Date(profile.created_at), "MMM dd, yyyy")}</span>
              </div>
            </div>
          </div>

          <div className="glass-card p-6 border border-border/40 shadow-none">
            <h3 className="font-semibold mb-4">Subscription Controls</h3>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Subscription Status</Label>
                <Select value={editedSubscriptionStatus} onValueChange={setEditedSubscriptionStatus}>
                  <SelectTrigger className="bg-secondary/50 border-border/50">
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
              <div className="grid gap-3">
                <Button onClick={handleSave} className="w-full" variant="gradient" disabled={isSaving}>
                  {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                  {isSaving ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-8 h-full">
          <div className="glass-card p-6 border border-border/40 shadow-none h-full min-h-[460px] flex flex-col">
            <h3 className="font-semibold mb-4">Account Growth</h3>
            <div className="flex-1 min-h-[360px]">
              {chartData.length > 1 ? <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={chartData}
                  margin={{
                    top: 8,
                    right: 12,
                    left: 18,
                    bottom: 20,
                  }}
                >
                  <defs>
                    <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(142, 76%, 46%)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(142, 76%, 46%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(222, 47%, 16%)" vertical={false} />
                  <XAxis
                    dataKey="date"
                    axisLine={false}
                    tickLine={false}
                    minTickGap={24}
                    interval="preserveStartEnd"
                    height={40}
                    tickMargin={10}
                    padding={{ left: 8, right: 8 }}
                    tick={{
                      fill: "hsl(215, 20%, 55%)",
                      fontSize: 12,
                    }}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    width={56}
                    tickMargin={10}
                    tick={{
                      fill: "hsl(215, 20%, 55%)",
                      fontSize: 12
                    }}
                    tickFormatter={v => `$${(v / 1000).toFixed(1)}k`}
                  />
                  <Tooltip contentStyle={{
                    backgroundColor: "hsl(222, 47%, 10%)",
                    border: "1px solid hsl(222, 47%, 16%)",
                    borderRadius: "8px"
                  }}
                  labelFormatter={(label: string, payload: any[]) => {
                    const point = payload?.[0]?.payload;
                    if (!point?.timestamp) return label;
                    return `${label} - ${format(new Date(point.timestamp), "dd MMM yyyy, HH:mm")}`;
                  }}
                  formatter={(value: number) => [`$${value.toLocaleString()}`, "Balance"]}
                  />
                  <Area type="monotone" dataKey="balance" stroke="hsl(142, 76%, 46%)" strokeWidth={2} fill="url(#colorBalance)" />
                </AreaChart>
              </ResponsiveContainer> : <div className="flex items-center justify-center h-full text-muted-foreground">
                <p>No trade history to display</p>
              </div>}
            </div>
          </div>

        </div>
      </div>

      <div className="glass-card p-6 border border-border/40 shadow-none">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h3 className="font-semibold">Trade History ({historyTrades.length})</h3>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Rows</span>
            <Select value={tradeRowsPerPage} onValueChange={setTradeRowsPerPage}>
              <SelectTrigger className="h-8 w-[90px] bg-secondary/40 border-border/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="20">20</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <TradeFilters
          sortBy={sortBy}
          onSortChange={setSortBy}
          timeFilter={timeFilter}
          onTimeFilterChange={setTimeFilter}
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
          directionFilter={directionFilter}
          onDirectionFilterChange={setDirectionFilter}
          categoryFilter={categoryFilter}
          onCategoryFilterChange={setCategoryFilter}
          resultFilter={resultFilter}
          onResultFilterChange={setResultFilter}
          showResultFilter={true}
        />

        <div className="overflow-x-auto mt-4">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border/50 bg-secondary/30">
                <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-4">Pair</th>
                <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-4">Direction</th>
                <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-4">Entry</th>
                <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-4">SL / TP</th>
                <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-4">Result</th>
                <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-4">R:R</th>
                <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-4">Risk</th>
                <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-4">Potential Profit</th>
                <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-4">Duration</th>
                <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-4">P&L</th>
                <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-4">Closed At</th>
                <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-4">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {historyTrades.length === 0 ? (
                <tr>
                  <td colSpan={12} className="text-center py-10 text-muted-foreground">
                    No closed trades found
                  </td>
                </tr>
              ) : (
                paginatedHistoryTrades.map((trade) => {
                  const rr = calculateSignalRr(trade);
                  const potentialProfit = calculateOpeningPotentialProfit(trade);
                  const start = trade.created_at ? new Date(trade.created_at) : null;
                  const end = trade.closed_at ? new Date(trade.closed_at) : null;
                  const minutes = start && end ? differenceInMinutes(end, start) : 0;
                  const hours = start && end ? differenceInHours(end, start) : 0;
                  const days = start && end ? differenceInDays(end, start) : 0;
                  const duration = !start || !end ? "-" : days > 0 ? `${days}d ${hours % 24}h` : hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`;

                  return (
                    <tr key={trade.id} className="hover:bg-accent/30 transition-colors">
                      <td className="px-6 py-4">
                        <div>
                          <span className="font-semibold">{trade.signal?.pair || "-"}</span>
                          <p className="text-xs text-muted-foreground">{trade.signal?.category || "-"}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className={cn("inline-flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-lg text-sm font-medium w-20", trade.signal?.direction === "BUY" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive")}>
                          {trade.signal?.direction}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-mono text-sm">{trade.signal?.entry_price ?? "-"}</span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="space-y-1">
                          <p className="text-xs text-destructive font-mono">{trade.signal?.stop_loss ?? "-"}</p>
                          <p className="text-xs text-success font-mono">{trade.signal?.take_profit ?? "-"}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <Badge variant="outline" className={cn(trade.result === "win" ? "border-success/30 text-success bg-success/10" : trade.result === "breakeven" ? "border-warning/30 text-warning bg-warning/10" : "border-destructive/30 text-destructive bg-destructive/10")}>
                          {trade.result === "win" ? "Win" : trade.result === "breakeven" ? "Breakeven" : "Loss"}
                        </Badge>
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-mono text-sm text-secondary-foreground">1:{rr.toFixed(1)}</span>
                      </td>
                      <td className="px-6 py-4">
                        <div>
                          <p className="text-sm font-mono">{trade.risk_percent}%</p>
                          <p className="text-xs text-muted-foreground">${(trade.risk_amount || 0).toFixed(2)}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-mono font-semibold text-success">+${potentialProfit.toFixed(2)}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-mono text-sm text-secondary-foreground">{duration}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={cn("font-mono font-semibold", (trade.pnl || 0) >= 0 ? "text-success" : "text-destructive")}>
                          {(trade.pnl || 0) >= 0 ? "+" : ""}${(trade.pnl || 0).toFixed(2)}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div>
                          <p className="text-sm">{trade.closed_at ? format(new Date(trade.closed_at), "yyyy-MM-dd") : "-"}</p>
                          <p className="text-xs text-muted-foreground">{trade.closed_at ? format(new Date(trade.closed_at), "HH:mm") : ""}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <TradeDetailsDialog trade={trade} />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {historyTrades.length > 0 && (
          <div className="mt-4 flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Page {tradePage} of {tradeTotalPages}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                onClick={() => setTradePage((p) => Math.max(1, p - 1))}
                disabled={tradePage <= 1}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                onClick={() => setTradePage((p) => Math.min(tradeTotalPages, p + 1))}
                disabled={tradePage >= tradeTotalPages}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      <UserPaymentHistory payments={payments} isLoading={isPaymentsLoading} />
    </div>
  </AdminLayout>;
};
export default AdminUserDetails;
