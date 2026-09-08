import "server-only";

import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import { CACHE_TAGS, PUBLIC_CONTENT_REVALIDATE_SECONDS } from "@/lib/cache/tags";
import type { Locale } from "@/lib/i18n";
import type { StoryCardData } from "@/lib/queries/home";

/**
 * Data access for the Photo Stories vertical (spec §3.2).
 *
 * Mirrors the conventions of `lib/queries/home.ts`: the admin client plus a
 * `safe()` wrapper (a DB hiccup must never take the page down), aliased
 * PostgREST embeds, and locale-resolved translations. Stories are
 * `content_items` with `type = "photo_story"`; photographs live in
 * `media_assets` ordered by `sort_order` with the cover flagged by
 * `is_cover`.
 */
export const PHOTO_STORIES_PAGE_SIZE = 12;

/** A single photograph inside a photo essay. */
export type PhotoStoryPhoto = {
    id: string;
    url: string;
    alt: string | null;
    credit: string | null;
    caption: string | null;
    position: number;
    /** Natural pixel dimensions (used for aspect-ratio-aware grids). */
    width: number | null;
    height: number | null;
};

/**
 * A photo story: the shared `StoryCardData` shape extended with the essay's
 * photo gallery, so grids keep using the shared card components.
 */
export type PhotoStoryData = StoryCardData & {
    slug: string;
    photos: PhotoStoryPhoto[];
    viewCount?: number;
    /** Full essay prose in the active locale. */
    body?: string | null;
};

/** Landing-page filter facet, derived from the shared `categories` table. */
export type CategoryFacet = {
    id: string;
    slug: string;
    name: string;
    total: number;
};

/** Raw row shape returned by the shared story select. */
type RawStoryRow = {
    id: string;
    slug: string | null;
    verification: string | null;
    published_at: string | null;
    view_count: number | null;
    location?: { name: string | null } | { name: string | null }[] | null;
    category?:
        | { category_translations: { locale: string; name: string }[] }
        | { category_translations: { locale: string; name: string }[] }[]
        | null;
    translations?:
        | { locale: string; title: string | null; excerpt: string | null; body: string | null }[]
        | null;
    media?:
        | {
              public_url: string | null;
              alt_text: string | null;
              caption: string | null;
              photographer_credit: string | null;
              is_cover: boolean | null;
              sort_order: number | null;
              width: number | null;
              height: number | null;
          }[]
        | null;
};

const STORY_SELECT = `id, slug, verification, published_at, view_count,
    location:locations(name),
    category:categories(category_translations(locale, name)),
    translations:content_translations(locale, title, excerpt, body),
    media:media_assets(public_url, alt_text, caption, photographer_credit, is_cover, sort_order, width, height)`;

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
            logger.error("photo-stories", "query failed", { error: error.message });
            return { data: null, count: null, error };
        }
        return { data, count: count ?? null, error: null };
    } catch (err) {
        logger.error("photo-stories", "query exception", { error: err instanceof Error ? err.message : String(err) });
        return { data: null, count: null, error: { message: String(err) } };
    }
}

/** The admin client is only usable when the service key is configured. */
function hasDatabase(): boolean {
    return Boolean(
        process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
    );
}

/**
 * Phase 4.1 — cached-query error policy: inside an `unstable_cache` scope a
 * failed query THROWS instead of resolving to a fallback, so a transient
 * outage is never baked into the cache. The exported wrappers catch, log, and
 * fall back (the safe() semantics) at the call boundary.
 */
function logCacheFailure(fn: string, err: unknown): void {
    logger.error("photo-stories", `cached query failed (${fn})`, {
        error: err instanceof Error ? err.message : String(err),
    });
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

/** "wildlife-safari" → "Wildlife Safari" (facet fallback label from the slug). */
export function prettifyCategory(slug: string): string {
    return slug
        .split("-")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
}

/** Base builder for every public photo-story query (published, unarchived). */
function publishedPhotoStories(countExact = false) {
    const supabase = createAdminClient();
    return supabase
        .from("content_items")
        .select(STORY_SELECT, countExact ? { count: "exact" } : undefined)
        .eq("type", "photo_story")
        .eq("status", "published")
        .eq("is_archived", false)
        .not("published_at", "is", null);
}

/** PostgREST `or()` phrases cannot contain commas or wildcard characters. */
function sanitizePhrase(input: string): string {
    return input
        .replace(/[,()%\\]/g, " ")
        .trim()
        .slice(0, 80);
}

/** Orders embedded media rows by `sort_order` into the essay gallery. */
function mapPhotos(row: RawStoryRow): PhotoStoryPhoto[] {
    return (row.media ?? [])
        .slice()
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .map((photo, index) => ({
            id: `${row.id}-${index}`,
            url: photo.public_url ?? "",
            alt: photo.alt_text,
            credit: photo.photographer_credit,
            caption: photo.caption,
            position: photo.sort_order ?? index,
            width: photo.width,
            height: photo.height,
        }))
        .filter((photo) => photo.url !== "");
}

/** Maps one raw row to the shared card shape (+ gallery); null without a title. */
function toCard(row: RawStoryRow, locale: Locale): PhotoStoryData | null {
    const translation = pickLocalized(row.translations, locale);
    if (!translation?.title) return null;
    const location = asOne(row.location);
    const category = asOne(row.category);
    const photos = mapPhotos(row);
    const cover = photos[0] ?? null;
    return {
        id: row.id,
        slug: row.slug ?? row.id,
        type: "photo_story",
        href: `/photo-stories/${row.slug ?? row.id}`,
        title: translation.title,
        excerpt: translation.excerpt ?? null,
        imageUrl: cover?.url ?? null,
        location: location?.name ?? null,
        category: category
            ? (pickLocalized(category.category_translations, locale)?.name ?? null)
            : null,
        credit: cover?.credit ?? null,
        verification: row.verification ?? null,
        publishedAt: row.published_at,
        viewCount: Number(row.view_count ?? 0),
        body: translation.body ?? null,
        photos,
    };
}

/** Same fields as STORY_SELECT, but `!inner` on media forces at least one photo. */
const FEATURED_SELECT = `id, slug, verification, published_at, view_count,
    location:locations(name),
    category:categories(category_translations(locale, name)),
    translations:content_translations(locale, title, excerpt, body),
    media:media_assets!inner(public_url, alt_text, caption, photographer_credit, is_cover, sort_order, width, height)`;

/**
 * Full-bleed featured story for the landing page: the newest essay with at
 * least one photograph, falling back to the newest essay of any kind.
 * Phase 4.1: cached (tag `stories`).
 */
const getCachedFeaturedPhotoStory = unstable_cache(
    async (locale: Locale): Promise<PhotoStoryData | null> => {
        const withMedia = await createAdminClient()
            .from("content_items")
            .select(FEATURED_SELECT)
            .eq("type", "photo_story")
            .eq("status", "published")
            .eq("is_archived", false)
            .not("published_at", "is", null)
            .order("published_at", { ascending: false, nullsFirst: false })
            .limit(1);
        if (withMedia.error) throw new Error(withMedia.error.message);
        const withMediaRow = asOne((withMedia.data ?? []) as unknown as RawStoryRow[]);
        if (withMediaRow) return toCard(withMediaRow, locale);

        const anyStory = await publishedPhotoStories()
            .order("published_at", { ascending: false, nullsFirst: false })
            .limit(1);
        if (anyStory.error) throw new Error(anyStory.error.message);
        const anyRow = asOne((anyStory.data ?? []) as unknown as RawStoryRow[]);
        return anyRow ? toCard(anyRow, locale) : null;
    },
    ["photo-story-featured"],
    { tags: [CACHE_TAGS.stories], revalidate: PUBLIC_CONTENT_REVALIDATE_SECONDS },
);

export async function getFeaturedPhotoStory(): Promise<PhotoStoryData | null> {
    if (!hasDatabase()) return null;
    try {
        return await getCachedFeaturedPhotoStory("en");
    } catch (err) {
        logCacheFailure("getFeaturedPhotoStory", err);
        return null;
    }
}

/**
 * Paged grid of published photo stories, newest first. Search and category
 * match a phrase across title/excerpt in any locale; location narrows to
 * the story's `locations` row.
 * Phase 4.1: cached (tag `stories`) — inputs are sanitized to their canonical
 * form by the wrapper before the cache call so the cache key is stable.
 */
const getCachedPhotoStories = unstable_cache(
    async (
        search: string | null,
        category: string | null,
        location: string | null,
        locale: Locale,
        page: number,
    ): Promise<{
        stories: PhotoStoryData[];
        total: number;
        page: number;
        pageCount: number;
    }> => {
        let query = publishedPhotoStories(true);
        if (search) {
            query = query.or(
                `content_translations.title.ilike.*${search}*,` +
                    `content_translations.excerpt.ilike.*${search}*`,
            );
        }
        if (category) {
            query = query.or(
                `categories.slug.eq.${category},` +
                    `categories.category_translations.name.ilike.*${category}*`,
            );
        }
        if (location) {
            query = query.eq("locations.slug", location);
        }

        const from = (page - 1) * PHOTO_STORIES_PAGE_SIZE;
        const { data, count: total, error } = await query
            .order("published_at", { ascending: false, nullsFirst: false })
            .range(from, from + PHOTO_STORIES_PAGE_SIZE - 1);
        if (error) throw new Error(error.message);

        const stories = ((data ?? []) as unknown as RawStoryRow[]).flatMap((row) => {
            const card = toCard(row, locale);
            return card ? [card] : [];
        });
        const totalCount = total ?? 0;
        return {
            stories,
            total: totalCount,
            page,
            pageCount: Math.max(1, Math.ceil(totalCount / PHOTO_STORIES_PAGE_SIZE)),
        };
    },
    ["photo-stories-list"],
    { tags: [CACHE_TAGS.stories], revalidate: PUBLIC_CONTENT_REVALIDATE_SECONDS },
);

export async function getPhotoStories(filters: {
    search?: string;
    category?: string;
    location?: string;
    locale?: Locale;
    page?: number;
}): Promise<{
    stories: PhotoStoryData[];
    total: number;
    page: number;
    pageCount: number;
}> {
    if (!hasDatabase()) {
        return { stories: [], total: 0, page: 1, pageCount: 1 };
    }
    const page = Math.max(1, filters.page ?? 1);
    const locale = filters.locale ?? "en";
    const search = filters.search?.trim() ? sanitizePhrase(filters.search) || null : null;
    const category = filters.category?.trim() ? sanitizePhrase(filters.category) || null : null;
    const location = filters.location?.trim() ? sanitizePhrase(filters.location) || null : null;
    try {
        return await getCachedPhotoStories(search, category, location, locale, page);
    } catch (err) {
        logCacheFailure("getPhotoStories", err);
        return { stories: [], total: 0, page: 1, pageCount: 1 };
    }
}

/**
 * Filter facets, derived from the shared `categories` table scoped to
 * `photo_story`. Totals are counted from the published archive in a single
 * light query so the chips and filtered grid always agree; empty
 * categories are hidden.
 * Phase 4.1: cached (tag `stories`).
 */
const getCachedPhotoStoryCategories = unstable_cache(
    async (): Promise<CategoryFacet[]> => {
        const supabase = createAdminClient();

        const [categoriesResult, countsResult] = await Promise.all([
            supabase
                .from("categories")
                .select("id, slug, category_translations(locale, name)")
                .eq("content_type", "photo_story")
                .eq("is_active", true)
                .order("sort_order", { ascending: true }),
            supabase
                .from("content_items")
                .select("category_id")
                .eq("type", "photo_story")
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
    ["photo-story-categories"],
    { tags: [CACHE_TAGS.stories], revalidate: PUBLIC_CONTENT_REVALIDATE_SECONDS },
);

export async function getPhotoStoryCategories(): Promise<CategoryFacet[]> {
    if (!hasDatabase()) return [];
    try {
        return await getCachedPhotoStoryCategories();
    } catch (err) {
        logCacheFailure("getPhotoStoryCategories", err);
        return [];
    }
}

/**
 * Location filter facets from the shared `locations` table (active only).
 * Phase 4.1: cached (tag `stories`).
 */
const getCachedPhotoStoryLocations = unstable_cache(
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
    ["photo-story-locations"],
    { tags: [CACHE_TAGS.stories], revalidate: PUBLIC_CONTENT_REVALIDATE_SECONDS },
);

export async function getPhotoStoryLocations(): Promise<
    { slug: string; name: string }[]
> {
    if (!hasDatabase()) return [];
    try {
        return await getCachedPhotoStoryLocations();
    } catch (err) {
        logCacheFailure("getPhotoStoryLocations", err);
        return [];
    }
}

/**
 * One photo story by slug, for the detail page (null when not found).
 * Phase 4.1: cached (tag `stories`).
 */
const getCachedPhotoStoryBySlug = unstable_cache(
    async (slug: string, locale: Locale): Promise<PhotoStoryData | null> => {
        const { data, error } = await publishedPhotoStories()
            .eq("slug", slug)
            .limit(1);
        if (error) throw new Error(error.message);
        const row = asOne((data ?? []) as unknown as RawStoryRow[]);
        return row ? toCard(row, locale) : null;
    },
    ["photo-story-by-slug"],
    { tags: [CACHE_TAGS.stories], revalidate: PUBLIC_CONTENT_REVALIDATE_SECONDS },
);

export async function getPhotoStoryBySlug(
    slug: string,
    locale: Locale = "en",
): Promise<PhotoStoryData | null> {
    if (!hasDatabase()) return null;
    // Sanitize before both the cache key and the query so one canonical
    // string serves every raw spelling of the same URL segment.
    const sanitized = sanitizePhrase(slug);
    if (!sanitized) return null;
    try {
        return await getCachedPhotoStoryBySlug(sanitized, locale);
    } catch (err) {
        logCacheFailure("getPhotoStoryBySlug", err);
        return null;
    }
}

/**
 * Newest photo stories excluding one — the detail page's "more essays" rail.
 * Phase 4.1: cached (tag `stories`).
 */
const getCachedOtherPhotoStories = unstable_cache(
    async (excludeId: string, locale: Locale, limit: number): Promise<PhotoStoryData[]> => {
        const { data, error } = await publishedPhotoStories()
            .neq("id", excludeId)
            .order("published_at", { ascending: false, nullsFirst: false })
            .limit(limit);
        if (error) throw new Error(error.message);
        return ((data ?? []) as unknown as RawStoryRow[]).flatMap((row) => {
            const card = toCard(row, locale);
            return card ? [card] : [];
        });
    },
    ["photo-story-other"],
    { tags: [CACHE_TAGS.stories], revalidate: PUBLIC_CONTENT_REVALIDATE_SECONDS },
);

export async function getOtherPhotoStories(
    excludeId: string,
    locale: Locale = "en",
    limit = 3,
): Promise<PhotoStoryData[]> {
    if (!hasDatabase()) return [];
    try {
        return await getCachedOtherPhotoStories(excludeId, locale, limit);
    } catch (err) {
        logCacheFailure("getOtherPhotoStories", err);
        return [];
    }
}

/**
 * Most-viewed published essays — the sidebar "most viewed" rail.
 * Phase 4.1: cached (tag `stories`); view_count is an ornament so a 5-minute
 * window is an accepted trade for taking this query off the hot path.
 */
const getCachedMostViewedPhotoStories = unstable_cache(
    async (locale: Locale, limit: number): Promise<PhotoStoryData[]> => {
        const { data, error } = await publishedPhotoStories()
            .order("view_count", { ascending: false, nullsFirst: false })
            .limit(limit * 3);
        if (error) throw new Error(error.message);
        // view_count is only an ornament — guarantee at least three with a real
        // photo before giving up, so the rail never shows empty covers.
        const withCover: PhotoStoryData[] = [];
        for (const row of ((data ?? []) as unknown as RawStoryRow[])) {
            if (withCover.length >= limit) break;
            const card = toCard(row, locale);
            if (card && card.photos.length > 0) withCover.push(card);
        }
        return withCover;
    },
    ["photo-story-most-viewed"],
    { tags: [CACHE_TAGS.stories], revalidate: PUBLIC_CONTENT_REVALIDATE_SECONDS },
);

export async function getMostViewedPhotoStories(
    locale: Locale = "en",
    limit = 5,
): Promise<PhotoStoryData[]> {
    if (!hasDatabase()) return [];
    try {
        return await getCachedMostViewedPhotoStories(locale, limit);
    } catch (err) {
        logCacheFailure("getMostViewedPhotoStories", err);
        return [];
    }
}

/**
 * Archive stats for the landing band: essays, photographs, places.
 * Phase 4.1: cached (tag `stories`).
 */
const getCachedPhotoStoriesStats = unstable_cache(
    async (): Promise<{
        stories: number;
        photos: number;
        places: number;
    }> => {
        const { data, error } = await createAdminClient()
            .from("content_items")
            .select("media:media_assets(id), location:locations(name)")
            .eq("type", "photo_story")
            .eq("status", "published")
            .eq("is_archived", false);
        if (error) throw new Error(error.message);
        const rows = (data ?? []) as {
            media?: { id: string }[] | null;
            location?: { name: string } | { name: string }[] | null;
        }[];
        let photos = 0;
        const places = new Set<string>();
        for (const row of rows) {
            photos += row.media?.length ?? 0;
            const location = asOne(row.location);
            if (location?.name) places.add(location.name);
        }
        return { stories: rows.length, photos, places: places.size };
    },
    ["photo-story-stats"],
    { tags: [CACHE_TAGS.stories], revalidate: PUBLIC_CONTENT_REVALIDATE_SECONDS },
);

export async function getPhotoStoriesStats(): Promise<{
    stories: number;
    photos: number;
    places: number;
}> {
    if (!hasDatabase()) return { stories: 0, photos: 0, places: 0 };
    try {
        return await getCachedPhotoStoriesStats();
    } catch (err) {
        logCacheFailure("getPhotoStoriesStats", err);
        return { stories: 0, photos: 0, places: 0 };
    }
}

/**
 * Neighbouring essays for the detail-page prev/next navigation.
 * Phase 4.1: cached (tag `stories`); the `published_at` cursor keeps the cache
 * key stable per essay.
 */
const getCachedAdjacentPhotoStories = unstable_cache(
    async (
        currentId: string,
        publishedAt: string,
        locale: Locale,
    ): Promise<{ prev: PhotoStoryData | null; next: PhotoStoryData | null }> => {
        const [nextResult, prevResult] = await Promise.all([
            publishedPhotoStories()
                .gt("published_at", publishedAt)
                .order("published_at", { ascending: true })
                .limit(1),
            publishedPhotoStories()
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
    ["photo-story-adjacent"],
    { tags: [CACHE_TAGS.stories], revalidate: PUBLIC_CONTENT_REVALIDATE_SECONDS },
);

export async function getAdjacentPhotoStories(
    currentId: string,
    publishedAt: string,
    locale: Locale = "en",
): Promise<{ prev: PhotoStoryData | null; next: PhotoStoryData | null }> {
    if (!hasDatabase()) return { prev: null, next: null };
    try {
        return await getCachedAdjacentPhotoStories(currentId, publishedAt, locale);
    } catch (err) {
        logCacheFailure("getAdjacentPhotoStories", err);
        return { prev: null, next: null };
    }
}

/** All slugs of published photo stories (locale-agnostic). */
async function allPhotoStorySlugs(): Promise<string[]> {
    if (!hasDatabase()) return [];
    const { data } = await safe(
        createAdminClient()
            .from("content_items")
            .select("slug")
            .eq("type", "photo_story")
            .eq("status", "published")
            .eq("is_archived", false)
            .not("published_at", "is", null),
    );
    return (data ?? []).flatMap((row) => {
        const item = row as { slug: string | null };
        return item.slug ? [item.slug] : [];
    });
}

/** Prerenders every published photo story at build time. */
export async function generateStaticSlugs(): Promise<{ slug: string }[]> {
    const slugs = await allPhotoStorySlugs();
    return slugs.map((slug) => ({ slug }));
}






