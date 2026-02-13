import { useEffect, useMemo, useRef, useState } from "react";
import { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const CHANNEL = "global-user-presence-broadcast";
const HEARTBEAT_MS = 10000;
const ONLINE_TTL_MS = 30000;
const SESSION_STORAGE_KEY = "presence_session_id";

type PresenceHeartbeat = {
  user_id: string;
  session_id: string;
  started_at: string;
  ts: string;
};

type PresenceLeave = {
  user_id: string;
  session_id: string;
  ts: string;
};

const getOrCreateSessionId = () => {
  const existing = sessionStorage.getItem(SESSION_STORAGE_KEY);
  if (existing) return existing;
  const created = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  sessionStorage.setItem(SESSION_STORAGE_KEY, created);
  return created;
};

export const useTrackUserPresence = () => {
  const { user } = useAuth();
  const intervalRef = useRef<number | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!user?.id) return;

    const sessionId = getOrCreateSessionId();
    const startedAt = new Date().toISOString();

    const channel = supabase.channel(CHANNEL);
    channelRef.current = channel;

    const sendHeartbeat = async () => {
      const payload: PresenceHeartbeat = {
        user_id: user.id,
        session_id: sessionId,
        started_at: startedAt,
        ts: new Date().toISOString(),
      };
      await channel.send({
        type: "broadcast",
        event: "presence_heartbeat",
        payload,
      });
    };

    const sendLeave = async () => {
      const payload: PresenceLeave = {
        user_id: user.id,
        session_id: sessionId,
        ts: new Date().toISOString(),
      };
      await channel.send({
        type: "broadcast",
        event: "presence_leave",
        payload,
      });
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void sendHeartbeat();
      }
    };

    channel.subscribe((status) => {
      if (status !== "SUBSCRIBED") return;
      void sendHeartbeat();
      intervalRef.current = window.setInterval(() => {
        void sendHeartbeat();
      }, HEARTBEAT_MS);
    });

    window.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("beforeunload", () => {
      void sendLeave();
    });

    return () => {
      window.removeEventListener("visibilitychange", onVisibility);
      void sendLeave();
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [user?.id]);
};

type SessionState = {
  userId: string;
  sessionId: string;
  startedAtMs: number;
  lastSeenMs: number;
};

export const usePresenceOverview = (totalUsers = 0) => {
  const [isLoading, setIsLoading] = useState(true);
  const [onlineUsers, setOnlineUsers] = useState(0);
  const [onlineUserIds, setOnlineUserIds] = useState<string[]>([]);
  const [avgSessionSeconds, setAvgSessionSeconds] = useState(0);
  const sessionsRef = useRef<Map<string, SessionState>>(new Map());

  useEffect(() => {
    const channel = supabase.channel(CHANNEL);
    let fallbackTimer: number | null = null;
    let recomputeTimer: number | null = null;

    const recompute = () => {
      const now = Date.now();
      const sessions = sessionsRef.current;

      for (const [key, session] of sessions.entries()) {
        if (now - session.lastSeenMs > ONLINE_TTL_MS) {
          sessions.delete(key);
        }
      }

      const userMinStarts = new Map<string, number>();
      for (const session of sessions.values()) {
        const prev = userMinStarts.get(session.userId);
        if (prev === undefined || session.startedAtMs < prev) {
          userMinStarts.set(session.userId, session.startedAtMs);
        }
      }

      let totalSeconds = 0;
      for (const startedAtMs of userMinStarts.values()) {
        totalSeconds += Math.max(0, Math.floor((now - startedAtMs) / 1000));
      }

      const count = userMinStarts.size;
      setOnlineUsers(count);
      setOnlineUserIds(Array.from(userMinStarts.keys()));
      setAvgSessionSeconds(count > 0 ? totalSeconds / count : 0);
      setIsLoading(false);
    };

    channel
      .on("broadcast", { event: "presence_heartbeat" }, ({ payload }) => {
        const data = payload as PresenceHeartbeat;
        if (!data?.user_id || !data?.session_id) return;
        const key = `${data.user_id}:${data.session_id}`;
        const startedAtMs = Date.parse(data.started_at || data.ts || "");
        const tsMs = Date.parse(data.ts || "");

        sessionsRef.current.set(key, {
          userId: data.user_id,
          sessionId: data.session_id,
          startedAtMs: Number.isFinite(startedAtMs) ? startedAtMs : Date.now(),
          lastSeenMs: Number.isFinite(tsMs) ? tsMs : Date.now(),
        });
        recompute();
      })
      .on("broadcast", { event: "presence_leave" }, ({ payload }) => {
        const data = payload as PresenceLeave;
        if (!data?.user_id || !data?.session_id) return;
        sessionsRef.current.delete(`${data.user_id}:${data.session_id}`);
        recompute();
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          recompute();
          return;
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          setIsLoading(false);
        }
      });

    recomputeTimer = window.setInterval(recompute, 2000);
    fallbackTimer = window.setTimeout(() => {
      setIsLoading(false);
      recompute();
    }, 3000);

    return () => {
      if (recomputeTimer) clearInterval(recomputeTimer);
      if (fallbackTimer) clearTimeout(fallbackTimer);
      supabase.removeChannel(channel);
    };
  }, []);

  const offlineUsers = useMemo(
    () => Math.max(0, totalUsers - onlineUsers),
    [onlineUsers, totalUsers],
  );

  return {
    isLoading,
    onlineUsers,
    onlineUserIds,
    offlineUsers,
    avgSessionSeconds,
  };
};
