import { User, Users, Building2, Briefcase } from "lucide-react";

const audiences = [
  {
    icon: User,
    title: "Individual Traders",
    description: "Track your trades, monitor performance, and receive signals with built-in risk management tools.",
    features: ["Trade Journaling", "Performance Analytics", "Signal Notifications"],
    tone: "blue"
  },
  {
    icon: Briefcase,
    title: "Signal Providers",
    description: "Deliver signals to subscribers with transparent track records and professional performance documentation.",
    features: ["Signal Distribution", "Subscriber Mgmt", "Track Record Verification"],
    tone: "cyan"
  },
  {
    icon: Users,
    title: "Trading Communities",
    description: "Manage group-based signal delivery with centralized analytics and member access controls.",
    features: ["Group Management", "Shared Analytics", "Community Tools"],
    tone: "emerald"
  },
  {
    icon: Building2,
    title: "Professional Teams",
    description: "Enterprise-ready infrastructure for trading desks requiring systematic workflow management.",
    features: ["Team Collaboration", "Role-based Access", "Compliance Ready"],
    tone: "amber"
  }
];

const toneStyles = {
  blue: "bg-blue-500/10 border-blue-500/20 text-blue-500",
  cyan: "bg-cyan-500/10 border-cyan-500/20 text-cyan-500",
  emerald: "bg-emerald-500/10 border-emerald-500/20 text-emerald-500",
  amber: "bg-amber-500/10 border-amber-500/20 text-amber-500",
} as const;

export const AudienceSection = () => {
  return (
    <section id="who-its-for" className="py-20 sm:py-24 px-6 relative overflow-hidden">
      <div className="container mx-auto max-w-7xl">
        <div className="text-center mb-14 sm:mb-16">
          <span className="text-[10px] font-bold tracking-[0.24em] text-primary uppercase">Users</span>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mt-4 tracking-tight text-foreground">
            Built For Every Trading Operation
          </h2>
          <p className="mt-6 text-muted-foreground max-w-2xl mx-auto">
            From solo execution to institutional teams, the workflow adapts without losing consistency.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6">
          {audiences.map((audience, index) => (
            <article key={index} className="rounded-2xl border border-border/60 bg-card/70 p-7 sm:p-8 flex items-start space-x-5">
              <div className={`w-12 h-12 rounded-xl border flex items-center justify-center shrink-0 ${toneStyles[audience.tone as keyof typeof toneStyles]}`}>
                <audience.icon className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-xl sm:text-2xl font-semibold mb-3 text-foreground">{audience.title}</h3>
                <p className="text-muted-foreground leading-relaxed mb-5">{audience.description}</p>
                <div className="flex flex-wrap gap-2">
                  {audience.features.map((feature, idx) => (
                    <span key={idx} className="px-3 py-1 bg-accent rounded-full text-[10px] uppercase font-semibold tracking-wide text-muted-foreground">
                      {feature}
                    </span>
                  ))}
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};
