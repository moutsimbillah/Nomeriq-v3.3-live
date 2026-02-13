import { Fragment, useState, useEffect, useMemo } from "react";
import { format } from "date-fns";
import { X, ChevronDown, ChevronUp, ExternalLink, FileText, Play, Image as ImageIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  calculateDisplayedPotentialProfit,
  calculateSignalRrForTarget,
} from "@/lib/trade-math";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserSubscriptionCategories } from "@/hooks/useSubscriptionPackages";
import { useSignalTakeProfitUpdates } from "@/hooks/useSignalTakeProfitUpdates";
import { resolveAnalysisImageUrl } from "@/lib/signalAnalysisMedia";
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
  initial_risk_amount?: number;
  closed_at: string | null;
  created_at: string;
  signal: {
    id: string;
    pair: string;
    direction: string;
    entry_price: number | null;
    take_profit: number | null;
    stop_loss: number | null;
    category: string | null;
    created_by: string | null;
    analysis_notes?: string | null;
    analysis_video_url?: string | null;
    analysis_image_url?: string | null;
  } | null;
}

interface DayDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  date: Date;
  dayPnl: number;
  dayTrades: number;
  adminGlobalView?: boolean;
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

const extractYouTubeId = (url: string): string | null => {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /youtube\.com\/shorts\/([^&\n?#]+)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
};

const DayTradeAnalysisSection = ({ signal }: { signal: Trade["signal"] }) => {
  const [resolvedImageUrl, setResolvedImageUrl] = useState<string | null>(null);
  const [isImageLoading, setIsImageLoading] = useState(false);
  const hasAnalysis = Boolean(signal?.analysis_notes || signal?.analysis_video_url || signal?.analysis_image_url);
  const videoId = signal?.analysis_video_url ? extractYouTubeId(signal.analysis_video_url) : null;

  useEffect(() => {
    const resolveImage = async () => {
      if (!signal?.analysis_image_url) {
        setResolvedImageUrl(null);
        setIsImageLoading(false);
        return;
      }
      setIsImageLoading(true);
      const url = await resolveAnalysisImageUrl(signal.analysis_image_url);
      setResolvedImageUrl(url);
      setIsImageLoading(false);
    };

    void resolveImage();
  }, [signal?.analysis_image_url]);

  return (
    <div className="rounded-lg border border-border/30 p-3 max-w-full overflow-hidden">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Analysis</p>
      {!hasAnalysis ? (
        <p className="text-sm text-muted-foreground">No analysis provided.</p>
      ) : (
        <div className="space-y-3">
          {signal?.analysis_notes && (
            <div className="rounded-md bg-secondary/30 p-3 max-w-full overflow-hidden">
              <div className="flex items-center gap-2 text-sm font-medium mb-1">
                <FileText className="w-4 h-4" />
                Notes
              </div>
              <p className="text-sm whitespace-pre-wrap break-words">{signal.analysis_notes}</p>
            </div>
          )}
          {signal?.analysis_video_url && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Play className="w-4 h-4" />
                Video Analysis
              </div>
              {videoId ? (
                <div className="relative w-full aspect-video rounded-md overflow-hidden border border-border/50">
                  <iframe
                    src={`https://www.youtube.com/embed/${videoId}`}
                    title="Analysis video"
                    className="absolute inset-0 w-full h-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              ) : null}
              <a
                href={signal.analysis_video_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                Open in YouTube <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}
          {signal?.analysis_image_url && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <ImageIcon className="w-4 h-4" />
                Chart/Image
              </div>
              <div className="rounded-md overflow-hidden border border-border/50">
                {isImageLoading || !resolvedImageUrl ? (
                  <div className="h-48 bg-secondary/30" />
                ) : (
                  <img
                    src={resolvedImageUrl}
                    alt="Analysis chart"
                    className="w-full h-auto object-contain max-h-[420px]"
                    draggable={false}
                    onContextMenu={(e) => e.preventDefault()}
                  />
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const DayDetailModal = ({
  isOpen,
  onClose,
  date,
  dayPnl,
  dayTrades,
  adminGlobalView = false,
}: DayDetailModalProps) => {
  const { user, isAdmin } = useAuth();
  const { allowedCategories } = useUserSubscriptionCategories();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isProvider, setIsProvider] = useState(false);
  const [roleLoading, setRoleLoading] = useState(true);
  const [expandedTradeId, setExpandedTradeId] = useState<string | null>(null);

  const signalIds = useMemo(
    () => Array.from(new Set(trades.map((t) => t.signal?.id).filter((id): id is string => !!id))),
    [trades]
  );
  const { updatesBySignal } = useSignalTakeProfitUpdates({ signalIds, realtime: isOpen });

  // Fetch admin role to check if user is a signal provider
  useEffect(() => {
    const fetchAdminRole = async () => {
      if (!user || !isAdmin) {
        setIsProvider(false);
        setRoleLoading(false);
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
      } finally {
        setRoleLoading(false);
      }
    };

    fetchAdminRole();
  }, [user, isAdmin]);

  useEffect(() => {
    const fetchTrades = async () => {
      if (!user || !isOpen || roleLoading) return;

      setIsLoading(true);
      try {
        const startOfDay = new Date(date);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(date);
        endOfDay.setHours(23, 59, 59, 999);

        let data: Trade[] = [];

        if (adminGlobalView && isAdmin) {
          // Super admin global day view: include all closed trades for that day.
          const { data: globalTrades, error } = await supabase
            .from("user_trades")
            .select(
              `
              *,
              signal:signals(id, pair, direction, entry_price, take_profit, stop_loss, category, created_by, analysis_notes, analysis_video_url, analysis_image_url)
            `
            )
            .gte("closed_at", startOfDay.toISOString())
            .lte("closed_at", endOfDay.toISOString())
            .not("result", "eq", "pending")
            .order("closed_at", { ascending: true });

          if (error) throw error;
          data = globalTrades || [];
        } else if (isProvider) {
          // For providers: fetch ALL trades from signals they created
          const { data: providerTrades, error } = await supabase
            .from("user_trades")
            .select(
              `
              *,
              signal:signals!inner(id, pair, direction, entry_price, take_profit, stop_loss, category, created_by, analysis_notes, analysis_video_url, analysis_image_url)
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
              signal:signals(id, pair, direction, entry_price, take_profit, stop_loss, category, created_by, analysis_notes, analysis_video_url, analysis_image_url)
            `
            )
            .eq("user_id", user.id)
            .gte("closed_at", startOfDay.toISOString())
            .lte("closed_at", endOfDay.toISOString())
            .not("result", "eq", "pending")
            .order("closed_at", { ascending: true });

          if (error) throw error;
          data = (userTrades || []).filter((trade) =>
            allowedCategories.length > 0
              ? allowedCategories.includes(trade.signal?.category || "")
              : true
          );
        }

        setTrades(data);
      } catch (err) {
        console.error("Error fetching day trades:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchTrades();
  }, [user, date, isOpen, isProvider, allowedCategories, adminGlobalView, isAdmin, roleLoading]);

  useEffect(() => {
    if (!isOpen) {
      setExpandedTradeId(null);
    }
  }, [isOpen]);

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

  const resolvedDayPnl = useMemo(() => {
    if (isLoading) return dayPnl;
    return trades.reduce((sum, t) => sum + Number(t.pnl || 0), 0);
  }, [isLoading, dayPnl, trades]);

  const resolvedDayTrades = isLoading ? dayTrades : trades.length;

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

  const getCurrentTp = (trade: Trade) => {
    const signal = trade.signal;
    if (!signal) return 0;
    const updates = updatesBySignal[signal.id] || [];
    if (updates.length === 0) return Number(signal.take_profit || 0);
    const prices = updates.map((u) => Number(u.tp_price)).filter((n) => Number.isFinite(n));
    if (prices.length === 0) return Number(signal.take_profit || 0);
    return signal.direction === "SELL" ? Math.min(...prices) : Math.max(...prices);
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
                        resolvedDayPnl >= 0 ? "text-success" : "text-destructive"
                      )}
                    >
                      {resolvedDayPnl >= 0 ? "+" : ""}${resolvedDayPnl.toFixed(2)}
                    </DialogTitle>
                    <span className="text-xs text-muted-foreground uppercase tracking-wider">Net P&L</span>
                    <span className="text-xs text-muted-foreground uppercase tracking-wider">
                      {resolvedDayTrades} trade{resolvedDayTrades === 1 ? "" : "s"}
                    </span>
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

            {isLoading || roleLoading ? (
              <div className="space-y-4 animate-pulse">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="h-64 rounded-xl bg-secondary/30" />
                  <div className="grid grid-cols-2 gap-3">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <div key={i} className="h-20 rounded-lg bg-secondary/30" />
                    ))}
                  </div>
                </div>
                <div className="h-56 rounded-xl bg-secondary/30" />
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
                                  resolvedDayPnl >= 0
                                    ? "hsl(var(--success))"
                                    : "hsl(var(--destructive))"
                                }
                                stopOpacity={0.3}
                              />
                              <stop
                                offset="100%"
                                stopColor={
                                  resolvedDayPnl >= 0
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
                              resolvedDayPnl >= 0
                                ? "hsl(var(--success))"
                                : "hsl(var(--destructive))"
                            }
                            strokeWidth={2}
                            fill="url(#pnlGradient)"
                            dot={{
                              fill:
                                resolvedDayPnl >= 0
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
                    <table className="w-full table-fixed min-w-[980px]">
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
                            Win/Loss
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
                          <th className="px-4 py-3 text-center text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                            Details
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {trades.map((trade) => {
                          const isExpanded = expandedTradeId === trade.id;
                          const signal = trade.signal;
                          const updates = signal?.id ? (updatesBySignal[signal.id] || []) : [];
                          const currentTp = getCurrentTp(trade);
                          const rr = calculateSignalRrForTarget(trade.signal, currentTp);
                          const potentialProfit = calculateDisplayedPotentialProfit({
                            ...trade,
                            signal: trade.signal
                              ? { ...trade.signal, take_profit: currentTp }
                              : trade.signal,
                          });
                          let remainingPercent = 100;

                          return (
                            <Fragment key={trade.id}>
                              <tr
                                className="border-b border-border/10 hover:bg-secondary/30 transition-colors"
                              >
                                <td className="px-4 py-3 text-sm font-medium">
                                  {signal?.pair || "N/A"}
                                </td>
                                <td className="px-4 py-3">
                                  <span
                                    className={cn(
                                      "px-2 py-0.5 rounded text-[10px] font-medium uppercase",
                                      signal?.direction === "BUY"
                                        ? "bg-success/20 text-success"
                                        : "bg-destructive/20 text-destructive"
                                    )}
                                  >
                                    {signal?.direction === "BUY"
                                      ? "LONG"
                                      : "SHORT"}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-right text-sm font-mono">
                                  ${trade.risk_amount.toFixed(2)}
                                </td>
                                <td className="px-4 py-3 text-right text-sm font-mono">
                                  {signal?.entry_price?.toFixed(2) || "-"}
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <span
                                    className={cn(
                                      "inline-flex items-center justify-center px-2.5 py-0.5 rounded text-[10px] font-medium uppercase",
                                      trade.result === "win" && "bg-success/20 text-success",
                                      trade.result === "loss" && "bg-destructive/20 text-destructive",
                                      trade.result === "breakeven" && "bg-warning/20 text-warning",
                                      !trade.result && "bg-secondary/40 text-muted-foreground"
                                    )}
                                  >
                                    {trade.result === "win"
                                      ? "Win"
                                      : trade.result === "loss"
                                      ? "Loss"
                                      : trade.result === "breakeven"
                                      ? "Breakeven"
                                      : "-"}
                                  </span>
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
                                <td className="px-4 py-3 text-center">
                                  <button
                                    type="button"
                                    className="inline-flex items-center justify-center h-8 w-8 rounded-md border border-border/50 bg-secondary/30 hover:bg-secondary/60 transition-colors"
                                    onClick={() =>
                                      setExpandedTradeId((prev) => (prev === trade.id ? null : trade.id))
                                    }
                                  >
                                    {isExpanded ? (
                                      <ChevronUp className="w-4 h-4 text-muted-foreground" />
                                    ) : (
                                      <ChevronDown className="w-4 h-4 text-muted-foreground" />
                                    )}
                                  </button>
                                </td>
                              </tr>
                              {isExpanded && (
                                <tr className="border-b border-border/10 bg-secondary/10">
                                  <td colSpan={9} className="p-0">
                                    <div className="px-4 py-4 max-w-full overflow-hidden space-y-4">
                                      <div className="flex flex-wrap items-center gap-2 text-xs">
                                        <span className="px-2 py-1 rounded-full border border-border/50 font-mono">
                                          Pair: {signal?.pair || "-"}
                                        </span>
                                        <span className="px-2 py-1 rounded-full border border-border/50 font-mono">
                                          Entry: {signal?.entry_price ?? "-"}
                                        </span>
                                        <span className="px-2 py-1 rounded-full border border-border/50 font-mono">
                                          SL: {signal?.stop_loss ?? "-"}
                                        </span>
                                        <span className="px-2 py-1 rounded-full border border-border/50 font-mono">
                                          TP: {signal?.take_profit ?? "-"}
                                        </span>
                                        {updates.length > 0 && (
                                          <span className="px-2 py-1 rounded-full border border-border/50 font-mono">
                                            Current TP: {currentTp}
                                          </span>
                                        )}
                                      </div>

                                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                                        <div className="rounded-lg border border-border/30 p-3">
                                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">R:R</p>
                                          <p className="font-semibold font-mono">1:{rr.toFixed(1)}</p>
                                        </div>
                                        <div className="rounded-lg border border-border/30 p-3">
                                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Potential Profit</p>
                                          <p className="font-semibold font-mono text-success">+${potentialProfit.toFixed(2)}</p>
                                        </div>
                                        <div className="rounded-lg border border-border/30 p-3">
                                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Opened</p>
                                          <p className="font-semibold">{format(new Date(trade.created_at), "yyyy-MM-dd HH:mm")}</p>
                                        </div>
                                        <div className="rounded-lg border border-border/30 p-3">
                                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Closed</p>
                                          <p className="font-semibold">{trade.closed_at ? format(new Date(trade.closed_at), "yyyy-MM-dd HH:mm") : "-"}</p>
                                        </div>
                                      </div>

                                      <div className="rounded-lg border border-border/30 p-3 max-w-full overflow-hidden">
                                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">TP Updates</p>
                                        {updates.length === 0 ? (
                                          <p className="text-sm text-muted-foreground">No TP updates published.</p>
                                        ) : (
                                          <div className="space-y-2">
                                            {updates.map((u) => {
                                              const closePercent = Math.max(0, Math.min(remainingPercent, Number(u.close_percent || 0)));
                                              remainingPercent = Math.max(0, remainingPercent - closePercent);
                                              const updateRr = calculateSignalRrForTarget(
                                                trade.signal,
                                                Number(u.tp_price)
                                              );
                                              const baseRisk = Number(trade.initial_risk_amount ?? trade.risk_amount ?? 0);
                                              const realizedProfit = baseRisk * (closePercent / 100) * updateRr;
                                              return (
                                                <div key={u.id} className="rounded-md bg-secondary/30 px-3 py-2 text-sm flex flex-wrap items-center gap-2 break-words">
                                                  <span className="px-2 py-0.5 rounded-full border border-border/50 text-xs">{u.tp_label}</span>
                                                  <span className="font-mono">Price: {u.tp_price}</span>
                                                  <span className="text-primary">Close: {closePercent.toFixed(2)}%</span>
                                                  <span className="text-success font-semibold">Profit: +${realizedProfit.toFixed(2)}</span>
                                                  {u.note && <span className="text-muted-foreground">- {u.note}</span>}
                                                </div>
                                              );
                                            })}
                                          </div>
                                        )}
                                      </div>

                                      <DayTradeAnalysisSection signal={signal} />
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          );
                        })}
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
