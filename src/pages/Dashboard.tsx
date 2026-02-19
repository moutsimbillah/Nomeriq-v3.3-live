import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { StatCard } from "@/components/dashboard/StatCard";
import { EquityChart } from "@/components/dashboard/EquityChart";
import { ActiveTradesTable } from "@/components/dashboard/ActiveTradesTable";
import { PerformanceBySessionDay } from "@/components/dashboard/PerformanceBySessionDay";
import { UpcomingTradesSection } from "@/components/dashboard/UpcomingTradesSection";
import { TradeHistorySection } from "@/components/dashboard/TradeHistorySection";
import { PerformanceAnalytics } from "@/components/dashboard/PerformanceAnalytics";
import { CalendarSection } from "@/components/dashboard/CalendarSection";
import { useProviderAwareTradeStats } from "@/hooks/useProviderAwareTrades";
import { useProviderAwareTrades } from "@/hooks/useProviderAwareTrades";
import { useAuth } from "@/contexts/AuthContext";
import { useBrand } from "@/contexts/BrandContext";
import { useAdminRole } from "@/hooks/useAdminRole";
import { Badge } from "@/components/ui/badge";
import { useMemo } from "react";
import {
  TrendingUp,
  TrendingDown,
  Activity,
  Target,
  Percent,
  User,
} from "lucide-react";
import { useDashboardLayout, DashboardSectionId } from "@/hooks/useDashboardLayout";
import { DashboardCustomizer } from "@/components/dashboard/DashboardCustomizer";

const Dashboard = () => {
  const { stats, isLoading: statsLoading, isProvider } = useProviderAwareTradeStats();
  const { trades: pendingTrades, isLoading: pendingTradesLoading } = useProviderAwareTrades({
    result: "pending",
    fetchAll: true,
    realtime: true,
  });
  const { profile } = useAuth();
  const { settings } = useBrand();
  const { adminRole } = useAdminRole();

  const riskPercent = settings?.global_risk_percent || 2;
  const balance = profile?.account_balance || 0;
  const riskAmount = (balance * riskPercent) / 100;

  // Calculate unrealized P&L from active trades (simplified - would need real price data)
  const unrealizedPnL = stats.totalPnL > 0 ? stats.totalPnL : 0;

  const visibleActiveTrades = useMemo(() => {
    const activeTrades = pendingTrades.filter(
      (trade) =>
        trade.signal?.status === "active" &&
        (trade.signal?.signal_type || "signal") === "signal",
    );

    if (!isProvider) {
      return activeTrades.length;
    }

    return new Set(
      activeTrades
        .map((trade) => trade.signal?.id)
        .filter((signalId): signalId is string => Boolean(signalId)),
    ).size;
  }, [pendingTrades, isProvider]);

  const { sections, updateOrder, resetLayout, isLoaded } = useDashboardLayout();

  if (!isLoaded) return null;

  const sectionContent: Record<DashboardSectionId, React.ReactNode> = {
    'stats': (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4 mb-8">
        <StatCard
          title="Total Trades"
          value={statsLoading ? "..." : stats.totalTrades.toString()}
          change={statsLoading || pendingTradesLoading ? "..." : `${visibleActiveTrades} active`}
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
          change={`$${riskAmount.toFixed(0)} per trade`}
          changeType="neutral"
          icon={Percent}
          iconColor="text-warning"
        />
      </div>
    ),
    'active-trades': (
      <div className="mb-8">
        <ActiveTradesTable />
      </div>
    ),
    'upcoming-trades': (
      <div className="mb-8">
        <UpcomingTradesSection />
      </div>
    ),
    'calendar': (
      <div className="mb-8">
        <CalendarSection />
      </div>
    ),
    'performance-analytics': (
      <div className="mb-8">
        <PerformanceAnalytics />
      </div>
    ),
    'charts-and-signals': (
      <div className="grid grid-cols-1 xl:grid-cols-3 items-stretch gap-6 mb-8">
        <div className="xl:col-span-2 h-full">
          <EquityChart />
        </div>
        <div className="h-full">
          <PerformanceBySessionDay />
        </div>
      </div>
    ),
    'trade-history': (
      <div className="mb-8">
        <TradeHistorySection />
      </div>
    )
  };

  return (
    <DashboardLayout
      title="Dashboard"
      subtitle={`Welcome back, ${profile?.first_name ? `${profile.first_name} ${profile.last_name || ''}` : 'Trader'}. Here's your performance summary.`}
      action={
        <DashboardCustomizer
          sections={sections}
          onReorder={updateOrder}
          onReset={resetLayout}
        />
      }
    >
      {/* Provider Mode Indicator */}
      {isProvider && (
        <div className="mb-6 p-4 rounded-xl bg-primary/10 border border-primary/20 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/20">
            <User className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-primary">Provider Mode Active</h3>
              <Badge variant="outline" className="text-xs border-primary/30 text-primary">
                {adminRole === 'super_admin' ? 'Super Admin' : 'Signal Provider'}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              All data shown is filtered to your own signals and trades only.
            </p>
          </div>
        </div>
      )}

      {/* Dynamic Sections */}
      {sections.map(section => {
        if (!section.enabled) return null;
        return (
          <div key={section.id}>
            {sectionContent[section.id]}
          </div>
        );
      })}

      {/* Disclaimer */}
      <div className="mt-8 p-4 rounded-xl bg-warning/10 border border-warning/20">
        <p className="text-xs text-warning leading-relaxed">
          📌 All performance and account growth are simulated based on fixed risk
          rules. Results are for tracking and educational purposes only. Actual
          trading results may vary.
        </p>
      </div>
    </DashboardLayout>
  );
};

export default Dashboard;
