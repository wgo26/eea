import "server-only";

import { unstable_cache } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";
import { CACHE_TAGS, PUBLIC_CONTENT_REVALIDATE_SECONDS } from "@/lib/cache/tags";
import { logger } from "@/lib/observability/logger";

/**
 * The public correction register — the read side of the record's promise.
 *
 * `corrections` has been written since the first submission form: a reader
 * reports an error, an editor resolves it with a note. Nothing ever read it
 * back, so "Corrections are public policy — trust is built in the open" on
 * /about was a claim the data layer contradicted. This file is the door.
 *
 * PRIVACY CONTRACT — why this file is so explicit about columns:
 * `corrections` carries `reporter_id`, `reporter_name` and `reporter_email`.
 * None may ever reach an anonymous reader, so they are absent from
 * CORRECTION_SELECT, absent from the exported types, and therefore absent
 * from every call site. The DB mirrors this in the `published_corrections`
 * view (migration 20261113000000), which declares the same column set.
 *
 * WHY THE BASE TABLE AND NOT THE VIEW: generated `Database` types only cover
 * views when the generator runs against a live schema, so a view read breaks
 * `tsc` on DDL-only regeneration — the same trade-off documented on
 * getContentReactionState() (lib/public/actions.ts). These reads run on the
 * service-role client, which bypasses RLS by design, so the column list here
 * IS the filter. Keep it in step with the view; the RLS suite asserts the
 * view's shape, so the two cannot drift silently.
 */

/** One published correction, scoped to the story it fixes. */
export type PublicCorrection = {
    id: string;
    contentItemId: string;
    /** What the reader reported (deliberately public — see the migration). */
    correctionText: string;
    /** The editor's note on what changed. Null when none was written. */
    resolution: string | null;
    reportedAt: string | null;
    resolvedAt: string | null;
};

/** A register row plus enough story metadata to link to it. */
export type RegisterEntry = PublicCorrection & {
    contentSlug: string | null;
    contentType: string;
    contentTitle: string | null;
    /** Locale-free app path to the fixed story, resolved from its type. */
    contentHref: string | null;
};

/**
 * Detail-route segment per content type — the same mapping app/sitemap.ts
 * uses. Notices and listings resolve by id (their routes accept either),
 * everything else prefers the slug.
 */
const SEGMENT_BY_TYPE: Record<string, string> = {
    news: "/news",
    micro_story: "/news",
    photo_story: "/photo-stories",
    culture: "/culture",
    notice: "/notices",
    listing: "/buy-sell",
};

function hrefFor(type: string, slug: string | null, itemId: string): string | null {
    const segment = SEGMENT_BY_TYPE[type];
    if (!segment) return null;
    return `${segment}/${slug || itemId}`;
}

/** `!inner` so the embedded status/is_archived filters restrict parents. */
const CORRECTION_SELECT =
    "id, content_item_id, correction_text, resolution, created_at, resolved_at, " +
    "content:content_items!inner(slug, type, status, is_archived, " +
    "translations:content_translations(locale, title))";

type CorrectionContent = {
    slug: string | null;
    type: string;
    status: string;
    is_archived: boolean;
    translations?: { locale: string; title: string | null }[] | null;
};

type CorrectionRow = {
    id: string;
    content_item_id: string;
    correction_text: string;
    resolution: string | null;
    created_at: string | null;
    resolved_at: string | null;
    content?: CorrectionContent | CorrectionContent[] | null;
};

function hasDatabase(): boolean {
    return Boolean(
        process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
    );
}

function logCacheFailure(fn: string, err: unknown): void {
    logger.error("corrections", "cached query failed (" + fn + ")", {
        error: err instanceof Error ? err.message : String(err),
    });
}

/** Prefer the reader's locale; fall back to any title — never a blank row. */
function pickTitle(
    translations: { locale: string; title: string | null }[] | null | undefined,
    locale: string,
): string | null {
    const rows = translations ?? [];
    const preferred = rows.find((t) => t.locale === locale && t.title?.trim());
    if (preferred?.title) return preferred.title;
    return rows.find((t) => t.title?.trim())?.title ?? null;
}

function mapRow(row: CorrectionRow, locale: string): RegisterEntry {
    const content = Array.isArray(row.content) ? row.content[0] : row.content;
    const contentType = content?.type ?? "news";
    const contentSlug = content?.slug ?? null;
    return {
        id: row.id,
        contentItemId: row.content_item_id,
        correctionText: row.correction_text,
        resolution: row.resolution,
        reportedAt: row.created_at,
        resolvedAt: row.resolved_at,
        contentSlug,
        contentType,
        contentTitle: pickTitle(content?.translations, locale),
        contentHref: hrefFor(contentType, contentSlug, row.content_item_id),
    };
}

/**
 * Only corrections that are (a) resolved and (b) attached to live content are
 * publishable. `dismissed` stays private by editorial policy — see migration.
 * Embedded filters use the underlying relation name, not the select alias
 * (repo convention: `notices.notice_type` filters a `notices!inner(...)`).
 */

/**
 * Every published correction for one content item, newest fix first.
 * Backs the per-story "this story was corrected" block.
 */
export async function getCorrectionsForContent(
    contentItemId: string,
    locale = "en",
): Promise<PublicCorrection[]> {
    if (!hasDatabase() || !contentItemId) return [];
    try {
        return await getCachedForContent(contentItemId, locale);
    } catch (err) {
        logCacheFailure("getCorrectionsForContent", err);
        return [];
    }
}

const getCachedForContent = unstable_cache(
    async (contentItemId: string, locale: string): Promise<PublicCorrection[]> => {
        const supabase = createAdminClient();
        const { data, error } = await supabase
            .from("corrections")
            .select(CORRECTION_SELECT)
            .eq("content_item_id", contentItemId)
            .eq("status", "resolved")
            .eq("content_items.status", "published")
            .eq("content_items.is_archived", false)
            .order("resolved_at", { ascending: false });
        if (error) throw new Error(error.message);
        return ((data ?? []) as unknown as CorrectionRow[]).map((row) => mapRow(row, locale));
    },
    ["corrections-for-content"],
    { tags: [CACHE_TAGS.corrections], revalidate: PUBLIC_CONTENT_REVALIDATE_SECONDS },
);

/**
 * The site-wide register: published corrections, newest fix first.
 */
export async function getCorrectionRegister(options?: {
    limit?: number;
    locale?: string;
}): Promise<RegisterEntry[]> {
    if (!hasDatabase()) return [];
    const limit = Math.min(Math.max(options?.limit ?? 30, 1), 100);
    const locale = options?.locale ?? "en";
    try {
        return await getCachedRegister(locale, limit);
    } catch (err) {
        logCacheFailure("getCorrectionRegister", err);
        return [];
    }
}

const getCachedRegister = unstable_cache(
    async (locale: string, limit: number): Promise<RegisterEntry[]> => {
        const supabase = createAdminClient();
        const { data, error } = await supabase
            .from("corrections")
            .select(CORRECTION_SELECT)
            .eq("status", "resolved")
            .eq("content_items.status", "published")
            .eq("content_items.is_archived", false)
            .order("resolved_at", { ascending: false })
            .limit(limit);
        if (error) throw new Error(error.message);
        return ((data ?? []) as unknown as CorrectionRow[]).map((row) => mapRow(row, locale));
    },
    ["correction-register"],
    { tags: [CACHE_TAGS.corrections], revalidate: PUBLIC_CONTENT_REVALIDATE_SECONDS },
);

/** How many corrections have been made public in the last `days`. */
export async function getRecentCorrectionCount(days = 30): Promise<number> {
    if (!hasDatabase()) return 0;
    try {
        return await getCachedCorrectionCount(days);
    } catch (err) {
        logCacheFailure("getRecentCorrectionCount", err);
        return 0;
    }
}

const getCachedCorrectionCount = unstable_cache(
    async (days: number): Promise<number> => {
        const since = new Date(Date.now() - days * 86_400_000).toISOString();
        const supabase = createAdminClient();
        const { count, error } = await supabase
            .from("corrections")
            .select("id", { count: "exact", head: true })
            .eq("status", "resolved")
            .gte("resolved_at", since);
        if (error) throw new Error(error.message);
        return count ?? 0;
    },
    ["correction-count"],
    { tags: [CACHE_TAGS.corrections], revalidate: PUBLIC_CONTENT_REVALIDATE_SECONDS },
);
