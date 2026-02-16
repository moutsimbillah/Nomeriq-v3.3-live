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
  Sparkles,
  BarChart3,
  Globe2,
  Layers3,
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

  const { onlineUserIds, avgSessionSeconds } = usePresenceOverview(totalCount);
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
    const query = searchQuery.trim().toLowerCase();
    if (query) {
      rows = rows.filter((u) => {
        const displayName = [u.first_name, u.last_name].filter(Boolean).join(" ").toLowerCase();
        return (
          displayName.includes(query) ||
          (u.email || "").toLowerCase().includes(query) ||
          (u.phone || "").toLowerCase().includes(query) ||
          (u.username || "").toLowerCase().includes(query) ||
          (u.country || "").toLowerCase().includes(query) ||
          (u.subscriptionPackageName || "").toLowerCase().includes(query)
        );
      });
    }

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
  }, [users, searchQuery, sortBy]);

  const totalPages = useMemo(() => {
    const size = Math.max(1, parseInt(rowsPerPage, 10));
    return Math.max(1, Math.ceil(filteredUsers.length / size));
  }, [filteredUsers.length, rowsPerPage]);

  const paginatedUsers = useMemo(() => {
    const size = Math.max(1, parseInt(rowsPerPage, 10));
    const start = (page - 1) * size;
    return filteredUsers.slice(start, start + size);
  }, [filteredUsers, rowsPerPage, page]);

  const analytics = useMemo(() => {
    const statusCounts = { active: 0, pending: 0, expired: 0, inactive: 0 };
    const durationCounts = { monthly: 0, yearly: 0, lifetime: 0, none: 0 };
    const trendCounts = { growth: 0, loss: 0, flat: 0 };
    const joinedCounts = { today: 0, last7: 0, last30: 0, last90: 0, older: 0 };
    const startingRangeCounts = { lt1000: 0, r1000to5000: 0, r5000to10000: 0, gt10000: 0 };
    const currentRangeCounts = { lt1000: 0, r1000to5000: 0, r5000to10000: 0, gt10000: 0 };
    const planMap = new Map<string, number>();
    const countryMap = new Map<string, number>();
    const now = new Date();

    const bucketRange = (value: number) => {
      if (value < 1000) return "lt1000";
      if (value <= 5000) return "r1000to5000";
      if (value <= 10000) return "r5000to10000";
      return "gt10000";
    };

    for (const u of users) {
      const status = getSubscriptionStatus(u);
      if (status === "active") statusCounts.active += 1;
      else if (status === "pending") statusCounts.pending += 1;
      else if (status === "expired") statusCounts.expired += 1;
      else statusCounts.inactive += 1;

      const duration = (u.subscriptionDurationType || "").toLowerCase();
      if (duration === "monthly" || duration === "yearly" || duration === "lifetime") {
        durationCounts[duration] += 1;
      } else {
        durationCounts.none += 1;
      }

      const starting = Number((u.starting_balance ?? u.account_balance) || 0);
      const current = Number(u.account_balance || 0);
      if (current > starting) trendCounts.growth += 1;
      else if (current < starting) trendCounts.loss += 1;
      else trendCounts.flat += 1;

      startingRangeCounts[bucketRange(starting)] += 1;
      currentRangeCounts[bucketRange(current)] += 1;

      const createdAt = new Date(u.created_at);
      const ageDays = Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
      if (createdAt.toDateString() === now.toDateString()) joinedCounts.today += 1;
      else if (ageDays <= 7) joinedCounts.last7 += 1;
      else if (ageDays <= 30) joinedCounts.last30 += 1;
      else if (ageDays <= 90) joinedCounts.last90 += 1;
      else joinedCounts.older += 1;

      const plan = (u.subscriptionPackageName || "").trim();
      if (plan) {
        planMap.set(plan, (planMap.get(plan) || 0) + 1);
      }

      const country = (u.country || "").trim();
      if (country) {
        countryMap.set(country, (countryMap.get(country) || 0) + 1);
      }
    }

    const topPlans = Array.from(planMap.entries()).sort((a, b) => b[1] - a[1]);
    const topCountries = Array.from(countryMap.entries()).sort((a, b) => b[1] - a[1]);
    const totalOnline = users.filter((u) => onlineUserIdSet.has(u.user_id)).length;
    const totalOffline = Math.max(0, users.length - totalOnline);

    return {
      statusCounts,
      durationCounts,
      trendCounts,
      joinedCounts,
      startingRangeCounts,
      currentRangeCounts,
      topPlans,
      topCountries,
      totalOnline,
      totalOffline,
    };
  }, [users, onlineUserIdSet, getSubscriptionStatus]);

  const maxPlanCount = Math.max(1, ...analytics.topPlans.map(([, count]) => count), 1);
  const maxCountryCount = Math.max(1, ...analytics.topCountries.map(([, count]) => count), 1);
  const durationItems = [
    {
      label: "Monthly",
      count: analytics.durationCounts.monthly,
      border: "border-sky-500/30",
      bg: "bg-sky-500/10",
      bar: "from-sky-400/85 to-cyan-300/75",
    },
    {
      label: "Yearly",
      count: analytics.durationCounts.yearly,
      border: "border-violet-500/30",
      bg: "bg-violet-500/10",
      bar: "from-violet-400/85 to-purple-300/75",
    },
    {
      label: "Lifetime",
      count: analytics.durationCounts.lifetime,
      border: "border-emerald-500/30",
      bg: "bg-emerald-500/10",
      bar: "from-emerald-400/85 to-green-300/75",
    },
    {
      label: "None",
      count: analytics.durationCounts.none,
      border: "border-muted-foreground/30",
      bg: "bg-muted/20",
      bar: "from-slate-300/85 to-slate-200/75",
    },
  ] as const;
  const maxDurationCount = Math.max(1, ...durationItems.map((d) => d.count), 1);
  const cohortItems = [
    { label: "Today", value: analytics.joinedCounts.today, color: "from-cyan-400/85 to-sky-300/75" },
    { label: "7d", value: analytics.joinedCounts.last7, color: "from-violet-400/85 to-purple-300/75" },
    { label: "30d", value: analytics.joinedCounts.last30, color: "from-emerald-400/85 to-lime-300/75" },
    { label: "90d", value: analytics.joinedCounts.last90, color: "from-amber-400/85 to-yellow-300/75" },
    { label: "Older", value: analytics.joinedCounts.older, color: "from-slate-300/85 to-slate-200/75" },
  ] as const;
  const maxCohortValue = Math.max(1, ...cohortItems.map((c) => c.value), 1);
  const totalUsersForDistribution = Math.max(users.length, 1);

  const balanceRangeMeta = [
    {
      key: "lt1000",
      label: "< $1K",
      segment: "from-rose-400/85 to-pink-400/85",
      dot: "bg-rose-400",
    },
    {
      key: "r1000to5000",
      label: "$1K - $5K",
      segment: "from-sky-400/85 to-cyan-400/85",
      dot: "bg-sky-400",
    },
    {
      key: "r5000to10000",
      label: "$5K - $10K",
      segment: "from-emerald-400/85 to-green-400/85",
      dot: "bg-emerald-400",
    },
    {
      key: "gt10000",
      label: "> $10K",
      segment: "from-violet-400/85 to-fuchsia-400/85",
      dot: "bg-violet-400",
    },
  ] as const;

  const startingDistribution = balanceRangeMeta.map((range) => {
    const count = analytics.startingRangeCounts[range.key];
    return {
      ...range,
      count,
      percent: (count / totalUsersForDistribution) * 100,
    };
  });

  const currentDistribution = balanceRangeMeta.map((range) => {
    const count = analytics.currentRangeCounts[range.key];
    return {
      ...range,
      count,
      percent: (count / totalUsersForDistribution) * 100,
    };
  });

  const planThemes = [
    { bar: "bg-gradient-to-r from-emerald-400/85 to-emerald-300/75", dot: "bg-emerald-400" },
    { bar: "bg-gradient-to-r from-sky-400/85 to-cyan-300/75", dot: "bg-sky-400" },
    { bar: "bg-gradient-to-r from-violet-400/85 to-fuchsia-300/75", dot: "bg-violet-400" },
    { bar: "bg-gradient-to-r from-amber-400/85 to-orange-300/75", dot: "bg-amber-400" },
    { bar: "bg-gradient-to-r from-rose-400/85 to-pink-300/75", dot: "bg-rose-400" },
    { bar: "bg-gradient-to-r from-lime-400/85 to-green-300/75", dot: "bg-lime-400" },
    { bar: "bg-gradient-to-r from-indigo-400/85 to-blue-300/75", dot: "bg-indigo-400" },
    { bar: "bg-gradient-to-r from-teal-400/85 to-cyan-300/75", dot: "bg-teal-400" },
  ] as const;

  const countryThemes = [
    { bar: "bg-gradient-to-r from-cyan-400/85 to-sky-300/75", dot: "bg-cyan-400" },
    { bar: "bg-gradient-to-r from-purple-400/85 to-violet-300/75", dot: "bg-purple-400" },
    { bar: "bg-gradient-to-r from-emerald-400/85 to-green-300/75", dot: "bg-emerald-400" },
    { bar: "bg-gradient-to-r from-amber-400/85 to-yellow-300/75", dot: "bg-amber-400" },
    { bar: "bg-gradient-to-r from-fuchsia-400/85 to-pink-300/75", dot: "bg-fuchsia-400" },
    { bar: "bg-gradient-to-r from-blue-400/85 to-indigo-300/75", dot: "bg-blue-400" },
  ] as const;

  const stableIndex = (value: string, modulo: number) => {
    let hash = 0;
    for (let i = 0; i < value.length; i += 1) {
      hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
    }
    return modulo > 0 ? hash % modulo : 0;
  };

  const getPlanTheme = (planName: string) =>
    planThemes[stableIndex(planName.toLowerCase(), planThemes.length)];
  const getCountryTheme = (countryName: string) =>
    countryThemes[stableIndex(countryName.toLowerCase(), countryThemes.length)];

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  return (
    <AdminLayout title="User Management">
      <div className="space-y-5">
        <section className="relative overflow-hidden rounded-2xl border border-border/50 bg-card/80">
          <div className="relative p-5 md:p-6 space-y-5">
            <div className="flex flex-col gap-4">
              <div>
                <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-border/50 bg-background/40 px-3 py-1 text-xs font-medium text-muted-foreground">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  Customer Intelligence
                </div>
                <h2 className="text-xl md:text-2xl font-semibold tracking-tight">User Command Center</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Monitor subscription health, presence behavior, and account balances in one place.
                </p>
              </div>
            </div>

            <div className="h-1 rounded-full bg-gradient-to-r from-primary/70 via-blue-400/55 to-cyan-400/45" />
          </div>
        </section>

        <div className="space-y-4">
          <div className="rounded-2xl border border-border/60 bg-card/70 p-4 md:p-5">
            <p className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">Subscription & Presence</p>
            <p className="mb-3 text-xs text-muted-foreground/80">
              Inactive means user has no subscription record yet.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2.5">
              <div className="rounded-xl border border-border/40 bg-background/50 px-3 py-2.5">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Total Users</p>
                <p className="mt-1 text-2xl font-semibold text-primary">{isLoading ? "..." : users.length}</p>
              </div>
              <div className="rounded-xl border border-border/40 bg-background/50 px-3 py-2.5">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Active</p>
                <p className="mt-1 text-2xl font-semibold text-success">{analytics.statusCounts.active}</p>
              </div>
              <div className="rounded-xl border border-border/40 bg-background/50 px-3 py-2.5">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Pending</p>
                <p className="mt-1 text-2xl font-semibold text-warning">{analytics.statusCounts.pending}</p>
              </div>
              <div className="rounded-xl border border-border/40 bg-background/50 px-3 py-2.5">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Expired</p>
                <p className="mt-1 text-2xl font-semibold text-destructive">{analytics.statusCounts.expired}</p>
              </div>
              <div className="rounded-xl border border-border/40 bg-background/50 px-3 py-2.5">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Inactive</p>
                <p className="mt-1 text-2xl font-semibold">{analytics.statusCounts.inactive}</p>
                <p className="mt-0.5 text-[10px] text-muted-foreground/80">No subscription row</p>
              </div>
              <div className="rounded-xl border border-border/40 bg-background/50 px-3 py-2.5">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Online</p>
                <p className="mt-1 text-2xl font-semibold text-success">{analytics.totalOnline}</p>
              </div>
              <div className="rounded-xl border border-border/40 bg-background/50 px-3 py-2.5">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Offline</p>
                <p className="mt-1 text-2xl font-semibold text-muted-foreground">{analytics.totalOffline}</p>
              </div>
              <div className="rounded-xl border border-border/40 bg-background/50 px-3 py-2.5">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Avg Time/Day</p>
                <p className="mt-1 text-2xl font-semibold text-primary">{formatDuration(avgSessionSeconds)}</p>
                <p className="mt-0.5 text-[10px] text-muted-foreground/80">All registered users</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-border/60 bg-card/70 p-4 md:p-5">
            <div className="mb-4 flex items-center gap-2">
              <Layers3 className="h-4 w-4 text-primary" />
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Plan & Duration Mix</p>
            </div>
            <div className="space-y-2.5 max-h-52 overflow-y-auto pr-1">
              {(analytics.topPlans.length > 0 ? analytics.topPlans : [["No plan", 0]]).map(([name, count]) => {
                const planTheme = getPlanTheme(name);
                return (
                <div key={name}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="truncate text-foreground/90 flex items-center gap-2">
                      <span className={cn("h-2 w-2 rounded-full", planTheme.dot)} />
                      {name}
                    </span>
                    <span className="font-semibold">{count}</span>
                  </div>
                  <div className="h-2 rounded-full bg-secondary/40 overflow-hidden">
                    <div
                      className={cn("h-full rounded-full", planTheme.bar)}
                      style={{ width: `${Math.max(6, (count / maxPlanCount) * 100)}%` }}
                    />
                  </div>
                </div>
                );
              })}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 text-xs max-h-44 overflow-y-auto pr-1">
              {durationItems.map((item) => (
                <div key={item.label} className={cn("rounded-lg border px-3 py-2", item.border, item.bg)}>
                  <div className="flex items-center justify-between mb-1">
                    <span>{item.label}</span>
                    <span className="font-semibold">{item.count}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-secondary/40 overflow-hidden">
                    <div
                      className={cn("h-full rounded-full bg-gradient-to-r", item.bar)}
                      style={{ width: `${Math.max(item.count > 0 ? 8 : 0, (item.count / maxDurationCount) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">None means duration type is not set on that user subscription.</p>
          </div>

            <div className="rounded-2xl border border-border/60 bg-card/70 p-4 md:p-5">
            <div className="mb-4 flex items-center gap-2">
              <Globe2 className="h-4 w-4 text-primary" />
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Countries & Trend</p>
            </div>
            <div className="space-y-2.5 max-h-52 overflow-y-auto pr-1">
              {(analytics.topCountries.length > 0 ? analytics.topCountries : [["No country", 0]]).map(([country, count]) => {
                const countryTheme = getCountryTheme(country);
                return (
                <div key={country}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="truncate text-foreground/90 flex items-center gap-2">
                      <span className={cn("h-2 w-2 rounded-full", countryTheme.dot)} />
                      {country}
                    </span>
                    <span className="font-semibold">{count}</span>
                  </div>
                  <div className="h-2 rounded-full bg-secondary/40 overflow-hidden">
                    <div
                      className={cn("h-full rounded-full", countryTheme.bar)}
                      style={{ width: `${Math.max(6, (count / maxCountryCount) * 100)}%` }}
                    />
                  </div>
                </div>
                );
              })}
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
              <div className="rounded-lg bg-success/10 border border-success/25 px-3 py-2 text-center">
                Growth
                <p className="font-semibold text-success mt-1">{analytics.trendCounts.growth}</p>
              </div>
              <div className="rounded-lg bg-destructive/10 border border-destructive/25 px-3 py-2 text-center">
                Loss
                <p className="font-semibold text-destructive mt-1">{analytics.trendCounts.loss}</p>
              </div>
              <div className="rounded-lg bg-muted/30 border border-border/40 px-3 py-2 text-center">
                Flat
                <p className="font-semibold mt-1">{analytics.trendCounts.flat}</p>
              </div>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Growth = current balance above starting balance. Loss = below starting balance. Flat = equal balances.
            </p>
          </div>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-border/60 bg-card/70 p-4 md:p-5">
            <div className="mb-4 flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Joined Cohorts</p>
            </div>
            <div className="space-y-2.5 text-sm max-h-60 overflow-y-auto pr-1">
              {cohortItems.map((cohort) => (
                <div key={cohort.label}>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-foreground/90">{cohort.label}</span>
                    <span className="font-semibold">{cohort.value}</span>
                  </div>
                  <div className="h-2 rounded-full bg-secondary/35 overflow-hidden">
                    <div
                      className={cn("h-full rounded-full bg-gradient-to-r", cohort.color)}
                      style={{ width: `${Math.max(cohort.value > 0 ? 8 : 0, (cohort.value / maxCohortValue) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[11px] text-muted-foreground">
              Joined Cohorts groups users by signup age: Today, last 7 days, last 30 days, last 90 days, and Older.
            </p>
          </div>

          <div className="rounded-2xl border border-border/60 bg-card/70 p-4 md:p-5">
            <div className="mb-4 flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Balance Distribution</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div className="rounded-xl border border-border/40 bg-secondary/15 p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Starting Balance</p>
                  <span className="text-xs text-muted-foreground">{users.length} users</span>
                </div>
                <div className="h-3 rounded-full bg-secondary/35 overflow-hidden flex">
                  {startingDistribution.map((range) => (
                    <div
                      key={`start-segment-${range.key}`}
                      className={cn("h-full bg-gradient-to-r", range.segment)}
                      style={{ width: `${range.percent}%` }}
                      title={`${range.label}: ${range.count} (${range.percent.toFixed(1)}%)`}
                    />
                  ))}
                </div>
                <div className="mt-3 space-y-2 max-h-44 overflow-y-auto pr-1">
                  {startingDistribution.map((range) => (
                    <div key={`start-row-${range.key}`}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="flex items-center gap-2">
                          <span className={cn("h-2 w-2 rounded-full", range.dot)} />
                          {range.label}
                        </span>
                        <span className="font-semibold">{range.count}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-secondary/35 overflow-hidden">
                        <div
                          className={cn("h-full rounded-full bg-gradient-to-r", range.segment)}
                          style={{ width: `${Math.max(range.percent, range.count > 0 ? 6 : 0)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-xl border border-border/40 bg-secondary/15 p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Current Balance</p>
                  <span className="text-xs text-muted-foreground">{users.length} users</span>
                </div>
                <div className="h-3 rounded-full bg-secondary/35 overflow-hidden flex">
                  {currentDistribution.map((range) => (
                    <div
                      key={`current-segment-${range.key}`}
                      className={cn("h-full bg-gradient-to-r", range.segment)}
                      style={{ width: `${range.percent}%` }}
                      title={`${range.label}: ${range.count} (${range.percent.toFixed(1)}%)`}
                    />
                  ))}
                </div>
                <div className="mt-3 space-y-2 max-h-44 overflow-y-auto pr-1">
                  {currentDistribution.map((range) => (
                    <div key={`current-row-${range.key}`}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="flex items-center gap-2">
                          <span className={cn("h-2 w-2 rounded-full", range.dot)} />
                          {range.label}
                        </span>
                        <span className="font-semibold">{range.count}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-secondary/35 overflow-hidden">
                        <div
                          className={cn("h-full rounded-full bg-gradient-to-r", range.segment)}
                          style={{ width: `${Math.max(range.percent, range.count > 0 ? 6 : 0)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border/60 bg-card/70 p-4 md:p-5 mt-6">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="relative flex-1 max-w-xl">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              placeholder="Search by name, email, phone, or username..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              className="pl-10 h-11 bg-background/70 border-border/50"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm text-muted-foreground xl:mr-2">
              {isLoading ? "Loading users..." : `${filteredUsers.length} shown of ${totalCount} users`}
            </p>
            <Select value={sortBy} onValueChange={(v) => { setSortBy(v); setPage(1); }}>
              <SelectTrigger className="h-10 w-[170px] bg-background/60 border-border/50">
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
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
            <Select value={rowsPerPage} onValueChange={(v) => { setRowsPerPage(v); setPage(1); }}>
              <SelectTrigger className="h-10 w-[120px] bg-background/60 border-border/50">
                <SelectValue placeholder="Rows" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10 rows</SelectItem>
                <SelectItem value="20">20 rows</SelectItem>
                <SelectItem value="50">50 rows</SelectItem>
                <SelectItem value="100">100 rows</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/70 shadow-[0_16px_42px_-30px_hsl(var(--foreground)/0.45)] mt-4">
        <div className="flex items-center justify-between border-b border-border/50 px-6 py-4 bg-gradient-to-r from-background/50 to-transparent">
          <p className="text-sm font-semibold">User Directory</p>
          <p className="text-xs text-muted-foreground">Page {page} of {totalPages}</p>
        </div>
        {isLoading ? (
          <div className="flex min-h-[640px] items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="min-h-[640px] flex items-center justify-center text-center px-6">
            <div>
            <User className="w-12 h-12 mx-auto text-muted-foreground/40 mb-4" />
            <p className="text-lg font-semibold">No users found</p>
            <p className="text-muted-foreground">
              {searchQuery ? "Try a different search." : "No users have signed up yet."}
            </p>
            </div>
          </div>
        ) : (
          <div className="min-h-[640px] flex flex-col">
            <div className="overflow-x-auto flex-1">
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
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminUsers;
