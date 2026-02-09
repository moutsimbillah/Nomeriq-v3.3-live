import { useState, useEffect } from "react";
import { Clock, AlertTriangle, Zap, Calendar } from "lucide-react";

interface CountdownInfo {
  message: string;
  timeLeft: string;
  type: "session" | "overlap" | "news";
  priority: number;
  icon?: "clock" | "zap" | "alert" | "calendar";
}

interface EconomicEvent {
  name: string;
  shortName: string;
  getNextOccurrence: () => Date | null;
  impact: "high" | "medium";
}

// High-impact recurring economic events
const getEconomicEvents = (): EconomicEvent[] => {
  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth();

  // Helper to get first Friday of a month
  const getFirstFriday = (year: number, month: number): Date => {
    const date = new Date(Date.UTC(year, month, 1, 13, 30)); // 13:30 UTC (8:30 AM ET)
    while (date.getUTCDay() !== 5) {
      date.setUTCDate(date.getUTCDate() + 1);
    }
    return date;
  };

  // FOMC meeting dates for 2025-2026 (scheduled 8 times per year)
  const fomcDates2025 = [
    new Date(Date.UTC(2025, 0, 29, 19, 0)), // Jan 29
    new Date(Date.UTC(2025, 2, 19, 18, 0)), // Mar 19
    new Date(Date.UTC(2025, 4, 7, 18, 0)),  // May 7
    new Date(Date.UTC(2025, 5, 18, 18, 0)), // Jun 18
    new Date(Date.UTC(2025, 6, 30, 18, 0)), // Jul 30
    new Date(Date.UTC(2025, 8, 17, 18, 0)), // Sep 17
    new Date(Date.UTC(2025, 10, 5, 19, 0)), // Nov 5
    new Date(Date.UTC(2025, 11, 17, 19, 0)), // Dec 17
  ];

  const fomcDates2026 = [
    new Date(Date.UTC(2026, 0, 28, 19, 0)), // Jan 28
    new Date(Date.UTC(2026, 2, 18, 18, 0)), // Mar 18
    new Date(Date.UTC(2026, 4, 6, 18, 0)),  // May 6
    new Date(Date.UTC(2026, 5, 17, 18, 0)), // Jun 17
    new Date(Date.UTC(2026, 6, 29, 18, 0)), // Jul 29
    new Date(Date.UTC(2026, 8, 16, 18, 0)), // Sep 16
    new Date(Date.UTC(2026, 10, 4, 19, 0)), // Nov 4
    new Date(Date.UTC(2026, 11, 16, 19, 0)), // Dec 16
  ];

  // ECB rate decisions (typically Thursday, 13:15 UTC)
  const ecbDates2025 = [
    new Date(Date.UTC(2025, 0, 30, 13, 15)),
    new Date(Date.UTC(2025, 2, 6, 13, 15)),
    new Date(Date.UTC(2025, 3, 17, 12, 15)),
    new Date(Date.UTC(2025, 5, 5, 12, 15)),
    new Date(Date.UTC(2025, 6, 17, 12, 15)),
    new Date(Date.UTC(2025, 8, 11, 12, 15)),
    new Date(Date.UTC(2025, 9, 30, 13, 15)),
    new Date(Date.UTC(2025, 11, 18, 13, 15)),
  ];

  return [
    {
      name: "Non-Farm Payrolls",
      shortName: "NFP",
      impact: "high",
      getNextOccurrence: () => {
        // First Friday of month at 13:30 UTC
        let nfpDate = getFirstFriday(currentYear, currentMonth);
        if (nfpDate <= now) {
          nfpDate = getFirstFriday(currentYear, currentMonth + 1);
        }
        return nfpDate;
      },
    },
    {
      name: "FOMC Decision",
      shortName: "FOMC",
      impact: "high",
      getNextOccurrence: () => {
        const allDates = [...fomcDates2025, ...fomcDates2026];
        return allDates.find(d => d > now) || null;
      },
    },
    {
      name: "ECB Rate Decision",
      shortName: "ECB",
      impact: "high",
      getNextOccurrence: () => {
        return ecbDates2025.find(d => d > now) || null;
      },
    },
    {
      name: "US CPI Release",
      shortName: "CPI",
      impact: "high",
      getNextOccurrence: () => {
        // Usually around 12th-14th of month at 13:30 UTC
        let cpiDate = new Date(Date.UTC(currentYear, currentMonth, 12, 13, 30));
        if (cpiDate <= now) {
          cpiDate = new Date(Date.UTC(currentYear, currentMonth + 1, 12, 13, 30));
        }
        return cpiDate;
      },
    },
  ];
};

const pad2 = (n: number) => n.toString().padStart(2, "0");

const formatCountdown = (ms: number) => {
  const clamped = Math.max(0, ms);
  const totalSeconds = Math.floor(clamped / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  // Always tick seconds to make “live” obvious.
  if (days > 0) return `${days}d ${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`;
  return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`;
};

const isForexMarketOpen = (now: Date) => {
  const utcDay = now.getUTCDay();
  const time = now.getUTCHours() + now.getUTCMinutes() / 60;
  if (utcDay === 6) return false;
  if (utcDay === 0 && time < 21) return false;
  if (utcDay === 5 && time >= 21) return false;
  return true;
};

type SessionWindow = { name: string; startHour: number; endHour: number };

const SESSIONS: SessionWindow[] = [
  { name: "Sydney", startHour: 21, endHour: 6 },
  { name: "Tokyo", startHour: 0, endHour: 9 },
  { name: "London", startHour: 7, endHour: 16 },
  { name: "New York", startHour: 12, endHour: 21 },
];

const getNextUtcTime = (base: Date, hour: number, minute = 0) => {
  const d = new Date(base);
  d.setUTCHours(hour, minute, 0, 0);
  if (d <= base) d.setUTCDate(d.getUTCDate() + 1);
  return d;
};

const getActiveSessionClose = (now: Date) => {
  const hour = now.getUTCHours() + now.getUTCMinutes() / 60;

  for (const s of SESSIONS) {
    const overnight = s.startHour > s.endHour;
    const active = overnight ? hour >= s.startHour || hour < s.endHour : hour >= s.startHour && hour < s.endHour;
    if (!active) continue;

    // Close time is always the next occurrence of endHour.
    const close = getNextUtcTime(now, s.endHour, 0);
    return { session: s.name, close };
  }
  return null;
};

const getOverlapCountdown = (now: Date) => {
  // Overlaps we care about (UTC)
  // Tokyo/London: 07:00–09:00
  // London/NY: 12:00–16:00
  const hour = now.getUTCHours() + now.getUTCMinutes() / 60;

  const overlaps = [
    { label: "Tokyo/London", start: 7, end: 9 },
    { label: "London/NY", start: 12, end: 16 },
  ] as const;

  for (const o of overlaps) {
    const isActive = hour >= o.start && hour < o.end;
    if (isActive) {
      const endAt = getNextUtcTime(now, o.end, 0);
      return { message: `${o.label} overlap ends in`, target: endAt, kind: "end" as const };
    }

    // Upcoming (always show next start if not active)
    const startAt = getNextUtcTime(now, o.start, 0);
    return { message: `${o.label} overlap starts in`, target: startAt, kind: "start" as const };
  }

  return null;
};

const getNextHighImpactNews = (now: Date) => {
  const events = getEconomicEvents();
  const next = events
    .map((e) => ({ event: e, at: e.getNextOccurrence() }))
    .filter((x): x is { event: EconomicEvent; at: Date } => Boolean(x.at))
    .filter((x) => x.at.getTime() > now.getTime())
    .sort((a, b) => a.at.getTime() - b.at.getTime())[0];

  return next ?? null;
};

const getSessionCountdowns = (): CountdownInfo[] => {
  const now = new Date();
  const marketOpen = isForexMarketOpen(now);

  // 1) Session close (always show when market open)
  const activeClose = marketOpen ? getActiveSessionClose(now) : null;
  const sessionMs = activeClose ? activeClose.close.getTime() - now.getTime() : null;

  // 2) Overlap (active or next overlap start)
  const overlap = marketOpen ? getOverlapCountdown(now) : null;
  const overlapMs = overlap ? overlap.target.getTime() - now.getTime() : null;

  // 3) High-impact news (always show next event)
  const news = getNextHighImpactNews(now);
  const newsMs = news ? news.at.getTime() - now.getTime() : null;

  const indicators: CountdownInfo[] = [
    {
      type: "session",
      icon: "clock",
      priority: 0,
      message: activeClose ? `${activeClose.session} closes in` : "Session close",
      timeLeft: sessionMs !== null && sessionMs > 0 ? formatCountdown(sessionMs) : "—",
    },
    {
      type: "news",
      icon: "alert",
      priority: 0,
      message: news ? `${news.event.shortName} in` : "High-impact news",
      timeLeft: newsMs !== null && newsMs > 0 ? formatCountdown(newsMs) : "—",
    },
    {
      type: "overlap",
      icon: "zap",
      priority: 0,
      message: overlap ? overlap.message : "Session overlap",
      timeLeft: overlapMs !== null && overlapMs > 0 ? formatCountdown(overlapMs) : "—",
    },
  ];

  // If market is closed, keep the same 3-pill structure but don't show session/overlap timers.
  if (!marketOpen) {
    return indicators.map((i) => (i.type === "news" ? i : { ...i, timeLeft: "—" }));
  }

  return indicators;
};

interface SessionCountdownProps {
  compact?: boolean;
}

export const SessionCountdown = ({ compact = false }: SessionCountdownProps) => {
  const [countdowns, setCountdowns] = useState<CountdownInfo[]>([]);

  useEffect(() => {
    const updateCountdowns = () => {
      setCountdowns(getSessionCountdowns());
    };

    updateCountdowns();
    const interval = setInterval(updateCountdowns, 1000);

    return () => clearInterval(interval);
  }, []);

  if (countdowns.length === 0) return null;

  const getIcon = (item: CountdownInfo) => {
    switch (item.icon || item.type) {
      case "zap":
      case "overlap":
        return <Zap className="w-3 h-3" />;
      case "alert":
      case "news":
        return <AlertTriangle className="w-3 h-3" />;
      case "calendar":
        return <Calendar className="w-3 h-3" />;
      default:
        return <Clock className="w-3 h-3" />;
    }
  };

  const getColors = (item: CountdownInfo) => {
    const isEmpty = item.timeLeft === "—";

    if (item.type === "news") {
      if (isEmpty) return "text-muted-foreground bg-muted/30 border-border/30";
      return "text-warning bg-warning/10 border-warning/30";
    }
    if (item.type === "overlap") {
      if (isEmpty) return "text-muted-foreground bg-muted/30 border-border/30";
      return "text-success bg-success/10 border-success/30";
    }

    // session
    if (isEmpty) return "text-muted-foreground bg-muted/30 border-border/30";
    return "text-foreground bg-muted/30 border-border/50";
  };

  return (
    <div className="flex items-center gap-1.5 lg:gap-2">
      {countdowns.map((countdown, index) => (
        <div
          key={index}
          className={`flex items-center gap-1 lg:gap-1.5 px-1.5 lg:px-2.5 py-1 lg:py-1.5 rounded-md border transition-all ${getColors(countdown)} ${compact ? 'text-[9px]' : 'text-[10px] lg:text-[11px]'}`}
        >
          <span className={compact ? 'hidden' : 'block'}>{getIcon(countdown)}</span>
          <span className="opacity-90 truncate max-w-[60px] lg:max-w-none">{countdown.message}</span>
          <span className="font-mono font-semibold tabular-nums">{countdown.timeLeft}</span>
        </div>
      ))}
    </div>
  );
};
