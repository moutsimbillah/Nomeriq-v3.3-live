import { ArrowRight, Sparkles } from "lucide-react";
import { useAuthModal } from "@/contexts/AuthModalContext";

export const CTASection = () => {
  const { openModal } = useAuthModal();
  return (
    <section className="py-20 sm:py-24 px-6 relative mb-24">
      <div className="container mx-auto max-w-7xl relative">
        <div className="rounded-3xl border border-border/60 bg-card/60 text-center relative overflow-hidden px-6 py-16 sm:py-20 md:py-24">
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute -top-24 left-1/2 -translate-x-1/2 h-60 w-60 rounded-full bg-primary/20 blur-3xl" />
            <div className="absolute -bottom-24 right-0 h-60 w-60 rounded-full bg-cyan-500/12 blur-3xl" />
          </div>

          <div className="relative z-10">
            <div className="mx-auto mb-6 w-12 h-12 rounded-xl border border-primary/25 bg-primary/10 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-primary" />
            </div>

            <h2 className="text-4xl md:text-6xl font-bold mb-6 tracking-tight leading-tight text-foreground">
              Ready To Run Trading Like A Brand?
            </h2>

            <p className="max-w-2xl mx-auto text-lg text-muted-foreground mb-10 leading-relaxed">
              Launch with the same structure used by serious signal teams: clean delivery, controlled risk, and transparent performance tracking.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <button
                onClick={() => openModal("signup")}
                className="bg-foreground text-background px-8 py-3.5 rounded-lg font-semibold flex items-center space-x-2 hover:opacity-90 transition-all"
              >
                <span>Start Free</span>
                <ArrowRight className="w-5 h-5" />
              </button>
              <button
                onClick={() => openModal("login")}
                className="border border-border bg-background/70 px-8 py-3.5 rounded-lg font-semibold hover:bg-accent transition-all text-foreground"
              >
                Sign In
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
