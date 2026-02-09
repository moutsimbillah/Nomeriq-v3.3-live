import { useState, useEffect, useMemo } from "react";
import { format } from "date-fns";
import { X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Area,
  AreaChart,
  ReferenceLine,
} from "recharts";

interface Trade {
  id: string;
  pnl: number | null;
  result: string | null;
  risk_amount: number;
  closed_at: string | null;
  created_at: string;
  signal: {
    pair: string;
    direction: string;
    entry_price: number | null;
    take_profit: number | null;
    stop_loss: number | null;
    created_by: string | null;
  } | null;
}

interface DayDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  date: Date;
  dayPnl: number;
  dayTrades: number;
}

interface StatCardProps {
  label: string;
  value: string | number;
  isNegative?: boolean;
}

const StatCard = ({ label, value, isNegative }: StatCardProps) => (
  <div className="bg-secondary/40 rounded-lg p-4 border border-border/30">
    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
      {label}
    </p>
    <p
      className={cn(
        "text-xl font-bold font-mono",
        isNegative ? "text-destructive" : "text-foreground"
      )}
    >
      {value}
    </p>
  </div>
);

export const DayDetailModal = ({
  isOpen,
  onClose,
  date,
  dayPnl,
  dayTrades,
}: DayDetailModalProps) => {
  const { user, isAdmin } = useAuth();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isProvider, setIsProvider] = useState(false);

  // Fetch admin role to check if user is a signal provider
  useEffect(() => {
    const fetchAdminRole = async () => {
      if (!user || !isAdmin) {
        setIsProvider(false);
        return;
      }

      try {
        const { data } = await supabase
          .from('admin_roles')
          .select('admin_role')
          .eq('user_id', user.id)
          .eq('status', 'active')
          .maybeSingle();
        
        const role = data?.admin_role;
        setIsProvider(role === 'signal_provider_admin' || role === 'super_admin');
      } catch (err) {
        console.error('Error fetching admin role:', err);
        setIsProvider(false);
      }
    };

    fetchAdminRole();
  }, [user, isAdmin]);

  useEffect(() => {
    const fetchTrades = async () => {
      if (!user || !isOpen) return;

      setIsLoading(true);
      try {
        const startOfDay = new Date(date);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(date);
        endOfDay.setHours(23, 59, 59, 999);

        let data: Trade[] = [];

        if (isProvider) {
          // For providers: fetch ALL trades from signals they created
          const { data: providerTrades, error } = await supabase
            .from("user_trades")
            .select(
              `
              *,
              signal:signals!inner(pair, direction, entry_price, take_profit, stop_loss, created_by)
            `
            )
            .eq("signal.created_by", user.id)
            .gte("closed_at", startOfDay.toISOString())
            .lte("closed_at", endOfDay.toISOString())
            .not("result", "eq", "pending")
            .order("closed_at", { ascending: true });

          if (error) throw error;
          data = providerTrades || [];
        } else {
          // For regular users: fetch only their own trades
          const { data: userTrades, error } = await supabase
            .from("user_trades")
            .select(
              `
              *,
              signal:signals(pair, direction, entry_price, take_profit, stop_loss, created_by)
            `
            )
            .eq("user_id", user.id)
            .gte("closed_at", startOfDay.toISOString())
            .lte("closed_at", endOfDay.toISOString())
            .not("result", "eq", "pending")
            .order("closed_at", { ascending: true });

          if (error) throw error;
          data = userTrades || [];
        }

        setTrades(data);
      } catch (err) {
        console.error("Error fetching day trades:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchTrades();
  }, [user, date, isOpen, isProvider]);

  // Calculate stats
  const stats = useMemo(() => {
    const winners = trades.filter((t) => t.result === "win").length;
    const losers = trades.filter((t) => t.result === "loss").length;
    const breakeven = trades.filter((t) => t.result === "breakeven").length;
    const totalTrades = trades.length;
    const winrate = totalTrades > 0 ? (winners / totalTrades) * 100 : 0;

    const grossPnL = trades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const totalVolume = trades.reduce((sum, t) => sum + t.risk_amount, 0);

    const grossProfit = trades
      .filter((t) => (t.pnl || 0) > 0)
      .reduce((sum, t) => sum + (t.pnl || 0), 0);
    const grossLoss = Math.abs(
      trades
        .filter((t) => (t.pnl || 0) < 0)
        .reduce((sum, t) => sum + (t.pnl || 0), 0)
    );
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

    return {
      totalTrades,
      winners,
      losers,
      breakeven,
      winrate,
      grossPnL,
      totalVolume,
      profitFactor,
    };
  }, [trades]);

  // Build P&L progression data
  const chartData = useMemo(() => {
    let cumulative = 0;
    return trades.map((trade, index) => {
      cumulative += trade.pnl || 0;
      return {
        index: index + 1,
        pnl: cumulative,
        time: trade.closed_at
          ? format(new Date(trade.closed_at), "HH:mm")
          : `Trade ${index + 1}`,
      };
    });
  }, [trades]);

  // Calculate duration between created_at and closed_at
  const formatDuration = (createdAt: string, closedAt: string | null) => {
    if (!closedAt) return "-";
    const start = new Date(createdAt).getTime();
    const end = new Date(closedAt).getTime();
    const diffMs = end - start;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const remainingMins = diffMins % 60;

    if (diffHours > 0) {
      return `${diffHours}h ${remainingMins}m`;
    }
    return `${diffMins}m`;
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-5xl max-h-[90vh] p-0 gap-0 bg-background border-border/50 shadow-2xl overflow-hidden">
        {/* Sticky Header */}
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border/30 px-6 py-4">
          <DialogHeader className="space-y-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex flex-col">
                  <p className="text-xs text-muted-foreground uppercase tracking-widest font-medium">
                    {format(date, "EEEE, MMMM d, yyyy")}
                  </p>
                  <div className="flex items-baseline gap-3 mt-1">
                    <DialogTitle
                      className={cn(
                        "text-2xl font-bold font-mono tracking-tight",
                        dayPnl >= 0 ? "text-success" : "text-destructive"
                      )}
                    >
                      {dayPnl >= 0 ? "+" : ""}${dayPnl.toFixed(2)}
                    </DialogTitle>
                    <span className="text-xs text-muted-foreground uppercase tracking-wider">Net P&L</span>
                  </div>
                </div>
              </div>
              <button
                onClick={onClose}
                className="h-8 w-8 rounded-full bg-secondary/50 hover:bg-secondary flex items-center justify-center transition-colors"
              >
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
          </DialogHeader>
        </div>

        <ScrollArea className="max-h-[calc(90vh-80px)]">
          <div className="p-6">

            {isLoading ? (
              <div className="flex items-center justify-center h-64">
                <div className="animate-pulse text-muted-foreground">
                  Loading trades...
                </div>
              </div>
            ) : trades.length === 0 ? (
              <div className="flex items-center justify-center h-64">
                <p className="text-muted-foreground">No trades found for this day</p>
              </div>
            ) : (
              <>
                {/* Main content - 2 columns */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                  {/* Left - P&L Chart */}
                  <div className="bg-secondary/20 rounded-xl p-4 border border-border/30 flex flex-col min-w-0">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground mb-4">
                      Daily P&L Progression
                    </p>
                    <div className="flex-1 min-h-56 w-full min-w-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart
                          data={chartData}
                          margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                        >
                          <defs>
                            <linearGradient
                              id="pnlGradient"
                              x1="0"
                              y1="0"
                              x2="0"
                              y2="1"
                            >
                              <stop
                                offset="0%"
                                stopColor={
                                  dayPnl >= 0
                                    ? "hsl(var(--success))"
                                    : "hsl(var(--destructive))"
                                }
                                stopOpacity={0.3}
                              />
                              <stop
                                offset="100%"
                                stopColor={
                                  dayPnl >= 0
                                    ? "hsl(var(--success))"
                                    : "hsl(var(--destructive))"
                                }
                                stopOpacity={0}
                              />
                            </linearGradient>
                          </defs>
                          <XAxis
                            dataKey="time"
                            axisLine={false}
                            tickLine={false}
                            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                          />
                          <YAxis
                            axisLine={false}
                            tickLine={false}
                            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                            tickFormatter={(v) => `$${v}`}
                            width={50}
                          />
                          <ReferenceLine
                            y={0}
                            stroke="hsl(var(--border))"
                            strokeDasharray="3 3"
                          />
                          <Area
                            type="monotone"
                            dataKey="pnl"
                            stroke={
                              dayPnl >= 0
                                ? "hsl(var(--success))"
                                : "hsl(var(--destructive))"
                            }
                            strokeWidth={2}
                            fill="url(#pnlGradient)"
                            dot={{
                              fill:
                                dayPnl >= 0
                                  ? "hsl(var(--success))"
                                  : "hsl(var(--destructive))",
                              strokeWidth: 0,
                              r: 3,
                            }}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Right - Stats Grid */}
                  <div className="grid grid-cols-2 gap-3">
                    <StatCard label="Total Trades" value={stats.totalTrades} />
                    <StatCard label="Winners" value={stats.winners} />
                    <StatCard label="Losers" value={stats.losers} />
                    <StatCard
                      label="Winrate"
                      value={`${stats.winrate.toFixed(0)}%`}
                    />
                    <StatCard
                      label="Gross P&L"
                      value={`${stats.grossPnL >= 0 ? "" : "-"}$${Math.abs(
                        stats.grossPnL
                      ).toFixed(2)}`}
                      isNegative={stats.grossPnL < 0}
                    />
                    <StatCard
                      label="Volume"
                      value={`$${stats.totalVolume.toFixed(2)}`}
                    />
                    <StatCard
                      label="Profit Factor"
                      value={
                        stats.profitFactor === Infinity
                          ? "∞"
                          : stats.profitFactor.toFixed(2)
                      }
                    />
                    <StatCard label="Breakeven" value={stats.breakeven} />
                  </div>
                </div>

                {/* Trades Table */}
                <div className="bg-secondary/20 rounded-xl border border-border/30 overflow-hidden">
                  <div className="p-4 border-b border-border/30">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">
                      Trades
                    </p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-border/20">
                          <th className="px-4 py-3 text-left text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                            Symbol
                          </th>
                          <th className="px-4 py-3 text-left text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                            Side
                          </th>
                          <th className="px-4 py-3 text-right text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                            Risk
                          </th>
                          <th className="px-4 py-3 text-right text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                            Entry
                          </th>
                          <th className="px-4 py-3 text-right text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                            TP / SL
                          </th>
                          <th className="px-4 py-3 text-center text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                            Time
                          </th>
                          <th className="px-4 py-3 text-center text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                            Duration
                          </th>
                          <th className="px-4 py-3 text-right text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                            P&L
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {trades.map((trade) => (
                          <tr
                            key={trade.id}
                            className="border-b border-border/10 hover:bg-secondary/30 transition-colors"
                          >
                            <td className="px-4 py-3 text-sm font-medium">
                              {trade.signal?.pair || "N/A"}
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={cn(
                                  "px-2 py-0.5 rounded text-[10px] font-medium uppercase",
                                  trade.signal?.direction === "BUY"
                                    ? "bg-success/20 text-success"
                                    : "bg-destructive/20 text-destructive"
                                )}
                              >
                                {trade.signal?.direction === "BUY"
                                  ? "LONG"
                                  : "SHORT"}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right text-sm font-mono">
                              ${trade.risk_amount.toFixed(2)}
                            </td>
                            <td className="px-4 py-3 text-right text-sm font-mono">
                              {trade.signal?.entry_price?.toFixed(2) || "-"}
                            </td>
                            <td className="px-4 py-3 text-right text-sm font-mono text-muted-foreground">
                              {trade.signal?.take_profit?.toFixed(2) || "-"} /{" "}
                              {trade.signal?.stop_loss?.toFixed(2) || "-"}
                            </td>
                            <td className="px-4 py-3 text-center text-sm text-muted-foreground">
                              {trade.closed_at
                                ? format(new Date(trade.closed_at), "HH:mm")
                                : "-"}
                            </td>
                            <td className="px-4 py-3 text-center text-sm text-muted-foreground">
                              {formatDuration(trade.created_at, trade.closed_at)}
                            </td>
                            <td
                              className={cn(
                                "px-4 py-3 text-right text-sm font-bold font-mono",
                                (trade.pnl || 0) >= 0
                                  ? "text-success"
                                  : "text-destructive"
                              )}
                            >
                              {(trade.pnl || 0) >= 0 ? "+" : ""}$
                              {(trade.pnl || 0).toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
