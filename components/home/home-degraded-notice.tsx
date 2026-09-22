import { TriangleAlert } from "lucide-react";

import { getHomeData } from "@/lib/queries/home";
import type { Dictionary } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/config";

/**
 * Phase 2 — honest degraded signal for the homepage.
 *
 * Public queries use safe() fallbacks (empty 200 instead of a crash), which
 * hides DB outages from readers. This notice renders ONLY when the database
 * is configured but every content rail came back empty — i.e. the fallback
 * path fired, not a brand-new empty site (unconfigured DB renders nothing).
 * Copy deliberately says "couldn't load", never "outage".
 */
export async function HomeDegradedNotice({
    locale,
    dict,
}: {
    locale: Locale;
    dict: Dictionary;
}) {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
        return null;
    }
    let empty = false;
    try {
        const data = await getHomeData(locale);
        empty =
            !data.hero &&
            data.featured.length === 0 &&
            data.photoStories.length === 0 &&
            data.news.length === 0 &&
            data.notices.length === 0 &&
            data.listings.length === 0 &&
            data.culture.length === 0;
    } catch {
        empty = true;
    }
    if (!empty) return null;
    return (
        <div
            role="status"
            className="flex items-start gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm"
        >
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
            <div>
                <p className="font-semibold">{dict.home.degradedTitle}</p>
                <p className="mt-0.5 text-muted-foreground">{dict.home.degradedBody}</p>
            </div>
        </div>
    );
}
