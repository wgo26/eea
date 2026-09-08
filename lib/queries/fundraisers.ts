import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import type { Locale } from "@/lib/i18n";

/**
 * Data access for the Community Fundraising module on the news page.
 *
 * A campaign is a published `content_items` row (the story behind it) with a
 * matching `fundraisers` row holding the money metadata. We inner-join the
 * fundraisers table so only real campaigns are returned, and — as everywhere
 * else in the app — a DB hiccup resolves to an empty result rather than an
 * exception.
 */

export type FundraiserData = {
    id: string;
    href: string;
    title: string;
    excerpt: string | null;
    imageUrl: string | null;
    location: string | null;
    locationSlug: string | null;
    goalAmount: number;
    raisedAmount: number;
    currency: string;
    organizerName: string | null;
    organizerPhone: string | null;
    organizerEmail: string | null;
    donationUrl: string | null;
    verificationNotes: string | null;
    closedAt: string | null;
    /**
     * Campaign deadline. The `fundraisers` table has no deadline column, so
     * we use the parent story's `expires_at` — the same field that drives
     * archival elsewhere in the app.
     */
    deadlineAt: string | null;
    publishedAt: string | null;
    verification: string | null;
    /** 0–100, clamped. */
    percent: number;
    isClosed: boolean;
};

type RawFundraiserRow = {
    id: string;
    slug: string | null;
    verification: string | null;
    published_at: string | null;
    expires_at: string | null;
    location?: { name: string | null; slug?: string | null } | { name: string | null; slug?: string | null }[] | null;
    translations?:
        | { locale: string; title: string | null; excerpt: string | null; body: string | null }[]
        | null;
    media?:
        | {
              public_url: string | null;
              alt_text: string | null;
              photographer_credit: string | null;
              is_cover: boolean | null;
          }[]
        | null;
    fundraisers?:
        | {
              goal_amount: number | string | null;
              currency: string | null;
              raised_amount: number | string | null;
              organizer_name: string | null;
              organizer_phone: string | null;
              donation_url: string | null;
              verification_notes: string | null;
              closed_at: string | null;
          }[]
        | null;
};

const FUNDRAISER_SELECT = `id, slug, verification, published_at, expires_at,
    location:locations(name, slug),
    translations:content_translations(locale, title, excerpt, body),
    media:media_assets(public_url, alt_text, photographer_credit, is_cover),
    fundraisers!inner(goal_amount, currency, raised_amount, organizer_name, organizer_phone, donation_url, verification_notes, closed_at)`;

function hasDatabase(): boolean {
    return Boolean(
        process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
    );
}

/** PostgREST returns to-one embeds as object or array depending on detection. */
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

function toNumber(value: number | string | null | undefined): number {
    const n = Number(value ?? 0);
    return Number.isFinite(n) ? n : 0;
}

function clampPercent(raised: number, goal: number): number {
    if (!goal || goal <= 0) return 0;
    return Math.min(100, Math.max(0, Math.round((raised / goal) * 100)));
}

function toFundraiser(row: RawFundraiserRow, locale: Locale): FundraiserData | null {
    const translation = pickLocalized(row.translations, locale);
    if (!translation?.title) return null;
    const fundraiser = asOne(row.fundraisers);
    if (!fundraiser) return null;

    const location = asOne(row.location);
    const cover = (row.media ?? []).find((m) => m.is_cover) ?? row.media?.[0] ?? null;
    const raised = toNumber(fundraiser.raised_amount);
    const goal = toNumber(fundraiser.goal_amount);
    const closedAt = fundraiser.closed_at ?? null;

    return {
        id: row.id,
        href: `/news/${row.slug ?? row.id}`,
        title: translation.title,
        excerpt: translation.excerpt ?? null,
        imageUrl: cover?.public_url ?? null,
        location: location?.name ?? null,
        locationSlug: location?.slug ?? null,
        goalAmount: goal,
        raisedAmount: raised,
        currency: (fundraiser.currency ?? "XAF").toString().trim() || "XAF",
        organizerName: fundraiser.organizer_name ?? null,
        organizerPhone: fundraiser.organizer_phone ?? null,
        organizerEmail: null,
        donationUrl: fundraiser.donation_url ?? null,
        verificationNotes: fundraiser.verification_notes ?? null,
        closedAt,
        deadlineAt: row.expires_at ?? null,
        publishedAt: row.published_at,
        verification: row.verification ?? null,
        percent: clampPercent(raised, goal),
        isClosed: Boolean(closedAt && new Date(closedAt) <= new Date()),
    };
}

/** Base builder: published, unarchived content that has a fundraisers row. */
function publishedFundraisers() {
    return createAdminClient()
        .from("content_items")
        .select(FUNDRAISER_SELECT)
        .eq("status", "published")
        .eq("is_archived", false)
        .not("published_at", "is", null);
}

/**
 * Campaigns for the news page, open ones first then by how close they are to
 * their goal, so the most urgent appeal leads.
 */
export async function getFundraisers(options: {
    locale?: Locale;
    limit?: number;
    /** Exclude campaigns whose `closed_at` has passed. */
    onlyActive?: boolean;
} = {}): Promise<FundraiserData[]> {
    if (!hasDatabase()) return [];
    const limit = options.limit ?? 6;

    try {
        const { data, error } = await publishedFundraisers()
            .order("published_at", { ascending: false, nullsFirst: false })
            .limit(limit * 3);

        if (error) {
            logger.error("fundraisers", "query failed", { error: error.message });
            return [];
        }

        const locale = options.locale ?? "en";
        const all = (data ?? []).flatMap((row) => {
            const item = toFundraiser(row as RawFundraiserRow, locale);
            return item ? [item] : [];
        });
        const filtered = options.onlyActive ? all.filter((f) => !f.isClosed) : all;

        return filtered
            .sort((a, b) => {
                if (a.isClosed !== b.isClosed) return a.isClosed ? 1 : -1;
                if (b.percent !== a.percent) return b.percent - a.percent;
                return (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "");
            })
            .slice(0, limit);
    } catch (err) {
        logger.error("fundraisers", "query exception", { error: err instanceof Error ? err.message : String(err) });
        return [];
    }
}

/** Headline numbers for the fundraising band. */
export async function getFundraiserStats(): Promise<{
    active: number;
    totalRaised: number;
    totalGoal: number;
    currency: string;
    completed: number;
}> {
    const empty = { active: 0, totalRaised: 0, totalGoal: 0, currency: "XAF", completed: 0 };
    if (!hasDatabase()) return empty;

    try {
        const { data, error } = await publishedFundraisers();
        if (error) {
            logger.error("fundraisers:stats", "query failed", { error: error.message });
            return empty;
        }

        let raised = 0;
        let goal = 0;
        let active = 0;
        let completed = 0;
        let currency = "XAF";

        for (const row of data ?? []) {
            const fundraiser = asOne((row as RawFundraiserRow).fundraisers);
            if (!fundraiser) continue;
            const isClosed = Boolean(
                fundraiser.closed_at && new Date(fundraiser.closed_at) <= new Date(),
            );
            raised += toNumber(fundraiser.raised_amount);
            goal += toNumber(fundraiser.goal_amount);
            currency = (fundraiser.currency ?? currency).toString().trim() || currency;
            if (isClosed) completed += 1;
            else active += 1;
        }

        return { active, totalRaised: raised, totalGoal: goal, currency, completed };
    } catch (err) {
        logger.error("fundraisers:stats", "query exception", { error: err instanceof Error ? err.message : String(err) });
        return empty;
    }
}
