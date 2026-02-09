import { Link } from "react-router-dom";
import { useBrand } from "@/contexts/BrandContext";
import { LogoIcon } from "@/components/icons/TradingIcons";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { useTheme } from "@/hooks/useTheme";
import { ReactNode } from "react";
import { Footer } from "@/components/layout/Footer";

interface AuthLayoutProps {
  children: ReactNode;
  alternateAction: {
    text: string;
    linkText: string;
    href: string;
  };
}

export const AuthLayout = ({ children, alternateAction }: AuthLayoutProps) => {
  const { settings, isLoading } = useBrand();
  const { theme } = useTheme();

  const isDark = theme === 'dark';

  // Show brief loading state, but don't block forever
  // BrandContext will use defaults if fetch times out
  if (isLoading && !settings) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="w-24 h-8 bg-muted rounded" />
          <div className="h-4 w-32 bg-muted rounded" />
        </div>
      </div>
    );
  }

  // Use defaults if settings still not available
  const brandName = settings?.brand_name ?? 'nomeriq';
  // Use dark logo for dark theme, light logo for light theme
  const logoUrl = settings ? (isDark ? (settings.logo_url_dark || settings.logo_url) : settings.logo_url) : null;

  return (
    <div className="min-h-screen flex flex-col bg-background relative overflow-hidden">
      {/* Background Ambience - matching landing page */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-indigo-500/5 dark:bg-indigo-500/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-[10%] right-[-5%] w-[40%] h-[40%] bg-blue-600/5 dark:bg-blue-600/10 blur-[120px] rounded-full" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full dark:bg-[radial-gradient(circle_at_center,_transparent_0%,_#020617_100%)] bg-[radial-gradient(circle_at_center,_transparent_0%,_#ffffff_100%)] opacity-80" />
      </div>

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/60 dark:bg-slate-900/60 backdrop-blur-xl border-b border-border/40">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-14">
            <Link to="/" className="flex items-center gap-2 group">
              {logoUrl ? (
                <img src={logoUrl} alt={brandName} className="h-6 sm:h-7 w-auto max-w-[100px] sm:max-w-[120px] object-contain" />
              ) : (
                <LogoIcon className="h-6 sm:h-7 w-auto" />
              )}
            </Link>
            <div className="flex items-center gap-3">
              <ThemeToggle className="h-7 w-7" />
              <Link to={alternateAction.href}>
                <Button variant="ghost" size="sm" className="font-medium text-xs">
                  {alternateAction.linkText}
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center px-4 pt-20 pb-12 relative z-10">
        <div className="w-full max-w-md">
          {children}
        </div>
      </main>

      {/* Footer */}
      <div className="relative z-10">
        <Footer />
      </div>
    </div>
  );
};
