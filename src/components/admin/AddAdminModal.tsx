import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AdminRole, Profile } from "@/types/database";
import { supabase } from "@/integrations/supabase/client";
import { Search, UserPlus, Mail, Loader2, Crown, CreditCard, Signal, Check } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface AddAdminModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddAdmin: (userId: string, role: AdminRole) => Promise<{ error: Error | null }>;
  onSuccess: () => void;
}

const roleOptions: { value: AdminRole; label: string; icon: React.ElementType; description: string }[] = [
  {
    value: "super_admin",
    label: "Super Admin",
    icon: Crown,
    description: "Full access to all features including admin management",
  },
  {
    value: "payments_admin",
    label: "Payments Admin",
    icon: CreditCard,
    description: "Access to payments, billing, invoices, and revenue analytics",
  },
  {
    value: "signal_provider_admin",
    label: "Signal Provider Admin",
    icon: Signal,
    description: "Access to signal creation, editing, and trading analytics",
  },
];

export const AddAdminModal = ({ open, onOpenChange, onAddAdmin, onSuccess }: AddAdminModalProps) => {
  const [tab, setTab] = useState<"existing" | "invite">("existing");
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState<Profile[]>([]);
  const [selectedUser, setSelectedUser] = useState<Profile | null>(null);
  const [selectedRole, setSelectedRole] = useState<AdminRole>("payments_admin");
  const [inviteEmail, setInviteEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  // Search for users
  useEffect(() => {
    if (!open) return;

    const searchUsers = async () => {
      setIsSearching(true);
      try {
        // Get existing admin user IDs to exclude
        const { data: existingAdmins } = await supabase
          .from('admin_roles')
          .select('user_id');

        const excludeIds = (existingAdmins || []).map(a => a.user_id);

        let query = supabase
          .from('profiles')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(20);

        if (search) {
          query = query.or(`email.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%`);
        }

        const { data, error } = await query;

        if (error) throw error;

        // Filter out existing admins
        const filteredUsers = (data || []).filter(u => !excludeIds.includes(u.user_id));
        setUsers(filteredUsers as Profile[]);
      } catch (err) {
        console.error('Error searching users:', err);
      } finally {
        setIsSearching(false);
      }
    };

    const debounce = setTimeout(searchUsers, 300);
    return () => clearTimeout(debounce);
  }, [search, open]);

  const handleAddExisting = async () => {
    if (!selectedUser) {
      toast.error("Please select a user");
      return;
    }

    setIsLoading(true);
    const { error } = await onAddAdmin(selectedUser.user_id, selectedRole);
    setIsLoading(false);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success(`${selectedUser.first_name || selectedUser.email} added as ${roleOptions.find(r => r.value === selectedRole)?.label}`);
      onSuccess();
      handleClose();
    }
  };

  const handleInvite = async () => {
    if (!inviteEmail) {
      toast.error("Please enter an email address");
      return;
    }

    // For now, show a message that invite functionality requires email setup
    toast.info("Email invitations require email service configuration. The user must first sign up on the platform, then you can assign them an admin role.");
  };

  const handleClose = () => {
    setSearch("");
    setSelectedUser(null);
    setSelectedRole("payments_admin");
    setInviteEmail("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="w-5 h-5" />
            Add New Admin
          </DialogTitle>
          <DialogDescription>
            Select from existing users or invite someone new to become an admin.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "existing" | "invite")} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="existing">Existing User</TabsTrigger>
            <TabsTrigger value="invite">Invite by Email</TabsTrigger>
          </TabsList>

          <TabsContent value="existing" className="space-y-4 mt-4">
            {/* Search Users */}
            <div className="space-y-2">
              <Label>Search Users</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name or email..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            {/* User List */}
            <div className="space-y-2">
              <Label>Select User</Label>
              <ScrollArea className="h-48 border rounded-lg">
                {isSearching ? (
                  <div className="flex items-center justify-center h-full py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : users.length === 0 ? (
                  <div className="flex items-center justify-center h-full py-8 text-muted-foreground">
                    No users found
                  </div>
                ) : (
                  <div className="p-2 space-y-1">
                    {users.map((user) => {
                      const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim();
                      const isSelected = selectedUser?.user_id === user.user_id;

                      return (
                        <button
                          key={user.user_id}
                          onClick={() => setSelectedUser(user)}
                          className={cn(
                            "w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors",
                            isSelected
                              ? "bg-primary/10 border border-primary/30"
                              : "hover:bg-muted"
                          )}
                        >
                          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                            <span className="text-sm font-medium text-primary">
                              {(fullName || user.email).charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{fullName || 'Unknown'}</p>
                            <p className="text-sm text-muted-foreground truncate">{user.email}</p>
                          </div>
                          {isSelected && (
                            <Check className="w-5 h-5 text-primary shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>
            </div>

            {/* Role Selection */}
            <div className="space-y-2">
              <Label>Admin Role</Label>
              <Select value={selectedRole} onValueChange={(v) => setSelectedRole(v as AdminRole)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {roleOptions.map((role) => (
                    <SelectItem key={role.value} value={role.value}>
                      <div className="flex items-center gap-2">
                        <role.icon className="w-4 h-4" />
                        <div>
                          <p>{role.label}</p>
                          <p className="text-xs text-muted-foreground">{role.description}</p>
                        </div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </TabsContent>

          <TabsContent value="invite" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Email Address</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type="email"
                  placeholder="admin@example.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Admin Role</Label>
              <Select value={selectedRole} onValueChange={(v) => setSelectedRole(v as AdminRole)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {roleOptions.map((role) => (
                    <SelectItem key={role.value} value={role.value}>
                      <div className="flex items-center gap-2">
                        <role.icon className="w-4 h-4" />
                        <span>{role.label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="p-3 bg-muted/50 rounded-lg text-sm text-muted-foreground">
              <p>The invited user will receive an email with instructions to join as an admin.</p>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={tab === "existing" ? handleAddExisting : handleInvite}
            disabled={isLoading || (tab === "existing" && !selectedUser)}
          >
            {isLoading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            {tab === "existing" ? "Add Admin" : "Send Invite"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
