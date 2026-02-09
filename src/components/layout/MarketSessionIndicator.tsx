import { useState, useEffect } from "react";

interface SessionInfo {
  name: string;
  color: string;
  activeColor: string;
  isActive: boolean;
}

const isForexMarketOpen = (): boolean => {
  const now = new Date();
  const utcDay = now.getUTCDay(); // 0 = Sunday, 6 = Saturday
  const utcHours = now.getUTCHours();
  const time = utcHours + now.getUTCMinutes() / 60;

  // Forex market is closed:
  // - All day Saturday (day 6)
  // - Sunday before 21:00 UTC (day 0, time < 21)
  // - Friday after 21:00 UTC (day 5, time >= 21)

  if (utcDay === 6) return false; // Saturday - closed
  if (utcDay === 0 && time < 21) return false; // Sunday before Sydney opens
  if (utcDay === 5 && time >= 21) return false; // Friday after NY closes

  return true;
};

const getMarketSessions = (): SessionInfo[] => {
  const now = new Date();
  const utcHours = now.getUTCHours();
  const utcMinutes = now.getUTCMinutes();
  const time = utcHours + utcMinutes / 60;

  const marketOpen = isForexMarketOpen();

  // Session times in UTC
  // Sydney: 21:00 - 06:00 UTC
  // Tokyo: 00:00 - 09:00 UTC  
  // London: 07:00 - 16:00 UTC
  // New York: 12:00 - 21:00 UTC

  const sessions: SessionInfo[] = [
    {
      name: "Sydney",
      color: "text-muted-foreground/60",
      activeColor: "text-blue-400",
      isActive: marketOpen && (time >= 21 || time < 6)
    },
    {
      name: "Tokyo",
      color: "text-muted-foreground/60",
      activeColor: "text-pink-400",
      isActive: marketOpen && (time >= 0 && time < 9)
    },
    {
      name: "London",
      color: "text-muted-foreground/60",
      activeColor: "text-emerald-400",
      isActive: marketOpen && (time >= 7 && time < 16)
    },
    {
      name: "NY",
      color: "text-muted-foreground/60",
      activeColor: "text-amber-400",
      isActive: marketOpen && (time >= 12 && time < 21)
    }
  ];

  return sessions;
};

export const MarketSessionIndicator = () => {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);

  useEffect(() => {
    const updateSession = () => {
      setSessions(getMarketSessions());
    };

    updateSession();
    const interval = setInterval(updateSession, 60000);

    return () => clearInterval(interval);
  }, []);

  const hasActiveSessions = sessions.some(s => s.isActive);

  return (
    <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-muted/30 border border-border/30">
      {/* Market Status Indicator */}
      <div className="flex items-center gap-1.5">
        <span className={`w-2 h-2 rounded-full ${hasActiveSessions ? 'bg-success animate-pulse' : 'bg-muted-foreground/40'}`} />
        <span className={`text-[10px] lg:text-[11px] font-medium uppercase tracking-wide ${hasActiveSessions ? 'text-success' : 'text-muted-foreground'}`}>
          {hasActiveSessions ? 'Live' : 'Closed'}
        </span>
      </div>

      <div className="h-3 w-px bg-border/50" />

      {/* Sessions */}
      <div className="flex items-center gap-1">
        {sessions.map((session, index) => (
          <div key={session.name} className="flex items-center">
            <span className={`text-[10px] lg:text-[11px] font-medium ${session.isActive ? session.activeColor : session.color}`}>
              {session.name}
              {session.isActive && (
                <span className="ml-1 inline-block w-1 h-1 rounded-full bg-current animate-pulse" />
              )}
            </span>
            {index < sessions.length - 1 && (
              <span className="mx-1 text-border/40 text-[10px]">•</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
