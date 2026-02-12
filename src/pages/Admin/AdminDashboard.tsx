import { AdminLayout } from "@/components/layout/AdminLayout";
import { useAuth } from "@/contexts/AuthContext";
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

import { useDashboardLayout, DashboardSection } from "@/hooks/useDashboardLayout";
import { DashboardCustomizer } from "@/components/dashboard/DashboardCustomizer";

const ADMIN_SECTIONS: DashboardSection[] = [
  { id: 'admin-executive', label: 'Executive Overview', enabled: true },
  { id: 'admin-analytics-tabs', label: 'Analytics Modules', enabled: true },
];

const AdminDashboard = () => {
  const { profile } = useAuth();
  const { stats, isLoading, error } = useAdminDashboardStats();
  const { sections, updateOrder, resetLayout, isLoaded } = useDashboardLayout('dashboard-layout-admin-v1', ADMIN_SECTIONS);

  if (error) {
    return (
      <AdminLayout
        title="Admin Dashboard"
        subtitle={`Welcome back, ${profile?.first_name ? `${profile.first_name} ${profile.last_name || ''}` : 'Admin'}. Here's your performance summary.`}
      >
        <div className="flex items-center justify-center h-64">
          <p className="text-destructive">Error loading dashboard data</p>
        </div>
      </AdminLayout>
    );
  }

  if (isLoading || !isLoaded) {
    return (
      <AdminLayout
        title="Admin Dashboard"
        subtitle={`Welcome back, ${profile?.first_name ? `${profile.first_name} ${profile.last_name || ''}` : 'Admin'}. Here's your performance summary.`}
      >
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AdminLayout>
    );
  }

  const sectionContent: Record<string, React.ReactNode> = {
    'admin-executive': (
      stats ? <ExecutiveOverview stats={stats.executive} isLoading={isLoading} /> : null
    ),
    'admin-analytics-tabs': (
      stats ? (
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
      ) : null
    )
  };

  return (
    <AdminLayout
      title="Admin Dashboard"
      subtitle={`Welcome back, ${profile?.first_name ? `${profile.first_name} ${profile.last_name || ''}` : 'Admin'}. Here's your performance summary.`}
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
      </div>
    </AdminLayout>
  );
};

export default AdminDashboard;
