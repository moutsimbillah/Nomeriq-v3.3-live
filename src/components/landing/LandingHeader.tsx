import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { Menu, X } from "lucide-react";
import { useState } from "react";

import { BrandedLogo } from "@/components/landing/BrandedLogo";
import { useAuthModal } from "@/contexts/AuthModalContext";

export const LandingHeader = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { openModal } = useAuthModal();

  return (
    <>
      <nav className="nav-float fixed top-4 left-4 right-4 z-50 bg-background/80 backdrop-blur-xl border border-border/50 px-6 py-3 flex items-center justify-between gap-8 shadow-2xl dark:bg-slate-900/80 dark:border-white/10 bg-white/80 rounded-2xl">
        <div className="flex items-center space-x-2">
          <Link to="/" className="flex items-center gap-2 group">
            <BrandedLogo className="h-8 w-auto" showName={false} />
          </Link>
        </div>

        {/* Desktop Navigation */}
        <div className="hidden md:flex items-center space-x-8 text-sm font-medium text-muted-foreground">
          <a href="#features" className="hover:text-primary transition-colors">
            Features
          </a>
          <a href="#solutions" className="hover:text-primary transition-colors">
            Solutions
          </a>
          <a href="#who-its-for" className="hover:text-primary transition-colors">
            Who It's For
          </a>
        </div>

        <div className="flex items-center space-x-4">
          <ThemeToggle className="h-7 w-7" />
          <button
            onClick={() => openModal("login")}
            className="hidden sm:block text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Sign In
          </button>
          <button
            onClick={() => openModal("signup")}
            className="bg-foreground text-background px-5 py-2 rounded-full text-sm font-semibold hover:opacity-90 transition-all"
          >
            Get Started
          </button>

          {/* Mobile menu button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </nav>

      {/* Mobile Navigation Content */}
      {mobileMenuOpen && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 w-[90%] max-w-md glass-dark rounded-2xl p-4 z-50 flex flex-col gap-2 md:hidden">
          <a
            href="#features"
            className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors"
            onClick={() => setMobileMenuOpen(false)}
          >
            Features
          </a>
          <a
            href="#solutions"
            className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors"
            onClick={() => setMobileMenuOpen(false)}
          >
            Solutions
          </a>
          <a
            href="#who-its-for"
            className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors"
            onClick={() => setMobileMenuOpen(false)}
          >
            Who It's For
          </a>
          <button
            onClick={() => {
              openModal("login");
              setMobileMenuOpen(false);
            }}
            className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors text-left"
          >
            Sign In
          </button>
        </div>
      )}
    </>
  );
};
