import { describe, expect, it } from "vitest";
import { Subscription } from "@/types/database";
import {
  isSubscriptionActiveNow,
  pickPrimarySubscription,
} from "@/lib/subscription-selection";

const baseSubscription = (overrides: Partial<Subscription>): Subscription => ({
  id: overrides.id ?? "sub-default",
  user_id: overrides.user_id ?? "user-1",
  status: overrides.status ?? "inactive",
  starts_at: overrides.starts_at ?? null,
  expires_at: overrides.expires_at ?? null,
  package_id: overrides.package_id ?? null,
  payment_id: overrides.payment_id ?? null,
  provider: overrides.provider ?? "manual",
  provider_subscription_id: overrides.provider_subscription_id ?? null,
  provider_customer_id: overrides.provider_customer_id ?? null,
  created_at: overrides.created_at ?? "2026-01-01T00:00:00.000Z",
  updated_at: overrides.updated_at ?? "2026-01-01T00:00:00.000Z",
});

describe("subscription selection", () => {
  it("treats active future-expiring subscription as active now", () => {
    const now = new Date("2026-01-10T12:00:00.000Z");
    const sub = baseSubscription({
      status: "active",
      expires_at: "2026-01-11T00:00:00.000Z",
    });

    expect(isSubscriptionActiveNow(sub, now)).toBe(true);
  });

  it("treats active past-expired subscription as inactive", () => {
    const now = new Date("2026-01-10T12:00:00.000Z");
    const sub = baseSubscription({
      status: "active",
      expires_at: "2026-01-09T00:00:00.000Z",
    });

    expect(isSubscriptionActiveNow(sub, now)).toBe(false);
  });

  it("prefers the active subscription with the furthest expiry", () => {
    const now = new Date("2026-01-10T12:00:00.000Z");
    const older = baseSubscription({
      id: "sub-old",
      status: "active",
      expires_at: "2026-01-20T00:00:00.000Z",
      updated_at: "2026-01-10T01:00:00.000Z",
    });
    const newer = baseSubscription({
      id: "sub-new",
      status: "active",
      expires_at: "2026-02-20T00:00:00.000Z",
      updated_at: "2026-01-10T02:00:00.000Z",
    });

    const picked = pickPrimarySubscription([older, newer], now);
    expect(picked?.id).toBe("sub-new");
  });

  it("falls back to newest pending when no active subscription exists", () => {
    const now = new Date("2026-01-10T12:00:00.000Z");
    const pendingOld = baseSubscription({
      id: "pending-old",
      status: "pending",
      updated_at: "2026-01-10T01:00:00.000Z",
    });
    const pendingNew = baseSubscription({
      id: "pending-new",
      status: "pending",
      updated_at: "2026-01-10T03:00:00.000Z",
    });
    const inactive = baseSubscription({
      id: "inactive",
      status: "inactive",
      updated_at: "2026-01-10T04:00:00.000Z",
    });

    const picked = pickPrimarySubscription([inactive, pendingOld, pendingNew], now);
    expect(picked?.id).toBe("pending-new");
  });

  it("falls back to newest record when neither active nor pending exists", () => {
    const now = new Date("2026-01-10T12:00:00.000Z");
    const oldInactive = baseSubscription({
      id: "inactive-old",
      status: "inactive",
      updated_at: "2026-01-10T01:00:00.000Z",
    });
    const newInactive = baseSubscription({
      id: "inactive-new",
      status: "inactive",
      updated_at: "2026-01-10T02:00:00.000Z",
    });

    const picked = pickPrimarySubscription([oldInactive, newInactive], now);
    expect(picked?.id).toBe("inactive-new");
  });
});
