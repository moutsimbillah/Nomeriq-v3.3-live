import { Button } from "@/components/ui/button";
import { ArrowRight, Shield } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthModal } from "@/contexts/AuthModalContext";

export const HeroSection = () => {
  const [activeSignals, setActiveSignals] = useState<number | null>(null);
  const { openModal } = useAuthModal();

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const { count } = await supabase
          .from('signals')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'active');

        if (count !== null) setActiveSignals(count);
      } catch (error) {
        console.error("Error fetching stats:", error);
      }
    };

    fetchStats();
  }, []);

  return (
    <section className="relative pt-48 pb-32 px-6 overflow-hidden bg-background">
      {/* Background Ambience */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-indigo-500/10 blur-[120px] rounded-full"></div>
        <div className="absolute bottom-[10%] right-[-5%] w-[40%] h-[40%] bg-blue-600/10 blur-[120px] rounded-full"></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full dark:bg-[radial-gradient(circle_at_center,_transparent_0%,_#020617_100%)] bg-[radial-gradient(circle_at_center,_transparent_0%,_#ffffff_100%)] opacity-80"></div>
      </div>

      <div className="container mx-auto relative z-10 text-center">
        {/* Badge */}
        <div className="inline-flex items-center space-x-2 px-4 py-1.5 glass rounded-full mb-8 border border-border/50 bg-background/50">
          <Shield className="w-4 h-4 text-blue-400" />
          <span className="text-xs font-semibold tracking-wide uppercase text-blue-500 dark:text-blue-400">Institutional-Grade Trading Infrastructure</span>
        </div>

        {/* Headline */}
        <h1 className="text-6xl md:text-8xl font-bold mb-8 tracking-tight leading-[1.1] text-foreground">
          Professional Signal <br />
          <span className="gradient-text-landing">Delivery & Analytics</span>
        </h1>

        {/* Subheadline */}
        <p className="max-w-2xl mx-auto text-xl text-muted-foreground leading-relaxed mb-12">
          A comprehensive platform for live signals, trade journaling, and performance analytics. Built for traders seeking systematic workflow excellence.
        </p>

        {/* CTA Buttons */}
        <div className="flex flex-col md:flex-row items-center justify-center gap-6">
          <button
            onClick={() => openModal("signup")}
            className="gradient-primary-landing text-white px-8 py-4 rounded-full font-bold flex items-center space-x-2 shadow-[0_0_40px_-10px_rgba(59,130,246,0.5)] hover:scale-105 transition-transform"
          >
            <span>Get Started Free</span>
            <ArrowRight className="w-5 h-5" />
          </button>
          <button
            onClick={() => openModal("login")}
            className="glass px-8 py-4 rounded-full font-bold hover:bg-black/5 dark:hover:bg-white/5 transition-all text-foreground"
          >
            View Demo
          </button>
        </div>

        {/* Stats Grid */}
        <div className="mt-24 grid grid-cols-2 md:grid-cols-4 gap-8 max-w-4xl mx-auto">
          <div className="text-center bento-card p-4 rounded-2xl border border-transparent hover:border-border transition-colors">
            <div className="text-3xl font-bold mb-1 text-foreground">100%</div>
            <div className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">Secure</div>
          </div>
          <div className="text-center bento-card p-4 rounded-2xl border border-transparent hover:border-border transition-colors">
            {/* Show active signals count if available, otherwise 24/7 */}
            <div className="text-3xl font-bold mb-1 text-foreground">
              {activeSignals !== null ? activeSignals : "24/7"}
            </div>
            <div className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
              {activeSignals !== null ? "Active Signals" : "Real-Time"}
            </div>
          </div>
          <div className="text-center bento-card p-4 rounded-2xl border border-transparent hover:border-border transition-colors">
            <div className="text-3xl font-bold mb-1 text-foreground">Multi</div>
            <div className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">Asset Support</div>
          </div>
          <div className="text-center bento-card p-4 rounded-2xl border border-transparent hover:border-border transition-colors">
            <div className="text-3xl font-bold mb-1 text-foreground">Pro</div>
            <div className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">Analytics</div>
          </div>
        </div>
      </div>
    </section>
  );
};