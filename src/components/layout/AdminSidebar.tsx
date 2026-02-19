import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Activity,
  TrendingUp,
  Users,
  CreditCard,
  Settings,
  LogOut,
  Menu,
  X,
  ShieldCheck,
  Crown,
  Palette,
  Send,
  ArrowLeft,
  History,
  Clock,
  FileText,
  Mail,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useBrand } from "@/contexts/BrandContext";
import { useTheme } from "@/hooks/useTheme";
import { useAdminRole } from "@/hooks/useAdminRole";
import { AdminRole } from "@/types/database";
import { LogoIcon } from "@/components/icons/TradingIcons";

type NavItem = {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  path: string;
  allowedRoles: AdminRole[];
};

// Define which roles can access each page
const navItems: NavItem[] = [
  // Super Admin Dashboard
  {
    icon: LayoutDashboard,
    label: "Dashboard",
    path: "/admin",
    allowedRoles: ['super_admin']
  },
  // Provider-specific Dashboard
  {
    icon: LayoutDashboard,
    label: "My Dashboard",
    path: "/admin/provider-dashboard",
    allowedRoles: ['signal_provider_admin']
  },
  // Provider-specific Signals
  {
    icon: Activity,
    label: "Live Trades",
    path: "/admin/provider-signals",
    allowedRoles: ['signal_provider_admin']
  },

  // Global Trade Stats (Super Admin only - sees all providers)
  {
    icon: Activity,
    label: "Live Trades",
    path: "/admin/signals",
    allowedRoles: ['super_admin']
  },
  {
    icon: TrendingUp,
    label: "Active Trades",
    path: "/admin/active-trades",
    allowedRoles: ['super_admin']
  },
  {
    icon: Clock,
    label: "Upcoming Trades",
    path: "/admin/upcoming-trades",
    allowedRoles: ['super_admin']
  },
  {
    icon: History,
    label: "Trades History",
    path: "/admin/history",
    allowedRoles: ['super_admin']
  },
  {
    icon: Users,
    label: "Users",
    path: "/admin/users",
    allowedRoles: ['super_admin', 'payments_admin']
  },
  {
    icon: CreditCard,
    label: "Payments",
    path: "/admin/payments",
    allowedRoles: ['super_admin', 'payments_admin']
  },
  {
    icon: Settings,
    label: "Payment Settings",
    path: "/admin/payment-settings",
    allowedRoles: ['super_admin', 'payments_admin']
  },
  {
    icon: CreditCard,
    label: "Subscription Settings",
    path: "/admin/subscription-settings",
    allowedRoles: ['super_admin', 'payments_admin']
  },
  {
    icon: Send,
    label: "Telegram Integrations",
    path: "/admin/telegram-integrations",
    allowedRoles: ['super_admin']
  },
  {
    icon: Palette,
    label: "Branding",
    path: "/admin/branding",
    allowedRoles: ['super_admin']
  },
  {
    icon: FileText,
    label: "Legal Pages",
    path: "/admin/legal-pages",
    allowedRoles: ['super_admin']
  },
  {
    icon: Mail,
    label: "Email Settings",
    path: "/admin/email-settings",
    allowedRoles: ['super_admin']
  },
  {
    icon: Settings,
    label: "Settings",
    path: "/admin/settings",
    allowedRoles: ['super_admin']
  },
  {
    icon: Activity,
    label: "Market Mode",
    path: "/admin/market-mode",
    allowedRoles: ['super_admin']
  },
];

export const AdminSidebarContent = ({ onNavigate }: { onNavigate?: () => void }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { adminRole, isLoading: roleLoading } = useAdminRole();
  const [stableRole, setStableRole] = useState<AdminRole | null>(() => {
    try {
      return (sessionStorage.getItem("admin_sidebar_role") as AdminRole | null) ?? null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (!adminRole) return;
    setStableRole(adminRole);
    try {
      sessionStorage.setItem("admin_sidebar_role", adminRole);
    } catch {
      // no-op
    }
  }, [adminRole]);

  const effectiveRole = adminRole || stableRole;
  const isSuperAdmin = effectiveRole === 'super_admin';

  // Filter nav items based on admin role
  const filteredNavItems = useMemo(() => {
    if (!effectiveRole) return [];
    return navItems.filter(item => item.allowedRoles.includes(effectiveRole));
  }, [effectiveRole]);

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <div className="flex flex-col h-full">
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {roleLoading && filteredNavItems.length === 0 ? (
          <div className="px-4 py-3 text-xs text-muted-foreground">Loading menu...</div>
        ) : null}
        {filteredNavItems.map((item) => {
          const isActive = location.pathname === item.path ||
            (item.path !== "/admin" && location.pathname.startsWith(item.path));
          return (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200",
                isActive
                  ? "bg-warning/10 text-warning border border-warning/20"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              <item.icon className="w-5 h-5" />
              <span>{item.label}</span>
              {isActive && (
                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-warning animate-pulse" />
              )}
            </NavLink>
          );
        })}

        {/* Admin Management - Only visible to Super Admins */}
        {isSuperAdmin && (
          <>
            <div className="my-3 border-t border-border/50" />
            <NavLink
              to="/admin/management"
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200",
                location.pathname === "/admin/management"
                  ? "bg-warning/10 text-warning border border-warning/20"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              <Crown className="w-5 h-5" />
              <span>Admin Management</span>
              {location.pathname === "/admin/management" && (
                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-warning animate-pulse" />
              )}
            </NavLink>
          </>
        )}
      </nav>

      <div className="p-4 border-t border-border/50">
        <NavLink to="/dashboard">
          <Button variant="outline" className="w-full justify-start mb-3">
            <LayoutDashboard className="w-5 h-5 mr-3" />
            User Dashboard
          </Button>
        </NavLink>

        <Button
          variant="ghost"
          className="w-full justify-start text-muted-foreground hover:text-destructive"
          onClick={handleSignOut}
        >
          <LogOut className="w-5 h-5 mr-3" />
          Sign Out
        </Button>
      </div>
    </div>
  );
};

export const AdminSidebar = () => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { settings } = useBrand();
  const { theme } = useTheme();

  const isDark = theme === 'dark';
  const logoUrl = isDark ? (settings?.logo_url_dark || settings?.logo_url) : settings?.logo_url;

  // Listen for mobile sidebar toggle event from header
  useEffect(() => {
    const handleToggle = () => setMobileOpen(true);
    window.addEventListener('toggle-mobile-admin-sidebar', handleToggle);
    return () => window.removeEventListener('toggle-mobile-admin-sidebar', handleToggle);
  }, []);

  return (
    <>
      {/* Mobile Toggle handled by header now, but leaving strict mobile only drawer logic here */}

      {/* Mobile Overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar Drawer */}
      <aside
        className={cn(
          "fixed left-0 top-0 h-full w-72 bg-sidebar border-r border-border/50 flex flex-col z-40 transition-transform duration-300",
          "lg:hidden", // Hide on desktop, use static sidebar content there
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
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

        <AdminSidebarContent onNavigate={() => setMobileOpen(false)} />
      </aside>
    </>
  );
};
