import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import type { Locale } from "@/lib/i18n";

export const POLICY_TYPES = [
    "terms",
    "privacy",
    "guidelines",
    "copyright",
    "contact",
] as const;

export type PolicyType = (typeof POLICY_TYPES)[number];

export type PolicyContent = {
    id: string | null;
    policyType: string;
    /** Active-locale body text (markdown-ish), with English fallback. */
    content: string | null;
    locale: Locale;
    version: string | null;
    publishedAt: string | null;
    /** Locales for which a current policy row exists. */
    availableLocales: Locale[];
};

type QueryResult<T> = {
    data: T | null;
    error: { message: string } | null;
    /** Row count when the query was issued with `count: "exact"` (head or not). */
    count: number | null;
};

/** Never let a DB hiccup take the page down — every query resolves to a fallback. */
async function safe<T>(
    promise: PromiseLike<{
        data: T | null;
        error: { message: string } | null;
        count?: number | null;
    }>,
): Promise<QueryResult<T>> {
    try {
        const { data, error, count } = await promise;
        if (error) {
            logger.error("about", "query failed", { error: error.message });
            return { data: null, error, count: count ?? null };
        }
        return { data, error: null, count: count ?? null };
    } catch (err) {
        logger.error("about", "query exception", { error: err instanceof Error ? err.message : String(err) });
        return { data: null, error: { message: String(err) }, count: null };
    }
}

/** The admin client is only usable when the service key is configured. */
function hasDatabase(): boolean {
    return Boolean(
        process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
    );
}

/**
 * The current policy row for a policy_type, locale-aware. Fetches the
 * requested locale and English together so a fallback is always available,
 * and reports which locales have a published version (for the language note).
 */
export async function getPolicy(
    policyType: string,
    locale: Locale,
): Promise<PolicyContent | null> {
    if (!hasDatabase()) return null;

    const { data } = await safe(
        createAdminClient()
            .from("policy_versions")
            .select("id, policy_type, locale, content, version, published_at")
            .eq("policy_type", policyType)
            .eq("is_current", true),
    );

    const rows = (data ?? []) as {
        id: string;
        policy_type: string;
        locale: string;
        content: string | null;
        version: string | null;
        published_at: string | null;
    }[];
    if (rows.length === 0) return null;

    const availableLocales = rows
        .map((r) => r.locale)
        .filter((l): l is Locale => l === "en" || l === "fr");

    const requested = rows.find((r) => r.locale === locale);
    const english = rows.find((r) => r.locale === "en");
    const chosen = requested ?? english ?? rows[0];

    return {
        id: chosen.id ?? null,
        policyType: chosen.policy_type,
        content: chosen.content ?? null,
        locale: (chosen.locale as Locale) ?? "en",
        version: chosen.version ?? null,
        publishedAt: chosen.published_at ?? null,
        availableLocales: Array.from(new Set(availableLocales)),
    };
}

/** All current policies (locale-agnostic), used by the About index. */
export async function getPolicies(
    locale: Locale,
): Promise<Record<string, PolicyContent | null>> {
    const result: Record<string, PolicyContent | null> = {};
    await Promise.all(
        POLICY_TYPES.map(async (type) => {
            result[type] = await getPolicy(type, locale);
        }),
    );
    return result;
}

export type CommunityStats = {
    storiesPublished: number;
    contributors: number;
    locationsCovered: number;
    /** Sum of `raised_amount` across all fundraiser campaigns. */
    raisedTotal: number;
    raisedCurrency: string;
};

const EMPTY_STATS: CommunityStats = {
    storiesPublished: 0,
    contributors: 0,
    locationsCovered: 0,
    raisedTotal: 0,
    raisedCurrency: "XAF",
};

/**
 * Live "proof band" numbers for the About page — an about page that updates
 * itself is part of the product's credibility. Every count degrades to zero
 * on a DB hiccup (the band simply shows 0s, never breaks the page).
 */
export async function getCommunityStats(): Promise<CommunityStats> {
    if (!hasDatabase()) return EMPTY_STATS;

    const client = createAdminClient();

    const [stories, contributors, locations, raised] = await Promise.all([
        safe(
            client
                .from("content_items")
                .select("id", { count: "exact", head: true })
                .eq("status", "published"),
        ),
        safe(client.from("profiles").select("id", { count: "exact", head: true })),
        safe(client.from("locations").select("id", { count: "exact", head: true })),
        safe(client.from("fundraisers").select("raised_amount, currency")),
    ]);

    let raisedTotal = 0;
    let raisedCurrency = EMPTY_STATS.raisedCurrency;
    if (raised.data) {
        for (const row of raised.data as { raised_amount: number | string | null; currency: string | null }[]) {
            const amount = typeof row.raised_amount === "string" ? Number(row.raised_amount) : (row.raised_amount ?? 0);
            if (Number.isFinite(amount)) raisedTotal += amount;
            if (row.currency) raisedCurrency = row.currency;
        }
    }

    return {
        storiesPublished: stories.count ?? 0,
        contributors: contributors.count ?? 0,
        locationsCovered: locations.count ?? 0,
        raisedTotal,
        raisedCurrency,
    };
}
