import "server-only";

import { unstable_cache } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";
import { CACHE_TAGS, PUBLIC_CONTENT_REVALIDATE_SECONDS } from "@/lib/cache/tags";
import { logger } from "@/lib/observability/logger";
import type { Locale } from "@/lib/i18n";

/**
 * Phase 4 — Community Memory, Then & Now (Differentiators #10/#11).
 *
 * `photo_pairs` links two media_assets (then + now) to a location. Public
 * readers see published pairs; editors manage them from the admin. Every
 * query resolves to a fallback so a DB hiccup never takes a page down.
 */
export type PhotoPair = {
    id: string;
    locationId: string;
    locationSlug: string | null;
    thenImageUrl: string | null;
    nowImageUrl: string | null;
    thenCaption: string | null;
    nowCaption: string | null;
    locale: string;
    sortOrder: number;
};

type PhotoPairRow = {
    id: string;
    location_id: string;
    then_caption: string | null;
    now_caption: string | null;
    locale: string;
    sort_order: number;
    location?: { slug: string | null } | { slug: string | null }[] | null;
    then_image?: { public_url: string | null } | { public_url: string | null }[] | null;
    now_image?: { public_url: string | null } | { public_url: string | null }[] | null;
};

function asOne<T>(value: T | T[] | null | undefined): T | null {
    if (!value) return null;
    return Array.isArray(value) ? (value[0] ?? null) : value;
}

function hasDatabase(): boolean {
    return Boolean(
        process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
    );
}

function mapPair(row: PhotoPairRow): PhotoPair {
    return {
        id: row.id,
        locationId: row.location_id,
        locationSlug: asOne(row.location)?.slug ?? null,
        thenImageUrl: asOne(row.then_image)?.public_url ?? null,
        nowImageUrl: asOne(row.now_image)?.public_url ?? null,
        thenCaption: row.then_caption,
        nowCaption: row.now_caption,
        locale: row.locale,
        sortOrder: row.sort_order,
    };
}

const PAIR_SELECT = `id, location_id, then_caption, now_caption, locale, sort_order,
    location:locations!photo_pairs_location_id_fkey(slug),
    then_image:media_assets!photo_pairs_then_image_id_fkey(public_url),
    now_image:media_assets!photo_pairs_now_image_id_fkey(public_url)`;

/** Published Then & Now pairs for a location slug (locale-preferred first). */
export async function getPhotoPairsForPlace(
    placeSlug: string,
    locale: Locale = "en",
    limit = 6,
): Promise<PhotoPair[]> {
    if (!hasDatabase()) return [];
    try {
        return await getCachedPhotoPairs(placeSlug, locale, limit);
    } catch (err) {
        logger.error("photo-pairs", "cached query failed (getPhotoPairsForPlace)", {
            error: err instanceof Error ? err.message : String(err),
        });
        return [];
    }
}

const getCachedPhotoPairs = unstable_cache(
    async (placeSlug: string, locale: Locale, limit: number): Promise<PhotoPair[]> => {
        const supabase = createAdminClient();
        const { data: loc } = await supabase
            .from("locations")
            .select("id")
            .eq("slug", placeSlug)
            .limit(1);
        const locationId = (loc as { id: string }[] | null)?.[0]?.id;
        if (!locationId) return [];
        const { data, error } = await supabase
            .from("photo_pairs")
            .select(PAIR_SELECT)
            .eq("location_id", locationId)
            .eq("is_published", true)
            .order("sort_order", { ascending: true })
            .limit(limit);
        if (error) throw new Error(error.message);
        const pairs = ((data ?? []) as unknown as PhotoPairRow[]).map(mapPair);
        // Locale-preferred first, then the rest — never drop a pair for
        // locale mismatch (captions are short; coverage matters more).
        return [...pairs.filter((p) => p.locale === locale), ...pairs.filter((p) => p.locale !== locale)];
    },
    ["photo-pairs-for-place"],
    { tags: [CACHE_TAGS.locations], revalidate: PUBLIC_CONTENT_REVALIDATE_SECONDS },
);
