import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import type { Locale } from "@/lib/i18n";

export type SearchResultItem = {
    id: string;
    type: string;
    title: string;
    excerpt: string | null;
    imageUrl: string | null;
    location: string | null;
    publishedAt: string | null;
    href: string;
    hasVideo?: boolean;
    hasAudio?: boolean;
};

export type SearchResults = {
    photoStories: SearchResultItem[];
    news: SearchResultItem[];
    notices: SearchResultItem[];
    listings: SearchResultItem[];
    culture: SearchResultItem[];
    total: number;
};

type QueryResult<T> = {
    data: T | null;
    count: number | null;
    error: { message: string } | null;
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
            logger.error("search", "query failed", { error: error.message });
            return { data: null, count: null, error };
        }
        return { data, count: count ?? null, error: null };
    } catch (err) {
        logger.error("search", "query exception", { error: err instanceof Error ? err.message : String(err) });
        return { data: null, count: null, error: { message: String(err) } };
    }
}

/** The admin client is only usable when the service key is configured. */
function hasDatabase(): boolean {
    return Boolean(
        process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
    );
}

/** PostgREST returns to-one embeds as object or array depending on relationship detection. */
function asOne<T>(value: T | T[] | null | undefined): T | null {
    if (!value) return null;
    return Array.isArray(value) ? (value[0] ?? null) : value;
}

/** Preferred locale → English fallback → first available. */
function pickLocalized<T extends { locale: string }>(
    rows: T[] | null | undefined,
    locale: Locale,
): T | null {
    if (!rows || rows.length === 0) return null;
    return (
        rows.find((r) => r.locale === locale) ??
        rows.find((r) => r.locale === "en") ??
        rows[0]
    );
}

/** Canonical detail paths (locale-free — callers prefix via localePath). */
function detailHref(type: string, slug: string | null, id: string): string {
    const key = slug ?? id;
    switch (type) {
        case "photo_story":
            return `/photo-stories/${key}`;
        case "news":
            return `/news/${key}`;
        case "culture":
            return `/culture/${key}`;
        case "notice":
            return `/notices/${id}`;
        case "listing":
            return `/buy-sell/${id}`;
        default:
            return `/`;
    }
}

/** Strip characters PostgREST `ilike` treats specially. */
function sanitizePhrase(input: string): string {
    return input
        .replace(/[,()%\\*]/g, " ")
        .trim()
        .slice(0, 80);
}

type RawSearchRow = {
    id: string;
    type: string;
    slug: string | null;
    published_at: string | null;
    location?: { name: string | null } | { name: string | null }[] | null;
    translations?:
        | { locale: string; title: string | null; excerpt: string | null }[]
        | null;
    media?:
        | { public_url: string | null; is_cover: boolean | null; kind: string | null; mime_type: string | null }[]
        | null;
};

const SEARCH_SELECT = `id, type, slug, published_at,
    location:locations(name),
    translations:content_translations(locale, title, excerpt),
    media:media_assets(public_url, is_cover, kind, mime_type)`;

/**
 * Global search across all five content types. Mirrors the two-step pattern
 * from `lib/queries/news.ts` (PostgREST rejects `or()`+`ilike` against an
 * embedded table), collecting matching ids from `content_translations` first,
 * then fetching the full published items. `type` narrows to a single vertical.
 */
export async function getSearchResults(options: {
    q: string;
    type?: string | null;
    locale: Locale;
    limit?: number;
}): Promise<SearchResults> {
    const empty: SearchResults = {
        photoStories: [],
        news: [],
        notices: [],
        listings: [],
        culture: [],
        total: 0,
    };
    if (!hasDatabase()) return empty;

    const phrase = sanitizePhrase(options.q);
    if (!phrase) return empty;
    const limit = options.limit ?? 60;

    // Step 1: matching content_item_ids in the active locale.
    const { data: idRows } = await safe(
        createAdminClient()
            .from("content_translations")
            .select("content_item_id")
            .eq("locale", options.locale)
            .or(`title.ilike.*${phrase}*,excerpt.ilike.*${phrase}*`)
            .limit(200),
    );
    const ids = (idRows ?? []).flatMap((row) => {
        const id = (row as { content_item_id: string | null }).content_item_id;
        return id ? [id] : [];
    });
    if (ids.length === 0) return empty;

    // Step 2: full published items, optionally narrowed by type.
    let query = createAdminClient()
        .from("content_items")
        .select(SEARCH_SELECT, { count: "exact" })
        .eq("status", "published")
        .eq("is_archived", false)
        .not("published_at", "is", null)
        .in("id", ids);

    if (options.type) {
        query = query.eq("type", options.type);
    }

    const { data, count: total } = await safe(
        query
            .order("published_at", { ascending: false, nullsFirst: false })
            .limit(limit),
    );

    const items = ((data ?? []) as unknown as RawSearchRow[]).flatMap((row) => {
        const translation = pickLocalized(row.translations, options.locale);
        if (!translation?.title) return [];
        const location = asOne(row.location);
        const media = row.media ?? [];
        const images = media.filter((m) => (m.kind ?? 'image') === 'image');
        const cover = media.find((m) => m.is_cover) ?? images[0] ?? media[0] ?? null;
        return [
            {
                id: row.id,
                type: row.type,
                title: translation.title,
                excerpt: translation.excerpt ?? null,
                imageUrl: cover?.public_url ?? null,
                location: location?.name ?? null,
                publishedAt: row.published_at,
                href: detailHref(row.type, row.slug, row.id),
                hasVideo: media.some((m) => m.kind === 'video' || (m.mime_type ?? '').startsWith('video/')),
                hasAudio: media.some((m) => m.kind === 'audio' || (m.mime_type ?? '').startsWith('audio/')),
            } satisfies SearchResultItem,
        ];
    });

    return {
        photoStories: items.filter((i) => i.type === "photo_story"),
        news: items.filter((i) => i.type === "news"),
        notices: items.filter((i) => i.type === "notice"),
        listings: items.filter((i) => i.type === "listing"),
        culture: items.filter((i) => i.type === "culture"),
        total: total ?? items.length,
    };
}
