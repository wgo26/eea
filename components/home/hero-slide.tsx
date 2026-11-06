import Link from "next/link";
import { type Dictionary, type Locale } from "@/lib/i18n";
import { TrustBadge } from "@/components/system/trust-badge";
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
 *
 * Signature: lens-glow scrim edge + display-serif headline + lens-ring focus.
 */
export function HeroSlide({
    story,
    dict,
    locale,
    headingLevel: Heading = "h2",
    priority = false,
}: HeroSlideProps) {
    return (
        <Link
            href={story.href}
            className="group relative flex h-[400px] min-w-0 flex-col justify-end overflow-hidden rounded-3xl sm:h-[440px] lg:h-[560px] focus-lens"
            aria-label={story.title}
        >
            {story.imageUrl ? (
                <SmartImage
                    src={story.imageUrl}
                    alt={story.title}
                    sizes="100vw"
                    priority={priority}
                    className="absolute inset-0 bg-muted object-cover transition-transform duration-700 ease-expo group-hover:scale-[1.04]"
                />
            ) : (
                <div className="absolute inset-0 bg-muted" aria-hidden />
            )}
            {/* Signature hero scrim — bottom-anchored with lens-glow accent line. */}
            <div className="hero-scrim" aria-hidden />
            <div className="relative min-w-0 p-5 sm:p-6 md:p-8">
                <span className="section-eyebrow">
                    {dict.hero.featured}
                </span>
                <Heading className="mt-2.5 line-clamp-2 max-w-3xl break-words font-display font-extrabold leading-tight tracking-tight text-white sm:text-display-sm md:text-display-base">
                    {story.title}
                </Heading>
                {story.verification ?? story.category ? (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                        <TrustBadge verification={story.verification} dict={dict} locale={locale} link={false} />
                        {!story.verification && story.category ? (
                            <span className="category-pill">
                                {story.category}
                            </span>
                        ) : null}
                    </div>
                ) : null}
            </div>
        </Link>
    );
}
