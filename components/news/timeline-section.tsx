import { formatDateTime } from "@/lib/i18n";
import type { Dictionary, Locale } from "@/lib/i18n";
import { getTimelineEntries } from "@/lib/queries/timeline";

/**
 * Phase 4 — Eagle Eye Timeline (Differentiator #6) on the article page.
 *
 * Live-updating developing stories: timestamped entries appended by editors
 * render oldest-first under the body, with a count badge. Renders null when
 * the story has no published entries, so non-developing articles are
 * byte-identical to before.
 */
export async function TimelineSection({
    contentItemId,
    locale,
    dict,
}: {
    contentItemId: string;
    locale: Locale;
    dict: Dictionary;
}) {
    const entries = await getTimelineEntries(contentItemId, locale, true);
    if (entries.length === 0) return null;

    const countLabel = (dict.news.timelineCount ?? "{count} updates").replace(
        "{count}",
        String(entries.length),
    );

    return (
        <section aria-label={dict.news.timeline} className="mt-10 max-w-4xl">
            <div className="mb-5 flex flex-wrap items-center gap-3">
                <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-bold uppercase tracking-[0.14em] text-amber-700 dark:text-amber-400">
                    {dict.news.liveNow ?? "Live now"}
                </span>
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">{dict.news.timeline}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                        {dict.news.timelineHint} · {countLabel}
                    </p>
                </div>
            </div>
            <ol className="relative space-y-0 border-l-2 border-primary/25 pl-0">
                {entries.map((entry) => (
                    <li
                        key={entry.id}
                        id={`timeline-${entry.id}`}
                        className="relative scroll-mt-24 pb-6 pl-6 last:pb-0"
                    >
                        <span
                            aria-hidden
                            className="absolute -left-[7px] top-1 h-3 w-3 rounded-full border-2 border-primary bg-background"
                        />
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                            {(dict.news.timelineUpdatedLabel ?? "Updated {date}").replace(
                                "{date}",
                                formatDateTime(entry.timestamp, locale),
                            )}
                        </p>
                        <h3 className="mt-1 text-base font-bold leading-snug">{entry.title}</h3>
                        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                            {entry.body}
                        </p>
                    </li>
                ))}
            </ol>
        </section>
    );
}
