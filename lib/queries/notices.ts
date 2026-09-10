import "server-only";

import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import { CACHE_TAGS, PUBLIC_CONTENT_REVALIDATE_SECONDS } from "@/lib/cache/tags";
import type { Locale } from "@/lib/i18n";

/**
 * Data access for the Notices vertical.
 *
 * Mirrors the conventions of `lib/queries/photo-stories.ts`: the admin client
 * plus a `safe()` wrapper (a DB hiccup must never take the page down), aliased
 * PostgREST embeds, and locale-resolved translations. Notices are
 * `content_items` with `type = "notice"`; notice metadata lives in the
 * `notices` table joined via foreign key.
 *
 * PostgREST notes that shaped this file (verified against the live project):
 *
 *  - Embedded filters (`notices.notice_type`, `locations.slug`) only restrict
 *    the *parent* rows when the embed is `!inner`. Plain embeds silently
 *    return every row.
 *  - `or()` cannot reference embedded columns and cannot take an `ilike`
 *    value — both raise PGRST100. Search therefore runs as a two-step query:
 *    ids from `content_translations`, then `.in("id", ids)`.
 *  - `locations!inner` would drop notices that have no location, so it is
 *    only used when a location filter is actually applied.
 */
export const NOTICES_PAGE_SIZE = 12;

/** Notice type identifiers mapped to human-readable labels. */
export const NOTICE_TYPE_LABELS: Record<string, string> = {
    public_notice: "Public Notice",
    lost_found: "Lost & Found",
    road_closure: "Road Closure",
    community_alert: "Community Alert",
    missing_person: "Missing Person",
    service_announcement: "Service Announcement",
    government_notice: "Government Notice",
    school_notice: "School Notice",
    organization_notice: "Organization Notice",
    other: "Other",
};

export type NoticeStatus = "all" | "active" | "expiring" | "expired";
export type NoticeSort = "newest" | "expiring";

/**
 * A single notice with all metadata fields.
 */
export type NoticeData = {
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
    noticeType: string | null;
    isOfficial: boolean | null;
    expiresAt: string | null;
    organizationName: string | null;
    /** True when the notice has contact details (values never leave the server — PII-safe like buy-sell). */
    hasContact: boolean;
    body?: string | null;
};

/** Raw row shape returned by the shared notice select. */
type RawNoticeRow = {
    id: string;
    slug: string | null;
    verification: string | null;
    published_at: string | null;
    location?: { name: string; slug: string | null } | { name: string; slug: string | null }[] | null;
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
              photographer_credit: string | null;
              is_cover: boolean | null;
              sort_order: number | null;
          }[]
        | null;
    notices?:
        | {
              notice_type: string | null;
              is_official: boolean | null;
              expiry_date: string | null;
              organization_name: string | null;
              contact_phone: string | null;
              contact_email: string | null;
          }[]
        | null;
};

const NOTICE_SELECT = `id, slug, verification, published_at,
    location:locations(name, slug),
    category:categories(category_translations(locale, name)),
    translations:content_translations(locale, title, excerpt, body),
    media:media_assets(public_url, alt_text, photographer_credit, is_cover, sort_order),
    notices!inner(notice_type, is_official, expiry_date, organization_name, contact_phone, contact_email)`;

/** Same select, but the location join is inner so `locations.slug` filters. */
const NOTICE_SELECT_WITH_LOCATION = NOTICE_SELECT.replace(
    "location:locations(",
    "location:locations!inner(",
);

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
        error: { message: string; code?: string } | null;
    }>,
): Promise<QueryResult<T>> {
    try {
        const { data, count, error } = await promise;
        if (error) {
            logger.error("notices", "query failed", { error: error.message });
            return { data: null, count: null, error };
        }
        return { data, count: count ?? null, error: null };
    } catch (err) {
        logger.error("notices", "query exception", { error: err instanceof Error ? err.message : String(err) });
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
    logger.error("notices", `cached query failed (${fn})`, {
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

/** PostgREST `or()` phrases cannot contain commas, wildcards or parentheses. */
function sanitizePhrase(input: string): string {
    return input
        .replace(/[,()%\\*]/g, " ")
        .trim()
        .slice(0, 80);
}

function isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

/**
 * Whether a notice is still active: either no expiry date, or expiry is in
 * the future.
 */
function isNoticeActive(notice: { expiry_date: string | null }): boolean {
    if (!notice.expiry_date) return true;
    return new Date(notice.expiry_date) > new Date();
}

/** Base builder for every public notice query (published, unarchived). */
function publishedNotices(select = NOTICE_SELECT, countExact = false) {
    return createAdminClient()
        .from("content_items")
        .select(select, countExact ? { count: "exact" } : undefined)
        .eq("type", "notice")
        .eq("status", "published")
        .eq("is_archived", false)
        .not("published_at", "is", null);
}

/** Maps one raw row to the NoticeData shape; null without a title. */
function toNoticeData(row: RawNoticeRow, locale: Locale): NoticeData | null {
    const translation = pickLocalized(row.translations, locale);
    if (!translation?.title) return null;

    const location = asOne(row.location);
    const category = asOne(row.category);
    const media = row.media ?? [];
    const cover = media.find((m) => m.is_cover) ?? media[0] ?? null;
    const notice = asOne(row.notices);

    const slug = row.slug ?? row.id;
    const hasContact = Boolean(notice?.contact_phone || notice?.contact_email);

    return {
        id: row.id,
        type: "notice",
        href: `/notices/${slug}`,
        title: translation.title,
        excerpt: translation.excerpt ?? null,
        imageUrl: cover?.public_url ?? null,
        location: location?.name ?? null,
        locationSlug: location?.slug ?? null,
        category: category
            ? (pickLocalized(category.category_translations, locale)?.name ?? null)
            : null,
        credit: cover?.photographer_credit ?? null,
        verification: row.verification ?? null,
        publishedAt: row.published_at,
        noticeType: notice?.notice_type ?? null,
        isOfficial: notice?.is_official ?? null,
        expiresAt: notice?.expiry_date ?? null,
        organizationName: notice?.organization_name ?? null,
        hasContact,
        body: translation.body ?? null,
    };
}

/**
 * Two-step search: `or()` + `ilike` cannot reference embedded tables, so we
 * collect matching ids from `content_translations` first. Returns `null` when
 * there is no search term (meaning "no constraint").
 */
async function searchIds(search: string | undefined): Promise<string[] | null> {
    const term = search?.trim();
    if (!term) return null;
    const phrase = sanitizePhrase(term);
    if (!phrase) return null;

    const { data } = await safe(
        createAdminClient()
            .from("content_translations")
            .select("content_item_id")
            .or(`title.ilike.*${phrase}*,excerpt.ilike.*${phrase}*`),
    );
    const ids = (data ?? []).flatMap((row) => {
        const id = (row as { content_item_id: string | null }).content_item_id;
        return id ? [id] : [];
    });
    // No matches at all — return an empty (never null) list so the caller
    // knows to short-circuit rather than returning everything.
    return ids;
}

/**
 * Notice ids matching a lifecycle status. Done on the `notices` table where
 * plain `or()` works, because `expiry_date IS NULL OR expiry_date > now`
 * cannot be expressed against the embedded resource.
 */
async function statusIds(status: NoticeStatus): Promise<string[] | null> {
    if (status === "all") return null;

    const supabase = createAdminClient();
    const nowIso = new Date().toISOString();

    if (status === "expiring") {
        const soonIso = new Date(Date.now() + 3 * 86_400_000).toISOString();
        const { data } = await safe(
            supabase
                .from("notices")
                .select("content_item_id")
                .gte("expiry_date", nowIso)
                .lte("expiry_date", soonIso),
        );
        return (data ?? []).flatMap((r) =>
            (r as { content_item_id: string | null }).content_item_id
                ? [(r as { content_item_id: string }).content_item_id]
                : [],
        );
    }

    if (status === "expired") {
        const { data } = await safe(
            supabase.from("notices").select("content_item_id").lte("expiry_date", nowIso),
        );
        return (data ?? []).flatMap((r) =>
            (r as { content_item_id: string | null }).content_item_id
                ? [(r as { content_item_id: string }).content_item_id]
                : [],
        );
    }

    // active: no expiry, or expiry in the future
    const { data } = await safe(
        supabase
            .from("notices")
            .select("content_item_id")
            .or(`expiry_date.is.null,expiry_date.gt.${nowIso}`),
    );
    return (data ?? []).flatMap((r) =>
        (r as { content_item_id: string | null }).content_item_id
            ? [(r as { content_item_id: string }).content_item_id]
            : [],
    );
}

/**
 * Paged board of published notices.
 *
 * `status` narrows by lifecycle (active / expiring / expired), `sort` switches
 * between recency and "expiring soonest", and the usual search / type /
 * location facets apply.
 *
 * Phase 4.1: the whole result is cached (tag `notices`). The two-step id
 * lookups (`searchIds`/`statusIds`) stay uncached — they return null-vs-empty
 * with distinct semantics — and run inside the cached scope; the outer result
 * is what's cached.
 */
type CachedNoticesArgs = {
    search?: string;
    noticeType?: string;
    location?: string;
    status: NoticeStatus;
    sort: NoticeSort;
    locale: Locale;
    page: number;
};

const getCachedNotices = unstable_cache(
    async (args: CachedNoticesArgs): Promise<{
        notices: NoticeData[];
        total: number;
        page: number;
        pageCount: number;
    }> => {
        const [searchMatches, lifecycle] = await Promise.all([
            searchIds(args.search),
            statusIds(args.status),
        ]);

        // An empty id list means "definitely nothing" — short-circuit so we never
        // fall back to showing every notice.
        if ((searchMatches && searchMatches.length === 0) || (lifecycle && lifecycle.length === 0)) {
            return { notices: [], total: 0, page: 1, pageCount: 1 };
        }

        let query = publishedNotices(
            args.location ? NOTICE_SELECT_WITH_LOCATION : NOTICE_SELECT,
            true,
        );
        if (searchMatches) query = query.in("id", searchMatches);
        if (lifecycle) query = query.in("id", lifecycle);
        if (args.noticeType) query = query.eq("notices.notice_type", sanitizePhrase(args.noticeType));
        if (args.location) query = query.eq("locations.slug", sanitizePhrase(args.location));

        const from = (args.page - 1) * NOTICES_PAGE_SIZE;

        if (args.sort === "expiring") {
            // Only notices that actually expire can be ordered this way.
            // The Supabase type system can't handle this complex query chaining,
            // so we cast through unknown to bypass type checking
            query = (query
                .not("notices.expiry_date", "is", null)
                .order("notices(expiry_date)", { ascending: true }) as unknown as typeof query);
        } else {
            query = query.order("published_at", { ascending: false, nullsFirst: false });
        }

        const { data, count: total, error } = await query.range(from, from + NOTICES_PAGE_SIZE - 1);
        if (error) throw new Error(error.message);

        const notices = ((data ?? []) as unknown as RawNoticeRow[]).flatMap((row) => {
            const notice = toNoticeData(row, args.locale);
            return notice ? [notice] : [];
        });
        const totalCount = total ?? 0;
        return {
            notices,
            total: totalCount,
            page: args.page,
            pageCount: Math.max(1, Math.ceil(totalCount / NOTICES_PAGE_SIZE)),
        };
    },
    ["notices-board"],
    { tags: [CACHE_TAGS.notices], revalidate: PUBLIC_CONTENT_REVALIDATE_SECONDS },
);

export async function getNotices(options: {
    search?: string;
    noticeType?: string;
    location?: string;
    status?: NoticeStatus;
    sort?: NoticeSort;
    locale?: Locale;
    page?: number;
}): Promise<{ notices: NoticeData[]; total: number; page: number; pageCount: number }> {
    if (!hasDatabase()) {
        return { notices: [], total: 0, page: 1, pageCount: 1 };
    }
    // Sanitize before the cache call so the cache key is canonical.
    const searchTerm = options.search?.trim();
    const noticeTypeTerm = options.noticeType?.trim();
    const locationTerm = options.location?.trim();
    const args: CachedNoticesArgs = {
        search: searchTerm ? sanitizePhrase(searchTerm) || undefined : undefined,
        noticeType: noticeTypeTerm ? sanitizePhrase(noticeTypeTerm) || undefined : undefined,
        location: locationTerm ? sanitizePhrase(locationTerm) || undefined : undefined,
        status: options.status ?? "all",
        sort: options.sort ?? "newest",
        locale: options.locale ?? "en",
        page: Math.max(1, options.page ?? 1),
    };
    try {
        return await getCachedNotices(args);
    } catch (err) {
        logCacheFailure("getNotices", err);
        return { notices: [], total: 0, page: 1, pageCount: 1 };
    }
}

/**
 * One notice by UUID or slug, for the detail page (null when not found).
 * Phase 4.1: cached (tag `notices`) — this is the hot read behind the ISR'd
 * detail pages; publish/unpublish invalidates via revalidateTag('notices', 'max')
 * from the admin actions.
 */
const getCachedNoticeById = unstable_cache(
    async (identifier: string, locale: Locale): Promise<NoticeData | null> => {
        const query = publishedNotices();
        const { data, error } = await (
            isUuid(identifier) ? query.eq("id", identifier) : query.eq("slug", identifier)
        ).limit(1);
        if (error) throw new Error(error.message);
        const row = asOne((data as unknown as RawNoticeRow[]) ?? []);
        return row ? toNoticeData(row, locale) : null;
    },
    ["notice-by-id"],
    { tags: [CACHE_TAGS.notices], revalidate: PUBLIC_CONTENT_REVALIDATE_SECONDS },
);

export async function getNoticeById(
    id: string,
    locale: Locale = "en",
): Promise<NoticeData | null> {
    if (!hasDatabase()) return null;
    // Sanitize before both the cache key and the query so one canonical
    // string serves every raw spelling of the same URL segment.
    const identifier = sanitizePhrase(id);
    if (!identifier) return null;
    try {
        return await getCachedNoticeById(identifier, locale);
    } catch (err) {
        logCacheFailure("getNoticeById", err);
        return null;
    }
}

/**
 * Board statistics for the header strip: live notices, how many are about to
 * expire, how many are official versus community-sourced, and coverage.
 * Phase 4.1: cached (tag `notices`); the "expiring soon" window is computed
 * once per cache window, which is fine for a stat strip.
 */
const getCachedNoticesStats = unstable_cache(
    async (): Promise<{
        total: number;
        active: number;
        expiring: number;
        official: number;
        places: number;
    }> => {
        const nowIso = new Date().toISOString();
        const soonIso = new Date(Date.now() + 3 * 86_400_000).toISOString();
        const supabase = createAdminClient();

        const [all, official, expiring, rows] = await Promise.all([
            supabase.from("notices").select("content_item_id, expiry_date"),
            supabase.from("notices").select("content_item_id").eq("is_official", true),
            supabase
                .from("notices")
                .select("content_item_id")
                .gte("expiry_date", nowIso)
                .lte("expiry_date", soonIso),
            publishedNotices().select(
                "id, location:locations(name, slug), notices!inner(is_official)",
            ),
        ]);
        if (all.error) throw new Error(all.error.message);
        if (official.error) throw new Error(official.error.message);
        if (expiring.error) throw new Error(expiring.error.message);
        if (rows.error) throw new Error(rows.error.message);

        const allRows = (all.data ?? []) as { expiry_date: string | null }[];
        const active = allRows.filter((r) =>
            r.expiry_date ? new Date(r.expiry_date) > new Date() : true,
        ).length;

        const places = new Set<string>();
        for (const row of ((rows.data ?? []) as unknown as {
            location?: { name: string; slug: string | null } | { name: string; slug: string | null }[] | null;
        }[])) {
            const location = asOne(row.location);
            if (location?.name) places.add(location.name);
        }

        return {
            total: allRows.length,
            active,
            expiring: expiring.data?.length ?? 0,
            official: official.data?.length ?? 0,
            places: places.size,
        };
    },
    ["notices-stats"],
    { tags: [CACHE_TAGS.notices], revalidate: PUBLIC_CONTENT_REVALIDATE_SECONDS },
);

export async function getNoticesStats(): Promise<{
    total: number;
    active: number;
    expiring: number;
    official: number;
    places: number;
}> {
    const empty = { total: 0, active: 0, expiring: 0, official: 0, places: 0 };
    if (!hasDatabase()) return empty;
    try {
        return await getCachedNoticesStats();
    } catch (err) {
        logCacheFailure("getNoticesStats", err);
        return empty;
    }
}

/**
 * The single most urgent live notice for the top-of-board alert: a missing
 * person or community alert that has not expired, newest first.
 * Phase 4.1: cached (tag `notices`).
 */
const getCachedUrgentNotice = unstable_cache(
    async (locale: Locale): Promise<NoticeData | null> => {
        const { data, error } = await publishedNotices()
            .in("notices.notice_type", ["missing_person", "community_alert"])
            .order("published_at", { ascending: false, nullsFirst: false })
            .limit(6);
        if (error) throw new Error(error.message);
        const row = ((data ?? []) as unknown as RawNoticeRow[]).find((r) => {
            const notice = asOne(r.notices);
            return notice ? isNoticeActive(notice) : true;
        });
        return row ? toNoticeData(row, locale) : null;
    },
    ["notices-urgent"],
    { tags: [CACHE_TAGS.notices], revalidate: PUBLIC_CONTENT_REVALIDATE_SECONDS },
);

export async function getUrgentNotice(locale: Locale = "en"): Promise<NoticeData | null> {
    if (!hasDatabase()) return null;
    try {
        return await getCachedUrgentNotice(locale);
    } catch (err) {
        logCacheFailure("getUrgentNotice", err);
        return null;
    }
}

/**
 * Featured notice for the board: the newest official notice that has not
 * expired, falling back to the newest notice of any kind.
 * Phase 4.1: cached (tag `notices`).
 */
const getCachedFeaturedNotice = unstable_cache(
    async (locale: Locale): Promise<NoticeData | null> => {
        const { data: officialData, error: officialError } = await publishedNotices()
            .eq("notices.is_official", true)
            .order("published_at", { ascending: false, nullsFirst: false })
            .limit(5);
        if (officialError) throw new Error(officialError.message);
        const officialRows = ((officialData ?? []) as unknown as RawNoticeRow[]).filter((row) => {
            const notice = asOne(row.notices);
            return notice ? isNoticeActive(notice) : true;
        });
        if (officialRows.length > 0) {
            return toNoticeData(officialRows[0], locale);
        }

        const { data: anyData, error: anyError } = await publishedNotices()
            .order("published_at", { ascending: false, nullsFirst: false })
            .limit(1);
        if (anyError) throw new Error(anyError.message);
        const anyRow = asOne((anyData as unknown as RawNoticeRow[]) ?? []);
        return anyRow ? toNoticeData(anyRow, locale) : null;
    },
    ["notices-featured"],
    { tags: [CACHE_TAGS.notices], revalidate: PUBLIC_CONTENT_REVALIDATE_SECONDS },
);

export async function getFeaturedNotice(locale: Locale = "en"): Promise<NoticeData | null> {
    if (!hasDatabase()) return null;
    try {
        return await getCachedFeaturedNotice(locale);
    } catch (err) {
        logCacheFailure("getFeaturedNotice", err);
        return null;
    }
}

/**
 * Notices filtered by location slug, newest first. Optional limit to
 * control rail/card count.
 * Phase 4.1: cached (tag `notices`).
 */
const getCachedNoticesByLocation = unstable_cache(
    async (locationSlug: string, locale: Locale, limit: number): Promise<NoticeData[]> => {
        const { data, error } = await publishedNotices(NOTICE_SELECT_WITH_LOCATION)
            .eq("locations.slug", locationSlug)
            .order("published_at", { ascending: false, nullsFirst: false })
            .limit(limit);
        if (error) throw new Error(error.message);
        return ((data ?? []) as unknown as RawNoticeRow[]).flatMap((row) => {
            const notice = toNoticeData(row, locale);
            return notice ? [notice] : [];
        });
    },
    ["notices-by-location"],
    { tags: [CACHE_TAGS.notices], revalidate: PUBLIC_CONTENT_REVALIDATE_SECONDS },
);

export async function getNoticesByLocation(
    locationSlug: string,
    locale: Locale = "en",
    limit = 5,
): Promise<NoticeData[]> {
    if (!hasDatabase()) return [];
    // Sanitize before the cache call so the cache key is canonical.
    const slug = sanitizePhrase(locationSlug);
    if (!slug) return [];
    try {
        return await getCachedNoticesByLocation(slug, locale, limit);
    } catch (err) {
        logCacheFailure("getNoticesByLocation", err);
        return [];
    }
}

/**
 * Location filter facets from the shared `locations` table (active only).
 * Phase 4.1: cached (tag `notices`).
 */
const getCachedNoticesLocations = unstable_cache(
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
    ["notices-locations"],
    { tags: [CACHE_TAGS.notices], revalidate: PUBLIC_CONTENT_REVALIDATE_SECONDS },
);

export async function getNoticesLocations(): Promise<
    { slug: string; name: string }[]
> {
    if (!hasDatabase()) return [];
    try {
        return await getCachedNoticesLocations();
    } catch (err) {
        logCacheFailure("getNoticesLocations", err);
        return [];
    }
}

/**
 * Notice type facets with totals, counted across published notices only
 * (empty types are hidden). Sorted so the loudest categories lead.
 * Phase 4.1: cached (tag `notices`) — the facet list only changes on
 * editorial publish events, which call revalidateTag('notices', 'max').
 */
const getCachedNoticeTypes = unstable_cache(
    async (): Promise<{ type: string; label: string; total: number }[]> => {
        const { data, error } = await publishedNotices().select("notices!inner(notice_type)");
        if (error) throw new Error(error.message);

        const typeCounts = new Map<string, number>();
        for (const row of ((data ?? []) as unknown as {
            notices?: { notice_type: string | null } | { notice_type: string | null }[] | null;
        }[])) {
            const notice = asOne(row.notices);
            if (notice?.notice_type) {
                typeCounts.set(notice.notice_type, (typeCounts.get(notice.notice_type) ?? 0) + 1);
            }
        }

        return Array.from(typeCounts.entries())
            .map(([type, total]) => ({
                type,
                label: NOTICE_TYPE_LABELS[type] ?? type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
                total,
            }))
            .filter((f) => f.total > 0)
            .sort((a, b) => b.total - a.total);
    },
    ["notices-types"],
    { tags: [CACHE_TAGS.notices], revalidate: PUBLIC_CONTENT_REVALIDATE_SECONDS },
);

export async function getNoticeTypes(): Promise<
    { type: string; label: string; total: number }[]
> {
    if (!hasDatabase()) return [];
    try {
        return await getCachedNoticeTypes();
    } catch (err) {
        logCacheFailure("getNoticeTypes", err);
        return [];
    }
}
