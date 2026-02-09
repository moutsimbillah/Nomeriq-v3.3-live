import { AdminLayout } from "@/components/layout/AdminLayout";
import { useAdminDashboardStats } from "@/hooks/useAdminDashboardStats";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ExecutiveOverview } from "@/components/admin/dashboard-analytics/ExecutiveOverview";
import { SubscriptionPaymentsOverview } from "@/components/admin/dashboard-analytics/SubscriptionPaymentsOverview";
import { RevenueAnalytics } from "@/components/admin/dashboard-analytics/RevenueAnalytics";
import { UserGrowthAnalytics } from "@/components/admin/dashboard-analytics/UserGrowthAnalytics";
import { RiskRevenueAnalytics } from "@/components/admin/dashboard-analytics/RiskRevenueAnalytics";
import { DiscountAnalytics } from "@/components/admin/dashboard-analytics/DiscountAnalytics";
import { UserSegmentation } from "@/components/admin/dashboard-analytics/UserSegmentation";
import { Loader2 } from "lucide-react";

const AdminDashboard = () => {
  const { stats, isLoading, error } = useAdminDashboardStats();

  if (error) {
    return (
      <AdminLayout title="Admin Dashboard">
        <div className="flex items-center justify-center h-64">
          <p className="text-destructive">Error loading dashboard data</p>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Admin Dashboard">
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : stats ? (
        <div className="space-y-6">
          {/* Executive Overview - Always visible at top */}
          <ExecutiveOverview stats={stats.executive} isLoading={isLoading} />

          {/* Tabbed Sections */}
          <Tabs defaultValue="subscriptions" className="w-full">
            <TabsList className="w-full flex flex-wrap h-auto gap-1 bg-secondary/30 p-1">
              <TabsTrigger value="subscriptions" className="flex-1 min-w-[120px]">
                Subscriptions
              </TabsTrigger>
              <TabsTrigger value="revenue" className="flex-1 min-w-[120px]">
                Revenue
              </TabsTrigger>
              <TabsTrigger value="users" className="flex-1 min-w-[120px]">
                User Growth
              </TabsTrigger>
              <TabsTrigger value="risk" className="flex-1 min-w-[120px]">
                Risk & Pending
              </TabsTrigger>
              <TabsTrigger value="discounts" className="flex-1 min-w-[120px]">
                Discounts
              </TabsTrigger>
              <TabsTrigger value="segments" className="flex-1 min-w-[120px]">
                Segments
              </TabsTrigger>
            </TabsList>

            <TabsContent value="subscriptions" className="mt-6">
              <SubscriptionPaymentsOverview 
                subscriptions={stats.subscriptions} 
                payments={stats.payments} 
                isLoading={isLoading} 
              />
            </TabsContent>

            <TabsContent value="revenue" className="mt-6">
              <RevenueAnalytics revenue={stats.revenue} isLoading={isLoading} />
            </TabsContent>

            <TabsContent value="users" className="mt-6">
              <UserGrowthAnalytics userGrowth={stats.userGrowth} isLoading={isLoading} />
            </TabsContent>

            <TabsContent value="risk" className="mt-6">
              <RiskRevenueAnalytics riskRevenue={stats.riskRevenue} isLoading={isLoading} />
            </TabsContent>

            <TabsContent value="discounts" className="mt-6">
              <DiscountAnalytics discounts={stats.discounts} isLoading={isLoading} />
            </TabsContent>

            <TabsContent value="segments" className="mt-6">
              <UserSegmentation 
                segments={stats.segments} 
                totalUsers={stats.executive.totalUsers}
                isLoading={isLoading} 
              />
            </TabsContent>
          </Tabs>
        </div>
      ) : null}
    </AdminLayout>
  );
};

export default AdminDashboard;
