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
    "/street",
    "/map",
    // NOTE (Phase 1): /offline and /submit are intentionally absent — both
    // render with robots noindex (offline/page.tsx, (focused)/layout.tsx) and
    // must not consume crawl budget or surface as URL-only results.
    "/buy-sell",
    "/notices",
    "/culture",
    "/culture/events",
    "/locations",
    "/contributors",
    "/digest",
    "/digest/archive",
    "/advertise",
    "/about",
    "/about/terms",
    "/about/privacy",
    "/about/guidelines",
    "/about/copyright",
    "/about/contact",
    "/about/verification",
];

type DynamicEntry = { path: string; lastModified?: Date };

const SEGMENT_BY_TYPE: Record<string, string> = {
    news: "/news",
    // Phase 4 — Eye on the Street micro-stories share the /news detail route.
    micro_story: "/news",
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
        const nowIso = new Date().toISOString();
        const [content, notices, events, locations, contributors] = await Promise.all([
            supabase
                .from("content_items")
                .select("type, id, slug, published_at, expires_at")
                .eq("status", "published")
                .eq("is_archived", false)
                .lte("published_at", nowIso)
                // Expired listings must not be indexed (audit §3.2).
                .or(`expires_at.is.null,expires_at.gt.${nowIso}`),
            // Notice expiry lives on notices.expiry_date, not content_items.
            supabase
                .from("notices")
                .select("content_item_id, expiry_date")
                .not("expiry_date", "is", null)
                .lte("expiry_date", nowIso),
            // Phase 1: events are culture content with an events extension row
            // and live at /culture/events/[id] — not covered by SEGMENT_BY_TYPE.
            // Only upcoming/ongoing published events are indexed.
            supabase
                .from("events")
                .select("content_item_id, starts_at, ends_at")
                .gte("starts_at", nowIso),
            supabase.from("locations").select("slug").eq("is_active", true),
            supabase
                .from("profiles")
                .select("id")
                .eq("is_public", true)
                .eq("is_banned", false)
                .eq("is_suspended", false),
        ]);
        const entries: DynamicEntry[] = [];
        const expiredNoticeIds = new Set(
            ((notices.error ? [] : (notices.data ?? [])) as { content_item_id: string | null }[])
                .map((r) => r.content_item_id)
                .filter((id): id is string => Boolean(id)),
        );
        const rows = (content.error ? [] : (content.data ?? [])) as {
            type: string;
            id: string;
            slug: string | null;
            published_at: string | null;
        }[];
        for (const row of rows) {
            const segment = SEGMENT_BY_TYPE[row.type];
            if (!segment) continue;
            // Skip expired notices (covered by the notices.expiry_date query).
            if (row.type === "notice" && expiredNoticeIds.has(row.id)) continue;
            const identifier = row.slug ?? row.id;
            const entry: DynamicEntry = { path: `${segment}/${identifier}` };
            if (row.published_at) entry.lastModified = new Date(row.published_at);
            entries.push(entry);
        }
        // Phase 1: indexable event detail pages (/culture/events/[id]).
        // Resolved against published content_items so drafts/scheduled never leak.
        if (!events.error) {
            const eventRows = (events.data ?? []) as {
                content_item_id: string | null;
                starts_at: string | null;
            }[];
            const publishedById = new Map(
                rows.map((r) => [r.id, r] as const),
            );
            for (const ev of eventRows) {
                if (!ev.content_item_id) continue;
                const parent = publishedById.get(ev.content_item_id);
                if (!parent) continue;
                if (expiredNoticeIds.has(ev.content_item_id)) continue;
                const identifier = parent.slug ?? parent.id;
                entries.push({
                    path: `/culture/events/${identifier}`,
                    lastModified: parent.published_at ? new Date(parent.published_at) : undefined,
                });
            }
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