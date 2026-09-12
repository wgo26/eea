import Link from "next/link";
import { type Dictionary, type Locale } from "@/lib/i18n";
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
 * Full-bleed featured slide: the photo leads, the overlay stays minimal
 * (kicker pill + title + one badge) so the image is never buried behind
 * text. Excerpt, location/date/credit and the CTA live on the story page
 * and the rail cards — not on top of the picture.
 */
export function HeroSlide({
    story,
    dict,
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
            {/* Bottom-anchored scrim only — the upper two-thirds of the photo stay clear. */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" aria-hidden />
            <div className="relative min-w-0 p-5 sm:p-6 md:p-8">
                <span className="inline-flex w-fit items-center rounded-full bg-primary px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.18em] text-primary-foreground shadow-sm">
                    {dict.hero.featured}
                </span>
                <Heading className="mt-2.5 line-clamp-2 max-w-3xl break-words text-xl font-extrabold leading-tight tracking-tight text-white sm:text-2xl md:text-4xl">
                    {story.title}
                </Heading>
                {badge ?? story.category ? (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                        {badge ? (
                            <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${badge.className}`}>
                                {badge.label}
                            </span>
                        ) : null}
                        {!badge && story.category ? (
                            <span className="rounded-full bg-black/40 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white backdrop-blur">
                                {story.category}
                            </span>
                        ) : null}
                    </div>
                ) : null}
            </div>
        </Link>
    );
}
