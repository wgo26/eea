import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import { CACHE_TAGS, PUBLIC_CONTENT_REVALIDATE_SECONDS } from "@/lib/cache/tags";
import type { Locale } from "@/lib/i18n";
import type { MediaAttachment } from "@/lib/media/attachments";
import { mapAttachments, supportingMedia } from "@/lib/media/attachments";
import { getAdsForSlots, type AdCreative } from "@/lib/queries/ads";

export type StoryCardData = {
    id: string;
    type: string;
    href: string;
    title: string;
    excerpt: string | null;
    imageUrl: string | null;
    location: string | null;
    category: string | null;
    credit: string | null;
    verification: string | null;
    publishedAt: string | null;
    /** True when the item carries video/audio supporting media (Phase B badge). */
    hasVideo?: boolean;
    hasAudio?: boolean;
    /** Non-image attachments (video/audio/document) for detail pages. */
    attachments?: MediaAttachment[];
    /** Notice extras */
    isOfficial?: boolean;
    noticeType?: string | null;
    expiresAt?: string | null;
    /** Listing extras */
    price?: number | null;
    currency?: string | null;
};

/** Re-exported so existing AdSlot callers keep importing from home. */
export type { AdCreative };

export type HomeData = {
    hero: StoryCardData | null;
    /** Featured hero slideshow queue (up to five), lead story first. */
    featured: StoryCardData[];
    secondary: StoryCardData[];
    photoStories: StoryCardData[];
    news: StoryCardData[];
    notices: StoryCardData[];
    listings: StoryCardData[];
    culture: StoryCardData[];
    /** Numbered "trending now" rail: recent stories not shown elsewhere on the page. */
    trending: StoryCardData[];
    ads: {
        banner: AdCreative | null;
        rail: AdCreative | null;
        inlineMid: AdCreative | null;
        inlineBottom: AdCreative | null;
    };
};

type RawItem = {
    id: string;
    type: string;
    slug: string | null;
    verification: string | null;
    published_at: string | null;
    location?: { name: string } | { name: string }[] | null;
    category?:
        | { category_translations: { locale: string; name: string }[] }
        | { category_translations: { locale: string; name: string }[] }[]
        | null;
    translations?: { locale: string; title: string; excerpt: string | null }[] | null;
    media?:
        | { public_url: string | null; photographer_credit: string | null; is_cover: boolean | null; kind: string | null; mime_type: string | null }[]
        | null;
    notices?: { notice_type: string | null; is_official: boolean | null; expiry_date: string | null }[] | null;
    listings?: { price: number | null; currency: string | null }[] | null;
};

const LIMITS = { photo: 4, news: 4, notices: 4, listings: 4, culture: 3, secondary: 3 };

/** Homepage hero slideshow size (spec §1A): five rotating featured stories. */
const FEATURED_LIMIT = 5;

/** "Trending now" rail size: ranked links to stories shown nowhere else on the page. */
const TRENDING_LIMIT = 5;

/** Locale-prefixed detail href (proxy rewrites /fr/... onto the canonical pages). */
function detailHref(locale: Locale, type: string, id: string, slug: string | null): string {
    const base = `/${locale}`;
    switch (type) {
        case "photo_story":
            return `${base}/photo-stories/${slug ?? id}`;
        case "news":
            return `${base}/news/${slug ?? id}`;
        case "culture":
            return `${base}/culture/${slug ?? id}`;
        case "notice":
            return `${base}/notices/${id}`;
        case "listing":
            return `${base}/buy-sell/${id}`;
        default:
            return `${base}/search`;
    }
}

/** PostgREST returns to-one embeds as object or array depending on relationship detection. */
function asOne<T>(value: T | T[] | null | undefined): T | null {
    if (!value) return null;
    return Array.isArray(value) ? (value[0] ?? null) : value;
}

/** Preferred locale → English fallback → first available. */
function pickLocalized<T extends { locale: string }>(
    rows: T[] | null | undefined,
    locale: Locale
): T | null {
    if (!rows || rows.length === 0) return null;
    return rows.find((r) => r.locale === locale) ?? rows.find((r) => r.locale === "en") ?? rows[0];
}

function mapItem(item: RawItem, locale: Locale): StoryCardData | null {
    const translation = pickLocalized(item.translations, locale);
    if (!translation?.title) return null;
    const location = asOne(item.location);
    const category = asOne(item.category);
    const media = item.media ?? [];
    // Cover stays image-first: prefer an image cover, fall back to any media.
    const images = media.filter((m) => (m.kind ?? 'image') === 'image');
    const cover = media.find((m) => m.is_cover) ?? images[0] ?? media[0] ?? null;
    const notice = item.notices?.[0] ?? null;
    const listing = item.listings?.[0] ?? null;

    return {
        id: item.id,
        type: item.type,
        href: detailHref(locale, item.type, item.id, item.slug),
        title: translation.title,
        excerpt: translation.excerpt ?? null,
        imageUrl: cover?.public_url ?? null,
        location: location?.name ?? null,
        category: category
            ? (pickLocalized(category.category_translations, locale)?.name ?? null)
            : null,
        credit: cover?.photographer_credit ?? null,
        verification: item.verification ?? null,
        publishedAt: item.published_at,
        hasVideo: media.some((m) => m.kind === 'video' || (m.mime_type ?? '').startsWith('video/')),
        hasAudio: media.some((m) => m.kind === 'audio' || (m.mime_type ?? '').startsWith('audio/')),
        attachments: supportingMedia(mapAttachments(media)),
        isOfficial: notice?.is_official ?? undefined,
        noticeType: notice?.notice_type ?? undefined,
        expiresAt: notice?.expiry_date ?? undefined,
        price: listing?.price ?? undefined,
        currency: listing?.currency ?? undefined,
    };
}

type QueryResult<T> = { data: T | null; error: { message: string } | null };

/**
 * Phase 4.1 — cached-query error policy: inside the `unstable_cache` scope a
 * failed query THROWS so a transient outage is never baked into the cache.
 * The exported `getHomeData` wrapper catches and falls back to the empty
 * dataset at the call boundary, so the page still renders its placeholders.
 */
async function must<T>(promise: PromiseLike<QueryResult<T>>): Promise<T | null> {
    const { data, error } = await promise;
    if (error) throw new Error(error.message);
    return data;
}

type SlotRow = {
    slot_key: string;
    content_item_id: string | null;
    starts_at: string | null;
    ends_at: string | null;
};

const emptyHomeData: HomeData = {
    hero: null,
    featured: [],
    secondary: [],
    photoStories: [],
    news: [],
    notices: [],
    listings: [],
    culture: [],
    trending: [],
    ads: { banner: null, rail: null, inlineMid: null, inlineBottom: null },
};

/**
 * Phase 4.1 (audit §4.1) — the assembled homepage dataset, cached under the
 * `home` + `news` tags with a 5-minute window. The homepage is statically
 * prerendered/ISR'd; editorial publish and curation actions invalidate the
 * tags so changes land immediately, and the window is the backstop for
 * out-of-band edits.
 */
const getCachedHomeData = unstable_cache(
    async (locale: Locale): Promise<HomeData> => {
        const supabase = createAdminClient();

        const [rawItems, slotRows, ads] = await Promise.all([
            must(
            supabase
                .from("content_items")
                .select(
                    `id, type, slug, verification, published_at,
                     location:locations(name),
                     category:categories(category_translations(locale, name)),
                     translations:content_translations(locale, title, excerpt),
                     media:media_assets(public_url, photographer_credit, is_cover, kind, mime_type),
                     notices(notice_type, is_official, expiry_date),
                     listings(price, currency)`
                )
                .eq("status", "published")
                .eq("is_archived", false)
                .not("published_at", "is", null)
                .order("published_at", { ascending: false })
                .limit(120)
        ),
        must(
            supabase
                .from("homepage_slots")
                .select("slot_key, content_item_id, starts_at, ends_at")
                .eq("is_active", true)
                .in("slot_key", ["hero", "secondary"])
        ),
        // Ad serving lives in lib/queries/ads.ts (window + creative-status
        // aware); unset slots fall back to the placeholder in AdSlot.
        getAdsForSlots(["homepage-banner", "homepage-rail-top", "homepage-inline-mid", "homepage-inline-bottom"]),
    ]);

    const items = (rawItems ?? [])
        .map((i) => mapItem(i as RawItem, locale))
        .filter((i): i is StoryCardData => i !== null);
    if (items.length === 0) return emptyHomeData;

    const byType = (t: string) => items.filter((i) => i.type === t);
    const photoStories = byType("photo_story").slice(0, LIMITS.photo);
    const news = byType("news").slice(0, LIMITS.news);
    const notices = byType("notice").slice(0, LIMITS.notices);
    const listings = byType("listing").slice(0, LIMITS.listings);
    const culture = byType("culture").slice(0, LIMITS.culture);

    // Curated hero + featured slideshow (admin curation, spec §9) with
    // automatic fallbacks: the hero slot leads, curated secondary slots follow,
    // and the latest pool pads the queue up to five rotating features.
    // Slots carry an optional display window (starts_at/ends_at, set from the
    // Feature dialog) — expired or not-yet-started rows are skipped here so
    // featuring with a duration actually ends on time without an admin visit.
    const now = Date.now();
    const slots = ((slotRows ?? []) as SlotRow[]).filter((s) => {
        if (s.starts_at && Date.parse(s.starts_at) > now) return false;
        if (s.ends_at && Date.parse(s.ends_at) <= now) return false;
        return true;
    });
    const heroSlot = slots.find((s) => s.slot_key === "hero");
    let hero: StoryCardData | null = null;
    if (heroSlot?.content_item_id) {
        hero = items.find((i) => i.id === heroSlot.content_item_id) ?? null;
    }
    if (!hero) hero = photoStories[0] ?? news[0] ?? culture[0] ?? items[0] ?? null;

    const featured: StoryCardData[] = [];
    const pushFeature = (story: StoryCardData | null | undefined) => {
        if (story && featured.length < FEATURED_LIMIT && !featured.some((f) => f.id === story.id)) {
            featured.push(story);
        }
    };
    pushFeature(hero);
    for (const slot of slots) {
        if (slot.slot_key === "secondary") {
            pushFeature(items.find((i) => i.id === slot.content_item_id));
        }
    }
    for (const story of [...photoStories, ...news, ...culture, ...items]) {
        if (featured.length >= FEATURED_LIMIT) break;
        pushFeature(story);
    }

    // Rail shows the latest stories beyond the featured five.
    const featuredIds = new Set(featured.map((f) => f.id));
    const secondary = [...photoStories, ...news, ...culture]
        .filter((i) => !featuredIds.has(i.id))
        .slice(0, LIMITS.secondary);

    // "Trending now" rail: the most recent stories not already displayed in a
    // homepage section, so the module only surfaces fresh links.
    const shownIds = new Set([
        ...featuredIds,
        ...photoStories.map((i) => i.id),
        ...news.map((i) => i.id),
        ...notices.map((i) => i.id),
        ...listings.map((i) => i.id),
        ...culture.map((i) => i.id),
    ]);
    const trending = items.filter((i) => !shownIds.has(i.id)).slice(0, TRENDING_LIMIT);
    if (trending.length < 3) {
        // Thin pool: backfill from the featured queue (never the lead hero).
        for (const story of featured) {
            if (trending.length >= 3) break;
            if (story.id === hero?.id || trending.some((t) => t.id === story.id)) continue;
            trending.push(story);
        }
    }

    return {
        hero,
        featured,
        secondary,
        photoStories,
        news,
        notices,
        listings,
        culture,
        trending,
        ads: {
            banner: ads["homepage-banner"] ?? null,
            rail: ads["homepage-rail-top"] ?? null,
            inlineMid: ads["homepage-inline-mid"] ?? null,
            inlineBottom: ads["homepage-inline-bottom"] ?? null,
        },
    };
    },
    ["home-data"],
    {
        tags: [CACHE_TAGS.home, CACHE_TAGS.news, CACHE_TAGS.ads],
        revalidate: PUBLIC_CONTENT_REVALIDATE_SECONDS,
    },
);

/**
 * Homepage dataset for `(public)/page.tsx`. Falls back to the empty dataset
 * when the database is not configured or a query fails — the page renders
 * its empty-section placeholders instead of crashing (safe() semantics).
 */
export async function getHomeData(locale: Locale): Promise<HomeData> {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
        return emptyHomeData;
    }
    try {
        return await getCachedHomeData(locale);
    } catch (err) {
        logger.error("home", "cached query failed", {
            error: err instanceof Error ? err.message : String(err),
        });
        return emptyHomeData;
    }
}
