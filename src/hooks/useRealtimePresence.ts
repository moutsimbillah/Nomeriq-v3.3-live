import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const HEARTBEAT_MS = 10000;
const OVERVIEW_POLL_MS = 15000;
const SESSION_STORAGE_KEY = "presence_session_id";

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

  useEffect(() => {
    if (!user?.id) return;

    const sessionId = getOrCreateSessionId();
    const startedAt = new Date().toISOString();
    const sendHeartbeat = async () => {
      const nowIso = new Date().toISOString();
      const { error } = await (supabase.rpc as any)("upsert_user_presence_session", {
        p_session_id: sessionId,
        p_started_at: startedAt,
        p_last_seen_at: nowIso,
      });
      if (error && import.meta.env.DEV) {
        console.debug("[presence] heartbeat failed", error);
      }
    };

    const sendLeave = async () => {
      const nowIso = new Date().toISOString();
      const { error } = await (supabase.rpc as any)("close_user_presence_session", {
        p_session_id: sessionId,
        p_ended_at: nowIso,
      });
      if (error && import.meta.env.DEV) {
        console.debug("[presence] close failed", error);
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void sendHeartbeat();
      }
    };

    const onPageHide = () => {
      void sendLeave();
    };

    void sendHeartbeat();
    intervalRef.current = window.setInterval(() => {
      void sendHeartbeat();
    }, HEARTBEAT_MS);

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("beforeunload", onPageHide);
    window.addEventListener("pagehide", onPageHide);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("beforeunload", onPageHide);
      window.removeEventListener("pagehide", onPageHide);
      void sendLeave();
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [user?.id]);
};

type PresenceOverviewRow = {
  online_user_ids?: string[] | null;
  online_users?: number | string | null;
  offline_users?: number | string | null;
  avg_session_seconds?: number | string | null;
};

const parsePresenceNumber = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

export const usePresenceOverview = (totalUsers = 0) => {
  const [isLoading, setIsLoading] = useState(true);
  const [onlineUsers, setOnlineUsers] = useState(0);
  const [onlineUserIds, setOnlineUserIds] = useState<string[]>([]);
  const [avgSessionSeconds, setAvgSessionSeconds] = useState(0);
  const [offlineUsersFromServer, setOfflineUsersFromServer] = useState<number | null>(null);
  const requestSeqRef = useRef(0);

  const fetchPresenceOverview = useCallback(async () => {
    const requestId = ++requestSeqRef.current;

    try {
      const { data, error } = await (supabase.rpc as any)("get_presence_overview", {
        p_total_users: Math.max(0, Number(totalUsers || 0)),
      });

      if (requestId !== requestSeqRef.current) return;
      if (error) throw error;

      const row = (Array.isArray(data) ? data[0] : data) as PresenceOverviewRow | null;
      if (!row) {
        setOnlineUsers(0);
        setOnlineUserIds([]);
        setAvgSessionSeconds(0);
        setOfflineUsersFromServer(Math.max(0, totalUsers));
        return;
      }

      const ids = Array.isArray(row.online_user_ids)
        ? row.online_user_ids.filter((v): v is string => typeof v === "string" && v.length > 0)
        : [];

      const online = Math.max(0, parsePresenceNumber(row.online_users));
      const offline =
        row.offline_users === null || row.offline_users === undefined
          ? null
          : Math.max(0, parsePresenceNumber(row.offline_users));

      setOnlineUserIds(ids);
      setOnlineUsers(online > 0 ? online : ids.length);
      setAvgSessionSeconds(Math.max(0, parsePresenceNumber(row.avg_session_seconds)));
      setOfflineUsersFromServer(offline);
    } catch (error) {
      if (import.meta.env.DEV) {
        console.debug("[presence] overview fetch failed", error);
      }
    } finally {
      if (requestId === requestSeqRef.current) {
        setIsLoading(false);
      }
    }
  }, [totalUsers]);

  useEffect(() => {
    setIsLoading(true);
    void fetchPresenceOverview();

    const timer = window.setInterval(() => {
      void fetchPresenceOverview();
    }, OVERVIEW_POLL_MS);

    return () => {
      clearInterval(timer);
    };
  }, [fetchPresenceOverview]);

  const offlineUsers = useMemo(
    () =>
      offlineUsersFromServer !== null
        ? offlineUsersFromServer
        : Math.max(0, totalUsers - onlineUsers),
    [offlineUsersFromServer, onlineUsers, totalUsers],
  );

  return {
    isLoading,
    onlineUsers,
    onlineUserIds,
    offlineUsers,
    avgSessionSeconds,
  };
};
