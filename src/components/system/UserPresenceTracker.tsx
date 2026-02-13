import { useTrackUserPresence } from "@/hooks/useRealtimePresence";

export const UserPresenceTracker = () => {
  useTrackUserPresence();
  return null;
};
