import { ArrowRight, Sparkles } from "lucide-react";
import { useAuthModal } from "@/contexts/AuthModalContext";

export const CTASection = () => {
  const { openModal } = useAuthModal();
  return (
    <section className="py-24 sm:py-32 px-6 relative mb-32">
      <div className="container mx-auto max-w-7xl relative">
        <div className="glass py-32 rounded-[60px] text-center relative overflow-hidden border-white/5 mx-6 md:mx-0">
          {/* Background Glow */}
          <div className="absolute inset-0 bg-blue-500/5 opacity-50 pointer-events-none"></div>

          <div className="relative z-10 px-6">
            <Sparkles className="w-12 h-12 text-blue-500 mb-6 mx-auto" />

            <h2 className="text-5xl md:text-7xl font-bold mb-8 tracking-tight leading-tight text-foreground">
              Ready to Streamline Your <br /> Trading Workflow?
            </h2>

            <p className="max-w-2xl mx-auto text-xl text-muted-foreground mb-12">
              Create an account to explore the platform. Subscription-based access unlocks the full suite of signal delivery and analytics features.
            </p>

            <div className="flex flex-col md:flex-row items-center justify-center gap-6">
              <button
                onClick={() => openModal("signup")}
                className="gradient-primary-landing text-white px-10 py-5 rounded-full font-bold flex items-center space-x-2 shadow-2xl hover:scale-105 transition-all"
              >
                <span>Get Started Free</span>
                <ArrowRight className="w-5 h-5" />
              </button>
              <button
                onClick={() => openModal("login")}
                className="glass px-10 py-5 rounded-full font-bold hover:bg-black/5 dark:hover:bg-white/5 transition-all text-foreground"
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