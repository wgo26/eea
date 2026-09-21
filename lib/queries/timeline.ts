import "server-only";

import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import { CACHE_TAGS, PUBLIC_CONTENT_REVALIDATE_SECONDS } from "@/lib/cache/tags";
import type { Locale } from "@/lib/i18n";

export type TimelineEntry = {
    id: string;
    contentItemId: string;
    timestamp: string;
    title: string;
    body: string;
    locale: string;
    isPublished: boolean;
    sortOrder: number;
    createdBy: string | null;
    createdAt: string;
    updatedAt: string;
};

export type TimelineEntryWithContent = TimelineEntry & {
    contentItem: {
        id: string;
        type: string;
        slug: string;
        status: string;
        verification: string | null;
        publishedAt: string | null;
        layoutTemplate: string;
    };
};

type QueryResult<T> = {
    data: T | null;
    count: number | null;
    error: { message: string } | null;
};

type TimelineEntryRow = {
    id: string;
    content_item_id: string;
    timestamp: string;
    title: string;
    body: string;
    locale: string;
    is_published: boolean;
    sort_order: number;
    created_by: string | null;
    created_at: string;
    updated_at: string;
};

type TimelineEntryWithContentRow = TimelineEntryRow & {
    content_item: {
        id: string;
        type: string;
        slug: string;
        status: string;
        verification: string | null;
        published_at: string | null;
        layout_template: string;
    } | null;
};

/** Never let a DB hiccup take the page down — every query resolves to a fallback. */
async function safe<T>(
    promise: PromiseLike<{
        data: T | null;
        count?: number | null;
        error: { message: string } | null;
    }>,
): Promise<QueryResult<T>> {
    try {
        const { data, count, error } = await promise;
        if (error) {
            logger.error("timeline", "query failed", { error: error.message });
            return { data: null, count: null, error };
        }
        return { data, count: count ?? null, error: null };
    } catch (err) {
        logger.error("timeline", "query exception", { error: err instanceof Error ? err.message : String(err) });
        return { data: null, count: null, error: { message: String(err) } };
    }
}

/** The admin client is only usable when the service key is configured. */
function hasDatabase(): boolean {
    return Boolean(
        process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
    );
}

/** Cached query error policy. */
function logCacheFailure(fn: string, err: unknown): void {
    logger.error("timeline", `cached query failed (${fn})`, {
        error: err instanceof Error ? err.message : String(err),
    });
}

/** Maps database snake_case row to camelCase TimelineEntry. */
function mapTimelineEntry(row: TimelineEntryRow): TimelineEntry {
    return {
        id: row.id,
        contentItemId: row.content_item_id,
        timestamp: row.timestamp,
        title: row.title,
        body: row.body,
        locale: row.locale,
        isPublished: row.is_published,
        sortOrder: row.sort_order,
        createdBy: row.created_by,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

/** Maps database row with content_item to TimelineEntryWithContent. */
function mapTimelineEntryWithContent(row: TimelineEntryWithContentRow): TimelineEntryWithContent {
    const entry = mapTimelineEntry(row);
    const contentItem = row.content_item ? {
        id: row.content_item.id,
        type: row.content_item.type,
        slug: row.content_item.slug,
        status: row.content_item.status,
        verification: row.content_item.verification,
        publishedAt: row.content_item.published_at,
        layoutTemplate: row.content_item.layout_template,
    } : undefined;
    return {
        ...entry,
        contentItem: contentItem as TimelineEntryWithContent["contentItem"],
    };
}

/** Fetches all timeline entries for a content item, ordered by timestamp. */
export async function getTimelineEntries(
    contentItemId: string,
    locale: Locale = "en",
    publishedOnly = true
): Promise<TimelineEntry[]> {
    if (!hasDatabase()) return [];
    try {
        return await getCachedTimelineEntries(contentItemId, locale, publishedOnly);
    } catch (err) {
        logCacheFailure("getTimelineEntries", err);
        return [];
    }
}

const getCachedTimelineEntries = unstable_cache(
    async (contentItemId: string, locale: Locale, publishedOnly: boolean): Promise<TimelineEntry[]> => {
        let query = createAdminClient()
            .from("timeline_entries")
            .select("*")
            .eq("content_item_id", contentItemId)
            .order("timestamp", { ascending: true })
            .order("sort_order", { ascending: true });

        if (publishedOnly) {
            query = query.eq("is_published", true);
        }

        if (locale) {
            query = query.eq("locale", locale);
        }

        const { data, error } = await safe(query);
        if (error) throw new Error(error.message);
        return (data ?? []).map(mapTimelineEntry);
    },
    ["timeline-entries"],
    { tags: [CACHE_TAGS.news], revalidate: PUBLIC_CONTENT_REVALIDATE_SECONDS },
);

/** Fetches a single timeline entry by ID. */
export async function getTimelineEntryById(id: string): Promise<TimelineEntry | null> {
    if (!hasDatabase()) return null;
    try {
        const { data, error } = await safe(
            createAdminClient()
                .from("timeline_entries")
                .select("*")
                .eq("id", id)
                .limit(1),
        );
        if (error) throw new Error(error.message);
        const row = (data as TimelineEntryRow[])?.[0];
        return row ? mapTimelineEntry(row) : null;
    } catch (err) {
        logCacheFailure("getTimelineEntryById", err);
        return null;
    }
}

/** Fetches timeline entries with their content item for admin views. */
export async function getTimelineEntriesWithContent(
    contentItemId: string,
    locale: Locale = "en"
): Promise<TimelineEntryWithContent[]> {
    if (!hasDatabase()) return [];
    try {
        return await getCachedTimelineEntriesWithContent(contentItemId, locale);
    } catch (err) {
        logCacheFailure("getTimelineEntriesWithContent", err);
        return [];
    }
}

const getCachedTimelineEntriesWithContent = unstable_cache(
    async (contentItemId: string, locale: Locale): Promise<TimelineEntryWithContent[]> => {
        const { data, error } = await safe(
            createAdminClient()
                .from("timeline_entries")
                .select(`
                    *,
                    content_item:content_items!content_item_id (
                        id, type, slug, status, verification, published_at, layout_template
                    )
                `)
                .eq("content_item_id", contentItemId)
                .order("timestamp", { ascending: true })
                .order("sort_order", { ascending: true }),
        );
        if (error) throw new Error(error.message);
        return (data ?? []).map(mapTimelineEntryWithContent);
    },
    ["timeline-entries-with-content"],
    { tags: [CACHE_TAGS.news], revalidate: PUBLIC_CONTENT_REVALIDATE_SECONDS },
);

/** Fetches the latest timeline entry across all content items (for homepage "developing" stories). */
export async function getLatestTimelineEntries(
    locale: Locale = "en",
    limit = 10
): Promise<TimelineEntryWithContent[]> {
    if (!hasDatabase()) return [];
    try {
        return await getCachedLatestTimelineEntries(locale, limit);
    } catch (err) {
        logCacheFailure("getLatestTimelineEntries", err);
        return [];
    }
}

const getCachedLatestTimelineEntries = unstable_cache(
    async (locale: Locale, limit: number): Promise<TimelineEntryWithContent[]> => {
        const { data, error } = await safe(
            createAdminClient()
                .from("timeline_entries")
                .select(`
                    *,
                    content_item:content_items!content_item_id (
                        id, type, slug, status, verification, published_at, layout_template
                    )
                `)
                .eq("is_published", true)
                .eq("locale", locale)
                .order("timestamp", { ascending: false })
                .limit(limit),
        );
        if (error) throw new Error(error.message);
        return (data ?? []).map(mapTimelineEntryWithContent);
    },
    ["latest-timeline-entries"],
    { tags: [CACHE_TAGS.news], revalidate: PUBLIC_CONTENT_REVALIDATE_SECONDS },
);

/** Creates a new timeline entry (admin only). */
export async function createTimelineEntry(
    contentItemId: string,
    entry: Omit<TimelineEntry, "id" | "createdAt" | "updatedAt"> & { locale: Locale }
): Promise<TimelineEntry | null> {
    if (!hasDatabase()) return null;
    try {
        const { data, error } = await safe(
            createAdminClient()
                .from("timeline_entries")
                .insert({
                    content_item_id: contentItemId,
                    timestamp: entry.timestamp,
                    title: entry.title,
                    body: entry.body,
                    locale: entry.locale,
                    is_published: entry.isPublished,
                    sort_order: entry.sortOrder,
                    created_by: entry.createdBy,
                })
                .select("*")
                .single(),
        );
        if (error) throw new Error(error.message);
        if (!data) return null;
        return mapTimelineEntry(data as TimelineEntryRow);
    } catch (err) {
        logger.error("timeline", "createTimelineEntry failed", { error: err instanceof Error ? err.message : String(err) });
        return null;
    }
}

/** Updates a timeline entry (admin only). */
export async function updateTimelineEntry(
    id: string,
    updates: Partial<Omit<TimelineEntry, "id" | "createdAt" | "updatedAt">>
): Promise<TimelineEntry | null> {
    if (!hasDatabase()) return null;
    try {
        // Convert camelCase to snake_case for database (concrete shape —
        // the generated types reject index-signature update payloads).
        const dbUpdates: {
            content_item_id?: string;
            timestamp?: string;
            title?: string;
            body?: string;
            locale?: string;
            is_published?: boolean;
            sort_order?: number;
            created_by?: string | null;
        } = {};
        if (updates.contentItemId !== undefined) dbUpdates.content_item_id = updates.contentItemId;
        if (updates.timestamp !== undefined) dbUpdates.timestamp = updates.timestamp;
        if (updates.title !== undefined) dbUpdates.title = updates.title;
        if (updates.body !== undefined) dbUpdates.body = updates.body;
        if (updates.locale !== undefined) dbUpdates.locale = updates.locale;
        if (updates.isPublished !== undefined) dbUpdates.is_published = updates.isPublished;
        if (updates.sortOrder !== undefined) dbUpdates.sort_order = updates.sortOrder;
        if (updates.createdBy !== undefined) dbUpdates.created_by = updates.createdBy;

        const { data, error } = await safe(
            createAdminClient()
                .from("timeline_entries")
                .update(dbUpdates)
                .eq("id", id)
                .select("*")
                .single(),
        );
        if (error) throw new Error(error.message);
        if (!data) return null;
        return mapTimelineEntry(data as TimelineEntryRow);
    } catch (err) {
        logger.error("timeline", "updateTimelineEntry failed", { error: err instanceof Error ? err.message : String(err) });
        return null;
    }
}

/** Deletes a timeline entry (admin only). */
export async function deleteTimelineEntry(id: string): Promise<boolean> {
    if (!hasDatabase()) return false;
    try {
        const { error } = await safe(
            createAdminClient()
                .from("timeline_entries")
                .delete()
                .eq("id", id),
        );
        if (error) throw new Error(error.message);
        return true;
    } catch (err) {
        logger.error("timeline", "deleteTimelineEntry failed", { error: err instanceof Error ? err.message : String(err) });
        return false;
    }
}

/** Reorders timeline entries (admin only). */
export async function reorderTimelineEntries(
    entries: { id: string; sortOrder: number }[]
): Promise<boolean> {
    if (!hasDatabase()) return false;
    try {
        const supabase = createAdminClient();
        for (const entry of entries) {
            const { error } = await safe(
                supabase
                    .from("timeline_entries")
                    .update({ sort_order: entry.sortOrder })
                    .eq("id", entry.id),
            );
            if (error) throw new Error(error.message);
        }
        return true;
    } catch (err) {
        logger.error("timeline", "reorderTimelineEntries failed", { error: err instanceof Error ? err.message : String(err) });
        return false;
    }
}