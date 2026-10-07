import "server-only";

import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import { CACHE_TAGS, PUBLIC_CONTENT_REVALIDATE_SECONDS } from "@/lib/cache/tags";
import type { StreamProvider } from "./stream";

export type BroadcastStatus = "scheduled" | "live" | "ended";

export type Broadcast = {
  id: string;
  contentItemId: string;
  status: BroadcastStatus;
  provider: StreamProvider;
  streamUrl: string | null;
  recordingUrl: string | null;
  recapId: string | null;
  recapHref: string | null;
  recapTitle: string | null;
  chatEnabled: boolean;
  startedAt: string | null;
  endedAt: string | null;
};

/** Public route for a recap story, by its content type (mirrors sitemap segments). */
function recapHrefFor(type: string, slug: string): string {
  switch (type) {
    case "photo_story":
      return `/photo-stories/${slug}`;
    case "culture":
      return `/culture/${slug}`;
    case "listing":
      return `/buy-sell/${slug}`;
    case "notice":
      return `/notices/${slug}`;
    case "news":
    case "micro_story":
    default:
      return `/news/${slug}`;
  }
}

export type ChatMessage = {
  id: string;
  body: string;
  createdAt: string;
  authorName: string | null;
  isHidden: boolean;
};

function hasDatabase(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

function logCacheFailure(fn: string, err: unknown) {
  logger.warn("live/queries", `${fn} failed, returning fallback`, {
    error: err instanceof Error ? err.message : String(err),
  });
}

type RawBroadcastRow = {
  id: string;
  content_item_id: string;
  status: string;
  provider: string;
  stream_url: string | null;
  recording_url: string | null;
  recap_content_item_id: string | null;
  chat_enabled: boolean;
  started_at: string | null;
  ended_at: string | null;
};

function toBroadcast(
  row: RawBroadcastRow,
  recap: { href: string | null; title: string | null } = { href: null, title: null },
): Broadcast | null {
  if (row.status !== "scheduled" && row.status !== "live" && row.status !== "ended") return null;
  return {
    id: row.id,
    contentItemId: row.content_item_id,
    status: row.status,
    provider: (row.provider === "facebook" || row.provider === "native" ? row.provider : "youtube") as StreamProvider,
    streamUrl: row.stream_url,
    recordingUrl: row.recording_url,
    recapId: row.recap_content_item_id,
    recapHref: recap.href,
    recapTitle: recap.title,
    chatEnabled: row.chat_enabled,
    startedAt: row.started_at,
    endedAt: row.ended_at,
  };
}

const BROADCAST_SELECT = `id, content_item_id, status, provider, stream_url, recording_url,
  recap_content_item_id, chat_enabled, started_at, ended_at`;

/** One event's broadcast (null when the event has never gone live). */
const getCachedBroadcast = unstable_cache(
  async (contentItemId: string): Promise<Broadcast | null> => {
    const { data, error } = await createAdminClient()
      .from("event_broadcasts")
      .select(BROADCAST_SELECT)
      .eq("content_item_id", contentItemId)
      .limit(1);
    if (error) throw new Error(error.message);
    const row = ((data ?? []) as unknown as RawBroadcastRow[])[0];
    if (!row) return null;
    let recap: { href: string | null; title: string | null } = { href: null, title: null };
    if (row.recap_content_item_id) {
      const { data: recapRows } = await createAdminClient()
        .from("content_items")
        .select("slug, type")
        .eq("id", row.recap_content_item_id)
        .eq("status", "published")
        .limit(1);
      const recapRow = ((recapRows ?? []) as { slug: string | null; type: string }[])[0];
      if (recapRow?.slug) {
        const { data: titles } = await createAdminClient()
          .from("content_translations")
          .select("title")
          .eq("content_item_id", row.recap_content_item_id)
          .eq("locale", "en")
          .limit(1);
        recap = {
          href: recapHrefFor(recapRow.type, recapRow.slug),
          title: ((titles ?? []) as { title: string | null }[])[0]?.title ?? null,
        };
      }
    }
    return toBroadcast(row, recap);
  },
  ["live-broadcast"],
  { tags: [CACHE_TAGS.culture], revalidate: PUBLIC_CONTENT_REVALIDATE_SECONDS },
);

export async function getBroadcastForEvent(
  contentItemId: string,
): Promise<Broadcast | null> {
  if (!hasDatabase()) return null;
  try {
    return await getCachedBroadcast(contentItemId);
  } catch (err) {
    logCacheFailure("getBroadcastForEvent", err);
    return null;
  }
}

/** content_item_id → live/scheduled broadcast status (drives LIVE badges). */
const getCachedBroadcastMap = unstable_cache(
  async (): Promise<Record<string, BroadcastStatus>> => {
    const { data, error } = await createAdminClient()
      .from("event_broadcasts")
      .select("content_item_id, status")
      .in("status", ["scheduled", "live"]);
    if (error) throw new Error(error.message);
    const map: Record<string, BroadcastStatus> = {};
    for (const row of (data ?? []) as { content_item_id: string; status: string }[]) {
      if (row.status === "live" || row.status === "scheduled") map[row.content_item_id] = row.status;
    }
    return map;
  },
  ["live-broadcast-map"],
  { tags: [CACHE_TAGS.culture], revalidate: PUBLIC_CONTENT_REVALIDATE_SECONDS },
);

export async function getBroadcastMap(): Promise<Record<string, BroadcastStatus>> {
  if (!hasDatabase()) return {};
  try {
    return await getCachedBroadcastMap();
  } catch (err) {
    logCacheFailure("getBroadcastMap", err);
    return {};
  }
}

/** RSVP headcount for an event (aggregated service-side; no PII leaks). */
export async function getRsvpCount(contentItemId: string): Promise<number> {
  if (!hasDatabase()) return 0;
  try {
    const { count, error } = await createAdminClient()
      .from("event_rsvps")
      .select("user_id", { count: "exact", head: true })
      .eq("content_item_id", contentItemId);
    if (error) throw new Error(error.message);
    return count ?? 0;
  } catch (err) {
    logCacheFailure("getRsvpCount", err);
    return 0;
  }
}
