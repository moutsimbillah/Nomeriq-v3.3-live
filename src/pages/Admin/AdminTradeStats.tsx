import { AdminLayout } from "@/components/layout/AdminLayout";
import { useGlobalTradeStats } from "@/hooks/useGlobalTradeStats";
import { GlobalKPICards } from "@/components/admin/platform-analytics/GlobalKPICards";
import { TimePeriodAnalytics } from "@/components/admin/platform-analytics/TimePeriodAnalytics";
import { ProviderPerformanceTable } from "@/components/admin/platform-analytics/ProviderPerformanceTable";
import { PairMarketPerformance } from "@/components/admin/platform-analytics/PairMarketPerformance";
import { RiskDrawdownAnalytics } from "@/components/admin/platform-analytics/RiskDrawdownAnalytics";
import { SignalQualityHealth } from "@/components/admin/platform-analytics/SignalQualityHealth";
import { GlobalEquityCurve } from "@/components/admin/platform-analytics/GlobalEquityCurve";
import { TradeDistributionCharts } from "@/components/admin/platform-analytics/TradeDistributionCharts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  BarChart3, 
  TrendingUp, 
  Users, 
  PieChart, 
  AlertTriangle, 
  Shield, 
  LineChart,
  LayoutGrid
} from "lucide-react";

const AdminTradeStats = () => {
  const {
    globalStats,
    periodStats,
    providerStats,
    pairStats,
    categoryStats,
    riskStats,
    qualityStats,
    tradeDistribution,
    equityCurveData,
    globalRiskPercent,
    isLoading,
    period,
    setPeriod,
    dateRange,
    customRange,
    setCustomRange,
  } = useGlobalTradeStats();

  return (
    <AdminLayout title="Platform Trade Stats">
      {/* Global KPI Cards */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold">Global Trade Overview</h2>
        </div>
        <GlobalKPICards stats={globalStats} isLoading={isLoading} />
      </div>

      {/* Tabbed Analytics Sections */}
      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-grid lg:grid-cols-8 gap-1">
          <TabsTrigger value="overview" className="gap-1.5">
            <LayoutGrid className="w-4 h-4" />
            <span className="hidden sm:inline">Overview</span>
          </TabsTrigger>
          <TabsTrigger value="time" className="gap-1.5">
            <TrendingUp className="w-4 h-4" />
            <span className="hidden sm:inline">Time</span>
          </TabsTrigger>
          <TabsTrigger value="providers" className="gap-1.5">
            <Users className="w-4 h-4" />
            <span className="hidden sm:inline">Providers</span>
          </TabsTrigger>
          <TabsTrigger value="markets" className="gap-1.5">
            <PieChart className="w-4 h-4" />
            <span className="hidden sm:inline">Markets</span>
          </TabsTrigger>
          <TabsTrigger value="risk" className="gap-1.5">
            <AlertTriangle className="w-4 h-4" />
            <span className="hidden sm:inline">Risk</span>
          </TabsTrigger>
          <TabsTrigger value="quality" className="gap-1.5">
            <Shield className="w-4 h-4" />
            <span className="hidden sm:inline">Quality</span>
          </TabsTrigger>
          <TabsTrigger value="equity" className="gap-1.5">
            <LineChart className="w-4 h-4" />
            <span className="hidden sm:inline">Equity</span>
          </TabsTrigger>
          <TabsTrigger value="distribution" className="gap-1.5">
            <BarChart3 className="w-4 h-4" />
            <span className="hidden sm:inline">Distribution</span>
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab - Shows all key sections */}
        <TabsContent value="overview" className="space-y-8">
          <TimePeriodAnalytics
            stats={periodStats}
            period={period}
            setPeriod={setPeriod}
            dateRange={dateRange}
            customRange={customRange}
            setCustomRange={setCustomRange}
            isLoading={isLoading}
          />
          
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <GlobalEquityCurve data={equityCurveData} globalRiskPercent={globalRiskPercent} isLoading={isLoading} />
            <SignalQualityHealth qualityStats={qualityStats} isLoading={isLoading} />
          </div>
          
          <PairMarketPerformance 
            pairStats={pairStats} 
            categoryStats={categoryStats} 
            isLoading={isLoading} 
          />
          
          <RiskDrawdownAnalytics riskStats={riskStats} isLoading={isLoading} />
        </TabsContent>

        {/* Time-Based Performance Tab */}
        <TabsContent value="time" className="space-y-6">
          <TimePeriodAnalytics
            stats={periodStats}
            period={period}
            setPeriod={setPeriod}
            dateRange={dateRange}
            customRange={customRange}
            setCustomRange={setCustomRange}
            isLoading={isLoading}
          />
        </TabsContent>

        {/* Signal Providers Tab */}
        <TabsContent value="providers">
          <ProviderPerformanceTable providers={providerStats} isLoading={isLoading} />
        </TabsContent>

        {/* Markets Tab */}
        <TabsContent value="markets">
          <PairMarketPerformance 
            pairStats={pairStats} 
            categoryStats={categoryStats} 
            isLoading={isLoading} 
          />
        </TabsContent>

        {/* Risk Tab */}
        <TabsContent value="risk">
          <RiskDrawdownAnalytics riskStats={riskStats} isLoading={isLoading} />
        </TabsContent>

        {/* Quality Tab */}
        <TabsContent value="quality">
          <SignalQualityHealth qualityStats={qualityStats} isLoading={isLoading} />
        </TabsContent>

        {/* Equity Curve Tab */}
        <TabsContent value="equity">
          <GlobalEquityCurve data={equityCurveData} globalRiskPercent={globalRiskPercent} isLoading={isLoading} />
        </TabsContent>

        {/* Distribution Tab */}
        <TabsContent value="distribution">
          <TradeDistributionCharts distribution={tradeDistribution} isLoading={isLoading} />
        </TabsContent>
      </Tabs>

      {/* Disclaimer */}
      <div className="mt-8 p-4 rounded-xl bg-warning/10 border border-warning/20">
        <p className="text-xs text-warning leading-relaxed">
          📊 <strong>Platform Analytics:</strong> All statistics are aggregated across all users and signals. 
          Equity curve simulates a $10,000 starting balance with 2% risk per trade. 
          Provider rankings are based on signal outcomes, not individual user P&L.
          Time-based metrics reflect signal closure dates, not user trade executions.
        </p>
      </div>
    </AdminLayout>
  );
};

export default AdminTradeStats;
