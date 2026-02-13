import { AdminLayout } from "@/components/layout/AdminLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useBrand } from "@/contexts/BrandContext";
import { StatCard } from "@/components/dashboard/StatCard";
import { EquityChart } from "@/components/dashboard/EquityChart";
import { ActiveTradesTable } from "@/components/dashboard/ActiveTradesTable";
import { PerformanceBySessionDay } from "@/components/dashboard/PerformanceBySessionDay";
import { UpcomingTradesSection } from "@/components/dashboard/UpcomingTradesSection";
import { TradeHistorySection } from "@/components/dashboard/TradeHistorySection";
import { PerformanceAnalytics } from "@/components/dashboard/PerformanceAnalytics";
import { CalendarSection } from "@/components/dashboard/CalendarSection";
import { supabase } from "@/integrations/supabase/client";
import { useProviderAwareTradeStats } from "@/hooks/useProviderAwareTrades";
import { useGlobalTradeStats } from "@/hooks/useGlobalTradeStats";
import { ProviderPerformanceTable } from "@/components/admin/platform-analytics/ProviderPerformanceTable";
import { DashboardCustomizer } from "@/components/dashboard/DashboardCustomizer";
import { useDashboardLayout, DashboardSection } from "@/hooks/useDashboardLayout";
import { MetricInfoTooltip } from "@/components/common/MetricInfoTooltip";
import {
  TrendingUp,
  TrendingDown,
  Activity,
  Target,
  Percent,
  Users,
  Wallet,
} from "lucide-react";
import { useEffect, useState } from "react";

interface UserOverviewStats {
  totalUsers: number;
  totalStartingBalance: number;
  totalBalanceGrowth: number;
  totalBalanceLoss: number;
}

const ADMIN_TRADING_SECTIONS: DashboardSection[] = [
  { id: "user-overview", label: "User Overview", enabled: true },
  { id: "stats", label: "Overview Stats", enabled: true },
  { id: "charts-and-signals", label: "Equity Chart & Recent Signals", enabled: true },
  { id: "performance-analytics", label: "Performance Analytics", enabled: true },
  { id: "admin-provider-performance", label: "Provider Performance", enabled: true },
  { id: "calendar", label: "Trading Calendar", enabled: true },
  { id: "active-trades", label: "Active Trades", enabled: true },
  { id: "upcoming-trades", label: "Upcoming Trades", enabled: true },
  { id: "trade-history", label: "Trade History", enabled: true },
];

const AdminDashboard = () => {
  const { profile } = useAuth();
  const { settings } = useBrand();
  const [userOverviewLoading, setUserOverviewLoading] = useState(true);
  const [userOverview, setUserOverview] = useState<UserOverviewStats>({
    totalUsers: 0,
    totalStartingBalance: 0,
    totalBalanceGrowth: 0,
    totalBalanceLoss: 0,
  });
  const { stats: tradeStats, isLoading: tradeStatsLoading } = useProviderAwareTradeStats({
    adminGlobalView: true,
  });
  const { providerStats, isLoading: qualityLoading } = useGlobalTradeStats();
  const { sections, updateOrder, resetLayout, isLoaded } = useDashboardLayout(
    "dashboard-layout-admin-global-v1",
    ADMIN_TRADING_SECTIONS,
  );

  const riskPercent = Number(settings?.global_risk_percent || 2);
  const closedTrades = tradeStats.wins + tradeStats.losses + tradeStats.breakeven;
  const decidedTrades = tradeStats.wins + tradeStats.losses;
  const lossRate = decidedTrades > 0 ? (tradeStats.losses / decidedTrades) * 100 : 0;

  useEffect(() => {
    const fetchUserOverview = async () => {
      try {
        setUserOverviewLoading(true);

        const [{ data: userRoles }, { data: profiles }] = await Promise.all([
          supabase.from("user_roles").select("user_id").eq("role", "user"),
          supabase.from("profiles").select("user_id, account_balance, starting_balance"),
        ]);

        const roleUserIds = new Set((userRoles || []).map((row) => row.user_id));
        const userProfiles = (profiles || []).filter((p) => roleUserIds.has(p.user_id));

        const computed = userProfiles.reduce(
          (acc, p) => {
            const currentBalance = Number(p.account_balance || 0);
            const startingBalanceRaw =
              p.starting_balance === null || p.starting_balance === undefined
                ? currentBalance
                : Number(p.starting_balance);

            const startingBalance = Number.isFinite(startingBalanceRaw) ? startingBalanceRaw : 0;
            const delta = currentBalance - startingBalance;

            acc.totalUsers += 1;
            acc.totalStartingBalance += startingBalance;
            if (delta >= 0) acc.totalBalanceGrowth += delta;
            else acc.totalBalanceLoss += Math.abs(delta);

            return acc;
          },
          {
            totalUsers: 0,
            totalStartingBalance: 0,
            totalBalanceGrowth: 0,
            totalBalanceLoss: 0,
          } as UserOverviewStats,
        );

        setUserOverview(computed);
      } catch (error) {
        console.error("Error loading user overview stats:", error);
      } finally {
        setUserOverviewLoading(false);
      }
    };

    fetchUserOverview();

    const channel = supabase
      .channel("admin-user-overview-dashboard")
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, fetchUserOverview)
      .on("postgres_changes", { event: "*", schema: "public", table: "user_roles" }, fetchUserOverview)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  if (!isLoaded) return null;

  const sectionContent: Record<string, React.ReactNode> = {
    "user-overview": (
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          title="Total Users"
          value={userOverviewLoading ? "..." : userOverview.totalUsers.toString()}
          change="Registered user accounts"
          changeType="neutral"
          icon={Users}
          iconColor="text-primary"
        />
        <StatCard
          title="Total Users Starting Balance"
          value={userOverviewLoading ? "..." : `$${userOverview.totalStartingBalance.toFixed(2)}`}
          change="Sum of user starting balances"
          changeType="neutral"
          icon={Wallet}
          iconColor="text-primary"
        />
        <StatCard
          title="Total Users Balance Growth"
          value={userOverviewLoading ? "..." : `+$${userOverview.totalBalanceGrowth.toFixed(2)}`}
          change="Users currently above start"
          changeType="profit"
          icon={TrendingUp}
          iconColor="text-success"
        />
        <StatCard
          title="Total Users Balance Loss"
          value={userOverviewLoading ? "..." : `-$${userOverview.totalBalanceLoss.toFixed(2)}`}
          change="Users currently below start"
          changeType="loss"
          icon={TrendingDown}
          iconColor="text-destructive"
        />
      </div>
    ),
    stats: (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4 mb-8">
        <StatCard
          title={
            <MetricInfoTooltip
              label="Total Trades"
              description="Closed trades count. Active trades are shown separately."
            />
          }
          value={tradeStatsLoading ? "..." : closedTrades.toString()}
          change={`${tradeStats.pending} active`}
          changeType="neutral"
          icon={Activity}
          iconColor="text-primary"
        />
        <StatCard
          title="Winning Trades"
          value={tradeStatsLoading ? "..." : tradeStats.wins.toString()}
          change={`${tradeStats.winRate.toFixed(0)}% win rate`}
          changeType="profit"
          icon={TrendingUp}
          iconColor="text-success"
        />
        <StatCard
          title="Losing Trades"
          value={tradeStatsLoading ? "..." : tradeStats.losses.toString()}
          change={`${lossRate.toFixed(0)}% loss rate`}
          changeType="loss"
          icon={TrendingDown}
          iconColor="text-destructive"
        />
        <StatCard
          title={
            <MetricInfoTooltip
              label="Breakeven Trades"
              description="Trades closed at no net gain or loss."
            />
          }
          value={tradeStatsLoading ? "..." : tradeStats.breakeven.toString()}
          change="No P&L impact"
          changeType="neutral"
          icon={Activity}
          iconColor="text-warning"
        />
        <StatCard
          title={
            <MetricInfoTooltip
              label="Win Rate"
              description="Wins divided by (Wins + Losses). Breakeven is excluded."
            />
          }
          value={tradeStatsLoading ? "..." : `${tradeStats.winRate.toFixed(0)}%`}
          change={tradeStats.winRate >= 50 ? "On track" : "Needs improvement"}
          changeType={tradeStats.winRate >= 50 ? "profit" : "loss"}
          icon={Target}
          iconColor="text-success"
        />
        <StatCard
          title={
            <MetricInfoTooltip
              label="Risk/Trade"
              description="Global configured risk percent used in risk-based estimates."
            />
          }
          value={`${riskPercent}%`}
          change="Global setting"
          changeType="neutral"
          icon={Percent}
          iconColor="text-warning"
        />
      </div>
    ),
    "active-trades": (
      <div className="mb-8">
        <ActiveTradesTable adminGlobalView />
      </div>
    ),
    "upcoming-trades": (
      <div className="mb-8">
        <UpcomingTradesSection adminGlobalView />
      </div>
    ),
    calendar: (
      <div className="mb-8">
        <CalendarSection adminGlobalView />
      </div>
    ),
    "performance-analytics": (
      <div className="mb-8">
        <PerformanceAnalytics adminGlobalView />
      </div>
    ),
    "admin-provider-performance": (
      <div className="mb-8">
        <ProviderPerformanceTable providers={providerStats} isLoading={qualityLoading} />
      </div>
    ),
    "charts-and-signals": (
      <div className="grid grid-cols-1 xl:grid-cols-3 items-stretch gap-6 mb-8">
        <div className="xl:col-span-2 h-full">
          <EquityChart adminGlobalView />
        </div>
        <div className="h-full">
          <PerformanceBySessionDay adminGlobalView />
        </div>
      </div>
    ),
    "trade-history": (
      <div className="mb-8">
        <TradeHistorySection adminGlobalView />
      </div>
    ),
  };

  return (
    <AdminLayout
      title="Admin Dashboard"
      subtitle={`Welcome back, ${profile?.first_name ? `${profile.first_name} ${profile.last_name || ""}` : "Admin"}. Here's your global performance summary.`}
      action={
        <DashboardCustomizer sections={sections} onReorder={updateOrder} onReset={resetLayout} />
      }
    >
      {sections.map((section) => {
        if (!section.enabled) return null;
        return <div key={section.id}>{sectionContent[section.id]}</div>;
      })}

      <div className="mt-8 p-4 rounded-xl bg-warning/10 border border-warning/20">
        <p className="text-xs text-warning leading-relaxed">
          Global dashboard values are aggregated across all providers and admin-issued trades.
        </p>
      </div>
    </AdminLayout>
  );
};

export default AdminDashboard;
