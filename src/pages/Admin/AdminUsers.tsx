import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Eye, Trash2, Mail, Phone, User, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUsers } from "@/hooks/useUsers";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
const AdminUsers = () => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const {
    users,
    isLoading,
    refetch,
    totalCount
  } = useUsers({
    search: searchQuery,
    limit: 50
  });
  const handleDeleteUser = async (userId: string) => {
    if (!confirm("Are you sure you want to delete this user? This will permanently remove their account, trades, payments, and all associated data. This action cannot be undone.")) {
      return;
    }
    try {
      const {
        data: {
          session
        }
      } = await supabase.auth.getSession();
      if (!session) {
        toast.error("You must be logged in");
        return;
      }
      const response = await supabase.functions.invoke('delete-user', {
        body: {
          userId
        }
      });
      if (response.error) {
        throw new Error(response.error.message || 'Failed to delete user');
      }
      if (response.data?.error) {
        throw new Error(response.data.error);
      }
      toast.success("User deleted successfully");
      refetch();
    } catch (err) {
      console.error('Error deleting user:', err);
      toast.error(err instanceof Error ? err.message : "Failed to delete user");
    }
  };
  const getSubscriptionStatus = (user: typeof users[0]) => {
    if (!user.subscription) return 'inactive';
    const sub = user.subscription;
    if (sub.status === 'active' && sub.expires_at && new Date(sub.expires_at) > new Date()) {
      return 'active';
    }
    if (sub.status === 'pending') return 'pending';
    return 'expired';
  };
  const activeCount = users.filter(u => getSubscriptionStatus(u) === 'active').length;
  const pendingCount = users.filter(u => getSubscriptionStatus(u) === 'pending').length;
  const expiredCount = users.filter(u => getSubscriptionStatus(u) === 'expired' || getSubscriptionStatus(u) === 'inactive').length;
  return <AdminLayout title="User Management">
      {/* Search & Actions */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input placeholder="Search by name, email, phone, or username..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-10 bg-secondary/50" />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="glass-card p-4 shadow-none">
          <p className="text-2xl font-bold">{isLoading ? "..." : totalCount}</p>
          <p className="text-sm text-muted-foreground">Total Users</p>
        </div>
        <div className="glass-card p-4 shadow-none">
          <p className="text-2xl font-bold text-success">{isLoading ? "..." : activeCount}</p>
          <p className="text-sm text-muted-foreground">Active Subscriptions</p>
        </div>
        <div className="glass-card p-4 shadow-none">
          <p className="text-2xl font-bold text-warning">{isLoading ? "..." : pendingCount}</p>
          <p className="text-sm text-muted-foreground">Pending</p>
        </div>
        <div className="glass-card p-4 shadow-none">
          <p className="text-2xl font-bold text-destructive">{isLoading ? "..." : expiredCount}</p>
          <p className="text-sm text-muted-foreground">Expired/Inactive</p>
        </div>
      </div>

      {/* Users Table */}
      <div className="glass-card overflow-hidden shadow-none">
        {isLoading ? <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div> : users.length === 0 ? <div className="text-center py-12">
            <User className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
            <p className="text-lg font-medium">No users found</p>
            <p className="text-muted-foreground">
              {searchQuery ? "Try adjusting your search query." : "No users have signed up yet."}
            </p>
          </div> : <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border/50 bg-secondary/30">
                  <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-4">User</th>
                  <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-4">Contact</th>
                  <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-4">Status</th>
                  <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-4">Balance</th>
                  <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-4">Risk</th>
                  <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-4">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {users.map(user => {
              const status = getSubscriptionStatus(user);
              const displayName = [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email.split('@')[0];
              const initials = displayName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
              return <tr key={user.id} className="hover:bg-accent/30 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center text-sm font-bold">
                            {initials}
                          </div>
                          <div>
                            <p className="font-semibold">{displayName}</p>
                            <p className="text-xs text-muted-foreground">@{user.username || user.email.split('@')[0]}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 text-sm">
                            <Mail className="w-3 h-3 text-muted-foreground" />
                            {user.email}
                          </div>
                          {user.phone && <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Phone className="w-3 h-3" />
                              {user.phone}
                            </div>}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <Badge variant="outline" className={cn(status === "active" && "border-success/30 text-success bg-success/10", status === "pending" && "border-warning/30 text-warning bg-warning/10", (status === "expired" || status === "inactive") && "border-destructive/30 text-destructive bg-destructive/10")}>
                          {status}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <p className="font-mono font-semibold">
                          ${(user.account_balance || 0).toLocaleString()}
                        </p>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="text-sm">{user.custom_risk_percent || '-'}%</span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-2">
                          <Button size="sm" variant="outline" onClick={() => navigate(`/admin/users/${user.user_id}`)}>
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => handleDeleteUser(user.user_id)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>;
            })}
              </tbody>
            </table>
          </div>}
      </div>
    </AdminLayout>;
};
export default AdminUsers;