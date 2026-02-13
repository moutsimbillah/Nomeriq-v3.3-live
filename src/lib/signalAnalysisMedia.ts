import { supabase } from "@/integrations/supabase/client";
import { Signal } from "@/types/database";

const SIGNED_URL_TTL_SECONDS = 60 * 60;

const signedUrlCache = new Map<string, string>();
const resolveInFlight = new Map<string, Promise<string | null>>();
const imagePreloadCache = new Set<string>();

const extractStoragePath = (value: string): string | null => {
  if (!value) return null;
  if (!/^https?:\/\//i.test(value)) return value;

  const publicPrefix = "/storage/v1/object/public/signal-analysis/";
  const signedPrefix = "/storage/v1/object/sign/signal-analysis/";
  const marker = value.includes(publicPrefix)
    ? publicPrefix
    : value.includes(signedPrefix)
      ? signedPrefix
      : "";

  if (!marker) return null;
  const start = value.indexOf(marker);
  if (start < 0) return null;

  const pathWithQuery = value.slice(start + marker.length);
  return decodeURIComponent(pathWithQuery.split("?")[0]);
};

export const resolveAnalysisImageUrl = async (rawValue: string | null | undefined): Promise<string | null> => {
  if (!rawValue) return null;
  const raw = rawValue.trim();
  if (!raw) return null;

  const storagePath = extractStoragePath(raw);
  if (!storagePath) return raw;

  const cached = signedUrlCache.get(storagePath);
  if (cached) return cached;

  const inFlight = resolveInFlight.get(storagePath);
  if (inFlight) return inFlight;

  const request = (async () => {
    const { data, error } = await supabase.storage
      .from("signal-analysis")
      .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);

    if (error || !data?.signedUrl) {
      return /^https?:\/\//i.test(raw) ? raw : null;
    }

    signedUrlCache.set(storagePath, data.signedUrl);
    return data.signedUrl;
  })();

  resolveInFlight.set(storagePath, request);

  try {
    return await request;
  } finally {
    resolveInFlight.delete(storagePath);
  }
};

export const preloadAnalysisImageUrl = async (rawValue: string | null | undefined): Promise<void> => {
  const resolvedUrl = await resolveAnalysisImageUrl(rawValue);
  if (!resolvedUrl || imagePreloadCache.has(resolvedUrl)) return;

  imagePreloadCache.add(resolvedUrl);

  await new Promise<void>((resolve) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => resolve();
    img.src = resolvedUrl;
  });
};

export const preloadSignalAnalysisMedia = async (signal: Signal | null | undefined): Promise<void> => {
  if (!signal?.analysis_image_url) return;
  await preloadAnalysisImageUrl(signal.analysis_image_url);
};

