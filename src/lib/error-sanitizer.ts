export const getSafeErrorMessage = (
  raw: unknown,
  fallback = "Something went wrong. Please try again."
): string => {
  const message =
    typeof raw === "string"
      ? raw
      : raw instanceof Error
      ? raw.message
      : typeof raw === "object" && raw && "message" in raw
      ? String((raw as { message?: unknown }).message ?? "")
      : "";

  const normalized = message.toLowerCase();

  if (!normalized) return fallback;

  if (
    normalized.includes("user already registered") ||
    normalized.includes("already registered") ||
    normalized.includes("email address is already registered") ||
    normalized.includes("already been registered")
  ) {
    return "This email is already registered. Please sign in instead.";
  }

  // Never expose backend/internal details directly.
  if (
    normalized.includes("edge function") ||
    normalized.includes("invalid jwt") ||
    normalized.includes("jwt") ||
    normalized.includes("sqlstate") ||
    normalized.includes("permission denied") ||
    normalized.includes("stack") ||
    normalized.includes("trace")
  ) {
    return "Your session is invalid or expired. Please sign in again.";
  }

  if (normalized.includes("network") || normalized.includes("fetch")) {
    return "Network issue detected. Please check your connection and try again.";
  }

  if (normalized.includes("no such price")) {
    return "Payment configuration is incomplete for this plan. Please contact support.";
  }

  if (normalized.includes("unauthorized") || normalized.includes("forbidden")) {
    return "You are not authorized for this action.";
  }

  return fallback;
};
