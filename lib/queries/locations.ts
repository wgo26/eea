import "server-only";

import { unstable_cache } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";
import {
    asOne,
    hasDatabase,
    logCacheFailure,
    pickLocalized,
    safe,
} from "./shared";
import { CACHE_TAGS, PUBLIC_CONTENT_REVALIDATE_SECONDS } from "@/lib/cache/tags";
import { logger } from "@/lib/observability/logger";
import { coverRow, mapAttachments, previewImageUrl } from "@/lib/media/attachments";
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
    // Phase 3 — tier + hierarchy fields
    depth?: number;
    locationTypeId?: string | null;
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

export type NearYouContent = {
    id: string;
    type: string;
    title: string;
    href: string;
    imageUrl: string | null;
    publishedAt: string | null;
    location: string | null;
    category: string | null;
};

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
    depth: number | null;
    location_type_id: string | null;
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
    media?: { public_url: string | null; is_cover: boolean | null; kind: string | null; mime_type: string | null }[] | null;
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
        depth: raw.depth ?? null,
        locationTypeId: raw.location_type_id ?? null,
    };
}

/** Maps a raw content row to the public content shape. */
function mapContent(row: RawContentRow, locale: Locale): LocationContent | null {
    const translation = pickLocalized(row.translations, locale);
    if (!translation?.title) return null;
    const location = asOne(row.location);
    const category = asOne(row.category);
    const media = row.media ?? [];
    const images = media.filter((m) => (m.kind ?? 'image') === 'image');
    const rawCover = coverRow(media)?.public_url ?? images[0]?.public_url ?? null;

    return {
        id: row.id,
        type: row.type,
        title: translation.title,
        href: detailHref(locale, row.type, row.slug ?? row.id),
        imageUrl: previewImageUrl(rawCover, mapAttachments(media)),
        publishedAt: row.published_at,
        location: location?.name ?? null,
        category: category
            ? (pickLocalized(category.category_translations, locale)?.name ?? null)
            : null,
    };
}

const LOCATION_SELECT = `id, name, slug, latitude, longitude, parent_id,
    depth, location_type_id,
    parent:locations!parent_id(name)`;

/**
 * Content select with an inner location join — PostgREST only restricts
 * parent rows via embedded filters when the embed is `!inner` (see news.ts /
 * notices.ts). Both users of this variant filter by `locations.slug`, so the
 * inner join loses nothing that should have matched. Written as a literal so
 * supabase-js keeps inferring the row shape from the select string.
 */
const CONTENT_SELECT_WITH_LOCATION = `id, type, slug, published_at,
    location:locations!inner(name),
    category:categories(category_translations(locale, name)),
    translations:content_translations(locale, title),
    media:media_assets(public_url, is_cover, kind, mime_type)`;

/** Fetches all active locations, ordered by name. */
export async function getAllLocations(): Promise<LocationData[]> {
    if (!hasDatabase()) return [];
    try {
        // Data-backed by design: the place picker (api/places) offers what
        // this returns, and a selectable place must have something to show.
        // Locations with zero published content are excluded.
        const withCounts = await getCachedLocationsWithCounts();
        return withCounts.filter((l) => (l.contentCount ?? 0) > 0);
    } catch (err) {
        logCacheFailure("locations", "getAllLocations", err);
        return [];
    }
}

/** Fetches a single location by slug (null when not found or inactive). */
export async function getLocationBySlug(slug: string): Promise<LocationData | null> {
    if (!hasDatabase()) return null;
    try {
        return await getCachedLocationBySlug(slug);
    } catch (err) {
        logCacheFailure("locations", "getLocationBySlug", err);
        return null;
    }
}

const getCachedLocationBySlug = unstable_cache(
    async (slug: string): Promise<LocationData | null> => {
        const { data, error } = await safe("locations", 
            createAdminClient()
                .from("locations")
                .select(LOCATION_SELECT)
                .eq("slug", slug)
                .eq("is_active", true)
                .limit(1),
        );
        if (error) throw new Error(error.message);
        const row = asOne(data);
        return row ? mapLocation(row as RawLocationRow) : null;
    },
    ["location-by-slug"],
    { tags: [CACHE_TAGS.locations], revalidate: PUBLIC_CONTENT_REVALIDATE_SECONDS },
);

/** Returns the current slug for a renamed location, if one was recorded. */
export async function getLocationSlugRedirect(slug: string): Promise<string | null> {
    if (!hasDatabase()) return null;
    try {
        return await getCachedLocationSlugRedirect(slug);
    } catch (err) {
        logCacheFailure("locations", "getLocationSlugRedirect", err);
        return null;
    }
}

const getCachedLocationSlugRedirect = unstable_cache(
    async (slug: string): Promise<string | null> => {
        const { data, error } = await safe("locations", 
            createAdminClient()
                .from("location_slug_redirects")
                .select("location:locations!location_id(slug)")
                .eq("old_slug", slug)
                .limit(1),
        );
        if (error) throw new Error(error.message);
        const row = asOne(data) as { location?: { slug: string } | { slug: string }[] | null } | null;
        const location = asOne(row?.location);
        return location?.slug ?? null;
    },
    ["location-slug-redirect"],
    { tags: [CACHE_TAGS.locations], revalidate: PUBLIC_CONTENT_REVALIDATE_SECONDS },
);

/** Fetches published content items for a location, optionally filtered by locale and type. */
export async function getLocationContent(
    slug: string,
    locale: Locale = "en",
    type?: string,
): Promise<LocationContent[]> {
    if (!hasDatabase()) return [];
    try {
        return await getCachedLocationContent(slug, locale, type ?? null);
    } catch (err) {
        logCacheFailure("locations", "getLocationContent", err);
        return [];
    }
}

const getCachedLocationContent = unstable_cache(
    async (slug: string, locale: Locale, type: string | null): Promise<LocationContent[]> => {
        let query = createAdminClient()
            .from("content_items")
            .select(CONTENT_SELECT_WITH_LOCATION)
            .eq("locations.slug", slug)
            .eq("status", "published")
            .eq("is_archived", false)
            .not("published_at", "is", null);

        if (type) {
            query = query.eq("type", type as "photo_story" | "news" | "notice" | "culture" | "listing" | "fundraiser");
        }

        const { data, error } = await safe("locations", 
            query.order("published_at", { ascending: false }).limit(50),
        );
        if (error) throw new Error(error.message);
        return (data ?? []).flatMap((row) => {
            const item = mapContent(row as RawContentRow, locale);
            return item ? [item] : [];
        });
    },
    ["location-content"],
    { tags: [CACHE_TAGS.locations], revalidate: PUBLIC_CONTENT_REVALIDATE_SECONDS },
);

/** Fetches all active locations with a count of published content items. */
export async function getLocationsWithCounts(): Promise<LocationData[]> {
    if (!hasDatabase()) return [];
    try {
        return await getCachedLocationsWithCounts();
    } catch (err) {
        logCacheFailure("locations", "getLocationsWithCounts", err);
        return [];
    }
}

/**
 * Published, non-archived content counts per location id. Paginates in 1k
 * chunks — a plain select would silently truncate at PostgREST's default
 * limit and understate the counts. Throws on query error (cached-reader
 * contract); returns the map on success.
 */
async function publishedCountsByLocationId(contentType: string | null): Promise<Map<string, number>> {
    const supabase = createAdminClient();
    const totals = new Map<string, number>();
    const pageSize = 1000;
    for (let from = 0; ; from += pageSize) {
        let query = supabase
            .from("content_items")
            .select("location_id")
            .eq("status", "published")
            .eq("is_archived", false)
            .not("location_id", "is", null)
            .not("published_at", "is", null);
        if (contentType) query = query.eq("type", contentType);
        const { data, error } = await safe("locations", query.range(from, from + pageSize - 1));
        if (error) throw new Error(error.message);
        const rows = (data ?? []) as { location_id: string | null }[];
        for (const row of rows) {
            if (row.location_id) {
                totals.set(row.location_id, (totals.get(row.location_id) ?? 0) + 1);
            }
        }
        if (rows.length < pageSize) break;
    }
    return totals;
}

const getCachedLocationsWithCounts = unstable_cache(
    async (): Promise<LocationData[]> => {
        const supabase = createAdminClient();

        const [locationsResult, totals] = await Promise.all([
            safe(
                "locations",
                supabase
                    .from("locations")
                    .select(LOCATION_SELECT)
                    .eq("is_active", true)
                    .order("name", { ascending: true }),
            ),
            publishedCountsByLocationId(null),
        ]);
        if (locationsResult.error) throw new Error(locationsResult.error.message);

        return (locationsResult.data ?? []).flatMap((row) => {
            const location = mapLocation(row as RawLocationRow);
            if (!location) return [];
            return [{ ...location, contentCount: totals.get(location.id) ?? 0 }];
        });
    },
    ["locations-with-counts"],
    { tags: [CACHE_TAGS.locations], revalidate: PUBLIC_CONTENT_REVALIDATE_SECONDS },
);

/** Fetches user's place preference from the database (for authenticated users). */
export async function getUserPlacePreference(userId: string): Promise<string | null> {
    if (!hasDatabase()) return null;
    try {
        const { data, error } = await safe("locations", 
            createAdminClient()
                .from("user_place_preferences")
                .select("place_slug")
                .eq("user_id", userId)
                .limit(1),
        );
        if (error) throw new Error(error.message);
        return (data as { place_slug: string }[])?.[0]?.place_slug ?? null;
    } catch (err) {
        logger.error("locations", "getUserPlacePreference failed", { error: err instanceof Error ? err.message : String(err) });
        return null;
    }
}

/** Sets user's place preference in the database. */
export async function setUserPlacePreference(userId: string, placeSlug: string, locale: Locale = "en"): Promise<boolean> {
    if (!hasDatabase()) return false;
    try {
        const { error } = await safe("locations", 
            createAdminClient()
                .from("user_place_preferences")
                .upsert({ user_id: userId, place_slug: placeSlug, locale }, { onConflict: "user_id" }),
        );
        if (error) throw new Error(error.message);
        return true;
    } catch (err) {
        logger.error("locations", "setUserPlacePreference failed", { error: err instanceof Error ? err.message : String(err) });
        return false;
    }
}

/** Fetches recent content for a specific place (for "Near You" rail). */
export async function getNearYouContent(
    placeSlug: string,
    locale: Locale = "en",
    limit = 10
): Promise<NearYouContent[]> {
    if (!hasDatabase()) return [];
    try {
        return await getCachedNearYouContent(placeSlug, locale, limit);
    } catch (err) {
        logCacheFailure("locations", "getNearYouContent", err);
        return [];
    }
}

const getCachedNearYouContent = unstable_cache(
    async (placeSlug: string, locale: Locale, limit: number): Promise<NearYouContent[]> => {
        const { data, error } = await safe("locations", 
            createAdminClient()
                .from("content_items")
                .select(CONTENT_SELECT_WITH_LOCATION)
                .eq("locations.slug", placeSlug)
                .eq("status", "published")
                .eq("is_archived", false)
                .not("published_at", "is", null)
                .order("published_at", { ascending: false })
                .limit(limit),
        );
        if (error) throw new Error(error.message);
        return (data ?? []).flatMap((row) => {
            const item = mapContent(row as RawContentRow, locale);
            return item ? [item] : [];
        });
    },
    ["near-you-content"],
    { tags: [CACHE_TAGS.locations], revalidate: PUBLIC_CONTENT_REVALIDATE_SECONDS },
);

/**
 * Phase 4.1 — mapped story pins for the /map clustering layer. Locations
 * carry the coordinates (content_items have no geo columns by design), so
 * each published story inherits its location's lat/lng. The inner join
 * keeps only stories with a location; null coordinates are dropped in JS
 * (PostgREST embedded null-filters are version-sensitive).
 */
export type MappedStory = {
    id: string;
    type: string;
    title: string;
    href: string;
    imageUrl: string | null;
    publishedAt: string | null;
    category: string | null;
    locationSlug: string;
    locationName: string;
    latitude: number;
    longitude: number;
};

export async function getMappedContent(
    locale: Locale = "en",
    limit = 400,
): Promise<MappedStory[]> {
    if (!hasDatabase()) return [];
    try {
        return await getCachedMappedContent(locale, limit);
    } catch (err) {
        logCacheFailure("locations", "getMappedContent", err);
        return [];
    }
}

const getCachedMappedContent = unstable_cache(
    async (locale: Locale, limit: number): Promise<MappedStory[]> => {
        const { data, error } = await safe("locations", 
            createAdminClient()
                .from("content_items")
                .select(
                    `id, type, slug, published_at,
                    location:locations!inner(slug, name, latitude, longitude),
                    category:categories(category_translations(locale, name)),
                    translations:content_translations(locale, title),
                    media:media_assets(public_url, is_cover, kind, mime_type)`,
                )
                .eq("status", "published")
                .eq("is_archived", false)
                .not("published_at", "is", null)
                .order("published_at", { ascending: false })
                .limit(limit),
        );
        if (error) throw new Error(error.message);
        return ((data ?? []) as RawContentRow[]).flatMap((row) => {
            const item = mapContent(row, locale);
            if (!item) return [];
            type GeoLoc = {
                slug?: string | null;
                name?: string | null;
                latitude?: number | null;
                longitude?: number | null;
            };
            const loc = asOne(
                (row as unknown as { location?: GeoLoc | GeoLoc[] | null }).location,
            );
            if (loc?.latitude == null || loc?.longitude == null) return [];
            return [
                {
                    id: item.id,
                    type: item.type,
                    title: item.title,
                    href: item.href,
                    imageUrl: item.imageUrl,
                    publishedAt: item.publishedAt,
                    category: item.category,
                    locationSlug: loc.slug ?? "",
                    locationName: loc.name ?? item.location ?? "",
                    latitude: Number(loc.latitude),
                    longitude: Number(loc.longitude),
                },
            ];
        });
    },
    ["mapped-content"],
    { tags: [CACHE_TAGS.locations], revalidate: PUBLIC_CONTENT_REVALIDATE_SECONDS },
);

/** Fetches all active locations with lat/lng for the map page. */
export async function getMappedLocations(): Promise<LocationData[]> {
    if (!hasDatabase()) return [];
    try {
        return await getCachedMappedLocations();
    } catch (err) {
        logCacheFailure("locations", "getMappedLocations", err);
        return [];
    }
}

const getCachedMappedLocations = unstable_cache(
    async (): Promise<LocationData[]> => {
        const { data, error } = await safe("locations", 
            createAdminClient()
                .from("locations")
                .select(LOCATION_SELECT)
                .eq("is_active", true)
                .not("latitude", "is", null)
                .not("longitude", "is", null)
                .order("name", { ascending: true }),
        );
        if (error) throw new Error(error.message);
        return (data ?? []).flatMap((row) => {
            const location = mapLocation(row as RawLocationRow);
            return location ? [location] : [];
        });
    },
    ["mapped-locations"],
    { tags: [CACHE_TAGS.locations], revalidate: PUBLIC_CONTENT_REVALIDATE_SECONDS },
);

export type LocationFacet = {
    slug: string;
    name: string;
    count?: number;
};

/**
 * Unified location facet query for any content type: locations that actually
 * have published, non-archived content of that type, each with its count —
 * so facet chips never offer a place whose grid would come up empty.
 * Phase 4.1: cached (tag `locations`).
 */
const getCachedLocationsByContentType = unstable_cache(
    async (contentType: string | null): Promise<LocationFacet[]> => {
        const supabase = createAdminClient();

        const [locationsResult, totals] = await Promise.all([
            safe(
                "locations",
                supabase
                    .from("locations")
                    .select("id, slug, name")
                    .eq("is_active", true)
                    .order("name", { ascending: true }),
            ),
            contentType ? publishedCountsByLocationId(contentType) : Promise.resolve<Map<string, number> | null>(null),
        ]);
        if (locationsResult.error) throw new Error(locationsResult.error.message);

        const facets: LocationFacet[] = (locationsResult.data ?? []).flatMap((row) => {
            const loc = row as { id: string; slug: string; name: string | null };
            return loc.name ? [{ slug: loc.slug, name: loc.name }] : [];
        });

        if (!contentType || !totals) return facets;

        const idToSlug = new Map<string, string>();
        for (const row of locationsResult.data ?? []) {
            const loc = row as { id: string; slug: string };
            idToSlug.set(loc.id, loc.slug);
        }
        const bySlug = new Map<string, number>();
        for (const [locationId, count] of totals) {
            const slug = idToSlug.get(locationId);
            if (slug) bySlug.set(slug, (bySlug.get(slug) ?? 0) + count);
        }
        return facets
            .filter((f) => (bySlug.get(f.slug) ?? 0) > 0)
            .map((f) => ({ ...f, count: bySlug.get(f.slug) ?? 0 }));
    },
    ["locations-by-content-type"],
    { tags: [CACHE_TAGS.locations], revalidate: PUBLIC_CONTENT_REVALIDATE_SECONDS },
);

export async function getLocationsByContentType(
    contentType: string | null = null,
): Promise<LocationFacet[]> {
    if (!hasDatabase()) return [];
    try {
        return await getCachedLocationsByContentType(contentType);
    } catch (err) {
        logCacheFailure("locations", "getLocationsByContentType", err);
        return [];
    }
}

/* ============================================================================
   Phase 3 — Hierarchy queries (ancestors / descendants / aggregated content)
   ============================================================================ */

export type LocationAncestor = {
    id: string;
    name: string;
    nameFr: string | null;
    slug: string;
    depth: number;
    locationTypeName: string | null;
};

export type LocationChild = {
    id: string;
    name: string;
    nameFr: string | null;
    slug: string;
    depth: number;
    latitude: number | null;
    longitude: number | null;
    isActive: boolean;
    isFeatured: boolean;
    contentCount: number;
    altNames: string[] | null;
    locationTypeName: string | null;
};

export type HierarchyContent = LocationContent & {
    locationDepth: number;
    locationPath: string[];
};

type RawLocationTreeRow = {
    id: string;
    name: string;
    slug: string;
    depth: number;
    location_type_id: string | null;
    location_type_name: string | null;
    latitude: number | null;
    longitude: number | null;
    is_active: boolean;
    is_featured: boolean;
    alt_names: string[] | null;
    translations: {
        locale: string;
        name: string | null;
    }[] | { locale: string; name: string | null } | null;
};

function mapTreeRow(raw: RawLocationTreeRow, locale: Locale): LocationChild | null {
    if (!raw.name || !raw.slug) return null;
    const translations = Array.isArray(raw.translations) ? raw.translations : raw.translations ? [raw.translations] : [];
    const fr = translations.find((t) => t.locale === "fr");
    return {
        id: raw.id,
        name: raw.name,
        nameFr: fr?.name ?? null,
        slug: raw.slug,
        depth: raw.depth,
        latitude: raw.latitude,
        longitude: raw.longitude,
        isActive: raw.is_active,
        isFeatured: raw.is_featured ?? false,
        contentCount: 0,
        altNames: raw.alt_names ?? null,
        locationTypeName: raw.location_type_name ?? null,
    };
}

/** Breadcrumb chain from the root tier down to (and including) the location.
 * Uses the materialized `path` column — one query, no recursion. */
const getCachedLocationAncestors = unstable_cache(
    async (slug: string, locale: Locale): Promise<LocationAncestor[]> => {
        const supabase = createAdminClient();
        const { data: location, error: locError } = await safe("locations",
            supabase
                .from("locations")
                .select("id, path, depth")
                .eq("slug", slug)
                .limit(1),
        );
        if (locError) throw new Error(locError.message);
        const row = asOne(location);
        if (!row) return [];

        const pathIds = (row as { path: string[] | null }).path;
        if (!pathIds || pathIds.length === 0) return [];

        const { data, error } = await safe("locations",
            supabase
                .from("locations")
                .select(
                    `id, name, slug, depth, location_type_id,
                    location_types(name_en),
                    translations:location_translations(locale, name)`,
                )
                .in("id", pathIds)
                .order("depth", { ascending: true }),
        );
        if (error) throw new Error(error.message);

        return ((data ?? []) as RawLocationTreeRow[]).map((raw) => {
            const translations = Array.isArray(raw.translations)
                ? raw.translations
                : raw.translations
                    ? [raw.translations]
                    : [];
            const locTrans = translations.find((t) => t.locale === locale);
            const locType = Array.isArray(raw.location_types)
                ? raw.location_types[0]
                : raw.location_types;
            return {
                id: raw.id,
                name: locTrans?.name ?? raw.name,
                nameFr: translations.find((t) => t.locale === "fr")?.name ?? null,
                slug: raw.slug,
                depth: raw.depth,
                locationTypeName: locType?.name_en ?? null,
            };
        });
    },
    ["location-ancestors"],
    { tags: [CACHE_TAGS.locations], revalidate: PUBLIC_CONTENT_REVALIDATE_SECONDS },
);

export async function getLocationAncestors(
    slug: string,
    locale: Locale = "en",
): Promise<LocationAncestor[]> {
    if (!hasDatabase()) return [];
    try {
        return await getCachedLocationAncestors(slug, locale);
    } catch (err) {
        logCacheFailure("locations", "getLocationAncestors", err);
        return [];
    }
}

/** All active descendant locations of a place (any depth), ordered by depth then name.
 * Uses the materialized `path` column — `path cs '{id}'` means path contains the id. */
const getCachedLocationDescendants = unstable_cache(
    async (slug: string): Promise<LocationChild[]> => {
        const supabase = createAdminClient();
        const { data: location, error: locError } = await safe("locations",
            supabase
                .from("locations")
                .select("id")
                .eq("slug", slug)
                .limit(1),
        );
        if (locError) throw new Error(locError.message);
        const row = asOne(location);
        if (!row) return [];

        const locationId = row.id;
        const { data, error } = await safe("locations",
            supabase
                .from("locations")
                .select(
                    `id, name, slug, depth, location_type_id, latitude, longitude,
                    is_active, is_featured, alt_names,
                    location_types(name_en),
                    translations:location_translations(locale, name)`,
                )
                .filter("path", "cs", `{${locationId}}`)
                .neq("id", locationId)
                .eq("is_active", true)
                .order("depth", { ascending: true })
                .order("name", { ascending: true }),
        );
        if (error) throw new Error(error.message);

        return ((data ?? []) as RawLocationTreeRow[])
            .map((raw) => mapTreeRow(raw, "en"))
            .filter((c): c is LocationChild => c !== null);
    },
    ["location-descendants"],
    { tags: [CACHE_TAGS.locations], revalidate: PUBLIC_CONTENT_REVALIDATE_SECONDS },
);

export async function getLocationDescendants(slug: string): Promise<LocationChild[]> {
    if (!hasDatabase()) return [];
    try {
        return await getCachedLocationDescendants(slug);
    } catch (err) {
        logCacheFailure("locations", "getLocationDescendants", err);
        return [];
    }
}

/** Published content for a location and all its descendants (aggregated up the tree).
 * A region page shows stories from its divisions, cities, towns and quarters. */
const getCachedLocationContentByHierarchy = unstable_cache(
    async (
        slug: string,
        locale: Locale,
        type: string | null,
    ): Promise<HierarchyContent[]> => {
        const supabase = createAdminClient();

        // Resolve self + all descendant ids
        const { data: location, error: locError } = await safe("locations",
            supabase
                .from("locations")
                .select("id, path, depth")
                .eq("slug", slug)
                .limit(1),
        );
        if (locError) throw new Error(locError.message);
        const row = asOne(location);
        if (!row) return [];

        const selfId = row.id;
        const pathIds = ((row as { path: string[] | null }).path ?? []).filter(Boolean);
        const descendantIdSet = new Set<string>();
        for (const pid of pathIds) {
            if (pid && pid !== selfId) descendantIdSet.add(pid);
        }

        // Query descendants' location ids via path containment
        const { data: descendants, error: descError } = await safe("locations",
            supabase
                .from("locations")
                .select("id")
                .filter("path", "cs", `{${selfId}}`)
                .neq("id", selfId),
        );
        if (descError) throw new Error(descError.message);

        const allIds = new Set([selfId, ...descendantIdSet]);
        for (const d of (descendants ?? [])) {
            allIds.add((d as { id: string }).id);
        }
        const idArray = [...allIds];

        let query = supabase
            .from("content_items")
            .select(CONTENT_SELECT_WITH_LOCATION)
            .in("location_id", idArray)
            .eq("status", "published")
            .eq("is_archived", false)
            .not("published_at", "is", null)
            .order("published_at", { ascending: false })
            .limit(100);

        if (type) {
            query = query.eq("type", type as "photo_story" | "news" | "notice" | "culture" | "listing" | "fundraiser");
        }

        const { data, error } = await safe("locations", query);
        if (error) throw new Error(error.message);

        // Attach depth info by re-reading locations
        const { data: locRows, error: locError2 } = await safe("locations",
            supabase
                .from("locations")
                .select("id, depth")
                .in("id", idArray),
        );
        if (locError2) throw new Error(locError2.message);
        const depthById = new Map<string, number>();
        for (const lr of (locRows ?? [])) {
            depthById.set((lr as { id: string; depth: number }).id, (lr as { id: string; depth: number }).depth);
        }

        return ((data ?? []) as RawContentRow[]).flatMap((row) => {
            const item = mapContent(row, locale);
            if (!item) return [];
            const loc = asOne(
                (row as unknown as { location?: { depth?: number } | { depth?: number }[] | null }).location,
            );
            const contentId = row.id as string;
            return [
                {
                    ...item,
                    locationDepth: loc?.depth ?? depthById.get(contentId) ?? 0,
                    locationPath: [],
                },
            ];
        });
    },
    ["location-content-hierarchy"],
    { tags: [CACHE_TAGS.locations], revalidate: PUBLIC_CONTENT_REVALIDATE_SECONDS },
);

export async function getLocationContentByHierarchy(
    slug: string,
    locale: Locale = "en",
    type?: string,
): Promise<HierarchyContent[]> {
    if (!hasDatabase()) return [];
    try {
        return await getCachedLocationContentByHierarchy(slug, locale, type ?? null);
    } catch (err) {
        logCacheFailure("locations", "getLocationContentByHierarchy", err);
        return [];
    }
}

/** Featured places (is_featured) with localized names, for homepage rails. */
const getCachedFeaturedLocations = unstable_cache(
    async (locale: Locale, limit = 12): Promise<LocationChild[]> => {
        const supabase = createAdminClient();
        const { data, error } = await safe("locations",
            supabase
                .from("locations")
                .select(
                    `id, name, slug, depth, latitude, longitude, is_active, is_featured, alt_names,
                    location_types(name_en),
                    translations:location_translations(locale, name)`,
                )
                .eq("is_featured", true)
                .eq("is_active", true)
                .order("name", { ascending: true })
                .limit(limit),
        );
        if (error) throw new Error(error.message);
        return ((data ?? []) as RawLocationTreeRow[])
            .map((raw) => mapTreeRow(raw, locale))
            .filter((c): c is LocationChild => c !== null);
    },
    ["featured-locations"],
    { tags: [CACHE_TAGS.locations], revalidate: PUBLIC_CONTENT_REVALIDATE_SECONDS },
);

export async function getFeaturedLocations(
    locale: Locale = "en",
    limit = 12,
): Promise<LocationChild[]> {
    if (!hasDatabase()) return [];
    try {
        return await getCachedFeaturedLocations(locale, limit);
    } catch (err) {
        logCacheFailure("locations", "getFeaturedLocations", err);
        return [];
    }
}

/** All top-level locations (continents / countries) with localized names, for the directory index. */
const getCachedTopLevelLocations = unstable_cache(
    async (locale: Locale): Promise<LocationChild[]> => {
        const supabase = createAdminClient();
        const { data, error } = await safe("locations",
            supabase
                .from("locations")
                .select(
                    `id, name, slug, depth, latitude, longitude, is_active, is_featured, alt_names,
                    location_types(name_en),
                    translations:location_translations(locale, name)`,
                )
                .is("parent_id", null)
                .eq("is_active", true)
                .order("name", { ascending: true }),
        );
        if (error) throw new Error(error.message);
        return ((data ?? []) as RawLocationTreeRow[])
            .map((raw) => mapTreeRow(raw, locale))
            .filter((c): c is LocationChild => c !== null);
    },
    ["top-level-locations"],
    { tags: [CACHE_TAGS.locations], revalidate: PUBLIC_CONTENT_REVALIDATE_SECONDS },
);

export async function getTopLevelLocations(locale: Locale = "en"): Promise<LocationChild[]> {
    if (!hasDatabase()) return [];
    try {
        return await getCachedTopLevelLocations(locale);
    } catch (err) {
        logCacheFailure("locations", "getTopLevelLocations", err);
        return [];
    }
}

/** Direct children of a location (one tier down), ordered by name. */
const getCachedLocationChildren = unstable_cache(
    async (slug: string): Promise<LocationChild[]> => {
        const supabase = createAdminClient();
        const { data: location, error: locError } = await safe("locations",
            supabase
                .from("locations")
                .select("id, depth")
                .eq("slug", slug)
                .limit(1),
        );
        if (locError) throw new Error(locError.message);
        const row = asOne(location);
        if (!row) return [];

        const { data, error } = await safe("locations",
            supabase
                .from("locations")
                .select(
                    `id, name, slug, depth, latitude, longitude, is_active, is_featured, alt_names,
                    location_types(name_en),
                    translations:location_translations(locale, name)`,
                )
                .eq("parent_id", row.id)
                .eq("is_active", true)
                .order("name", { ascending: true }),
        );
        if (error) throw new Error(error.message);

        return ((data ?? []) as RawLocationTreeRow[])
            .map((raw) => mapTreeRow(raw, "en"))
            .filter((c): c is LocationChild => c !== null);
    },
    ["location-children"],
    { tags: [CACHE_TAGS.locations], revalidate: PUBLIC_CONTENT_REVALIDATE_SECONDS },
);

export async function getLocationChildren(slug: string): Promise<LocationChild[]> {
    if (!hasDatabase()) return [];
    try {
        return await getCachedLocationChildren(slug);
    } catch (err) {
        logCacheFailure("locations", "getLocationChildren", err);
        return [];
    }
}
