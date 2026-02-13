import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AdminWithProfile, AdminRole, AdminStatus } from "@/types/database";
import { Crown, Shield, CreditCard, Signal, MoreHorizontal, Trash2, UserX, UserCheck, Loader2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { useTimezone } from "@/hooks/useTimezone";
import { getSafeErrorMessage } from "@/lib/error-sanitizer";

interface AdminManagementTableProps {
  admins: AdminWithProfile[];
  isLoading: boolean;
  superAdminCount: number;
  onUpdateRole: (userId: string, newRole: AdminRole, currentRole: AdminRole) => Promise<{ error: Error | null }>;
  onUpdateStatus: (userId: string, newStatus: AdminStatus, currentRole: AdminRole) => Promise<{ error: Error | null }>;
  onRemove: (userId: string, currentRole: AdminRole) => Promise<{ error: Error | null }>;
}

const roleConfig: Record<AdminRole, { label: string; icon: React.ElementType; color: string; description: string }> = {
  super_admin: {
    label: "Super Admin",
    icon: Crown,
    color: "bg-warning text-warning-foreground",
    description: "Full access to all features and admin management",
  },
  payments_admin: {
    label: "Payments Admin",
    icon: CreditCard,
    color: "bg-primary text-primary-foreground",
    description: "Access to payments, billing, and revenue analytics",
  },
  signal_provider_admin: {
    label: "Signal Provider",
    icon: Signal,
    color: "bg-success text-success-foreground",
    description: "Access to signals and trading analytics",
  },
};

export const AdminManagementTable = ({
  admins,
  isLoading,
  superAdminCount,
  onUpdateRole,
  onUpdateStatus,
  onRemove,
}: AdminManagementTableProps) => {
  const { formatInTimezone } = useTimezone();
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    type: 'remove' | 'change_role' | 'suspend';
    admin: AdminWithProfile | null;
    newRole?: AdminRole;
  }>({ open: false, type: 'remove', admin: null });
  const [processing, setProcessing] = useState(false);

  const handleRoleChange = async (admin: AdminWithProfile, newRole: AdminRole) => {
    if (admin.admin_role === 'super_admin' && newRole !== 'super_admin') {
      // Show confirmation for demoting super admin
      setConfirmDialog({ open: true, type: 'change_role', admin, newRole });
    } else {
      await executeRoleChange(admin, newRole);
    }
  };

  const executeRoleChange = async (admin: AdminWithProfile, newRole: AdminRole) => {
    setProcessing(true);
    const { error } = await onUpdateRole(admin.user_id, newRole, admin.admin_role);
    setProcessing(false);
    
    if (error) {
      toast.error(getSafeErrorMessage(error, "Failed to update admin role"));
    } else {
      toast.success(`Role updated to ${roleConfig[newRole].label}`);
    }
    setConfirmDialog({ open: false, type: 'remove', admin: null });
  };

  const handleStatusToggle = async (admin: AdminWithProfile) => {
    const newStatus: AdminStatus = admin.status === 'active' ? 'suspended' : 'active';
    
    if (admin.admin_role === 'super_admin' && newStatus === 'suspended') {
      setConfirmDialog({ open: true, type: 'suspend', admin });
      return;
    }

    setProcessing(true);
    const { error } = await onUpdateStatus(admin.user_id, newStatus, admin.admin_role);
    setProcessing(false);
    
    if (error) {
      toast.error(getSafeErrorMessage(error, "Failed to update admin status"));
    } else {
      toast.success(`Admin ${newStatus === 'active' ? 'activated' : 'suspended'}`);
    }
  };

  const handleRemove = (admin: AdminWithProfile) => {
    setConfirmDialog({ open: true, type: 'remove', admin });
  };

  const executeRemove = async () => {
    if (!confirmDialog.admin) return;
    
    setProcessing(true);
    const { error } = await onRemove(confirmDialog.admin.user_id, confirmDialog.admin.admin_role);
    setProcessing(false);
    
    if (error) {
      toast.error(getSafeErrorMessage(error, "Failed to remove admin"));
    } else {
      toast.success("Admin removed successfully");
    }
    setConfirmDialog({ open: false, type: 'remove', admin: null });
  };

  const executeSuspend = async () => {
    if (!confirmDialog.admin) return;
    
    setProcessing(true);
    const { error } = await onUpdateStatus(confirmDialog.admin.user_id, 'suspended', confirmDialog.admin.admin_role);
    setProcessing(false);
    
    if (error) {
      toast.error(getSafeErrorMessage(error, "Failed to suspend admin"));
    } else {
      toast.success("Admin suspended successfully");
    }
    setConfirmDialog({ open: false, type: 'remove', admin: null });
  };

  const confirmAction = async () => {
    switch (confirmDialog.type) {
      case 'remove':
        await executeRemove();
        break;
      case 'change_role':
        if (confirmDialog.admin && confirmDialog.newRole) {
          await executeRoleChange(confirmDialog.admin, confirmDialog.newRole);
        }
        break;
      case 'suspend':
        await executeSuspend();
        break;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 border rounded-xl bg-card">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (admins.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 border rounded-xl bg-card">
        <Shield className="w-12 h-12 text-muted-foreground mb-4" />
        <p className="text-muted-foreground">No admins found</p>
      </div>
    );
  }

  return (
    <>
      <div className="border rounded-xl overflow-hidden bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-[250px]">Admin</TableHead>
              <TableHead className="w-[200px]">Role</TableHead>
              <TableHead className="w-[100px]">Status</TableHead>
              <TableHead className="w-[150px]">Last Login</TableHead>
              <TableHead className="w-[150px]">Created</TableHead>
              <TableHead className="w-[100px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {admins.map((admin) => {
              const role = roleConfig[admin.admin_role];
              const RoleIcon = role.icon;
              const fullName = admin.profile
                ? `${admin.profile.first_name || ''} ${admin.profile.last_name || ''}`.trim() || 'Unknown'
                : 'Unknown';
              const isLastSuperAdmin = admin.admin_role === 'super_admin' && superAdminCount <= 1;

              return (
                <TableRow key={admin.id} className="hover:bg-muted/30">
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="text-sm font-medium text-primary">
                          {fullName.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{fullName}</p>
                          {admin.admin_role === 'super_admin' && (
                            <Crown className="w-4 h-4 text-warning" />
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">{admin.profile?.email}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={admin.admin_role}
                      onValueChange={(value) => handleRoleChange(admin, value as AdminRole)}
                      disabled={isLastSuperAdmin && admin.admin_role === 'super_admin'}
                    >
                      <SelectTrigger className="w-[180px]">
                        <div className="flex items-center gap-2">
                          <RoleIcon className="w-4 h-4" />
                          <SelectValue />
                        </div>
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(roleConfig).map(([key, config]) => (
                          <SelectItem key={key} value={key}>
                            <div className="flex flex-col">
                              <div className="flex items-center gap-2">
                                <config.icon className="w-4 h-4" />
                                <span>{config.label}</span>
                              </div>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={admin.status === 'active' ? 'default' : 'destructive'}
                      className="capitalize"
                    >
                      {admin.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {admin.last_login
                      ? formatInTimezone(admin.last_login)
                      : 'Never'}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {formatInTimezone(admin.created_at)}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem
                          onClick={() => handleStatusToggle(admin)}
                          disabled={isLastSuperAdmin}
                        >
                          {admin.status === 'active' ? (
                            <>
                              <UserX className="w-4 h-4 mr-2" />
                              Suspend Admin
                            </>
                          ) : (
                            <>
                              <UserCheck className="w-4 h-4 mr-2" />
                              Activate Admin
                            </>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => handleRemove(admin)}
                          className="text-destructive focus:text-destructive"
                          disabled={isLastSuperAdmin}
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Remove Admin
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Confirmation Dialog */}
      <AlertDialog open={confirmDialog.open} onOpenChange={(open) => !open && setConfirmDialog({ ...confirmDialog, open: false })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {confirmDialog.type === 'remove' && <Trash2 className="w-5 h-5 text-destructive" />}
              {confirmDialog.type === 'change_role' && <Crown className="w-5 h-5 text-warning" />}
              {confirmDialog.type === 'suspend' && <UserX className="w-5 h-5 text-warning" />}
              {confirmDialog.type === 'remove' && 'Remove Admin'}
              {confirmDialog.type === 'change_role' && 'Change Super Admin Role'}
              {confirmDialog.type === 'suspend' && 'Suspend Super Admin'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDialog.type === 'remove' && (
                <>
                  Are you sure you want to remove <strong>{confirmDialog.admin?.profile?.first_name}</strong> as an admin?
                  They will lose all admin privileges and be reverted to a regular user.
                </>
              )}
              {confirmDialog.type === 'change_role' && (
                <>
                  You are about to demote <strong>{confirmDialog.admin?.profile?.first_name}</strong> from Super Admin.
                  They will lose access to admin management features. This action is logged for security purposes.
                </>
              )}
              {confirmDialog.type === 'suspend' && (
                <>
                  You are about to suspend a Super Admin. <strong>{confirmDialog.admin?.profile?.first_name}</strong> will
                  temporarily lose all admin access until reactivated.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={processing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmAction}
              disabled={processing}
              className={confirmDialog.type === 'remove' ? 'bg-destructive hover:bg-destructive/90' : ''}
            >
              {processing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
