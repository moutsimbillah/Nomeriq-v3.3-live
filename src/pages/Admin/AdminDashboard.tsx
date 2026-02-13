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
import { useProviderAwareTradeStats } from "@/hooks/useProviderAwareTrades";
import { useGlobalTradeStats } from "@/hooks/useGlobalTradeStats";
import { SignalQualityHealth } from "@/components/admin/platform-analytics/SignalQualityHealth";
import { ProviderPerformanceTable } from "@/components/admin/platform-analytics/ProviderPerformanceTable";
import { DashboardCustomizer } from "@/components/dashboard/DashboardCustomizer";
import { useDashboardLayout, DashboardSection } from "@/hooks/useDashboardLayout";
import {
  TrendingUp,
  TrendingDown,
  Activity,
  Target,
  Percent,
} from "lucide-react";

const ADMIN_TRADING_SECTIONS: DashboardSection[] = [
  { id: "stats", label: "Overview Stats", enabled: true },
  { id: "charts-and-signals", label: "Equity Chart & Recent Signals", enabled: true },
  { id: "performance-analytics", label: "Performance Analytics", enabled: true },
  { id: "admin-signal-quality", label: "Signal Quality & Health", enabled: true },
  { id: "admin-provider-performance", label: "Provider Performance", enabled: true },
  { id: "calendar", label: "Trading Calendar", enabled: true },
  { id: "active-trades", label: "Active Trades", enabled: true },
  { id: "upcoming-trades", label: "Upcoming Trades", enabled: true },
  { id: "trade-history", label: "Trade History", enabled: true },
];

const AdminDashboard = () => {
  const { profile } = useAuth();
  const { settings } = useBrand();
  const { stats, isLoading: statsLoading } = useProviderAwareTradeStats({ adminGlobalView: true });
  const { qualityStats, tradeDistribution, providerStats, isLoading: qualityLoading } = useGlobalTradeStats();
  const { sections, updateOrder, resetLayout, isLoaded } = useDashboardLayout(
    "dashboard-layout-admin-global-v1",
    ADMIN_TRADING_SECTIONS,
  );

  const riskPercent = Number(settings?.global_risk_percent || 2);

  if (!isLoaded) return null;

  const sectionContent: Record<string, React.ReactNode> = {
    stats: (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4 mb-8">
        <StatCard
          title="Total Trades"
          value={statsLoading ? "..." : stats.totalTrades.toString()}
          change={`${stats.pending} active`}
          changeType="neutral"
          icon={Activity}
          iconColor="text-primary"
        />
        <StatCard
          title="Winning Trades"
          value={statsLoading ? "..." : stats.wins.toString()}
          change={`${stats.winRate.toFixed(0)}% win rate`}
          changeType="profit"
          icon={TrendingUp}
          iconColor="text-success"
        />
        <StatCard
          title="Losing Trades"
          value={statsLoading ? "..." : stats.losses.toString()}
          change={`${(100 - stats.winRate).toFixed(0)}% loss rate`}
          changeType="loss"
          icon={TrendingDown}
          iconColor="text-destructive"
        />
        <StatCard
          title="Breakeven Trades"
          value={statsLoading ? "..." : stats.breakeven.toString()}
          change="No P&L impact"
          changeType="neutral"
          icon={Activity}
          iconColor="text-warning"
        />
        <StatCard
          title="Win Rate"
          value={statsLoading ? "..." : `${stats.winRate.toFixed(0)}%`}
          change={stats.winRate >= 50 ? "On track" : "Needs improvement"}
          changeType={stats.winRate >= 50 ? "profit" : "loss"}
          icon={Target}
          iconColor="text-success"
        />
        <StatCard
          title="Risk/Trade"
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
    "admin-signal-quality": (
      <div className="mb-8">
        <SignalQualityHealth
          qualityStats={qualityStats}
          avgHoldingHours={tradeDistribution.avgTradeDuration}
          isLoading={qualityLoading}
        />
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
