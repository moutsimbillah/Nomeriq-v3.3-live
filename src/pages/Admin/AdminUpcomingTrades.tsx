import { AdminLayout } from "@/components/layout/AdminLayout";
import { UpcomingTradesSection } from "@/components/dashboard/UpcomingTradesSection";

const AdminUpcomingTrades = () => {
  return (
    <AdminLayout
      title="Upcoming Trades"
      subtitle="View all upcoming setups across providers and admin signals."
    >
      <UpcomingTradesSection adminGlobalView />
    </AdminLayout>
  );
};

export default AdminUpcomingTrades;
