import { TrendingUp, Gem, Bitcoin, BarChart2 } from "lucide-react";

export const MarketsSection = () => {
    return (
        <section className="py-24 sm:py-32 px-6 text-center relative overflow-hidden">
            {/* Background Glow */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-blue-500/5 blur-[100px] rounded-full pointer-events-none" />

            <div className="container mx-auto relative z-10 max-w-7xl">
                <div className="mb-16 sm:mb-24">
                    <span className="text-[10px] font-bold tracking-widest text-blue-500 dark:text-blue-400 uppercase">Multi-Asset Support</span>
                    <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mt-4 tracking-tight text-foreground">One Platform. Every Market.</h2>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
                    <div className="glass p-8 sm:p-12 rounded-3xl bento-card border border-black/10 dark:border-white/10 flex flex-col items-center">
                        <TrendingUp className="w-10 h-10 sm:w-12 sm:h-12 text-blue-500 mb-6" />
                        <h3 className="text-lg sm:text-xl font-bold mb-2 text-foreground">Forex</h3>
                        <p className="text-sm text-muted-foreground">Major & Minor Pairs</p>
                    </div>

                    <div className="glass p-8 sm:p-12 rounded-3xl bento-card border border-black/10 dark:border-white/10 flex flex-col items-center">
                        <Gem className="w-10 h-10 sm:w-12 sm:h-12 text-yellow-500 mb-6" />
                        <h3 className="text-lg sm:text-xl font-bold mb-2 text-foreground">Metals</h3>
                        <p className="text-sm text-muted-foreground">Gold, Silver & More</p>
                    </div>

                    <div className="glass p-8 sm:p-12 rounded-3xl bento-card border border-black/10 dark:border-white/10 flex flex-col items-center">
                        <Bitcoin className="w-10 h-10 sm:w-12 sm:h-12 text-orange-500 mb-6" />
                        <h3 className="text-lg sm:text-xl font-bold mb-2 text-foreground">Crypto</h3>
                        <p className="text-sm text-muted-foreground">BTC, ETH & Altcoins</p>
                    </div>

                    <div className="glass p-8 sm:p-12 rounded-3xl bento-card border border-black/10 dark:border-white/10 flex flex-col items-center">
                        <BarChart2 className="w-10 h-10 sm:w-12 sm:h-12 text-emerald-500 mb-6" />
                        <h3 className="text-lg sm:text-xl font-bold mb-2 text-foreground">Indices</h3>
                        <p className="text-sm text-muted-foreground">Global Market Indices</p>
                    </div>
                </div>
            </div>
        </section>
    );
};
