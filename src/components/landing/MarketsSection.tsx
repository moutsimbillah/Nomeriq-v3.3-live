import { TrendingUp, Gem, Bitcoin, BarChart2 } from "lucide-react";

export const MarketsSection = () => {
    return (
        <section className="py-20 sm:py-24 px-6 text-center relative overflow-hidden">
            <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-14 left-1/2 -translate-x-1/2 w-[540px] h-[320px] bg-blue-500/10 blur-[120px] rounded-full" />
            </div>

            <div className="container mx-auto relative z-10 max-w-7xl">
                <div className="mb-14 sm:mb-16">
                    <span className="text-[10px] font-bold tracking-[0.24em] text-primary uppercase">Coverage</span>
                    <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mt-4 tracking-tight text-foreground">
                        One Operating Layer For Every Market
                    </h2>
                    <p className="mt-5 text-muted-foreground max-w-2xl mx-auto">
                        Standardized signal structure and analytics across major asset classes.
                    </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
                    <div className="rounded-2xl border border-border/60 bg-card/70 p-7 sm:p-8 flex flex-col items-start text-left">
                        <div className="w-11 h-11 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mb-5">
                            <TrendingUp className="w-5 h-5 text-blue-500" />
                        </div>
                        <h3 className="text-lg font-semibold mb-1.5 text-foreground">Forex</h3>
                        <p className="text-sm text-muted-foreground">Majors, minors, session-aligned entries.</p>
                    </div>

                    <div className="rounded-2xl border border-border/60 bg-card/70 p-7 sm:p-8 flex flex-col items-start text-left">
                        <div className="w-11 h-11 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-5">
                            <Gem className="w-5 h-5 text-amber-500" />
                        </div>
                        <h3 className="text-lg font-semibold mb-1.5 text-foreground">Metals</h3>
                        <p className="text-sm text-muted-foreground">Gold and silver with disciplined risk framing.</p>
                    </div>

                    <div className="rounded-2xl border border-border/60 bg-card/70 p-7 sm:p-8 flex flex-col items-start text-left">
                        <div className="w-11 h-11 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center mb-5">
                            <Bitcoin className="w-5 h-5 text-orange-500" />
                        </div>
                        <h3 className="text-lg font-semibold mb-1.5 text-foreground">Crypto</h3>
                        <p className="text-sm text-muted-foreground">High-volatility pairs with structured execution.</p>
                    </div>

                    <div className="rounded-2xl border border-border/60 bg-card/70 p-7 sm:p-8 flex flex-col items-start text-left">
                        <div className="w-11 h-11 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-5">
                            <BarChart2 className="w-5 h-5 text-emerald-500" />
                        </div>
                        <h3 className="text-lg font-semibold mb-1.5 text-foreground">Indices</h3>
                        <p className="text-sm text-muted-foreground">Global benchmarks and momentum-driven setups.</p>
                    </div>
                </div>
            </div>
        </section>
    );
};
