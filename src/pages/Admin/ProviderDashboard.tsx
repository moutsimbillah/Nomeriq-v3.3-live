import { AdminLayout } from "@/components/layout/AdminLayout";
import { useProviderTradeStats } from "@/hooks/useProviderTradeStats";
import { ProviderKPICards } from "@/components/admin/provider-analytics/ProviderKPICards";
import { ProviderEquityCurve } from "@/components/admin/provider-analytics/ProviderEquityCurve";
import { ProviderPeriodAnalytics } from "@/components/admin/provider-analytics/ProviderPeriodAnalytics";
import { ProviderPairPerformance } from "@/components/admin/provider-analytics/ProviderPairPerformance";
import { ProviderRecentSignals } from "@/components/admin/provider-analytics/ProviderRecentSignals";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, User } from "lucide-react";

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

  if (isLoading) {
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

  return (
    <AdminLayout title="My Dashboard">
      <div className="space-y-6">
        {/* Welcome Section */}
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

        {/* KPI Cards */}
        <div>
          <h3 className="text-lg font-semibold mb-4">Performance Overview</h3>
          <ProviderKPICards stats={providerStats} isLoading={isLoading} />
        </div>

        {/* Period Analytics */}
        <ProviderPeriodAnalytics
          stats={periodStats}
          period={period}
          setPeriod={setPeriod}
          isLoading={isLoading}
        />

        {/* Equity Curve & Recent Signals */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <ProviderEquityCurve data={equityCurveData} isLoading={isLoading} />
          <ProviderRecentSignals signals={signals} isLoading={isLoading} />
        </div>

        {/* Pair Performance */}
        <ProviderPairPerformance pairStats={pairStats} isLoading={isLoading} />

        {/* Disclaimer */}
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
