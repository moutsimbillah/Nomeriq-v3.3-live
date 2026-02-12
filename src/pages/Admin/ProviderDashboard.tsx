import { AdminLayout } from "@/components/layout/AdminLayout";
import { useProviderTradeStats } from "@/hooks/useProviderTradeStats";
import { ProviderKPICards } from "@/components/admin/provider-analytics/ProviderKPICards";
import { ProviderEquityCurve } from "@/components/admin/provider-analytics/ProviderEquityCurve";
import { ProviderPeriodAnalytics } from "@/components/admin/provider-analytics/ProviderPeriodAnalytics";
import { ProviderPairPerformance } from "@/components/admin/provider-analytics/ProviderPairPerformance";
import { ProviderRecentSignals } from "@/components/admin/provider-analytics/ProviderRecentSignals";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, User } from "lucide-react";

import { useDashboardLayout, DashboardSection } from "@/hooks/useDashboardLayout";
import { DashboardCustomizer } from "@/components/dashboard/DashboardCustomizer";

const PROVIDER_SECTIONS: DashboardSection[] = [
  { id: 'provider-welcome', label: 'Welcome Section', enabled: true },
  { id: 'provider-kpi', label: 'Performance Overview', enabled: true },
  { id: 'provider-period-analytics', label: 'Period Analytics', enabled: true },
  { id: 'provider-equity-signals', label: 'Equity & Recent Signals', enabled: true },
  { id: 'provider-pair-performance', label: 'Pair Performance', enabled: true },
];

const ProviderDashboard = () => {
  const { profile } = useAuth();
  const {
    signals,
    providerStats,
    periodStats,
    pairStats,
    equityCurveData,
    isLoading,
    period,
    setPeriod,
  } = useProviderTradeStats();

  const { sections, updateOrder, resetLayout, isLoaded } = useDashboardLayout('dashboard-layout-provider-v1', PROVIDER_SECTIONS);

  if (isLoading || !isLoaded) {
    return (
      <AdminLayout title="My Dashboard">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AdminLayout>
    );
  }

  const providerName = profile?.first_name
    ? `${profile.first_name}'s`
    : 'Your';

  const sectionContent: Record<string, React.ReactNode> = {
    'provider-welcome': (
      <div className="glass-card p-6 shadow-none border-l-4 border-l-primary">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-xl bg-primary/10">
            <User className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold">{providerName} Signal Provider Dashboard</h2>
            <p className="text-sm text-muted-foreground">
              All metrics below are based exclusively on your signals. Your data is isolated from other providers.
            </p>
          </div>
        </div>
      </div>
    ),
    'provider-kpi': (
      <div>
        <h3 className="text-lg font-semibold mb-4">Performance Overview</h3>
        <ProviderKPICards stats={providerStats} isLoading={isLoading} />
      </div>
    ),
    'provider-period-analytics': (
      <ProviderPeriodAnalytics
        stats={periodStats}
        period={period}
        setPeriod={setPeriod}
        isLoading={isLoading}
      />
    ),
    'provider-equity-signals': (
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <ProviderEquityCurve data={equityCurveData} isLoading={isLoading} />
        <ProviderRecentSignals signals={signals} isLoading={isLoading} />
      </div>
    ),
    'provider-pair-performance': (
      <ProviderPairPerformance pairStats={pairStats} isLoading={isLoading} />
    )
  };

  return (
    <AdminLayout
      title="My Dashboard"
      subtitle={`Welcome back, ${profile?.first_name ? `${profile.first_name} ${profile.last_name || ''}` : 'Provider'}. Here's your performance summary.`}
      action={
        <DashboardCustomizer
          sections={sections}
          onReorder={updateOrder}
          onReset={resetLayout}
        />
      }
    >
      <div className="space-y-6">
        {sections.map(section => {
          if (!section.enabled) return null;
          return (
            <div key={section.id}>
              {sectionContent[section.id]}
            </div>
          );
        })}

        {/* Disclaimer - Forever at bottom */}
        <div className="p-4 rounded-xl bg-primary/10 border border-primary/20">
          <p className="text-xs text-primary leading-relaxed">
            📊 <strong>Provider Analytics:</strong> All statistics shown are calculated exclusively from your signals.
            Equity curve simulates a $10,000 starting balance with 2% risk per trade.
            Subscriber count reflects unique users who have traded your signals.
            Your data is completely isolated from other providers on the platform.
          </p>
        </div>
      </div>
    </AdminLayout>
  );
};

export default ProviderDashboard;
