import { AdminLayout } from "@/components/layout/AdminLayout";
import { ActiveTradesTable } from "@/components/dashboard/ActiveTradesTable";
import { useState } from "react";

const AdminActiveTrades = () => {
    const [filters, setFilters] = useState<React.ReactNode>(null);

    return (
        <AdminLayout
            title="Active Trades"
            subtitle="View and manage all currently active trades across the platform."
            action={filters}
        >
            <ActiveTradesTable adminGlobalView={true} renderFilters={setFilters} />
        </AdminLayout>
    );
};

export default AdminActiveTrades;
