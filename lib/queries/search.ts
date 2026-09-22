import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import { mapAttachments, previewImageUrl } from "@/lib/media/attachments";
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
    /** Trust-layer verification for the shared badge (null = no badge). */
    verification?: string | null;
    hasVideo?: boolean;
    hasAudio?: boolean;
    /** ts_headline snippet around the match (`<mark>` included) — for future highlighted-result UI. */
    headlineTitle?: string;
    headlineExcerpt?: string;
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

/** Canonical detail paths (locale-free — callers prefix via localePath). Also used by /api/search/suggest. */
export function detailHref(type: string, slug: string | null, id: string): string {
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

/** Trim + bound the raw query. FTS arguments travel as bind values, so no wildcard escaping is needed; the trim keeps cache/URL keys canonical. */
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
    verification: string | null;
    published_at: string | null;
    location?: { name: string | null } | { name: string | null }[] | null;
    translations?:
        | { locale: string; title: string | null; excerpt: string | null }[]
        | null;
    media?:
        | { public_url: string | null; is_cover: boolean | null; kind: string | null; mime_type: string | null }[]
        | null;
};

const SEARCH_SELECT = `id, type, slug, verification, published_at,
    location:locations(name),
    translations:content_translations(locale, title, excerpt),
    media:media_assets(public_url, is_cover, kind, mime_type)`;

/** One ranked match from the `search_content` RPC (migrations 20261009000000/1). */
type FtsMatch = {
    item_id: string;
    rank: number;
    headline_title: string;
    headline_excerpt: string;
};

/**
 * A5 — full-text search core. Matching and ranking live in Postgres via the
 * `search_content` RPC (unaccented tsvector @@ plainto_tsquery with
 * ts_rank_cd, published-only), so "ecole" matches "école" and multi-word
 * queries rank by term coverage instead of substring luck.
 *
 * Returns matching published item ids, or:
 *   - `null` when there is no term / no database configured — "no constraint"
 *     (callers must not narrow the query), and
 *   - `[]` when the RPC errored or found nothing — "definitely nothing"
 *     (callers short-circuit instead of falling back to the unfiltered list).
 *
 * `types` narrows to one or more content verticals; the RPC caps `limit`
 * itself (1..200).
 */
export async function searchContentIds(
    q: string | undefined,
    locale: Locale,
    types?: string[],
    limit = 200,
): Promise<string[] | null> {
    const phrase = q?.trim().slice(0, 80);
    if (!phrase) return null;
    if (!hasDatabase()) return null;

    const { data, error } = await safe(
        createAdminClient().rpc("search_content", {
            p_q: phrase,
            p_locale: locale,
                        p_types: types ?? null,
            p_limit: limit,
        }),
    );
    if (error) return [];
    return ((data ?? []) as unknown as FtsMatch[]).map((row) => row.item_id);
}

/**
 * Global search across all five content types, ranked by `ts_rank_cd`.
 * A5: matching moved from `ilike` substring scans to the `search_content`
 * RPC (accent-insensitive in both locales, ranked multi-term matching).
 * Full rows are then fetched by id in one query and re-ordered by FTS rank,
 * keeping the card mapping below the single source of truth. `type` narrows
 * to a single vertical.
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

    // Step 1: ranked matches from Postgres full-text search.
    const { data: ftsData, error: ftsError } = await safe(
        createAdminClient().rpc("search_content", {
            p_q: phrase,
            p_locale: options.locale,
                        p_types: options.type ? [options.type] : null,
            p_limit: limit,
        }),
    );
    const ftsRows = ((ftsData ?? []) as unknown as FtsMatch[]).filter((m) => Boolean(m.item_id));
    if (ftsError || ftsRows.length === 0) return empty;

    const rankById = new Map(ftsRows.map((m) => [m.item_id, m]));
    const ids = ftsRows.map((m) => m.item_id);

    // Step 2: full published items, optionally narrowed by type.
    let query = createAdminClient()
        .from("content_items")
        .select(SEARCH_SELECT, { count: "exact" })
        .eq("status", "published")
        .eq("is_archived", false)
        .not("published_at", "is", null)
        .in("id", ids);

    if (options.type) {
        query = query.eq(
            "type",
            options.type as "photo_story" | "news" | "notice" | "culture" | "listing" | "fundraiser",
        );
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
        const rawCover = (media.find((m) => m.is_cover) ?? null)?.public_url ?? images[0]?.public_url ?? null;
        const imageUrl = previewImageUrl(rawCover, mapAttachments(media));
        return [
            {
                id: row.id,
                type: row.type,
                title: translation.title,
                excerpt: translation.excerpt ?? null,
                imageUrl,
                location: location?.name ?? null,
                publishedAt: row.published_at,
                verification: row.verification ?? null,
                href: detailHref(row.type, row.slug, row.id),
                hasVideo: media.some((m) => m.kind === 'video' || (m.mime_type ?? '').startsWith('video/')),
                hasAudio: media.some((m) => m.kind === 'audio' || (m.mime_type ?? '').startsWith('audio/')),
                headlineTitle: rankById.get(row.id)?.headline_title,
                headlineExcerpt: rankById.get(row.id)?.headline_excerpt,
            } satisfies SearchResultItem,
        ];
    })
        .sort((a, b) => (rankById.get(b.id)?.rank ?? 0) - (rankById.get(a.id)?.rank ?? 0));

    return {
        photoStories: items.filter((i) => i.type === "photo_story"),
        news: items.filter((i) => i.type === "news"),
        notices: items.filter((i) => i.type === "notice"),
        listings: items.filter((i) => i.type === "listing"),
        culture: items.filter((i) => i.type === "culture"),
        total: total ?? items.length,
    };
}
