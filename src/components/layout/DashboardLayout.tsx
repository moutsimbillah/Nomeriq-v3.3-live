import { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Sidebar, SidebarContent } from "./Sidebar";
import { ThemeToggle } from "./ThemeToggle";
import { useIsMobile } from "@/hooks/use-mobile";
import { ProfileDropdown } from "./ProfileDropdown";
import { MarketSessionIndicator } from "./MarketSessionIndicator";
import { SessionCountdown } from "./SessionCountdown";
import { FullScreenButton } from "./FullScreenButton";
import { NotificationButton } from "./NotificationButton";
import { Footer } from "./Footer";
import { BrandedLogo } from "@/components/landing/BrandedLogo";
import { TradeClosedNotificationModal } from "@/components/signals/TradeClosedNotificationModal";
import { SubscriptionReminderPopup } from "@/components/subscription/SubscriptionReminderPopup";
import { Button } from "@/components/ui/button";
import { Settings, Menu } from "lucide-react";

interface DashboardLayoutProps {
  children: ReactNode;
  title?: string;
}

export const DashboardLayout = ({
  children,
  title
}: DashboardLayoutProps) => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  return <div className="min-h-screen bg-background flex flex-col">
    {/* Full Width Header - Sticky */}
    <header className="bg-background dark:bg-[#080C16] border-b border-border dark:border-white/5 sticky top-0 z-50 h-16">
      <div className="flex items-center justify-between px-6 h-full w-full relative">

        {/* Left Side: Logo */}
        <div className="flex items-center gap-8">
          {/* Logo */}
          <div className="flex items-center">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden h-9 w-9 mr-2 text-foreground dark:text-white"
              onClick={() => {
                const event = new CustomEvent('toggle-mobile-sidebar');
                window.dispatchEvent(event);
              }}
            >
              <Menu className="w-5 h-5" />
            </Button>
            <BrandedLogo className="h-6 w-auto" />
          </div>
        </div>

        {/* Center: Indicators (Absolute Positioned) */}
        <div className="hidden md:flex items-center gap-6 absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          {/* Market Session Indicator (Original) */}
          <MarketSessionIndicator />

          {/* Countdown */}
          <div className="hidden lg:block">
            <SessionCountdown />
          </div>
        </div>

        {/* Right Side: Actions + Profile */}
        <div className="flex items-center gap-6">
          {/* Action Icons Group */}
          <div className="flex items-center gap-1 bg-muted/40 dark:bg-[#1A1D24] p-1 rounded-lg border border-border dark:border-white/5">
            <FullScreenButton className="h-8 w-8" />
            <ThemeToggle className="h-8 w-8" />
            <Button variant="ghost" size="icon" onClick={() => navigate("/settings")} className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-accent dark:hover:text-white dark:hover:bg-white/5">
              <Settings className="h-4 w-4" />
            </Button>
            <NotificationButton className="h-8 w-8" />
          </div>

          <div className="h-8 w-px bg-border/40 dark:bg-white/10" />

          {/* Profile */}
          <ProfileDropdown />
        </div>
      </div>

      {/* Mobile Sub-header for indicators */}
      <div className="md:hidden px-4 py-2 bg-background dark:bg-[#080C16] border-b border-border dark:border-white/5 flex items-center justify-between overflow-x-auto">
        <MarketSessionIndicator />
      </div>
    </header>

    {/* Main Content with Sidebar */}
    <div className="flex flex-1">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-[260px] bg-background dark:bg-[#080C16] border-r border-border dark:border-white/5 flex-shrink-0 sticky top-[64px] h-[calc(100vh-64px)]">
        <SidebarContent />
      </aside>

      {/* Mobile Sidebar - Only visible on mobile */}
      {isMobile && <Sidebar />}

      {/* Page Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Page Title */}
        {title && <div className="px-4 lg:px-8 pt-6 pb-2">
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold">{title}</h1>
        </div>}

        {/* Content - scrollable */}
        <div className="flex-1 overflow-y-auto p-4 lg:p-8">
          {children}
        </div>

        {/* Footer */}
        <Footer />
      </main>
    </div>

    {/* Trade Closed Notification Modal */}
    <TradeClosedNotificationModal />

    {/* Subscription Reminder Popup for Free Plan Users */}
    <SubscriptionReminderPopup />
  </div>;
};
