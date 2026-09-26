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
    /** Due, published, unarchived stories (from the content pipeline). */
    storiesPublished: number;
    /** Distinct people with at least one live published story — not accounts. */
    contributors: number;
    /** Active locations that actually hold published content. */
    locationsCovered: number;
    /** Resolved corrections in the trailing 30 days — the accountability number. */
    correctionsPublished30d: number;
    /** Raised funds, one total per currency (never fused across currencies). */
    raisedByCurrency: { currency: string; total: number }[];
    /** The currency of the headline "raised" figure, or null when empty. */
    raisedHeadlineCurrency: string | null;
    /** The headline "raised" figure (largest currency bucket by total). */
    raisedHeadlineTotal: number;
};

const EMPTY_STATS: CommunityStats = {
    storiesPublished: 0,
    contributors: 0,
    locationsCovered: 0,
    correctionsPublished30d: 0,
    raisedByCurrency: [],
    raisedHeadlineCurrency: null,
    raisedHeadlineTotal: 0,
};

type RecordStatsRpc = {
    stories_published?: unknown;
    contributors?: unknown;
    places_covered?: unknown;
    corrections_30d?: unknown;
    raised_by_currency?: unknown;
};

function toCount(value: unknown): number {
    const n = typeof value === "string" ? Number(value) : (value as number);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

function toMoney(value: unknown): number {
    const n = typeof value === "string" ? Number(value) : (value as number);
    return Number.isFinite(n) && n >= 0 ? n : 0;
}

/**
 * Pure map of the `community_record_stats()` RPC payload to CommunityStats —
 * kept free of I/O so the evidence semantics are unit-testable (a record
 * that cannot be audited is just a slogan).
 */
export function mapRecordStats(payload: RecordStatsRpc | null | undefined): CommunityStats {
    if (!payload || typeof payload !== "object") return { ...EMPTY_STATS };
    const raisedByCurrency: { currency: string; total: number }[] = [];
    const raisedRaw = payload.raised_by_currency;
    if (raisedRaw && typeof raisedRaw === "object" && !Array.isArray(raisedRaw)) {
        for (const [currency, total] of Object.entries(raisedRaw as Record<string, unknown>)) {
            const code = currency.trim().toUpperCase();
            const amount = toMoney(total);
            if (code && amount > 0) raisedByCurrency.push({ currency: code, total: amount });
        }
    }
    raisedByCurrency.sort((a, b) => b.total - a.total);
    const headline = raisedByCurrency[0] ?? null;
    return {
        storiesPublished: toCount(payload.stories_published),
        contributors: toCount(payload.contributors),
        locationsCovered: toCount(payload.places_covered),
        correctionsPublished30d: toCount(payload.corrections_30d),
        raisedByCurrency,
        raisedHeadlineCurrency: headline?.currency ?? null,
        raisedHeadlineTotal: headline?.total ?? 0,
    };
}

/**
 * Live "proof band" numbers for the About page — an about page that updates
 * itself is part of the product's credibility. One `community_record_stats()`
 * RPC round trip answers every question the labels ask, replacing the old
 * four independent inventory counts (whose answers the labels did not ask:
 * every profile row, every location row, one fused money figure).
 * A DB hiccup resolves to the empty stats — the band shows 0s and the cache
 * window retries, never breaks the page.
 */
export async function getCommunityStats(): Promise<CommunityStats> {
    if (!hasDatabase()) return EMPTY_STATS;

    try {
        const { data, error } = await createAdminClient().rpc("community_record_stats");
        if (error) throw new Error(error.message);
        return mapRecordStats((data ?? null) as RecordStatsRpc | null);
    } catch (err) {
        logger.error("about", "record stats failed", {
            error: err instanceof Error ? err.message : String(err),
        });
        return { ...EMPTY_STATS };
    }
}
