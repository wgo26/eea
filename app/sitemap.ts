import type { MetadataRoute } from "next";
import { SITE } from "@/lib/constants";
import { locales, defaultLocale, type Locale } from "@/lib/i18n/config";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Locale-aware sitemap (checklist items 1 + 10): every public URL exists in
 * both /en and /fr, each entry cross-references its alternate-language
 * versions (hreflang). Admin/account/auth pages are excluded entirely
 * (they're noindex). Dynamic content entries are fetched best-effort — when
 * the database isn't reachable (e.g. CI build), the static route set is
 * still emitted.
 */

const STATIC_PATHS = [
    "/",
    "/photo-stories",
    "/news",
    "/buy-sell",
    "/notices",
    "/culture",
    "/culture/events",
    "/submit",
    "/submit/news",
    "/submit/photo-story",
    "/submit/buy-sell",
    "/submit/notices",
    "/submit/culture",
    "/locations",
    "/contributors",
    "/advertise",
    "/about",
    "/about/terms",
    "/about/privacy",
    "/about/guidelines",
    "/about/copyright",
    "/about/contact",
];

type DynamicEntry = { path: string; lastModified?: Date };

const SEGMENT_BY_TYPE: Record<string, string> = {
    news: "/news",
    photo_story: "/photo-stories",
    culture: "/culture",
    listing: "/buy-sell",
    notice: "/notices",
};

async function fetchDynamicEntries(): Promise<DynamicEntry[]> {
    try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!supabaseUrl || !serviceKey) return [];

        const supabase = createAdminClient();
        const [content, locations, contributors] = await Promise.all([
            supabase
                .from("content_items")
                .select("type, id, slug, published_at")
                .eq("status", "published"),
            supabase.from("locations").select("slug").eq("is_active", true),
            supabase.from("profiles").select("id").eq("is_public", true),
        ]);
        const entries: DynamicEntry[] = [];
        const rows = (content.error ? [] : (content.data ?? [])) as {
            type: string;
            id: string;
            slug: string | null;
            published_at: string | null;
        }[];
        for (const row of rows) {
            const segment = SEGMENT_BY_TYPE[row.type];
            if (!segment) continue;
            const identifier = row.slug ?? row.id;
            const entry: DynamicEntry = { path: `${segment}/${identifier}` };
            if (row.published_at) entry.lastModified = new Date(row.published_at);
            entries.push(entry);
        }
        if (!locations.error) {
            for (const row of (locations.data ?? []) as { slug: string | null }[]) {
                if (row.slug) entries.push({ path: `/locations/${row.slug}` });
            }
        }
        if (!contributors.error) {
            for (const row of (contributors.data ?? []) as { id: string }[]) {
                entries.push({ path: `/contributors/${row.id}` });
            }
        }
        return entries;
    } catch {
        return [];
    }
}

function entryFor(path: string, locale: Locale, lastModified?: Date): MetadataRoute.Sitemap[number] {
    const prefixed = path === "/" ? `/${locale}` : `/${locale}${path}`;
    const languages = Object.fromEntries(
        locales.map((l) => [l, `${SITE.url}${path === "/" ? `/${l}` : `/${l}${path}`}`]),
    ) as Record<Locale, string>;

    return {
        url: `${SITE.url}${prefixed}`,
        lastModified,
        changeFrequency: undefined,
        alternates: {
            languages: {
                ...languages,
                "x-default": `${SITE.url}${path === "/" ? `/${defaultLocale}` : `/${defaultLocale}${path}`}`,
            },
        },
    };
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const [dynamic] = await Promise.all([fetchDynamicEntries()]);
    const paths = [...STATIC_PATHS, ...dynamic.map((entry) => entry.path)];
    const lastModifiedByPath = new Map(dynamic.map((entry) => [entry.path, entry.lastModified]));

    return paths.flatMap((path) =>
        locales.map((locale) => entryFor(path, locale, lastModifiedByPath.get(path))),
    );
}