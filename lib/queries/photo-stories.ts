import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
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
            console.error("[photo-stories]", error.message);
            return { data: null, count: null, error };
        }
        return { data, count: count ?? null, error: null };
    } catch (err) {
        console.error("[photo-stories]", err);
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
 */
export async function getFeaturedPhotoStory(): Promise<PhotoStoryData | null> {
    if (!hasDatabase()) return null;
    const withMedia = await safe(
        createAdminClient()
            .from("content_items")
            .select(FEATURED_SELECT)
            .eq("type", "photo_story")
            .eq("status", "published")
            .eq("is_archived", false)
            .not("published_at", "is", null)
            .order("published_at", { ascending: false, nullsFirst: false })
            .limit(1),
    );
    const withMediaRow = asOne(withMedia.data);
    if (withMediaRow) return toCard(withMediaRow, "en");

    const anyStory = await safe(
        publishedPhotoStories()
            .order("published_at", { ascending: false, nullsFirst: false })
            .limit(1),
    );
    const anyRow = asOne(anyStory.data);
    return anyRow ? toCard(anyRow, "en") : null;
}

/**
 * Paged grid of published photo stories, newest first. Search and category
 * match a phrase across title/excerpt in any locale; location narrows to
 * the story's `locations` row.
 */
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
    const search = filters.search?.trim();
    const category = filters.category?.trim();
    const location = filters.location?.trim();

    let query = publishedPhotoStories(true);
    if (search) {
        query = query.or(
            `content_translations.title.ilike.*${sanitizePhrase(search)}*,` +
                `content_translations.excerpt.ilike.*${sanitizePhrase(search)}*`,
        );
    }
    if (category) {
        query = query.or(
            `categories.slug.eq.${sanitizePhrase(category)},` +
                `categories.category_translations.name.ilike.*${sanitizePhrase(category)}*`,
        );
    }
    if (location) {
        query = query.eq("locations.slug", sanitizePhrase(location));
    }

    const from = (page - 1) * PHOTO_STORIES_PAGE_SIZE;
    const { data, count: total } = await safe(
        query
            .order("published_at", { ascending: false, nullsFirst: false })
            .range(from, from + PHOTO_STORIES_PAGE_SIZE - 1),
    );

    const locale = filters.locale ?? "en";
    const stories = (data ?? []).flatMap((row) => {
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
}

/**
 * Filter facets, derived from the shared `categories` table scoped to
 * `photo_story`. Totals are counted from the published archive in a single
 * light query so the chips and filtered grid always agree; empty
 * categories are hidden.
 */
export async function getPhotoStoryCategories(): Promise<CategoryFacet[]> {
    if (!hasDatabase()) return [];
    const supabase = createAdminClient();

    const [categoriesResult, countsResult] = await Promise.all([
        safe(
            supabase
                .from("categories")
                .select("id, slug, category_translations(locale, name)")
                .eq("content_type", "photo_story")
                .eq("is_active", true)
                .order("sort_order", { ascending: true }),
        ),
        safe(
            supabase
                .from("content_items")
                .select("category_id")
                .eq("type", "photo_story")
                .eq("status", "published")
                .eq("is_archived", false)
                .not("published_at", "is", null),
        ),
    ]);

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
}

/** Location filter facets from the shared `locations` table (active only). */
export async function getPhotoStoryLocations(): Promise<
    { slug: string; name: string }[]
> {
    if (!hasDatabase()) return [];
    const supabase = createAdminClient();
    const { data } = await safe(
        supabase
            .from("locations")
            .select("slug, name")
            .eq("is_active", true)
            .order("name", { ascending: true }),
    );
    return (data ?? []).flatMap((row) => {
        const location = row as { slug: string; name: string | null };
        return location.name ? [{ slug: location.slug, name: location.name }] : [];
    });
}

/** One photo story by slug, for the detail page (null when not found). */
export async function getPhotoStoryBySlug(
    slug: string,
    locale: Locale = "en",
): Promise<PhotoStoryData | null> {
    if (!hasDatabase()) return null;
    const { data } = await safe(
        publishedPhotoStories()
            .eq("slug", sanitizePhrase(slug))
            .limit(1),
    );
    const row = asOne(data);
    return row ? toCard(row, locale) : null;
}

/** Newest photo stories excluding one — the detail page's "more essays" rail. */
export async function getOtherPhotoStories(
    excludeId: string,
    locale: Locale = "en",
    limit = 3,
): Promise<PhotoStoryData[]> {
    if (!hasDatabase()) return [];
    const { data } = await safe(
        publishedPhotoStories()
            .neq("id", excludeId)
            .order("published_at", { ascending: false, nullsFirst: false })
            .limit(limit),
    );
    return (data ?? []).flatMap((row) => {
        const card = toCard(row, locale);
        return card ? [card] : [];
    });
}

/** Most-viewed published essays — the sidebar "most viewed" rail. */
export async function getMostViewedPhotoStories(
    locale: Locale = "en",
    limit = 5,
): Promise<PhotoStoryData[]> {
    if (!hasDatabase()) return [];
    const { data } = await safe(
        publishedPhotoStories()
            .order("view_count", { ascending: false, nullsFirst: false })
            .limit(limit * 3),
    );
    // view_count is only an ornament — guarantee at least three with a real
    // photo before giving up, so the rail never shows empty covers.
    const withCover: PhotoStoryData[] = [];
    for (const row of data ?? []) {
        if (withCover.length >= limit) break;
        const card = toCard(row, locale);
        if (card && card.photos.length > 0) withCover.push(card);
    }
    return withCover;
}

/** Archive stats for the landing band: essays, photographs, places. */
export async function getPhotoStoriesStats(): Promise<{
    stories: number;
    photos: number;
    places: number;
}> {
    if (!hasDatabase()) return { stories: 0, photos: 0, places: 0 };
    const { data } = await safe(
        createAdminClient()
            .from("content_items")
            .select("media:media_assets(id), location:locations(name)")
            .eq("type", "photo_story")
            .eq("status", "published")
            .eq("is_archived", false),
    );
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
}

/** Neighbouring essays for the detail-page prev/next navigation. */
export async function getAdjacentPhotoStories(
    currentId: string,
    publishedAt: string,
    locale: Locale = "en",
): Promise<{ prev: PhotoStoryData | null; next: PhotoStoryData | null }> {
    if (!hasDatabase()) return { prev: null, next: null };

    const [nextResult, prevResult] = await Promise.all([
        safe(
            publishedPhotoStories()
                .gt("published_at", publishedAt)
                .order("published_at", { ascending: true })
                .limit(1),
        ),
        safe(
            publishedPhotoStories()
                .lt("published_at", publishedAt)
                .order("published_at", { ascending: false })
                .limit(1),
        ),
    ]);

    const nextRow = asOne(nextResult.data);
    const prevRow = asOne(prevResult.data);
    return {
        prev: prevRow ? toCard(prevRow, locale) : null,
        next: nextRow && nextRow.id !== currentId ? toCard(nextRow, locale) : null,
    };
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






