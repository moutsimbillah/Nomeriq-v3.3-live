import { CheckCircle2 } from "lucide-react";

const solutions = [
  {
    title: "Signal Management",
    description: "Streamlined signal creation, delivery, and tracking.",
    items: ["Precise entry, stop-loss, and TP levels", "Direction and asset categorization", "Signal status tracking (active/closed)"],
    color: "blue",
    badge: "01",
  },
  {
    title: "Analytics Dashboard",
    description: "Comprehensive performance visibility.",
    items: ["Equity curve visualization", "Win rate and profit factor metrics", "Drawdown analysis and monitoring"],
    color: "cyan",
    badge: "02",
  },
  {
    title: "Risk Controls",
    description: "Systematic risk management tools.",
    items: ["Configurable risk percentage per trade", "Position sizing calculations", "Account balance tracking"],
    color: "emerald",
    badge: "03",
  },
];

const toneMap = {
  blue: {
    badge: "text-blue-700 bg-blue-50 border-blue-200 dark:text-blue-300 dark:bg-blue-500/10 dark:border-blue-400/25",
    icon: "text-blue-500 dark:text-blue-400",
    ring: "hover:border-blue-300 dark:hover:border-blue-400/35",
    glow: "from-blue-500/20",
  },
  cyan: {
    badge: "text-cyan-700 bg-cyan-50 border-cyan-200 dark:text-cyan-300 dark:bg-cyan-500/10 dark:border-cyan-400/25",
    icon: "text-cyan-500 dark:text-cyan-400",
    ring: "hover:border-cyan-300 dark:hover:border-cyan-400/35",
    glow: "from-cyan-500/20",
  },
  emerald: {
    badge: "text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-300 dark:bg-emerald-500/10 dark:border-emerald-400/25",
    icon: "text-emerald-500 dark:text-emerald-400",
    ring: "hover:border-emerald-300 dark:hover:border-emerald-400/35",
    glow: "from-emerald-500/20",
  },
} as const;

export const SolutionsSection = () => {
  return (
    <section
      id="solutions"
      className="py-20 sm:py-24 px-6 relative overflow-hidden"
    >
      <div className="container mx-auto max-w-7xl relative">
        <div className="rounded-3xl border border-border/60 bg-card/40 backdrop-blur-xl p-7 sm:p-10 lg:p-12">
          <div className="text-center mb-12">
            <span className="text-[10px] font-bold tracking-[0.24em] text-primary uppercase">Solutions</span>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mt-4 tracking-tight text-foreground">
              Core Platform Modules
            </h2>
            <p className="mt-5 text-muted-foreground max-w-2xl mx-auto">
              Structured building blocks designed for reliable signal operations.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 sm:gap-6">
            {solutions.map((solution, index) => (
              <article
                key={index}
                className={`group relative rounded-2xl border border-border/60 bg-background/65 p-6 sm:p-7 ${toneMap[solution.color].ring}`}
              >
                <div className={`pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-b ${toneMap[solution.color].glow} to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100`} />

                <div className="relative space-y-5">
                  <div className={`inline-flex h-10 min-w-[52px] px-3 rounded-lg border items-center justify-center font-bold text-xs tracking-[0.12em] ${toneMap[solution.color].badge}`}>
                    {solution.badge}
                  </div>

                  <div className="space-y-2.5">
                    <h3 className="text-2xl font-semibold leading-tight text-foreground">{solution.title}</h3>
                    <p className="text-sm leading-relaxed min-h-[44px] text-muted-foreground">{solution.description}</p>
                  </div>

                  <div className="h-px w-full bg-gradient-to-r from-border/80 via-border/20 to-transparent" />

                  <ul className="space-y-3">
                    {solution.items.map((item, idx) => (
                      <li key={idx} className="flex items-start gap-3 text-sm leading-relaxed text-foreground/90">
                        <CheckCircle2 className={`w-4 h-4 shrink-0 mt-0.5 ${toneMap[solution.color].icon}`} />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
