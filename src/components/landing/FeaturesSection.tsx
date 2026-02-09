import { Bell, BarChart3, Shield, Users, ArrowRight } from "lucide-react";

export const FeaturesSection = () => {
  return (
    <section id="features" className="py-24 sm:py-32 px-6 relative overflow-hidden">
      <div className="container mx-auto max-w-7xl">
        <div className="text-center mb-16 sm:mb-24">
          <span className="text-[10px] font-bold tracking-widest text-purple-500 dark:text-purple-400 uppercase">Platform Capabilities</span>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mt-4 tracking-tight text-foreground">Complete Trading Workflow</h2>
          <p className="mt-6 text-muted-foreground max-w-2xl mx-auto">Everything you need to manage, track, and analyze your trading operations.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Signal Delivery System - Spans 2 cols */}
          <div className="md:col-span-2 glass rounded-3xl p-10 bento-card relative overflow-hidden group min-h-[320px]">
            <div className="relative z-10 h-full flex flex-col justify-between">
              <div>
                <div className="w-12 h-12 bg-blue-500/10 rounded-xl flex items-center justify-center mb-6">
                  <Bell className="w-6 h-6 text-blue-500 dark:text-blue-400" />
                </div>
                <h3 className="text-2xl font-bold mb-4 text-foreground">Signal Delivery System</h3>
                <p className="text-muted-foreground max-w-sm">Real-time signal distribution with precise entry, stop-loss, and take-profit levels across multiple asset classes.</p>
              </div>
              <div className="mt-8 flex items-center space-x-2 text-sm font-semibold text-blue-500 dark:text-blue-400 group-hover:translate-x-2 transition-transform cursor-pointer">
                <span>Learn more</span>
                <ArrowRight className="w-4 h-4" />
              </div>
            </div>
            {/* Abstract Background Decoration */}
            <div className="absolute top-0 right-0 w-2/3 h-full bg-gradient-to-l from-blue-500/10 to-transparent pointer-events-none" />
          </div>

          {/* Trade Journal & Analytics */}
          <div className="glass rounded-3xl p-10 bento-card group border border-black/10 dark:border-white/10 flex flex-col">
            <div className="w-12 h-12 bg-purple-500/10 rounded-xl flex items-center justify-center mb-6">
              <BarChart3 className="w-6 h-6 text-purple-500 dark:text-purple-400" />
            </div>
            <h3 className="text-2xl font-bold mb-4 text-foreground">Trade Journal & Analytics</h3>
            <p className="text-muted-foreground">Built-in position sizing, risk percentage controls, and drawdown monitoring.</p>
          </div>

          {/* Risk Framework */}
          <div className="glass rounded-3xl p-10 bento-card group border border-black/10 dark:border-white/10 flex flex-col">
            <div className="w-12 h-12 bg-emerald-500/10 rounded-xl flex items-center justify-center mb-6">
              <Shield className="w-6 h-6 text-emerald-500 dark:text-emerald-400" />
            </div>
            <h3 className="text-2xl font-bold mb-4 text-foreground">Risk Framework</h3>
            <p className="text-muted-foreground">Systematic risk management tools for elite-level control.</p>
          </div>

          {/* Copy Trading Ready - Spans 2 cols */}
          <div className="md:col-span-2 glass rounded-3xl p-10 bento-card relative overflow-hidden group min-h-[320px]">
            <div className="relative z-10 flex flex-col justify-between h-full">
              <div>
                <div className="w-12 h-12 bg-amber-500/10 rounded-xl flex items-center justify-center mb-6">
                  <Users className="w-6 h-6 text-amber-500 dark:text-amber-400" />
                </div>
                <h3 className="text-2xl font-bold mb-4 text-foreground">Copy Trading Ready</h3>
                <p className="text-muted-foreground max-w-sm">Infrastructure designed to support signal distribution and subscription-based access for trading communities.</p>
              </div>
              <div className="mt-8 flex items-center space-x-2 text-sm font-semibold text-amber-500 dark:text-amber-400 group-hover:translate-x-2 transition-transform cursor-pointer">
                <span>Explore Infrastructure</span>
                <ArrowRight className="w-4 h-4" />
              </div>
            </div>
            {/* Abstract Background Decoration */}
            <div className="absolute -right-20 -bottom-20 w-80 h-80 bg-amber-500/10 blur-[100px] rounded-full pointer-events-none"></div>
          </div>
        </div>
      </div>
    </section>
  );
};
