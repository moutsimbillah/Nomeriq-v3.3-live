import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Search,
  Eye,
  Trash2,
  Mail,
  Phone,
  User,
  Loader2,
  Users,
  Wifi,
  WifiOff,
  Clock3,
  CheckCircle2,
  Hourglass,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useUsers } from "@/hooks/useUsers";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/BrandContext";
import { toast } from "sonner";
import { getSafeErrorMessage } from "@/lib/error-sanitizer";
import { usePresenceOverview } from "@/hooks/useRealtimePresence";

const AdminUsers = () => {
  const navigate = useNavigate();
  const { settings } = useBrand();

  const [searchQuery, setSearchQuery] = useState("");
  const [subscriptionFilter, setSubscriptionFilter] = useState("all");
  const [presenceFilter, setPresenceFilter] = useState("all");
  const [planFilter, setPlanFilter] = useState("all");
  const [durationFilter, setDurationFilter] = useState("all");
  const [countryFilter, setCountryFilter] = useState("all");
  const [balanceTrendFilter, setBalanceTrendFilter] = useState("all");
  const [joinedFilter, setJoinedFilter] = useState("all");
  const [startingBalanceRangeFilter, setStartingBalanceRangeFilter] = useState("all");
  const [currentBalanceRangeFilter, setCurrentBalanceRangeFilter] = useState("all");
  const [sortBy, setSortBy] = useState("newest");
  const [rowsPerPage, setRowsPerPage] = useState("10");
  const [page, setPage] = useState(1);

  const { users, isLoading, refetch, totalCount } = useUsers({
    search: searchQuery,
    fetchAll: true,
    realtime: true,
  });

  const getSubscriptionStatus = useCallback((user: (typeof users)[number]) => {
    if (!user.subscription) return "inactive";
    const sub = user.subscription;
    if (sub.status === "active" && (!sub.expires_at || new Date(sub.expires_at) > new Date())) return "active";
    if (sub.status === "pending") return "pending";
    return "expired";
  }, []);

  const { onlineUsers, onlineUserIds, offlineUsers, avgSessionSeconds, isLoading: presenceLoading } =
    usePresenceOverview(totalCount);
  const onlineUserIdSet = useMemo(() => new Set(onlineUserIds), [onlineUserIds]);

  const handleDeleteUser = async (userId: string) => {
    if (
      !confirm(
        "Are you sure you want to delete this user? This will permanently remove their account, trades, payments, and all associated data. This action cannot be undone."
      )
    ) {
      return;
    }
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        toast.error("You must be logged in");
        return;
      }
      const response = await supabase.functions.invoke("delete-user", { body: { userId } });
      if (response.error) throw new Error(response.error.message || "Failed to delete user");
      if (response.data?.error) throw new Error(response.data.error);
      toast.success("User deleted successfully");
      refetch();
    } catch (err) {
      console.error("Error deleting user:", err);
      toast.error(getSafeErrorMessage(err, "Failed to delete user"));
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const hrs = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `${hrs}h ${remMins}m`;
  };

  const formatPlanDuration = (duration?: string | null) => {
    if (!duration) return null;
    return duration.charAt(0).toUpperCase() + duration.slice(1);
  };

  const formatCurrency = (value: number) => `$${value.toLocaleString()}`;

  const filteredUsers = useMemo(() => {
    let rows = [...users];
    const now = new Date();

    const inRange = (value: number, range: string) => {
      if (range === "lt_1000") return value < 1000;
      if (range === "1000_5000") return value >= 1000 && value <= 5000;
      if (range === "5000_10000") return value > 5000 && value <= 10000;
      if (range === "gt_10000") return value > 10000;
      return true;
    };

    const inJoinedWindow = (createdAt: string, windowKey: string) => {
      if (windowKey === "all") return true;
      const created = new Date(createdAt);
      if (windowKey === "today") {
        return created.toDateString() === now.toDateString();
      }
      const daysMap: Record<string, number> = {
        last_7d: 7,
        last_30d: 30,
        last_90d: 90,
      };
      const days = daysMap[windowKey];
      if (!days) return true;
      const from = new Date(now);
      from.setDate(from.getDate() - days);
      return created >= from;
    };

    rows = rows.filter((u) => {
      const subStatus = getSubscriptionStatus(u);
      const isOnline = onlineUserIdSet.has(u.user_id);
      const planName = (u.subscriptionPackageName || "").trim();
      const duration = (u.subscriptionDurationType || "").toLowerCase();
      const country = (u.country || "").trim();
      const starting = Number((u.starting_balance ?? u.account_balance) || 0);
      const current = Number(u.account_balance || 0);
      const hasGrowth = current > starting;
      const hasLoss = current < starting;
      const isFlat = current === starting;

      if (subscriptionFilter !== "all" && subStatus !== subscriptionFilter) return false;
      if (presenceFilter !== "all" && ((presenceFilter === "online") !== isOnline)) return false;
      if (planFilter !== "all" && planName !== planFilter) return false;
      if (durationFilter !== "all") {
        if (durationFilter === "none" && duration) return false;
        if (durationFilter !== "none" && duration !== durationFilter) return false;
      }
      if (countryFilter !== "all" && country !== countryFilter) return false;
      if (!inJoinedWindow(u.created_at, joinedFilter)) return false;
      if (!inRange(starting, startingBalanceRangeFilter)) return false;
      if (!inRange(current, currentBalanceRangeFilter)) return false;
      if (balanceTrendFilter !== "all") {
        if (balanceTrendFilter === "growth" && !hasGrowth) return false;
        if (balanceTrendFilter === "loss" && !hasLoss) return false;
        if (balanceTrendFilter === "flat" && !isFlat) return false;
      }
      return true;
    });

    rows.sort((a, b) => {
      const aName = ([a.first_name, a.last_name].filter(Boolean).join(" ") || a.email).toLowerCase();
      const bName = ([b.first_name, b.last_name].filter(Boolean).join(" ") || b.email).toLowerCase();
      const aStart = Number((a.starting_balance ?? a.account_balance) || 0);
      const bStart = Number((b.starting_balance ?? b.account_balance) || 0);
      const aBal = Number(a.account_balance || 0);
      const bBal = Number(b.account_balance || 0);

      switch (sortBy) {
        case "oldest":
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case "name_asc":
          return aName.localeCompare(bName);
        case "name_desc":
          return bName.localeCompare(aName);
        case "balance_high":
          return bBal - aBal;
        case "balance_low":
          return aBal - bBal;
        case "starting_high":
          return bStart - aStart;
        case "starting_low":
          return aStart - bStart;
        case "newest":
        default:
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });

    return rows;
  }, [
    users,
    onlineUserIdSet,
    subscriptionFilter,
    presenceFilter,
    planFilter,
    durationFilter,
    countryFilter,
    balanceTrendFilter,
    joinedFilter,
    startingBalanceRangeFilter,
    currentBalanceRangeFilter,
    sortBy,
    getSubscriptionStatus,
  ]);

  const totalPages = useMemo(() => {
    if (rowsPerPage === "all") return 1;
    const size = Math.max(1, parseInt(rowsPerPage, 10));
    return Math.max(1, Math.ceil(filteredUsers.length / size));
  }, [filteredUsers.length, rowsPerPage]);

  const paginatedUsers = useMemo(() => {
    if (rowsPerPage === "all") return filteredUsers;
    const size = Math.max(1, parseInt(rowsPerPage, 10));
    const start = (page - 1) * size;
    return filteredUsers.slice(start, start + size);
  }, [filteredUsers, rowsPerPage, page]);

  const planOptions = useMemo(() => {
    const list = Array.from(new Set(users.map((u) => (u.subscriptionPackageName || "").trim()).filter(Boolean)));
    return list.sort((a, b) => a.localeCompare(b));
  }, [users]);

  const countryOptions = useMemo(() => {
    const list = Array.from(new Set(users.map((u) => (u.country || "").trim()).filter(Boolean)));
    return list.sort((a, b) => a.localeCompare(b));
  }, [users]);

  const activeCount = filteredUsers.filter((u) => getSubscriptionStatus(u) === "active").length;
  const pendingCount = filteredUsers.filter((u) => getSubscriptionStatus(u) === "pending").length;
  const expiredCount = filteredUsers.filter((u) => {
    const s = getSubscriptionStatus(u);
    return s === "expired" || s === "inactive";
  }).length;
  const filteredOnline = filteredUsers.filter((u) => onlineUserIdSet.has(u.user_id)).length;
  const filteredOffline = filteredUsers.length - filteredOnline;

  const setFilter = (setter: (v: string) => void, value: string) => {
    setter(value);
    setPage(1);
  };

  const resetFilters = () => {
    setSubscriptionFilter("all");
    setPresenceFilter("all");
    setPlanFilter("all");
    setDurationFilter("all");
    setCountryFilter("all");
    setBalanceTrendFilter("all");
    setJoinedFilter("all");
    setStartingBalanceRangeFilter("all");
    setCurrentBalanceRangeFilter("all");
    setSortBy("newest");
    setRowsPerPage("10");
    setPage(1);
  };

  const statCards = [
    {
      label: "Total Users",
      value: isLoading ? "..." : filteredUsers.length.toString(),
      icon: Users,
      accent: "text-primary",
    },
    {
      label: "Total Online",
      value: isLoading || presenceLoading ? "..." : filteredOnline.toString(),
      icon: Wifi,
      accent: "text-success",
    },
    {
      label: "Total Offline",
      value: isLoading || presenceLoading ? "..." : filteredOffline.toString(),
      icon: WifiOff,
      accent: "text-muted-foreground",
    },
    {
      label: "Avg Time Spend/Day",
      value: isLoading || presenceLoading ? "..." : formatDuration(avgSessionSeconds),
      icon: Clock3,
      accent: "text-primary",
    },
    {
      label: "Active Subscriptions",
      value: isLoading ? "..." : activeCount.toString(),
      icon: CheckCircle2,
      accent: "text-success",
    },
    {
      label: "Pending",
      value: isLoading ? "..." : pendingCount.toString(),
      icon: Hourglass,
      accent: "text-warning",
    },
    {
      label: "Expired/Inactive",
      value: isLoading ? "..." : expiredCount.toString(),
      icon: AlertCircle,
      accent: "text-destructive",
    },
  ];

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  return (
    <AdminLayout title="User Management">
      <div className="flex flex-col gap-4 mb-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div className="relative flex-1 max-w-xl">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              placeholder="Search by name, email, phone, or username..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              className="pl-10 h-11 bg-secondary/50 border-border/60"
            />
          </div>
          <div className="text-sm text-muted-foreground">
            {isLoading ? "Loading users..." : `${filteredUsers.length} filtered of ${totalCount} users`}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 2xl:grid-cols-12 gap-2">
          <Select value={subscriptionFilter} onValueChange={(v) => setFilter(setSubscriptionFilter, v)}>
            <SelectTrigger className="h-10 bg-secondary/40 border-border/50"><SelectValue placeholder="Subscription" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>

          <Select value={presenceFilter} onValueChange={(v) => setFilter(setPresenceFilter, v)}>
            <SelectTrigger className="h-10 bg-secondary/40 border-border/50"><SelectValue placeholder="Presence" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Presence</SelectItem>
              <SelectItem value="online">Online</SelectItem>
              <SelectItem value="offline">Offline</SelectItem>
            </SelectContent>
          </Select>

          <Select value={planFilter} onValueChange={(v) => setFilter(setPlanFilter, v)}>
            <SelectTrigger className="h-10 bg-secondary/40 border-border/50"><SelectValue placeholder="Plan" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Plans</SelectItem>
              {planOptions.map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={durationFilter} onValueChange={(v) => setFilter(setDurationFilter, v)}>
            <SelectTrigger className="h-10 bg-secondary/40 border-border/50"><SelectValue placeholder="Duration" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Durations</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="yearly">Yearly</SelectItem>
              <SelectItem value="lifetime">Lifetime</SelectItem>
              <SelectItem value="none">No Duration</SelectItem>
            </SelectContent>
          </Select>

          <Select value={countryFilter} onValueChange={(v) => setFilter(setCountryFilter, v)}>
            <SelectTrigger className="h-10 bg-secondary/40 border-border/50"><SelectValue placeholder="Country" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Countries</SelectItem>
              {countryOptions.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={balanceTrendFilter} onValueChange={(v) => setFilter(setBalanceTrendFilter, v)}>
            <SelectTrigger className="h-10 bg-secondary/40 border-border/50"><SelectValue placeholder="Balance Trend" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Balance States</SelectItem>
              <SelectItem value="growth">Growth</SelectItem>
              <SelectItem value="loss">Loss</SelectItem>
              <SelectItem value="flat">Flat</SelectItem>
            </SelectContent>
          </Select>

          <Select value={joinedFilter} onValueChange={(v) => setFilter(setJoinedFilter, v)}>
            <SelectTrigger className="h-10 bg-secondary/40 border-border/50"><SelectValue placeholder="Joined Date" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Joined Dates</SelectItem>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="last_7d">Last 7 days</SelectItem>
              <SelectItem value="last_30d">Last 30 days</SelectItem>
              <SelectItem value="last_90d">Last 90 days</SelectItem>
            </SelectContent>
          </Select>

          <Select value={startingBalanceRangeFilter} onValueChange={(v) => setFilter(setStartingBalanceRangeFilter, v)}>
            <SelectTrigger className="h-10 bg-secondary/40 border-border/50"><SelectValue placeholder="Starting Balance" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Starting Balances</SelectItem>
              <SelectItem value="lt_1000">&lt; $1,000</SelectItem>
              <SelectItem value="1000_5000">$1,000 - $5,000</SelectItem>
              <SelectItem value="5000_10000">$5,000 - $10,000</SelectItem>
              <SelectItem value="gt_10000">&gt; $10,000</SelectItem>
            </SelectContent>
          </Select>

          <Select value={currentBalanceRangeFilter} onValueChange={(v) => setFilter(setCurrentBalanceRangeFilter, v)}>
            <SelectTrigger className="h-10 bg-secondary/40 border-border/50"><SelectValue placeholder="Current Balance" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Current Balances</SelectItem>
              <SelectItem value="lt_1000">&lt; $1,000</SelectItem>
              <SelectItem value="1000_5000">$1,000 - $5,000</SelectItem>
              <SelectItem value="5000_10000">$5,000 - $10,000</SelectItem>
              <SelectItem value="gt_10000">&gt; $10,000</SelectItem>
            </SelectContent>
          </Select>

          <Select value={sortBy} onValueChange={(v) => setFilter(setSortBy, v)}>
            <SelectTrigger className="h-10 bg-secondary/40 border-border/50"><SelectValue placeholder="Sort" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest</SelectItem>
              <SelectItem value="oldest">Oldest</SelectItem>
              <SelectItem value="name_asc">Name A-Z</SelectItem>
              <SelectItem value="name_desc">Name Z-A</SelectItem>
              <SelectItem value="balance_high">Balance High-Low</SelectItem>
              <SelectItem value="balance_low">Balance Low-High</SelectItem>
              <SelectItem value="starting_high">Starting High-Low</SelectItem>
              <SelectItem value="starting_low">Starting Low-High</SelectItem>
            </SelectContent>
          </Select>

          <Select value={rowsPerPage} onValueChange={(v) => setFilter(setRowsPerPage, v)}>
            <SelectTrigger className="h-10 bg-secondary/40 border-border/50"><SelectValue placeholder="Rows" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10 rows</SelectItem>
              <SelectItem value="25">25 rows</SelectItem>
              <SelectItem value="50">50 rows</SelectItem>
              <SelectItem value="100">100 rows</SelectItem>
              <SelectItem value="all">All rows</SelectItem>
            </SelectContent>
          </Select>

          <Button variant="outline" className="h-10" onClick={resetFilters}>
            Reset Filters
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-7 gap-3 mb-6">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="glass-card p-4 border border-border/40 shadow-none">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{card.label}</p>
                <Icon className={cn("w-4 h-4", card.accent)} />
              </div>
              <p className={cn("text-3xl font-semibold leading-none", card.accent)}>{card.value}</p>
            </div>
          );
        })}
      </div>

      <div className="glass-card overflow-hidden border border-border/40 shadow-none">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="text-center py-16">
            <User className="w-12 h-12 mx-auto text-muted-foreground/40 mb-4" />
            <p className="text-lg font-semibold">No users found</p>
            <p className="text-muted-foreground">
              {searchQuery ? "Try a different search." : "No users have signed up yet."}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1200px]">
                <thead>
                  <tr className="border-b border-border/50 bg-secondary/25">
                    <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-4">User</th>
                    <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-4">Contact</th>
                    <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-4">Country</th>
                    <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-4">Subscription Status</th>
                    <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-4">Active Plan</th>
                    <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-4">Presence</th>
                    <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-4">Starting Balance</th>
                    <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-4">Current Balance</th>
                    <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-4">Risk</th>
                    <th className="w-[152px] text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-4">
                      <div className="flex justify-end">
                        <span className="w-[88px] text-left">Actions</span>
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {paginatedUsers.map((user) => {
                    const status = getSubscriptionStatus(user);
                    const isOnline = onlineUserIdSet.has(user.user_id);
                    const activeSubscriptionLabel = status === "active" ? user.subscriptionPackageName || "Active Plan" : "No Active Plan";
                    const displayName = [user.first_name, user.last_name].filter(Boolean).join(" ") || user.email.split("@")[0];
                    const initials = displayName
                      .split(" ")
                      .map((n) => n[0])
                      .join("")
                      .toUpperCase()
                      .slice(0, 2);

                    return (
                      <tr key={user.id} className="hover:bg-accent/25 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-blue-400/80 flex items-center justify-center text-sm font-bold text-white">
                              {initials}
                            </div>
                            <div>
                              <p className="font-semibold leading-tight">{displayName}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">@{user.username || user.email.split("@")[0]}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-2 text-sm">
                              <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                              <span>{user.email}</span>
                            </div>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Phone className="w-3.5 h-3.5" />
                              <span>{user.phone || "-"}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm">{user.country || "-"}</span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <Badge
                            variant="outline"
                            className={cn(
                              status === "active" && "border-success/30 text-success bg-success/10",
                              status === "pending" && "border-warning/30 text-warning bg-warning/10",
                              (status === "expired" || status === "inactive") &&
                                "border-destructive/30 text-destructive bg-destructive/10"
                            )}
                          >
                            {status}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <div className="flex flex-col items-center leading-tight">
                            <span className={cn("text-sm font-medium", status === "active" ? "text-success" : "text-muted-foreground")}>
                              {activeSubscriptionLabel}
                            </span>
                            <span className="text-xs text-muted-foreground mt-1">
                              {status === "active" ? formatPlanDuration(user.subscriptionDurationType) || "-" : "-"}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <Badge
                            variant="outline"
                            className={cn(
                              isOnline
                                ? "border-success/30 text-success bg-success/10"
                                : "border-muted-foreground/30 text-muted-foreground bg-muted/20"
                            )}
                          >
                            {isOnline ? "online" : "offline"}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <p className="font-mono font-semibold">{formatCurrency((user.starting_balance ?? user.account_balance) || 0)}</p>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <p className="font-mono font-semibold">{formatCurrency(user.account_balance || 0)}</p>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className="text-sm font-medium">{settings?.global_risk_percent ?? 2}%</span>
                        </td>
                        <td className="w-[152px] px-6 py-4">
                          <div className="ml-auto flex w-[88px] items-center justify-between">
                            <Button size="sm" variant="outline" onClick={() => navigate(`/admin/users/${user.user_id}`)}>
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive hover:text-destructive"
                              onClick={() => handleDeleteUser(user.user_id)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {rowsPerPage !== "all" && filteredUsers.length > 0 && (
              <div className="px-6 py-4 border-t border-border/40 flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Page {page} of {totalPages}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminUsers;
