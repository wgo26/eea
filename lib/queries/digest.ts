import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import type { Locale } from "@/lib/i18n";

export type DigestIssue = {
    sentOn: string;
    subject: string;
    /** Story snapshots stored by the ops-digest cron ({title, section path}). */
    stories: { title: string; path: string }[];
    emailed: number;
    whatsapped: number;
};

/**
 * Public digest archive (features.md §newsletter): one row per sent daily
 * digest, written by the ops-digest cron into digest_issues (public select
 * RLS). Read through the service-role client like every lib/queries read.
 * Never throws — a DB hiccup renders the archive empty state instead of a
 * broken page, matching the safe() convention in this layer.
 */
export async function getDigestArchive(locale: Locale, limit = 60): Promise<DigestIssue[]> {
    try {
        const db = createAdminClient();
        const { data, error } = await db
            .from("digest_issues")
            .select("sent_on, locale, subject, stories, emailed, whatsapped")
            .eq("locale", locale)
            .order("sent_on", { ascending: false })
            .limit(limit);
        if (error) {
            logger.error("queries/digest", "archive read failed", { error: error.message });
            return [];
        }
        return ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => ({
            sentOn: row.sent_on as string,
            subject: row.subject as string,
            stories: Array.isArray(row.stories) ? (row.stories as { title: string; path: string }[]) : [],
            emailed: Number(row.emailed ?? 0),
            whatsapped: Number(row.whatsapped ?? 0),
        }));
    } catch (e) {
        logger.error("queries/digest", "archive read exception", { error: e instanceof Error ? e.message : String(e) });
        return [];
    }
}