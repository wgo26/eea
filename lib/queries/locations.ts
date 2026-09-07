import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Locale } from "@/lib/i18n";

export type LocationData = {
    id: string;
    name: string;
    slug: string;
    latitude: number | null;
    longitude: number | null;
    parentId: string | null;
    parentName?: string | null;
    contentCount?: number;
};

export type LocationContent = {
    id: string;
    type: string;
    title: string;
    href: string;
    imageUrl: string | null;
    publishedAt: string | null;
    location: string | null;
    category: string | null;
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
            console.error("[locations]", error.message);
            return { data: null, count: null, error };
        }
        return { data, count: count ?? null, error: null };
    } catch (err) {
        console.error("[locations]", err);
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

/** Locale-prefixed detail href. */
function detailHref(locale: Locale, type: string, slug: string): string {
    const base = `/${locale}`;
    switch (type) {
        case "photo_story":
            return `${base}/photo-stories/${slug}`;
        case "news":
            return `${base}/news/${slug}`;
        case "culture":
            return `${base}/culture/${slug}`;
        case "notice":
            return `${base}/notices/${slug}`;
        case "listing":
            return `${base}/buy-sell/${slug}`;
        default:
            return `${base}/search`;
    }
}

type RawLocationRow = {
    id: string;
    name: string | null;
    slug: string | null;
    latitude: number | null;
    longitude: number | null;
    parent_id: string | null;
    parent?: { name: string | null } | { name: string | null }[] | null;
};

type RawContentRow = {
    id: string;
    type: string;
    slug: string | null;
    published_at: string | null;
    location?: { name: string | null } | { name: string | null }[] | null;
    category?:
        | { category_translations: { locale: string; name: string }[] }
        | { category_translations: { locale: string; name: string }[] }[]
        | null;
    translations?: { locale: string; title: string }[] | null;
    media?: { public_url: string | null }[] | null;
};

/** Maps a raw location row to the public shape. */
function mapLocation(raw: RawLocationRow): LocationData | null {
    if (!raw.name || !raw.slug) return null;
    const parent = asOne(raw.parent);
    return {
        id: raw.id,
        name: raw.name,
        slug: raw.slug,
        latitude: raw.latitude,
        longitude: raw.longitude,
        parentId: raw.parent_id,
        parentName: parent?.name ?? null,
    };
}

/** Maps a raw content row to the public content shape. */
function mapContent(row: RawContentRow, locale: Locale): LocationContent | null {
    const translation = pickLocalized(row.translations, locale);
    if (!translation?.title) return null;
    const location = asOne(row.location);
    const category = asOne(row.category);
    const media = row.media ?? [];
    const cover = media[0] ?? null;

    return {
        id: row.id,
        type: row.type,
        title: translation.title,
        href: detailHref(locale, row.type, row.slug ?? row.id),
        imageUrl: cover?.public_url ?? null,
        publishedAt: row.published_at,
        location: location?.name ?? null,
        category: category
            ? (pickLocalized(category.category_translations, locale)?.name ?? null)
            : null,
    };
}

const LOCATION_SELECT = `id, name, slug, latitude, longitude, parent_id,
    parent:locations!parent_id(name)`;

const CONTENT_SELECT = `id, type, slug, published_at,
    location:locations(name),
    category:categories(category_translations(locale, name)),
    translations:content_translations(locale, title),
    media:media_assets(public_url)`;

/** Fetches all active locations, ordered by name. */
export async function getAllLocations(): Promise<LocationData[]> {
    if (!hasDatabase()) return [];
    const { data } = await safe(
        createAdminClient()
            .from("locations")
            .select(LOCATION_SELECT)
            .eq("is_active", true)
            .order("name", { ascending: true }),
    );
    return (data ?? []).flatMap((row) => {
        const location = mapLocation(row as RawLocationRow);
        return location ? [location] : [];
    });
}

/** Fetches a single location by slug (null when not found or inactive). */
export async function getLocationBySlug(slug: string): Promise<LocationData | null> {
    if (!hasDatabase()) return null;
    const { data } = await safe(
        createAdminClient()
            .from("locations")
            .select(LOCATION_SELECT)
            .eq("slug", slug)
            .eq("is_active", true)
            .limit(1),
    );
    const row = asOne(data);
    return row ? mapLocation(row as RawLocationRow) : null;
}

/** Returns the current slug for a renamed location, if one was recorded. */
export async function getLocationSlugRedirect(slug: string): Promise<string | null> {
    if (!hasDatabase()) return null;
    const { data } = await safe(
        createAdminClient()
            .from("location_slug_redirects")
            .select("location:locations!location_id(slug)")
            .eq("old_slug", slug)
            .limit(1),
    );
    const row = asOne(data) as { location?: { slug: string } | { slug: string }[] | null } | null;
    const location = asOne(row?.location);
    return location?.slug ?? null;
}

/** Fetches published content items for a location, optionally filtered by locale and type. */
export async function getLocationContent(
    slug: string,
    locale: Locale = "en",
    type?: string,
): Promise<LocationContent[]> {
    if (!hasDatabase()) return [];
    let query = createAdminClient()
        .from("content_items")
        .select(CONTENT_SELECT)
        .eq("locations.slug", slug)
        .eq("status", "published")
        .eq("is_archived", false)
        .not("published_at", "is", null);

    if (type) {
        query = query.eq("type", type);
    }

    const { data } = await safe(
        query.order("published_at", { ascending: false }).limit(50),
    );
    return (data ?? []).flatMap((row) => {
        const item = mapContent(row as RawContentRow, locale);
        return item ? [item] : [];
    });
}

/** Fetches all active locations with a count of published content items. */
export async function getLocationsWithCounts(): Promise<LocationData[]> {
    if (!hasDatabase()) return [];
    const supabase = createAdminClient();

    const [locationsResult, contentResult] = await Promise.all([
        safe(
            supabase
                .from("locations")
                .select(LOCATION_SELECT)
                .eq("is_active", true)
                .order("name", { ascending: true }),
        ),
        safe(
            supabase
                .from("content_items")
                .select("location_id")
                .eq("status", "published")
                .eq("is_archived", false)
                .not("published_at", "is", null),
        ),
    ]);

    const totals = new Map<string, number>();
    for (const row of contentResult.data ?? []) {
        const raw = row as { location_id: string | null };
        if (raw.location_id) {
            totals.set(raw.location_id, (totals.get(raw.location_id) ?? 0) + 1);
        }
    }

    return (locationsResult.data ?? []).flatMap((row) => {
        const location = mapLocation(row as RawLocationRow);
        if (!location) return [];
        return [{ ...location, contentCount: totals.get(location.id) ?? 0 }];
    });
}
