import Link from "next/link";
import { ArrowRight, CalendarDays, Eye, Images, MapPin } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatDate, type Dictionary, type Locale } from "@/lib/i18n";
import { localePath } from "@/lib/i18n/urls";
import { verificationBadgeInfo } from "@/lib/verification";
import type { PhotoStoryData } from "@/lib/queries/photo-stories";
import { cn } from "@/lib/utils";

type FeaturedSpotlightProps = {
    featured: PhotoStoryData | null;
    nextUp: PhotoStoryData[];
    dict: Dictionary;
    locale: Locale;
};

/** Mini editorial row listed under "Next up" in the spotlight column. */
function NextUpItem({ story, rank }: { story: PhotoStoryData; rank: number }) {
    return (
        <li>
            <Link
                href={story.href}
                className="group flex items-start gap-3 rounded-xl p-2 transition-colors hover:bg-muted"
            >
                <span className="mt-0.5 text-sm font-black tabular-nums text-muted-foreground/50">
                    {rank}
                </span>
                <span className="relative h-14 w-20 shrink-0 overflow-hidden rounded-lg bg-muted">
                    {story.imageUrl ? (
                        <span
                            className="absolute inset-0 bg-cover bg-center transition-transform duration-300 group-hover:scale-[1.04]"
                            style={{ backgroundImage: `url(${story.imageUrl})` }}
                            role="img"
                            aria-label={story.title}
                        />
                    ) : null}
                </span>
                <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 text-sm font-semibold leading-snug group-hover:underline">
                        {story.title}
                    </span>
                    {story.category ? (
                        <span className="mt-0.5 block text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                            {story.category}
                        </span>
                    ) : null}
                </span>
            </Link>
        </li>
    );
}

/**
 * Landing hero for the Photo Stories vertical: a magazine-style split
 * spotlight. The cover leads on the left; the right column carries the
 * editorial kicker, headline, excerpt and a "Next up" rail of the freshest
 * essays beneath. Falls back to a quiet invitation band when the archive
 * is empty.
 */
export function FeaturedSpotlight({
    featured,
    nextUp,
    dict,
    locale,
}: FeaturedSpotlightProps) {
    const badge = featured
        ? verificationBadgeInfo(featured.verification ?? null, dict)
        : null;

    if (!featured) {
        return (
            <section
                className="mb-10 flex flex-col items-start gap-4 rounded-3xl border border-dashed p-8 md:flex-row md:items-center"
                aria-label={dict.photoStories.featured}
            >
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <Images className="h-6 w-6" aria-hidden />
                </span>
                <div>
                    <h2 className="text-xl font-extrabold tracking-tight">
                        {dict.photoStories.featured}
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                        {dict.photoStories.comingSoon}
                    </p>
                </div>
                <Button render={<Link href={localePath(locale, "/submit")} />} className="md:ml-auto">
                    {dict.photoStories.submitCtaButton}
                </Button>
            </section>
        );
    }

    return (
        <section aria-label={dict.photoStories.featured}>
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
                {/* Cover — tappable, with trust + proof overlays */}
                <Link
                    href={featured.href}
                    className="group relative block overflow-hidden rounded-3xl"
                >
                    <div className="relative aspect-[4/3] overflow-hidden bg-muted md:aspect-[16/10]">
                        {featured.imageUrl ? (
                            <div
                                className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-[1.04]"
                                style={{ backgroundImage: `url(${featured.imageUrl})` }}
                                role="img"
                                aria-label={featured.title}
                            />
                        ) : null}
                        <span
                            className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/10"
                            aria-hidden
                        />
                        <span className="absolute inset-x-0 bottom-0 flex flex-wrap items-center gap-2 p-4 md:p-5">
                            {featured.credit ? (
                                <span className="rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-bold text-white backdrop-blur">
                                    {dict.home.photographBy} {featured.credit}
                                </span>
                            ) : null}
                            <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-[10px] font-bold text-primary-foreground">
                                <Images className="h-3 w-3" aria-hidden />
                                {featured.photos.length} {dict.photoStories.photosLabel}
                            </span>
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
                        {dict.photoStories.featured}
                    </span>
                    {featured.category ? (
                        <span className="mt-4 text-[11px] font-bold uppercase tracking-[0.18em] text-link">
                            {featured.category}
                        </span>
                    ) : null}
                    <h2 className="mt-2 text-3xl font-extrabold leading-tight tracking-tight md:text-4xl">
                        {featured.title}
                    </h2>
                    {featured.excerpt ? (
                        <p className="mt-3 line-clamp-3 text-base leading-relaxed text-muted-foreground">
                            {featured.excerpt}
                        </p>
                    ) : null}
                    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
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
                        <span className="inline-flex items-center gap-1.5">
                            <Eye className="h-4 w-4" aria-hidden />
                            {featured.viewCount ?? 0}
                        </span>
                    </div>
                    <Button render={<Link href={featured.href} />} className="mt-5 w-fit">
                        {dict.hero.readStory}
                        <ArrowRight data-icon="inline-end" aria-hidden />
                    </Button>

                    {nextUp.length > 0 ? (
                        <div className="mt-6 border-t pt-5">
                            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                                {dict.photoStories.nextUp}
                            </p>
                            <ul className="mt-2 space-y-0.5">
                                {nextUp.map((story, index) => (
                                    <NextUpItem key={story.id} story={story} rank={index + 1} />
                                ))}
                            </ul>
                        </div>
                    ) : null}
                </div>
            </div>
        </section>
    );
}