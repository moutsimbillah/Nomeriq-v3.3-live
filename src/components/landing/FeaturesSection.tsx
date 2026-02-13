import { Bell, BarChart3, Shield, Users, ArrowRight } from "lucide-react";

export const FeaturesSection = () => {
  return (
    <section id="features" className="py-20 sm:py-24 px-6 relative overflow-hidden">
      <div className="container mx-auto max-w-7xl">
        <div className="text-center mb-14 sm:mb-16">
          <span className="text-[10px] font-bold tracking-[0.24em] text-primary uppercase">Platform</span>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mt-4 tracking-tight text-foreground">
            Professional Workflow, From Signal To Review
          </h2>
          <p className="mt-6 text-muted-foreground max-w-2xl mx-auto">
            A structured product surface built for execution quality, accountability, and scale.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5">
          <article className="lg:col-span-7 rounded-2xl border border-border/60 bg-card/70 p-8 sm:p-10 relative overflow-hidden">
            <div className="absolute right-0 top-0 h-full w-1/2 bg-gradient-to-l from-primary/12 to-transparent pointer-events-none" />
            <div className="relative z-10">
              <div className="w-11 h-11 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-6">
                <Bell className="w-5 h-5 text-primary" />
              </div>
              <h3 className="text-2xl sm:text-3xl font-semibold mb-3 text-foreground">Signal Delivery Engine</h3>
              <p className="text-muted-foreground max-w-xl leading-relaxed">
                Publish clean, actionable signals with clear entry, stop-loss, and take-profit levels and maintain consistent update context throughout the trade lifecycle.
              </p>
              <div className="mt-7 flex items-center space-x-2 text-sm font-semibold text-primary">
                <span>Learn more</span>
                <ArrowRight className="w-4 h-4" />
              </div>
            </div>
          </article>

          <article className="lg:col-span-5 rounded-2xl border border-border/60 bg-card/70 p-8 sm:p-10">
            <div className="w-11 h-11 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center mb-6">
              <BarChart3 className="w-5 h-5 text-cyan-500" />
            </div>
            <h3 className="text-2xl font-semibold mb-3 text-foreground">Analytics Core</h3>
            <p className="text-muted-foreground leading-relaxed">
              Performance visibility with equity progression, win/loss decomposition, and behavior-level review.
            </p>
          </article>

          <article className="lg:col-span-5 rounded-2xl border border-border/60 bg-card/70 p-8 sm:p-10">
            <div className="w-11 h-11 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-6">
              <Shield className="w-5 h-5 text-emerald-500" />
            </div>
            <h3 className="text-2xl font-semibold mb-3 text-foreground">Risk Discipline Layer</h3>
            <p className="text-muted-foreground leading-relaxed">
              Enforce repeatable sizing and portfolio protection through centralized risk parameters.
            </p>
          </article>

          <article className="lg:col-span-7 rounded-2xl border border-border/60 bg-card/70 p-8 sm:p-10 relative overflow-hidden">
            <div className="absolute -bottom-12 right-2 h-52 w-52 rounded-full bg-amber-500/15 blur-3xl pointer-events-none" />
            <div className="relative z-10">
              <div className="w-11 h-11 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-6">
                <Users className="w-5 h-5 text-amber-500" />
              </div>
              <h3 className="text-2xl sm:text-3xl font-semibold mb-3 text-foreground">Provider And Community Ready</h3>
              <p className="text-muted-foreground max-w-xl leading-relaxed">
                Role-based administration, subscription controls, and communication integrations for scalable signal operations.
              </p>
              <div className="mt-7 flex items-center space-x-2 text-sm font-semibold text-amber-500">
                <span>Explore Infrastructure</span>
                <ArrowRight className="w-4 h-4" />
              </div>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
};
