import "server-only";

import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import { CACHE_TAGS, PUBLIC_CONTENT_REVALIDATE_SECONDS } from "@/lib/cache/tags";
import type { Locale } from "@/lib/i18n";
import type { MediaAttachment } from "@/lib/media/attachments";
import { mapAttachments, supportingMedia } from "@/lib/media/attachments";

/**
 * Data access for the Buy & Sell vertical.
 *
 * Follows the conventions of `lib/queries/photo-stories.ts`: the admin client
 * plus a `safe()` wrapper (a DB hiccup must never take the page down), aliased
 * PostgREST embeds, and locale-resolved translations. Listings are
 * `content_items` with `type = "listing"`; listing metadata lives in the
 * `listings` table, photos in `media_assets`, and location in `locations`.
 */
export const PAGE_SIZE = 12;

/** A single photo attached to a listing. */
export type ListingPhoto = {
    url: string;
    alt: string | null;
};

/** Full listing shape for public consumption.
 * NOTE: this shape never carries raw seller PII. `sellerContact` is a
 * deprecated always-null field kept for type compatibility — contact details
 * are only available on demand via the rate-limited `revealSellerContact`
 * server action, never in SSR HTML or list payloads. */
export type ListingData = {
    id: string;
    type: string;
    href: string;
    title: string;
    excerpt: string | null;
    imageUrl: string | null;
    location: string | null;
    locationSlug?: string | null;
    category: string | null;
    credit: string | null;
    verification: string | null;
    publishedAt: string | null;
    price: number | null;
    currency: string | null;
    sellerName: string | null;
    /** @deprecated Always null — use `revealSellerContact` for gated access. */
    sellerContact: string | null;
    listingStatus: string | null;
    expiresAt: string | null;
    photos?: ListingPhoto[];
    body?: string | null;
    hasVideo?: boolean;
    hasAudio?: boolean;
    attachments?: MediaAttachment[];
};

/** Raw row shape returned by the shared listing select.
 * Grid/list selects NEVER include contact PII columns (phone/email/whatsapp)
 * — presence flags for the detail page come from LISTING_DETAIL_SELECT and
 * are reduced to booleans in `toListingDetail` before leaving the server. */
type RawListingRow = {
    id: string;
    slug: string | null;
    verification: string | null;
    published_at: string | null;
    expires_at: string | null;
    location?: { name: string | null; slug: string | null } | { name: string | null; slug: string | null }[] | null;
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
              is_cover: boolean | null;
              sort_order: number | null;
              photographer_credit: string | null;
              kind: string | null;
              mime_type: string | null;
          }[]
        | null;
    listing?:
        | {
              price: number | null;
              currency: string | null;
              listing_status: string | null;
              seller_name?: string | null;
          }
        | {
              price: number | null;
              currency: string | null;
              listing_status: string | null;
              seller_name?: string | null;
          }[]
        | null;
};

const LISTING_SELECT = `id, slug, verification, published_at, expires_at,
    location:locations(name, slug),
    category:categories(category_translations(locale, name)),
    translations:content_translations(locale, title, excerpt, body),
    media:media_assets(public_url, alt_text, caption, is_cover, sort_order, photographer_credit, kind, mime_type),
    listing:listings(price, currency, listing_status, seller_name)`;

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
            logger.error("buy-sell", "query failed", { error: error.message });
            return { data: null, count: null, error };
        }
        return { data, count: count ?? null, error: null };
    } catch (err) {
        logger.error("buy-sell", "query exception", { error: err instanceof Error ? err.message : String(err) });
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
    logger.error("buy-sell", `cached query failed (${fn})`, {
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

/** PostgREST `or()` phrases cannot contain commas or wildcard characters. */
function sanitizePhrase(input: string): string {
    return input
        .replace(/[,()%\\]/g, " ")
        .trim()
        .slice(0, 80);
}

/** Base builder for every public listing query (published, unarchived). */
function publishedListings(countExact = false) {
    const supabase = createAdminClient();
    return supabase
        .from("content_items")
        .select(LISTING_SELECT, countExact ? { count: "exact" } : undefined)
        .eq("type", "listing")
        .eq("status", "published")
        .eq("is_archived", false)
        .not("published_at", "is", null);
}

/** Orders embedded media rows by `sort_order` into the photo gallery. */
function mapPhotos(row: RawListingRow): ListingPhoto[] {
    return (row.media ?? [])
        .filter((m) => (m.kind ?? 'image') === 'image')
        .slice()
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .map((photo) => ({
            url: photo.public_url ?? "",
            alt: photo.alt_text,
        }))
        .filter((photo) => photo.url !== "");
}

/** Maps one raw row to the listing shape; null without a title. */
function toListing(row: RawListingRow, locale: Locale): ListingData | null {
    const translation = pickLocalized(row.translations, locale);
    if (!translation?.title) return null;
    const location = asOne(row.location);
    const category = asOne(row.category);
    const listing = asOne(row.listing);
    const photos = mapPhotos(row);
    const allMedia = mapAttachments(row.media ?? []);
    const cover = photos[0] ?? null;
    return {
        id: row.id,
        type: "listing",
        href: `/buy-sell/${row.slug ?? row.id}`,
        title: translation.title,
        excerpt: translation.excerpt ?? null,
        imageUrl: cover?.url ?? null,
        location: location?.name ?? null,
        locationSlug: location?.slug ?? null,
        category: category
            ? (pickLocalized(category.category_translations, locale)?.name ?? null)
            : null,
        credit: cover?.alt ?? null,
        verification: row.verification ?? null,
        publishedAt: row.published_at,
        price: listing?.price ?? null,
        currency: listing?.currency ?? null,
        sellerName: listing?.seller_name?.trim() || null,
        // Deprecated field: never populated from the database. Raw contact
        // values must not enter list payloads or SSR HTML (audit §1.1).
        sellerContact: null,
        listingStatus: listing?.listing_status ?? null,
        expiresAt: row.expires_at,
        photos,
        body: translation.body ?? null,
        hasVideo: allMedia.some((m) => m.kind === 'video'),
        hasAudio: allMedia.some((m) => m.kind === 'audio'),
        attachments: supportingMedia(allMedia),
    };
}

/**
 * Paged grid of published listings, newest first. Search matches title/excerpt
 * in any locale; category narrows by slug or translated name; location narrows
 * by slug.
 * Phase 4.1: cached (tag `listings`). Inputs are sanitized BEFORE the cache
 * call so the cache key is canonical; DB errors throw inside the cached scope
 * (never cached) and the wrapper falls back to the empty grid.
 */
const getCachedListings = unstable_cache(
    async (
        search: string | undefined,
        category: string | undefined,
        location: string | undefined,
        sort: "newest" | "price_asc" | "price_desc",
        locale: Locale,
        page: number,
    ): Promise<{ listings: ListingData[]; total: number; page: number; pageCount: number }> => {
        let query = publishedListings(true);
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

        // Exclude expired listings
        const now = new Date().toISOString();
        query = query.or(`expires_at.is.null,expires_at.gt.${now}`);

        const from = (page - 1) * PAGE_SIZE;

        switch (sort) {
            case 'price_asc':
                query = query.order("listing.price", { ascending: true, nullsFirst: true });
                break;
            case 'price_desc':
                query = query.order("listing.price", { ascending: false, nullsFirst: false });
                break;
            case 'newest':
            default:
                query = query.order("published_at", { ascending: false, nullsFirst: false });
                break;
        }

        const { data, count: total, error } = await query.range(from, from + PAGE_SIZE - 1);
        if (error) throw new Error(error.message);

        const listings = (data ?? []).flatMap((row) => {
            const listing = toListing(row, locale);
            return listing ? [listing] : [];
        });
        const totalCount = total ?? 0;
        return {
            listings,
            total: totalCount,
            page,
            pageCount: Math.max(1, Math.ceil(totalCount / PAGE_SIZE)),
        };
    },
    ["listings-grid"],
    { tags: [CACHE_TAGS.listings], revalidate: PUBLIC_CONTENT_REVALIDATE_SECONDS },
);

export async function getListings(options: {
    search?: string;
    category?: string;
    location?: string;
    sort?: 'newest' | 'price_asc' | 'price_desc';
    locale?: Locale;
    page?: number;
}): Promise<{ listings: ListingData[]; total: number; page: number; pageCount: number }> {
    if (!hasDatabase()) {
        return { listings: [], total: 0, page: 1, pageCount: 1 };
    }
    // Sanitize before the cache call so the cache key is canonical.
    const page = Math.max(1, options.page ?? 1);
    const search = sanitizePhrase(options.search?.trim() ?? "") || undefined;
    const category = sanitizePhrase(options.category?.trim() ?? "") || undefined;
    const location = sanitizePhrase(options.location?.trim() ?? "") || undefined;
    const sort =
        options.sort === "price_asc" || options.sort === "price_desc"
            ? options.sort
            : "newest";
    const locale = options.locale ?? "en";
    try {
        return await getCachedListings(search, category, location, sort, locale, page);
    } catch (err) {
        logCacheFailure("getListings", err);
        return { listings: [], total: 0, page: 1, pageCount: 1 };
    }
}

/** One listing by id, for the detail page (null when not found). */
export async function getListingById(id: string, locale: Locale = "en"): Promise<ListingData | null> {
    if (!hasDatabase()) return null;
    const { data } = await safe(
        publishedListings()
            .eq("id", sanitizePhrase(id))
            .limit(1),
    );
    const row = asOne(data);
    return row ? toListing(row, locale) : null;
}

/** One listing by slug (tries slug first, falls back to id). */
export async function getListingBySlugOrId(slugOrId: string, locale: Locale = "en"): Promise<ListingData | null> {
    if (!hasDatabase()) return null;
    // Try slug first
    const { data: bySlug } = await safe(
        publishedListings()
            .eq("slug", sanitizePhrase(slugOrId))
            .limit(1),
    );
    const slugRow = asOne(bySlug);
    if (slugRow) return toListing(slugRow, locale);
    // Fallback to id
    return getListingById(slugOrId, locale);
}

/**
 * Full-bleed featured listing for the landing page: newest published listing.
 * Phase 4.1: cached (tag `listings`).
 */
const getCachedFeaturedListing = unstable_cache(
    async (locale: Locale): Promise<ListingData | null> => {
        const { data, error } = await publishedListings()
            .order("published_at", { ascending: false, nullsFirst: false })
            .limit(1);
        if (error) throw new Error(error.message);
        const row = asOne(data);
        return row ? toListing(row, locale) : null;
    },
    ["listings-featured"],
    { tags: [CACHE_TAGS.listings], revalidate: PUBLIC_CONTENT_REVALIDATE_SECONDS },
);

/** Full-bleed featured listing for the landing page: newest published listing. */
export async function getFeaturedListing(locale: Locale = "en"): Promise<ListingData | null> {
    if (!hasDatabase()) return null;
    try {
        return await getCachedFeaturedListing(locale);
    } catch (err) {
        logCacheFailure("getFeaturedListing", err);
        return null;
    }
}

/**
 * Listings by location slug, newest first.
 * Phase 4.1: cached (tag `listings`).
 */
const getCachedListingsByLocation = unstable_cache(
    async (
        locationSlug: string,
        locale: Locale,
        limit: number,
    ): Promise<ListingData[]> => {
        const { data, error } = await publishedListings()
            .eq("locations.slug", locationSlug)
            .order("published_at", { ascending: false, nullsFirst: false })
            .limit(limit);
        if (error) throw new Error(error.message);
        return (data ?? []).flatMap((row) => {
            const listing = toListing(row, locale);
            return listing ? [listing] : [];
        });
    },
    ["listings-by-location"],
    { tags: [CACHE_TAGS.listings], revalidate: PUBLIC_CONTENT_REVALIDATE_SECONDS },
);

/** Listings by location slug, newest first. */
export async function getListingsByLocation(
    locationSlug: string,
    locale: Locale = "en",
    limit = 6,
): Promise<ListingData[]> {
    if (!hasDatabase()) return [];
    // Sanitize before the cache call so the cache key is canonical.
    const sanitized = sanitizePhrase(locationSlug);
    if (!sanitized) return [];
    try {
        return await getCachedListingsByLocation(sanitized, locale, limit);
    } catch (err) {
        logCacheFailure("getListingsByLocation", err);
        return [];
    }
}

/**
 * Full detail shape for the Buy & Sell detail page. Extends `ListingData`
 * with presence flags for the seller contact methods (phone / email / WhatsApp).
 * Raw PII contact values are never exposed in this public query and must be
 * requested on-demand via the `revealSellerContact` server action.
 */
export type ListingDetailData = ListingData & {
    hasPhone: boolean;
    hasEmail: boolean;
    hasWhatsapp: boolean;
    sellerIsVerified: boolean;
};

const LISTING_DETAIL_SELECT = `id, slug, verification, published_at, expires_at,
    location:locations(name, slug),
    category:categories(category_translations(locale, name)),
    translations:content_translations(locale, title, excerpt, body),
    media:media_assets(public_url, alt_text, caption, is_cover, sort_order, photographer_credit, kind, mime_type),
    listing:listings(price, currency, listing_status, seller_name, seller_is_verified, contact_phone, contact_email, whatsapp_number)`;

/**
 * One listing by id or slug, with contact presence flags (null when not found).
 * Phase 4.1: cached (tag `listings`) — the hot read behind the ISR'd detail
 * pages; invalidated via revalidateTag('listings', 'max') from admin actions.
 * The cached value carries only hasPhone/hasEmail/hasWhatsapp booleans —
 * raw contact PII never enters the cache (see `toListingDetail`).
 */
const getCachedListingDetail = unstable_cache(
    async (slugOrId: string, locale: Locale): Promise<ListingDetailData | null> => {
        const { data, error } = await createAdminClient()
            .from("content_items")
            .select(LISTING_DETAIL_SELECT)
            .eq("type", "listing")
            .eq("status", "published")
            .eq("is_archived", false)
            .or(`id.eq.${slugOrId},slug.eq.${slugOrId}`)
            .limit(1);
        if (error) throw new Error(error.message);
        const row = asOne(data);
        if (!row) return null;
        return toListingDetail(row, locale);
    },
    ["listings-detail"],
    { tags: [CACHE_TAGS.listings], revalidate: PUBLIC_CONTENT_REVALIDATE_SECONDS },
);

/** One listing by id or slug, with contact presence flags (null when not found). */
export async function getListingDetail(
    slugOrId: string,
    locale: Locale = "en",
): Promise<ListingDetailData | null> {
    if (!hasDatabase()) return null;
    // Sanitize before both the cache key and the query so one canonical
    // string serves every raw spelling of the same URL segment.
    const sanitized = sanitizePhrase(slugOrId);
    if (!sanitized) return null;
    try {
        return await getCachedListingDetail(sanitized, locale);
    } catch (err) {
        logCacheFailure("getListingDetail", err);
        return null;
    }
}

/** Maps a raw row to the detail shape, omitting raw PII strings. */
function toListingDetail(row: RawListingRow, locale: Locale): ListingDetailData | null {
    const base = toListing(row, locale);
    if (!base) return null;
    const listing = asOne(row.listing) as
        | {
              price: number | null;
              currency: string | null;
              listing_status: string | null;
              seller_name?: string | null;
              seller_is_verified?: boolean | null;
              contact_phone?: string | null;
              contact_email?: string | null;
              whatsapp_number?: string | null;
          }
        | null;
    return {
        ...base,
        sellerName: listing?.seller_name?.trim() || base.sellerName,
        hasPhone: Boolean(listing?.contact_phone?.trim()),
        hasEmail: Boolean(listing?.contact_email?.trim()),
        hasWhatsapp: Boolean(listing?.whatsapp_number?.trim()),
        sellerIsVerified: listing?.seller_is_verified ?? false,
    };
}

/**
 * "Similar listings" rail: same category and/or location, excluding the
 * current listing, newest first. Falls back to any recent listing when the
 * strict match returns nothing so the rail is never empty.
 * Phase 4.1: cached (tag `listings`); filter inputs are sanitized before the
 * cache call so the cache key is canonical.
 */
const getCachedSimilarListings = unstable_cache(
    async (
        excludeId: string,
        category: string | undefined,
        locationSlug: string | undefined,
        locale: Locale,
        limit: number,
    ): Promise<ListingData[]> => {
        const match = async (locationOnly: boolean): Promise<ListingData[]> => {
            let query = publishedListings().neq("id", excludeId);
            if (locationSlug) {
                query = query.eq("locations.slug", locationSlug);
            }
            if (!locationOnly && category) {
                query = query.eq("categories.slug", category);
            }
            const { data, error } = await query
                .order("published_at", { ascending: false, nullsFirst: false })
                .limit(limit);
            if (error) throw new Error(error.message);
            return (data ?? []).flatMap((row) => {
                const listing = toListing(row, locale);
                return listing ? [listing] : [];
            });
        };

        const sameCategory = category ? await match(false) : [];
        if (sameCategory.length >= limit) return sameCategory;
        const sameLocation = locationSlug ? await match(true) : [];
        const merged = [...sameCategory, ...sameLocation].filter(
            (l, index, all) => all.findIndex((x) => x.id === l.id) === index,
        );
        return merged.slice(0, limit);
    },
    ["listings-similar"],
    { tags: [CACHE_TAGS.listings], revalidate: PUBLIC_CONTENT_REVALIDATE_SECONDS },
);

export async function getSimilarListings(
    excludeId: string,
    filters: { category?: string | null; locationSlug?: string | null },
    locale: Locale = "en",
    limit = 3,
): Promise<ListingData[]> {
    if (!hasDatabase()) return [];
    // Sanitize before the cache call so the cache key is canonical.
    const sanitizedExclude = sanitizePhrase(excludeId);
    if (!sanitizedExclude) return [];
    const category = sanitizePhrase(filters.category ?? "") || undefined;
    const locationSlug = sanitizePhrase(filters.locationSlug ?? "") || undefined;
    try {
        return await getCachedSimilarListings(
            sanitizedExclude,
            category,
            locationSlug,
            locale,
            limit,
        );
    } catch (err) {
        logCacheFailure("getSimilarListings", err);
        return [];
    }
}

export type OwnListing = {
    id: string;
    title: string;
    price: number | null;
    currency: string | null;
    listingStatus: string;
    contentStatus: string;
    expiresAt: string | null;
    publishedAt: string | null;
};

/**
 * Seller's own listings (P1-1c "manage my listing"). Uncached by design —
 * owners must see lifecycle changes instantly after their own actions.
 * No PII leaves this query (contacts stay behind revealSellerContact).
 */
export async function getUserListings(userId: string, locale: Locale = 'en'): Promise<OwnListing[]> {
    if (!hasDatabase() || !userId) return [];
    try {
        const { data, error } = await createAdminClient()
            .from('content_items')
            .select(`id, status, expires_at, published_at,
                translations:content_translations(locale, title),
                listing:listings(price, currency, listing_status)`)
            .eq('type', 'listing')
            .or(`submitted_by.eq.${userId},author_id.eq.${userId}`)
            .order('published_at', { ascending: false, nullsFirst: false })
            .limit(50);
        if (error) {
            logger.error('buy-sell', 'own listings failed', { error: error.message });
            return [];
        }
        type OwnRow = {
            id: string;
            status: string;
            expires_at: string | null;
            published_at: string | null;
            translations?: { locale: string; title: string | null }[] | null;
            listing?: { price: number | null; currency: string | null; listing_status: string | null } | { price: number | null; currency: string | null; listing_status: string | null }[] | null;
        };
        return ((data ?? []) as unknown as OwnRow[]).map((row) => {
            const translation = pickLocalized(row.translations, locale);
            const listing = asOne(row.listing);
            return {
                id: row.id,
                title: translation?.title ?? 'Untitled',
                price: listing?.price ?? null,
                currency: listing?.currency ?? null,
                listingStatus: listing?.listing_status ?? 'active',
                contentStatus: row.status,
                expiresAt: row.expires_at,
                publishedAt: row.published_at,
            };
        });
    } catch (err) {
        logger.error('buy-sell', 'own listings exception', { error: err instanceof Error ? err.message : String(err) });
        return [];
    }
}
