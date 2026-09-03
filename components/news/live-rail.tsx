import Link from "next/link";
import { Radio } from "lucide-react";

import { timeAgo, type Dictionary, type Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { NewsArticle } from "@/lib/queries/news";

type LiveRailProps = {
    stories: NewsArticle[];
    dict: Dictionary;
    locale: Locale;
};

/** Published within this window counts as "breaking". */
const BREAKING_WINDOW_HOURS = 24;

function isBreaking(publishedAt: string | null | undefined): boolean {
    if (!publishedAt) return false;
    const t = new Date(publishedAt).getTime();
    if (Number.isNaN(t)) return false;
    return Date.now() - t < BREAKING_WINDOW_HOURS * 3_600_000;
}

/**
 * "Live & Developing" rail (Differentiator #6).
 *
 * Stories still being verified are pulled out of the chronological feed and
 * given their own strip so readers can tell the difference between a finished
 * report and a story that is still unfolding. Renders nothing when there is
 * nothing developing — an empty promise is worse than no promise.
 */
export function LiveRail({ stories, dict, locale }: LiveRailProps) {
    if (stories.length === 0) return null;

    return (
        <section aria-label={dict.news.liveUpdates} className="rounded-3xl border bg-card p-4 md:p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
                <p className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.18em]">
                    <Radio className="h-4 w-4 text-rose-600 dark:text-rose-400" aria-hidden />
                    {dict.news.liveUpdates}
                </p>
                <p className="hidden text-xs text-muted-foreground sm:block">
                    {dict.news.liveUpdatesHint}
                </p>
            </div>

            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {stories.map((story) => {
                    const breaking = isBreaking(story.publishedAt);
                    return (
                        <li key={story.id}>
                            <Link
                                href={story.href}
                                className="group flex h-full gap-3 rounded-2xl border border-dashed p-3 transition-colors hover:border-solid hover:bg-muted/50"
                            >
                                <span className="relative h-16 w-20 shrink-0 overflow-hidden rounded-xl bg-muted">
                                    {story.imageUrl ? (
                                        <span
                                            className="absolute inset-0 bg-cover bg-center transition-transform duration-300 group-hover:scale-[1.05]"
                                            style={{ backgroundImage: `url(${story.imageUrl})` }}
                                            role="img"
                                            aria-label={story.title}
                                        />
                                    ) : null}
                                </span>
                                <span className="flex min-w-0 flex-1 flex-col">
                                    <span
                                        className={cn(
                                            "mb-1 inline-flex w-fit items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider",
                                            breaking
                                                ? "bg-rose-600 text-white"
                                                : "bg-amber-400/90 text-neutral-900",
                                        )}
                                    >
                                        <span
                                            className={cn(
                                                "h-1.5 w-1.5 rounded-full bg-current",
                                                breaking && "animate-pulse",
                                            )}
                                            aria-hidden
                                        />
                                        {breaking ? dict.news.breaking : dict.badges.developing}
                                    </span>
                                    <span className="line-clamp-2 text-sm font-semibold leading-snug group-hover:underline">
                                        {story.title}
                                    </span>
                                    <span className="mt-auto pt-1 text-[11px] text-muted-foreground">
                                        {story.publishedAt
                                            ? `${dict.news.updated} ${timeAgo(story.publishedAt, locale)}`
                                            : null}
                                    </span>
                                </span>
                            </Link>
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}
