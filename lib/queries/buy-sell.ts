import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Locale } from "@/lib/i18n";

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

/** Full listing shape for public consumption. */
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
    sellerContact: string | null;
    listingStatus: string | null;
    expiresAt: string | null;
    photos?: ListingPhoto[];
    body?: string | null;
};

/** Raw row shape returned by the shared listing select. */
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
              is_cover: boolean | null;
              sort_order: number | null;
              photographer_credit: string | null;
          }[]
        | null;
    listing?:
        | {
              price: number | null;
              currency: string | null;
              listing_status: string | null;
              contact_phone?: string | null;
              contact_email?: string | null;
              whatsapp_number?: string | null;
          }
        | {
              price: number | null;
              currency: string | null;
              listing_status: string | null;
              contact_phone?: string | null;
              contact_email?: string | null;
              whatsapp_number?: string | null;
          }[]
        | null;
};

const LISTING_SELECT = `id, slug, verification, published_at, expires_at,
    location:locations(name, slug),
    category:categories(category_translations(locale, name)),
    translations:content_translations(locale, title, excerpt, body),
    media:media_assets(public_url, alt_text, is_cover, sort_order, photographer_credit),
    listing:listings(price, currency, listing_status, contact_phone)`;

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
            console.error("[buy-sell]", error.message);
            return { data: null, count: null, error };
        }
        return { data, count: count ?? null, error: null };
    } catch (err) {
        console.error("[buy-sell]", err);
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
        sellerName: null,
        sellerContact: listing?.contact_phone ?? null,
        listingStatus: listing?.listing_status ?? null,
        expiresAt: row.expires_at,
        photos,
        body: translation.body ?? null,
    };
}

/**
 * Paged grid of published listings, newest first. Search matches title/excerpt
 * in any locale; category narrows by slug or translated name; location narrows
 * by slug.
 */
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
    const page = Math.max(1, options.page ?? 1);
    const search = options.search?.trim();
    const category = options.category?.trim();
    const location = options.location?.trim();
    const sort = options.sort ?? 'newest';

    let query = publishedListings(true);
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

    const { data, count: total } = await safe(
        query.range(from, from + PAGE_SIZE - 1),
    );

    const locale = options.locale ?? "en";
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

/** Full-bleed featured listing for the landing page: newest published listing. */
export async function getFeaturedListing(locale: Locale = "en"): Promise<ListingData | null> {
    if (!hasDatabase()) return null;
    const { data } = await safe(
        publishedListings()
            .order("published_at", { ascending: false, nullsFirst: false })
            .limit(1),
    );
    const row = asOne(data);
    return row ? toListing(row, locale) : null;
}

/** Listings by location slug, newest first. */
export async function getListingsByLocation(
    locationSlug: string,
    locale: Locale = "en",
    limit = 6,
): Promise<ListingData[]> {
    if (!hasDatabase()) return [];
    const { data } = await safe(
        publishedListings()
            .eq("locations.slug", sanitizePhrase(locationSlug))
            .order("published_at", { ascending: false, nullsFirst: false })
            .limit(limit),
    );
    return (data ?? []).flatMap((row) => {
        const listing = toListing(row, locale);
        return listing ? [listing] : [];
    });
}

/**
 * Full detail shape for the Buy & Sell detail page. Extends `ListingData`
 * with the gated seller contact fields (phone / email / WhatsApp) that the
 * "reveal contact" control toggles. The columns live on `listings` per the
 * schema.
 */
export type ListingDetailData = ListingData & {
    contactPhone: string | null;
    contactEmail: string | null;
    whatsappNumber: string | null;
    sellerIsVerified: boolean;
};

const LISTING_DETAIL_SELECT = `id, slug, verification, published_at, expires_at,
    location:locations(name, slug),
    category:categories(category_translations(locale, name)),
    translations:content_translations(locale, title, excerpt, body),
    media:media_assets(public_url, alt_text, is_cover, sort_order, photographer_credit),
    listing:listings(price, currency, listing_status, contact_phone, contact_email, whatsapp_number)`;

/** One listing by id or slug, with gated contact fields (null when not found). */
export async function getListingDetail(
    slugOrId: string,
    locale: Locale = "en",
): Promise<ListingDetailData | null> {
    if (!hasDatabase()) return null;
    const { data } = await safe(
        createAdminClient()
            .from("content_items")
            .select(LISTING_DETAIL_SELECT)
            .eq("type", "listing")
            .eq("status", "published")
            .eq("is_archived", false)
            .or(`id.eq.${sanitizePhrase(slugOrId)},slug.eq.${sanitizePhrase(slugOrId)}`)
            .limit(1),
    );
    const row = asOne(data);
    if (!row) return null;
    return toListingDetail(row, locale);
}

/** Maps a raw row to the detail shape, falling back to the card shape. */
function toListingDetail(row: RawListingRow, locale: Locale): ListingDetailData | null {
    const base = toListing(row, locale);
    if (!base) return null;
    const listing = asOne(row.listing) as
        | {
              price: number | null;
              currency: string | null;
              listing_status: string | null;
              contact_phone?: string | null;
              contact_email?: string | null;
              whatsapp_number?: string | null;
          }
        | null;
    return {
        ...base,
        contactPhone: listing?.contact_phone ?? null,
        contactEmail: listing?.contact_email ?? null,
        whatsappNumber: listing?.whatsapp_number ?? null,
        sellerIsVerified: false,
    };
}

/**
 * "Similar listings" rail: same category and/or location, excluding the
 * current listing, newest first. Falls back to any recent listing when the
 * strict match returns nothing so the rail is never empty.
 */
export async function getSimilarListings(
    excludeId: string,
    filters: { category?: string | null; locationSlug?: string | null },
    locale: Locale = "en",
    limit = 3,
): Promise<ListingData[]> {
    if (!hasDatabase()) return [];

    const match = async (locationOnly: boolean): Promise<ListingData[]> => {
        let query = publishedListings().neq("id", excludeId);
        if (filters.locationSlug) {
            query = query.eq("locations.slug", sanitizePhrase(filters.locationSlug));
        }
        if (!locationOnly && filters.category) {
            query = query.eq("categories.slug", sanitizePhrase(filters.category));
        }
        const { data } = await safe(
            query.order("published_at", { ascending: false, nullsFirst: false }).limit(limit),
        );
        return (data ?? []).flatMap((row) => {
            const listing = toListing(row, locale);
            return listing ? [listing] : [];
        });
    };

    const sameCategory = filters.category ? await match(false) : [];
    if (sameCategory.length >= limit) return sameCategory;
    const sameLocation = filters.locationSlug ? await match(true) : [];
    const merged = [...sameCategory, ...sameLocation].filter(
        (l, index, all) => all.findIndex((x) => x.id === l.id) === index,
    );
    return merged.slice(0, limit);
}
