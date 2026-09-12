import "server-only";

import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import { CACHE_TAGS, PUBLIC_CONTENT_REVALIDATE_SECONDS } from "@/lib/cache/tags";
import type { Locale } from "@/lib/i18n";
import type { StoryCardData } from "@/lib/queries/home";
import { mapAttachments, supportingMedia } from "@/lib/media/attachments";

/**
 * Data access for the News vertical (type = "news").
 *
 * Mirrors the conventions of `lib/queries/photo-stories.ts` and
 * `lib/queries/home.ts`: admin client plus `safe()` wrapper, PostgREST
 * aliasing, and locale-resolved translations. News items are
 * `content_items` with `type = "news"`, a cover image from `media_assets`,
 * author info from `profiles`, and body text from `content_translations`.
 */
export const NEWS_PAGE_SIZE = 12;

/**
 * A news article: the shared `StoryCardData` shape extended with author
 * and location metadata for detail pages.
 */
export type NewsArticle = StoryCardData & {
    slug: string;
    body?: string | null;
    authorName?: string | null;
    authorId?: string | null;
    /** Human byline from the translation row (imported posts without a profile author). */
    byline?: string | null;
    locationSlug?: string | null;
    viewCount?: number;
};

/** Raw row shape returned by the shared story select. */
type RawStoryRow = {
    id: string;
    slug: string | null;
    verification: string | null;
    published_at: string | null;
    view_count: number | null;
    location?: { name: string | null; slug: string | null } | { name: string | null; slug: string | null }[] | null;
    category?:
        | { category_translations: { locale: string; name: string }[] }
        | { category_translations: { locale: string; name: string }[] }[]
        | null;
    translations?:
        | { locale: string; title: string | null; excerpt: string | null; body: string | null; byline: string | null }[]
        | null;
    media?:
        | { public_url: string | null; alt_text: string | null; photographer_credit: string | null; caption: string | null; is_cover: boolean | null; kind: string | null; mime_type: string | null }[]
        | null;
    author?: { id: string; display_name: string | null } | { id: string; display_name: string | null }[] | null;
};

const STORY_SELECT = `id, slug, verification, published_at, view_count,
    location:locations(name, slug),
    category:categories(category_translations(locale, name)),
    translations:content_translations(locale, title, excerpt, body, byline),
    media:media_assets(public_url, alt_text, caption, photographer_credit, is_cover, kind, mime_type),
    author:profiles!content_items_author_id_fkey(id, display_name)`;

/**
 * Same select with an inner location join. PostgREST only applies embedded
 * filters to the parent rows when the embed is `!inner`, and `locations!inner`
 * would drop stories that have no location — so it is used only when a
 * location filter is actually requested.
 */
const STORY_SELECT_WITH_LOCATION = STORY_SELECT.replace(
    "location:locations(",
    "location:locations!inner(",
);

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
            logger.error("news", "query failed", { error: error.message });
            return { data: null, count: null, error };
        }
        return { data, count: count ?? null, error: null };
    } catch (err) {
        logger.error("news", "query exception", { error: err instanceof Error ? err.message : String(err) });
        return { data: null, count: null, error: { message: String(err) } };
    }
}

/**
 * Phase 4.1 — cached-query error policy: inside an `unstable_cache` scope a
 * failed query THROWS instead of resolving to a fallback, so a transient
 * outage is never baked into the cache. The exported wrappers catch, log, and
 * fall back (the safe() semantics) at the call boundary.
 */
function logCacheFailure(fn: string, err: unknown): void {
    logger.error("news", `cached query failed (${fn})`, {
        error: err instanceof Error ? err.message : String(err),
    });
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

/** PostgREST `or()` phrases cannot contain commas or wildcard characters. */
function sanitizePhrase(input: string): string {
    return input
        .replace(/[,()%\\]/g, " ")
        .trim()
        .slice(0, 80);
}

/** Base builder for every public news query (published, unarchived). */
function publishedNews(selectQuery = STORY_SELECT, countExact = false) {
    const supabase = createAdminClient();
    return supabase
        .from("content_items")
        .select(selectQuery, countExact ? { count: "exact" } : undefined)
        .eq("type", "news")
        .eq("status", "published")
        .eq("is_archived", false)
        .not("published_at", "is", null);
}

/** Maps one raw row to the shared card shape (+ author/location extras); null without a title. */
function toCard(row: RawStoryRow, locale: Locale): NewsArticle | null {
    const translation = pickLocalized(row.translations, locale);
    if (!translation?.title) return null;
    const location = asOne(row.location);
    const category = asOne(row.category);
    const allMedia = mapAttachments(row.media ?? []);
    const images = allMedia.filter((m) => m.kind === 'image');
    const cover = (row.media ?? []).find((m) => m.is_cover) ?? null;
    const coverUrl = cover?.public_url ?? images[0]?.url ?? allMedia[0]?.url ?? null;
    const author = asOne(row.author);
    return {
        id: row.id,
        slug: row.slug ?? row.id,
        type: "news",
        href: `/news/${row.slug ?? row.id}`,
        title: translation.title,
        excerpt: translation.excerpt ?? null,
        imageUrl: coverUrl,
        location: location?.name ?? null,
        category: category
            ? (pickLocalized(category.category_translations, locale)?.name ?? null)
            : null,
        credit: cover?.photographer_credit ?? images[0]?.credit ?? null,
        verification: row.verification ?? null,
        publishedAt: row.published_at,
        viewCount: Number(row.view_count ?? 0),
        body: translation.body ?? null,
        byline: translation.byline ?? null,
        authorName: author?.display_name ?? null,
        authorId: author?.id ?? null,
        locationSlug: location?.slug ?? null,
        hasVideo: allMedia.some((m) => m.kind === 'video'),
        hasAudio: allMedia.some((m) => m.kind === 'audio'),
        attachments: supportingMedia(allMedia),
    };
}

/**
 * Two-step search: PostgREST rejects `or()` + `ilike` against embedded tables
 * (PGRST100), so matching ids are collected from `content_translations` first
 * and applied with `.in("id", …)`. Returns `null` when there is no term.
 */
async function searchIds(search: string | undefined): Promise<string[] | null> {
    const term = search?.trim();
    if (!term) return null;
    const phrase = sanitizePhrase(term);
    if (!phrase) return null;

    const { data } = await safe(
        createAdminClient()
            .from("content_translations")
            .select("content_item_id")
            .or(`title.ilike.*${phrase}*,excerpt.ilike.*${phrase}*`),
    );
    return (data ?? []).flatMap((row) => {
        const id = (row as { content_item_id: string | null }).content_item_id;
        return id ? [id] : [];
    });
}

/** Category ids whose slug or translated name matches the facet selection. */
async function categoryIds(category: string | undefined): Promise<string[] | null> {
    const term = category?.trim();
    if (!term) return null;
    const phrase = sanitizePhrase(term);

    const { data } = await safe(
        createAdminClient()
            .from("categories")
            .select("id, slug, category_translations(name)")
            .eq("content_type", "news"),
    );

    const matches = (data ?? []).flatMap((row) => {
        const raw = row as {
            id: string;
            slug: string | null;
            category_translations?: { name: string | null }[] | null;
        };
        const names = (raw.category_translations ?? []).map((t) => (t.name ?? "").toLowerCase());
        const hit =
            raw.slug === phrase ||
            raw.slug?.toLowerCase() === phrase.toLowerCase() ||
            names.some((n) => n.includes(phrase.toLowerCase()));
        return hit ? [raw.id] : [];
    });

    return matches;
}

/** "wildlife-safari" → "Wildlife Safari" (facet fallback label from the slug). */
function prettifyCategory(slug: string): string {
    return slug
        .split("-")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
}

/**
 * Filter facets, derived from the shared `categories` table scoped to `news`.
 * Phase 4.1: cached (tag `news`) — the facet list only changes on editorial
 * taxonomy/publish events, which call revalidateTag('news', 'max').
 */
const getCachedNewsCategories = unstable_cache(
    async (): Promise<{ id: string; slug: string; name: string; total: number }[]> => {
        const supabase = createAdminClient();

        const [categoriesResult, countsResult] = await Promise.all([
            supabase
                .from("categories")
                .select("id, slug, category_translations(locale, name)")
                .eq("content_type", "news")
                .eq("is_active", true)
                .order("sort_order", { ascending: true }),
            supabase
                .from("content_items")
                .select("category_id")
                .eq("type", "news")
                .eq("status", "published")
                .eq("is_archived", false)
                .not("published_at", "is", null),
        ]);
        if (categoriesResult.error) throw new Error(categoriesResult.error.message);
        if (countsResult.error) throw new Error(countsResult.error.message);

        const totals = new Map<string, number>();
        for (const row of countsResult.data ?? []) {
            const raw = row as { category_id: string | null };
            if (raw.category_id) {
                totals.set(raw.category_id, (totals.get(raw.category_id) ?? 0) + 1);
            }
        }

        return (categoriesResult.data ?? []).flatMap((category) => {
            const raw = category as {
                id: string;
                slug: string;
                category_translations?: { locale: string; name: string }[] | null;
            };
            const total = totals.get(raw.id) ?? 0;
            if (total === 0) return [];
            const name =
                pickLocalized(raw.category_translations, "en")?.name ?? prettifyCategory(raw.slug);
            return [{ id: raw.id, slug: raw.slug, name, total }];
        });
    },
    ["news-categories"],
    { tags: [CACHE_TAGS.news], revalidate: PUBLIC_CONTENT_REVALIDATE_SECONDS },
);

export async function getNewsCategories(): Promise<
    { id: string; slug: string; name: string; total: number }[]
> {
    if (!hasDatabase()) return [];
    try {
        return await getCachedNewsCategories();
    } catch (err) {
        logCacheFailure("getNewsCategories", err);
        return [];
    }
}

/**
 * Location filter facets from the shared `locations` table (active only).
 * Phase 4.1: cached (tag `news`).
 */
const getCachedNewsLocations = unstable_cache(
    async (): Promise<{ slug: string; name: string }[]> => {
        const { data, error } = await createAdminClient()
            .from("locations")
            .select("slug, name")
            .eq("is_active", true)
            .order("name", { ascending: true });
        if (error) throw new Error(error.message);
        return (data ?? []).flatMap((row) => {
            const location = row as { slug: string; name: string | null };
            return location.name ? [{ slug: location.slug, name: location.name }] : [];
        });
    },
    ["news-locations"],
    { tags: [CACHE_TAGS.news], revalidate: PUBLIC_CONTENT_REVALIDATE_SECONDS },
);

export async function getNewsLocations(): Promise<{ slug: string; name: string }[]> {
    if (!hasDatabase()) return [];
    try {
        return await getCachedNewsLocations();
    } catch (err) {
        logCacheFailure("getNewsLocations", err);
        return [];
    }
}

/**
 * Neighbouring articles for the detail-page prev/next navigation.
 * Phase 4.1: cached (tag `news`); the `published_at` cursor keeps the cache
 * key stable per article.
 */
const getCachedAdjacentNews = unstable_cache(
    async (
        currentId: string,
        publishedAt: string,
        locale: Locale,
    ): Promise<{ prev: NewsArticle | null; next: NewsArticle | null }> => {
        const [nextResult, prevResult] = await Promise.all([
            publishedNews()
                .gt("published_at", publishedAt)
                .order("published_at", { ascending: true })
                .limit(1),
            publishedNews()
                .lt("published_at", publishedAt)
                .order("published_at", { ascending: false })
                .limit(1),
        ]);
        if (nextResult.error) throw new Error(nextResult.error.message);
        if (prevResult.error) throw new Error(prevResult.error.message);

        const nextRow = asOne((nextResult.data ?? []) as unknown as RawStoryRow[]);
        const prevRow = asOne((prevResult.data ?? []) as unknown as RawStoryRow[]);
        return {
            prev: prevRow ? toCard(prevRow, locale) : null,
            next: nextRow && nextRow.id !== currentId ? toCard(nextRow, locale) : null,
        };
    },
    ["news-adjacent"],
    { tags: [CACHE_TAGS.news], revalidate: PUBLIC_CONTENT_REVALIDATE_SECONDS },
);

export async function getAdjacentNews(
    currentId: string,
    publishedAt: string,
    locale: Locale = "en",
): Promise<{ prev: NewsArticle | null; next: NewsArticle | null }> {
    if (!hasDatabase()) return { prev: null, next: null };
    try {
        return await getCachedAdjacentNews(currentId, publishedAt, locale);
    } catch (err) {
        logCacheFailure("getAdjacentNews", err);
        return { prev: null, next: null };
    }
}

/**
 * Most-viewed published news articles — sidebar rail.
 * Phase 4.1: cached (tag `news`); view_count is an ornament so a 5-minute
 * window is an accepted trade for taking this query off the hot path.
 */
const getCachedMostViewedNews = unstable_cache(
    async (locale: Locale, limit: number): Promise<NewsArticle[]> => {
        const { data, error } = await publishedNews()
            .order("view_count", { ascending: false, nullsFirst: false })
            .limit(limit);
        if (error) throw new Error(error.message);
        return ((data ?? []) as unknown as RawStoryRow[]).flatMap((row) => {
            const card = toCard(row, locale);
            return card ? [card] : [];
        });
    },
    ["news-most-viewed"],
    { tags: [CACHE_TAGS.news], revalidate: PUBLIC_CONTENT_REVALIDATE_SECONDS },
);

/** Most-viewed published news articles — sidebar rail. */
export async function getMostViewedNews(
    locale: Locale = "en",
    limit = 5,
): Promise<NewsArticle[]> {
    if (!hasDatabase()) return [];
    try {
        return await getCachedMostViewedNews(locale, limit);
    } catch (err) {
        logCacheFailure("getMostViewedNews", err);
        return [];
    }
}

/**
 * Archive stats for the landing band: articles, places, contributors, weekly
 * volume. Phase 4.1: cached (tag `news`); the "this week" count is computed
 * once per cache window, which is fine for a stat band.
 */
const getCachedNewsStats = unstable_cache(
    async (): Promise<{
        articles: number;
        places: number;
        contributors: number;
        thisWeek: number;
    }> => {
        const { data, error } = await createAdminClient()
            .from("content_items")
            .select("author:profiles!content_items_author_id_fkey(id), location:locations(name), published_at")
            .eq("type", "news")
            .eq("status", "published")
            .eq("is_archived", false);
        if (error) throw new Error(error.message);

        const rows = (data ?? []) as {
            author?: { id: string } | { id: string }[] | null;
            location?: { name: string } | { name: string }[] | null;
            published_at?: string | null;
        }[];

        const places = new Set<string>();
        const authors = new Set<string>();
        let thisWeek = 0;
        const weekAgo = Date.now() - 7 * 86_400_000;

        for (const row of rows) {
            const location = asOne(row.location);
            if (location?.name) places.add(location.name);
            const author = asOne(row.author);
            if (author?.id) authors.add(author.id);
            if (row.published_at && new Date(row.published_at).getTime() >= weekAgo) {
                thisWeek += 1;
            }
        }

        return { articles: rows.length, places: places.size, contributors: authors.size, thisWeek };
    },
    ["news-stats"],
    { tags: [CACHE_TAGS.news], revalidate: PUBLIC_CONTENT_REVALIDATE_SECONDS },
);

/** Archive stats for the landing band: articles, places, contributors, weekly volume. */
export async function getNewsStats(): Promise<{
    articles: number;
    places: number;
    contributors: number;
    thisWeek: number;
}> {
    const empty = { articles: 0, places: 0, contributors: 0, thisWeek: 0 };
    if (!hasDatabase()) return empty;
    try {
        return await getCachedNewsStats();
    } catch (err) {
        logCacheFailure("getNewsStats", err);
        return empty;
    }
}

/**
 * Full-bleed featured article for the news landing page: the newest
 * published article with a cover image, falling back to any newest article.
 * Phase 4.1: cached (tag `news`).
 */
const getCachedFeaturedNews = unstable_cache(
    async (locale: Locale): Promise<NewsArticle | null> => {
        const withMedia = await createAdminClient()
            .from("content_items")
            .select(STORY_SELECT)
            .eq("type", "news")
            .eq("status", "published")
            .eq("is_archived", false)
            .not("published_at", "is", null)
            .order("published_at", { ascending: false, nullsFirst: false })
            .limit(1);
        if (withMedia.error) throw new Error(withMedia.error.message);

        const withMediaRow = asOne((withMedia.data ?? []) as unknown as RawStoryRow[]);
        if (withMediaRow) return toCard(withMediaRow, locale);

        const anyArticle = await publishedNews()
            .order("published_at", { ascending: false, nullsFirst: false })
            .limit(1);
        if (anyArticle.error) throw new Error(anyArticle.error.message);
        const anyRow = asOne((anyArticle.data ?? []) as unknown as RawStoryRow[]);
        return anyRow ? toCard(anyRow, locale) : null;
    },
    ["news-featured"],
    { tags: [CACHE_TAGS.news], revalidate: PUBLIC_CONTENT_REVALIDATE_SECONDS },
);

export async function getFeaturedNews(locale: Locale = "en"): Promise<NewsArticle | null> {
    if (!hasDatabase()) return null;
    try {
        return await getCachedFeaturedNews(locale);
    } catch (err) {
        logCacheFailure("getFeaturedNews", err);
        return null;
    }
}

/**
 * Stories still being verified — the "Live & Developing" rail on the news
 * page. Ordered newest first so the freshest update leads.
 * Phase 4.1: cached (tag `news`) — the rail refreshes on publish events or
 * at the 5-minute window, never per request.
 */
const getCachedDevelopingNews = unstable_cache(
    async (locale: Locale, limit: number): Promise<NewsArticle[]> => {
        const { data, error } = await publishedNews()
            .eq("verification", "developing")
            .order("published_at", { ascending: false, nullsFirst: false })
            .limit(limit);
        if (error) throw new Error(error.message);
        return ((data ?? []) as unknown as RawStoryRow[]).flatMap((row) => {
            const card = toCard(row, locale);
            return card ? [card] : [];
        });
    },
    ["news-developing"],
    { tags: [CACHE_TAGS.news], revalidate: PUBLIC_CONTENT_REVALIDATE_SECONDS },
);

export async function getDevelopingNews(
    locale: Locale = "en",
    limit = 3,
): Promise<NewsArticle[]> {
    if (!hasDatabase()) return [];
    try {
        return await getCachedDevelopingNews(locale, limit);
    } catch (err) {
        logCacheFailure("getDevelopingNews", err);
        return [];
    }
}

/**
 * Paged grid of published news articles, newest first. Search and category
 * match a phrase across title/excerpt in any locale; location narrows to
 * the article's `locations` row. `sort` switches between recency and
 * readership.
 */
export async function getNewsArticles(options: {
    search?: string;
    category?: string;
    location?: string;
    locale?: Locale;
    page?: number;
    sort?: "newest" | "most_read";
}): Promise<{ articles: NewsArticle[]; total: number; page: number; pageCount: number }> {
    if (!hasDatabase()) {
        return { articles: [], total: 0, page: 1, pageCount: 1 };
    }
    const page = Math.max(1, options.page ?? 1);
    const location = options.location?.trim();
    const sort = options.sort ?? "newest";

    const [searchMatches, categoryMatches] = await Promise.all([
        searchIds(options.search),
        categoryIds(options.category),
    ]);

    // An empty id list means "definitely nothing" — short-circuit so a search
    // with no hits never falls back to showing the whole archive.
    if (
        (searchMatches && searchMatches.length === 0) ||
        (categoryMatches && categoryMatches.length === 0)
    ) {
        return { articles: [], total: 0, page: 1, pageCount: 1 };
    }

    let query = publishedNews(
        location ? STORY_SELECT_WITH_LOCATION : STORY_SELECT,
        true,
    );
    if (searchMatches) query = query.in("id", searchMatches);
    if (categoryMatches) query = query.in("category_id", categoryMatches);
    if (location) {
        query = query.eq("locations.slug", sanitizePhrase(location));
    }

    const from = (page - 1) * NEWS_PAGE_SIZE;
    const { data, count: total } = await safe(
        query
            .order(
                sort === "most_read" ? "view_count" : "published_at",
                { ascending: false, nullsFirst: false },
            )
            .range(from, from + NEWS_PAGE_SIZE - 1),
    );

    const locale = options.locale ?? "en";
    const articles = ((data ?? []) as unknown as RawStoryRow[]).flatMap((row) => {
        const card = toCard(row, locale);
        return card ? [card] : [];
    });
    const totalCount = total ?? 0;
    return {
        articles,
        total: totalCount,
        page,
        pageCount: Math.max(1, Math.ceil(totalCount / NEWS_PAGE_SIZE)),
    };
}

/**
 * One news article by slug, for the detail page (null when not found).
 * Phase 4.1: cached (tag `news`) — this is the hot read behind the ISR'd
 * article pages; a published/unpublished article is invalidated via
 * revalidateTag('news', 'max') from the admin actions.
 */
const getCachedNewsBySlug = unstable_cache(
    async (slug: string, locale: Locale): Promise<NewsArticle | null> => {
        const { data, error } = await publishedNews()
            .eq("slug", slug)
            .limit(1);
        if (error) throw new Error(error.message);
        const row = asOne((data ?? []) as unknown as RawStoryRow[]);
        return row ? toCard(row, locale) : null;
    },
    ["news-by-slug"],
    { tags: [CACHE_TAGS.news], revalidate: PUBLIC_CONTENT_REVALIDATE_SECONDS },
);

export async function getNewsBySlug(
    slug: string,
    locale: Locale = "en",
): Promise<NewsArticle | null> {
    if (!hasDatabase()) return null;
    // Sanitize before both the cache key and the query so one canonical
    // string serves every raw spelling of the same URL segment.
    const sanitized = sanitizePhrase(slug);
    if (!sanitized) return null;
    try {
        return await getCachedNewsBySlug(sanitized, locale);
    } catch (err) {
        logCacheFailure("getNewsBySlug", err);
        return null;
    }
}

/**
 * Newest news articles excluding one — the detail page's "related stories" rail.
 * Phase 4.1: cached (tag `news`).
 */
const getCachedOtherNews = unstable_cache(
    async (excludeId: string, locale: Locale, limit: number): Promise<NewsArticle[]> => {
        const { data, error } = await publishedNews()
            .neq("id", excludeId)
            .order("published_at", { ascending: false, nullsFirst: false })
            .limit(limit);
        if (error) throw new Error(error.message);
        return ((data ?? []) as unknown as RawStoryRow[]).flatMap((row) => {
            const card = toCard(row, locale);
            return card ? [card] : [];
        });
    },
    ["news-other"],
    { tags: [CACHE_TAGS.news], revalidate: PUBLIC_CONTENT_REVALIDATE_SECONDS },
);

/** Newest news articles excluding one — the detail page's "related stories" rail. */
export async function getOtherNews(
    excludeId: string,
    locale: Locale = "en",
    limit = 3,
): Promise<NewsArticle[]> {
    if (!hasDatabase()) return [];
    try {
        return await getCachedOtherNews(excludeId, locale, limit);
    } catch (err) {
        logCacheFailure("getOtherNews", err);
        return [];
    }
}
