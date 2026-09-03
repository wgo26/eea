import Link from "next/link";
import { ArrowRight, CalendarDays, Eye, MapPin, UserRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatDate, timeAgo, type Dictionary, type Locale } from "@/lib/i18n";
import { verificationBadgeInfo } from "@/lib/verification";
import { cn } from "@/lib/utils";
import type { NewsArticle } from "@/lib/queries/news";

type NewsSpotlightProps = {
    featured: NewsArticle | null;
    nextUp: NewsArticle[];
    dict: Dictionary;
    locale: Locale;
};

/**
 * Lead story block for the Community News page.
 *
 * Same split-spotlight language as Photo Stories, but news-specific: byline,
 * publication date and readership instead of photographer and frame count,
 * plus a "Next up" rail so the lead never stands alone.
 */
export function NewsSpotlight({ featured, nextUp, dict, locale }: NewsSpotlightProps) {
    if (!featured) return null;

    const badge = verificationBadgeInfo(featured.verification ?? null, dict);

    return (
        <section aria-label={dict.news.featured}>
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
                {/* Lead image */}
                <Link href={featured.href} className="group relative block overflow-hidden rounded-3xl">
                    <div className="relative aspect-[4/3] overflow-hidden bg-muted md:aspect-[16/10]">
                        {featured.imageUrl ? (
                            <span
                                className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-[1.04]"
                                style={{ backgroundImage: `url(${featured.imageUrl})` }}
                                role="img"
                                aria-label={featured.title}
                            />
                        ) : null}
                        <span
                            className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-black/10"
                            aria-hidden
                        />
                        <span className="absolute inset-x-0 bottom-0 flex flex-wrap items-center gap-2 p-4 md:p-5">
                            {featured.category ? (
                                <span className="rounded-full bg-primary px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.16em] text-primary-foreground">
                                    {featured.category}
                                </span>
                            ) : null}
                            {featured.credit ? (
                                <span className="rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-bold text-white backdrop-blur">
                                    {dict.home.photographBy} {featured.credit}
                                </span>
                            ) : null}
                        </span>
                        {badge ? (
                            <span
                                className={cn(
                                    "absolute left-4 top-4 rounded-full px-2.5 py-1 text-[10px] font-bold shadow-sm md:left-5 md:top-5",
                                    badge.className,
                                )}
                            >
                                {badge.label}
                            </span>
                        ) : null}
                    </div>
                </Link>

                {/* Editorial column */}
                <div className="flex flex-col">
                    <span className="inline-flex w-fit items-center gap-2 rounded-full bg-primary px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.18em] text-primary-foreground">
                        <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
                        {dict.news.featured}
                    </span>

                    <h2 className="mt-4 text-3xl font-extrabold leading-tight tracking-tight md:text-4xl">
                        <Link href={featured.href} className="hover:underline">
                            {featured.title}
                        </Link>
                    </h2>

                    {featured.excerpt ? (
                        <p className="mt-3 line-clamp-4 text-base leading-relaxed text-muted-foreground">
                            {featured.excerpt}
                        </p>
                    ) : null}

                    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
                        {featured.authorName ? (
                            <span className="inline-flex items-center gap-1.5">
                                <UserRound className="h-4 w-4" aria-hidden />
                                {dict.news.byline} {featured.authorName}
                            </span>
                        ) : null}
                        {featured.location ? (
                            <span className="inline-flex items-center gap-1.5">
                                <MapPin className="h-4 w-4" aria-hidden />
                                {featured.location}
                            </span>
                        ) : null}
                        {featured.publishedAt ? (
                            <span className="inline-flex items-center gap-1.5">
                                <CalendarDays className="h-4 w-4" aria-hidden />
                                {formatDate(featured.publishedAt, locale)}
                            </span>
                        ) : null}
                        {featured.viewCount ? (
                            <span className="inline-flex items-center gap-1.5">
                                <Eye className="h-4 w-4" aria-hidden />
                                {featured.viewCount.toLocaleString(locale === "fr" ? "fr-FR" : "en-GB")}
                            </span>
                        ) : null}
                    </div>

                    <Button render={<Link href={featured.href} />} className="mt-5 w-fit">
                        {dict.news.readStory}
                        <ArrowRight data-icon="inline-end" aria-hidden />
                    </Button>

                    {nextUp.length > 0 ? (
                        <div className="mt-6 border-t pt-5">
                            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                                {dict.photoStories.nextUp}
                            </p>
                            <ul className="mt-2 space-y-0.5">
                                {nextUp.map((article) => (
                                    <li key={article.id}>
                                        <Link
                                            href={article.href}
                                            className="group flex items-start gap-3 rounded-xl p-2 transition-colors hover:bg-muted"
                                        >
                                            <span className="relative h-12 w-16 shrink-0 overflow-hidden rounded-lg bg-muted">
                                                {article.imageUrl ? (
                                                    <span
                                                        className="absolute inset-0 bg-cover bg-center transition-transform duration-300 group-hover:scale-[1.05]"
                                                        style={{
                                                            backgroundImage: `url(${article.imageUrl})`,
                                                        }}
                                                        role="img"
                                                        aria-label={article.title}
                                                    />
                                                ) : null}
                                            </span>
                                            <span className="min-w-0 flex-1">
                                                <span className="line-clamp-2 text-sm font-semibold leading-snug group-hover:underline">
                                                    {article.title}
                                                </span>
                                                {article.publishedAt ? (
                                                    <span className="mt-0.5 block text-[11px] text-muted-foreground">
                                                        {timeAgo(article.publishedAt, locale)}
                                                    </span>
                                                ) : null}
                                            </span>
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ) : null}
                </div>
            </div>
        </section>
    );
}
