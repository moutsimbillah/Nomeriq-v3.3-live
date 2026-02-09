import { ReactNode } from "react";
import { AdminSidebar, AdminSidebarContent } from "./AdminSidebar";
import { ThemeToggle } from "./ThemeToggle";
import { ProfileDropdown } from "./ProfileDropdown";
import { MarketSessionIndicator } from "./MarketSessionIndicator";
import { SessionCountdown } from "./SessionCountdown";
import { FullScreenButton } from "./FullScreenButton";
import { NotificationButton } from "./NotificationButton";
import { Footer } from "./Footer";
import { BrandedLogo } from "@/components/landing/BrandedLogo";
import { Button } from "@/components/ui/button";
import { Menu, Settings, ShieldCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface AdminLayoutProps {
  children: ReactNode;
  title?: string;
}

export const AdminLayout = ({ children, title }: AdminLayoutProps) => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Full Width Header - Sticky */}
      <header className="bg-background dark:bg-[#080C16] border-b border-border dark:border-white/5 sticky top-0 z-50 h-16">
        <div className="flex items-center justify-between px-6 h-full w-full relative">

          {/* Left Side: Logo */}
          <div className="flex items-center gap-8">
            <div className="flex items-center">
              {/* Mobile Sidebar Toggle */}
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden h-9 w-9 mr-2 text-foreground dark:text-white"
                onClick={() => {
                  const event = new CustomEvent('toggle-mobile-admin-sidebar');
                  window.dispatchEvent(event);
                }}
              >
                <Menu className="w-5 h-5" />
              </Button>
              <BrandedLogo className="h-6 w-auto" />
            </div>
          </div>

          {/* Center: Market Session Indicator */}
          <div className="hidden md:flex items-center gap-6 absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <MarketSessionIndicator />
            <div className="hidden lg:block">
              <SessionCountdown />
            </div>
          </div>

          {/* Right Side: Actions + Profile */}
          <div className="flex items-center gap-6">
            {/* Action Icons Group */}
            <div className="flex items-center gap-1 bg-muted/40 dark:bg-[#1A1D24] p-1 rounded-lg border border-border dark:border-white/5">
              <FullScreenButton className="h-7 w-7" />
              <ThemeToggle className="h-7 w-7" />
              <Button variant="ghost" size="icon" onClick={() => navigate("/admin/settings")} className="h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-accent dark:hover:text-white dark:hover:bg-white/5">
                <Settings className="w-4 h-4" />
              </Button>
              <NotificationButton className="h-7 w-7" />
            </div>

            <div className="h-8 w-px bg-border/40 dark:bg-white/10" />

            <ProfileDropdown />
          </div>
        </div>

        {/* Mobile Sub-header for indicators */}
        <div className="md:hidden px-4 py-2 bg-background dark:bg-[#080C16] border-b border-border dark:border-white/5 flex items-center justify-between overflow-x-auto">
          <MarketSessionIndicator />
        </div>
      </header>

      <div className="flex flex-1">
        {/* Desktop Sidebar */}
        <aside className="hidden lg:flex flex-col w-72 bg-sidebar border-r border-border/50 flex-shrink-0 sticky top-16 h-[calc(100vh-64px)] overflow-hidden">
          <AdminSidebarContent />
        </aside>

        {/* Mobile Sidebar - Handles overlay and drawer */}
        <AdminSidebar />

        <main className="flex-1 flex flex-col overflow-hidden">
          {/* Page Title */}
          {title && (
            <div className="px-4 lg:px-8 pt-6 pb-2">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-primary/10 rounded-md border border-primary/20">
                  <ShieldCheck className="w-4 h-4 text-primary" />
                  <span className="text-xs font-semibold text-primary">Admin</span>
                </div>
                <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold">{title}</h1>
              </div>
            </div>
          )}

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4 lg:p-8">
            {children}
          </div>

          {/* Footer */}
          <Footer />
        </main>
      </div>
    </div>
  );
};
