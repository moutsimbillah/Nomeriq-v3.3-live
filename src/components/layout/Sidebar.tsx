import { useNavigate } from "react-router-dom";
import { NavLink } from "@/components/NavLink";
import { cn } from "@/lib/utils";
import { LogoIcon } from "@/components/icons/TradingIcons";
import {
  LayoutDashboard,
  TrendingUp,
  Clock,
  History,
  CalendarDays,
  CreditCard,
  LogOut,
  Menu,
  ArrowLeft,
  Signal,
  Send,
  MoreVertical,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useMemo, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useAdminRoleContext } from "@/contexts/AdminRoleContext";
import { useBrand } from "@/contexts/BrandContext";
import { useTheme } from "@/hooks/useTheme";
import { useIsMobile } from "@/hooks/use-mobile";
import { useUserSubscriptions } from "@/hooks/useSubscriptionPackages";
import { differenceInDays } from "date-fns";

const baseNavItems = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard" },
  { icon: TrendingUp, label: "Active Trades", path: "/active-trades" },
  { icon: Clock, label: "Upcoming", path: "/upcoming" },
  { icon: History, label: "History", path: "/history" },
  { icon: CalendarDays, label: "Calendar", path: "/calendar" },
  { icon: CreditCard, label: "Subscription", path: "/subscription" },
];

const providerNavItems = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard" },
  { icon: Signal, label: "My Signals", path: "/my-signals" },
  { icon: TrendingUp, label: "Active Trades", path: "/active-trades" },
  { icon: Clock, label: "Upcoming", path: "/upcoming" },
  { icon: History, label: "History", path: "/history" },
  { icon: CalendarDays, label: "Calendar", path: "/calendar" },
];

export const SidebarContent = () => {
  const navigate = useNavigate();
  const { signOut, subscription, hasActiveSubscription } = useAuth();
  const { activeSubscriptions } = useUserSubscriptions();
  const { adminRole } = useAdminRoleContext();
  const { settings } = useBrand();

  // Determine if user is a signal provider or super admin
  const isSignalProvider = adminRole === "signal_provider_admin";
  const isSuperAdmin = adminRole === "super_admin";

  // Build nav items dynamically based on role - use stable references
  const navItems = useMemo(() => {
    if (isSignalProvider) {
      return providerNavItems;
    }
    return baseNavItems;
  }, [isSignalProvider]);

  // Subscription label and days text from real data: use active subscription's package name and duration
  const subscriptionInfo = useMemo(() => {
    if (!subscription) {
      return {
        status: "inactive",
        statusText: "Inactive",
        daysText: "No subscription",
      };
    }
    const isActive = hasActiveSubscription;
    const expiresAt = subscription.expires_at
      ? new Date(subscription.expires_at)
      : null;
    if (!isActive) {
      return {
        status: "inactive",
        statusText: "Inactive",
        daysText: "Subscription expired",
      };
    }
    const activeSub = activeSubscriptions[0];
    const pkg = activeSub?.package;
    const packageName = pkg?.name ?? null;
    const isLifetime = pkg?.duration_type === "lifetime";

    if (expiresAt) {
      const daysRemaining = differenceInDays(expiresAt, new Date());
      return {
        status: "active",
        statusText: packageName ? `Active ${packageName}` : "Active",
        daysText:
          daysRemaining > 0
            ? `Expires in ${daysRemaining} days`
            : "Expires today",
      };
    }
    return {
      status: "active",
      statusText: packageName ? `Active ${packageName}` : "Active",
      daysText: isLifetime ? "Lifetime access" : "Active",
    };
  }, [subscription, hasActiveSubscription, activeSubscriptions]);

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const { theme } = useTheme();
  const isDark = theme === "dark";
  const logoUrl = isDark
    ? settings?.logo_url_dark || settings?.logo_url
    : settings?.logo_url;

  return (
    <div className="flex flex-col h-full">
      {/* Navigation - Takes available space, scrolls */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-2 min-h-0">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              end
              style={{ transition: 'none' }}
              className={cn(
                "group/nav flex items-center gap-3 py-3 rounded-xl text-sm font-medium px-4 my-0 border border-transparent transition-colors",
                "text-muted-foreground hover:text-foreground hover:bg-accent/70 dark:hover:bg-white/5",
              )}
              activeClassName={cn(
                "!text-amber-500 dark:!text-amber-400 font-semibold",
                "!bg-[linear-gradient(90deg,rgba(251,191,36,0.14),rgba(251,191,36,0.08))]",
                "!border-amber-500/35 shadow-[inset_0_1px_0_rgba(251,191,36,0.14)]",
                "[&_.nav-indicator]:opacity-100"
              )}
            >
              <Icon className="w-5 h-5 shrink-0 text-current" style={{ transition: 'none' }} />
              <span className="whitespace-nowrap" style={{ transition: 'none' }}>{item.label}</span>
              <span className="nav-indicator ml-auto h-1.5 w-1.5 rounded-full bg-current opacity-0 transition-opacity" />
            </NavLink>
          );
        })}
      </div>

      {/* Footer - Sticky at bottom */}
      <div className="p-4 flex-shrink-0 space-y-4">
        {!isSignalProvider && (
          <div className="bg-card dark:bg-[#1A1D24] rounded-xl p-4 border border-border dark:border-white/5 shadow-sm">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-3">
              SUBSCRIPTION
            </p>
            <div className="flex items-center gap-2 mb-1">
              <div
                className={cn(
                  "w-2 h-2 rounded-full",
                  subscriptionInfo.status === "active"
                    ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]"
                    : "bg-destructive"
                )}
              />
              <span className="text-sm font-medium text-foreground dark:text-white">
                {subscriptionInfo.statusText}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {subscriptionInfo.daysText}
            </p>
          </div>
        )}

        {/* Sign Out Button */}
        <Button
          variant="ghost"
          className="w-full justify-start text-muted-foreground hover:text-foreground dark:hover:text-white hover:bg-accent dark:hover:bg-white/5 pl-4"
          onClick={handleSignOut}
        >
          <LogOut className="w-5 h-5 mr-3" />
          Sign Out
        </Button>
      </div>
    </div>
  );
};

export const Sidebar = () => {
  const isMobile = useIsMobile();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { settings } = useBrand();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const logoUrl = isDark
    ? settings?.logo_url_dark || settings?.logo_url
    : settings?.logo_url;

  // Close the drawer automatically when switching to desktop
  useEffect(() => {
    if (!isMobile) setMobileOpen(false);
  }, [isMobile]);

  // Listen for mobile sidebar toggle event from header
  useEffect(() => {
    const handleToggle = () => setMobileOpen(true);
    window.addEventListener('toggle-mobile-sidebar', handleToggle);
    return () => window.removeEventListener('toggle-mobile-sidebar', handleToggle);
  }, []);

  // Listen for close mobile sidebar event
  useEffect(() => {
    const handleClose = () => setMobileOpen(false);
    window.addEventListener('close-mobile-sidebar', handleClose);
    return () => window.removeEventListener('close-mobile-sidebar', handleClose);
  }, []);

  return (
    <>
      {/* Mobile Toggle - Only show when sidebar is closed */}
      {!mobileOpen && (
        <Button
          variant="ghost"
          size="icon"
          className="fixed top-4 left-4 z-50 md:hidden h-9 w-9"
          onClick={() => setMobileOpen(true)}
        >
          <Menu className="w-5 h-5 pt-0 mb-0 mt-[3px] my-0" />
        </Button>
      )}

      {/* Mobile Overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile Sidebar - Glass effect - Only visible on mobile */}
      <aside
        className={cn(
          "fixed left-0 top-0 h-full w-72 bg-background/80 dark:bg-[#080C16]/80 backdrop-blur-xl border-r border-border/50 flex flex-col z-40 transition-transform duration-300 shadow-xl",
          "md:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Mobile Header with Logo */}
        <div className="flex items-center justify-between gap-3 px-6 py-5 border-b border-border/50">
          <div className="flex items-center">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt="Logo"
                className="h-8 w-auto max-w-[140px] object-contain"
              />
            ) : (
              <LogoIcon className="h-8 w-auto" />
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={() => setMobileOpen(false)}
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </div>
        <SidebarContent />
      </aside>
    </>
  );
};
