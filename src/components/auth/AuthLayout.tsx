import { Link } from "react-router-dom";
import { useBrand } from "@/contexts/BrandContext";
import { LogoIcon } from "@/components/icons/TradingIcons";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { useTheme } from "@/hooks/useTheme";
import { ReactNode } from "react";

interface AuthLayoutProps {
  children: ReactNode;
  alternateAction?: {
    text: string;
    linkText: string;
    href: string;
  };
}

export const AuthLayout = ({ children }: AuthLayoutProps) => {
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
    <div className="min-h-screen bg-background relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-24 -left-24 h-96 w-96 rounded-full bg-primary/15 blur-3xl" />
        <div className="absolute -bottom-24 -right-24 h-96 w-96 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,hsl(var(--border)/0.18)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border)/0.12)_1px,transparent_1px)] bg-[size:34px_34px] opacity-[0.06]" />
      </div>

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 px-4 pt-4">
        <nav className="nav-float mx-auto max-w-6xl bg-background/80 backdrop-blur-xl border border-border/50 px-6 py-3 flex items-center justify-between gap-8 shadow-2xl dark:bg-slate-900/80 dark:border-white/10 rounded-2xl">
          <div className="flex items-center space-x-2">
            <Link to="/" className="flex items-center gap-2 group">
              {logoUrl ? (
                <img src={logoUrl} alt={brandName} className="h-8 w-auto max-w-[140px] object-contain" />
              ) : (
                <LogoIcon className="h-8 w-auto" />
              )}
            </Link>
          </div>

          <div className="hidden md:flex items-center space-x-8 text-sm font-medium text-muted-foreground">
            <a href="/#features" className="hover:text-primary transition-colors">Features</a>
            <a href="/#solutions" className="hover:text-primary transition-colors">Solutions</a>
            <a href="/#who-its-for" className="hover:text-primary transition-colors">Who It's For</a>
          </div>

          <div className="flex items-center space-x-4">
            <ThemeToggle className="h-7 w-7" />
            <Link
              to="/login"
              className="hidden sm:block text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Sign In
            </Link>
            <Link
              to="/signup"
              className="bg-foreground text-background px-5 py-2 rounded-full text-sm font-semibold hover:opacity-90 transition-all"
            >
              Get Started
            </Link>
          </div>
        </nav>
      </header>

      {/* Main Content */}
      <main className="relative z-10 min-h-screen pt-24 px-4 flex items-center justify-center">
        <div className="w-full max-w-3xl mx-auto">
          <section className="w-full max-w-xl mx-auto">
            {children}
          </section>
        </div>
      </main>
    </div>
  );
};
