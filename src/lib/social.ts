export type SocialPlatform = "facebook" | "twitter" | "instagram" | "telegram" | "discord";

const PLATFORM_BASE: Record<SocialPlatform, string> = {
  facebook: "https://facebook.com/",
  twitter: "https://x.com/",
  instagram: "https://instagram.com/",
  telegram: "https://t.me/",
  // Discord links can be many shapes; defaulting a bare handle to an invite-style URL.
  discord: "https://discord.gg/",
};

/**
 * Normalizes user-entered social values into a safe absolute URL.
 *
 * Accepts:
 * - Full URLs: https://instagram.com/brand
 * - Domain paths without scheme: instagram.com/brand
 * - Handles: brand, @brand
 * - Loose paths: telegram/brand (we treat as handle and build platform URL)
 */
export const buildSocialUrl = (
  value: string | null | undefined,
  platform: SocialPlatform
): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  // Already absolute
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;

  // If it looks like a real domain, just add scheme.
  // (Handles like "nomeriq" will not match this branch.)
  if (trimmed.includes(".")) {
    return `https://${trimmed.replace(/^\/+/, "")}`;
  }

  // Treat as handle: take the last path segment, strip '@'
  const handle = trimmed
    .replace(/^@/, "")
    .split("/")
    .filter(Boolean)
    .pop();

  if (!handle) return null;
  return `${PLATFORM_BASE[platform]}${handle}`;
};
