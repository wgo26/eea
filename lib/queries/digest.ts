import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import type { Locale } from "@/lib/i18n";

export type DigestIssue = {
    sentOn: string;
    subject: string;
    cadence: 'daily' | 'weekly';
    /** Story snapshots stored by the ops-digest cron ({title, section path}). */
    stories: { title: string; path: string }[];
    emailed: number;
    whatsapped: number;
};

/**
 * Public digest archive (features.md §newsletter): one row per sent digest,
 * written by the ops-digest (daily) and weekly-digest (recap) crons into
 * digest_issues (public select RLS). Read through the service-role client
 * like every lib/queries read. Never throws — a DB hiccup renders the
 * archive empty state instead of a broken page, matching the safe()
 * convention in this layer.
 *
 * `cadence` defaults to 'daily' — every existing caller reads the daily
 * issues; the public archive passes 'all' to interleave weekly recaps.
 */
export async function getDigestArchive(
    locale: Locale,
    limit = 60,
    cadence: 'daily' | 'weekly' | 'all' = 'daily',
): Promise<DigestIssue[]> {
    try {
        const db = createAdminClient();
        let query = db
            .from("digest_issues")
            .select("sent_on, locale, subject, stories, emailed, whatsapped, cadence")
            .eq("locale", locale)
            .order("sent_on", { ascending: false })
            .limit(limit);
        if (cadence !== 'all') query = query.eq("cadence", cadence);
        const { data, error } = await query;
        if (error) {
            logger.error("queries/digest", "archive read failed", { error: error.message });
            return [];
        }
        return ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => ({
            sentOn: row.sent_on as string,
            subject: row.subject as string,
            cadence: row.cadence === 'weekly' ? 'weekly' : 'daily',
            stories: Array.isArray(row.stories) ? (row.stories as { title: string; path: string }[]) : [],
            emailed: Number(row.emailed ?? 0),
            whatsapped: Number(row.whatsapped ?? 0),
        }));
    } catch (e) {
        logger.error("queries/digest", "archive read exception", { error: e instanceof Error ? e.message : String(e) });
        return [];
    }
}