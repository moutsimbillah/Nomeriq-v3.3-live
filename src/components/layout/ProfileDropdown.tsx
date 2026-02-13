import { ChevronDown, User, Mail, Phone, CreditCard, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/contexts/AuthContext";
import { useAdminRoleContext } from "@/contexts/AdminRoleContext";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export const ProfileDropdown = () => {
  const { profile, subscription, hasActiveSubscription, signOut, isAdmin } = useAuth();
  const { adminRole } = useAdminRoleContext();
  const isSignalProvider = adminRole === "signal_provider_admin" || adminRole === "super_admin";
  const navigate = useNavigate();

  const fullName = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "User";
  const initials = fullName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-3 outline-none group">
          <span className="hidden md:block text-sm font-bold text-foreground dark:text-white group-hover:text-primary transition-colors">
            {profile?.first_name || "User"}
          </span>
          <div className="relative">
            <Avatar className="h-9 w-9 border border-border dark:border-white/10 group-hover:border-primary/50 transition-colors">
              <AvatarImage src={profile?.avatar_url} />
              <AvatarFallback className="bg-muted dark:bg-[#1A1D24] text-foreground dark:text-white font-bold text-xs border border-border dark:border-transparent">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-background dark:border-[#080C16]" />
          </div>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={14} className="w-72 bg-popover border border-border shadow-lg">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-3 py-2">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center text-lg font-bold text-primary-foreground">
                {initials}
              </div>
              <div className="flex flex-col">
                <p className="text-sm font-semibold">{fullName}</p>
                <p className="text-xs text-muted-foreground">{profile?.email}</p>
              </div>
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        <div className="px-2 py-2 space-y-2">
          {profile?.phone && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Phone className="w-4 h-4" />
              <span>{profile.phone}</span>
            </div>
          )}

          {!isSignalProvider && (
            <div className="flex items-center gap-2 text-sm">
              <CreditCard className="w-4 h-4 text-muted-foreground" />
              <span className="text-muted-foreground">Subscription:</span>
              <span className={cn(
                "font-medium",
                hasActiveSubscription ? "text-success" : "text-destructive"
              )}>
                {hasActiveSubscription ? "Active" : "Inactive"}
              </span>
            </div>
          )}

          {profile?.account_balance !== null && profile?.account_balance !== undefined && (
            <div className="flex items-center gap-2 text-sm">
              <span className="w-4 h-4 text-muted-foreground flex items-center justify-center font-bold">$</span>
              <span className="text-muted-foreground">Balance:</span>
              <span className="font-medium">${profile.account_balance.toLocaleString()}</span>
            </div>
          )}

          {isAdmin && (
            <div className="flex items-center gap-2 text-sm">
              <User className="w-4 h-4 text-muted-foreground" />
              <span className="text-muted-foreground">Role:</span>
              <span className="font-medium text-warning">Admin</span>
            </div>
          )}
        </div>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onClick={handleSignOut}
          className="text-destructive focus:text-destructive cursor-pointer"
        >
          <LogOut className="w-4 h-4 mr-2" />
          Sign Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
