import "server-only";

import { logger } from "@/lib/observability/logger";
import type { Locale } from "@/lib/i18n";

/**
 * Shared public-query utilities (P2 code-quality: one copy instead of ~12).
 *
 * Every public vertical (buy-sell, news, notices, photo-stories, culture,
 * search, locations, …) follows the same conventions: the service-role admin
 * client plus a `safe()` wrapper (a DB hiccup must never take the page down),
 * aliased PostgREST embeds, and locale-resolved translations. These helpers
 * were copy-pasted per file with only the logger scope differing — fixes had
 * to be applied N times. Import from here instead.
 */

export type QueryError = { message: string; code?: string };

export type QueryResult<T> = {
    data: T | null;
    count: number | null;
    error: QueryError | null;
};

/** Never let a DB hiccup take the page down — every query resolves to a fallback. */
export async function safe<T>(
    scope: string,
    promise: PromiseLike<{
        data: T | null;
        count?: number | null;
        error: QueryError | null;
    }>,
): Promise<QueryResult<T>> {
    try {
        const { data, count, error } = await promise;
        if (error) {
            logger.error(scope, "query failed", { error: error.message });
            return { data: null, count: null, error };
        }
        return { data, count: count ?? null, error: null };
    } catch (err) {
        logger.error(scope, "query exception", { error: err instanceof Error ? err.message : String(err) });
        return { data: null, count: null, error: { message: String(err) } };
    }
}

/** The admin client is only usable when the service key is configured. */
export function hasDatabase(): boolean {
    return Boolean(
        process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
    );
}

/**
 * Cached-query error policy: inside an `unstable_cache` scope a failed query
 * THROWS instead of resolving to a fallback, so a transient outage is never
 * baked into the cache. The exported wrappers catch, log, and fall back (the
 * safe() semantics) at the call boundary.
 */
export function logCacheFailure(scope: string, fn: string, err: unknown): void {
    logger.error(scope, `cached query failed (${fn})`, {
        error: err instanceof Error ? err.message : String(err),
    });
}

/** PostgREST returns to-one embeds as object or array depending on relationship detection. */
export function asOne<T>(value: T | T[] | null | undefined): T | null {
    if (!value) return null;
    return Array.isArray(value) ? (value[0] ?? null) : value;
}

/** Preferred locale → English fallback → first available. */
export function pickLocalized<T extends { locale: string }>(
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

/** PostgREST `or()` phrases cannot contain commas or wildcard characters. */
export function sanitizePhrase(input: string): string {
    return input
        .replace(/[,()%\\]/g, " ")
        .trim()
        .slice(0, 80);
}

/**
 * Strict variant (notices, search): also strips `*`, which those verticals
 * feed into pattern positions. Everywhere else uses {@link sanitizePhrase}.
 */
export function sanitizePhraseStrict(input: string): string {
    return input
        .replace(/[,()%\\*]/g, " ")
        .trim()
        .slice(0, 80);
}
