import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Locale } from "@/lib/i18n";

export type ContributorProfile = {
    id: string;
    displayName: string | null;
    fullName: string | null;
    bio: string | null;
    avatarUrl: string | null;
    isVerified: boolean;
    locationName: string | null;
    publishedCount: number;
    photoCount: number;
    categories: string[];
};

export type ContributorContent = {
    id: string;
    type: string;
    title: string;
    href: string;
    imageUrl: string | null;
    publishedAt: string | null;
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
            console.error("[contributors]", error.message);
            return { data: null, count: null, error };
        }
        return { data, count: count ?? null, error: null };
    } catch (err) {
        console.error("[contributors]", err);
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

/** Locale-prefixed detail href (proxy rewrites /fr/... onto the canonical pages). */
function detailHref(locale: Locale, type: string, slug: string | null, id: string): string {
    const base = `/${locale}`;
    const key = slug ?? id;
    switch (type) {
        case "photo_story":
            return `${base}/photo-stories/${key}`;
        case "news":
            return `${base}/news/${key}`;
        case "culture":
            return `${base}/culture/${key}`;
        case "notice":
            return `/notices/${id}`;
        case "listing":
            return `/buy-sell/${id}`;
        default:
            return `/search`;
    }
}

const CONTRIBUTOR_PAGE_SIZE = 24;

type RawContributorRow = {
    id: string;
    display_name: string | null;
    full_name: string | null;
    bio: string | null;
    avatar_url: string | null;
    is_verified: boolean | null;
    location?: { name: string | null } | { name: string | null }[] | null;
};

type RawContentRow = {
    id: string;
    type: string;
    slug: string | null;
    published_at: string | null;
    category?:
        | { category_translations: { locale: string; name: string }[] }
        | { category_translations: { locale: string; name: string }[] }[]
        | null;
    translations?: { locale: string; title: string }[] | null;
    media?: { public_url: string | null }[] | null;
};

const CONTRIBUTOR_SELECT = `id, display_name, full_name, bio, avatar_url, is_verified,
    location:locations(name)`;

/** Maps a raw contributor row to the public shape. */
function mapContributor(raw: RawContributorRow): ContributorProfile {
    const location = asOne(raw.location);
    return {
        id: raw.id,
        displayName: raw.display_name,
        fullName: raw.full_name,
        bio: raw.bio,
        avatarUrl: raw.avatar_url,
        isVerified: raw.is_verified ?? false,
        locationName: location?.name ?? null,
        publishedCount: 0,
        photoCount: 0,
        categories: [],
    };
}

/** Maps a raw content row to the public content shape. */
function mapContent(row: RawContentRow, locale: Locale): ContributorContent | null {
    const translation = pickLocalized(row.translations, locale);
    if (!translation?.title) return null;
    const category = asOne(row.category);
    const media = row.media ?? [];
    const cover = media[0] ?? null;

    return {
        id: row.id,
        type: row.type,
        title: translation.title,
        href: detailHref(locale, row.type, row.slug, row.id),
        imageUrl: cover?.public_url ?? null,
        publishedAt: row.published_at,
        category: category
            ? (pickLocalized(category.category_translations, locale)?.name ?? null)
            : null,
    };
}

/**
 * Paged list of public contributor profiles with published content counts.
 * Each contributor's published/photo counts and category list are computed
 * from the `content_items` table keyed on `author_id` → `profiles.id`.
 */
export async function getContributors(
    options?: { page?: number; limit?: number; locale?: Locale },
): Promise<{ contributors: ContributorProfile[]; total: number; pageCount: number }> {
    if (!hasDatabase()) {
        return { contributors: [], total: 0, pageCount: 1 };
    }
    const page = Math.max(1, options?.page ?? 1);
    const limit = options?.limit ?? CONTRIBUTOR_PAGE_SIZE;
    const supabase = createAdminClient();

    const [contributorsResult, contentResult] = await Promise.all([
        safe(
            supabase
                .from("profiles")
                .select(CONTRIBUTOR_SELECT, { count: "exact" })
                .eq("is_public", true)
                .order("display_name", { ascending: true, nullsFirst: true })
                .range((page - 1) * limit, page * limit - 1),
        ),
        safe(
            supabase
                .from("content_items")
                .select(
                    "author_id, type, category:categories(category_translations(locale, name))",
                )
                .eq("status", "published")
                .eq("is_archived", false)
                .not("published_at", "is", null),
        ),
    ]);

    const totalCount = contributorsResult.count ?? 0;

    // Aggregate counts and categories per contributor.
    const countsMap = new Map<
        string,
        { published: number; photo: number; categories: Set<string> }
    >();
    for (const row of contentResult.data ?? []) {
        const raw = row as {
            author_id: string | null;
            type: string;
            category?: { category_translations?: { locale: string; name: string }[] } | null;
        };
        if (!raw.author_id) continue;
        const entry =
            countsMap.get(raw.author_id) ??
            { published: 0, photo: 0, categories: new Set<string>() };
        entry.published++;
        if (raw.type === "photo_story") entry.photo++;
        const cat = asOne(raw.category);
        const catName = cat ? pickLocalized(cat.category_translations, "en")?.name : null;
        if (catName) entry.categories.add(catName);
        countsMap.set(raw.author_id, entry);
    }

    const contributors = (contributorsResult.data ?? []).flatMap((row) => {
        const contributor = mapContributor(row as RawContributorRow);
        const counts = countsMap.get(contributor.id);
        return [
            {
                ...contributor,
                publishedCount: counts?.published ?? 0,
                photoCount: counts?.photo ?? 0,
                categories: counts ? [...counts.categories] : [],
            },
        ];
    });

    return {
        contributors,
        total: totalCount,
        pageCount: Math.max(1, Math.ceil(totalCount / limit)),
    };
}

/** Fetches a single public contributor profile by ID (null when not found). */
export async function getContributorById(
    id: string,
    locale: Locale = "en",
): Promise<{ profile: ContributorProfile | null; content: ContributorContent[] }> {
    if (!hasDatabase()) return { profile: null, content: [] };
    const supabase = createAdminClient();

    const [contributorResult, contentResult] = await Promise.all([
        safe(
            supabase
                .from("profiles")
                .select(CONTRIBUTOR_SELECT)
                .eq("id", id)
                .eq("is_public", true)
                .limit(1),
        ),
        safe(
            supabase
                .from("content_items")
                .select(
                    `id, type, slug, published_at,
                     category:categories(category_translations(locale, name)),
                     translations:content_translations(locale, title),
                     media:media_assets(public_url)`,
                )
                .eq("author_id", id)
                .eq("status", "published")
                .eq("is_archived", false)
                .not("published_at", "is", null)
                .order("published_at", { ascending: false })
                .limit(50),
        ),
    ]);

    const row = asOne(contributorResult.data);
    if (!row) return { profile: null, content: [] };
    const contributor = mapContributor(row as RawContributorRow);

    let photoCount = 0;
    const categories = new Set<string>();
    for (const item of contentResult.data ?? []) {
        const raw = item as RawContentRow;
        if (raw.type === "photo_story") photoCount++;
        const cat = asOne(raw.category);
        const catName = cat ? pickLocalized(cat.category_translations, "en")?.name : null;
        if (catName) categories.add(catName);
    }

    const content = (contentResult.data ?? []).flatMap((row) => {
        const item = mapContent(row as RawContentRow, locale);
        return item ? [item] : [];
    });

    return {
        profile: {
            ...contributor,
            publishedCount: content.length,
            photoCount,
            categories: [...categories],
        },
        content,
    };
}

/** Fetches published content items authored by a contributor, newest first. */
export async function getContributorContent(
    contributorId: string,
    locale: Locale = "en",
): Promise<ContributorContent[]> {
    if (!hasDatabase()) return [];
    const { data } = await safe(
        createAdminClient()
            .from("content_items")
            .select(
                `id, type, slug, published_at,
                 category:categories(category_translations(locale, name)),
                 translations:content_translations(locale, title),
                 media:media_assets(public_url)`,
            )
            .eq("author_id", contributorId)
            .eq("status", "published")
            .eq("is_archived", false)
            .not("published_at", "is", null)
            .order("published_at", { ascending: false })
            .limit(50),
    );
    return (data ?? []).flatMap((row) => {
        const item = mapContent(row as RawContentRow, locale);
        return item ? [item] : [];
    });
}
