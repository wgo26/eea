import "server-only";

import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import { CACHE_TAGS, PUBLIC_CONTENT_REVALIDATE_SECONDS } from "@/lib/cache/tags";
import type { Locale } from "@/lib/i18n";
import type { StoryCardData } from "@/lib/queries/home";

/**
 * Data access for the Culture vertical (spec §3.3).
 *
 * Mirrors the conventions of `lib/queries/photo-stories.ts`: the admin client
 * plus a `safe()` wrapper, aliased PostgREST embeds, and locale-resolved
 * translations. Culture items are `content_items` with `type = "culture"`;
 * photographs live in `media_assets` ordered by `sort_order` with the cover
 * flagged by `is_cover`. Events additionally pull from the `events` table.
 */
export const CULTURE_PAGE_SIZE = 12;

export type CultureArticle = StoryCardData & {
    slug: string;
    body?: string | null;
    authorName?: string | null;
    authorId?: string | null;
    locationSlug?: string | null;
    viewCount?: number;
    /** Event-specific fields */
    eventDate?: string | null;
    eventTime?: string | null;
    venue?: string | null;
    ticketInfo?: string | null;
    organizer?: string | null;
    isEvent?: boolean;
};

export type EventData = CultureArticle & {
    eventDate: string | null;
    eventTime: string | null;
    venue: string | null;
    ticketInfo: string | null;
    organizer: string | null;
};

/** Landing-page filter facet, derived from the shared `categories` table. */
export type CategoryFacet = {
    id: string;
    slug: string;
    name: string;
    total: number;
};

/** Raw row shape returned by the shared culture select. */
type RawCultureRow = {
    id: string;
    slug: string | null;
    verification: string | null;
    published_at: string | null;
    view_count: number | null;
    author?: { id: string; display_name: string | null } | { id: string; display_name: string | null }[] | null;
    location?: { slug: string | null; name: string | null } | { slug: string | null; name: string | null }[] | null;
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
          }[]
        | null;
    events?:
        | { starts_at: string | null; ends_at: string | null; venue_name: string | null; ticket_url: string | null; organizer_name: string | null }
        | { starts_at: string | null; ends_at: string | null; venue_name: string | null; ticket_url: string | null; organizer_name: string | null }[]
        | null;
};

const CULTURE_SELECT = `id, slug, verification, published_at, view_count,
    location:locations(slug, name),
    category:categories(category_translations(locale, name)),
    translations:content_translations(locale, title, excerpt, body),
    media:media_assets(public_url, alt_text, caption, photographer_credit, is_cover, sort_order),
    author:profiles!content_items_author_id_fkey(id, display_name),
    events!inner(starts_at, ends_at, venue_name, ticket_url, organizer_name)`;

/** Same as CULTURE_SELECT but with a left join on events for non-event content. */
const CULTURE_SELECT_LEFT = `id, slug, verification, published_at, view_count,
    location:locations(slug, name),
    category:categories(category_translations(locale, name)),
    translations:content_translations(locale, title, excerpt, body),
    media:media_assets(public_url, alt_text, caption, photographer_credit, is_cover, sort_order),
    author:profiles!content_items_author_id_fkey(id, display_name),
    events(starts_at, ends_at, venue_name, ticket_url, organizer_name)`;

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
    logger.error("culture", `cached query failed (${fn})`, {
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

/** Base builder for every public culture query (published, unarchived). */
function publishedCulture(countExact = false) {
    const supabase = createAdminClient();
    return supabase
        .from("content_items")
        .select(CULTURE_SELECT_LEFT, countExact ? { count: "exact" } : undefined)
        .eq("type", "culture")
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

/** Detail resolvers accept the raw id or the public slug (mirrors notices). */
function isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

/** Maps one raw row to the shared card shape (+ culture extras); null without a title. */
function toCard(row: RawCultureRow, locale: Locale): CultureArticle | null {
    const translation = pickLocalized(row.translations, locale);
    if (!translation?.title) return null;
    const location = asOne(row.location);
    const category = asOne(row.category);
    const cover = (row.media ?? []).find((m) => m.is_cover) ?? (row.media ?? [])[0] ?? null;
    const author = asOne(row.author);
    const event = asOne(row.events);
    const isEvent = Boolean(event?.starts_at);
    return {
        id: row.id,
        slug: row.slug ?? row.id,
        type: "culture",
        href: isEvent
            ? `/culture/events/${row.slug ?? row.id}`
            : `/culture/${row.slug ?? row.id}`,
        title: translation.title,
        excerpt: translation.excerpt ?? null,
        imageUrl: cover?.public_url ?? null,
        location: location?.name ?? null,
        category: category
            ? (pickLocalized(category.category_translations, locale)?.name ?? null)
            : null,
        credit: cover?.photographer_credit ?? null,
        verification: row.verification ?? null,
        publishedAt: row.published_at,
        viewCount: Number(row.view_count ?? 0),
        body: translation.body ?? null,
        authorName: author?.display_name ?? null,
        authorId: author?.id ?? null,
        locationSlug: location?.slug ?? null,
        eventDate: event?.starts_at ?? null,
        eventTime: event?.ends_at ?? null,
        venue: event?.venue_name ?? null,
        ticketInfo: event?.ticket_url ?? null,
        organizer: event?.organizer_name ?? null,
        isEvent,
    };
}

function toEventCard(row: RawCultureRow, locale: Locale): EventData | null {
    const base = toCard(row, locale);
    if (!base) return null;
    return {
        ...base,
        eventDate: base.eventDate ?? null,
        eventTime: base.eventTime ?? null,
        venue: base.venue ?? null,
        ticketInfo: base.ticketInfo ?? null,
        organizer: base.organizer ?? null,
    } as EventData;
}

/**
 * Paged grid of published culture articles, newest first. Search and category
 * match a phrase across title/excerpt in any locale; location narrows to
 * the item's `locations` row.
 * Phase 4.1: cached (tag `culture`). Inputs are sanitized in the wrapper so
 * the cache key is canonical.
 */
const getCachedCultureArticles = unstable_cache(
    async (
        search: string | undefined,
        category: string | undefined,
        location: string | undefined,
        locale: Locale,
        page: number,
    ): Promise<{ articles: CultureArticle[]; total: number; page: number; pageCount: number }> => {
        let query = publishedCulture(true);
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

        const from = (page - 1) * CULTURE_PAGE_SIZE;
        const {
            data,
            count: total,
            error,
        } = await query
            .order("published_at", { ascending: false, nullsFirst: false })
            .range(from, from + CULTURE_PAGE_SIZE - 1);
        if (error) throw new Error(error.message);

        const articles = ((data ?? []) as unknown as RawCultureRow[]).flatMap((row) => {
            const card = toCard(row, locale);
            return card ? [card] : [];
        });
        const totalCount = total ?? 0;
        return {
            articles,
            total: totalCount,
            page,
            pageCount: Math.max(1, Math.ceil(totalCount / CULTURE_PAGE_SIZE)),
        };
    },
    ["culture-articles"],
    { tags: [CACHE_TAGS.culture], revalidate: PUBLIC_CONTENT_REVALIDATE_SECONDS },
);

export async function getCultureArticles(options: {
    search?: string;
    category?: string;
    location?: string;
    locale?: Locale;
    page?: number;
}): Promise<{ articles: CultureArticle[]; total: number; page: number; pageCount: number }> {
    if (!hasDatabase()) {
        return { articles: [], total: 0, page: 1, pageCount: 1 };
    }
    const page = Math.max(1, options.page ?? 1);
    const locale = options.locale ?? "en";
    // Sanitize before the cache call so one canonical string serves every
    // raw spelling of the same filter value.
    const search = options.search?.trim() ? sanitizePhrase(options.search.trim()) || undefined : undefined;
    const category = options.category?.trim()
        ? sanitizePhrase(options.category.trim()) || undefined
        : undefined;
    const location = options.location?.trim()
        ? sanitizePhrase(options.location.trim()) || undefined
        : undefined;
    try {
        return await getCachedCultureArticles(search, category, location, locale, page);
    } catch (err) {
        logCacheFailure("getCultureArticles", err);
        return { articles: [], total: 0, page, pageCount: 1 };
    }
}

/**
 * One culture article by slug, for the detail page (null when not found).
 * Phase 4.1: cached (tag `culture`) — this is the hot read behind the ISR'd
 * article pages; publish events invalidate via revalidateTag('culture', 'max').
 */
const getCachedCultureBySlug = unstable_cache(
    async (slug: string, locale: Locale): Promise<CultureArticle | null> => {
        const { data, error } = await publishedCulture()
            .eq("slug", slug)
            .limit(1);
        if (error) throw new Error(error.message);
        const row = asOne((data ?? []) as unknown as RawCultureRow[]);
        return row ? toCard(row, locale) : null;
    },
    ["culture-by-slug"],
    { tags: [CACHE_TAGS.culture], revalidate: PUBLIC_CONTENT_REVALIDATE_SECONDS },
);

export async function getCultureBySlug(
    slug: string,
    locale: Locale = "en",
): Promise<CultureArticle | null> {
    if (!hasDatabase()) return null;
    // Sanitize before both the cache key and the query so one canonical
    // string serves every raw spelling of the same URL segment.
    const sanitized = sanitizePhrase(slug);
    if (!sanitized) return null;
    try {
        return await getCachedCultureBySlug(sanitized, locale);
    } catch (err) {
        logCacheFailure("getCultureBySlug", err);
        return null;
    }
}

/**
 * Full-bleed featured culture article for the landing page.
 * Phase 4.1: cached (tag `culture`).
 */
const getCachedFeaturedCulture = unstable_cache(
    async (locale: Locale): Promise<CultureArticle | null> => {
        const { data, error } = await createAdminClient()
            .from("content_items")
            .select(CULTURE_SELECT_LEFT)
            .eq("type", "culture")
            .eq("status", "published")
            .eq("is_archived", false)
            .not("published_at", "is", null)
            .order("published_at", { ascending: false, nullsFirst: false })
            .limit(1);
        if (error) throw new Error(error.message);
        const row = asOne((data ?? []) as unknown as RawCultureRow[]);
        return row ? toCard(row, locale) : null;
    },
    ["culture-featured"],
    { tags: [CACHE_TAGS.culture], revalidate: PUBLIC_CONTENT_REVALIDATE_SECONDS },
);

export async function getFeaturedCulture(locale: Locale = "en"): Promise<CultureArticle | null> {
    if (!hasDatabase()) return null;
    try {
        return await getCachedFeaturedCulture(locale);
    } catch (err) {
        logCacheFailure("getFeaturedCulture", err);
        return null;
    }
}

/**
 * Upcoming events with a future or current start time, newest first.
 * Phase 4.1: cached (tag `culture`); the "now" cursor is evaluated once per
 * cache window, which is fine for a 5-minute revalidate backstop.
 */
const getCachedUpcomingEvents = unstable_cache(
    async (locale: Locale, limit: number): Promise<EventData[]> => {
        const { data, error } = await createAdminClient()
            .from("content_items")
            .select(CULTURE_SELECT)
            .eq("type", "culture")
            .eq("status", "published")
            .eq("is_archived", false)
            .not("published_at", "is", null)
            .not("events.starts_at", "is", null)
            .gte("events.starts_at", new Date().toISOString())
            .order("events.starts_at", { ascending: true })
            .limit(limit);
        if (error) throw new Error(error.message);
        return ((data ?? []) as unknown as RawCultureRow[]).flatMap((row) => {
            const card = toEventCard(row, locale);
            return card ? [card] : [];
        });
    },
    ["culture-upcoming-events"],
    { tags: [CACHE_TAGS.culture], revalidate: PUBLIC_CONTENT_REVALIDATE_SECONDS },
);

export async function getUpcomingEvents(
    locale: Locale = "en",
    limit = 10,
): Promise<EventData[]> {
    if (!hasDatabase()) return [];
    try {
        return await getCachedUpcomingEvents(locale, limit);
    } catch (err) {
        logCacheFailure("getUpcomingEvents", err);
        return [];
    }
}

/**
 * Single event by UUID or slug, for the detail page (null when not found).
 * Phase 4.1: cached (tag `culture`) — this is the hot read behind the ISR'd
 * event pages.
 */
const getCachedEventById = unstable_cache(
    async (identifier: string, locale: Locale): Promise<EventData | null> => {
        const query = createAdminClient()
            .from("content_items")
            .select(CULTURE_SELECT)
            .eq("type", "culture")
            .eq("status", "published")
            .eq("is_archived", false)
            .not("events.starts_at", "is", null);
        const { data, error } = await (
            isUuid(identifier) ? query.eq("id", identifier) : query.eq("slug", identifier)
        ).limit(1);
        if (error) throw new Error(error.message);
        const row = asOne((data ?? []) as unknown as RawCultureRow[]);
        return row ? toEventCard(row, locale) : null;
    },
    ["culture-event-by-id"],
    { tags: [CACHE_TAGS.culture], revalidate: PUBLIC_CONTENT_REVALIDATE_SECONDS },
);

export async function getEventById(
    id: string,
    locale: Locale = "en",
): Promise<EventData | null> {
    if (!hasDatabase()) return null;
    // Sanitize before the cache key so one canonical string serves every raw
    // spelling of the same URL segment.
    const identifier = sanitizePhrase(id);
    if (!identifier) return null;
    try {
        return await getCachedEventById(identifier, locale);
    } catch (err) {
        logCacheFailure("getEventById", err);
        return null;
    }
}

/**
 * Culture articles for a specific location, newest first.
 * Phase 4.1: cached (tag `culture`).
 */
const getCachedCultureByLocation = unstable_cache(
    async (
        locationSlug: string,
        locale: Locale,
        limit: number,
    ): Promise<CultureArticle[]> => {
        const { data, error } = await publishedCulture()
            .eq("locations.slug", locationSlug)
            .order("published_at", { ascending: false, nullsFirst: false })
            .limit(limit);
        if (error) throw new Error(error.message);
        return ((data ?? []) as unknown as RawCultureRow[]).flatMap((row) => {
            const card = toCard(row, locale);
            return card ? [card] : [];
        });
    },
    ["culture-by-location"],
    { tags: [CACHE_TAGS.culture], revalidate: PUBLIC_CONTENT_REVALIDATE_SECONDS },
);

export async function getCultureByLocation(
    locationSlug: string,
    locale: Locale = "en",
    limit = 10,
): Promise<CultureArticle[]> {
    if (!hasDatabase()) return [];
    // Sanitize before the cache key so one canonical string serves every raw
    // spelling of the same location slug.
    const sanitized = sanitizePhrase(locationSlug);
    if (!sanitized) return [];
    try {
        return await getCachedCultureByLocation(sanitized, locale, limit);
    } catch (err) {
        logCacheFailure("getCultureByLocation", err);
        return [];
    }
}
