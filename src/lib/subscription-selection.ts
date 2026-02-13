import { Subscription } from "@/types/database";

export const isSubscriptionActiveNow = (
  sub: Subscription,
  now: Date = new Date(),
): boolean => {
  if (sub.status !== "active") return false;
  if (!sub.expires_at) return true;
  return new Date(sub.expires_at) > now;
};

export const pickPrimarySubscription = (
  subs: Subscription[],
  now: Date = new Date(),
): Subscription | undefined => {
  if (!subs.length) return undefined;

  const active = subs
    .filter((sub) => isSubscriptionActiveNow(sub, now))
    .sort((a, b) => {
      const aExp = a.expires_at
        ? new Date(a.expires_at).getTime()
        : Number.MAX_SAFE_INTEGER;
      const bExp = b.expires_at
        ? new Date(b.expires_at).getTime()
        : Number.MAX_SAFE_INTEGER;
      return bExp - aExp;
    });
  if (active.length > 0) return active[0];

  const pending = subs
    .filter((sub) => sub.status === "pending")
    .sort(
      (a, b) =>
        new Date(b.updated_at || b.created_at).getTime() -
        new Date(a.updated_at || a.created_at).getTime(),
    );
  if (pending.length > 0) return pending[0];

  return [...subs].sort(
    (a, b) =>
      new Date(b.updated_at || b.created_at).getTime() -
      new Date(a.updated_at || a.created_at).getTime(),
  )[0];
};
