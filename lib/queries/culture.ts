import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
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
            console.error("[culture]", error.message);
            return { data: null, count: null, error };
        }
        return { data, count: count ?? null, error: null };
    } catch (err) {
        console.error("[culture]", err);
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
 */
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
    const search = options.search?.trim();
    const category = options.category?.trim();
    const location = options.location?.trim();

    let query = publishedCulture(true);
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

    const from = (page - 1) * CULTURE_PAGE_SIZE;
    const { data, count: total } = await safe(
        query
            .order("published_at", { ascending: false, nullsFirst: false })
            .range(from, from + CULTURE_PAGE_SIZE - 1),
    );

    const locale = options.locale ?? "en";
    const articles = (data ?? []).flatMap((row) => {
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
}

/** One culture article by slug, for the detail page (null when not found). */
export async function getCultureBySlug(
    slug: string,
    locale: Locale = "en",
): Promise<CultureArticle | null> {
    if (!hasDatabase()) return null;
    const { data } = await safe(
        publishedCulture()
            .eq("slug", sanitizePhrase(slug))
            .limit(1),
    );
    const row = asOne(data);
    return row ? toCard(row, locale) : null;
}

/** Full-bleed featured culture article for the landing page. */
export async function getFeaturedCulture(locale: Locale = "en"): Promise<CultureArticle | null> {
    if (!hasDatabase()) return null;
    const { data } = await safe(
        createAdminClient()
            .from("content_items")
            .select(CULTURE_SELECT_LEFT)
            .eq("type", "culture")
            .eq("status", "published")
            .eq("is_archived", false)
            .not("published_at", "is", null)
            .order("published_at", { ascending: false, nullsFirst: false })
            .limit(1),
    );
    const row = asOne(data);
    return row ? toCard(row, locale) : null;
}

/** Upcoming events with a future or current start time, newest first. */
export async function getUpcomingEvents(
    locale: Locale = "en",
    limit = 10,
): Promise<EventData[]> {
    if (!hasDatabase()) return [];
    const { data } = await safe(
        createAdminClient()
            .from("content_items")
            .select(CULTURE_SELECT)
            .eq("type", "culture")
            .eq("status", "published")
            .eq("is_archived", false)
            .not("published_at", "is", null)
            .not("events.starts_at", "is", null)
            .gte("events.starts_at", new Date().toISOString())
            .order("events.starts_at", { ascending: true })
            .limit(limit),
    );
    return (data ?? []).flatMap((row) => {
        const card = toEventCard(row, locale);
        return card ? [card] : [];
    });
}

/** Single event by id (null when not found). */
export async function getEventById(
    id: string,
    locale: Locale = "en",
): Promise<EventData | null> {
    if (!hasDatabase()) return null;
    const { data } = await safe(
        createAdminClient()
            .from("content_items")
            .select(CULTURE_SELECT)
            .eq("type", "culture")
            .eq("status", "published")
            .eq("is_archived", false)
            .eq("id", id)
            .not("events.starts_at", "is", null)
            .limit(1),
    );
    const row = asOne(data);
    return row ? toEventCard(row, locale) : null;
}

/** Culture articles for a specific location, newest first. */
export async function getCultureByLocation(
    locationSlug: string,
    locale: Locale = "en",
    limit = 10,
): Promise<CultureArticle[]> {
    if (!hasDatabase()) return [];
    const { data } = await safe(
        publishedCulture()
            .eq("locations.slug", sanitizePhrase(locationSlug))
            .order("published_at", { ascending: false, nullsFirst: false })
            .limit(limit),
    );
    return (data ?? []).flatMap((row) => {
        const card = toCard(row, locale);
        return card ? [card] : [];
    });
}
