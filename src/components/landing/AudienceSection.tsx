import { User, Users, Building2, Briefcase } from "lucide-react";

const audiences = [
  {
    icon: User,
    title: "Individual Traders",
    description: "Track your trades, monitor performance, and receive signals with built-in risk management tools.",
    features: ["Trade Journaling", "Performance Analytics", "Signal Notifications"],
    color: "blue"
  },
  {
    icon: Briefcase,
    title: "Signal Providers",
    description: "Deliver signals to subscribers with transparent track records and professional performance documentation.",
    features: ["Signal Distribution", "Subscriber Mgmt", "Track Record Verification"],
    color: "purple"
  },
  {
    icon: Users,
    title: "Trading Communities",
    description: "Manage group-based signal delivery with centralized analytics and member access controls.",
    features: ["Group Management", "Shared Analytics", "Community Tools"],
    color: "emerald"
  },
  {
    icon: Building2,
    title: "Professional Teams",
    description: "Enterprise-ready infrastructure for trading desks requiring systematic workflow management.",
    features: ["Team Collaboration", "Role-based Access", "Compliance Ready"],
    color: "amber"
  }
];

export const AudienceSection = () => {
  return (
    <section id="who-its-for" className="py-24 sm:py-32 px-6 relative overflow-hidden">
      <div className="container mx-auto max-w-7xl">
        <div className="text-center mb-16 sm:mb-24">
          <span className="text-[10px] font-bold tracking-widest text-blue-500 dark:text-blue-400 uppercase">Who It's For</span>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mt-4 tracking-tight text-foreground">Built for Every Workflow</h2>
          <p className="mt-6 text-muted-foreground max-w-2xl mx-auto">Whether you're an individual trader, signal provider, or part of a professional team.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {audiences.map((audience, index) => (
            <div key={index} className="glass p-12 rounded-3xl group border border-black/10 dark:border-white/10 flex items-start space-x-6">
              <div className={`w-16 h-16 bg-${audience.color}-500/10 rounded-2xl flex items-center justify-center shrink-0`}>
                <audience.icon className={`w-8 h-8 text-${audience.color}-500`} />
              </div>
              <div>
                <h3 className="text-2xl font-bold mb-4 text-foreground">{audience.title}</h3>
                <p className="text-muted-foreground leading-relaxed mb-6">{audience.description}</p>
                <div className="flex flex-wrap gap-2">
                  {audience.features.map((feature, idx) => (
                    <span key={idx} className="px-3 py-1 bg-black/5 dark:bg-white/5 rounded-full text-[10px] uppercase font-bold text-muted-foreground">
                      {feature}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};