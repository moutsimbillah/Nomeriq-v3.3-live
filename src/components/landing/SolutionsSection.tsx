import { CheckCircle2 } from "lucide-react";

const solutions = [
  {
    title: "Signal Management",
    description: "Streamlined signal creation, delivery, and tracking.",
    items: ["Precise entry, stop-loss, and TP levels", "Direction and asset categorization", "Signal status tracking (active/closed)"],
    color: "blue"
  },
  {
    title: "Analytics Dashboard",
    description: "Comprehensive performance visibility.",
    items: ["Equity curve visualization", "Win rate and profit factor metrics", "Drawdown analysis and monitoring"],
    color: "purple"
  },
  {
    title: "Risk Controls",
    description: "Systematic risk management tools.",
    items: ["Configurable risk percentage per trade", "Position sizing calculations", "Account balance tracking"],
    color: "emerald"
  }
];

export const SolutionsSection = () => {
  return (
    <section id="solutions" className="py-24 sm:py-32 px-6 relative overflow-hidden glass rounded-[40px] border border-black/10 dark:border-white/10 mx-6 max-w-7xl md:mx-auto mb-48">
      <div className="container mx-auto">
        <div className="text-center mb-20">
          <span className="text-[10px] font-bold tracking-widest text-blue-500 dark:text-blue-400 uppercase">Solutions</span>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mt-4 tracking-tight text-foreground">Core Platform Modules</h2>
          <p className="mt-6 text-muted-foreground max-w-2xl mx-auto">Integrated tools designed to work together for a seamless trading workflow.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 px-4 md:px-10">
          {solutions.map((solution, index) => (
            <div key={index} className="space-y-6">
              <div className={`w-12 h-12 glass rounded-xl flex items-center justify-center font-bold text-${solution.color}-500 dark:text-${solution.color}-400 border-${solution.color}-400/30`}>
                {index + 1}
              </div>
              <h3 className="text-2xl font-bold text-foreground">{solution.title}</h3>
              <p className="text-muted-foreground text-sm">{solution.description}</p>
              <ul className="space-y-4 pt-4">
                {solution.items.map((item, idx) => (
                  <li key={idx} className="flex items-center space-x-3 text-sm text-muted-foreground">
                    <CheckCircle2 className={`w-5 h-5 text-${solution.color}-500 shrink-0`} />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};