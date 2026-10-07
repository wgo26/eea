/**
 * Community live stream URL helpers — pure, client-safe.
 *
 * Embed-first by design (Phase 3): YouTube and Facebook Live URLs are
 * rewritten to their canonical player embeds; anything else is rejected so a
 * mistyped URL can never render a broken player. `native` (Mux/Livepeer
 * ingest) has no URL mapping here — it is gated by the `live.native_enabled`
 * app flag in the server action, which is the resource gate the admin app
 * surfaces before the feature can be enabled.
 */

export type StreamProvider = "youtube" | "facebook" | "native";

export const STREAM_PROVIDERS: StreamProvider[] = ["youtube", "facebook", "native"];

export function isStreamProvider(value: unknown): value is StreamProvider {
  return value === "youtube" || value === "facebook" || value === "native";
}

function youTubeId(url: string): string | null {
  const m = url.match(
    /(?:youtube\.com\/(?:watch\?[^#]*v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/i,
  );
  return m?.[1] ?? null;
}

/** True when the URL is a watchable stream page for the given provider. */
export function isAllowedStreamUrl(provider: StreamProvider, raw: string): boolean {
  const url = raw.trim();
  if (!/^https?:\/\//i.test(url)) return false;
  if (provider === "youtube") return youTubeId(url) !== null;
  if (provider === "facebook") {
    return /^https?:\/\/(www\.)?(facebook\.com|fb\.watch)\//i.test(url);
  }
  // Native ingest is configured with stream keys, never a watch URL — the
  // action rejects a URL for it so the form cannot imply it is playable.
  return false;
}

/**
 * Canonical player embed for an allowed stream URL, or null when the URL is
 * not playable (caller renders the honest fallback, never an empty iframe).
 */
export function streamEmbedUrl(provider: StreamProvider, raw: string): string | null {
  const url = raw.trim();
  if (provider === "youtube") {
    const id = youTubeId(url);
    return id ? `https://www.youtube.com/embed/${id}` : null;
  }
  if (provider === "facebook") {
    if (!isAllowedStreamUrl("facebook", url)) return null;
    return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url)}`;
  }
  return null;
}
