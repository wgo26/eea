import Link from "next/link";
import { ArrowRight, CalendarDays, MapPin } from "lucide-react";
import { formatDate, type Dictionary, type Locale } from "@/lib/i18n";
import { verificationBadgeInfo } from "@/lib/verification";
import type { StoryCardData } from "@/lib/queries/home";
import { SmartImage } from "@/components/media/smart-image";

type HeroSlideProps = {
    story: StoryCardData;
    dict: Dictionary;
    locale: Locale;
    /** The lead story renders an <h1>; slides inside the carousel use <h2>. */
    headingLevel?: "h1" | "h2";
    /** Only the first visible slide preloads (LCP); the rest lazy-load. */
    priority?: boolean;
};

/**
 * Full-bleed featured slide (per hero.png): background image with overlay
 * headline, trust badge and gold CTA. Purely presentational, so it can render
 * standalone (single story) or inside the hero carousel.
 */
export function HeroSlide({
    story,
    dict,
    locale,
    headingLevel: Heading = "h2",
    priority = false,
}: HeroSlideProps) {
    const badge = verificationBadgeInfo(story.verification ?? null, dict);

    return (
        <Link
            href={story.href}
            // Responsive fixed height: a long story must never stretch the hero
            // (and break the rail alignment) — text clamps + word-wrapping below
            // keep the overlay in check on small screens.
            className="group relative flex h-[400px] min-w-0 flex-col justify-end overflow-hidden rounded-3xl sm:h-[440px] lg:h-[560px]"
            aria-label={story.title}
        >
            {story.imageUrl ? (
                <SmartImage
                    src={story.imageUrl}
                    alt={story.title}
                    sizes="100vw"
                    priority={priority}
                    className="absolute inset-0 bg-muted object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                />
            ) : (
                <div className="absolute inset-0 bg-muted" aria-hidden />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/55 to-black/15" aria-hidden />
            <div className="relative min-w-0 p-5 sm:p-6 md:p-10">
                <span className="inline-flex w-fit items-center rounded-full bg-primary px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.18em] text-primary-foreground shadow-sm">
                    {dict.hero.featured}
                </span>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                    {story.category ? (
                        <span className="rounded-full bg-black/40 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white backdrop-blur">
                            {story.category}
                        </span>
                    ) : null}
                    {badge ? (
                        <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${badge.className}`}>
                            {badge.label}
                        </span>
                    ) : null}
                </div>
                <Heading className="mt-3 line-clamp-3 max-w-3xl break-words text-2xl font-extrabold leading-tight tracking-tight text-white sm:text-3xl md:text-5xl">
                    {story.title}
                </Heading>
                <span className="mt-3 block h-1.5 w-16 rounded-full bg-primary" aria-hidden />
                {story.excerpt ? (
                    <p className="mt-2.5 line-clamp-2 max-w-2xl break-words text-sm leading-relaxed text-white/85 md:line-clamp-3 md:text-base">
                        {story.excerpt}
                    </p>
                ) : null}
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-white/75 md:text-sm">
                    {story.location ? (
                        <span className="inline-flex items-center gap-1.5 text-primary">
                            <MapPin className="h-3.5 w-3.5" aria-hidden />
                            {story.location}
                        </span>
                    ) : null}
                    {story.publishedAt ? (
                        <span className="inline-flex items-center gap-1.5">
                            <CalendarDays className="h-3.5 w-3.5" aria-hidden />
                            {formatDate(story.publishedAt, locale)}
                        </span>
                    ) : null}
                    {story.credit ? (
                        <span>
                            {dict.home.photographBy} {story.credit}
                        </span>
                    ) : null}
                </div>
                <span className="mt-5 inline-flex w-fit items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-lg shadow-black/25 transition-transform group-hover:translate-x-0.5">
                    {dict.hero.readStory}
                    <ArrowRight className="h-4 w-4" aria-hidden />
                </span>
            </div>
        </Link>
    );
}