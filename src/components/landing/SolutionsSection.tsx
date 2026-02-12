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
    color: "violet",
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
  violet: {
    badge: "text-violet-700 bg-violet-50 border-violet-200 dark:text-violet-300 dark:bg-violet-500/10 dark:border-violet-400/25",
    icon: "text-violet-500 dark:text-violet-400",
    ring: "hover:border-violet-300 dark:hover:border-violet-400/35",
    glow: "from-violet-500/20",
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
      className="py-20 sm:py-24 px-4 sm:px-6 relative overflow-hidden rounded-[28px] border border-slate-200/70 dark:border-white/10 mx-4 sm:mx-6 max-w-7xl md:mx-auto mb-36 bg-gradient-to-b from-white via-slate-50/90 to-slate-100/80 dark:from-[#0f172a]/90 dark:via-[#0b1328]/95 dark:to-[#090f1f]/95"
    >
      <div className="absolute inset-0 pointer-events-none opacity-70 dark:opacity-50">
        <div className="absolute -top-20 left-1/3 h-52 w-52 rounded-full bg-blue-500/15 blur-3xl" />
        <div className="absolute -bottom-20 right-1/3 h-56 w-56 rounded-full bg-cyan-500/10 blur-3xl" />
      </div>

      <div className="container mx-auto relative">
        <div className="text-center mb-14 sm:mb-16">
          <span className="text-[10px] font-bold tracking-widest text-blue-500 dark:text-blue-400 uppercase">Solutions</span>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mt-4 tracking-tight text-slate-900 dark:text-foreground">
            Core Platform Modules
          </h2>
          <p className="mt-5 text-slate-600 dark:text-muted-foreground max-w-2xl mx-auto">
            Integrated tools designed to work together for a seamless trading workflow.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 sm:gap-6 px-1 sm:px-2 md:px-6">
          {solutions.map((solution, index) => (
            <article
              key={index}
              className={`group relative rounded-2xl border border-slate-200/80 dark:border-white/10 bg-white/90 dark:bg-[#0d162e]/70 backdrop-blur-xl p-6 sm:p-7 transition-all duration-300 hover:-translate-y-1 ${toneMap[solution.color].ring}`}
            >
              <div className={`pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-b ${toneMap[solution.color].glow} to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100`} />

              <div className="relative space-y-5">
                <div className={`inline-flex h-11 min-w-[56px] px-3 rounded-xl border items-center justify-center font-bold text-sm tracking-wide ${toneMap[solution.color].badge}`}>
                  {solution.badge}
                </div>

                <div className="space-y-2.5">
                  <h3 className="text-2xl font-bold leading-tight text-slate-900 dark:text-foreground">{solution.title}</h3>
                  <p className="text-[15px] leading-relaxed min-h-[48px] text-slate-600 dark:text-muted-foreground">{solution.description}</p>
                </div>

                <div className="h-px w-full bg-gradient-to-r from-slate-300/60 via-slate-200/40 to-transparent dark:from-white/20 dark:via-white/10 dark:to-transparent" />

                <ul className="space-y-3.5">
                  {solution.items.map((item, idx) => (
                    <li key={idx} className="flex items-start gap-3 text-[15px] leading-relaxed text-slate-700 dark:text-slate-300/95">
                      <CheckCircle2 className={`w-5 h-5 shrink-0 mt-0.5 ${toneMap[solution.color].icon}`} />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};
