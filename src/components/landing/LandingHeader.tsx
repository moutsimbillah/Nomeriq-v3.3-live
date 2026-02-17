import { Link } from "react-router-dom";
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
      <header className="fixed top-0 left-0 right-0 z-50 px-4 pt-4">
        <nav className="nav-float mx-auto max-w-[82.8rem] rounded-2xl border border-border/60 bg-background/80 backdrop-blur-xl px-6 py-3 flex items-center justify-between gap-6 shadow-[0_8px_24px_rgba(2,6,23,0.16)]">
            <div className="flex items-center space-x-2">
              <Link to="/" className="flex items-center gap-2 group">
                <BrandedLogo className="h-8 w-auto" showName={false} />
              </Link>
            </div>

            <div className="hidden md:flex items-center space-x-8 text-sm font-medium text-muted-foreground">
              <a href="#features" className="hover:text-foreground transition-colors">
                Features
              </a>
              <a href="#solutions" className="hover:text-foreground transition-colors">
                Solutions
              </a>
              <a href="#who-its-for" className="hover:text-foreground transition-colors">
                Who It's For
              </a>
            </div>

            <div className="flex items-center space-x-2 sm:space-x-3">
              <ThemeToggle className="h-7 w-7" />
              <button
                onClick={() => openModal("login")}
                className="hidden sm:block text-sm font-medium px-3 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                Sign In
              </button>
              <button
                onClick={() => openModal("signup")}
                className="bg-foreground text-background px-4 sm:px-5 py-2 rounded-lg text-sm font-semibold hover:opacity-90 transition-all"
              >
                Get Started
              </button>

              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="md:hidden p-2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
        </nav>
      </header>

      {mobileMenuOpen && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 w-[92%] max-w-md rounded-2xl border border-border/60 bg-background/95 backdrop-blur-xl p-3 z-50 flex flex-col gap-1 md:hidden shadow-xl">
          <a
            href="#features"
            className="px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
            onClick={() => setMobileMenuOpen(false)}
          >
            Features
          </a>
          <a
            href="#solutions"
            className="px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
            onClick={() => setMobileMenuOpen(false)}
          >
            Solutions
          </a>
          <a
            href="#who-its-for"
            className="px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
            onClick={() => setMobileMenuOpen(false)}
          >
            Who It's For
          </a>
          <button
            onClick={() => openModal("login")}
            className="px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors text-left"
          >
            Sign In
          </button>
        </div>
      )}
    </>
  );
};
