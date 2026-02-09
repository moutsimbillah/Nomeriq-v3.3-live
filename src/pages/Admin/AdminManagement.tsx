import { useState } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { AdminManagementTable } from "@/components/admin/AdminManagementTable";
import { AddAdminModal } from "@/components/admin/AddAdminModal";
import { AdminAuditLogsPanel } from "@/components/admin/AdminAuditLogsPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAdminRoles } from "@/hooks/useAdminRoles";
import { useCurrentAdminRole } from "@/hooks/useAdminRoles";
import { useAuth } from "@/contexts/AuthContext";
import { AdminRole, AdminStatus } from "@/types/database";
import { Search, UserPlus, Shield, ScrollText } from "lucide-react";
import { Navigate } from "react-router-dom";

const AdminManagement = () => {
  const { user } = useAuth();
  const { adminRole, isLoading: roleLoading, isSuperAdmin } = useCurrentAdminRole(user?.id);
  
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<AdminRole | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<AdminStatus | 'all'>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  
  const {
    admins,
    isLoading,
    superAdminCount,
    refetch,
    addAdmin,
    updateAdminRole,
    updateAdminStatus,
    removeAdmin,
  } = useAdminRoles({ search, roleFilter, statusFilter });

  // Block access for non-super admins
  if (!roleLoading && !isSuperAdmin) {
    return <Navigate to="/admin" replace />;
  }

  if (roleLoading) {
    return (
      <AdminLayout title="Admin Management">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Admin Management">
      <div className="space-y-6">
        {/* Header with info banner */}
        <div className="bg-gradient-to-r from-warning/10 to-warning/5 border border-warning/20 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-warning/20 rounded-lg">
              <Shield className="w-5 h-5 text-warning" />
            </div>
            <div>
              <h2 className="font-semibold text-foreground">Super Admin Access</h2>
              <p className="text-sm text-muted-foreground">
                You have full access to manage all admin accounts. Currently {superAdminCount} Super Admin(s) active.
              </p>
            </div>
          </div>
        </div>

        {/* Tabs for Admins and Audit Logs */}
        <Tabs defaultValue="admins" className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="admins" className="flex items-center gap-2">
              <Shield className="w-4 h-4" />
              Admins
            </TabsTrigger>
            <TabsTrigger value="logs" className="flex items-center gap-2">
              <ScrollText className="w-4 h-4" />
              Audit Logs
            </TabsTrigger>
          </TabsList>

          <TabsContent value="admins" className="space-y-4 mt-4">
            {/* Filters and Actions */}
            <div className="flex flex-col md:flex-row gap-4 justify-between">
              <div className="flex flex-col sm:flex-row gap-3 flex-1">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name or email..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v as AdminRole | 'all')}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Filter by role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Roles</SelectItem>
                    <SelectItem value="super_admin">Super Admin</SelectItem>
                    <SelectItem value="payments_admin">Payments Admin</SelectItem>
                    <SelectItem value="signal_provider_admin">Signal Provider Admin</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as AdminStatus | 'all')}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Filter by status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="suspended">Suspended</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={() => setShowAddModal(true)} className="shrink-0">
                <UserPlus className="w-4 h-4 mr-2" />
                Add Admin
              </Button>
            </div>

            {/* Admin Table */}
            <AdminManagementTable
              admins={admins}
              isLoading={isLoading}
              superAdminCount={superAdminCount}
              onUpdateRole={updateAdminRole}
              onUpdateStatus={updateAdminStatus}
              onRemove={removeAdmin}
            />
          </TabsContent>

          <TabsContent value="logs" className="mt-4">
            <AdminAuditLogsPanel />
          </TabsContent>
        </Tabs>
      </div>

      {/* Add Admin Modal */}
      <AddAdminModal
        open={showAddModal}
        onOpenChange={setShowAddModal}
        onAddAdmin={addAdmin}
        onSuccess={refetch}
      />
    </AdminLayout>
  );
};

export default AdminManagement;
